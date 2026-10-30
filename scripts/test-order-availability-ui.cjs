// Optional DOM acceptance runner: npm install --no-save jsdom, then run this file.
// No network or production services are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://www.makitchens.com.au/go/order/current'});
global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.HTMLElement=dom.window.HTMLElement;global.IS_REACT_ACT_ENVIRONMENT=true;
let visible='visible';Object.defineProperty(document,'visibilityState',{get:()=>visible});
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
const filename=path.join(__dirname,'../components/ordering/OrderMenu.tsx');
const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod.require=function(name){if(name.endsWith('.module.css'))return new Proxy({},{get:(_,key)=>String(key)});if(name==='next/image')return props=>React.createElement('img',props);return Module.prototype.require.call(this,name);};
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const id='i_'+'a'.repeat(24),id2='i_'+'b'.repeat(24);
const menu={schemaVersion:2,menuRevision:'a'.repeat(64),menuCycleId:'MENU-2099-10-29',deliveryDate:'2099-10-29',deliveryDateDisplay:'Thu 29 Oct',publishedAt:'2026-10-28T00:00:00Z',minimumOrderItems:5,deliveryFeeCents:1000,meals:[{id,dishName:'First Dish',price:15},{id:id2,dishName:'Second Dish',price:12}]};
let counts=[],statuses=['AVAILABLE','AVAILABLE'],fail=false,resolveFirst,calls=0,captures=0,timer;
const first=new Promise(resolve=>resolveFirst=resolve);
global.fetch=async url=>{
  if(url==='/api/order-requests'){captures++;return {ok:false,json:async()=>({ok:false,error:'ITEM_UNAVAILABLE'})};}
  calls++;if(calls===1)await first;if(fail)throw Error('offline');
  return {ok:true,json:async()=>({ok:true,...menu,status:'OPEN',checkedAt:new Date().toISOString(),items:[{id,status:statuses[0],...(counts[0]===undefined?{}:{lowStockRemaining:counts[0]})},{id:id2,status:statuses[1]}]})};
};
const originalSet=global.setTimeout,originalClear=global.clearTimeout;
global.setTimeout=(fn,delay,...args)=>{if(delay===10000){timer=fn;return 4242;}return originalSet(fn,delay,...args);};
global.clearTimeout=value=>{if(value===4242){timer=undefined;return;}return originalClear(value);};
const root=createRoot(document.getElementById('root'));
const flush=()=>new Promise(resolve=>originalSet(resolve,0));
const plus=()=>document.querySelector('button[aria-label="Add one First Dish"]');
async function poll(){const next=timer;timer=undefined;await act(async()=>{await next();await flush();});}
async function main(){
  await act(async()=>{root.render(React.createElement(mod.exports.OrderMenu,{menu,initialAvailability:{status:'OPEN',checkedAt:new Date().toISOString(),items:[{id,status:'AVAILABLE',lowStockRemaining:4},{id:id2,status:'AVAILABLE'}]}}));await flush();});
  assert(document.body.textContent.includes('First Dish'),'menu renders before availability response');
  assert(document.body.textContent.includes('Only 4 servings left'),'initial labels render before a held network response');
  assert.equal(plus().disabled,false);assert.equal(captures,0);
  await act(async()=>{resolveFirst();await flush();});
  counts=[3];await poll();assert(document.body.textContent.includes('Only 3 servings left'));assert.equal(plus().disabled,false);
  counts=[1];await poll();assert(document.body.textContent.includes('Last serving available'));
  counts=[];await poll();assert(!document.body.textContent.includes('Last serving available'));
  await act(async()=>{for(let i=0;i<5;i++){plus().click();await flush();}});
  assert.equal(document.querySelector('#quantity-0').value,'5');assert.equal(document.querySelector('#continue-order').disabled,false);
  statuses=['SOLD_OUT','AVAILABLE'];await poll();
  assert.equal(plus().disabled,true);assert.equal(document.querySelector('#quantity-0').disabled,true);
  assert.equal(document.querySelector('#quantity-0').value,'5','existing selection is retained for review');
  assert.equal(document.querySelector('#continue-order').disabled,true);
  const remove=[...document.querySelectorAll('button')].find(x=>x.textContent==='Remove First Dish');assert(remove);
  await act(async()=>{remove.click();});assert.equal(document.querySelector('#quantity-0').value,'');
  assert.equal(document.querySelector('button[aria-label="Add one Second Dish"]').disabled,false,'other dish remains usable');
  statuses=['SOLD_OUT','SOLD_OUT'];await poll();assert(document.body.textContent.includes('This week’s menu is sold out.'));
  statuses=['AVAILABLE','AVAILABLE'];await poll();assert.equal(plus().disabled,false);
  const before=calls;visible='hidden';await act(async()=>{document.dispatchEvent(new dom.window.Event('visibilitychange'));});
  assert.equal(timer,undefined,'hidden tab has no scheduled poll');assert.equal(calls,before);
  visible='visible';await act(async()=>{document.dispatchEvent(new dom.window.Event('visibilitychange'));await flush();});assert.equal(calls,before+1);
  fail=true;await poll();assert(document.body.textContent.includes('temporarily unavailable'));assert(!document.body.textContent.includes('Sold out'));
  fail=false;await poll();await act(async()=>{for(let i=0;i<5;i++){plus().click();await flush();}});
  await act(async()=>{document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();});
  assert.equal(captures,1);assert(document.body.textContent.includes('no longer has enough servings'));assert.equal(document.querySelector('#quantity-0').value,'5');
  await act(async()=>root.unmount());
  console.log(JSON.stringify({passed:true,checks:19,availabilityCalls:calls,captureCalls:captures,realNetworkCalls:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.setTimeout=originalSet;global.clearTimeout=originalClear;dom.window.close();});
