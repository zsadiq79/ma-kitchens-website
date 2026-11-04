const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const file=process.env.RECEIPT_CANDIDATE_FILE;
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
