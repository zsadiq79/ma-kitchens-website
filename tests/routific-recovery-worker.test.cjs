const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/routific-recovery/DeliveryRecovery.gs'),'utf8');
const controls=fs.readFileSync(path.join(__dirname,'../apps-script/routific-recovery/RecoveryTestControls.gs'),'utf8');
const route='11111111-1111-4111-8111-111111111111';
const uuid=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
function harness(count=2){
 let now=Date.parse('2026-11-05T07:00:00Z'),lockHeld=false,lockBusy=false,sendFailure=false,logFailure=false,id=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const iso=t=>new Clock(t).toISOString(),calls=[],sent=[],logs=[];
 const props={MK_RV2_MODE:'LIVE',MK_RV2_NOT_BEFORE:iso(now-3600000),ROUTIFIC_API_TOKEN:'token',ROUTIFIC_WORKSPACE_UUID:'workspace',
  MK_RV2_LAST_DISCOVERY:String(now),MK_RV2_LAST_MAINTENANCE:String(now)};
 const rows={Orders:[['Order ID','Delivery Date','Customer ID','Customer Name','Phone','Order Status']],
  Deliveries:[['Delivery ID','Order ID','Routific ID','Delivery Status','Delivered At','Delivery Notes']],
  Customers:[['Customer ID','Name','Phone','WhatsApp Opt-In']],
  'WhatsApp Log':[['Message ID','Order ID','Message Type','Status']]};
 const details={},stops=[{type:'start_location',actualDepartureTime:iso(now-300000)}];
 for(let n=1;n<=count;n++){
  const order='ORD-'+String(n).padStart(6,'0');rows.Orders.push([order,new Clock(now),'C'+n,'Test '+n,'61400000001','Confirmed']);
  rows.Deliveries.push(['D'+n,order,uuid(n),'Scheduled','','']);rows.Customers.push(['C'+n,'Test '+n,'61400000001','Y']);
  stops.push({type:'delivering_stop',plannedArrivalTime:iso(now+n*600000),plannedDepartureTime:iso(now+n*600000+300000),
   orders:[{customerOrderNumber:order,uuid:uuid(n),status:'scheduled'}]});
  details[uuid(n)]={uuid:uuid(n),customerOrderNumber:order,status:'scheduled',locations:[{latitude:n,longitude:150}],deliveryTracking:{shortUrl:'https://routi.fi/order'+n}};
 }
 const sheets={};for(const name of Object.keys(rows))sheets[name]={name,getLastColumn:()=>rows[name][0].length,
  getDataRange:()=>({getValues:()=>rows[name].map(r=>r.slice())}),getRange:(r,c,n,w)=>({getValues:()=>rows[name].slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w))})};
 const book={getId:()=> 'book',getSheetByName:n=>sheets[n]};
 const store={getProperty:k=>props[k]??null,getProperties:()=>({...props}),setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}};
 const lock={hasLock:()=>lockHeld,tryLock:()=>{if(lockBusy)return false;assert.equal(lockHeld,false);lockHeld=true;return true;},releaseLock:()=>{lockHeld=false;}};
 const format=(date,zone,pattern)=>new Intl.DateTimeFormat(pattern==='H'?'en-US':'en-CA',pattern==='H'?{timeZone:zone,hour:'numeric',hourCycle:'h23'}:{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 let pages=null;
 const c=vm.createContext({Date:Clock,console:{log:s=>logs.push(s),error:s=>logs.push(s)},CONTROL_TOWER_SPREADSHEET_ID:'book',
  PropertiesService:{getScriptProperties:()=>store},LockService:{getScriptLock:()=>lock},mkReleaseBinding_:()=>{},mkReleaseOwnerBook_:()=>book,mkReleaseOpenBook_:()=>book,
  ScriptApp:{getProjectTriggers:()=>[]},Utilities:{getUuid:()=> 'attempt-'+(++id),formatDate:format,newBlob:s=>({getBytes:()=>Buffer.from(s)})},
  mkEtaUuid_:v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),
  fwHash_:s=>crypto.createHash('sha256').update(s).digest('hex'),orderRequestJson_:x=>x,
  routePublishedNormalisePhone_:s=>s.replace(/^\+/,''),routePublishedFirstName_:s=>s.split(' ')[0],
  mkReleaseFetch_:(url,options)=>{
   assert.equal(lockHeld,false,'Network request while shared lock held');assert.equal(options.method,'get');calls.push(url);
   let data;
   if(url.includes('/timeline'))data=pages ? pages.shift() : {items:stops};
   else if(url.includes('/v2/routes?'))data={items:[]};
   else data=details[url.split('/').pop()];
   return {getResponseCode:()=>data?200:404,getContentText:()=>JSON.stringify(data)};
  },
  mkEtaSend_:(item,recipient,suffix)=>{assert.equal(lockHeld,false);sent.push({orderId:item.orderId,stage:item.stage,eta:item.eta,suffix});if(sendFailure)throw Error('Network ambiguity');return 'message-'+sent.length;},
  sendDeliveryConfirmationTemplate_:(phone,name,orderId)=>{assert.equal(lockHeld,false);sent.push({orderId,stage:'delivery_confirmation_5'});if(sendFailure)throw Error('Network ambiguity');return {messageId:'message-'+sent.length};},
  registerWhatsAppOutbound_:(messageId,orderId,stage)=>{if(logFailure)throw Error('Log unavailable');if(!rows['WhatsApp Log'].some(r=>r[0]===messageId))rows['WhatsApp Log'].push([messageId,orderId,stage,'Accepted']);},
  fwCell_:(sheet,row,col,value)=>({sheet:sheet.name,row,col,value}),fwBatch_:(_,requests)=>{assert(lockHeld);for(const r of requests)rows[r.sheet][r.row-1][r.col]=r.value;}
 });
 vm.runInContext(source+'\n'+controls,c);
 const enqueue=()=>props['MK_RV2_ROUTE_'+route]=JSON.stringify({routeUuid:route,eventAt:now,firstReceivedAt:now,lastReceivedAt:now,attempts:0,nextPollAt:0});
 return {c,props,rows,stops,details,calls,sent,logs,iso,book,enqueue,run:()=>c.runRoutificRecoveryWorker_(),
  now:()=>now,advance:ms=>{now+=ms;},busy:v=>{lockBusy=v;},failSend:v=>{sendFailure=v;},failLog:v=>{logFailure=v;},pages:v=>{pages=v;},
  plan:keys=>c.rv2Plan_({items:stops},now-3600000,now,keys||{})};
}
test('module is inactive by default and does not mutate live state on installation',()=>{
 const h=harness();delete h.props.MK_RV2_MODE;const before=JSON.stringify(h.props);h.run();assert.equal(JSON.stringify(h.props),before);assert.equal(h.calls.length,0);
});
test('durable ingress acknowledges only persisted route work and deduplicates repeat events',()=>{
 const h=harness();const event={version:1,key:'a'.repeat(64),payload:{type:'route.eta_updated',timestamp:h.iso(h.now()),data:{route:{uuid:route}}}};
 const response=h.c.rv2Accept_(event);assert.equal(response.durablyStored,true);const original=h.props['MK_RV2_ROUTE_'+route];
 h.advance(1000);h.c.rv2Accept_(event);assert.equal(h.props['MK_RV2_ROUTE_'+route],original);assert.equal(h.calls.length,0);
});
test('busy ingress is retryable without falsely acknowledging receipt',()=>{
 const h=harness();h.busy(true);assert.throws(()=>h.c.rv2Accept_({version:1,key:'a'.repeat(64),payload:{type:'route.eta_updated',timestamp:h.iso(h.now()),data:{route:{uuid:route}}}}),/RECOVERY_BUSY/);
 assert.equal(Object.keys(h.props).filter(k=>k.startsWith('MK_RV2_EVENT_')).length,0);
});
test('CAPTURE and PAUSED modes send nothing and retain work',()=>{for(const mode of ['CAPTURE','PAUSED']){const h=harness();h.enqueue();h.props.MK_RV2_MODE=mode;h.run();assert.equal(h.sent.length,0);assert(h.props['MK_RV2_ROUTE_'+route]);}});
test('normal production worker sends journeys and first next, with all network calls outside the lock',()=>{
 const h=harness();h.enqueue();h.run();assert.equal(h.sent.length,3);assert.equal(h.sent[0].orderId,'ORD-000001');assert.equal(h.sent[1].stage,'delivery_next_eta');
});
test('19-customer route sends all departure messages in one healthy pass without rereading full sheets per message',()=>{
 const h=harness(19);h.enqueue();h.run();assert.equal(h.sent.length,20);assert.equal(h.sent.filter(s=>s.stage==='delivery_journey_started_eta').length,19);
});
test('five co-located timeline entries all receive next messages, rather than just the first order',()=>{
 const h=harness(6);const keys={};for(let i=1;i<=5;i++){
  h.stops[i].plannedArrivalTime=h.stops[1].plannedArrivalTime;h.stops[i].plannedDepartureTime=h.stops[1].plannedDepartureTime;
  h.details[uuid(i)].locations[0].latitude=1;keys[uuid(i)]='same-location';
 }
 assert.equal(h.plan(keys).items.filter(x=>x.stage==='delivery_next_eta').length,5);
 h.enqueue();h.run();assert.equal(h.sent.filter(x=>x.stage==='delivery_next_eta').length,5);
});
test('equal ETAs at different locations do not group unrelated customers',()=>{
 const h=harness();h.stops[2].plannedArrivalTime=h.stops[1].plannedArrivalTime;h.stops[2].plannedDepartureTime=h.stops[1].plannedDepartureTime;
 assert.equal(h.plan({[uuid(1)]:'A',[uuid(2)]:'B'}).items.filter(x=>x.stage==='delivery_next_eta').length,1);
});
test('authoritative stop UUID groups split entries even without location cache',()=>{
 const h=harness();h.stops[1].stopUuid='physical-stop';h.stops[2].stopUuid='physical-stop';assert.equal(h.plan().items.filter(x=>x.stage==='delivery_next_eta').length,2);
});
test('completion uses the same worker and recovers status independently of webhook order-completion arrival',()=>{
 const h=harness();h.enqueue();h.run();h.sent.length=0;h.advance(700000);h.stops[1].orders[0].status='delivered';h.stops[1].actualDepartureTime=h.iso(h.now()-1000);
 Object.assign(h.details[uuid(1)],{status:'delivered',deliveryTime:h.iso(h.now()-1000)});h.run();
 assert(h.sent.some(x=>x.stage==='delivery_confirmation_5'));assert(h.sent.some(x=>x.orderId==='ORD-000002'&&x.stage==='delivery_next_eta'));
 assert.equal(h.rows.Deliveries[1][3],'Delivered');assert(h.rows.Deliveries[1][4] instanceof Date);
});
test('repeated worker passes and duplicate webhook events do not duplicate messages',()=>{
 const h=harness();h.enqueue();h.run();const n=h.sent.length;h.advance(60001);h.run();h.enqueue();h.run();assert.equal(h.sent.length,n);
});
test('uncertain sends are reserved and never retried blindly',()=>{
 const h=harness(1);h.enqueue();h.failSend(true);h.run();const n=h.sent.length;assert.equal(n,1);h.failSend(false);h.advance(60001);h.run();assert.equal(h.sent.length,n);
 assert.equal(JSON.parse(h.props['MK_RV2_SEND_ORD-000001_delivery_journey_started_eta']).state,'SENDING');
});
test('accepted sends with failed logging are repaired without resending',()=>{
 const h=harness(1);h.enqueue();h.failLog(true);h.run();assert.equal(h.sent.length,1);h.failLog(false);h.advance(60001);h.run();
 assert.equal(h.sent.filter(x=>x.stage==='delivery_journey_started_eta').length,1);assert(h.rows['WhatsApp Log'].some(r=>r[2]==='delivery_journey_started_eta'));
});
test('cancelled orders, missing consent, wrong UUID and wrong date block notifications',()=>{
 for(const mutate of [h=>h.rows.Orders[1][5]='Cancelled',h=>h.rows.Customers[1][3]='N',h=>h.rows.Deliveries[1][2]=uuid(99),h=>h.rows.Orders[1][1]=new Date('2026-10-01T00:00:00Z')]){
  const h=harness(1);mutate(h);h.enqueue();h.run();assert.equal(h.sent.length,0);
 }
});
test('existing accepted ETA reservations and legacy message logs remain duplicate barriers',()=>{
 const h=harness(1);h.props['MK_ETA_SEND_ORD-000001_delivery_journey_started_eta']=JSON.stringify({state:'ACCEPTED'});
 h.rows['WhatsApp Log'].push(['old','ORD-000001','delivery_next_eta','Delivered']);h.enqueue();h.run();assert.equal(h.sent.length,0);
});
test('pre-cutover route departures cannot replay historical notifications',()=>{
 const h=harness(1);h.stops[0].actualDepartureTime=h.iso(h.now()-7200000);h.enqueue();h.run();assert.equal(h.sent.length,0);assert.equal(h.props['MK_RV2_ROUTE_'+route],undefined);
});
test('late confirmation is held for review while truthful delivery status is recovered',()=>{
 const h=harness(1);h.stops[1].orders[0].status='delivered';Object.assign(h.details[uuid(1)],{status:'delivered',deliveryTime:h.iso(h.now()-3601000)});
 h.enqueue();h.run();assert.equal(h.sent.length,0);assert.equal(h.rows.Deliveries[1][3],'Delivered');
 assert.equal(JSON.parse(h.props['MK_RV2_SEND_ORD-000001_delivery_confirmation_5']).state,'REVIEW');
});
test('missed deliveries update status without sending a delivered confirmation',()=>{
 const h=harness(1);h.stops[1].orders[0].status='missed';h.details[uuid(1)].status='missed';h.enqueue();h.run();assert.equal(h.rows.Deliveries[1][3],'Failed');assert.equal(h.sent.length,0);
});
test('an interrupted worker lease prevents simultaneous workers while pending work survives',()=>{
 const h=harness();h.enqueue();h.props.MK_RV2_WORKER_LEASE=JSON.stringify({owner:'other',until:h.now()+10000});h.run();assert.equal(h.calls.length,0);assert(h.props['MK_RV2_ROUTE_'+route]);
});
test('complete paginated timelines are combined before planning; repeated cursors are rejected',()=>{
 const h=harness();h.pages([{items:[h.stops[0],h.stops[1]],nextCursor:'page-2'},{items:[h.stops[2]],nextCursor:null}]);
 const s=h.c.rv2Timeline_(route,h.now()+40000);assert.equal(s.items.length,3);assert(h.calls[1].includes('cursor=page-2'));
 h.pages([{items:[],nextCursor:'loop'},{items:[],nextCursor:'loop'}]);assert.throws(()=>h.c.rv2Timeline_(route,h.now()+40000),/CURSOR_INVALID/);
});
test('first stop arrival suppresses misleading next messages and missing departure markers defer advancing',()=>{
 const h=harness();h.stops[1].actualArrivalTime=h.iso(h.now()-1000);assert.equal(h.plan().items.filter(x=>x.stage==='delivery_next_eta').length,0);
 h.stops[1].orders[0].status='delivered';assert.equal(h.plan().items.filter(x=>x.stage==='delivery_next_eta').length,0);
});
function testConfig(h){return {bookId:'private-fixture',routeUuid:route,recipient:'61420306705',expiresAt:h.now()+3600000,
 orders:Array.from({length:6},(_,i)=>({orderId:'ORD-90000'+(i+1),uuid:uuid(i+1)}))};}
test('test authorization rejects a production workbook, another recipient, a different route and expired configuration',()=>{
 for(const mutate of [c=>c.bookId='book',c=>c.recipient='61400000001',c=>c.expiresAt=0,c=>delete c.expiresAt,c=>c.orders[1]=c.orders[0]]){
  const h=harness(),config=testConfig(h);mutate(config);h.props.MK_RV2_TEST_CONFIG=JSON.stringify(config);assert.throws(()=>h.c.rv2TestConfig_(),/NOT_AUTHORIZED/);
 }
 const h=harness(),config=testConfig(h);h.props.MK_RV2_MODE='TEST';h.props.MK_RV2_TEST_CONFIG=JSON.stringify(config);
 const tables={book:{getId:()=>config.bookId}};
 for(const item of [{orderId:'ORD-900001',routeUuid:uuid(9)},{orderId:'ORD-000001',routeUuid:route}])
  assert.throws(()=>h.c.rv2AssertTestItem_(tables,item,{phone:config.recipient}),/NOT_AUTHORIZED/);
 assert.doesNotThrow(()=>h.c.rv2AssertTestItem_(tables,{orderId:'ORD-900001',routeUuid:route},{phone:config.recipient}));
 assert.throws(()=>h.c.rv2AssertTestItem_(tables,{orderId:'ORD-900001',routeUuid:route},{phone:'61400000001'}),/NOT_AUTHORIZED/);
});
test('test and production queues and reservations are isolated',()=>{
 const h=harness(),config=testConfig(h);h.props.MK_RV2_TEST_CONFIG=JSON.stringify(config);h.props.MK_RV2_MODE='TEST';
 assert.equal(h.c.rv2SendPrefix_(),'MK_RV2_TEST_SEND_');assert.equal(h.c.rv2JobPrefix_(),'MK_RV2_TEST_ROUTE_JOB_');
 h.c.rv2Accept_({version:1,key:'a'.repeat(64),payload:{type:'route.eta_updated',timestamp:h.iso(h.now()),data:{route:{uuid:route}}}});
 assert(h.props['MK_RV2_TEST_ROUTE_JOB_'+route]);assert.equal(h.props['MK_RV2_ROUTE_'+route],undefined);
 h.c.rv2Accept_({version:1,key:'b'.repeat(64),payload:{type:'route.eta_updated',timestamp:h.iso(h.now()),data:{route:{uuid:uuid(99)}}}});
 assert(h.props['MK_RV2_ROUTE_'+uuid(99)]);h.props.MK_RV2_MODE='LIVE';assert.equal(h.c.rv2JobPrefix_(),'MK_RV2_ROUTE_');
});
test('the exact worker sends and updates delivered status in the private test workbook only',()=>{
 const h=harness(6),config=testConfig(h);h.props.MK_RV2_MODE='TEST';h.props.MK_RV2_TEST_CONFIG=JSON.stringify(config);
 for(let n=1;n<=6;n++){
  h.rows.Orders[n][0]='ORD-90000'+n;h.rows.Orders[n][4]=config.recipient;
  h.rows.Deliveries[n][1]='ORD-90000'+n;h.rows.Customers[n][2]=config.recipient;
  h.stops[n].orders[0].customerOrderNumber='ORD-90000'+n;h.details[uuid(n)].customerOrderNumber='ORD-90000'+n;
 }
 const fixture={getId:()=>config.bookId,getSheetByName:h.book.getSheetByName};
 h.c.SpreadsheetApp={openById:id=>{assert.equal(id,config.bookId);return fixture;}};
 h.c.registerWhatsAppOutbound_=()=>{throw Error('Production log must not be called by test worker');};
 h.c.WHATSAPP_LOG_HEADERS=h.rows['WhatsApp Log'][0];
 h.c.fwAppend_=(sheet,rows)=>({sheet:sheet.name,append:rows});
 h.c.Sheets={Spreadsheets:{batchUpdate:(request,id)=>{
  assert.equal(id,config.bookId);for(const r of request.requests){
   if(r.append)h.rows[r.sheet].push(...r.append);else h.rows[r.sheet][r.row-1][r.col]=r.value;
  }
 }}};
 h.props['MK_RV2_TEST_ROUTE_JOB_'+route]=JSON.stringify({routeUuid:route,eventAt:h.now(),firstReceivedAt:h.now(),lastReceivedAt:h.now(),attempts:0,nextPollAt:0});
 h.run();assert.equal(h.sent.length,7);assert.equal(h.rows['WhatsApp Log'].length,8);
 h.advance(60001);h.stops[1].orders[0].status='delivered';h.stops[1].actualDepartureTime=h.iso(h.now());
 Object.assign(h.details[uuid(1)],{status:'delivered',deliveryTime:h.iso(h.now())});h.run();
 assert.equal(h.rows.Deliveries[1][3],'Delivered');assert(h.sent.some(s=>s.stage==='delivery_confirmation_5'));
 assert(!Object.keys(h.props).some(k=>k.startsWith('MK_RV2_SEND_')));
});
test('date refresh refuses other routes, started orders and existing test receipts before writes',()=>{
 for(const fault of ['route','started','receipt','date']){
  const h=harness(),cfg=testConfig(h);cfg.routeUuid='dc9c1300-3d32-4e91-85a4-96a210478b60';cfg.expiresAt=0;
  if(fault==='route')cfg.routeUuid=route;
  h.props.MK_RV2_MODE='TEST';h.props.MK_RV2_TEST_CONFIG=JSON.stringify(cfg);
  if(fault==='receipt')h.props.MK_RV2_TEST_SEND_example=JSON.stringify({routeUuid:cfg.routeUuid});
  h.c.rv2TestApi_=()=>({items:[{uuid:cfg.routeUuid,date:fault==='date'?'2026-11-01':'2026-11-05'}]});
  h.c.rv2Timeline_=()=>({items:[{actualDepartureTime:fault==='started'?h.iso(h.now()):null,orders:cfg.orders.map(o=>({customerOrderNumber:o.orderId,uuid:o.uuid,status:'scheduled'}))}]});
  const before=JSON.stringify(h.props);assert.throws(()=>h.c.refreshRoutificRecoveryTestDate(),/RECOVERY_TEST/);assert.equal(JSON.stringify(h.props),before);
 }
});
test('date refresh updates only six private fixture dates and renews isolated job without sending',()=>{
 const h=harness(),cfg=testConfig(h);cfg.routeUuid='dc9c1300-3d32-4e91-85a4-96a210478b60';cfg.expiresAt=0;
 h.props.MK_RV2_MODE='TEST';h.props.MK_RV2_TEST_CONFIG=JSON.stringify(cfg);
 h.c.rv2TestApi_=()=>({items:[{uuid:cfg.routeUuid,date:'2026-11-05'}]});
 h.c.rv2Timeline_=()=>({items:[{orders:cfg.orders.map(o=>({customerOrderNumber:o.orderId,uuid:o.uuid,status:'scheduled'}))}]});
 const writes=[],rows=[['Order ID','Delivery Date'],...cfg.orders.map(o=>[o.orderId,'old'])];
 h.c.SpreadsheetApp={openById:id=>{assert.equal(id,'private-fixture');return {getSheetByName:n=>{assert.equal(n,'Orders');return {getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),getRange:(r,c)=>({setValue:v=>{writes.push([r,c,v]);return {setNumberFormat:()=>{}};}})};}};}};
 const before=JSON.stringify(h.rows);h.c.refreshRoutificRecoveryTestDate();assert.equal(writes.length,6);assert.equal(JSON.stringify(h.rows),before);assert.equal(h.sent.length,0);
 assert.equal(h.props.MK_RV2_MODE,'TEST');assert.equal(JSON.parse(h.props.MK_RV2_TEST_CONFIG).date,'2026-11-05');assert.ok(JSON.parse(h.props.MK_RV2_TEST_CONFIG).expiresAt>h.now());
 assert.ok(h.props['MK_RV2_TEST_ROUTE_JOB_'+cfg.routeUuid]);
});
test('urgent next-stop messages precede completed-order confirmations',()=>{
 const h=harness(3);h.stops[1].orders[0].status='delivered';h.stops[1].actualDepartureTime=h.iso(h.now()-60000);
 const items=h.plan().items;assert.ok(items.findIndex(x=>x.stage==='delivery_next_eta')<items.findIndex(x=>x.stage==='delivery_confirmation_5'));
});
test('slow sends refresh route snapshots within the same pass instead of abandoning remaining messages',()=>{
 const h=harness(6),send=h.c.mkEtaSend_;h.c.mkEtaSend_=(...args)=>{const id=send(...args);h.advance(4000);return id;};
 h.enqueue();h.run();assert.equal(h.sent.length,7);assert.ok(h.calls.filter(u=>u.includes('/timeline')).length>=3);
 assert.equal(JSON.parse(h.props['MK_RV2_ROUTE_'+route]).lastError,null);
});
test('later-stop tracking lookup failure cannot block the first customer next notification',()=>{
 const h=harness(3);delete h.details[uuid(3)];h.enqueue();h.run();
 assert.ok(h.sent.some(x=>x.orderId==='ORD-000001'&&x.stage==='delivery_next_eta'));
});
test('busy shared lock defers work without losing its queue or accepted receipt',()=>{
 const h=harness();h.enqueue();h.busy(true);assert.doesNotThrow(()=>h.run());assert.ok(h.props['MK_RV2_ROUTE_'+route]);
 h.busy(false);const send=h.c.mkEtaSend_;h.c.mkEtaSend_=(...args)=>{const id=send(...args);h.busy(true);return id;};
 assert.doesNotThrow(()=>h.run());assert.ok(Object.keys(h.props).some(k=>k.startsWith('MK_RV2_SEND_')&&JSON.parse(h.props[k]).state==='ACCEPTED'));
 h.busy(false);h.c.mkEtaSend_=send;h.advance(100000);h.run();assert.equal(h.sent.filter(x=>x.orderId==='ORD-000001'&&x.stage==='delivery_journey_started_eta').length,1);
});
