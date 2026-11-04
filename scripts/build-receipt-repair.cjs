const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Expected current Code.gs input and candidate output');
const baseline=fs.readFileSync(input,'utf8').replace(/\r\n/g,'\n');let source=baseline;
if(source.includes('const MK_RCPT='))throw Error('Receipt repair already present');
const replace=(a,b)=>{assert.equal(source.split(a).length,2,'Unexpected source for '+a.slice(0,90));source=source.replace(a,b);};
replace('    let failed = false;\n    // Process every entry/change',
 '    const queuedReceipts = verified && wrqEnabled_();\n    if (queuedReceipts) wrqCapturePayload_(payload);\n    let failed = false;\n    // Process every entry/change');
replace('if (verified) { mkMarketingStatus_(status); recordWhatsAppStatus_(status); updateWhatsAppLogFromStatus_(status); }',
 'if (verified) { if (!queuedReceipts) { mkMarketingStatus_(status); recordWhatsAppStatus_(status); updateWhatsAppLogFromStatus_(status); } }');
replace('function runFeedbackSender() {\n  mkReleaseExternal_();',
 "function runFeedbackSender() {\n  mkReleaseExternal_();\n  if (wrqDeliveryPending_()) return { enabled: true, deferred: 'DELIVERY_PRIORITY', accepted: 0 };");
replace('function runRoutificEtaQueue() {','function runRoutificEtaQueueCore_() {');
source+='\n\nfunction runRoutificEtaQueue() {\n  try { return runRoutificEtaQueueCore_(); }\n  finally { try { wrqRun_(); } catch (_) { console.log(JSON.stringify({diagnostic:"RECEIPT_WORKER_UNAVAILABLE"})); } }\n}\n';
source+='\n'+fs.readFileSync(path.join(__dirname,'../apps-script/routific-recovery/ReceiptRecovery.gs'),'utf8');
const hosted=path.join(__dirname,'../apps-script/routific-recovery/ReceiptHostedTests.gs');
if(fs.existsSync(hosted)){
 replace("    if (action === 'routific_recovery_ingest') return handleRoutificRecoveryIngress_(e);", "    if (action === 'delivery_receipt_rehearsal') return handleDeliveryReceiptHostedProbe_(e);\n    if (action === 'routific_recovery_ingest') return handleRoutificRecoveryIngress_(e);");
 source+='\n'+fs.readFileSync(hosted,'utf8');
}
new vm.Script(source);
function inspect(text){const ast=ts.createSourceFile('Code.gs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),functions=new Map(),constants=new Map();
 for(const node of ast.statements){if(ts.isFunctionDeclaration(node)){assert(!functions.has(node.name.text),'Duplicate '+node.name.text);functions.set(node.name.text,node.getText(ast));}
  if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)constants.set(d.name.getText(ast),d.initializer?.getText(ast));}return{functions,constants};}
const before=inspect(baseline),after=inspect(source),changed=[];
for(const [name,body] of before.functions){assert(after.functions.has(name),'Removed '+name);if(body!==after.functions.get(name))changed.push(name);}
assert.deepEqual(changed.sort(),['mkReleaseLegacyDoPost_','runFeedbackSender','runRoutificEtaQueue'].concat(fs.existsSync(hosted)?['doPost']:[]).sort());
for(const [name,value] of before.constants)assert.equal(after.constants.get(name),value,'Changed constant '+name);
fs.writeFileSync(output,source);console.log(JSON.stringify({parsePassed:true,sourceFunctions:before.functions.size,unchangedFunctions:before.functions.size-changed.length,changedFunctions:changed,allExistingConstantsPreserved:true,
 sourceSha256:crypto.createHash('sha256').update(baseline).digest('hex'),candidateSha256:crypto.createHash('sha256').update(source).digest('hex'),queueDefault:'OFF'}));
