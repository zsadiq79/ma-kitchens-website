const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const folder=path.join(__dirname,'..','apps-script','integration-test'),source=fs.readFileSync(path.join(folder,'Code.gs'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'source-manifest.json'),'utf8'));
const id=manifest.testSpreadsheet;
function context(env='TEST') {
  const calls=[];
  const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:()=>env})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
    SpreadsheetApp:{openById:value=>{calls.push(value);return {getId:()=>value}}},
    UrlFetchApp:{fetch:()=>{throw new Error('NETWORK REACHED')}},
    Sheets:{Spreadsheets:{batchUpdate:()=>{calls.push('batch')}}}};
  vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls};
}
test('Integrated manifest retains supplied editor settings and adds explicit test scopes',()=>{
  const original=JSON.parse(fs.readFileSync(path.join(folder,'..','integration-reference','appsscript.editor.json'),'utf8'));
  const installed=JSON.parse(fs.readFileSync(path.join(folder,'appsscript.json'),'utf8'));
  for(const key of Object.keys(original))assert.deepEqual(installed[key],original[key]);
  assert.ok(installed.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'));
  assert.ok(installed.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});
test('Integrated package has all baseline functions, exact source origins and one public dispatcher',()=>{
  assert.equal(manifest.originalModules.length,12);
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),manifest.codeSha256);
  const names=[...source.matchAll(/^function\s+(\w+)\s*\(/gm)].map(m=>m[1]);
  assert.equal(new Set(names).size,names.length);
  assert.equal(names.filter(n=>n==='doGet').length,1);assert.equal(names.filter(n=>n==='doPost').length,1);
  const {ctx}=context();
  const baseline=path.join(__dirname,'..','apps-script','integration-baseline');
  for(const item of manifest.originalModules){
    const original=fs.readFileSync(path.join(baseline,item.name),'utf8');
    assert.equal(crypto.createHash('sha256').update(original).digest('hex'),item.sha256);
    assert.ok(source.includes('SOURCE: '+item.name));
    for(const m of original.matchAll(/^function\s+(\w+)\s*\(/gm))assert.equal(typeof ctx[m[1]],'function','Missing '+m[1]);
  }
});
test('Test boundary rejects wrong books, wrong batches and missing environment',()=>{
  const {ctx,calls}=context();
  assert.throws(()=>ctx.mkIntegrationOpenBook_('live-or-other-id'),/NON_TEST/);
  assert.throws(()=>ctx.mkIntegrationBatch_({},'live-or-other-id'),/NON_TEST/);
  assert.equal(calls.length,0);assert.equal(ctx.mkIntegrationOpenBook_(id).getId(),id);
  assert.throws(()=>context('').ctx.mkIntegrationOpenBook_(id),/CONFIGURATION/);
});
test('No network or existing document access can escape the integrated test boundary',()=>{
  const {ctx}=context();
  for(const name of ['mkIntegrationFetch_','mkIntegrationDocumentOpen_','mkIntegrationDocumentCreate_','mkIntegrationDriveFile_',
    'saveFeedbackProductionConfig','enableWebsiteFeedbackLive','sendConfirmedOrdersToRoutific','generatePackingSlips','oeSendConfirmation_'])
    assert.throws(()=>ctx[name]('anything'),/EXTERNAL_ACTION_BLOCKED/,name);
  assert.doesNotMatch(source,/UrlFetchApp\s*\.\s*fetch\s*\(/);
  assert.doesNotMatch(source,/DocumentApp\s*\.\s*(?:openById|create)\s*\(/);
  assert.doesNotMatch(source,/1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4/);
});
test('Public deployment exposes signed request routes only; legacy handler remains available privately',()=>{
  const {ctx}=context();let routed=[];
  ctx.handleOrderRequestApi_=(e,action)=>{routed.push(action);return 'signed-handler'};
  for(const action of ['order_request_capture','order_request_recover'])assert.equal(ctx.doPost({parameter:{action}}),'signed-handler');
  for(const action of ['menu','whatsapp_verified','feedback_submit','ownerOrderAccept'])
    assert.equal(JSON.parse(ctx.doPost({parameter:{action}})).error,'LEGACY_INGRESS_DISABLED_IN_TEST');
  assert.equal(routed.length,2);assert.equal(typeof ctx.mkIntegrationLegacyDoPost_,'function');
});

test('Editor publisher helpers target the current preview branch and prevent production switching or token collection in test',()=>{
  const {ctx}=context(), saved={};
  ctx.mkOrderPublishOwner_=()=>{};
  ctx.PropertiesService={getScriptProperties:()=>({setProperty:(key,value)=>{saved[key]=value}})};
  assert.equal(ctx.configureOrderingPublisherPreview().branch,'codex/order-request-capture-preview');
  assert.equal(saved.ORDER_MENU_GITHUB_BRANCH,'codex/order-request-capture-preview');
  assert.throws(()=>ctx.configureOrderingPublisherProduction(),/PRODUCTION_SWITCH_DISABLED/);
  assert.throws(()=>ctx.saveOrderingPublisherSettings(),/EXTERNAL_ACTION_BLOCKED/);
});
test('Menu adapter retains portions and descriptions while adding durable menu identities and current capacity',()=>{
  const {ctx}=context();
  ctx.orderRequestBeforeCutoff_=()=>true;
  ctx.mkMenuLines_=()=>[{itemCode:'M0001',menuLineId:'ML-20261022-M0001',cookId:'COOK-1',cookPayCents:800,capacity:50}];
  ctx.mkCommitted_=()=>({'ML-20261022-M0001':7});
  ctx.Utilities={formatDate:()=> 'Wed 21 Oct'};
  const menu=ctx.mkIntegrationEnrichMenu_({status:'ACTIVE',deliveryDate:'2026-10-22',meals:[{itemCode:'M0001',description:'Original description',portion:'500 g',price:15}]});
  assert.equal(menu.meals[0].portion,'500 g');assert.equal(menu.meals[0].description,'Original description');
  assert.equal(menu.meals[0].remainingServings,43);assert.equal(menu.meals[0].menuLineId,'ML-20261022-M0001');
  assert.equal(menu.orderDeadline,'2026-10-21T22:00:00');
  ctx.orderRequestBeforeCutoff_=()=>false;assert.equal(ctx.mkIntegrationEnrichMenu_(menu).status,'NO_ACTIVE_MENU');
});
