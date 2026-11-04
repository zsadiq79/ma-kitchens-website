const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/build-routific-recovery.cjs original-Code.gs output-Code.gs');
let source=fs.readFileSync(input,'utf8').replace(/\r\n/g,'\n');
if(source.includes('const MK_RV2='))throw Error('Input already contains the recovery module. Use the preserved baseline.');
const replaceOnce=(from,to)=>{if(source.split(from).length!==2)throw Error('Unexpected source shape: '+from.slice(0,80));source=source.replace(from,to);};
replaceOnce("function doPost(e) {\n  try {\n    mkReleaseBinding_(false);\n    const action = e && e.parameter && e.parameter.action;",
  "function doPost(e) {\n  try {\n    mkReleaseBinding_(false);\n    const action = e && e.parameter && e.parameter.action;\n    if (action === 'routific_recovery_ingest') return handleRoutificRecoveryIngress_(e);");
replaceOnce('function runRoutificEtaQueue() {',"function runRoutificEtaQueue() {\n  if (rv2Mode_() !== 'OFF') return runRoutificRecoveryWorker_();");
replaceOnce("    const restrictedEtaResult = mkEtaTestWebhook_(payload);",`    if (rv2Mode_() !== 'OFF' && ['route.published','route.eta_updated','order.status_updated'].includes(payload.type)) {
      return orderRequestJson_(rv2Accept_({version:1,key:fwHash_(JSON.stringify(payload)),receivedAt:new Date().toISOString(),payload:payload}));
    }
    const restrictedEtaResult = mkEtaTestWebhook_(payload);`);
replaceOnce("['runFeedbackSender', 'runRoutificEtaQueue', 'runRoutificEtaRestrictedTest'].includes(trigger.handler)",
  "['runFeedbackSender', 'runRoutificEtaQueue', 'runRoutificEtaRestrictedTest', 'runWeeklyMarketing'].includes(trigger.handler)");
const moduleText=['DeliveryRecovery.gs','RecoveryTestControls.gs','ReadOnlyInspection.gs'].concat(fs.existsSync(path.resolve(__dirname,'../apps-script/routific-recovery/RouteAudit.gs'))?['RouteAudit.gs']:[]).map(name=>fs.readFileSync(path.resolve(__dirname,'../apps-script/routific-recovery/'+name),'utf8')).join('\n\n');
// Receipts need the feedback message ledger, not links, answers or operational schema.
replaceOnce("const schema = fwSchema_(book); const matches = schema.orders.rows.map((r,i) => ({row:r.slice(),number:i+2})).filter(x => x.row[16] === status.id);",
  "const feedbackOrders = fwTable_(book, FW.orders, FW.orderHeaders); if (FW.orderHeaders.some((h,i) => feedbackOrders.headers[i] !== h)) fwError_('CONFIGURATION_ERROR'); const matches = feedbackOrders.rows.map((r,i) => ({row:r.slice(),number:i+2})).filter(x => x.row[16] === status.id);");
replaceOnce("if (matches.length && index) { const r = matches[0].row, i = index + 13; if (!Number.isFinite(fwTime_(r[i])) || eventAt.getTime() < fwTime_(r[i])) r[i] = eventAt.toISOString(); requests.push(fwUpdate_(schema.orders.sheet, matches[0].number, r)); }",
  "if (matches.length && index) { const r = matches[0].row, i = index + 13; if (!Number.isFinite(fwTime_(r[i])) || eventAt.getTime() < fwTime_(r[i])) { r[i] = eventAt.toISOString(); requests.push(fwCell_(feedbackOrders.sheet, matches[0].number, i, r[i])); } }");
source+='\n\n'+moduleText;
new vm.Script(source);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,source);
console.log(JSON.stringify({output,parsePassed:true,defaultMode:'OFF',baselineSha256:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),
  resultSha256:crypto.createHash('sha256').update(source).digest('hex')}));
