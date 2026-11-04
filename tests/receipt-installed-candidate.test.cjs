const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const file=process.env.RECEIPT_CANDIDATE_FILE;
function hostedFixture(){
 const props={},forbidden=()=>{throw Error('External action forbidden');};
 const runId='wrh-'+'a'.repeat(32),bookId='PRIVATE_FIXTURE',token='b'.repeat(64);
 props.MK_RCPT_HOSTED_CONFIG=JSON.stringify({version:'20261104-hosted-1',runId,bookId,token,startedAt:Date.now()-10000,expiresAt:Date.now()+600000});
 const c=vm.createContext({console:{log:()=>{}},Date,Map,Set,URL,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,getProperties:()=>({...props}),setProperty:(k,v)=>{props[k]=v;},setProperties:values=>Object.assign(props,values),deleteProperty:k=>{delete props[k];}})},
  SpreadsheetApp:{openById:forbidden},UrlFetchApp:{fetch:forbidden,fetchAll:forbidden},Sheets:{Spreadsheets:{get:forbidden,batchUpdate:forbidden}},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  Utilities:{computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF8'}}});
 vm.runInContext(fs.readFileSync(file,'utf8'),c);return {c,props,runId,bookId,token};
}
test('hosted test endpoint rejects missing/wrong capability before any fixture I/O',{skip:!file},()=>{
 const f=hostedFixture(),before=JSON.stringify(f.props);
 const call=body=>JSON.parse(f.c.handleDeliveryReceiptHostedProbe_({postData:{contents:JSON.stringify(body)}}).text);
 assert.equal(call({operation:'capture'}).ok,false);assert.equal(call({fixtureToken:'wrong',operation:'process'}).ok,false);assert.equal(JSON.stringify(f.props),before);
});
test('hosted capture persists 54 unique out-of-order receipt events only in its private namespace',{skip:!file},()=>{
 const f=hostedFixture();f.props.MK_RV2_MODE='OFF';f.props.MK_RCPT_ENABLED='false';
 const call=()=>JSON.parse(f.c.handleDeliveryReceiptHostedProbe_({postData:{contents:JSON.stringify({fixtureToken:f.token,operation:'capture'})}}).text);
 const first=call();assert.equal(first.ok,true);assert.equal(first.result.created,54);assert.equal(call().result.created,0);
 const keys=Object.keys(f.props).filter(k=>k.startsWith('MK_WRH_'));assert.equal(keys.length,54);assert(keys.every(k=>k.startsWith('MK_WRH_'+f.runId+'_MK_RCPT_EVENT_')));
 assert.equal(f.props.MK_RV2_MODE,'OFF');assert.equal(f.props.MK_RCPT_ENABLED,'false');
});
test('hosted book guard rejects the production workbook and expired configuration',{skip:!file},()=>{
 const f=hostedFixture(),config=JSON.parse(f.props.MK_RCPT_HOSTED_CONFIG);config.bookId='1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';f.props.MK_RCPT_HOSTED_CONFIG=JSON.stringify(config);assert.throws(()=>f.c.wrhConfig_(),/HOSTED_FIXTURE_NOT_READY/);
 config.bookId=f.bookId;config.expiresAt=Date.now()-1;f.props.MK_RCPT_HOSTED_CONFIG=JSON.stringify(config);assert.throws(()=>f.c.wrhConfig_(),/HOSTED_FIXTURE_NOT_READY/);
});
test('fixture-only service bindings reject other workbook IDs and restore the production guards after errors',{skip:!file},()=>{
 const f=hostedFixture();f.c.SpreadsheetApp.openById=id=>{assert.equal(id,f.bookId);return {getId:()=>id};};const originalGrid=f.c.mkReleaseGrid_,originalBatch=f.c.mkReleaseBatch_;
 assert.throws(()=>f.c.wrhWithFixture_(f.c.wrhConfig_(),()=>{assert.throws(()=>f.c.mkReleaseGrid_('OTHER',{}),/HOSTED_OTHER_BOOK_BLOCKED/);assert.throws(()=>f.c.mkReleaseBatch_({},'OTHER'),/HOSTED_OTHER_BOOK_BLOCKED/);throw Error('Expected test interruption');}),/Expected test interruption/);
 assert.equal(f.c.mkReleaseGrid_,originalGrid);assert.equal(f.c.mkReleaseBatch_,originalBatch);
});
test('hosted feedback probe uses the installed sender deferral and always clears its execution-only guard',{skip:!file},()=>{
 const f=hostedFixture();f.c.mkReleaseExternal_=()=>{};assert.equal(f.c.wrhFeedback_().deferred,'DELIVERY_PRIORITY');
 assert.equal(f.c.wrqDeliveryPending_(),false);assert.equal(f.props.MK_RCPT_ENABLED,undefined);
});
test('complete delivered Code.gs executes its owner simulation without outbound network or persisted writes',{skip:!file},()=>{
 const props={},logs=[];let reads=0;
 const forbidden=()=>{throw Error('Unexpected external action');};
 const c=vm.createContext({console:{log:x=>logs.push(x)},Date,Map,Set,URL,ScriptApp:{getScriptId:()=> '1hjXoo82Cv5bQ8a6AQibLqmD96j9FtXUtUkIsDuz_kkrf-F71nbW0XsIE'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:forbidden,setProperties:forbidden,deleteProperty:forbidden,getProperties:()=>({...props})})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>{reads++;return{getId:()=> '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4',getOwner:()=>({getEmail:()=> 'fixture@example.invalid'})};},openById:forbidden},
  Session:{getActiveUser:()=>({getEmail:()=> 'fixture@example.invalid'})},UrlFetchApp:{fetch:forbidden,fetchAll:forbidden},Sheets:{Spreadsheets:{get:forbidden,batchUpdate:forbidden}},
  Utilities:{computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF8'}}});
 vm.runInContext(fs.readFileSync(file,'utf8'),c);
 const result=c.deliveryReceiptRepairSelfTest();assert.equal(result.passed,true);assert.equal(result.simulatedUniqueSends,18);assert.equal(result.messagesSent,0);assert(reads>0);assert.equal(Object.keys(props).length,0);
 // The actual installed feedback entrypoint must defer before any business reads/sends.
 c.mkReleaseExternal_=()=>{};c.wrqDeliveryPending_=()=>true;
 assert.equal(c.runFeedbackSender().deferred,'DELIVERY_PRIORITY');
});
