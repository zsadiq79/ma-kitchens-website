const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/routific-recovery/ReadOnlyInspection.gs'),'utf8');

function harness(overrides={}) {
  const leak='SENSITIVE_VALUE_SHOULD_NEVER_APPEAR';
  const rows={Orders:[['Order ID','Delivery Date','Order Status','Phone'],['ORD-000101','2026-10-29','Confirmed',leak]],
    Deliveries:[['Order ID','Routific ID','Delivery Status'],['ORD-000101','11111111-1111-4111-8111-111111111111','Delivered']],
    Customers:[['Customer ID','Phone'],['C1',leak]],
    'WhatsApp Log':[['Order ID','Message Type','Status','Phone'],['ORD-000101','delivery_journey_started_eta','Delivered',leak]]};
  Object.assign(rows,overrides.rows);
  let reads=0;
  const book={getId:()=> 'book',getSheetByName:name=>{
    if(!rows[name])return null;
    return {getLastRow:()=>overrides.lastRows?.[name]||rows[name].length,getLastColumn:()=>rows[name][0].length,
      getMaxRows:()=>2000,getMaxColumns:()=>40,getRange:(r,c,n,w)=>({getValues:()=>{
        reads++; if(overrides.readError)throw Error(leak);
        return rows[name].slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w));
      }})};
  }};
  const props={MK_ETA_MODE:'LIVE',MK_ETA_NOT_BEFORE:'2026-10-27T09:08:02.585Z',ROUTIFIC_API_TOKEN:leak,
    WHATSAPP_ACCESS_TOKEN:leak,FEEDBACK_LIVE_ENABLED:'true',FEEDBACK_V2_SENDER_ENABLED:'true',
    MK_ETA_SEND_ORD_NOT_VALID:JSON.stringify({state:leak,recipient:leak,messageId:leak}),
    ...overrides.props};
  const logs=[];
  const forbidden=new Proxy({}, {get:(_,name)=>()=>{throw Error('FORBIDDEN SIDE EFFECT: '+String(name));}});
  const context=vm.createContext({Date,console:{log:s=>logs.push(s)},
    MK_RELEASE:{environment:'PRODUCTION'},mkReleaseOwnerBook_:()=>{if(overrides.ownerError)throw Error(leak);return book;},
    PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...props})})},
    ScriptApp:{getProjectTriggers:()=>overrides.triggers||[
      {getHandlerFunction:()=> 'runWeeklyMarketing',getEventType:()=> 'CLOCK',getTriggerSourceId:()=>null},
      {getHandlerFunction:()=> 'runRoutificEtaQueue',getEventType:()=> 'CLOCK',getTriggerSourceId:()=>null}]},
    Utilities:{formatDate:d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)},
    LockService:forbidden,UrlFetchApp:forbidden,MailApp:forbidden,DriveApp:forbidden,
    runWeeklyMarketing:()=>{throw Error('MUST NOT SEND');},mkReleaseValidateTriggers_:()=>{throw Error('BROKEN ALLOWLIST MUST NOT RUN');}
  });
  vm.runInContext(source,context);
  return {run:()=>context.inspectRoutificRecoveryReadOnly(),context,logs,props,rows,reads:()=>reads,leak};
}
test('reads production state despite installed marketing trigger, with no mutation or external call',()=>{
  const h=harness(),before=JSON.stringify({props:h.props,rows:h.rows}),r=h.run();
  assert.equal(r.complete,true);assert.equal(r.marketingFunctionPresent,true);assert.equal(r.triggers.length,2);
  assert.equal(r.feedback.v2SenderEnabled,true);assert.equal(r.mode,'LIVE');
  assert.equal(r.networkRequests,0);assert.equal(r.writesIssued,false);assert.equal(r.messagesSent,0);
  assert.equal(JSON.stringify({props:h.props,rows:h.rows}),before);assert.equal(h.reads(),3);
});
test('logs contain neither credentials, phones, provider message IDs nor raw errors',()=>{
  for(const options of [{},{readError:true},{ownerError:true}]){
    const h=harness(options);const r=h.run();assert(!h.logs.join('').includes(h.leak));
    assert(!JSON.stringify(r).includes(h.leak));
  }
});
test('records missing message evidence without claiming it was never sent',()=>{
  const r=harness().run();const o=r.oct29.orders[0];
  assert.equal(o.messages.delivery_next_eta.logEntries,0);
  assert.equal(o.messages.delivery_journey_started_eta.statuses[0],'Delivered');
  assert.match(r.oct29.interpretation,/does not prove/);assert.equal(r.deploymentVersionVerified,false);
});
test('unknown handlers and statuses cannot echo arbitrary data',()=>{
  const secret='SENSITIVE_VALUE_SHOULD_NEVER_APPEAR';
  const h=harness({triggers:[{getHandlerFunction:()=>secret,getEventType:()=> 'CLOCK',getTriggerSourceId:()=>null}],
    rows:{Orders:[['Order ID','Delivery Date','Order Status'],['ORD-000101','2026-10-29',secret]]}});
  const r=h.run();assert.equal(r.triggers[0].handler,'UNRECOGNISED_HANDLER');assert.equal(r.oct29.orders[0].orderStatus,'UNKNOWN');
  assert(!h.logs.join('').includes(secret));
});
test('wrong owner or binding fails without sheet reads',()=>{const h=harness({ownerError:true});assert.equal(h.run().complete,false);assert.equal(h.reads(),0);});
test('missing required headers produce an explicitly incomplete assessment',()=>{
  const h=harness({rows:{Deliveries:[['Order ID'],['ORD-000101']]}});const r=h.run();
  assert.equal(r.complete,false);assert(r.oct29.missingHeaders.includes('Deliveries:Routific ID'));
});
test('truncated history never produces a complete assessment',()=>{
  const r=harness({lastRows:{'WhatsApp Log':50000}}).run();assert.equal(r.complete,false);
  assert.equal(r.sheetSizes.find(x=>x.sheet==='WhatsApp Log').truncated,true);
});
test('duplicate orders and delivery records are surfaced rather than silently choosing one',()=>{
  const h=harness({rows:{Orders:[['Order ID','Delivery Date','Order Status'],['ORD-000101','2026-10-29','Confirmed'],['ORD-000101','2026-10-29','Confirmed']],
    Deliveries:[['Order ID','Routific ID','Delivery Status'],['ORD-000101','u1','Delivered'],['ORD-000101','u2','Delivered']]}});
  const r=h.run();assert.equal(r.oct29.duplicateOrderRows,1);assert.equal(r.oct29.orders[0].deliveryRows,2);
  assert.equal(r.oct29.orders[0].routificOrderUuid,null);
});
test('malformed reservation JSON and route queue JSON do not crash the inspection',()=>{
  const h=harness({props:{MK_ETA_SEND_ORD_1:'{','MK_ETA_QUEUE_11111111-1111-4111-8111-111111111111':'{'}});
  const r=h.run();assert.equal(r.complete,true);assert.equal(r.queuedRoutes[0].validRecord,false);
});
test('stale route jobs and uncertain send reservations are visible without clearing them',()=>{
  const h=harness({props:{'MK_ETA_QUEUE_11111111-1111-4111-8111-111111111111':JSON.stringify({eventAt:Date.now()-1000000}),
    'MK_ETA_SEND_ORD-000101_delivery_next_eta':JSON.stringify({state:'SENDING',attemptAt:'2026-10-29T11:53:00Z'})}});
  const r=h.run();assert.equal(r.queuedRoutes[0].beyondCurrent15MinuteWindow,true);
  assert.equal(r.sendReservations.find(x=>x.orderId==='ORD-000101').state,'SENDING');
});
test('delivery dates are interpreted in Sydney, including UTC dates crossing midnight',()=>{
  const h=harness({rows:{Orders:[['Order ID','Delivery Date','Order Status'],['ORD-000101',new Date('2026-10-28T13:00:00Z'),'Confirmed']]}});
  assert.equal(h.run().oct29.uniqueOrderCount,1);
});
test('large reports split into parseable bounded log records',()=>{
  const props={};for(let i=1;i<=150;i++)props['MK_ETA_SEND_ORD-'+i+'_delivery_next_eta']=JSON.stringify({state:'SENDING'});
  const h=harness({props});const r=h.run();assert.equal(r.sendReservationsTruncated,true);
  assert.equal(r.sendReservations.length,100);for(const line of h.logs){assert.doesNotThrow(()=>JSON.parse(line));assert(line.length<8000);}
});
test('UTF-8 byte estimate handles multibyte and supplementary characters',()=>{
  const h=harness();for(const s of ['ascii','é','😀','a😀é','\ud800'])assert.equal(h.context.mkRecoveryUtf8Length_(s),Buffer.byteLength(s));
});
