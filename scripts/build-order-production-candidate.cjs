/* Builds a separate release pair from the supplied modules. Never edits TEST. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const root = path.join(__dirname, '..'), source = path.join(root, 'apps-script'), baseline = path.join(source, 'integration-baseline');
const liveId = '1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4';
const profiles = [
  { folder:'production-rehearsal', environment:'REHEARSAL', spreadsheetId:'1aMJuPNJM2vVEeSlMZx8LIdkwSCKqd-_FojZelZ87RSs', scriptId:'1bf4ZUVw5ugJt3PiDBpRTLG_bdfTkuzSEtB8vpfcPjkfLseESaD-e_Tf5' },
  { folder:'production-candidate', environment:'PRODUCTION', spreadsheetId:liveId, scriptId:'1hjXoo82Cv5bQ8a6AQibLqmD96j9FtXUtUkIsDuz_kkrf-F71nbW0XsIE' }
];
const originals = ['Code.gs', ...fs.readdirSync(baseline).filter(name => name.endsWith('.gs') && name !== 'Code.gs').sort()];
const shared = ['OrderEngine.gs','OrderRequests.gs','OwnerOrders.gs','OwnerCustomers.gs','OwnerOrderSetup.gs','OrderingMenuPublisher.gs'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const insert = (fn, text) => fn.replace(/\{/, '{\n' + text + '\n');
const namesIn = text => [...text.matchAll(/^function\s+(\w+)\s*\(/gm)].map(match => match[1]);

for (const profile of profiles) {
  const modules = new Map([...originals.map(name => [name,fs.readFileSync(path.join(baseline,name),'utf8')]),
    ...shared.map(name => [name,fs.readFileSync(path.join(source,name),'utf8')])]);
  const context = vm.createContext({}); new vm.Script([...modules.values()].join('\n')).runInContext(context);
  const changes = [];
  function change(name, fn, transform) {
    if (typeof context[fn] !== 'function') throw new Error('Missing original function ' + fn);
    const before = context[fn].toString(), text = modules.get(name), at = text.indexOf(before);
    if (at < 0 || text.indexOf(before,at+before.length) >= 0) throw new Error('Non-unique release anchor ' + fn);
    const after = transform(before); new vm.Script('(' + after + ')');
    if (after === before) throw new Error('Release transform did not change its anchor: ' + fn);
    modules.set(name,text.slice(0,at)+after+text.slice(at+before.length)); changes.push({file:name,function:fn});
  }
  change('Code.gs','doGet',fn => fn.replace('function doGet(', 'function mkReleaseLegacyDoGet_('));
  change('Code.gs','doPost',fn => fn.replace('function doPost(', 'function mkReleaseLegacyDoPost_('));
  change('Code.gs','oeBook_',fn => fn.replace('Session.getEffectiveUser()', 'Session.getActiveUser()'));
  for (const fn of ['orderEntrySetup','orderEntryNewDraft','oeNewDraft_','orderEntryLoadCustomer','orderEntryReview','orderEntryResendConfirmation'])
    change('Code.gs',fn,old => insert(old,'  mkReleaseLegacyEntry_();'));
  change('Code.gs','orderEntryMenu',fn => insert(fn,"  if (['ACTIVE','PAUSED','ACTIVATING'].includes(mkReleasePhase_())) return orderRequestInboxOnOpen_();"));
  change('Code.gs','orderEntryEdited',fn => insert(fn,"  if (['ACTIVE','PAUSED','MIGRATING','ACTIVATING'].includes(mkReleasePhase_())) return;"));
  change('Code.gs','buildActiveMenu_',fn => fn.replace('function buildActiveMenu_(', 'function mkReleaseOriginalMenu_(')
    .replace('    eligibleRows.push({',"    if(!orderRequestBeforeCutoff_(Utilities.formatDate(deliveryDate,timeZone,'yyyy-MM-dd'),new Date()))continue;\n    eligibleRows.push({"));
  change('Code.gs','nextOrderId_',() => 'function nextOrderId_(ordersSheet) { return mkReleaseNextOrderId_(ordersSheet); }');
  change('Code.gs','oeMeta_',() => `function oeMeta_(s) {
  const values=mkOwnerFreshValues_(s.getParent(),s,1,18,11);
  return Array.from({length:18},(_,index)=>String((values[index]||[])[10]??''));
}`);
  const freshOrders = "mkOwnerFreshValues_(b,orders,2,orders.getMaxRows()-1,14).map(row=>row.map(value=>String(value??'')))";
  change('Code.gs','oeCheckLocked_',fn => fn.replace('orders.getRange(2,1,orders.getMaxRows()-1,14).getDisplayValues()',freshOrders)
    .replace('orders.getRange(matches[0].row,12,1,19).getValues()[0]',"(mkOwnerFreshValues_(b,orders,matches[0].row,1,30)[0]||[]).slice(11,30)"));
  change('Code.gs','orderEntryRecoverSubmission',fn => fn.replace('orders.getRange(2,1,orders.getMaxRows()-1,14).getDisplayValues()',freshOrders)
    .replace('items.getRange(3,1,items.getMaxRows()-2,18).getDisplayValues()',"mkOwnerFreshValues_(b,items,3,items.getMaxRows()-2,18).map(row=>row.map(value=>String(value??'')))"));
  change('Code.gs','oeCommitRequests_',fn => fn.replace('  return requests;',"  if(mkReleaseSchemaReady_()) requests.push(...mkReleaseLegacySnapshots_(b,p.cart,p.menu,c,p.quote,orderRow,itemRows,'OE-'+p.draftId));\n  return requests;"));
  change('Code.gs','orderEntryPlaceOrder',fn => insert(fn,'  mkReleaseLegacyEntry_();')
    .replace('    let m=oeMeta_(s);',"    mkReleaseAssertWriter_(b,'legacy');\n    let m=oeMeta_(s);")
    .replace('orders.getRange(2,1,orders.getMaxRows()-1,14).getDisplayValues()',freshOrders)
    .replace('const orderRow=oeEmptyRows_(ov,1,2,[0,1,2,3,8,9,10,13])[0];',"const orderRow=mkReleaseSchemaReady_()?mkEmptyRows_(mkTable_(b,ORDERS_SHEET),1,[1,2,3,4,9,10,11,14,26,27,28,29,30,31,32,33,34,35,36,37],2,2000)[0]:oeEmptyRows_(ov,1,2,[0,1,2,3,8,9,10,13])[0];")
    .replace('const itemRows=oeEmptyRows_(items.getRange(3,1,items.getMaxRows()-2,18).getDisplayValues(),Object.keys(p.cart.items).length,3,[0,3,6,13,17]);',"const itemRows=mkReleaseSchemaReady_()?mkEmptyRows_(mkTable_(b,ORDER_ITEMS_SHEET),Object.keys(p.cart.items).length,[1,4,7,14,18,23,24,25,26,27,28,29,30],3,5000):oeEmptyRows_(items.getRange(3,1,items.getMaxRows()-2,18).getDisplayValues(),Object.keys(p.cart.items).length,3,[0,3,6,13,17]);"));
  for (const fn of ['oeAddressSetup_','oeItemSetup_']) change('Code.gs',fn,old => insert(old,'  if(mkReleaseSchemaReady_()) { mkAssertOperationalLayout_(b); return; }'));
  change('Code.gs','placeOrder_',fn => insert(fn,'  if(mkReleaseResumeCart_(recipient)) return;')
    .replace('    cart = getCart_(recipient);',"    cart = getCart_(recipient);\n    mkReleaseAssertWriter_(mkReleaseOpenBook_(CONTROL_TOWER_SPREADSHEET_ID),'whatsapp',cart && cart.orderOperationId);")
    .replace('let customer = findCustomerByPhone_(orderCustomerPhone);', 'let customer = mkReleaseSchemaReady_()?mkReleaseCartCustomer_(recipient,cart):findCustomerByPhone_(orderCustomerPhone);')
    .replace('    updateCustomerDefaultAddress_(\n      customer.customerId,', '    if(!mkReleaseSchemaReady_()) updateCustomerDefaultAddress_(\n      customer.customerId,')
    .replace('    if (quote.totalQty < quote.minimumOrderItems) {',"    if(mkReleaseSchemaReady_() && (!cart.quote || Math.round(Number(cart.quote.total)*100)!==Math.round(quote.total*100))) {\n      sendFinalConfirmation_(recipient); return;\n    }\n    if (quote.totalQty < quote.minimumOrderItems) {"));
  change('Code.gs','oeCustomerForCommit_',fn => insert(fn,`  if(mkReleaseSchemaReady_()) {
    const result=mkReleaseSaveCustomerCore_(b,{senderPhone:p.cart.orderCustomerPhone,customerId:p.customer?p.customer.id:'',name:p.draft.name,
      address:p.cart.deliveryAddress,postcode:p.draft.postcode,instructions:p.draft.instructions,
      consent:p.draft.consent==='Keep existing'?'KEEP':p.draft.consent==='Yes'?'YES':'NO',updateDefault:false},p.draftId);
    if(result.status!=='READY')throw new Error(result.message||'Customer recalculation is pending. Retry the same draft.');
    return Object.assign({},result.customer,{row:result.customer.rowNumber});
  }`));
  change('Code.gs','createControlTowerOrder_',fn => {
    let next = fn.replace('  const orderId = nextOrderId_(ordersSheet);',"  mkReleaseAssertWriter_(spreadsheet,'whatsapp',cart.orderOperationId);\n  if(mkReleaseSchemaReady_()) return mkReleaseCreateCartOrder_(recipient,cart,menu,customer,quote);\n  const orderId = nextOrderId_(ordersSheet);");
    return next;
  });
  change('Code.gs','calculateCartQuote_',fn => fn.replace('function calculateCartQuote_(', 'function mkReleaseOriginalCartQuote_('));
  change('Code.gs','validateCartAvailability_',fn => insert(fn,"  if(!cart || !cart.items || Array.isArray(cart.items) || Object.values(cart.items).some(value=>!Number.isSafeInteger(Number(value)) || Number(value)<1 || Number(value)>999)) return 'Check dish selections and whole number quantities.';"));
  change('Code.gs','clearOrderInputCells_',fn => insert(fn,'  if(mkReleaseSchemaReady_()) ordersSheet.getRange(rowNumber,31,1,7).clearContent();'));
  change('Code.gs','clearOrderItemInputCells_',fn => insert(fn,'  if(mkReleaseSchemaReady_()) orderItemsSheet.getRange(rowNumber,23,1,8).clearContent();'));
  change('PackingSlips.gs','collectPackingSlipData_',fn => fn
    .replace("    orderStatus: headerIndex_(orderHeaders, 'Order Status'),","    orderStatus: headerIndex_(orderHeaders, 'Order Status'),\n    orderCheck: optionalHeaderIndex_(orderHeaders,'Order Check'),")
    .replace('    const orderDeliveryDate =',"    if(orderCol.orderCheck>=0 && String(row[orderCol.orderCheck]).trim()!=='OK')continue;\n    const orderDeliveryDate =")
    .replace('    const customerName =','    if(totalPacks<=0)continue;\n    const customerName ='));
  change('PackingSlips.gs','cleanDeliveryNote_',fn => fn.replace(".replace(/\\r\\n/g, '\\n')", ".replace(/\\r\\n/g, '\\n').replace(/^(?:OWN-REV-[a-f0-9-]{36}|Order Entry draft [a-f0-9-]{36})(?:\\s*\\|\\s*(?:Delivery instructions:\\s*)?)?/i,'')"));
  change('PermanentWhatsAppLog.gs','whatsappLogStatusRank_',fn => fn.replace("case 'sent':\n      return 1;","case 'sent':\n      return 2;").replace("case 'delivered':\n      return 2;","case 'delivered':\n      return 3;").replace("case 'read':\n      return 3;","case 'read':\n      return 4;").replace("case 'failed':\n      return 4;","case 'failed':\n      return 1;"));
  change('FeedbackWeb.gs','fwOrder_',fn => fn
    .replace("const rows = menu.rows.filter(m => value(menu, m, 'Item Code') === code); if (rows.length !== 1) fwError_('CONFIGURATION_ERROR');\n    const m = rows[0]; seen.add(code);","const rows = menu.rows.filter(m => value(menu,m,'Item Code') === code);\n    const snapshotted = value(items,r,'Cook ID (SNAPSHOT)') && value(items,r,'Kitchen Name (SNAPSHOT)') && value(items,r,'Dish Name');\n    if(rows.length > 1 || (!snapshotted && rows.length !== 1)) fwError_('CONFIGURATION_ERROR');\n    const m = rows[0] || []; seen.add(code);")
    .replace("dishName: fwString_(value(menu, m, 'Dish Name'), 160, 1), kitchenName: fwString_(value(menu, m, 'Menu Kitchen Name'), 160)","dishName: fwString_(value(items,r,'Dish Name') || value(menu,m,'Dish Name'),160,1), kitchenName: fwString_(value(items,r,'Kitchen Name (SNAPSHOT)') || value(menu,m,'Menu Kitchen Name'),160)")
    .replace("cookId: value(menu, m, 'Cook ID')","cookId: value(items,r,'Cook ID (SNAPSHOT)') || value(menu,m,'Cook ID')"));
  change('FeedbackWeb.gs','fwPrimeWebReads_',fn => fn.replace("'Qty'],\n    'Dishes'", "'Qty'].concat(mkReleaseSchemaReady_()?['Dish Name','Cook ID (SNAPSHOT)','Kitchen Name (SNAPSHOT)']:[]),\n    'Dishes'"));
  // The rehearsal stops enabling/configuration helpers before even a property or sheet write.
  for (const [name,text] of [...modules]) if (name === 'FeedbackProductionConfig.gs')
    for (const fn of namesIn(text)) change(name,fn,old => insert(old,'  mkReleaseExternal_();'));
  for (const [name,fn] of [['Routific.gs','sendConfirmedOrdersToRoutific'],['FeedbackSender.gs','runFeedbackSender'],['FeedbackSender.gs','enableFeedbackLive'],
    ['FeedbackSender.gs','installFeedbackAutomation'],['FeedbackWebSender.gs','runFeedbackWebSender_'],['PackingSlips.gs','generatePackingSlips'],
    ['PackingSlips.gs','setupPackingSlips'],['PackingSlips.gs','rebuildPackingSlipsTemplate'],['Code.gs','oeSendConfirmation_']])
    change(name,fn,old => insert(old,'  mkReleaseExternal_();'));

  change('OwnerOrders.gs','mkOwnerBook_',() => `function mkOwnerBook_() {
  const book=orderRequestInboxOwnerBook_(); mkReleaseOwnerReady_(); return book;
}`);
  modules.set('OwnerOrders.gs', modules.get('OwnerOrders.gs').replace("  testBookId: '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs',",'  bookId: MK_RELEASE.spreadsheetId,')
    .replace("if (book.getId() !== MK_OWNER.testBookId) throw new Error('Fresh owner reads require the TEST workbook.');",'mkReleaseCheckBook_(book.getId());')
    .replace('Run the test workspace setup.','Run the workspace migration.'));
  change('OwnerOrders.gs','ownerOrderAccept',fn => insert(fn,'  mkReleaseNewOwnerWrite_();')
    .replace('    const orderId = mkNextOrderId_(orders, journal),',"    mkReleaseAssertWriter_(book,'owner');\n    const orderId = mkReleaseNextOrderId_(orders.sheet),"));
  for (const [name,fn] of [['OwnerOrders.gs','ownerOrderReview'],['OrderRequests.gs','orderRequestMarkReceived']])
    change(name,fn,old => insert(old,'  mkReleaseNewOwnerWrite_();'));
  change('OwnerCustomers.gs','ownerOrderSaveCustomer',fn => fn.replace('function ownerOrderSaveCustomer(input, operationId)', 'function mkReleaseSaveCustomerCore_(book, input, operationId)')
    .replace('  const book = mkOwnerBook_();','  mkReleaseCheckBook_(book.getId());'));
  change('OwnerOrders.gs','ownerOrderRecover',fn => fn.replace('mkTable_(book, ORDERS_SHEET), items = mkTable_(book, ORDER_ITEMS_SHEET)', 'mkTable_(book, ORDERS_SHEET, true), items = mkTable_(book, ORDER_ITEMS_SHEET, true)'));
  change('OwnerOrders.gs','mkOwnerReconcile_',fn => fn
    .replace("String(line[22]) === item.itemCode && String(line[25]) === item.cookId && Number(line[6]) === item.quantity", "String(line[22]) === item.itemCode && String(line[25]) === item.cookId && String(line[26]) === item.kitchenName && String(line[3]) === item.dishName && Number(line[6]) === item.quantity")
    .replace("const okay = snapshotsOK && String(current[8])", "const okay = snapshotsOK && String(current[3]) === review.details.customerId && mkReleaseDeliveryDate_(current[2]) === review.deliveryDate && mkReleasePricingMatches_(current,review.quote) && String(current[8])"));
  change('OwnerOrderSetup.gs','setupOwnerOrderWorkspace',()=> 'function setupOwnerOrderWorkspace() { return migrateOrderAutomationWorkspace(); }');
  change('OwnerOrderSetup.gs','mkOwnerRowFormulaRequests_',fn => fn.replace('  const requests = [];',`  const requests = [];
  for (const column of [16,17]) {
    const current = orders.getRange(orderRow,column).getFormula();
    requests.push(mkFormulaCell_(orders,orderRow,column,mkReleaseZeroCancelledCharge_(current,orderRow)));
  }`).replace('    const unit = items.getRange(row, 10).getFormula(), total = items.getRange(row, 12).getFormula();',
    `    const label = items.getRange(row,8).getFormula();
    requests.push(mkFormulaCell_(items,row,8,mkReleaseDiscountLabelFormula_(label)));
    const unit = items.getRange(row, 10).getFormula(), total = items.getRange(row, 12).getFormula();`));
  change('OrderRequests.gs','setupOrderRequestWorkspace',()=> 'function setupOrderRequestWorkspace() { return migrateOrderAutomationWorkspace(); }');
  change('OrderRequests.gs','orderRequestOwner_',()=> 'function orderRequestOwner_() { mkReleaseOwnerBook_(false); }');
  change('OrderRequests.gs','orderRequestInboxOnOpen_',old => insert(old,"  if(!['ACTIVE','PAUSED'].includes(mkReleasePhase_())) return;")
    .replace('    .addToUi();','    .addToUi();\n  showPackingSlipsMenu_();'));
  change('OrderRequests.gs','orderRequestCapture_',old => insert(old,"  mkReleaseCaptureGate_('order_request_capture');"));
  change('OrderRequests.gs','orderRequestRecover_',old => insert(old,"  mkReleaseCaptureGate_('order_request_recover');"));
  change('OrderingMenuPublisher.gs','mkOrderPublishOwner_',()=> 'function mkOrderPublishOwner_() { mkReleaseOwnerBook_(false); }');
  change('OrderingMenuPublisher.gs','configureOrderingPublisherProduction',()=>`function configureOrderingPublisherProduction() {
  mkReleaseOwnerBook_(false); mkReleaseExternal_();
  PropertiesService.getScriptProperties().setProperty('ORDER_MENU_GITHUB_BRANCH','main');
  return {ok:true,branch:'main'};
}`);
  change('OrderingMenuPublisher.gs','saveOrderingPublisherSettings',old => insert(old,'  mkReleaseExternal_();')
    .replace('ORDER_MENU_GITHUB_BRANCH: MK_ORDER_PUBLISH.branch',"ORDER_MENU_GITHUB_BRANCH: props.getProperty('ORDER_MENU_GITHUB_BRANCH') || MK_ORDER_PUBLISH.branch"));
  change('OrderingMenuPublisher.gs','publishCurrentOrderingMenu',old => insert(old,"  mkReleaseExternal_();\n  if(!mkReleaseSchemaReady_()) return mkReleasePublishLegacyMenu_(false);"));
  change('OrderingMenuPublisher.gs','withdrawPublishedOrderingMenu',old => insert(old,"  mkReleaseExternal_();\n  if(!mkReleaseSchemaReady_()) return mkReleasePublishLegacyMenu_(true);"));
  change('OrderingMenuPublisher.gs','mkOrderWriteSnapshot_',old => insert(old,'  mkReleaseExternal_();')
    .replace("  if (branch === 'main') throw new Error('PREVIEW_BUILD_CANNOT_WRITE_PRODUCTION_BRANCH');", "  if (MK_RELEASE.environment !== 'PRODUCTION') throw new Error('REHEARSAL_EXTERNAL_ACTION_BLOCKED');"));
  modules.set('OrderingMenuPublisher.gs',modules.get('OrderingMenuPublisher.gs').replace("branch: 'codex/order-request-capture-preview'", "branch: 'main'"));
  // These functions are pure reviewed adapters, reused without TEST service guards.
  const adapters = vm.createContext({}); new vm.Script(fs.readFileSync(path.join(source,'IntegrationTestGuards.gs'),'utf8')).runInContext(adapters);
  const compatible = ['mkIntegrationLegacySnapshots_','mkIntegrationEnrichMenu_'].map(name => adapters[name].toString()
    .replaceAll('mkIntegrationLegacySnapshots_','mkReleaseLegacySnapshots_').replaceAll('mkIntegrationEnrichMenu_','mkReleaseEnrichMenu_')
    .replaceAll('mkIntegrationOpenBook_','mkReleaseOpenBook_')).join('\n\n');
  modules.set('OrderReleaseAdapters.gs',compatible);
  modules.set('OrderReleaseCommerce.gs',fs.readFileSync(path.join(source,'OrderReleaseCommerce.gs'),'utf8'));
  for (const [name,input] of modules) {
    modules.set(name,input.replaceAll(liveId,profile.spreadsheetId)
      .replace(/SpreadsheetApp\s*\.\s*openById\s*\(/g,'mkReleaseOpenBook_(')
      .replace(/SpreadsheetApp\s*\.\s*getActiveSpreadsheet\s*\(/g,'mkReleaseActiveBook_(')
      .replace(/Sheets\s*\.\s*Spreadsheets\s*\.\s*batchUpdate\s*\(/g,'mkReleaseBatch_(')
      .replace(/Sheets\s*\.\s*Spreadsheets\s*\.\s*Values\s*\.\s*batchGet\s*\(/g,'mkReleaseBatchValues_(')
      .replace(/Sheets\s*\.\s*Spreadsheets\s*\.\s*Values\s*\.\s*get\s*\(/g,'mkReleaseValues_(')
      .replace(/Sheets\s*\.\s*Spreadsheets\s*\.\s*get\s*\(/g,'mkReleaseGrid_(')
      .replace(/UrlFetchApp\s*\.\s*fetch\s*\(/g,'mkReleaseFetch_(')
      .replace(/ScriptApp\s*\.\s*newTrigger\s*\(/g,'mkReleaseNewTrigger_(')
      .replace(/ScriptApp\s*\.\s*deleteTrigger\s*\(/g,'mkReleaseDeleteTrigger_(')
      .replace(/DocumentApp\s*\.\s*openById\s*\(/g,'mkReleaseDocumentOpen_(')
      .replace(/DocumentApp\s*\.\s*create\s*\(/g,'mkReleaseDocumentCreate_(')
      .replace(/DriveApp\s*\.\s*getFileById\s*\(/g,'mkReleaseDriveFile_('));
  }
  modules.set('OrderReleaseSupport.gs',fs.readFileSync(path.join(source,'OrderReleaseSupport.gs'),'utf8'));
  const output = '/* ' + profile.environment + ' CANDIDATE. Full consolidated Code.gs.\n * Built from all 12 supplied original modules plus the reviewed order workspace.\n * Rehearsal installation only is currently authorized. Production requires completed migration rehearsal and explicit rollout approval.\n */\n' +
    'const MK_RELEASE = Object.freeze(' + JSON.stringify(profile,null,2) + ');\n' + [...modules].map(([name,text]) => '\n// ==================== SOURCE: ' + name + ' ====================\n' + text).join('\n');
  const names = namesIn(output);
  if (new Set(names).size !== names.length) throw new Error('Duplicate release function');
  for (const name of originals) for (const fn of namesIn(fs.readFileSync(path.join(baseline,name),'utf8')))
    if (!names.includes(fn)) throw new Error('Missing legacy function ' + fn);
  if (output.includes('1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs') || output.includes('MK_INTEGRATION_TEST_ID')) throw new Error('TEST binding leaked');
  new vm.Script(output,{filename:profile.folder+'/Code.gs'}).runInNewContext({});
  const target = path.join(source,profile.folder); fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,'Code.gs'),output);
  if (profile.environment === 'REHEARSAL') fs.writeFileSync(path.join(target,'Code-gs.txt'),output);
  const workspaceHtml = fs.readFileSync(path.join(source,'OwnerOrderWorkspace.html'),'utf8')
    .replace('TEST COPY',profile.environment==='REHEARSAL'?'PRODUCTION REHEARSAL':'MA KITCHENS');
  fs.writeFileSync(path.join(target,'OwnerOrderWorkspace.html'),profile.environment==='PRODUCTION'
    ? workspaceHtml.replace('Test workspace ready. No messages are sent by these actions.','Owner workspace ready.') : workspaceHtml);
  const manifest = JSON.parse(fs.readFileSync(path.join(source,'integration-reference','appsscript.editor.json'),'utf8'));
  if(profile.environment==='REHEARSAL') manifest.oauthScopes=JSON.parse(fs.readFileSync(path.join(source,'appsscript.test.json'),'utf8')).oauthScopes.filter(scope=>!scope.endsWith('/script.external_request'));
  fs.writeFileSync(path.join(target,'appsscript.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(target,'source-manifest.json'),JSON.stringify({profile,codeSha256:sha(output),functions:names.length,lines:output.split('\n').length,
    originalModules:originals.map(name=>({name,sha256:sha(fs.readFileSync(path.join(baseline,name)))})),
    sharedModules:shared.concat(['OrderReleaseSupport.gs','OrderReleaseCommerce.gs']).map(name=>({name,sha256:sha(fs.readFileSync(path.join(source,name)))})),
    adapterSource:{name:'IntegrationTestGuards.gs',sha256:sha(fs.readFileSync(path.join(source,'IntegrationTestGuards.gs'))),functions:['mkIntegrationLegacySnapshots_','mkIntegrationEnrichMenu_'],note:'Only these two reviewed adapters are extracted and renamed; no TEST service boundary is included.'},
    changes,installationApproved:profile.environment==='REHEARSAL',nativeMigrationVerified:false,productionRolloutApproved:false,
    knownGates:['Native fresh-copy migration and downstream rehearsal remain required.','Current LIVE editor source backup/confirmation and upstream Meta settings remain required.','No provider sends, route dispatch or document operations are authorized by preparation.']},null,2)+'\n');
  console.log(JSON.stringify({environment:profile.environment,functions:names.length,bytes:Buffer.byteLength(output),sha256:sha(output)}));
}
