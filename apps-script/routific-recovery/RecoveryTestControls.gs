/* Owner-only rehearsal controls. Test rows live in a separate private workbook.
 * The production processor is reused; only its workbook/log adapter is redirected.
 */
function rv2TestConfig_(){
  const config=rv2Json_(PropertiesService.getScriptProperties().getProperty(MK_RV2.prefix+'TEST_CONFIG'));
  return rv2ValidateTestConfig_(config);
}
function rv2ValidateTestConfig_(config){
  if(!config || config.recipient!=='61420306705' || !mkEtaUuid_(config.routeUuid) || !config.bookId ||
    config.bookId===CONTROL_TOWER_SPREADSHEET_ID || !Array.isArray(config.orders) || config.orders.length!==6 ||
    new Set(config.orders.map(function(o){return o.orderId;})).size!==6 || new Set(config.orders.map(function(o){return o.uuid;})).size!==6 ||
    typeof config.expiresAt!=='number' || !Number.isFinite(config.expiresAt) || config.expiresAt<Date.now() ||
    config.orders.some(function(o){return !/^ORD-90000[1-6]$/.test(o.orderId) || !mkEtaUuid_(o.uuid);}))
    throw new Error('RECOVERY_TEST_NOT_AUTHORIZED');
  return config;
}
function rv2TestBook_(){return SpreadsheetApp.openById(rv2TestConfig_().bookId);}
function rv2AssertTestItem_(tables,item,recipient){
  const config=rv2TestConfig_();
  if(rv2Mode_()!=='TEST' || tables.book.getId()!==config.bookId || item.routeUuid!==config.routeUuid ||
    !config.orders.some(function(o){return o.orderId===item.orderId && (!item.uuid || o.uuid===item.uuid);}) ||
    recipient && recipient.phone!==config.recipient)throw new Error('RECOVERY_TEST_NOT_AUTHORIZED');
}
function rv2TestApi_(method,path,payload){
  mkReleaseOwnerBook_(false);
  if(!['get','post'].includes(method) || !/^\/v2\/(?:orders(?:\?|\/)|routes(?:\?|\/)|schedules(?:\?|\/))/.test(path))throw new Error('RECOVERY_TEST_API_NOT_ALLOWED');
  if(LockService.getScriptLock().hasLock())throw new Error('RECOVERY_NETWORK_UNDER_LOCK');
  const token=PropertiesService.getScriptProperties().getProperty('ROUTIFIC_API_TOKEN');if(!token)throw new Error('RECOVERY_ROUTIFIC_TOKEN_MISSING');
  const options={method:method,headers:{Authorization:'Bearer '+token,Accept:'application/json'},muteHttpExceptions:true,followRedirects:false};
  if(payload!==undefined){options.contentType='application/json';options.payload=JSON.stringify(payload);}
  const response=mkReleaseFetch_('https://api.plan.routific.com'+path,options),status=response.getResponseCode();
  if(status<200 || status>=300){
    let text=response.getContentText();
    const all=PropertiesService.getScriptProperties().getProperties();
    Object.keys(all).filter(function(k){return /TOKEN|SECRET|SIGNING|API_KEY|PASSWORD/.test(k);}).forEach(function(k){if(all[k])text=text.split(all[k]).join('[redacted]');});
    text=text.replace(/https?:\/\/[^\s"<>]+/g,'[url]').replace(/[A-Za-z0-9_-]{48,}/g,'[opaque]');
    PropertiesService.getScriptProperties().setProperty(MK_RV2.prefix+'LAST_TEST_API_ERROR',text.slice(0,1500));
    throw new Error('RECOVERY_TEST_HTTP_'+status);
  }
  try{return JSON.parse(response.getContentText());}catch(_){throw new Error('RECOVERY_TEST_JSON_INVALID');}
}

function prepareRoutificRecoveryTestAssets(){
  const book=mkReleaseOwnerBook_(false),props=PropertiesService.getScriptProperties();
  const previous=rv2Json_(props.getProperty(MK_RV2.prefix+'TEST_SETUP'));
  if(rv2Mode_()!=='OFF' || previous && !(previous.state==='REQUIRES_REVIEW' && previous.error==='RECOVERY_TEST_HTTP_400' && previous.bookId))throw new Error('RECOVERY_TEST_SETUP_ALREADY_STARTED');
  if(Number(Utilities.formatDate(new Date(),'Australia/Sydney','H'))>=22)throw new Error('RECOVERY_TEST_TOO_LATE_TODAY');
  const workspace=props.getProperty('ROUTIFIC_WORKSPACE_UUID');if(!workspace)throw new Error('RECOVERY_WORKSPACE_MISSING');
  const names=['Orders','Deliveries','Customers','WhatsApp Log'],headers={};
  names.forEach(function(name){const sheet=book.getSheetByName(name);if(!sheet)throw new Error('RECOVERY_SHEET_MISSING');headers[name]=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];});
  const ids=Array.from({length:6},function(_,i){return 'ORD-90000'+(i+1);});
  const existing=book.getSheetByName('Orders').getDataRange().getValues();
  if(existing.some(function(r){return ids.includes(String(r[0]||''));}))throw new Error('RECOVERY_TEST_REFERENCE_COLLISION');
  const date=previous?previous.date:Utilities.formatDate(new Date(),'Australia/Sydney','yyyy-MM-dd'),tag=previous?previous.tag:'rv2-test-'+Utilities.formatDate(new Date(),'Australia/Sydney','yyyyMMdd-HHmmss');
  if(date!==Utilities.formatDate(new Date(),'Australia/Sydney','yyyy-MM-dd'))throw new Error('RECOVERY_TEST_SETUP_DATE_CHANGED');
  const state=previous || {state:'STARTED',date:date,tag:tag,createdAt:new Date().toISOString()};
  rv2Lock_(function(){
    const existing=rv2Json_(props.getProperty(MK_RV2.prefix+'TEST_SETUP'));
    if(rv2Mode_()!=='OFF' || existing && !(previous && existing.state==='REQUIRES_REVIEW' && existing.error==='RECOVERY_TEST_HTTP_400'))throw new Error('RECOVERY_TEST_SETUP_ALREADY_STARTED');
    state.state=previous?'RESUMING_AFTER_REJECTION':'STARTED';
    rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);
  });
  try{
    const testBook=state.bookId?SpreadsheetApp.openById(state.bookId):SpreadsheetApp.create('Ma Kitchens delivery recovery TEST '+tag);testBook.setSpreadsheetTimeZone('Australia/Sydney');
    state.bookId=testBook.getId();state.state='WORKBOOK_CREATED';rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);
    names.forEach(function(name,i){const sheet=testBook.getSheetByName(name) || (i===0?testBook.getSheets()[0].setName(name):testBook.insertSheet(name));
      if(sheet.getMaxColumns()<headers[name].length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers[name].length-sheet.getMaxColumns());
      sheet.getRange(1,1,1,headers[name].length).setValues([headers[name]]);
    });
    const locations=[{address:'Sydney Town Hall, Sydney NSW',latitude:-33.8731,longitude:151.2065},
      {address:'Central Station, Sydney NSW',latitude:-33.8832,longitude:151.2070}];
    const testOrders=ids.map(function(id,i){return {name:'RECOVERY TEST '+(i+1),customerOrderNumber:id,deliveryDate:date,
      locations:[locations[i<5?0:1]],duration:60,load:1,tags:[tag]};});
    state.state='CREATING_ORDERS';rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);
    const created=state.orders?state.orders.map(function(o){return {customerOrderNumber:o.orderId,uuid:o.uuid};}):rv2TestApi_('post','/v2/orders?workspaceUuid='+encodeURIComponent(workspace),testOrders);
    if(!Array.isArray(created) || created.length!==6)throw new Error('RECOVERY_TEST_ORDER_RESPONSE_INVALID');
    const orders=ids.map(function(id){const found=created.filter(function(o){return o.customerOrderNumber===id;});
      if(found.length!==1 || !mkEtaUuid_(found[0].uuid))throw new Error('RECOVERY_TEST_ORDER_RESPONSE_INVALID');return {orderId:id,uuid:found[0].uuid};});
    state.orders=orders;state.state='ORDERS_CREATED';rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);
    const routeResult=state.routeUuid?[{uuid:state.routeUuid}]:rv2TestApi_('post','/v2/routes?workspaceUuid='+encodeURIComponent(workspace),[{name:'Ma Kitchens Recovery TEST '+tag,date:date,
      startTime:Utilities.formatDate(new Date(),'Australia/Sydney','HH:mm'),endTime:'23:59',capacity:6,
      startLocation:{latitude:-33.8660,longitude:151.2070},endLocation:{latitude:-33.8832,longitude:151.2070},tags:[tag]}]);
    if(!Array.isArray(routeResult) || routeResult.length!==1 || !mkEtaUuid_(routeResult[0].uuid))throw new Error('RECOVERY_TEST_ROUTE_RESPONSE_INVALID');
    state.routeUuid=routeResult[0].uuid;state.state='ROUTE_CREATED';rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);
    const schedule=rv2TestApi_('post','/v2/schedules?workspaceUuid='+encodeURIComponent(workspace),{
      date:date,orders:orders.map(function(o){return o.uuid;}),routes:[state.routeUuid],options:{minimizeRoutes:true,squashDuration:60}});
    state.scheduleAction=typeof schedule.actionUuid==='string'?schedule.actionUuid:null;
    const rowFor=function(name,values){return headers[name].map(function(h){return Object.prototype.hasOwnProperty.call(values,h)?values[h]:'';});};
    const customerId='RV2-TEST-ONLY';
    testBook.getSheetByName('Customers').getRange(2,1,1,headers.Customers.length).setValues([rowFor('Customers',{'Customer ID':customerId,'Name':'Zeeshan Test','Phone':'61420306705','WhatsApp Opt-In':'Y'})]);
    testBook.getSheetByName('Orders').getRange(2,1,6,headers.Orders.length).setValues(orders.map(function(o){return rowFor('Orders',{
      'Order ID':o.orderId,'Delivery Date':new Date(date+'T00:00:00Z'),'Customer ID':customerId,'Customer Name':'Zeeshan Test','Phone':'61420306705','Order Status':'Confirmed'});}));
    testBook.getSheetByName('Orders').getRange(2,headers.Orders.indexOf('Delivery Date')+1,6,1).setNumberFormat('yyyy-mm-dd');
    testBook.getSheetByName('Deliveries').getRange(2,1,6,headers.Deliveries.length).setValues(orders.map(function(o,i){return rowFor('Deliveries',{
      'Delivery ID':'RV2-TEST-'+(i+1),'Order ID':o.orderId,'Routific ID':o.uuid,'Delivery Status':'Scheduled'});}));
    // Reproduce the live used-range sizes without copying customer information.
    names.forEach(function(name){const sheet=testBook.getSheetByName(name),last=name==='Customers'?1000:name==='WhatsApp Log'?1515:2000;
      if(sheet.getMaxRows()<last)sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
      sheet.getRange(last,headers[name].length).setFormula('=IF(FALSE,"","")');});
    const config={version:1,bookId:state.bookId,routeUuid:state.routeUuid,orders:orders,recipient:'61420306705',date:date,expiresAt:Date.now()+8*3600000};
    rv2Set_(props,MK_RV2.prefix+'TEST_CONFIG',config);
    state.state='READY_UNPUBLISHED';rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);
    console.log(JSON.stringify({ok:true,state:state.state,date:date,routeUuid:state.routeUuid,testOrders:6,recipient:'0420 306 705',messagesSent:0,productionRecordsChanged:0}));
  }catch(e){state.state='REQUIRES_REVIEW';state.error=rv2SafeCode_(e);state.providerError=props.getProperty(MK_RV2.prefix+'LAST_TEST_API_ERROR')||null;rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);throw new Error(state.error);}
}

function enableRoutificRecoveryRouteTest(){
  mkReleaseOwnerBook_(false);const config=rv2TestConfig_(),snapshot=rv2Timeline_(config.routeUuid,Date.now()+40000);
  const orders=snapshot.items.flatMap(function(s){return Array.isArray(s.orders)?s.orders:[];});
  if(orders.length!==6 || orders.some(function(o){return !config.orders.some(function(t){return t.orderId===o.customerOrderNumber && t.uuid===o.uuid;}) || o.status!=='scheduled';}) ||
    snapshot.items.some(function(s){return !!s.actualDepartureTime || !!s.actualArrivalTime;}))throw new Error('RECOVERY_TEST_ROUTE_NOT_READY');
  const props=PropertiesService.getScriptProperties();
  if(rv2Mode_()!=='OFF')throw new Error('RECOVERY_TEST_MODE_CONFLICT');
  props.setProperty(MK_RV2.cutoff,new Date().toISOString());props.setProperty(MK_RV2.mode,'TEST');
  rv2Set_(props,MK_RV2.prefix+'TEST_ROUTE_JOB_'+config.routeUuid,{routeUuid:config.routeUuid,eventAt:Date.now(),firstReceivedAt:Date.now(),lastReceivedAt:Date.now(),attempts:0,nextPollAt:0});
  console.log(JSON.stringify({ok:true,mode:'TEST',routeUuid:config.routeUuid,recipient:'0420 306 705',messagesSent:0,productionRecordsChanged:0}));
}
function stopRoutificRecoveryRouteTest(){
  mkReleaseOwnerBook_(false);if(rv2Mode_()!=='TEST')throw new Error('RECOVERY_TEST_NOT_ACTIVE');
  PropertiesService.getScriptProperties().setProperty(MK_RV2.mode,'OFF');
  console.log(JSON.stringify({ok:true,mode:'OFF',testReceiptsPreserved:true,messagesSent:0,productionRecordsChanged:0}));
}

function inspectRoutificRecoveryRouteTest(){
  mkReleaseOwnerBook_(false);const config=rv2TestConfig_(),props=PropertiesService.getScriptProperties(),all=props.getProperties();
  const records=Object.keys(all).filter(function(k){return k.startsWith(MK_RV2.prefix+'TEST_SEND_');})
    .map(function(k){return rv2Json_(all[k]);}).filter(function(r){return r.routeUuid===config.routeUuid;});
  const source=mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID).getSheetByName('WhatsApp Log'),values=source.getDataRange().getValues();
  const head=values.shift(),messageColumn=head.indexOf('Message ID'),statusColumn=head.indexOf('Status');
  const stages=[MK_RV2.journey,MK_RV2.next,MK_RV2.delivered],summary={};
  stages.forEach(function(stage){const items=records.filter(function(r){return r.stage===stage;});
    summary[stage]={accepted:items.filter(function(r){return r.state==='ACCEPTED';}).length,
      providerDeliveredOrRead:items.filter(function(r){return values.some(function(row){return row[messageColumn]===r.messageId && ['Delivered','Read'].includes(row[statusColumn]);});}).length,
      providerFailed:items.filter(function(r){return values.some(function(row){return row[messageColumn]===r.messageId && row[statusColumn]==='Failed';});}).length,
      uncertain:items.filter(function(r){return r.state==='SENDING';}).length};});
  const deliveryRows=SpreadsheetApp.openById(config.bookId).getSheetByName('Deliveries').getDataRange().getValues(),deliveryHead=deliveryRows.shift();
  const fixtureDeliveries=deliveryRows.filter(function(r){return config.orders.some(function(o){return o.orderId===r[deliveryHead.indexOf('Order ID')];});})
    .map(function(r){return {orderId:r[deliveryHead.indexOf('Order ID')],status:r[deliveryHead.indexOf('Delivery Status')]};});
  const result={diagnostic:'RECOVERY_ROUTE_TEST_READ_ONLY',mode:rv2Mode_(),routeUuid:config.routeUuid,recipient:'0420 306 705',
    stages:summary,fixtureDeliveries:fixtureDeliveries,writesIssued:false,messagesSent:0};console.log(JSON.stringify(result));return result;
}

function inspectRoutificRecoveryTestSetup(){
  mkReleaseOwnerBook_(false);
  const setup=rv2Json_(PropertiesService.getScriptProperties().getProperty(MK_RV2.prefix+'TEST_SETUP'));
  console.log(JSON.stringify({diagnostic:'RECOVERY_TEST_SETUP_READ_ONLY',setup:setup,messagesSent:0,writesIssued:false}));
}

// Refresh only the existing, unstarted rehearsal after a dispatcher moves it.
function refreshRoutificRecoveryTestDate(){
  mkReleaseOwnerBook_(false);
  const props=PropertiesService.getScriptProperties(),raw=props.getProperty(MK_RV2.prefix+'TEST_CONFIG');
  const config=rv2Json_(raw),today=Utilities.formatDate(new Date(),'Australia/Sydney','yyyy-MM-dd');
  if(!['TEST','OFF'].includes(rv2Mode_()))throw new Error('RECOVERY_TEST_MODE_CONFLICT');
  if(!config || config.routeUuid!=='dc9c1300-3d32-4e91-85a4-96a210478b60')throw new Error('RECOVERY_TEST_NOT_AUTHORIZED');
  const renewed=Object.assign({},config,{date:today,expiresAt:Date.now()+8*3600000});
  rv2ValidateTestConfig_(renewed);
  const all=props.getProperties();
  if(Object.keys(all).some(function(k){return k.startsWith(MK_RV2.prefix+'TEST_SEND_') && rv2Json_(all[k]).routeUuid===config.routeUuid;}))throw new Error('RECOVERY_TEST_ALREADY_HAS_RECEIPTS');
  const workspace=props.getProperty('ROUTIFIC_WORKSPACE_UUID');if(!workspace)throw new Error('RECOVERY_WORKSPACE_MISSING');
  const routes=rv2TestApi_('get','/v2/routes?workspaceUuid='+encodeURIComponent(workspace)+'&date='+today);
  const matching=(routes.items||[]).filter(function(r){return r.uuid===config.routeUuid;});
  if(matching.length!==1 || matching[0].date!==today)throw new Error('RECOVERY_TEST_ROUTE_DATE_MISMATCH');
  const snapshot=rv2Timeline_(config.routeUuid,Date.now()+40000);
  const orders=snapshot.items.flatMap(function(s){return Array.isArray(s.orders)?s.orders:[];});
  if(orders.length!==6 || new Set(orders.map(function(o){return o.uuid;})).size!==6 ||
    orders.some(function(o){return o.status!=='scheduled' || !config.orders.some(function(t){return t.orderId===o.customerOrderNumber && t.uuid===o.uuid;});}) ||
    snapshot.items.some(function(s){return !!s.actualDepartureTime || !!s.actualArrivalTime;}))throw new Error('RECOVERY_TEST_ROUTE_NOT_READY');
  const book=SpreadsheetApp.openById(config.bookId),sheet=book.getSheetByName('Orders'),rows=sheet.getDataRange().getValues();
  const head=rows.shift(),idCol=head.indexOf('Order ID'),dateCol=head.indexOf('Delivery Date');
  if(idCol<0 || dateCol<0)throw new Error('RECOVERY_TEST_SHEET_INVALID');
  const indexes=config.orders.map(function(o){const matches=[];rows.forEach(function(r,i){if(r[idCol]===o.orderId)matches.push(i+2);});
    if(matches.length!==1)throw new Error('RECOVERY_TEST_SHEET_INVALID');return matches[0];});
  rv2Lock_(function(){
    if(props.getProperty(MK_RV2.prefix+'TEST_CONFIG')!==raw || !['TEST','OFF'].includes(rv2Mode_()))throw new Error('RECOVERY_TEST_MODE_CONFLICT');
    const lease=rv2Json_(props.getProperty(MK_RV2.lease));if(lease && lease.until>Date.now())throw new Error('RECOVERY_BUSY');
    props.setProperty(MK_RV2.mode,'PAUSED');
  });
  // Failure leaves processing paused; no production table is touched.
  indexes.forEach(function(row){sheet.getRange(row,dateCol+1).setValue(new Date(today+'T00:00:00Z')).setNumberFormat('yyyy-mm-dd');});
  rv2Lock_(function(){
    rv2Set_(props,MK_RV2.prefix+'TEST_CONFIG',renewed);
    const state=rv2Json_(props.getProperty(MK_RV2.prefix+'TEST_SETUP'));
    if(state){state.date=today;state.state='READY_UNPUBLISHED';delete state.error;delete state.providerError;rv2Set_(props,MK_RV2.prefix+'TEST_SETUP',state);}
    props.setProperty(MK_RV2.cutoff,new Date().toISOString());
    rv2Set_(props,MK_RV2.prefix+'TEST_ROUTE_JOB_'+config.routeUuid,{routeUuid:config.routeUuid,eventAt:Date.now(),firstReceivedAt:Date.now(),lastReceivedAt:Date.now(),attempts:0,nextPollAt:0});
    props.setProperty(MK_RV2.mode,'TEST');
  });
  console.log(JSON.stringify({ok:true,mode:'TEST',date:today,routeUuid:config.routeUuid,testOrders:6,expiresAt:new Date(renewed.expiresAt).toISOString(),messagesSent:0,productionRecordsChanged:0}));
}
