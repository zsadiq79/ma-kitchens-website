const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {fixture,lineId,date}=require('./helpers/order-fixture.cjs');
const root=path.join(__dirname,'..');
test('warm availability resolves immediately, failures do not block menu and cold lookup has a fixed budget',async()=>{
 const {initialOrderAvailability}=await import('../lib/orderAvailabilityInitial.mjs');
 const value={status:'OPEN',items:[]};assert.equal(await initialOrderAvailability(Promise.resolve(value)),value);
 assert.equal(await initialOrderAvailability(Promise.reject(Error('offline'))),null);
 const start=performance.now();assert.equal(await initialOrderAvailability(new Promise(()=>{}),20),null);assert(performance.now()-start<250);
});
test('refresh candidate changes only cache policy in one Apps Script function',()=>{
 const before=fs.readFileSync(path.join(root,'apps-script/low-stock-labels/Code.gs'),'utf8');
 const fragment=fs.readFileSync(path.join(root,'apps-script/availability-refresh/orderAvailabilityRead_.gs'),'utf8').trimEnd();
 const start=before.indexOf('function orderAvailabilityRead_(body)'),end=before.indexOf('\nfunction ',start+10);
 const after=before.slice(0,start)+fragment+'\n'+before.slice(end);
 const expectedBefore=before.slice(0,start)+before.slice(start,end).trimEnd()+'\n'+before.slice(end);
 const expected=expectedBefore.replace('MK_AVAILABILITY_V2_','MK_AVAILABILITY_V3_').replace('Date.now()-Date.parse(result.checkedAt) < 15000','Date.now()-Date.parse(result.checkedAt) < 5000').replace('cache.put(key,JSON.stringify(result),15)','cache.put(key,JSON.stringify(result),5)');
 assert.equal(after,expected);const ast=ts.createSourceFile('Code.js',after,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(ast.parseDiagnostics.length,0);
});
test('Apps Script reuses fresh cache and rebuilds five-second-old stock without writes',()=>{
 const f=fixture({release:'low-stock-labels'}),cache=new Map(),puts=[];
 require('node:vm').runInContext(fs.readFileSync(path.join(root,'apps-script/availability-refresh/orderAvailabilityRead_.gs'),'utf8'),f.ctx);
 f.ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v,ttl)=>{cache.set(k,v);puts.push(ttl);}})};
 const revision='a'.repeat(64),id='i_'+'a'.repeat(24),body={menuRevision:revision,menuCycleId:'MENU-'+date,deliveryDate:date};
 f.add('Menu Config',['Show Low Stock Labels',true]);f.add('Menu Config',['Low Stock Threshold',5]);
 f.add('Order Menu State',['STATE',revision,'MENU-'+date,date,'2026-10-18T00:00:00Z','ACTIVE','','','','','','','','','','',5,1000]);
 f.add('Order Menu State',['ITEM',revision,'MENU-'+date,date,'2026-10-18T00:00:00Z','ACTIVE',id,lineId,'M0001','COOK-1','Test Kitchen','Test Dish',1500,800,50,'',5,1000]);
 const col=f.tables['Weekly Menu'][0].indexOf('Available Servings');f.tables['Weekly Menu'][1][col]=4;
 const read=()=>f.ctx.orderAvailabilityRead_(body);assert.equal(read().items[0].lowStockRemaining,4);assert.deepEqual(puts,[5]);
 f.tables['Weekly Menu'][1][col]=2;assert.equal(read().items[0].lowStockRemaining,4);
 f.state.now+=5000;assert.equal(read().items[0].lowStockRemaining,2);assert.deepEqual(puts,[5,5]);assert.deepEqual(f.state.writes,[]);
});
test('shared server cache is short, revision-keyed, and rejects stale or malformed cached urgency',async()=>{
 const Module=require('node:module'),filename=path.join(root,'lib/orderAvailabilityServer.ts'),mod=new Module(filename);
 let value,cacheOptions,keys,loaderCalls=0;const cached=new Map();
 const {readOrderAvailability}=await import('../lib/orderAvailability.mjs');
 mod.require=name=>{
  if(name==='next/cache')return {unstable_cache:(fn,k,options)=>{keys=k;cacheOptions=options;return async menu=>{const key=JSON.stringify(menu);if(!cached.has(key))cached.set(key,await fn(menu));return cached.get(key);};}};
  if(name.includes('orderAvailabilityBackend'))return {loadOrderAvailability:async()=>{loaderCalls++;return value;}};
  if(name.includes('orderAvailability.mjs'))return {readOrderAvailability};throw Error(name);
 };
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
 const menu={menuRevision:'a'.repeat(64),menuCycleId:'MENU-2099-10-29',deliveryDate:'2099-10-29',meals:[{id:'one'}]};
 value={ok:true,...menu,status:'OPEN',checkedAt:new Date().toISOString(),items:[{id:'one',status:'AVAILABLE',lowStockRemaining:3}]};
 assert.equal((await mod.exports.getCachedOrderAvailability(menu)).items[0].lowStockRemaining,3);
 await mod.exports.getCachedOrderAvailability(menu);assert.equal(loaderCalls,1);assert.equal(cacheOptions.revalidate,5);assert(keys.length);
 value.checkedAt=new Date(Date.now()-15001).toISOString();await assert.rejects(mod.exports.getCachedOrderAvailability(menu));
 const newer={...menu,menuRevision:'b'.repeat(64)};value={...value,...newer,checkedAt:new Date().toISOString()};await mod.exports.getCachedOrderAvailability(newer);assert.equal(loaderCalls,2);
 value.items=[{id:'one',status:'AVAILABLE',lowStockRemaining:-1}];await assert.rejects(mod.exports.getCachedOrderAvailability(newer));
});
