/* TEST integration boundary. Never install this package in production. */
const MK_INTEGRATION_TEST_ID = '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs';

function mkIntegrationRequireTest_() {
  if (CONTROL_TOWER_SPREADSHEET_ID !== MK_INTEGRATION_TEST_ID ||
      PropertiesService.getScriptProperties().getProperty('ORDER_AUTOMATION_ENV') !== 'TEST')
    throw new Error('INTEGRATION_TEST_CONFIGURATION_REQUIRED');
}
function mkIntegrationOpenBook_(id) {
  mkIntegrationRequireTest_();
  if (id !== MK_INTEGRATION_TEST_ID) throw new Error('INTEGRATION_NON_TEST_SPREADSHEET_BLOCKED');
  return SpreadsheetApp.openById(id);
}
function mkIntegrationActiveBook_() {
  mkIntegrationRequireTest_();
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId() !== MK_INTEGRATION_TEST_ID) throw new Error('INTEGRATION_WRONG_BOUND_SPREADSHEET');
  return book;
}
function mkIntegrationBatch_(request, id) {
  mkIntegrationRequireTest_();
  if (id !== MK_INTEGRATION_TEST_ID) throw new Error('INTEGRATION_NON_TEST_BATCH_BLOCKED');
  return Sheets.Spreadsheets.batchUpdate(request, id);
}
function mkIntegrationNoExternal_() {
  throw new Error('INTEGRATION_TEST_EXTERNAL_ACTION_BLOCKED');
}
function mkIntegrationFetch_() { return mkIntegrationNoExternal_(); }
function mkIntegrationDocumentOpen_() { return mkIntegrationNoExternal_(); }
function mkIntegrationDocumentCreate_() { return mkIntegrationNoExternal_(); }
function mkIntegrationDriveFile_() { return mkIntegrationNoExternal_(); }
function mkIntegrationNewTrigger_(handler) {
  mkIntegrationActiveBook_();
  if (!['orderRequestInboxOnOpen_', 'orderEntryMenu', 'orderEntryEdited', 'showPackingSlipsMenu_'].includes(handler))
    throw new Error('INTEGRATION_BACKGROUND_TRIGGER_BLOCKED');
  return ScriptApp.newTrigger(handler);
}
function configureOrderAutomationIntegrationTest() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (CONTROL_TOWER_SPREADSHEET_ID !== MK_INTEGRATION_TEST_ID || !book || book.getId() !== MK_INTEGRATION_TEST_ID)
    throw new Error('Run from the designated bound TEST project only.');
  const owner = book.getOwner(), email = Session.getActiveUser().getEmail();
  if (!owner || !email || email !== owner.getEmail()) throw new Error('TEST_OWNER_REQUIRED');
  const unexpected = ScriptApp.getProjectTriggers().filter(trigger =>
    !['orderRequestInboxOnOpen_', 'orderEntryMenu', 'orderEntryEdited', 'showPackingSlipsMenu_'].includes(trigger.getHandlerFunction()) ||
    trigger.getTriggerSourceId() !== MK_INTEGRATION_TEST_ID);
  if (unexpected.length) throw new Error('Unexpected test project triggers. Review the trigger list before setup.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('ORDER_AUTOMATION_ENV', 'TEST');
  props.setProperty('CONTROL_TOWER_SPREADSHEET_ID', MK_INTEGRATION_TEST_ID);
  ['FEEDBACK_LIVE_ENABLED', 'FEEDBACK_V2_SENDER_ENABLED', 'FEEDBACK_V2_WRITES_ENABLED'].forEach(key => props.setProperty(key, 'false'));
  if (!props.getProperty('ORDER_REQUEST_API_SECRET'))
    props.setProperty('ORDER_REQUEST_API_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  return { ok: true, environment: 'TEST', outboundActions: 'BLOCKED' };
}
function initializeOrderAutomationIntegrationTest() {
  mkOwnerBook_();
  setupOrderRequestWorkspace();
  setupOwnerOrderWorkspace();
  const menu = buildActiveMenu_(), snapshot = mkOrderSnapshot_(menu, new Date());
  mkOrderSavePublishedState_(snapshot, menu);
  orderEntryMenu();
  showPackingSlipsMenu_();
  return { ok: true, environment: 'TEST', menuRevision: snapshot.menuRevision, dishCount: snapshot.meals.length,
    message: 'Integrated test workspace ready. External actions remain blocked.' };
}

/* Called under the shared ScriptLock before any new operational commit. */
function mkIntegrationAssertNoPending_(book, channel) {
  const journal = book.getSheetByName('Order Operation Journal');
  if (channel !== 'owner' && journal && journal.getDataRange().getValues().slice(1).some(row => row[3] === 'COMMITTING'))
    throw new Error('Reconcile the owner workspace submission before using legacy order entry.');
  const legacy = book.getSheetByName('Order Entry');
  if (legacy && channel !== 'legacy' && legacy.getRange('K3').getDisplayValue() === 'COMMITTING')
    throw new Error('Reconcile the legacy Order Entry submission before creating another order.');
}
function mkIntegrationNextOrderId_(orders) {
  const book = orders.getParent(), journal = book.getSheetByName('Order Operation Journal'), legacy = book.getSheetByName('Order Entry');
  const values = orders.getRange(2, 1, orders.getMaxRows() - 1, 1).getDisplayValues().map(row => row[0]);
  if (journal) journal.getDataRange().getValues().slice(1).forEach(row => values.push(row[2]));
  if (legacy) values.push(legacy.getRange('K6').getDisplayValue());
  let maximum = 0;
  values.forEach(value => { const match = String(value || '').match(/^ORD-(\d+)$/); if (match) maximum = Math.max(maximum, Number(match[1])); });
  return 'ORD-' + String(maximum + 1).padStart(6, '0');
}

function mkIntegrationLegacySnapshots_(book, cart, menu, customer, quote, orderRow, itemRows, operation) {
  mkAssertOperationalLayout_(book);
  const lines = mkMenuLines_(book, menu.deliveryDate), input = {
    deliveryDate: menu.deliveryDate, discountPercent: quote.discountPercent,
    discountReason: 'Existing legacy cart pricing rules',
    items: Object.keys(cart.items).map(code => ({ menuLineId: 'ML-' + menu.deliveryDate.replace(/-/g, '') + '-' + code, quantity: Number(cart.items[code]) }))
  };
  const rules = { discountPercent: quote.discountPercent, minimumOrderItems: quote.minimumOrderItems,
    deliveryFee: quote.standardDeliveryFee, freeDeliveryThreshold: quote.freeDeliveryThreshold, freeDeliveryBasis: quote.freeDeliveryBasis };
  const priced = mkQuote_(input, lines, rules, mkCommitted_(book, menu.deliveryDate));
  if (priced.totalCents !== Math.round(quote.total * 100)) throw new Error('Legacy quote rounding differs. Use the new owner workspace for this order.');
  const orders = book.getSheetByName(ORDERS_SHEET), items = book.getSheetByName(ORDER_ITEMS_SHEET);
  const phone = customer.phone || cart.orderCustomerPhone || '', name = customer.name || cart.customerName || '';
  const postcode = cart.postcode || extractPostcode_(cart.deliveryAddress) || customer.postcode || '';
  const requests = mkSetColumns_(orders, orderRow, {31: cart.deliveryAddress, 32: name, 33: phone, 34: postcode,
    35: '', 36: '', 37: operation});
  Object.keys(cart.items).forEach((code, index) => {
    const line = priced.items.find(item => item.itemCode === code);
    requests.push(...mkSetColumns_(items, itemRows[index], {23: code, 24: line.listPriceCents / 100,
      25: line.cookPayCents / 100, 26: line.cookId, 27: line.kitchenName, 28: line.menuLineId,
      29: line.unitPriceCents / 100, 30: line.lineTotalCents / 100}));
  });
  requests.push(...mkOwnerRowFormulaRequests_(orders, orderRow, items, itemRows));
  return requests;
}

/* Reuses the existing complete menu, including descriptions and portions. */
function mkIntegrationEnrichMenu_(menu) {
  if (!menu || menu.status !== 'ACTIVE') return menu;
  if (!orderRequestBeforeCutoff_(menu.deliveryDate, new Date())) return {status: 'NO_ACTIVE_MENU', meals: []};
  const book = mkIntegrationOpenBook_(CONTROL_TOWER_SPREADSHEET_ID), lines = mkMenuLines_(book, menu.deliveryDate), committed = mkCommitted_(book, menu.deliveryDate);
  const meals = menu.meals.map(meal => {
    const matches = lines.filter(line => line.itemCode === meal.itemCode);
    if (matches.length !== 1) throw new Error('Missing or duplicate menu identity.');
    const line = matches[0];
    return Object.assign({}, meal, {menuLineId: line.menuLineId, cookId: line.cookId, cookPay: line.cookPayCents / 100,
      remainingServings: Math.max(0, line.capacity - (committed[line.menuLineId] || 0))});
  }).filter(meal => meal.remainingServings > 0);
  if (!meals.length) return {status: 'NO_ACTIVE_MENU', meals: []};
  const cutoffDay = new Date(Date.parse(menu.deliveryDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  return Object.assign({}, menu, {meals: meals, mealCount: meals.length, orderDeadline: cutoffDay + 'T22:00:00',
    orderDeadlineDisplay: Utilities.formatDate(new Date(cutoffDay + 'T12:00:00Z'), 'Australia/Sydney', 'EEE d MMM') + ', 10:00 pm'});
}
