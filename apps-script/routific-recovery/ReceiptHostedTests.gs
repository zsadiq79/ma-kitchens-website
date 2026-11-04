/* Owner-prepared, expiring rehearsal. No Routific or Meta requests.
 * HTTP callers can access only the registered synthetic fixture, using its one-hour token.
 * The production receipt activation flag and business modes are never changed.
 */
const MK_WRH=Object.freeze({version:'20261104-hosted-1',config:'MK_RCPT_HOSTED_CONFIG',last:'MK_RCPT_HOSTED_LAST_RESULT'});
let wrhFeedbackTest_=false;
function wrhConfig_(){
  const raw=PropertiesService.getScriptProperties().getProperty(MK_WRH.config);let c;
  try{c=JSON.parse(raw||'null');}catch(_){}
  if(!c || c.version!==MK_WRH.version || typeof c.bookId!=='string' || !c.bookId || c.bookId===CONTROL_TOWER_SPREADSHEET_ID ||
    !/^wrh-[a-f0-9]{32}$/.test(c.runId) || !/^[a-f0-9]{64}$/.test(c.token||'') || !Number.isFinite(c.expiresAt) || c.expiresAt<=Date.now())throw new Error('HOSTED_FIXTURE_NOT_READY');
  return c;
}
function wrhStore_(config){
  const root=PropertiesService.getScriptProperties(),prefix='MK_WRH_'+config.runId+'_';
  const key=function(k){if(typeof k!=='string'||!/^[A-Za-z0-9_:.]+$/.test(k))throw new Error('HOSTED_KEY_INVALID');return prefix+k;};
  return {getProperty:function(k){return root.getProperty(key(k));},getProperties:function(){const all=root.getProperties(),out={};Object.keys(all).filter(function(k){return k.startsWith(prefix);}).forEach(function(k){out[k.slice(prefix.length)]=all[k];});return out;},
    setProperties:function(values){const scoped={};Object.keys(values).forEach(function(k){scoped[key(k)]=values[k];});root.setProperties(scoped,false);},
    setProperty:function(k,v){root.setProperty(key(k),v);},deleteProperty:function(k){root.deleteProperty(key(k));}};
}
function wrhValidateContext_(context){const c=wrhConfig_();if(!context || context.runId!==c.runId || !context.book || context.book.getId()!==c.bookId || !context.store)throw new Error('HOSTED_CONTEXT_INVALID');}
function wrhWithFixture_(config,fn){
  const current=wrhConfig_();if(current.runId!==config.runId || current.bookId!==config.bookId)throw new Error('HOSTED_FIXTURE_CHANGED');
  const context={runId:config.runId,book:SpreadsheetApp.openById(config.bookId),store:wrhStore_(config)};
  const originalGrid=mkReleaseGrid_,originalBatch=mkReleaseBatch_;
  // These function bindings are local to this Apps Script execution and always restored.
  // Each replacement rejects every workbook except the registered private fixture.
  mkReleaseGrid_=function(id,options){if(id!==config.bookId || id===CONTROL_TOWER_SPREADSHEET_ID)throw new Error('HOSTED_OTHER_BOOK_BLOCKED');return Sheets.Spreadsheets.get(id,options);};
  mkReleaseBatch_=function(request,id){
    if(id!==config.bookId || id===CONTROL_TOWER_SPREADSHEET_ID)throw new Error('HOSTED_OTHER_BOOK_BLOCKED');
    const response=Sheets.Spreadsheets.batchUpdate(request,id);
    if(context.receiptWorker===true && context.store.getProperty('FAIL_ONCE')==='PENDING'){context.store.setProperty('FAIL_ONCE','EXERCISED');throw new Error('HOSTED_EXPECTED_AMBIGUOUS_COMMIT');}
    return response;
  };
  try{return fn(context);}finally{mkReleaseGrid_=originalGrid;mkReleaseBatch_=originalBatch;}
}
function wrhIntents_(){
  const now=Date.now(),iso=function(t){return new Date(t).toISOString();};
  const orders=Array.from({length:6},function(_,i){return{uuid:String(i+1).padStart(8,'0')+'-1111-4111-8111-111111111111',customerOrderNumber:'ORD-90000'+(i+1),status:'scheduled'};});
  const timeline={items:[{type:'start_location',actualDepartureTime:iso(now-1000)},
    {type:'delivering_stop',stopUuid:'SIM_FIRST',plannedArrivalTime:iso(now+600000),orders:orders.slice(0,5)},
    {type:'delivering_stop',stopUuid:'SIM_SECOND',plannedArrivalTime:iso(now+1200000),orders:orders.slice(5)}]},found=new Map();
  const collect=function(){rv2Plan_(timeline,now-2000,now,{}).items.forEach(function(item){found.set(item.orderId+'|'+item.stage,{orderId:item.orderId,stage:item.stage});});};
  collect();collect();orders.slice(0,5).forEach(function(o){o.status='delivered';});timeline.items[1].actualDepartureTime=iso(now);collect();collect();
  orders[5].status='delivered';timeline.items[2].actualDepartureTime=iso(now);collect();collect();
  const items=Array.from(found.values()).sort(function(a,b){return (a.orderId+'|'+a.stage).localeCompare(b.orderId+'|'+b.stage);});
  if(items.length!==18)throw new Error('HOSTED_PLANNER_INCOMPLETE');return items;
}
function wrhMessageId_(config,index){return 'SIM.'+config.runId+'.'+String(index+1).padStart(2,'0');}
function wrhPayload_(config){
  const at=Math.floor(config.startedAt/1000),statuses=[];
  wrhIntents_().forEach(function(_,index){['read','sent','delivered','read'].forEach(function(status){statuses.push({id:wrhMessageId_(config,index),status:status,recipient_id:'61400000000',timestamp:String(at+({sent:0,delivered:1,read:2}[status]))});});});
  return {entry:[{changes:[{value:{statuses:statuses}}]}]};
}
function prepareDeliveryReceiptHostedTest(){
  mkReleaseOwnerBook_(false);
  const props=PropertiesService.getScriptProperties(),previous=props.getProperty(MK_WRH.config);
  if(previous){try{const c=JSON.parse(previous);if(c.expiresAt>Date.now())throw new Error('HOSTED_TEST_ALREADY_PREPARED');}catch(e){if(e.message==='HOSTED_TEST_ALREADY_PREPARED')throw e;}}
  const runId='wrh-'+Utilities.getUuid().replace(/-/g,'').toLowerCase(),book=SpreadsheetApp.create('Ma Kitchens PRIVATE receipt rehearsal '+runId);
  book.setSpreadsheetTimeZone('Australia/Sydney');
  const marketingHeaders=['Timestamp','Customer ID','Phone','Event Type','Menu Cycle ID','Template','Offer','Message ID','Notes'];
  const sheets=[['WhatsApp Log',WHATSAPP_LOG_HEADERS],[FW.orders,FW.orderHeaders]];
  if(typeof MKM!=='undefined')sheets.push([MKM.events,marketingHeaders]);
  const config={version:MK_WRH.version,runId:runId,bookId:book.getId(),token:fwHash_(Utilities.getUuid()+Utilities.getUuid()),startedAt:Date.now(),expiresAt:Date.now()+3600000};
  sheets.forEach(function(pair,index){const sheet=index===0?book.getSheets()[0].setName(pair[0]):book.insertSheet(pair[0]);
    sheet.getRange(1,1,1,pair[1].length).setValues([pair[1]]);
    if(sheet.getMaxRows()<1600)sheet.insertRowsAfter(sheet.getMaxRows(),1600-sheet.getMaxRows());
    sheet.getRange(1600,pair[1].length).setFormula('=IF(FALSE,"","")');
  });
  const first=wrhIntents_()[0],feedbackRow=FW.orderHeaders.map(function(){return '';});feedbackRow[0]=first.orderId;feedbackRow[16]=wrhMessageId_(config,0);
  book.getSheetByName(FW.orders).getRange(2,1,1,feedbackRow.length).setValues([feedbackRow]);
  if(typeof MKM!=='undefined')book.getSheetByName(MKM.events).getRange(2,1,1,9).setValues([[new Date(),'SIM_CUSTOMER','61400000000','ACCEPTED','SIM_CYCLE','SIM_TEMPLATE','SIM_OFFER',wrhMessageId_(config,0),JSON.stringify({stage:'MENU',test:true})]]);
  props.setProperty(MK_WRH.config,JSON.stringify(config));wrhStore_(config).setProperty('FAIL_ONCE','PENDING');
  const result={diagnostic:'HOSTED_RECEIPT_TEST_PREPARED',version:MK_WRH.version,ready:true,runId:runId,privateFixtureCreated:true,expiresInMinutes:60,messagesSent:0,routificApiCalls:0,customerRecordsChanged:0};console.log(JSON.stringify(result));return result;
}
function wrhRegisterIntents_(config){
  return wrhWithFixture_(config,function(context){
    const lock=LockService.getScriptLock();if(!lock.tryLock(250))return {deferred:true};
    try{return fwWithReads_(function(){
      fwWebGrid_(context.book,["'WhatsApp Log'!A:K"],['WhatsApp Log']);
      const table=fwTable_(context.book,'WhatsApp Log',WHATSAPP_LOG_HEADERS),requests=[],append=[],seen=new Set();
      table.rows.forEach(function(row){if(row[0]){if(seen.has(row[0]))throw new Error('HOSTED_DUPLICATE_ROW');seen.add(row[0]);}});
      const marks={};wrhIntents_().forEach(function(item,index){const id=wrhMessageId_(config,index),matches=table.rows.map(function(row,i){return {row:row,number:i+2};}).filter(function(x){return x.row[0]===id;});
        const row=matches.length?matches[0].row.slice():WHATSAPP_LOG_HEADERS.map(function(){return '';});
        if(row[1] && (row[1]!==item.orderId || row[2]!==item.stage))throw new Error('HOSTED_IDENTITY_CONFLICT');
        row[0]=id;row[1]=item.orderId;row[2]=item.stage;row[3]='61400000000';row[4]=row[4]||new Date();row[8]=row[8]||'Accepted';
        if(matches.length)[1,2,3,4,8].forEach(function(col){if(!wrqSame_(row[col],matches[0].row[col]))requests.push(fwCell_(table.sheet,matches[0].number,col,row[col]));});else append.push(row);
        marks['SEND_'+String(index+1).padStart(2,'0')]=JSON.stringify({id:id,orderId:item.orderId,stage:item.stage});
      });
      if(append.length)requests.push(fwAppend_(table.sheet,append));fwBatch_(context.book,requests);context.store.setProperties(marks,false);
      return {deferred:false,simulatedUniqueSends:18,realProviderCalls:0};
    });}finally{lock.releaseLock();}
  });
}
function wrhFeedback_(){
  wrhFeedbackTest_=true;
  try{if(!wrqDeliveryPending_())throw new Error('HOSTED_FEEDBACK_GUARD_MISSING');const result=runFeedbackSender();if(result.deferred!=='DELIVERY_PRIORITY')throw new Error('HOSTED_FEEDBACK_NOT_DEFERRED');return result;}
  finally{wrhFeedbackTest_=false;}
}
function wrhReport_(config){
  return wrhWithFixture_(config,function(context){return fwWithReads_(function(){
    const names=['WhatsApp Log',FW.orders],ranges=["'WhatsApp Log'!A:K","'"+FW.orders+"'!A:Y"];
    if(typeof MKM!=='undefined'){names.push(MKM.events);ranges.push("'"+MKM.events+"'!A:I");}
    fwWebGrid_(context.book,ranges,names);
    const log=fwTable_(context.book,'WhatsApp Log',WHATSAPP_LOG_HEADERS),rows=log.rows.filter(function(r){return String(r[0]||'').startsWith('SIM.'+config.runId+'.');});
    const all=context.store.getProperties(),events=Object.keys(all).filter(function(k){return k.startsWith(MK_RCPT.prefix);}).map(function(k){return JSON.parse(all[k]);});
    const feedback=fwTable_(context.book,FW.orders,FW.orderHeaders).rows.find(function(r){return r[16]===wrhMessageId_(config,0);});
    const market=typeof MKM!=='undefined'?fwTable_(context.book,MKM.events,['Event Type','Message ID']).rows.filter(function(r){return String(r[3]).startsWith('STATUS_');}):[];
    const intents=wrhIntents_(),identities=rows.every(function(row){const index=Number(String(row[0]).split('.').pop())-1,item=intents[index];return item && row[1]===item.orderId && row[2]===item.stage;});
    const feedbackUpdated=!!feedback && [18,19,20].every(function(i){return Number.isFinite(fwTime_(feedback[i]));});
    const result={version:MK_WRH.version,runId:config.runId,receiptVersion:MK_RCPT.version,uniqueRows:new Set(rows.map(function(r){return r[0];})).size,rowCount:rows.length,readCount:rows.filter(function(r){return r[8]==='Read';}).length,
      simulatedUniqueSends:Object.keys(all).filter(function(k){return k.startsWith('SEND_');}).length,receiptEvents:events.length,pending:events.filter(function(e){return !e.doneAt;}).length,
      correctIdentities:identities,feedbackTimestampsUpdated:feedbackUpdated,marketingReceiptRows:market.length,marketingExpected:typeof MKM!=='undefined'?3:0,retryExercised:all.FAIL_ONCE==='EXERCISED',messagesSent:0,routificApiCalls:0,customerRecordsChanged:0};
    result.integrityPassed=result.rowCount===18&&result.uniqueRows===18&&result.readCount===18&&result.simulatedUniqueSends===18&&result.receiptEvents===54&&result.pending===0&&identities&&feedbackUpdated&&result.marketingReceiptRows===result.marketingExpected&&result.retryExercised;
    return result;
  });});
}
function handleDeliveryReceiptHostedProbe_(event){
  const json=function(body){return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);},started=Date.now();
  try{
    const raw=event&&event.postData&&event.postData.contents;if(typeof raw!=='string'||raw.length>12000)return json({ok:false});
    const body=JSON.parse(raw),config=wrhConfig_();if(typeof body.fixtureToken!=='string'||body.fixtureToken!==config.token)return json({ok:false});
    let result;
    if(body.operation==='capture')result=wrqCapturePayload_(wrhPayload_(config),wrhStore_(config));
    else if(body.operation==='process')result=wrhWithFixture_(config,function(context){context.receiptWorker=true;return wrqRun_(context)||{idle:true};});
    else if(body.operation==='plan')result=wrhRegisterIntents_(config);
    else if(body.operation==='feedback')result=wrhFeedback_();
    else if(body.operation==='report')result=wrhReport_(config);
    else return json({ok:false});
    return json({ok:true,version:MK_WRH.version,runId:config.runId,operation:body.operation,elapsedMs:Date.now()-started,result:result,messagesSent:0,routificApiCalls:0});
  }catch(_){return json({ok:false,version:MK_WRH.version,error:'HOSTED_REHEARSAL_RETRY'});}
}
function wrhEndpoint_(value){
  if(typeof value!=='string'||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value))throw new Error('HOSTED_EXEC_URL_REQUIRED');return value+'?action=delivery_receipt_rehearsal';
}
function wrhFetch_(config,operation){
  const request={method:'post',contentType:'application/json',payload:JSON.stringify({fixtureToken:config.token,operation:operation}),muteHttpExceptions:true,followRedirects:true};
  const response=UrlFetchApp.fetch(wrhEndpoint_(config.endpoint),request);let result;
  try{result=JSON.parse(response.getContentText());}catch(_){throw new Error('HOSTED_DEPLOYMENT_NOT_READY');}
  if(!result.ok || result.version!==MK_WRH.version || result.runId!==config.runId)throw new Error('HOSTED_DEPLOYMENT_VERSION_MISMATCH');return result;
}
function setDeliveryReceiptHostedEndpoint(){
  mkReleaseOwnerBook_(false);const config=wrhConfig_(),ui=SpreadsheetApp.getUi(),answer=ui.prompt('Receipt rehearsal test deployment','Paste the web app URL from the separate TEST deployment. Existing production deployment URLs stay unchanged.',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK)return;
  const endpoint=answer.getResponseText().trim();wrhEndpoint_(endpoint);config.endpoint=endpoint;
  const verification=wrhFetch_(config,'report');PropertiesService.getScriptProperties().setProperty(MK_WRH.config,JSON.stringify(config));
  console.log(JSON.stringify({diagnostic:'HOSTED_TEST_ENDPOINT_VERIFIED',version:verification.version,runId:config.runId,ready:true,messagesSent:0,routificApiCalls:0}));
}
function runDeliveryReceiptHostedTest(){
  mkReleaseOwnerBook_(false);const config=wrhConfig_();wrhEndpoint_(config.endpoint);
  const operations=['capture','capture','capture','capture','process','process','plan','plan','feedback','feedback'];
  const requests=operations.map(function(operation){return {url:wrhEndpoint_(config.endpoint),method:'post',contentType:'application/json',payload:JSON.stringify({fixtureToken:config.token,operation:operation}),muteHttpExceptions:true,followRedirects:true};});
  const started=Date.now(),responses=UrlFetchApp.fetchAll(requests),measurements=responses.map(function(response,index){
    try{const body=JSON.parse(response.getContentText());return {operation:operations[index],ok:body.ok===true&&body.version===MK_WRH.version&&body.runId===config.runId,elapsedMs:body.elapsedMs,result:body.result};}catch(_){return {operation:operations[index],ok:false};}
  });
  // Drain/reconcile after the competing batch. Repeated planning must preserve existing read receipts.
  const recovery=[];for(let i=0;i<4;i++){recovery.push(wrhFetch_(config,'plan').result);recovery.push(wrhFetch_(config,'process').result);const report=wrhFetch_(config,'report').result;if(report.integrityPassed)break;}
  const report=wrhFetch_(config,'report').result,captures=measurements.filter(function(m){return m.operation==='capture';}),feedback=measurements.filter(function(m){return m.operation==='feedback';});
  const passed=report.integrityPassed&&measurements.every(function(m){return m.ok;})&&captures.every(function(m){return m.elapsedMs<=8000;})&&feedback.every(function(m){return m.result&&m.result.deferred==='DELIVERY_PRIORITY';});
  const result={diagnostic:'HOSTED_RECEIPT_CONCURRENCY_TEST',version:MK_WRH.version,passed:passed,elapsedMs:Date.now()-started,measurements:measurements,recovery:recovery,report:report,
    limits:'Real concurrent Apps Script HTTP executions and private spreadsheet receipt writes. Delivery sends are planner intents, feedback exercises its actual deferral branch. No actual Routific/Meta delivery or provider timing is tested.'};
  PropertiesService.getScriptProperties().setProperty(MK_WRH.last,JSON.stringify(result));console.log(JSON.stringify(result));return result;
}
function inspectDeliveryReceiptHostedTest(){
  mkReleaseOwnerBook_(false);const config=wrhConfig_(),result={diagnostic:'HOSTED_RECEIPT_TEST_READ_ONLY',version:MK_WRH.version,report:wrhReport_(config),last:JSON.parse(PropertiesService.getScriptProperties().getProperty(MK_WRH.last)||'null'),messagesSent:0,routificApiCalls:0};console.log(JSON.stringify(result));return result;
}
