const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto');
const {fixture,date,lineId}=require('./helpers/order-fixture.cjs');
const root=path.join(__dirname,'..'),id='i_'+'a'.repeat(24),revision='a'.repeat(64);
const body={menuRevision:revision,menuCycleId:'MENU-'+date,deliveryDate:date};
function setup(enabled=true,threshold=5){
  const f=fixture({release:'low-stock-labels'});
  f.ctx.CacheService={getScriptCache:()=>({get:()=>null,put(){}})};
  f.add('Menu Config',['Show Low Stock Labels',enabled]);f.add('Menu Config',['Low Stock Threshold',threshold]);
  f.add('Order Menu State',['STATE',revision,'MENU-'+date,date,'2026-10-18T00:00:00Z','ACTIVE','','','','','','','','','','',5,1000]);
  f.add('Order Menu State',['ITEM',revision,'MENU-'+date,date,'2026-10-18T00:00:00Z','ACTIVE',id,lineId,'M0001','COOK-1','Test Kitchen','Test Dish',1500,800,50,'',5,1000]);
  return f;
}
function capacity(f,n){const h=f.tables['Weekly Menu'][0];f.tables['Weekly Menu'][1][h.indexOf('Available Servings')]=n;}
const item=f=>JSON.parse(JSON.stringify(f.ctx.orderAvailabilityRead_(body))).items[0];
test('low-stock extension changes only the existing availability reader',()=>{
  const parse=file=>{const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile('Code.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),map={};assert.equal(ast.parseDiagnostics.length,0);for(const n of ast.statements)if(ts.isFunctionDeclaration(n)){assert(!map[n.name.text]);map[n.name.text]=crypto.createHash('sha256').update(n.getText(ast)).digest('hex');}return map;};
  const before=parse('apps-script/soldout-availability/Code.gs'),after=parse('apps-script/low-stock-labels/Code.gs');
  const changes=Object.keys(before).filter(k=>before[k]!==after[k]);assert.deepEqual(changes,['orderAvailabilityRead_']);
  assert.deepEqual(Object.keys(after).filter(k=>!before[k]),['mkLowStockSettings_']);
});
test('only exact positive stock within threshold is exposed, including one and five',()=>{
  for(const n of [1,2,3,4,5,6,50]){const f=setup();capacity(f,n);const r=item(f);assert.equal(r.status,'AVAILABLE');assert.equal(r.lowStockRemaining,n<=5?n:undefined);assert.deepEqual(f.state.writes,[]);}
});
test('zero retains SOLD_OUT, no count and no buffer',()=>{
  const f=setup();capacity(f,0);assert.deepEqual(item(f),{id,status:'SOLD_OUT'});
  assert.equal(f.ctx.orderRequestLiveLines_(f.book,{deliveryDate:date})[lineId].remainingServings,0);
});
test('Off and missing, duplicate or invalid settings hide counts without hiding sold-out status',()=>{
  for(const off of [false,'Off','false','invalid']){const f=setup(off);capacity(f,2);assert.equal(item(f).lowStockRemaining,undefined);capacity(f,0);assert.equal(item(f).status,'SOLD_OUT');}
  for(const n of ['',0,-1,1.5,'x',1000]){const f=setup(true,n);capacity(f,2);assert.equal(item(f).lowStockRemaining,undefined);}
  const f=setup();f.add('Menu Config',['Low Stock Threshold',10]);capacity(f,2);assert.equal(item(f).lowStockRemaining,undefined);
});
test('threshold edits affect display only and counts use committed stock',()=>{
  const f=setup(true,10);capacity(f,9);assert.equal(item(f).lowStockRemaining,9);
  f.add('Orders',['ORD-000001','',date]);f.tables.Orders[1][8]='Confirmed';const row=Array(30).fill('');row[0]='ORD-000001';row[6]=6;row[22]='M0001';f.add('Order Items',row);
  assert.equal(item(f).lowStockRemaining,3);f.tables.Orders[1][8]='Cancelled';assert.equal(item(f).lowStockRemaining,9);
});
test('browser validates optional low counts and renders agreed singular/plural labels',async()=>{
  const m=await import('../lib/orderAvailability.mjs');assert.equal(m.lowStockLabel({status:'AVAILABLE',lowStockRemaining:1}),'Last serving available');
  assert.equal(m.lowStockLabel({status:'AVAILABLE',lowStockRemaining:3}),'Only 3 servings left');assert.equal(m.lowStockLabel({status:'SOLD_OUT',lowStockRemaining:1}),'');
  const menu={...body,meals:[{id}]},base={ok:true,...body,status:'OPEN',checkedAt:new Date().toISOString(),items:[{id,status:'AVAILABLE',lowStockRemaining:3}]};
  assert.equal(m.readOrderAvailability(base,menu).items[0].lowStockRemaining,3);
  for(const bad of [0,-1,1.5,1000,'3'])assert.throws(()=>m.readOrderAvailability({...base,items:[{id,status:'AVAILABLE',lowStockRemaining:bad}]},menu));
});
