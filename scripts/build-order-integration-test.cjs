const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const baseline = path.resolve(process.env.MK_INTEGRATION_BASELINE || path.join(root, 'apps-script', 'integration-baseline'));
const target = path.join(root, 'apps-script', 'integration-test');
const source = path.join(root, 'apps-script');
const testId = '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs';
const liveId = '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';
const originals = ['Code.gs', ...fs.readdirSync(baseline).filter(name => name.endsWith('.gs') && name !== 'Code.gs').sort()];
const modules = new Map(originals.map(name => [name, fs.readFileSync(path.join(baseline, name), 'utf8')]));
const context = vm.createContext({});
new vm.Script([...modules.values()].join('\n')).runInContext(context);
const changes = [];
function replaceOnce(name, before, after) {
  const text = modules.get(name), at = text.indexOf(before);
  if (at < 0 || text.indexOf(before, at + before.length) >= 0) throw new Error('Non-unique integration anchor: ' + name + ' ' + before.slice(0, 65));
  modules.set(name, text.slice(0, at) + after + text.slice(at + before.length));
}
function changeFunction(name, fn, transform) {
  const original = context[fn].toString();
  replaceOnce(name, original, transform(original));
  changes.push({file: name, function: fn});
}
function insert(fn, text) { return fn.replace(/\{/, '{\n' + text + '\n'); }

// Keep the original dispatcher and routes behind a test-only public boundary.
changeFunction('Code.gs', 'doGet', old => old.replace('function doGet(', 'function mkIntegrationLegacyDoGet_('));
changeFunction('Code.gs', 'doPost', old => old.replace('function doPost(', 'function mkIntegrationLegacyDoPost_('));
changeFunction('Code.gs', 'oeBook_', old => old.replace(liveId, testId).replace('Session.getEffectiveUser()', 'Session.getActiveUser()'));
changeFunction('Code.gs', 'buildActiveMenu_', old => old.replace('function buildActiveMenu_(', 'function mkIntegrationOriginalMenu_('));
changeFunction('Code.gs', 'nextOrderId_', () => 'function nextOrderId_(ordersSheet) { return mkIntegrationNextOrderId_(ordersSheet); }');
changeFunction('Code.gs', 'oeCommitRequests_', old => old.replace('  return requests;',
  "  requests.push(...mkIntegrationLegacySnapshots_(b,p.cart,p.menu,c,p.quote,orderRow,itemRows,'OE-'+p.draftId));\n  return requests;"));
changeFunction('Code.gs', 'orderEntryPlaceOrder', old => old
  .replace('    let m=oeMeta_(s);', "    mkIntegrationAssertNoPending_(b,'legacy');\n    let m=oeMeta_(s);")
  .replace('const orderRow=oeEmptyRows_(ov,1,2,[0,1,2,3,8,9,10,13])[0];', 'const orderRow=mkEmptyRows_(mkTable_(b,ORDERS_SHEET),1,[1,2,3,4,9,10,11,14,26,27,28,29,30,31,32,33,34,35,36,37],2,2000)[0];')
  .replace('const itemRows=oeEmptyRows_(items.getRange(3,1,items.getMaxRows()-2,18).getDisplayValues(),Object.keys(p.cart.items).length,3,[0,3,6,13,17]);', 'const itemRows=mkEmptyRows_(mkTable_(b,ORDER_ITEMS_SHEET),Object.keys(p.cart.items).length,[1,4,7,14,18,23,24,25,26,27,28,29,30],3,5000);')
  .replace('if(created)oeSendConfirmation_(b,s,false);', "if(created)oeStatus_(b,s,'Order saved in TEST. Copy the confirmation from the sheet. External sending is blocked.');"));
changeFunction('Code.gs', 'oeSendConfirmation_', old => insert(old, '  mkIntegrationNoExternal_();'));
// Do not let old setup rewrite the snapshot-aware shared arrays.
changeFunction('Code.gs', 'oeAddressSetup_', old => insert(old, "  if(b.getSheetByName(ORDERS_SHEET).getMaxColumns()<37 || b.getSheetByName(ORDER_ITEMS_SHEET).getMaxColumns()<30) throw new Error('Initialize the integrated workspace first.'); return;"));
changeFunction('Code.gs', 'oeItemSetup_', old => insert(old, "  if(b.getSheetByName(ORDERS_SHEET).getMaxColumns()<37 || b.getSheetByName(ORDER_ITEMS_SHEET).getMaxColumns()<30) throw new Error('Initialize the integrated workspace first.'); return;"));
// The WhatsApp cart writer still exists for owner simulation, with shared
// pending-operation barriers, row selection and historical snapshots.
changeFunction('Code.gs', 'createControlTowerOrder_', old => {
  let next = old.replace('  const orderId = nextOrderId_(ordersSheet);', "  mkIntegrationAssertNoPending_(spreadsheet,'whatsapp');\n  const orderId = nextOrderId_(ordersSheet);");
  next = next.replace('  const orderRow = firstEmptyRowInColumn_(ordersSheet, 1, 2);',
    '  const orderRow = mkEmptyRows_(mkTable_(spreadsheet,ORDERS_SHEET),1,[1,2,3,4,9,10,11,14,26,27,28,29,30,31,32,33,34,35,36,37],2,2000)[0];');
  const before = /    let itemRow = firstEmptyRowInColumn_\([\s\S]*?\n    \);/;
  if (!before.test(next)) throw new Error('WhatsApp item allocation anchor missing');
  next = next.replace(before, '    const allocatedItemRows = mkEmptyRows_(mkTable_(spreadsheet,ORDER_ITEMS_SHEET),Object.keys(cart.items).length,[1,4,7,14,18,23,24,25,26,27,28,29,30],3,5000);\n    const snapshots = mkIntegrationLegacySnapshots_(spreadsheet,cart,menu,customer,quote,orderRow,allocatedItemRows,"WA-"+orderId);\n    let itemRow = allocatedItemRows[0], allocatedIndex = 0;');
  next = next.replace('      itemRow++;', '      itemRow = allocatedItemRows[++allocatedIndex];');
  next = next.replace('    if (touchedItemRows.length === 0)', '    Sheets.Spreadsheets.batchUpdate({requests:snapshots},spreadsheet.getId());\n\n    if (touchedItemRows.length === 0)');
  return next;
});
changeFunction('Code.gs', 'clearOrderInputCells_', old => insert(old, '  ordersSheet.getRange(rowNumber,31,1,7).clearContent();'));
changeFunction('Code.gs', 'clearOrderItemInputCells_', old => insert(old, '  orderItemsSheet.getRange(rowNumber,23,1,8).clearContent();'));
// Block before any provider attempt or enabling production configuration.
for (const [name, text] of [...modules]) {
  if (name === 'FeedbackProductionConfig.gs') for (const match of text.matchAll(/^function\s+(\w+)\s*\(/gm))
    changeFunction(name, match[1], old => insert(old, '  mkIntegrationNoExternal_();'));
}
for (const [name, fn] of [['Routific.gs','sendConfirmedOrdersToRoutific'], ['FeedbackSender.gs','runFeedbackSender'], ['FeedbackSender.gs','enableFeedbackLive'], ['FeedbackSender.gs','installFeedbackAutomation'], ['FeedbackWebSender.gs','runFeedbackWebSender_'],
    ['PackingSlips.gs','generatePackingSlips'], ['PackingSlips.gs','setupPackingSlips'], ['PackingSlips.gs','rebuildPackingSlipsTemplate']]) {
  if (typeof context[fn] === 'function') changeFunction(name, fn, old => insert(old, '  mkIntegrationNoExternal_();'));
}
// Preserve original module boundaries in the consolidated source.
const originalEvidence = originals.map(name => ({name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(baseline,name))).digest('hex'),
  lines: fs.readFileSync(path.join(baseline,name),'utf8').split('\n').length}));
const added = ['OrderEngine.gs', 'OrderRequests.gs', 'OwnerOrders.gs', 'OwnerCustomers.gs', 'OwnerOrderSetup.gs', 'OrderingMenuPublisher.gs'];
for (const name of added) modules.set(name, fs.readFileSync(path.join(source, name), 'utf8'));
modules.set('OwnerOrders.gs', modules.get('OwnerOrders.gs').replace('    const orderId = mkNextOrderId_(orders, journal),',
  "    mkIntegrationAssertNoPending_(book,'owner');\n    const orderId = mkIntegrationNextOrderId_(orders.sheet),"));
modules.set('OwnerOrderSetup.gs', modules.get('OwnerOrderSetup.gs').replace("trigger.getHandlerFunction() !== 'orderRequestInboxOnOpen_'",
  "!['orderRequestInboxOnOpen_', 'orderEntryMenu', 'orderEntryEdited', 'showPackingSlipsMenu_'].includes(trigger.getHandlerFunction()) || trigger.getTriggerSourceId() !== MK_INTEGRATION_TEST_ID"));
// All service boundaries below are rewritten, including low-level helpers.
for (const [name, input] of modules) {
  const output = input.replaceAll(liveId, testId)
    .replace(/SpreadsheetApp\s*\.\s*openById\s*\(/g, 'mkIntegrationOpenBook_(')
    .replace(/SpreadsheetApp\s*\.\s*getActiveSpreadsheet\s*\(/g, 'mkIntegrationActiveBook_(')
    .replace(/Sheets\s*\.\s*Spreadsheets\s*\.\s*batchUpdate\s*\(/g, 'mkIntegrationBatch_(')
    .replace(/UrlFetchApp\s*\.\s*fetch\s*\(/g, 'mkIntegrationFetch_(')
    .replace(/ScriptApp\s*\.\s*newTrigger\s*\(/g, 'mkIntegrationNewTrigger_(')
    .replace(/DocumentApp\s*\.\s*openById\s*\(/g, 'mkIntegrationDocumentOpen_(')
    .replace(/DocumentApp\s*\.\s*create\s*\(/g, 'mkIntegrationDocumentCreate_(')
    .replace(/DriveApp\s*\.\s*getFileById\s*\(/g, 'mkIntegrationDriveFile_(');
  modules.set(name, output);
}
modules.set('IntegrationTestGuards.gs', fs.readFileSync(path.join(source, 'IntegrationTestGuards.gs'), 'utf8'));
const dispatcher = `
function buildActiveMenu_() { return mkIntegrationEnrichMenu_(mkIntegrationOriginalMenu_()); }
function doGet(e) {
  try { mkIntegrationRequireTest_(); return orderRequestJson_({ok:true,environment:'TEST',externalActions:'BLOCKED'}); }
  catch (_) { return orderRequestJson_({ok:false,error:'TEST_CONFIGURATION_REQUIRED'}); }
}
function doPost(e) {
  try {
    mkIntegrationRequireTest_();
    const action = e && e.parameter && e.parameter.action;
    if (action === 'order_request_capture' || action === 'order_request_recover') return handleOrderRequestApi_(e,action);
    // Legacy dispatcher retained for owner-only simulation, never anonymous ingress.
    return orderRequestJson_({ok:false,error:'LEGACY_INGRESS_DISABLED_IN_TEST'});
  } catch (_) { return orderRequestJson_({ok:false,error:'TEST_CONFIGURATION_REQUIRED'}); }
}
function simulateLegacyPostInTest(event) {
  mkOwnerBook_();
  return mkIntegrationLegacyDoPost_(event);
}
function integrationTestMenus() {
  mkOwnerBook_(); orderRequestInboxOnOpen_(); orderEntryMenu(); showPackingSlipsMenu_();
}
`;
modules.set('IntegrationDispatcher.gs', dispatcher);
const output = '/* INTEGRATED TEST ONLY. Includes all 12 supplied original modules and new order modules.\n' +
  ' * Replace all .gs files in the TEST project with this single Code.gs only.\n * No production deployment. Network and document operations are blocked.\n */\n' +
  [...modules].map(([name, text]) => '\n// ==================== SOURCE: ' + name + ' ====================\n' + text).join('\n');
const names = [...output.matchAll(/^function\s+(\w+)\s*\(/gm)].map(match => match[1]);
if (new Set(names).size !== names.length) throw new Error('Duplicate function names');
new vm.Script(output, {filename:'Integrated-Code.gs'}).runInNewContext({});
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'Code.gs'),output);
fs.copyFileSync(path.join(source,'OwnerOrderWorkspace.html'),path.join(target,'OwnerOrderWorkspace.html'));
fs.copyFileSync(path.join(source,'appsscript.test.json'),path.join(target,'appsscript.json'));
fs.writeFileSync(path.join(target,'source-manifest.json'),JSON.stringify({environment:'TEST',testSpreadsheet:testId,originalModules:originalEvidence,
  originalFunctionChanges:changes,addedModules:[...added,'IntegrationTestGuards.gs','IntegrationDispatcher.gs'],functions:names.length,
  lines:output.split('\n').length,codeSha256:crypto.createHash('sha256').update(output).digest('hex'),
  limitations:['Current editor publisher setup helpers and original manifest were not supplied.','Document generation and all network calls are blocked. Packing data and preview remain testable.','Runtime Google authorization and browser end-to-end tests remain pending.']},null,2));
console.log(JSON.stringify({originalModules:originals.length,totalFunctions:names.length,lines:output.split('\n').length,bytes:Buffer.byteLength(output)}));
