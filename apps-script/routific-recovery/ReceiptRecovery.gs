/* Receipt repair is dormant until MK_RCPT_ENABLED is explicitly enabled.
 * Immutable, authenticated receipt events are stored before acknowledgement.
 * The existing minute worker applies a bounded batch without sending messages.
 */
const MK_RCPT=Object.freeze({version:'20261104-receipts-1',enabled:'MK_RCPT_ENABLED',prefix:'MK_RCPT_EVENT_',batch:60});
function wrqEnabled_(){return PropertiesService.getScriptProperties().getProperty(MK_RCPT.enabled)==='true';}
function wrqNormalise_(status){
  if(!status || typeof status.id!=='string' || !status.id || status.id.length>256 ||
    !['sent','delivered','read','failed'].includes(status.status) || !whatsappLogStatusDate_(status))return null;
  const codes=(Array.isArray(status.errors)?status.errors:[]).slice(0,5).map(function(e){return {code:String(e && e.code!=null?e.code:'').slice(0,80)};});
  return {id:status.id,status:status.status,timestamp:String(status.timestamp),recipient_id:whatsappLogNormalisePhone_(status.recipient_id),errors:codes};
}
function wrqCapturePayload_(payload,storeOverride){
  const store=storeOverride || PropertiesService.getScriptProperties(),events=[];
  (Array.isArray(payload.entry)?payload.entry:[]).forEach(function(entry){
    (Array.isArray(entry.changes)?entry.changes:[]).forEach(function(change){
      const value=change.value||{};
      (Array.isArray(value.statuses)?value.statuses:[]).forEach(function(status){const clean=wrqNormalise_(status);if(clean)events.push(clean);});
    });
  });
  if(events.length>500)throw new Error('RECEIPT_BATCH_TOO_LARGE');
  const updates={},existing=events.length>1 && typeof store.getProperties==='function'?store.getProperties():null;
  events.forEach(function(status){const key=MK_RCPT.prefix+fwHash_(JSON.stringify(status));
    // No shared lock or mutable queue index. Concurrent identical captures have the same key/value.
    if(!(existing?existing[key]:store.getProperty(key)))updates[key]=JSON.stringify({version:1,status:status,receivedAt:new Date().toISOString()});
  });
  if(Object.keys(updates).length)store.setProperties(updates,false);
  // A quota/storage exception propagates, causing a retry rather than a false acknowledgement.
  return {captured:events.length,created:Object.keys(updates).length};
}
function wrqMergeStatus_(existing,status){
  const row=existing.slice();while(row.length<WHATSAPP_LOG_HEADERS.length)row.push('');
  row[0]=status.id;if(!row[3])row[3]=whatsappLogNormalisePhone_(status.recipient_id);
  const eventAt=whatsappLogStatusDate_(status),index={sent:5,delivered:6,read:7}[status.status];
  if(index && (!Number.isFinite(fwTime_(row[index])) || eventAt.getTime()<fwTime_(row[index])))row[index]=eventAt;
  const incoming=whatsappLogDisplayStatus_(status.status);
  if(whatsappLogStatusRank_(incoming)>whatsappLogStatusRank_(row[8]))row[8]=incoming;
  if(status.status==='failed'){row[9]=status.errors[0]?status.errors[0].code:'';row[10]='Provider reported failure';}
  return row;
}
function wrqSame_(a,b){return a instanceof Date || b instanceof Date ? a instanceof Date && b instanceof Date && a.getTime()===b.getTime() : a===b;}
function wrqApplyBatch_(book,entries){
  const names=['WhatsApp Log'],ranges=["'WhatsApp Log'!A:K"];
  const feedback=fwProps_().getProperty('FEEDBACK_V2_WRITES_ENABLED')==='true',marketing=typeof MKM!=='undefined';
  if(feedback){names.push(FW.orders);ranges.push("'"+FW.orders.replace(/'/g,"''")+"'!A:Y");}
  if(marketing){names.push(MKM.events);ranges.push("'"+MKM.events.replace(/'/g,"''")+"'!A:I");}
  // Typed grid reads preserve actual provider timestamps and the workbook timezone.
  fwWebGrid_(book,ranges,names);
  const table=fwTable_(book,'WhatsApp Log',WHATSAPP_LOG_HEADERS);
  if(WHATSAPP_LOG_HEADERS.some(function(h,i){return table.headers[i]!==h;}))throw new Error('RECEIPT_LOG_HEADERS_CHANGED');
  const ledger=new Map(),changes=new Map(),requests=[];
  table.rows.forEach(function(row,i){if(!row[0])return;if(ledger.has(row[0]))throw new Error('RECEIPT_DUPLICATE_MESSAGE_ID');ledger.set(row[0],{row:row,number:i+2});});
  const feedbackTable=feedback?fwTable_(book,FW.orders,FW.orderHeaders):null,feedbackChanges=new Map();
  if(feedback && FW.orderHeaders.some(function(h,i){return feedbackTable.headers[i]!==h;}))throw new Error('RECEIPT_FEEDBACK_HEADERS_CHANGED');
  const market=marketing?fwTable_(book,MKM.events,['Timestamp','Customer ID','Phone','Event Type','Menu Cycle ID','Template','Offer','Message ID','Notes']):null;
  if(market && ['Timestamp','Customer ID','Phone','Event Type','Menu Cycle ID','Template','Offer','Message ID','Notes'].some(function(h,i){return market.headers[i]!==h;}))throw new Error('RECEIPT_MARKETING_HEADERS_CHANGED');
  const marketRows=[],marketSeen=new Set();
  if(market)market.rows.forEach(function(row){marketSeen.add(String(row[7])+'|'+String(row[3]));});
  entries.forEach(function(entry){
    const status=entry.record.status,found=changes.get(status.id)||ledger.get(status.id)||{row:WHATSAPP_LOG_HEADERS.map(function(){return '';}),number:null};
    changes.set(status.id,{row:wrqMergeStatus_(found.row,status),number:found.number});
    const index={sent:18,delivered:19,read:20}[status.status];
    if(feedbackTable && index){
      const matches=feedbackTable.rows.map(function(row,i){return {row:row,number:i+2};}).filter(function(x){return x.row[16]===status.id;});
      if(matches.length>1)throw new Error('RECEIPT_DUPLICATE_FEEDBACK_MESSAGE_ID');
      if(matches.length){const key=matches[0].number+':'+index,previous=feedbackChanges.has(key)?feedbackChanges.get(key).value:matches[0].row[index],at=whatsappLogStatusDate_(status);
        if(!Number.isFinite(fwTime_(previous)) || at.getTime()<fwTime_(previous))feedbackChanges.set(key,{number:matches[0].number,col:index,value:at.toISOString()});
      }
    }
    if(market){
      const originals=market.rows.filter(function(row){return String(row[7])===status.id && String(row[3])==='ACCEPTED';});
      if(originals.length>1)throw new Error('RECEIPT_DUPLICATE_MARKETING_MESSAGE_ID');
      const type='STATUS_'+status.status.toUpperCase(),key=status.id+'|'+type;
      if(originals.length && !marketSeen.has(key)){
        const row=originals[0],meta=mkmMeta_(row);
        marketRows.push([new Date(),row[1],row[2],type,row[4],row[5],row[6],status.id,
          JSON.stringify({stage:meta.stage,test:!!meta.test,key:mkmKey_(String(row[4]),String(row[2]),meta.stage,!!meta.test),providerAt:status.timestamp,errorCodes:status.errors.map(function(e){return e.code;})})]);
        marketSeen.add(key);
      }
    }
  });
  const append=[];
  changes.forEach(function(change,id){
    if(!change.number){append.push(change.row);return;}
    const before=ledger.get(id).row;
    [3,5,6,7,8,9,10].forEach(function(i){if(!wrqSame_(before[i],change.row[i]))requests.push(fwCell_(table.sheet,change.number,i,change.row[i]));});
  });
  if(append.length)requests.push(fwAppend_(table.sheet,append));
  if(marketRows.length)requests.push(fwAppend_(market.sheet,marketRows));
  feedbackChanges.forEach(function(change){requests.push(fwCell_(feedbackTable.sheet,change.number,change.col,change.value));});
  fwBatch_(book,requests);
  return {events:entries.length,messages:changes.size,requests:requests.length};
}
function wrqRun_(){
  if(!wrqEnabled_())return;
  const props=PropertiesService.getScriptProperties(),all=props.getProperties(),started=Date.now();
  const entries=Object.keys(all).filter(function(key){return key.startsWith(MK_RCPT.prefix);}).map(function(key){return {key:key,raw:all[key],record:JSON.parse(all[key])};});
  const pending=entries.filter(function(e){return !e.record.doneAt;}).sort(function(a,b){return Number(a.record.status.timestamp)-Number(b.record.status.timestamp)||a.key.localeCompare(b.key);}).slice(0,MK_RCPT.batch);
  if(!pending.length){
    entries.filter(function(e){return e.record.doneAt && Date.now()-e.record.doneAt>2*86400000;}).slice(0,20).forEach(function(e){props.deleteProperty(e.key);});return;
  }
  const lock=LockService.getScriptLock();if(!lock.tryLock(250)){console.log(JSON.stringify({diagnostic:'RECEIPT_WORKER_DEFERRED',pending:pending.length}));return;}
  try{
    const latest=props.getProperties(),current=pending.filter(function(e){const value=latest[e.key];if(!value)return false;e.record=JSON.parse(value);return !e.record.doneAt;});
    if(!current.length)return;
    const result=fwWithReads_(function(){return wrqApplyBatch_(fwBook_(),current);});
    const updates={};current.forEach(function(e){updates[e.key]=JSON.stringify({version:1,status:e.record.status,receivedAt:e.record.receivedAt,doneAt:Date.now()});});
    let recent=[];try{recent=JSON.parse(props.getProperty('WHATSAPP_RECENT_STATUS_LOG')||'[]');}catch(_){}
    if(!Array.isArray(recent))recent=[];
    current.forEach(function(e){const s=e.record.status;recent.push({receivedAt:e.record.receivedAt||new Date().toISOString(),messageId:s.id,status:s.status,recipientId:s.recipient_id,timestamp:s.timestamp,errors:s.errors});});
    recent=recent.slice(-50);while(recent.length && Utilities.newBlob(JSON.stringify(recent)).getBytes().length>7000)recent.shift();
    updates.WHATSAPP_RECENT_STATUS_LOG=JSON.stringify(recent);
    // Commit completion only after the atomic spreadsheet batch. A retry rereads and merges persisted rows.
    props.setProperties(updates,false);
    console.log(JSON.stringify(Object.assign({diagnostic:'RECEIPT_WORKER',elapsedMs:Date.now()-started},result)));
  }catch(_){console.log(JSON.stringify({diagnostic:'RECEIPT_WORKER_RETRY',pending:pending.length}));}
  finally{lock.releaseLock();}
}
function wrqDeliveryPending_(){
  if(!wrqEnabled_() || !rv2Active_())return false;
  const props=PropertiesService.getScriptProperties().getProperties(),prefix=rv2JobPrefix_();
  return Object.keys(props).some(function(key){return key.startsWith(prefix);});
}
function inspectDeliveryReceiptRepair(){
  mkReleaseOwnerBook_(false);
  const all=PropertiesService.getScriptProperties().getProperties(),records=Object.keys(all).filter(function(k){return k.startsWith(MK_RCPT.prefix);}).map(function(k){return JSON.parse(all[k]);});
  const result={diagnostic:'DELIVERY_RECEIPT_REPAIR_READ_ONLY',version:MK_RCPT.version,enabled:wrqEnabled_(),pending:records.filter(function(r){return !r.doneAt;}).length,
    completed:records.filter(function(r){return !!r.doneAt;}).length,messagesSent:0,writesIssued:false};console.log(JSON.stringify(result));return result;
}
function deliveryReceiptRepairSelfTest(){
  mkReleaseOwnerBook_(false);
  const check=function(condition,label){if(!condition)throw new Error('RECEIPT_SELF_TEST_'+label);},base=Date.now(),timestamp=String(Math.floor(base/1000));
  const data={},store={getProperty:function(k){return data[k]||null;},setProperties:function(values){Object.keys(values).forEach(function(k){data[k]=values[k];});}};
  const statuses=['read','delivered','sent','read'].map(function(status){return {id:'SIMULATION_ONLY',status:status,timestamp:timestamp,recipient_id:'61400000000'};});
  const payload={entry:[{changes:[{value:{statuses:statuses}}]}]};
  wrqCapturePayload_(payload,store);wrqCapturePayload_(payload,store);check(Object.keys(data).length===3,'DUPLICATE_CAPTURE');
  let row=WHATSAPP_LOG_HEADERS.map(function(){return '';});statuses.forEach(function(s){row=wrqMergeStatus_(row,wrqNormalise_(s));});
  check(row[8]==='Read' && row[5] instanceof Date && row[6] instanceof Date && row[7] instanceof Date,'RECEIPT_ORDER');
  const uuid=function(n){return String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';},iso=function(t){return new Date(t).toISOString();};
  const orders=Array.from({length:6},function(_,i){return {uuid:uuid(i+1),customerOrderNumber:'ORD-90000'+(i+1),status:'scheduled'};});
  const snapshot={items:[{type:'start_location',actualDepartureTime:iso(base-1000)},
    {type:'delivering_stop',stopUuid:'SIMULATED_FIRST',plannedArrivalTime:iso(base+600000),orders:orders.slice(0,5)},
    {type:'delivering_stop',stopUuid:'SIMULATED_SECOND',plannedArrivalTime:iso(base+1200000),orders:orders.slice(5)}]};
  const sent=new Set(),collect=function(){rv2Plan_(snapshot,base-2000,base,{}).items.forEach(function(item){if(item.stage!=='RECOVERY_INTERNAL_MISSED')sent.add(item.orderId+'|'+item.stage);});};
  collect();collect();orders.slice(0,5).forEach(function(o){o.status='delivered';});snapshot.items[1].actualDepartureTime=iso(base);collect();collect();
  orders[5].status='delivered';snapshot.items[2].actualDepartureTime=iso(base);collect();collect();check(sent.size===18,'EIGHTEEN_PLANNED_SENDS');
  const result={diagnostic:'DELIVERY_RECEIPT_REPAIR_SELF_TEST',version:MK_RCPT.version,passed:true,simulatedUniqueSends:sent.size,deduplicatedReceiptEvents:Object.keys(data).length,
    messagesSent:0,routificApiCalls:0,spreadsheetWrites:0,propertyWrites:0,limitations:'Pure planner and in-memory receipt tests only. Hosted concurrency and real provider timing remain unverified.'};
  console.log(JSON.stringify(result));return result;
}
