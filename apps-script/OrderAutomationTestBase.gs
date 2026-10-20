/* Install only in the NEW bound TEST project. Do not add alongside Code.gs.
 * This replaces Code.gs in the test project. It has no WhatsApp, feedback,
 * Routific or legacy Order Entry writers and contains no provider credentials.
 */
const CONTROL_TOWER_SPREADSHEET_ID = '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs';
const WEEKLY_MENU_SHEET = 'Weekly Menu';
const DISHES_SHEET = 'Dishes';
const CUSTOMERS_SHEET = 'Customers';
const CUSTOMER_INTAKE_SHEET = 'Customer Intake';
const ORDERS_SHEET = 'Orders';
const ORDER_ITEMS_SHEET = 'Order Items';
const DELIVERY_WINDOW = '4–10 PM';
const PAYMENT_PAYID = '0420 246 023';

function doGet() { return orderRequestJson_({ ok: true, environment: 'TEST' }); }
function doPost(e) {
  if (CONTROL_TOWER_SPREADSHEET_ID !== MK_OWNER.testBookId || PropertiesService.getScriptProperties().getProperty('ORDER_AUTOMATION_ENV') !== 'TEST')
    return orderRequestJson_({ ok: false, error: 'TEST_CONFIGURATION_REQUIRED' });
  const action = e && e.parameter && e.parameter.action;
  if (action !== 'order_request_capture' && action !== 'order_request_recover')
    return orderRequestJson_({ ok: false, error: 'UNKNOWN_ACTION' });
  return handleOrderRequestApi_(e, action);
}

function configureOrderAutomationTest() {
  const book = orderRequestInboxOwnerBook_(), active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active || active.getId() !== MK_OWNER.testBookId || book.getId() !== MK_OWNER.testBookId)
    throw new Error('Run this only from the Apps Script project bound to the designated TEST spreadsheet.');
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('ORDER_AUTOMATION_ENV', 'TEST');
  if (!properties.getProperty('ORDER_REQUEST_API_SECRET'))
    properties.setProperty('ORDER_REQUEST_API_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  return { ok: true, message: 'Test environment and private signing property configured. Secret values are not logged.' };
}

function getOrderingRules_() {
  const sheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID).getSheetByName('Menu Config');
  if (!sheet) throw new Error('Menu Config is missing.');
  const settings = {};
  sheet.getDataRange().getDisplayValues().slice(1).forEach(row => { if (row[0]) settings[String(row[0]).trim()] = String(row[1] || '').trim(); });
  function numeric(name) {
    if (!settings[name]) throw new Error('Missing Menu Config value: ' + name);
    const value = Number(settings[name].replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(value)) throw new Error('Invalid Menu Config value: ' + name);
    return value;
  }
  const rules = { discountPercent: numeric('Standard Discount %'), minimumOrderItems: numeric('Minimum Order Items'),
    deliveryFee: numeric('Delivery Fee'), freeDeliveryThreshold: numeric('Free Delivery Threshold'),
    freeDeliveryBasis: settings['Free Delivery Threshold Basis'] };
  if (rules.discountPercent < 0 || rules.discountPercent > 100 || !Number.isSafeInteger(rules.minimumOrderItems) || rules.minimumOrderItems < 1 ||
      rules.deliveryFee < 0 || rules.freeDeliveryThreshold < 0 || !['Pre-discount food value', 'Post-discount food value'].includes(rules.freeDeliveryBasis))
    throw new Error('Menu Config rules need review.');
  return rules;
}

function buildActiveMenu_() {
  const book = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  const lines = mkMenuLines_(book).filter(line => line.menuStatus === 'Available' && line.dishStatus === 'Active' &&
    line.readiness === 'READY' && line.availabilityStatus === 'Available' &&
    orderRequestBeforeCutoff_(line.deliveryDate, new Date()));
  if (!lines.length) return { status: 'NO_ACTIVE_MENU', meals: [] };
  const date = lines.map(line => line.deliveryDate).sort()[0];
  const committed = mkCommitted_(book, date);
  const meals = lines.filter(line => line.deliveryDate === date && line.capacity > (committed[line.menuLineId] || 0)).sort((a, b) => a.sectionOrder - b.sectionOrder || a.dishOrder - b.dishOrder)
    .map(line => ({ menuLineId: line.menuLineId, itemCode: line.itemCode, cookId: line.cookId, kitchenName: line.kitchenName,
      dishName: line.dishName, price: line.priceCents / 100, priceDisplay: '$' + (line.priceCents / 100).toFixed(2),
      cookPay: line.cookPayCents / 100, remainingServings: line.capacity - (committed[line.menuLineId] || 0), imageUrl: line.imageUrl }));
  return { status: 'ACTIVE', menuCycleId: 'MENU-' + date, deliveryDate: date,
    deliveryDateDisplay: Utilities.formatDate(new Date(date + 'T12:00:00Z'), 'Australia/Sydney', 'EEE d MMM'), meals: meals };
}

function initializeOrderAutomationTest() {
  mkOwnerBook_();
  setupOrderRequestWorkspace();
  setupOwnerOrderWorkspace();
  const menu = buildActiveMenu_(), snapshot = mkOrderSnapshot_(menu, new Date());
  if (!snapshot || snapshot.withdrawn || !snapshot.meals) throw new Error('No upcoming test menu is available.');
  mkOrderSavePublishedState_(snapshot, menu);
  return { ok: true, environment: 'TEST', menuRevision: snapshot.menuRevision, dishCount: snapshot.meals.length,
    message: 'Test workspace ready. No external messages were sent.' };
}
