const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const {fixture,lineId,date} = require('./helpers/order-fixture.cjs');
const root = path.join(__dirname,'..');
const source = fs.readFileSync(path.join(root,'apps-script/soldout-availability/Code.gs'),'utf8');
const baseline = JSON.parse(fs.readFileSync(path.join(root,'apps-script/soldout-availability/baseline-functions.json'),'utf8'));
const id = 'i_aaaaaaaaaaaaaaaaaaaaaaaa', revision = 'a'.repeat(64);
const body = {menuRevision:revision,menuCycleId:'MENU-'+date,deliveryDate:date};
const menu = {...body,meals:[{id,dishName:'Test Dish',price:15}]};
const mods = Promise.all([import('../lib/orderAvailability.mjs'),import('../lib/orderAvailabilityBackend.mjs')]);

function setup() {
  const f = fixture({release:'soldout-availability'}), cached = new Map();
  f.ctx.CacheService = {getScriptCache:()=>({get:key=>cached.get(key)||null,put:(key,value)=>cached.set(key,value)})};
  f.cached=cached;
  f.add('Order Menu State',['STATE',revision,'MENU-'+date,date,'2026-10-18T00:00:00Z','ACTIVE','','','','','','','','','','',5,1000]);
  f.add('Order Menu State',['ITEM',revision,'MENU-'+date,date,'2026-10-18T00:00:00Z','ACTIVE',id,lineId,'M0001','COOK-1','Test Kitchen','Test Dish',1500,800,50,'',5,1000]);
  return f;
}
const read = f=>JSON.parse(JSON.stringify(f.ctx.orderAvailabilityRead_(body)));
function weekly(f,key,value) {const h=f.tables['Weekly Menu'][0];f.tables['Weekly Menu'][1][h.indexOf(key)]=value;}

test('supplied source keeps every existing function, including every dollar-reduction function, with only five intended function edits',()=>{
  const ast=ts.createSourceFile('Code.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length,0);
  const found={},changed=[];
  for(const n of ast.statements)if(ts.isFunctionDeclaration(n)) {
    assert(!found[n.name.text],'duplicate function '+n.name.text);
    found[n.name.text]=crypto.createHash('sha256').update(n.getText(ast).replace(/\r\n/g,'\n')).digest('hex');
  }
  for(const [name,hash] of Object.entries(baseline.functions)) {assert(found[name],'preserved '+name);if(hash!==found[name])changed.push(name);}
  assert.deepEqual(changed.sort(),['doPost','mkOrderSnapshot_','orderRequestCapture_','previewCurrentOrderingMenu','publishCurrentOrderingMenu'].sort());
  assert(Object.keys(baseline.functions).some(name=>name.startsWith('mkDollar')));
});
test('availability uses public IDs without exposing quantities or customer data and performs no writes',()=>{
  const f=setup(),r=read(f);assert.equal(r.status,'OPEN');assert.deepEqual(r.items,[{id,status:'AVAILABLE'}]);
  assert.deepEqual(f.state.writes,[]);assert.equal(f.state.lock,undefined);assert(!JSON.stringify(r).includes('CUST-'));
});
test('zero stock, full sellout and restored capacity use committed order quantities',()=>{
  const f=setup();weekly(f,'Available Servings',0);assert.equal(read(f).items[0].status,'SOLD_OUT');
  f.cached.clear();weekly(f,'Available Servings',50);assert.equal(read(f).items[0].status,'AVAILABLE');
  f.add('Orders',['ORD-000001','',date]);f.tables.Orders[1][8]='Confirmed';
  const item=Array(30).fill('');item[0]='ORD-000001';item[6]=50;item[22]='M0001';f.add('Order Items',item);
  f.cached.clear();assert.equal(read(f).items[0].status,'SOLD_OUT');
  f.tables.Orders[1][8]='Cancelled';f.cached.clear();assert.equal(read(f).items[0].status,'AVAILABLE');
});
test('column V Sold Out overrides positive computed stock, and withdrawn dishes stay unavailable',()=>{
  const f=setup();weekly(f,'Availability Status','Sold Out');assert.equal(read(f).items[0].status,'SOLD_OUT');
  f.cached.clear();weekly(f,'Menu Status','Hidden');assert.equal(read(f).items[0].status,'UNAVAILABLE');
});
test('changed prices, dish identity and inactive dishes cannot become orderable',()=>{
  for(const [field,value]of [['Customer Price',20],['Dish Name','Other'],['Cook ID','Other'],['Menu Card Readiness','NOT READY']]) {
    const f=setup();weekly(f,field,value);assert.equal(read(f).items[0].status,'UNAVAILABLE');
  }
});
test('availability cache serves repeated requests without repeating sheet reads, then refreshes',()=>{
  const f=setup();read(f);f.ctx.orderRequestLiveLines_=()=>{throw new Error('unexpected sheet read')};
  for(let i=0;i<100;i++)assert.equal(read(f).status,'OPEN');
  f.state.now+=15001;assert.throws(()=>read(f),/unexpected sheet read/);
});
test('missing cache service results do not affect correctness',()=>{
  const f=setup();f.ctx.CacheService={getScriptCache:()=>({get(){throw Error()},put(){throw Error()}})};
  assert.equal(read(f).items[0].status,'AVAILABLE');
});
test('closed, paused, withdrawn and revised menus fail closed, including previously cached stock',()=>{
  const f=setup();read(f);f.scriptProperties.ORDER_AUTOMATION_CAPTURE_ENABLED='false';assert.equal(read(f).status,'CLOSED');
  f.scriptProperties.ORDER_AUTOMATION_CAPTURE_ENABLED='true';f.cached.clear();f.tables['Order Menu State'][1][1]='b'.repeat(64);
  assert.equal(read(f).status,'STALE');f.state.now=Date.parse('2026-10-21T11:00:00Z');assert.equal(read(f).status,'CLOSED');
});
test('signed endpoint rejects invalid authentication before opening sheets',()=>{
  const f=setup();f.ctx.orderAvailabilityRead_=()=>{throw Error('must not reach data')};
  const result=f.ctx.handleOrderAvailabilityApi_({postData:{contents:'{}'}});assert.equal(JSON.parse(result.getContent()).ok,false);
});
test('valid signed availability requests reach the read-only handler',()=>{
  const f=setup(),secret=f.ctx.PropertiesService.getScriptProperties().getProperty('ORDER_REQUEST_API_SECRET');
  const timestamp=String(f.state.now),raw=JSON.stringify(body),action='order_menu_availability';
  const signature=crypto.createHmac('sha256',secret).update(`${timestamp}\n${action}\n${raw}`).digest('hex');
  const output=f.ctx.doPost({parameter:{action},postData:{contents:JSON.stringify({timestamp,body:raw,signature})}});
  assert.equal(JSON.parse(output.getContent()).items[0].status,'AVAILABLE');assert.deepEqual(f.state.writes,[]);
});
test('final uncached capture rejects sold-out status or insufficient stock even after a cached available answer',()=>{
  for(const change of [['Availability Status','Sold Out'],['Available Servings',4]]) {
    const f=setup();assert.equal(read(f).items[0].status,'AVAILABLE');weekly(f,...change);
    f.ctx.getOrderingRules_=()=>({minimumOrderItems:5,deliveryFee:10});
    assert.throws(()=>f.ctx.orderRequestCapture_({...body,requestKey:crypto.randomUUID(),recoveryCapability:'c'.repeat(43),items:[{id,quantity:5}]}),/ITEM_UNAVAILABLE/);
    assert.equal(f.tables['Order Requests'].length,1);assert.deepEqual(f.state.writes,[]);
  }
});
test('display publisher retains sold-out dishes even when every dish is sold out',()=>{
  const f=setup();weekly(f,'Available Servings',0);weekly(f,'Availability Status','Sold Out');
  const display=f.ctx.mkOrderDisplayMenu_();assert.equal(display.status,'ACTIVE');assert.equal(display.meals.length,1);
  const snapshot=f.ctx.mkOrderSnapshot_(display,new f.ctx.Date(f.state.now));assert.equal(snapshot.meals.length,1);
  assert.equal(snapshot.meals[0].dishName,'Test Dish');assert(!('remainingServings' in snapshot.meals[0]));
});
test('display builder excludes hidden/inactive/unready dishes and never changes ordinary orderable-menu filtering',()=>{
  const f=setup();weekly(f,'Menu Card Readiness','NOT READY');assert.equal(f.ctx.mkOrderDisplayMenu_().meals.length,0);
  assert.equal(crypto.createHash('sha256').update(source.match(/function buildActiveMenu_\(\) \{[^\n]+/)[0]).digest('hex'),baseline.functions.buildActiveMenu_);
});
test('web validator rejects stale, mismatched, duplicate and incomplete availability data',async()=>{
  const [m]=await mods,now=Date.now();const valid={ok:true,...body,status:'OPEN',checkedAt:new Date(now).toISOString(),items:[{id,status:'AVAILABLE'}]};
  assert.equal(m.readOrderAvailability(valid,menu,now).status,'OPEN');
  for(const patch of [{items:[]},{menuRevision:'b'.repeat(64)},{items:[{id,status:'UNKNOWN'}]},{checkedAt:new Date(now-45001).toISOString()},{items:[{id:'i_wrong',status:'AVAILABLE'}]}])
    assert.throws(()=>m.readOrderAvailability({...valid,...patch},menu,now),/AVAILABILITY_UNAVAILABLE/);
});
test('selected sold-out dishes block new requests while other selections remain usable',async()=>{
  const [m]=await mods,availability={status:'OPEN',items:[{id,status:'SOLD_OUT'}]};
  assert.equal(m.blockedOrderItems(availability,{items:[{id}]}).length,1);
  assert.equal(m.blockedOrderItems(availability,{items:[]}).length,0);
});
test('100 concurrent visitors share one signed upstream call per instance and receive a small public response',async()=>{
  const [,m]=await mods;let calls=0,release;const gate=new Promise(resolve=>release=resolve);const now=Date.now();
  const options={secret:'x'.repeat(40),backendUrl:'https://script.google.com/macros/s/test/exec',now:()=>now,fetcher:async(url,init)=>{
    calls++;await gate;assert.equal(url.searchParams.get('action'),'order_menu_availability');
    const e=JSON.parse(init.body);assert.equal(e.signature,crypto.createHmac('sha256',options.secret).update(`${e.timestamp}\norder_menu_availability\n${e.body}`).digest('hex'));
    return {ok:true,url:'https://script.googleusercontent.com/macros/echo',json:async()=>({ok:true,...body,status:'OPEN',checkedAt:new Date(now).toISOString(),items:[{id,status:'AVAILABLE',private:'must not escape'}]})};
  }};
  const start=performance.now(),pending=Array.from({length:100},()=>m.loadOrderAvailability(menu,options));release();
  const results=await Promise.all(pending);assert.equal(calls,1);assert(!JSON.stringify(results[0]).includes('private'));
  assert(Buffer.byteLength(JSON.stringify(results[0]))<500);assert(performance.now()-start<1000);
});
test('upstream errors, redirects and malformed results are failures rather than sold-out answers',async()=>{
  const [,m]=await mods;
  for(const response of [{ok:false,url:'https://script.google.com/'},{ok:true,url:'https://evil.example/'},{ok:true,url:'https://script.google.com/',json:async()=>({ok:false})}])
    await assert.rejects(m.loadOrderAvailability(menu,{secret:'x'.repeat(40),backendUrl:'https://script.google.com/macros/s/test/exec',fetcher:async()=>response}));
});
