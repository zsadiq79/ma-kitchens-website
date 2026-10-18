// SOURCE: OrderAutomationTestBase.gs
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


// SOURCE: OrderEngine.gs
/* Pure validation and pricing shared by owner requests and manual orders. */
function mkPhone_(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.indexOf('0061') === 0) phone = phone.slice(2);
  if (/^04\d{8}$/.test(phone)) phone = '61' + phone.slice(1);
  if (!/^614\d{8}$/.test(phone)) throw new Error('Enter a valid Australian mobile number.');
  return phone;
}

function mkText_(value, name, maximum, required) {
  const text = String(value || '').trim();
  if ((required && !text) || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
    throw new Error('Check ' + name + '.');
  return text;
}

function mkMoneyCents_(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) throw new Error('Invalid ' + name + '.');
  return Math.round(number * 100);
}

function mkCustomerMatch_(customers, phone, customerId) {
  const canonical = mkPhone_(phone);
  const matches = customers.filter(customer => {
    try { return mkPhone_(customer.phone) === canonical; } catch (_) { return false; }
  });
  if (matches.length > 1) throw new Error('DUPLICATE_CUSTOMER_PHONE: resolve the matching customer records before continuing.');
  const customer = matches[0] || null;
  if (customerId && (!customer || customer.id !== customerId)) throw new Error('CUSTOMER_PHONE_MISMATCH: choose the customer matching the actual sender.');
  if (customer && !customerId) throw new Error('EXISTING_CUSTOMER: choose the saved customer rather than creating another record.');
  return customer;
}

function mkOwnerDetails_(input) {
  const result = {
    phone: mkPhone_(input.senderPhone), customerId: mkText_(input.customerId, 'customer ID', 100, false),
    name: mkText_(input.name, 'customer name', 150, true), street: mkText_(input.street, 'street address', 400, false),
    suburb: mkText_(input.suburb, 'suburb', 100, false), postcode: mkText_(input.postcode, 'postcode', 4, true),
    instructions: mkText_(input.instructions, 'delivery instructions', 500, false),
    consent: String(input.consent || 'KEEP'), updateDefault: input.updateDefault === true,
    discountReason: mkText_(input.discountReason, 'discount reason', 500, false),
    capacityReason: mkText_(input.capacityReason, 'capacity override reason', 500, false),
    lateReason: mkText_(input.lateReason, 'late order reason', 500, false),
    revisionReason: mkText_(input.revisionReason, 'request revision reason', 500, false)
  };
  if (!/^\d{4}$/.test(result.postcode)) throw new Error('Enter a four digit delivery postcode.');
  if (!['KEEP', 'YES', 'NO'].includes(result.consent)) throw new Error('Choose the feedback consent setting.');
  if (!result.customerId && result.consent === 'KEEP') throw new Error('Record the new customer’s explicit feedback consent choice.');
  result.address = mkText_(input.address || (result.street + (result.suburb ? ', ' + result.suburb : '')), 'delivery address', 600, true);
  if (result.address.length < 8) throw new Error('Enter the complete delivery address.');
  const trailingPostcode = result.address.match(/(?:\s|,)\s*(\d{4})$/);
  if (trailingPostcode && trailingPostcode[1] !== result.postcode) throw new Error('Address and postcode differ. Check both fields.');
  if (!trailingPostcode) result.address += ' ' + result.postcode;
  return result;
}

function mkQuote_(input, lines, rules, committed) {
  if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw new Error('Select at least one dish.');
  const date = String(input.deliveryDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date)
    throw new Error('Choose a valid delivery date.');
  const defaultDiscount = Number(rules.discountPercent);
  const discountPercent = input.discountPercent === '' || input.discountPercent === undefined ? defaultDiscount : Number(input.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100 || Math.abs(Math.round(discountPercent * 100) - discountPercent * 100) > 0.00000001)
    throw new Error('Discount must be between 0 and 100 with up to two decimal places.');
  if (discountPercent !== defaultDiscount && !String(input.discountReason || '').trim()) throw new Error('Add a reason for the per order discount override.');
  const minimum = Number(rules.minimumOrderItems), seen = {}, selected = [];
  let totalQuantity = 0, listSubtotalCents = 0, foodSubtotalCents = 0, cookPayoutCents = 0;
  input.items.forEach(item => {
    if (!item || typeof item.menuLineId !== 'string' || seen[item.menuLineId] || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)
      throw new Error('Check dish selections and whole number quantities.');
    seen[item.menuLineId] = true;
    const matches = lines.filter(line => line.menuLineId === item.menuLineId && line.deliveryDate === date);
    if (matches.length !== 1) throw new Error('A selected menu line is missing or duplicated.');
    const line = matches[0];
    if (line.cycleId !== 'MENU-' + date || !line.itemCode || !line.cookId || !line.kitchenName || !line.dishName ||
        line.menuStatus !== 'Available' || line.dishStatus !== 'Active') throw new Error('A selected dish is no longer available.');
    if (!Number.isSafeInteger(line.priceCents) || line.priceCents <= 0 || !Number.isSafeInteger(line.cookPayCents) || line.cookPayCents < 0 ||
        !Number.isSafeInteger(line.capacity) || line.capacity < 0) throw new Error('Check the selected dish’s price, cook cost and capacity.');
    const used = Number(committed[line.menuLineId] || 0);
    const overCapacity = used + item.quantity > line.capacity;
    if (overCapacity && !String(input.capacityReason || '').trim()) throw new Error('CAPACITY_CHANGED: ' + line.dishName + ' has ' + Math.max(0, line.capacity - used) + ' servings remaining.');
    const discountBasisPoints = Math.round(discountPercent * 100);
    const unitPriceCents = Math.floor((line.priceCents * (10000 - discountBasisPoints) + 5000) / 10000);
    const priced = { menuLineId: line.menuLineId, itemCode: line.itemCode, cookId: line.cookId, kitchenName: line.kitchenName,
      dishName: line.dishName, quantity: item.quantity, listPriceCents: line.priceCents, cookPayCents: line.cookPayCents,
      unitPriceCents: unitPriceCents, lineTotalCents: unitPriceCents * item.quantity, overCapacity: overCapacity };
    selected.push(priced); totalQuantity += item.quantity;
    listSubtotalCents += line.priceCents * item.quantity; foodSubtotalCents += priced.lineTotalCents;
    cookPayoutCents += line.cookPayCents * item.quantity;
  });
  if (!Number.isSafeInteger(minimum) || minimum < 1 || totalQuantity < minimum) throw new Error('Minimum order is ' + minimum + ' servings.');
  selected.sort((a, b) => a.menuLineId.localeCompare(b.menuLineId));
  const standardDeliveryFeeCents = mkMoneyCents_(rules.deliveryFee, 'delivery fee');
  const thresholdCents = mkMoneyCents_(rules.freeDeliveryThreshold, 'free delivery threshold');
  const basis = String(rules.freeDeliveryBasis);
  if (!['Post-discount food value', 'Pre-discount food value'].includes(basis)) throw new Error('Unknown free delivery threshold basis.');
  const thresholdValue = basis === 'Post-discount food value' ? foodSubtotalCents : listSubtotalCents;
  const deliveryFeeCents = thresholdCents > 0 && thresholdValue >= thresholdCents ? 0 : standardDeliveryFeeCents;
  return { items: selected, totalQuantity: totalQuantity, listSubtotalCents: listSubtotalCents, foodSubtotalCents: foodSubtotalCents,
    cookPayoutCents: cookPayoutCents, deliveryFeeCents: deliveryFeeCents, totalCents: foodSubtotalCents + deliveryFeeCents,
    discountPercent: discountPercent, minimumOrderItems: minimum, standardDeliveryFeeCents: standardDeliveryFeeCents,
    freeDeliveryThresholdCents: thresholdCents, freeDeliveryBasis: basis };
}

function mkConfirmation_(review, orderId) {
  const money = cents => '$' + (cents / 100).toFixed(2);
  return ['Order received', '', 'Customer: ' + review.details.name, 'Order: ' + orderId, 'Delivery: ' + review.deliveryDate + ', ' + DELIVERY_WINDOW, '',
    ...review.quote.items.map(item => item.quantity + ' × ' + item.dishName + ': ' + money(item.lineTotalCents)), '',
    'Food subtotal: ' + money(review.quote.foodSubtotalCents), 'Delivery: ' + money(review.quote.deliveryFeeCents),
    'Total: ' + money(review.quote.totalCents), 'Address: ' + review.details.address,
    review.details.instructions ? 'Delivery instructions: ' + review.details.instructions : '', '',
    'PayID: ' + PAYMENT_PAYID, 'Payment reference: ' + orderId,
    'Please send payment confirmation to Ma Kitchens on WhatsApp.'].filter(line => line !== undefined).join('\n');
}


// SOURCE: OrderRequests.gs
/*
 * Ma Kitchens order request capture.
 * This file does not define doPost(e). Code.gs routes the two narrow actions here.
 * New rows stay outside Orders and Order Items until the owner accepts them.
 */
const MK_ORDER_REQUEST = Object.freeze({
  requestSheet: 'Order Requests',
  itemSheet: 'Order Request Items',
  eventSheet: 'Order Request Events',
  menuStateSheet: 'Order Menu State',
  timezone: 'Australia/Sydney',
  maxBodyChars: 20000,
  maxItems: 100,
  maxQuantity: 999,
  signatureWindowMs: 5 * 60 * 1000
});

const MK_ORDER_REQUEST_HEADERS = Object.freeze({
  'Order Requests': ['Request ID', 'Request Reference', 'Retry Key', 'Payload Hash', 'Recovery Capability Hash', 'Menu Revision', 'Menu Cycle ID', 'Delivery Date', 'Status', 'Customer ID', 'Public Food Subtotal Cents', 'Public Delivery Fee Cents', 'Public Total Cents', 'Owner Discount Percent', 'Linked Order ID', 'Created At', 'Updated At', 'Received At', 'Accepted At', 'Expires At', 'Owner Notes', 'Sender Phone (OWNER)'],
  'Order Request Items': ['Request ID', 'Public Item ID', 'Menu Line ID', 'Item Code', 'Dish Name (SNAPSHOT)', 'Kitchen Name (SNAPSHOT)', 'Cook ID', 'Qty', 'List Price / Unit Cents (SNAPSHOT)', 'Cook Pay / Unit Cents (SNAPSHOT)', 'Public Line Total Cents', 'Menu Revision'],
  'Order Request Events': ['Event ID', 'Request ID', 'Request Reference', 'Event', 'Actor', 'Event At', 'Details JSON', 'Request Version'],
  'Order Menu State': ['Record Type', 'Menu Revision', 'Menu Cycle ID', 'Delivery Date', 'Published At', 'Status', 'Public Item ID', 'Menu Line ID', 'Item Code', 'Cook ID', 'Kitchen Name', 'Dish Name', 'List Price Cents', 'Cook Pay Cents', 'Remaining Servings', 'Image URL', 'Minimum Order Items', 'Delivery Fee Cents']
});

function orderRequestJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function orderRequestDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function orderRequestHmacHex_(value, secret) {
  return Utilities.computeHmacSha256Signature(String(value), String(secret))
    .map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function orderRequestSafeEqual_(left, right) {
  left = String(left || ''); right = String(right || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function orderRequestVerifyEnvelope_(e, action) {
  const raw = e && e.postData && e.postData.contents;
  if (typeof raw !== 'string' || raw.length > MK_ORDER_REQUEST.maxBodyChars) throw new Error('INVALID_ENVELOPE');
  let envelope;
  try { envelope = JSON.parse(raw); } catch (_) { throw new Error('INVALID_ENVELOPE'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      typeof envelope.timestamp !== 'string' || !/^\d{13}$/.test(envelope.timestamp) ||
      typeof envelope.body !== 'string' || envelope.body.length > MK_ORDER_REQUEST.maxBodyChars ||
      typeof envelope.signature !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature)) throw new Error('INVALID_ENVELOPE');
  const timestamp = Number(envelope.timestamp), now = Date.now();
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MK_ORDER_REQUEST.signatureWindowMs) throw new Error('SIGNATURE_EXPIRED');
  const secret = PropertiesService.getScriptProperties().getProperty('ORDER_REQUEST_API_SECRET');
  if (!secret || String(secret).length < 32) throw new Error('ORDER_REQUEST_NOT_CONFIGURED');
  const expected = orderRequestHmacHex_(envelope.timestamp + '\n' + action + '\n' + envelope.body, secret);
  if (!orderRequestSafeEqual_(expected, envelope.signature)) throw new Error('UNAUTHORISED');
  let body;
  try { body = JSON.parse(envelope.body); } catch (_) { throw new Error('INVALID_BODY'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_BODY');
  return body;
}

function orderRequestOwner_() {
  const owner = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID).getOwner();
  if (!owner || Session.getEffectiveUser().getEmail() !== owner.getEmail()) throw new Error('ORDER_REQUEST_OWNER_REQUIRED');
}

function setupOrderRequestWorkspace() {
  mkOwnerBook_();
  const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  Object.keys(MK_ORDER_REQUEST_HEADERS).forEach(name => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = MK_ORDER_REQUEST_HEADERS[name];
    const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const populated = current.some(value => String(value || '').trim());
    if (populated && headers.some((value, index) => String(current[index] || '').trim() !== value))
      throw new Error('ORDER_REQUEST_HEADER_MISMATCH_' + name.replace(/[^A-Za-z0-9]/g, '_'));
    if (!populated) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });
  const trigger = ScriptApp.getProjectTriggers().some(item => item.getHandlerFunction() === 'orderRequestInboxOnOpen_' && item.getTriggerSourceId() === spreadsheet.getId());
  if (!trigger) ScriptApp.newTrigger('orderRequestInboxOnOpen_').forSpreadsheet(spreadsheet).onOpen().create();
  return { ok: true, sheets: Object.keys(MK_ORDER_REQUEST_HEADERS) };
}

function orderRequestHeaderMap_(headers) {
  const result = {};
  headers.forEach((value, index) => { result[String(value || '').trim()] = index; });
  return result;
}

function orderRequestReadMenuState_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.menuStateSheet);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('ORDER_REQUEST_NOT_READY');
  const values = sheet.getDataRange().getValues();
  const columns = orderRequestHeaderMap_(values[0]);
  const meta = values.slice(1).find(row => String(row[columns['Record Type']] || '') === 'STATE');
  if (!meta) throw new Error('ORDER_REQUEST_NOT_READY');
  const state = {
    revision: String(meta[columns['Menu Revision']] || ''), cycleId: String(meta[columns['Menu Cycle ID']] || ''),
    deliveryDate: String(meta[columns['Delivery Date']] || ''), publishedAt: String(meta[columns['Published At']] || ''),
    status: String(meta[columns['Status']] || ''), minimumOrderItems: Number(meta[columns['Minimum Order Items']] || 0),
    deliveryFeeCents: Number(meta[columns['Delivery Fee Cents']] || 0)
  };
  const items = {};
  values.slice(1).forEach(row => {
    if (String(row[columns['Record Type']] || '') !== 'ITEM') return;
    const id = String(row[columns['Public Item ID']] || '');
    if (!id) return;
    items[id] = {
      id, menuLineId: String(row[columns['Menu Line ID']] || ''), itemCode: String(row[columns['Item Code']] || ''),
      cookId: String(row[columns['Cook ID']] || ''), kitchenName: String(row[columns['Kitchen Name']] || ''),
      dishName: String(row[columns['Dish Name']] || ''), priceCents: Number(row[columns['List Price Cents']] || 0),
      cookPayCents: Number(row[columns['Cook Pay Cents']] || 0), remainingServings: Number(row[columns['Remaining Servings']] || 0)
    };
  });
  return { ...state, items };
}

function orderRequestBeforeCutoff_(deliveryDate, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || new Date(deliveryDate + 'T00:00:00Z').toISOString().slice(0, 10) !== deliveryDate) return false;
  const cutoffDay = new Date(Date.parse(deliveryDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const today = Utilities.formatDate(now, MK_ORDER_REQUEST.timezone, 'yyyy-MM-dd');
  if (today !== cutoffDay) return today < cutoffDay;
  return Number(Utilities.formatDate(now, MK_ORDER_REQUEST.timezone, 'HH')) < 22;
}

function orderRequestLiveLines_(spreadsheet, state) {
  const sheet = spreadsheet.getSheetByName(WEEKLY_MENU_SHEET);
  if (!sheet) throw new Error('ORDER_REQUEST_NOT_READY');
  const values = sheet.getDataRange().getValues();
  const columns = orderRequestHeaderMap_(values[0]);
  const required = ['Menu Line ID', 'Menu Cycle ID', 'Delivery Date', 'Item Code', 'Dish Name', 'Cook ID', 'Menu Kitchen Name', 'Customer Price', 'Remaining Servings', 'Menu Status', 'Availability Status', 'Menu Card Readiness'];
  if (required.some(name => columns[name] === undefined)) throw new Error('ORDER_REQUEST_MENU_COLUMNS_MISSING');
  const lines = {};
  values.slice(1).forEach(row => {
    const id = String(row[columns['Menu Line ID']] || '').trim();
    if (!id) return;
    let date = '';
    const rawDate = row[columns['Delivery Date']];
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) date = Utilities.formatDate(rawDate, MK_ORDER_REQUEST.timezone, 'yyyy-MM-dd');
    else if (typeof rawDate === 'string') date = rawDate.trim();
    lines[id] = {
      id, cycleId: String(row[columns['Menu Cycle ID']] || '').trim(), deliveryDate: date,
      itemCode: String(row[columns['Item Code']] || '').trim(), dishName: String(row[columns['Dish Name']] || '').trim(),
      cookId: String(row[columns['Cook ID']] || '').trim(), kitchenName: String(row[columns['Menu Kitchen Name']] || '').trim(),
      priceCents: Math.round(Number(row[columns['Customer Price']] || 0) * 100),
      remainingServings: Number(row[columns['Remaining Servings']] || 0),
      menuStatus: String(row[columns['Menu Status']] || '').trim(),
      availabilityStatus: String(row[columns['Availability Status']] || '').trim(),
      readiness: String(row[columns['Menu Card Readiness']] || '').trim()
    };
  });
  return lines;
}

function orderRequestCell_(value) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'number' && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  return { userEnteredValue: { stringValue: String(value) } };
}

function orderRequestUpdateCells_(sheet, startRow, rows, width) {
  const needed = startRow + rows.length;
  if (typeof sheet.getMaxRows === 'function' && needed > sheet.getMaxRows())
    sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(1000, needed - sheet.getMaxRows()));
  return { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: startRow, columnIndex: 0 },
    rows: rows.map(row => ({ values: Array.from({ length: width }, (_, index) => orderRequestCell_(row[index])) })),
    fields: 'userEnteredValue' } };
}

function orderRequestExisting_(sheet, retryKey) {
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, MK_ORDER_REQUEST_HEADERS['Order Requests'].length).getValues();
  for (const row of values) if (String(row[2] || '') === retryKey) return row;
  return null;
}

function orderRequestCapture_(body) {
  const requestKey = String(body.requestKey || '').toLowerCase();
  const revision = String(body.menuRevision || ''), cycleId = String(body.menuCycleId || ''), deliveryDate = String(body.deliveryDate || '');
  const capability = String(body.recoveryCapability || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestKey) ||
      !/^[a-f0-9]{64}$/.test(revision) || !/^MENU-\d{4}-\d{2}-\d{2}$/.test(cycleId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(capability) || !Array.isArray(body.items) || !body.items.length || body.items.length > MK_ORDER_REQUEST.maxItems)
    throw new Error('INVALID_REQUEST');

  const items = [], seen = {};
  let totalQty = 0;
  body.items.forEach(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !/^i_[a-f0-9]{24}$/.test(String(item.id || '')) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MK_ORDER_REQUEST.maxQuantity || seen[item.id])
      throw new Error('INVALID_ITEMS');
    seen[item.id] = true; items.push({ id: item.id, quantity: item.quantity }); totalQty += item.quantity;
  });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_REQUEST_BUSY');
  try {
    const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
    const requestSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.requestSheet);
    const itemSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.itemSheet);
    const eventSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.eventSheet);
    if (!requestSheet || !itemSheet || !eventSheet) throw new Error('ORDER_REQUEST_NOT_READY');

    const payloadHash = orderRequestDigest_(JSON.stringify([revision, cycleId, deliveryDate, items.map(item => [item.id, item.quantity])]));
    const existing = orderRequestExisting_(requestSheet, requestKey);
    if (existing) {
      if (String(existing[3] || '') !== payloadHash || String(existing[4] || '') !== orderRequestDigest_(capability))
        throw new Error('REQUEST_CONFLICT');
      return { ok: true, reference: String(existing[1]), status: String(existing[8]), created: false };
    }

    const state = orderRequestReadMenuState_(spreadsheet);
    if (state.status !== 'ACTIVE' || state.revision !== revision || state.cycleId !== cycleId || state.deliveryDate !== deliveryDate)
      throw new Error('MENU_STALE');
    const now = new Date();
    if (!orderRequestBeforeCutoff_(deliveryDate, now)) throw new Error('MENU_CLOSED');
    const rules = getOrderingRules_();
    const deliveryFeeCents = Math.round(Number(rules.deliveryFee) * 100);
    if (totalQty < Number(rules.minimumOrderItems))
      throw new Error('MINIMUM_ORDER_NOT_MET');
    if (state.minimumOrderItems !== Number(rules.minimumOrderItems) || state.deliveryFeeCents !== deliveryFeeCents)
      throw new Error('MENU_STALE');
    const live = orderRequestLiveLines_(spreadsheet, state);
    const matched = items.map(item => {
      const published = state.items[item.id];
      const line = published && live[published.menuLineId];
      if (!published || !line || line.id !== published.menuLineId || line.cycleId !== cycleId || line.deliveryDate !== deliveryDate ||
          line.itemCode !== published.itemCode || line.priceCents !== published.priceCents || line.menuStatus !== 'Available' ||
          line.availabilityStatus !== 'Available' || line.readiness !== 'READY') throw new Error('MENU_STALE');
      if (line.remainingServings < item.quantity) throw new Error('ITEM_UNAVAILABLE');
      return { ...item, published, line, lineTotalCents: published.priceCents * item.quantity };
    });
    const requestId = 'ORQ-' + Utilities.getUuid().toUpperCase();
    const references = requestSheet.getLastRow() > 1 ? requestSheet.getRange(2, 2, requestSheet.getLastRow() - 1, 1).getValues().map(row => String(row[0])) : [];
    let requestRef = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = 'MK-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
      if (!references.includes(candidate)) { requestRef = candidate; break; }
    }
    if (!requestRef) throw new Error('ORDER_REQUEST_BUSY');
    const nowIso = now.toISOString();
    const foodSubtotalCents = matched.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const publicTotalCents = foodSubtotalCents + deliveryFeeCents;
    const expires = deliveryDate + ' 23:59 Australia/Sydney';
    const requestRow = [requestId, requestRef, requestKey, payloadHash, orderRequestDigest_(capability), revision, cycleId,
      deliveryDate, 'UNASSIGNED', '', foodSubtotalCents, deliveryFeeCents, publicTotalCents, '', '', nowIso, nowIso, '', '', expires, ''];
    const itemRows = matched.map(item => [requestId, item.id, item.published.menuLineId, item.published.itemCode,
      item.published.dishName, item.published.kitchenName, item.published.cookId, item.quantity, item.published.priceCents,
      item.published.cookPayCents, item.lineTotalCents, revision]);
    const eventRow = ['EVT-' + Utilities.getUuid().toUpperCase(), requestId, requestRef, 'REQUEST_SAVED', 'PUBLIC_CAPTURE', nowIso,
      JSON.stringify({ itemCount: itemRows.length, totalQuantity: totalQty, publicTotalCents: publicTotalCents }), 1];
    const requests = [
      orderRequestUpdateCells_(requestSheet, requestSheet.getLastRow(), [requestRow], MK_ORDER_REQUEST_HEADERS[MK_ORDER_REQUEST.requestSheet].length),
      orderRequestUpdateCells_(itemSheet, itemSheet.getLastRow(), itemRows, MK_ORDER_REQUEST_HEADERS[MK_ORDER_REQUEST.itemSheet].length),
      orderRequestUpdateCells_(eventSheet, eventSheet.getLastRow(), [eventRow], MK_ORDER_REQUEST_HEADERS[MK_ORDER_REQUEST.eventSheet].length)
    ];
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheet.getId());
    return { ok: true, reference: requestRef, status: 'UNASSIGNED', created: true };
  } finally { lock.releaseLock(); }
}

function orderRequestRecover_(body) {
  const capability = String(body.capability || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(capability)) throw new Error('INVALID_RECOVERY_CAPABILITY');
  const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.requestSheet);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, found: false };
  const capHash = orderRequestDigest_(capability);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, MK_ORDER_REQUEST_HEADERS['Order Requests'].length).getValues();
  const row = values.find(value => String(value[4] || '') === capHash);
  if (!row) return { ok: true, found: false };
  return { ok: true, found: true, reference: String(row[1]), status: String(row[8]), deliveryDate: String(row[7]),
    publicTotalCents: Number(row[12]) || 0, createdAt: String(row[15] || '') };
}

function handleOrderRequestApi_(e, action) {
  try {
    const body = orderRequestVerifyEnvelope_(e, action);
    if (action === 'order_request_capture') return orderRequestJson_(orderRequestCapture_(body));
    if (action === 'order_request_recover') return orderRequestJson_(orderRequestRecover_(body));
    return orderRequestJson_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (error) {
    const message = error && error.message ? String(error.message) : 'ORDER_REQUEST_FAILED';
    const allowed = ['INVALID_ENVELOPE', 'SIGNATURE_EXPIRED', 'ORDER_REQUEST_NOT_CONFIGURED', 'UNAUTHORISED', 'INVALID_BODY',
      'INVALID_REQUEST', 'INVALID_ITEMS', 'ORDER_REQUEST_BUSY', 'ORDER_REQUEST_NOT_READY', 'MENU_STALE', 'MENU_CLOSED',
      'MINIMUM_ORDER_NOT_MET', 'ITEM_UNAVAILABLE', 'REQUEST_CONFLICT', 'INVALID_RECOVERY_CAPABILITY', 'ORDER_REQUEST_MENU_COLUMNS_MISSING'];
    return orderRequestJson_({ ok: false, error: allowed.indexOf(message) >= 0 ? message : 'ORDER_REQUEST_FAILED' });
  }
}

// Private owner workspace. These functions are called by a spreadsheet sidebar,
// never by the public website or the signed capture endpoint.
function orderRequestInboxOwnerBook_() {
  const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  const owner = spreadsheet.getOwner();
  const activeEmail = Session.getActiveUser().getEmail();
  if (!owner || !activeEmail || activeEmail !== owner.getEmail()) throw new Error('ORDER_REQUEST_OWNER_REQUIRED');
  return spreadsheet;
}

function orderRequestInboxOnOpen_() {
  mkOwnerBook_();
  SpreadsheetApp.getUi().createMenu('Website Requests')
    .addItem('Open owner order workspace', 'orderRequestOpenInbox')
    .addToUi();
}

function orderRequestOpenInbox() {
  mkOwnerBook_();
  const html = HtmlService.createHtmlOutputFromFile('OwnerOrderWorkspace').setWidth(1050).setHeight(740);
  SpreadsheetApp.getUi().showModalDialog(html, 'Ma Kitchens owner orders');
}

function orderRequestInboxList() {
  const spreadsheet = mkOwnerBook_();
  const requestSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.requestSheet);
  const itemSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.itemSheet);
  if (!requestSheet || !itemSheet || requestSheet.getLastRow() < 2) return { requests: [] };
  const requestRows = requestSheet.getRange(2, 1, requestSheet.getLastRow() - 1, MK_ORDER_REQUEST_HEADERS['Order Requests'].length).getValues();
  const items = {};
  if (itemSheet.getLastRow() > 1) itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, MK_ORDER_REQUEST_HEADERS['Order Request Items'].length).getValues().forEach(row => {
    const key = String(row[0] || '');
    if (!key) return;
    (items[key] || (items[key] = [])).push({ dishName: String(row[4] || ''), quantity: Number(row[7]) || 0,
      unitPriceCents: Number(row[8]) || 0, lineTotalCents: Number(row[10]) || 0 });
  });
  const requests = requestRows.filter(row => ['UNASSIGNED', 'RECEIVED', 'UNDER_REVIEW'].indexOf(String(row[8])) >= 0)
    .slice(-100).reverse().map(row => ({ id: String(row[0]), reference: String(row[1]), deliveryDate: String(row[7]), status: String(row[8]),
      publicTotalCents: Number(row[12]) || 0, receivedAt: String(row[17] || ''), senderPhone: String(row[21] || ''),
      items: items[String(row[0])] || [] }));
  return { requests: requests };
}

function orderRequestOwnerEventRequest_(spreadsheet, requestRow, eventName, detail) {
  const eventSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.eventSheet);
  const now = new Date().toISOString();
  const requestId = String(requestRow[0]), reference = String(requestRow[1]);
  let version = 1;
  if (eventSheet.getLastRow() > 1) {
    const prior = eventSheet.getRange(2, 2, eventSheet.getLastRow() - 1, 1).getValues();
    version += prior.filter(row => String(row[0]) === requestId).length;
  }
  const row = ['EVT-' + Utilities.getUuid().toUpperCase(), requestId, reference, eventName, Session.getActiveUser().getEmail(), now,
    JSON.stringify(detail || {}), version];
  return orderRequestUpdateCells_(eventSheet, eventSheet.getLastRow(), [row], MK_ORDER_REQUEST_HEADERS[MK_ORDER_REQUEST.eventSheet].length);
}

function orderRequestOwnerFindRow_(spreadsheet, reference) {
  if (typeof reference !== 'string' || !/^MK-[A-Z0-9]{8}$/.test(reference)) throw new Error('INVALID_REQUEST_REFERENCE');
  const sheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.requestSheet);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('REQUEST_NOT_FOUND');
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, MK_ORDER_REQUEST_HEADERS['Order Requests'].length).getValues();
  const matches = values.map((row, index) => ({ row: row, rowNumber: index + 2 })).filter(item => String(item.row[1]) === reference);
  if (matches.length !== 1) throw new Error('REQUEST_NOT_FOUND');
  return { sheet: sheet, row: matches[0].row, rowNumber: matches[0].rowNumber };
}

function orderRequestMarkReceived(reference, senderPhone, ownerNote) {
  const spreadsheet = mkOwnerBook_();
  const normalized = mkPhone_(senderPhone);
  if (!/^614\d{8}$/.test(normalized)) throw new Error('Enter the sender’s Australian mobile number from WhatsApp.');
  const note = String(ownerNote || '').trim();
  if (note.length > 500) throw new Error('Owner note must be 500 characters or fewer.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = orderRequestOwnerFindRow_(spreadsheet, reference), row = found.row;
    if (!['UNASSIGNED', 'RECEIVED', 'UNDER_REVIEW'].includes(String(row[8]))) throw new Error('This request cannot be marked received in its current state.');
    if (row[8] === 'RECEIVED' && String(row[21]) === normalized && !note) return { ok: true };
    const now = new Date().toISOString(), previousNote = String(row[20] || '');
    const nextNote = note ? [previousNote, note].filter(Boolean).join('\n') : previousNote;
    const changes = [
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 9, 'RECEIVED'),
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 17, now),
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 18, now),
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 21, nextNote),
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 22, normalized),
      orderRequestOwnerEventRequest_(spreadsheet, row, 'WHATSAPP_RECEIVED', { senderPhone: normalized, note: note })
    ];
    Sheets.Spreadsheets.batchUpdate({ requests: changes }, spreadsheet.getId());
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function orderRequestCellUpdate_(sheet, row, column, value) {
  const cell = orderRequestCell_(value);
  return { updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: row - 1, endRowIndex: row,
    startColumnIndex: column - 1, endColumnIndex: column }, rows: [{ values: [cell] }], fields: 'userEnteredValue' } };
}

function orderRequestFindCustomersBySender(senderPhone) {
  const spreadsheet = mkOwnerBook_();
  const normalized = mkPhone_(senderPhone);
  if (!/^614\d{8}$/.test(normalized)) throw new Error('Enter the sender’s Australian mobile number from WhatsApp.');
  const customers = mkCustomers_(spreadsheet).filter(customer => { try { return mkPhone_(customer.phone) === normalized; } catch (_) { return false; } });
  if (customers.length > 1) return { status: 'DUPLICATE', customers: customers.map(orderRequestSafeCustomer_) };
  if (!customers.length) return { status: 'NO_MATCH', customers: [] };
  return { status: 'MATCH', customers: customers.map(orderRequestSafeCustomer_) };
}

function orderRequestSafeCustomer_(customer) {
  return { id: String(customer.id), name: String(customer.name), phone: '+' + mkPhone_(customer.phone),
    address: String(customer.address || ''), suburb: String(customer.suburb || ''), postcode: String(customer.postcode || '') };
}

function orderRequestReject(reference, reason) {
  const spreadsheet = mkOwnerBook_(), note = String(reason || '').trim();
  if (!note || note.length > 500) throw new Error('Add a reason of up to 500 characters.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = orderRequestOwnerFindRow_(spreadsheet, reference);
    if (!['UNASSIGNED', 'RECEIVED', 'UNDER_REVIEW'].includes(String(found.row[8]))) throw new Error('This request cannot be rejected in its current state.');
    const now = new Date().toISOString();
    Sheets.Spreadsheets.batchUpdate({ requests: [orderRequestCellUpdate_(found.sheet, found.rowNumber, 9, 'REJECTED'),
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 17, now), orderRequestCellUpdate_(found.sheet, found.rowNumber, 21, note),
      orderRequestOwnerEventRequest_(spreadsheet, found.row, 'REQUEST_REJECTED', { reason: note })] }, spreadsheet.getId());
    return { ok: true };
  } finally { lock.releaseLock(); }
}


// SOURCE: OwnerOrders.gs
/* Private, spreadsheet-bound owner actions. Never route these through doPost. */
const MK_OWNER = Object.freeze({
  testBookId: '1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs',
  reviews: 'Owner Order Reviews', journal: 'Order Operation Journal', customers: 'Owner Customer Operations'
});
const MK_OWNER_HEADERS = Object.freeze({
  'Owner Order Reviews': ['Review ID', 'Request Reference', 'Review Hash', 'State', 'Input JSON', 'Review JSON', 'Created At', 'Updated At', 'Order ID', 'Confirmation', 'Actor', 'Manual Send Marked At', 'Draft ID'],
  'Order Operation Journal': ['Operation ID', 'Review ID', 'Order ID', 'State', 'Started At', 'Updated At', 'Detail'],
  'Owner Customer Operations': ['Operation ID', 'Payload Hash', 'Phone', 'Baseline IDs JSON', 'State', 'Customer ID', 'Updated At']
});

function mkOwnerBook_() {
  const book = orderRequestInboxOwnerBook_();
  if (book.getId() !== MK_OWNER.testBookId || CONTROL_TOWER_SPREADSHEET_ID !== MK_OWNER.testBookId ||
      PropertiesService.getScriptProperties().getProperty('ORDER_AUTOMATION_ENV') !== 'TEST')
    throw new Error('This preview owner workspace only runs in the configured test copy.');
  return book;
}

function mkLocked_(callback) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function mkTable_(book, name) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name + '. Run the test workspace setup.');
  const values = sheet.getDataRange().getValues();
  return { sheet: sheet, headers: orderRequestHeaderMap_(values[0] || []), rows: values.slice(1) };
}

function mkRequire_(table, names) {
  names.forEach(name => { if (table.headers[name] === undefined) throw new Error('Missing column: ' + name); });
}

function mkRows_(table, predicate) {
  return table.rows.map((row, index) => ({ row: row, number: index + 2 })).filter(item => predicate(item.row));
}

function mkUnique_(table, column, value) {
  const found = mkRows_(table, row => String(row[column] || '') === value);
  if (found.length > 1) throw new Error('Duplicate durable record. Reconcile before continuing.');
  return found[0] || null;
}

function mkJson_(value) {
  const text = JSON.stringify(value);
  if (text.length > 45000) throw new Error('Review is too large. Reduce the number of lines.');
  return text;
}

function mkDate_(value) {
  return value instanceof Date ? Utilities.formatDate(value, 'Australia/Sydney', 'yyyy-MM-dd') : String(value || '').trim();
}

function mkCustomers_(book) {
  const table = mkTable_(book, CUSTOMERS_SHEET);
  mkRequire_(table, ['Customer ID', 'Name', 'Phone', 'Postcode', 'WhatsApp Opt-In', 'Default Delivery Address']);
  const h = table.headers;
  return table.rows.map((row, index) => ({ id: String(row[h['Customer ID']] || ''), name: String(row[h.Name] || ''),
    phone: String(row[h.Phone] || ''), postcode: String(row[h.Postcode] || ''), suburb: String(row[h['Area / Suburb']] || ''),
    address: String(row[h['Default Delivery Address']] || ''), consent: String(row[h['WhatsApp Opt-In']] || ''), rowNumber: index + 2 }))
    .filter(customer => customer.id);
}

function mkMenuLines_(book, deliveryDate) {
  const table = mkTable_(book, WEEKLY_MENU_SHEET), dishes = mkTable_(book, DISHES_SHEET), h = table.headers, d = dishes.headers;
  mkRequire_(table, ['Menu Line ID', 'Menu Cycle ID', 'Delivery Date', 'Item Code', 'Cook ID', 'Menu Kitchen Name', 'Dish Name', 'Customer Price', 'Available Servings', 'Menu Status']);
  mkRequire_(dishes, ['Item Code', 'Cook Pay / Serving', 'Status']);
  const today = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd');
  return table.rows.filter(row => row[h['Menu Line ID']] && (deliveryDate ? mkDate_(row[h['Delivery Date']]) === deliveryDate : mkDate_(row[h['Delivery Date']]) >= today)).map(row => {
    const code = String(row[h['Item Code']] || ''), matches = dishes.rows.filter(dish => String(dish[d['Item Code']]) === code);
    if (matches.length !== 1) throw new Error('Missing or duplicate dish record for ' + code + '.');
    return { menuLineId: String(row[h['Menu Line ID']]), cycleId: String(row[h['Menu Cycle ID']]), deliveryDate: mkDate_(row[h['Delivery Date']]),
      itemCode: code, cookId: String(row[h['Cook ID']] || ''), kitchenName: String(row[h['Menu Kitchen Name']] || ''),
      dishName: String(row[h['Dish Name']] || ''), priceCents: mkMoneyCents_(row[h['Customer Price']], 'menu price'),
      cookPayCents: mkMoneyCents_(matches[0][d['Cook Pay / Serving']], 'cook cost'), capacity: Number(row[h['Available Servings']]),
      menuStatus: String(row[h['Menu Status']] || ''), dishStatus: String(matches[0][d.Status] || ''),
      readiness: String(row[h['Menu Card Readiness']] || ''), availabilityStatus: String(row[h['Availability Status']] || ''),
      sectionOrder: Number(row[h['Cook Section Order']] || 999), dishOrder: Number(row[h['Dish Display Order']] || 999),
      imageUrl: String(row[h['Image URL']] || '') };
  });
}

function mkCommitted_(book, deliveryDate) {
  const orders = mkTable_(book, ORDERS_SHEET), items = mkTable_(book, ORDER_ITEMS_SHEET), byId = {}, totals = {};
  mkRequire_(orders, ['Order ID', 'Delivery Date', 'Order Status']);
  mkRequire_(items, ['Order ID', 'Item Code (AUTO, INTERNAL)', 'Item Code (SNAPSHOT)', 'Qty', 'Fulfilment Status']);
  orders.rows.forEach(row => {
    const id = String(row[orders.headers['Order ID']] || ''); if (!id) return;
    if (byId[id] && (!deliveryDate || byId[id].date === deliveryDate || mkDate_(row[orders.headers['Delivery Date']]) === deliveryDate))
      throw new Error('Duplicate operational Order ID. Reconcile before accepting.');
    byId[id] = { date: mkDate_(row[orders.headers['Delivery Date']]), status: String(row[orders.headers['Order Status']] || '') };
  });
  items.rows.forEach(row => {
    const id = String(row[items.headers['Order ID']] || ''); if (!id) return;
    const order = byId[id];
    if (!order) {
      if (deliveryDate && mkDate_(row[1]) !== deliveryDate) return;
      throw new Error('An operational item has no matching order. Reconcile before accepting.');
    }
    if (deliveryDate && order.date !== deliveryDate) return;
    if (order.status === 'Cancelled' || String(row[items.headers['Fulfilment Status']]) === 'Cancelled') return;
    const code = String(row[items.headers['Item Code (SNAPSHOT)']] || row[items.headers['Item Code (AUTO, INTERNAL)']] || '');
    const quantity = Number(row[items.headers.Qty]);
    if (!code || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('An operational item needs a valid code and quantity.');
    const key = 'ML-' + order.date.replace(/-/g, '') + '-' + code;
    totals[key] = (totals[key] || 0) + quantity;
  });
  return totals;
}

function ownerOrderBootstrap() {
  const book = mkOwnerBook_();
  const today = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd');
  return { inbox: orderRequestInboxList().requests, rules: getOrderingRules_(),
    menu: mkMenuLines_(book).filter(line => line.deliveryDate >= today && line.menuStatus === 'Available' && line.dishStatus === 'Active'),
    reviews: mkTable_(book, MK_OWNER.reviews).rows.filter(row => row[0]).slice(-30).reverse().map(row => ({ id: String(row[0]),
      reference: String(row[1] || ''), hash: String(row[2]), state: String(row[3]), orderId: String(row[8] || '') })) };
}

function ownerOrderLookupCustomer(phone) {
  const customers = mkCustomers_(mkOwnerBook_()), normalized = mkPhone_(phone);
  const matches = customers.filter(customer => { try { return mkPhone_(customer.phone) === normalized; } catch (_) { return false; } });
  return { status: matches.length > 1 ? 'DUPLICATE' : matches.length ? 'MATCH' : 'NO_MATCH', customers: matches };
}

function mkOwnerRequest_(book, reference) {
  if (!reference) return null;
  const found = orderRequestOwnerFindRow_(book, reference);
  const table = mkTable_(book, MK_ORDER_REQUEST.itemSheet);
  const items = table.rows.filter(row => String(row[0]) === String(found.row[0])).map(row => ({ menuLineId: String(row[2]), quantity: Number(row[7]) }));
  return { found: found, id: String(found.row[0]), reference: reference, date: String(found.row[7]),
    status: String(found.row[8]), linkedOrderId: String(found.row[14] || ''), senderPhone: String(found.row[21] || ''),
    capturedAt: String(found.row[15] || ''), items: items,
    version: orderRequestDigest_(mkJson_([found.row, items])) };
}

function ownerOrderOpenRequest(reference) {
  const book = mkOwnerBook_(), request = mkOwnerRequest_(book, reference);
  if (!request) throw new Error('Request not found.');
  return { reference: request.reference, deliveryDate: request.date, status: request.status, senderPhone: request.senderPhone, items: request.items };
}

function mkOwnerPrepare_(book, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid order form.');
  if (typeof input.draftKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.draftKey)) throw new Error('Invalid owner draft identity.');
  const details = mkOwnerDetails_(input), customers = mkCustomers_(book);
  if (!details.customerId) throw new Error('Save the real customer record before reviewing this order.');
  const customer = mkCustomerMatch_(customers, details.phone, details.customerId);
  if (!customer || customer.name !== details.name) throw new Error('Customer name or identity changed. Reload the saved customer.');
  const request = mkOwnerRequest_(book, String(input.requestReference || ''));
  const date = String(input.deliveryDate || '');
  if (request) {
    if (request.linkedOrderId || !['RECEIVED', 'UNDER_REVIEW'].includes(request.status)) throw new Error('Mark the actual WhatsApp message received before reviewing, or open the already recorded order.');
    if (request.date !== date || !request.senderPhone || mkPhone_(request.senderPhone) !== details.phone) throw new Error('Request sender or delivery date does not match.');
    const original = request.items.slice().sort((a, b) => a.menuLineId.localeCompare(b.menuLineId));
    const edited = input.items.slice().sort((a, b) => a.menuLineId.localeCompare(b.menuLineId));
    if (mkJson_(original) !== mkJson_(edited) && !details.revisionReason) throw new Error('Add a reason for changing the saved dish selection.');
  }
  const today = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd');
  const beforeCutoff = orderRequestBeforeCutoff_(date, new Date());
  const capturedBeforeCutoff = request && orderRequestBeforeCutoff_(date, new Date(request.capturedAt));
  if ((!beforeCutoff && !capturedBeforeCutoff || date < today) && !details.lateReason) throw new Error('Add an explicit late order reason to continue.');
  const quote = mkQuote_(input, mkMenuLines_(book, date), getOrderingRules_(), mkCommitted_(book, date));
  return { draftKey: input.draftKey, deliveryDate: date, requestReference: request ? request.reference : '', requestId: request ? request.id : '',
    requestVersion: request ? request.version : '', details: details, customer: { id: customer.id, phone: customer.phone, name: customer.name }, quote: quote };
}

function ownerOrderReview(input) {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    const review = mkOwnerPrepare_(book, input), id = 'REV-' + Utilities.getUuid(), now = new Date().toISOString();
    const table = mkTable_(book, MK_OWNER.reviews), requests = [];
    if (review.requestReference) {
      const request = mkOwnerRequest_(book, review.requestReference), found = request.found, next = found.row.slice();
      next[8] = 'UNDER_REVIEW'; next[9] = review.details.customerId; next[13] = review.quote.discountPercent; next[16] = now;
      review.requestVersion = orderRequestDigest_(mkJson_([next, request.items]));
      requests.push(orderRequestUpdateCells_(found.sheet, found.rowNumber - 1, [next], MK_ORDER_REQUEST_HEADERS[MK_ORDER_REQUEST.requestSheet].length),
        orderRequestOwnerEventRequest_(book, found.row, 'OWNER_REVIEWED', { reviewId: id, customerId: review.details.customerId,
          reviewedItems: review.quote.items, revisionReason: review.details.revisionReason, discountReason: review.details.discountReason }));
    }
    const hash = orderRequestDigest_(mkJson_(review));
    const row = [id, review.requestReference, hash, 'REVIEWED', mkJson_(input), mkJson_(review), now, now, '', '', Session.getActiveUser().getEmail(), '', input.draftKey];
    requests.push(orderRequestUpdateCells_(table.sheet, table.sheet.getLastRow(), [row], MK_OWNER_HEADERS[MK_OWNER.reviews].length));
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, book.getId());
    return { id: id, hash: hash, review: review, confirmation: mkConfirmation_(review, '[assigned on acceptance]') };
  });
}

function mkSerial_(date) {
  const parts = Utilities.formatDate(date, 'Australia/Sydney', 'yyyy-MM-dd-HH-mm-ss').split('-').map(Number);
  return (Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]) - Date.UTC(1899, 11, 30)) / 86400000;
}

function mkDeliverySerial_(date) { return (Date.parse(date + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000; }

function mkEmptyRows_(table, count, inputColumns, startRow, limit) {
  const result = [], maximum = Math.min(table.sheet.getMaxRows(), limit);
  for (let number = startRow; number <= maximum && result.length < count; number++) {
    const row = table.rows[number - 2] || [];
    if (inputColumns.every(column => row[column - 1] === '' || row[column - 1] === undefined)) result.push(number);
  }
  if (result.length !== count) throw new Error('Destination formula range is full. Extend and verify the configured formulas before retrying.');
  return result;
}

function mkSetColumns_(sheet, row, columns) {
  return Object.keys(columns).map(column => orderRequestCellUpdate_(sheet, row, Number(column), columns[column]));
}

function mkNextOrderId_(orders, journal) {
  let maximum = 0;
  const values = orders.rows.map(row => row[0]).concat(journal.rows.map(row => row[2]));
  values.forEach(value => { const match = String(value || '').match(/^ORD-(\d+)$/); if (match) maximum = Math.max(maximum, Number(match[1])); });
  return 'ORD-' + String(maximum + 1).padStart(6, '0');
}

function mkOwnerFindReview_(book, id) {
  if (typeof id !== 'string' || !/^REV-[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid review ID.');
  const table = mkTable_(book, MK_OWNER.reviews), found = mkUnique_(table, 0, id);
  if (!found) throw new Error('Review not found.');
  return { table: table, row: found.row, number: found.number };
}

function ownerOrderAccept(id, hash) {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    const saved = mkOwnerFindReview_(book, id);
    if (String(saved.row[2]) !== hash) throw new Error('Review identity does not match.');
    if (saved.row[8]) return mkOwnerReconcile_(book, saved);
    const prior = mkRows_(saved.table, row => String(row[12]) === String(saved.row[12]) && row[8]);
    if (prior.length) return mkOwnerReconcile_(book, { table: saved.table, row: prior[0].row, number: prior[0].number });
    const input = JSON.parse(saved.row[4]), review = mkOwnerPrepare_(book, input);
    if (orderRequestDigest_(mkJson_(review)) !== hash) throw new Error('REVIEW_CHANGED: customer, request, menu or pricing changed. Review again.');
    const orders = mkTable_(book, ORDERS_SHEET), items = mkTable_(book, ORDER_ITEMS_SHEET);
    mkRequire_(orders, ['Customer Name (SNAPSHOT)', 'Phone (SNAPSHOT)', 'Postcode (SNAPSHOT)', 'Owner Operation ID']);
    mkRequire_(items, ['List Price (SNAPSHOT)', 'Cook Pay (SNAPSHOT)', 'Cook ID (SNAPSHOT)', 'Customer Unit Price (SNAPSHOT)', 'Line Total (SNAPSHOT)']);
    const orderRow = mkEmptyRows_(orders, 1, [1, 2, 3, 4, 9, 10, 11, 14, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37], 2, 2000)[0];
    const itemRows = mkEmptyRows_(items, review.quote.items.length, [1, 4, 7, 14, 18, 23, 24, 25, 26, 27, 28, 29, 30], 3, 5000);
    const journal = mkTable_(book, MK_OWNER.journal), journalRow = journal.sheet.getLastRow() + 1;
    if (journal.rows.some(row => row[3] === 'COMMITTING')) throw new Error('Reconcile the outstanding uncertain order operation before creating another order.');
    const orderId = mkNextOrderId_(orders, journal), now = new Date().toISOString(), operation = 'OWN-' + id;
    const confirmation = mkConfirmation_(review, orderId);
    const requests = mkSetColumns_(orders.sheet, orderRow, { 1: orderId, 2: mkSerial_(new Date()), 3: mkDeliverySerial_(review.deliveryDate),
      4: review.details.customerId, 9: 'Pending', 10: 'Payment Requested', 11: DELIVERY_WINDOW,
      14: operation + (review.details.instructions ? ' | ' + review.details.instructions : ''),
      26: review.quote.discountPercent, 27: review.quote.standardDeliveryFeeCents / 100, 28: review.quote.freeDeliveryThresholdCents / 100,
      29: review.quote.freeDeliveryBasis, 30: review.quote.minimumOrderItems, 31: review.details.address,
      32: review.details.name, 33: review.details.phone, 34: review.details.postcode, 35: review.details.instructions,
      36: review.requestReference, 37: operation });
    review.quote.items.forEach((item, index) => requests.push(...mkSetColumns_(items.sheet, itemRows[index], {
      1: orderId, 4: item.dishName, 7: item.quantity, 14: 'Pending', 18: operation, 23: item.itemCode,
      24: item.listPriceCents / 100, 25: item.cookPayCents / 100, 26: item.cookId, 27: item.kitchenName,
      28: item.menuLineId, 29: item.unitPriceCents / 100, 30: item.lineTotalCents / 100 })));
    requests.push(...mkOwnerRowFormulaRequests_(orders.sheet, orderRow, items.sheet, itemRows));
    requests.push(...mkSetColumns_(saved.table.sheet, saved.number, { 4: 'RECORDED', 8: now, 9: orderId, 10: confirmation }));
    if (review.requestReference) {
      const request = mkOwnerRequest_(book, review.requestReference), found = request.found;
      requests.push(...mkSetColumns_(found.sheet, found.rowNumber, { 9: 'ACCEPTED', 10: review.details.customerId, 14: review.quote.discountPercent,
        15: orderId, 17: now, 19: now }), orderRequestOwnerEventRequest_(book, found.row, 'REQUEST_ACCEPTED', {
          orderId: orderId, reviewId: id, customerId: review.details.customerId, revisedItems: review.quote.items,
          revisionReason: review.details.revisionReason, discountReason: review.details.discountReason,
          lateReason: review.details.lateReason, capacityReason: review.details.capacityReason }));
    }
    requests.push(orderRequestUpdateCells_(journal.sheet, journalRow - 1, [[operation, id, orderId, 'RECORDED', now, now, 'Atomic operational commit']], MK_OWNER_HEADERS[MK_OWNER.journal].length));
    // Persist the planned ID first. An uncertain response is reconciled by this
    // durable identity, never by creating a replacement order.
    Sheets.Spreadsheets.batchUpdate({ requests: [
      ...mkSetColumns_(saved.table.sheet, saved.number, { 4: 'COMMITTING', 8: now, 9: orderId }),
      orderRequestUpdateCells_(journal.sheet, journalRow - 1, [[operation, id, orderId, 'COMMITTING', now, now, 'Waiting for atomic commit']], MK_OWNER_HEADERS[MK_OWNER.journal].length)
    ] }, book.getId());
    try { Sheets.Spreadsheets.batchUpdate({ requests: requests }, book.getId()); }
    catch (_) { throw new Error('SUBMISSION_UNCERTAIN: use Check saved order. Do not create another order.'); }
    return mkOwnerReconcile_(book, mkOwnerFindReview_(book, id));
  });
}

function mkOwnerReconcile_(book, saved) {
  const orderId = String(saved.row[8] || '');
  if (!orderId) throw new Error('This review has no planned order.');
  const orders = mkTable_(book, ORDERS_SHEET), found = mkUnique_(orders, 0, orderId);
  const items = mkTable_(book, ORDER_ITEMS_SHEET);
  let lines = items.rows.filter(row => String(row[0]) === orderId);
  const operation = 'OWN-' + saved.row[0];
  if (!found || String(found.row[36] || '') !== operation) {
    if (found || lines.length) throw new Error('RECONCILIATION_REQUIRED: partial or mismatched operational records. Do not create another order.');
    return { orderId: orderId, state: 'UNCERTAIN', reviewId: String(saved.row[0]), confirmation: '',
      message: 'No matching order is visible yet. Wait seven minutes, then use Recover unsaved review.' };
  }
  const review = JSON.parse(saved.row[5]);
  let current = found.row;
  for (let attempt = 0; attempt < 8; attempt++) {
    SpreadsheetApp.flush();
    current = orders.sheet.getRange(found.number, 1, 1, 37).getValues()[0];
    if (String(current[23]) === 'OK') break;
    Utilities.sleep(200);
  }
  const expected = review.quote.items;
  lines = mkTable_(book, ORDER_ITEMS_SHEET).rows.filter(row => String(row[0]) === orderId);
  const snapshotsOK = lines.length === expected.length && expected.every(item => lines.some(line => String(line[27]) === item.menuLineId &&
    String(line[22]) === item.itemCode && String(line[25]) === item.cookId && Number(line[6]) === item.quantity &&
    Math.round(Number(line[23]) * 100) === item.listPriceCents && Math.round(Number(line[24]) * 100) === item.cookPayCents &&
    Math.round(Number(line[28]) * 100) === item.unitPriceCents && Math.round(Number(line[29]) * 100) === item.lineTotalCents &&
    String(line[4]) === item.itemCode && String(line[5]) === item.cookId && Math.round(Number(line[8]) * 100) === item.listPriceCents &&
    Math.round(Number(line[9]) * 100) === item.unitPriceCents && Math.round(Number(line[10]) * 100) === item.cookPayCents &&
    Math.round(Number(line[11]) * 100) === item.lineTotalCents && Math.round(Number(line[12]) * 100) === item.cookPayCents * item.quantity));
  const request = review.requestReference ? mkOwnerRequest_(book, review.requestReference) : null;
  const okay = snapshotsOK && String(current[8]) !== 'Cancelled' && String(current[23]) === 'OK' && String(current[22]) === 'OK' &&
    typeof current[11] === 'number' && typeof current[17] === 'number' && String(current[4]) === review.details.name &&
    String(current[5]) === review.details.phone && String(current[6]) === review.details.address && String(current[7]) === review.details.postcode &&
    Math.round(Number(current[11]) * 100) === review.quote.totalCents && Math.round(Number(current[17]) * 100) === review.quote.cookPayoutCents &&
    Number(current[19]) === review.quote.totalQuantity && (!request || request.linkedOrderId === orderId);
  const state = okay ? 'VERIFIED' : 'REVIEW_REQUIRED';
  Sheets.Spreadsheets.batchUpdate({ requests: mkSetColumns_(saved.table.sheet, saved.number, { 4: state, 8: new Date().toISOString() }) }, book.getId());
  return { orderId: orderId, reviewId: String(saved.row[0]), state: state,
    confirmation: okay ? String(saved.row[9]) : '', message: okay ? 'Order saved as Pending with Payment Requested. Copy the saved confirmation and send it manually.' :
      'Order is saved but formula or snapshot checks need review. Do not recreate it or send a confirmation yet.' };
}

function ownerOrderCheck(id) { const book = mkOwnerBook_(); return mkLocked_(() => mkOwnerReconcile_(book, mkOwnerFindReview_(book, id))); }

function ownerOrderRecover(id) {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    const saved = mkOwnerFindReview_(book, id);
    if (String(saved.row[3]) !== 'COMMITTING' || Date.now() - Date.parse(String(saved.row[7])) < 420000)
      throw new Error('Recovery is only available seven minutes after an uncertain commit.');
    const orders = mkTable_(book, ORDERS_SHEET), items = mkTable_(book, ORDER_ITEMS_SHEET), operation = 'OWN-' + id, orderId = String(saved.row[8]);
    if (orders.rows.some(row => String(row[0]) === orderId || String(row[36]) === operation) ||
        items.rows.some(row => String(row[0]) === orderId || String(row[17]) === operation)) return mkOwnerReconcile_(book, saved);
    Sheets.Spreadsheets.batchUpdate({ requests: mkSetColumns_(saved.table.sheet, saved.number, { 4: 'NOT_RECORDED', 8: new Date().toISOString(), 9: '' }) }, book.getId());
    const journal = mkTable_(book, MK_OWNER.journal), operationRow = mkUnique_(journal, 1, id);
    if (operationRow) Sheets.Spreadsheets.batchUpdate({ requests: mkSetColumns_(journal.sheet, operationRow.number, { 4: 'NOT_RECORDED', 6: new Date().toISOString() }) }, book.getId());
    return { state: 'NOT_RECORDED', message: 'No order or items were written. Review the current form again before accepting.' };
  });
}

function ownerOrderMarkManualSend(id) {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    const saved = mkOwnerFindReview_(book, id);
    if (String(saved.row[3]) !== 'VERIFIED') throw new Error('Verify the saved order before marking a manual send.');
    if (!saved.row[11]) {
      const requests = mkSetColumns_(saved.table.sheet, saved.number, { 12: new Date().toISOString() });
      if (saved.row[1]) {
        const found = orderRequestOwnerFindRow_(book, String(saved.row[1]));
        requests.push(orderRequestOwnerEventRequest_(book, found.row, 'MANUAL_CONFIRMATION_MARKED', { orderId: String(saved.row[8]), providerReceipt: false }));
      }
      Sheets.Spreadsheets.batchUpdate({ requests: requests }, book.getId());
    }
    return { ok: true, message: 'Manual send marked by owner. This is not a provider delivery or read receipt.' };
  });
}

function ownerOrderLoadReview(id) {
  const saved = mkOwnerFindReview_(mkOwnerBook_(), id);
  return { id: String(saved.row[0]), hash: String(saved.row[2]), state: String(saved.row[3]), input: JSON.parse(saved.row[4]),
    review: JSON.parse(saved.row[5]), orderId: String(saved.row[8] || '') };
}

function ownerOrderExpire(reference) {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    const found = orderRequestOwnerFindRow_(book, reference), today = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyy-MM-dd');
    if (found.row[14] || !['UNASSIGNED', 'RECEIVED', 'UNDER_REVIEW'].includes(String(found.row[8])) || String(found.row[7]) >= today)
      throw new Error('Only an unaccepted request whose delivery date has passed can expire.');
    Sheets.Spreadsheets.batchUpdate({ requests: [...mkSetColumns_(found.sheet, found.rowNumber, { 9: 'EXPIRED', 17: new Date().toISOString() }),
      orderRequestOwnerEventRequest_(book, found.row, 'REQUEST_EXPIRED', { reason: 'Delivery date passed; no linked order.' })] }, book.getId());
    return { ok: true };
  });
}


// SOURCE: OwnerCustomers.gs
/* Customer intake is a separate, durable owner action before order review. */
function mkCustomerBaseline_(customers) {
  const baseline = {};
  customers.forEach(customer => {
    if (baseline[customer.id]) throw new Error('Duplicate Customer ID. Reconcile the registry first.');
    baseline[customer.id] = String(customer.phone);
  });
  return baseline;
}

function mkCustomerIdsUnchanged_(baseline, customers) {
  const current = mkCustomerBaseline_(customers);
  return Object.keys(baseline).every(id => current[id] === baseline[id]);
}

function ownerOrderSaveCustomer(input, operationId) {
  const book = mkOwnerBook_();
  if (typeof operationId !== 'string' || !/^[a-f0-9-]{36}$/i.test(operationId)) throw new Error('Invalid customer operation identity.');
  const details = mkOwnerDetails_(input), payloadHash = orderRequestDigest_(mkJson_(details));
  return mkLocked_(() => {
    const operations = mkTable_(book, MK_OWNER.customers);
    let operation = mkUnique_(operations, 0, operationId), baseline, customers = mkCustomers_(book), customer;
    if (operation) {
      if (String(operation.row[1]) !== payloadHash) throw new Error('CUSTOMER_OPERATION_CONFLICT: these details differ from the saved attempt.');
      baseline = JSON.parse(operation.row[3]);
      const matches = customers.filter(value => { try { return mkPhone_(value.phone) === details.phone; } catch (_) { return false; } });
      if (matches.length > 1) throw new Error('DUPLICATE_CUSTOMER_PHONE: no order has been created.');
      customer = matches[0] || null;
      if (customer && !details.customerId && baseline[customer.id]) throw new Error('An existing customer unexpectedly matched the new customer attempt. Reconcile the registry.');
      if (customer && operation.row[5] && String(operation.row[5]) !== customer.id) throw new Error('Customer operation identity changed.');
    } else {
      customer = mkCustomerMatch_(customers, details.phone, details.customerId);
      if (customer && details.name !== customer.name) throw new Error('Existing customer name differs. Reload the saved customer.');
      if (!customer && customers.length >= 999) throw new Error('Customer formula range is full. Extend and verify the registry and customer ranges before adding another customer.');
      if (customer && !details.updateDefault && details.consent === 'KEEP') return { status: 'READY', customer: customer };
      baseline = mkCustomerBaseline_(customers);
      const intake = mkTable_(book, CUSTOMER_INTAKE_SHEET);
      mkRequire_(intake, ['Submission ID', 'Submitted at', 'First name', 'Mobile number', 'Suburb or postcode',
        'WhatsApp Contact (Yes, Ma Kitchens can contact me on WhatsApp about my free meal claim and order)']);
      const now = new Date(), submissionId = 'OWN-CUSTOMER-' + operationId;
      if (intake.rows.some(row => String(row[0]) === submissionId)) throw new Error('Customer operation journal is missing. Reconcile this intake attempt.');
      const previous = customer ? intake.rows.filter(row => String(row[4]) === customer.phone)
        .sort((a, b) => new Date(b[2]).getTime() - new Date(a[2]).getTime())[0] : null;
      if (customer && !previous) throw new Error('Existing customer intake record could not be verified.');
      const values = previous ? previous.slice(0, 19) : Array(19).fill('');
      const latestTime = intake.rows.reduce((maximum, row) => {
        const date = row[2] instanceof Date ? row[2].getTime() : NaN;
        return Number.isFinite(date) ? Math.max(maximum, date) : maximum;
      }, now.getTime());
      const submitted = new Date(Math.max(now.getTime(), latestTime + 1000));
      values[0] = submissionId; values[1] = submissionId; values[2] = mkSerial_(submitted);
      values[3] = details.name; values[4] = customer ? customer.phone : '+' + details.phone;
      if (!customer || details.updateDefault) values[5] = details.postcode;
      values[8] = details.consent === 'KEEP' ? customer.consent === 'Y' : details.consent === 'YES';
      values[9] = 'owner_order_workspace'; values[10] = 'owner_order_workspace';
      values[18] = 'Owner customer operation ' + operationId;
      const intakeRow = mkEmptyRows_(intake, 1, [1, 2, 3, 4, 5], 2, intake.sheet.getMaxRows())[0];
      const operationNumber = operations.sheet.getLastRow() + 1, nowIso = now.toISOString();
      Sheets.Spreadsheets.batchUpdate({ requests: [orderRequestUpdateCells_(intake.sheet, intakeRow - 1, [values], 19),
        orderRequestUpdateCells_(operations.sheet, operationNumber - 1, [[operationId, payloadHash, details.phone, mkJson_(baseline),
          'INTAKE_SAVED', customer ? customer.id : '', nowIso]], MK_OWNER_HEADERS[MK_OWNER.customers].length)] }, book.getId());
      operation = { number: operationNumber, row: [operationId, payloadHash, details.phone, mkJson_(baseline), 'INTAKE_SAVED', customer ? customer.id : '', nowIso] };
    }
    // Formula-driven registry must finish without renumbering historical IDs.
    let matched = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      SpreadsheetApp.flush(); customers = mkCustomers_(book);
      if (!mkCustomerIdsUnchanged_(baseline, customers)) throw new Error('CUSTOMER_ID_REVIEW_REQUIRED: existing IDs shifted. No order has been created.');
      const matches = customers.filter(value => { try { return mkPhone_(value.phone) === details.phone; } catch (_) { return false; } });
      if (matches.length > 1) throw new Error('DUPLICATE_CUSTOMER_PHONE: no order has been created.');
      if (matches.length === 1 && matches[0].name === details.name && (details.consent === 'KEEP' || (matches[0].consent === 'Y') === (details.consent === 'YES'))) {
        matched = matches[0]; break;
      }
      Utilities.sleep(250);
    }
    if (!matched) return { status: 'PENDING', message: 'Customer intake is saved. Registry recalculation is pending. Retry this same saved action; no order has been created.' };
    const customerTable = mkTable_(book, CUSTOMERS_SHEET), requests = [];
    if (!details.customerId || details.updateDefault) requests.push(orderRequestCellUpdate_(customerTable.sheet, matched.rowNumber,
      customerTable.headers['Default Delivery Address'] + 1, details.address));
    requests.push(...mkSetColumns_(operations.sheet, operation.number, { 5: 'READY', 6: matched.id, 7: new Date().toISOString() }));
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, book.getId());
    if (!details.customerId || details.updateDefault) matched.address = details.address;
    return { status: 'READY', customer: matched };
  });
}


// SOURCE: OwnerOrderSetup.gs
/* Test-only schema migration. Historical rows retain their original formula fallback. */
const MK_OWNER_FORMULA_BASELINE = {
  "Orders!E2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!B$2:B$1000,\"\")))",
  "Orders!F2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!C$2:C$1000,\"\")))",
  "Orders!H2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!E$2:E$1000,\"\")))",
  "Order Items!F2": "=MAP(B2:B5000,E2:E5000,LAMBDA(dt,code,IF(code=\"\",\"\",IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!F$2:F$1000,\"\")))))",
  "Order Items!I2": "=MAP(B2:B5000,E2:E5000,LAMBDA(dt,code,IF(code=\"\",\"\",IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!I$2:I$1000,\"\")))))",
  "Order Items!K2": "=ARRAYFORMULA(IF(E2:E5000=\"\",\"\",XLOOKUP(E2:E5000,Dishes!A$2:A$500,Dishes!F$2:F$500,\"\")))"
};
const MK_OWNER_FORMULA_SNAPSHOTS = {
  "Orders!E2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AF2:AF2000<>\"\",AF2:AF2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!B$2:B$1000,\"\"))))",
  "Orders!F2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AG2:AG2000<>\"\",AG2:AG2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!C$2:C$1000,\"\"))))",
  "Orders!H2": "=ARRAYFORMULA(IF(D2:D2000=\"\",\"\",IF(AH2:AH2000<>\"\",AH2:AH2000,XLOOKUP(D2:D2000,Customers!A$2:A$1000,Customers!E$2:E$1000,\"\"))))",
  "Order Items!F2": "=MAP(B2:B5000,E2:E5000,Z2:Z5000,LAMBDA(dt,code,snapshot,IF(code=\"\",\"\",IF(snapshot<>\"\",snapshot,IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!F$2:F$1000,\"\"))))))",
  "Order Items!I2": "=MAP(B2:B5000,E2:E5000,X2:X5000,LAMBDA(dt,code,snapshot,IF(code=\"\",\"\",IF(snapshot<>\"\",snapshot,IF(dt=\"\",\"\",XLOOKUP(\"ML-\"&TEXT(dt,\"yyyymmdd\")&\"-\"&code,'Weekly Menu'!A$2:A$1000,'Weekly Menu'!I$2:I$1000,\"\"))))))",
  "Order Items!K2": "=ARRAYFORMULA(IF(E2:E5000=\"\",\"\",IF(Y2:Y5000<>\"\",Y2:Y5000,XLOOKUP(E2:E5000,Dishes!A$2:A$500,Dishes!F$2:F$500,\"\"))))"
};
const MK_OWNER_ORDER_COLUMNS = ['Customer Name (SNAPSHOT)', 'Phone (SNAPSHOT)', 'Postcode (SNAPSHOT)', 'Delivery Instructions (SNAPSHOT)', 'Request Reference (SNAPSHOT)', 'Owner Operation ID'];
const MK_OWNER_ITEM_COLUMNS = ['List Price (SNAPSHOT)', 'Cook Pay (SNAPSHOT)', 'Cook ID (SNAPSHOT)', 'Kitchen Name (SNAPSHOT)', 'Menu Line ID (SNAPSHOT)', 'Customer Unit Price (SNAPSHOT)', 'Line Total (SNAPSHOT)'];

function setupOwnerOrderWorkspace() {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    if (ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() !== 'orderRequestInboxOnOpen_'))
      throw new Error('The test project contains other triggers. Use an isolated test project before installing this workspace.');
    // Validate everything before issuing the grouped schema mutation.
    const changes = [], owner = book.getOwner().getEmail();
    Object.keys(MK_OWNER_HEADERS).forEach(name => {
      const sheet = book.getSheetByName(name);
      if (sheet) {
        const actual = sheet.getRange(1, 1, 1, MK_OWNER_HEADERS[name].length).getDisplayValues()[0];
        if (actual.some((value, i) => value && value !== MK_OWNER_HEADERS[name][i])) throw new Error('Owner workspace schema differs: ' + name);
      }
    });
    Object.keys(MK_OWNER_FORMULA_BASELINE).forEach(key => {
      const split = key.lastIndexOf('!'), name = key.slice(0, split), cell = key.slice(split + 1);
      const sheet = book.getSheetByName(name);
      if (!sheet) throw new Error('Missing operational sheet: ' + name);
      const current = sheet.getRange(cell).getFormula();
      if (current !== MK_OWNER_FORMULA_BASELINE[key] && current !== MK_OWNER_FORMULA_SNAPSHOTS[key]) throw new Error('Formula differs at ' + key + '. Review the test baseline before setup.');
    });
    for (const definition of [[ORDERS_SHEET, 32, MK_OWNER_ORDER_COLUMNS], [ORDER_ITEMS_SHEET, 24, MK_OWNER_ITEM_COLUMNS]]) {
      const sheet = book.getSheetByName(definition[0]), first = definition[1], columns = definition[2];
      const existingWidth = Math.max(0, Math.min(columns.length, sheet.getMaxColumns() - first + 1));
      const actual = existingWidth ? sheet.getRange(1, first, 1, existingWidth).getDisplayValues()[0] : [];
      if (actual.some((value, i) => value && value !== columns[i])) throw new Error('Snapshot destination is occupied: ' + definition[0]);
      const needed = first + columns.length - 1;
      if (sheet.getMaxColumns() < needed) changes.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', length: needed - sheet.getMaxColumns() } });
      columns.forEach((name, i) => changes.push(orderRequestCellUpdate_(sheet, 1, first + i, name)));
    }
    Object.keys(MK_OWNER_FORMULA_SNAPSHOTS).forEach(key => {
      const split = key.lastIndexOf('!'), sheet = book.getSheetByName(key.slice(0, split)), range = sheet.getRange(key.slice(split + 1));
      changes.push(mkFormulaCell_(sheet, range.getRow(), range.getColumn(), MK_OWNER_FORMULA_SNAPSHOTS[key]));
    });
    Sheets.Spreadsheets.batchUpdate({ requests: changes }, book.getId());
    Object.keys(MK_OWNER_HEADERS).forEach(name => {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      sheet.getRange(1, 1, 1, MK_OWNER_HEADERS[name].length).setValues([MK_OWNER_HEADERS[name]]);
      sheet.setFrozenRows(1);
      const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (!protections.length) {
        const protection = sheet.protect().setDescription('Private owner order ledger');
        protection.addEditor(owner);
        const others = protection.getEditors().filter(editor => editor.getEmail() !== owner);
        if (others.length) protection.removeEditors(others);
        if (protection.canDomainEdit()) protection.setDomainEdit(false);
      }
    });
    orderRequestInboxOnOpen_();
    return { ok: true, environment: 'TEST', message: 'Owner workspace installed in test copy only.' };
  });
}

function mkFormulaCell_(sheet, row, column, formula) {
  const request = orderRequestCellUpdate_(sheet, row, column, '');
  request.updateCells.rows[0].values[0] = { userEnteredValue: { formulaValue: formula } };
  return request;
}

function mkOwnerRowFormulaRequests_(orders, orderRow, items, itemRows) {
  for (const column of [16, 17, 20, 21, 22]) if (!orders.getRange(orderRow, column).getFormula())
    throw new Error('Order formula coverage is missing at row ' + orderRow + '. Extend the formulas first.');
  const requests = [];
  itemRows.forEach(row => {
    for (const column of [8, 10, 12, 13, 19, 20, 21, 22]) if (!items.getRange(row, column).getFormula())
      throw new Error('Order item formula coverage is missing at row ' + row + '. Extend the formulas first.');
    const unit = items.getRange(row, 10).getFormula(), total = items.getRange(row, 12).getFormula();
    requests.push(mkFormulaCell_(items, row, 10, '=IF(AC' + row + '<>"",AC' + row + ',' + unit.slice(1) + ')'));
    requests.push(mkFormulaCell_(items, row, 12, '=IF(AD' + row + '<>"",IF(OR(C' + row + '="Cancelled",N' + row + '="Cancelled"),0,AD' + row + '),' + total.slice(1) + ')'));
  });
  return requests;
}



// SOURCE: OrderingMenuPublisher.gs
/* Ma Kitchens ordering snapshot publisher, preview candidate.
 * Publishes public menu JSON and the private authoritative menu state.
 * Does not send WhatsApp messages. This version refuses the production branch.
 */
const MK_ORDER_PUBLISH = Object.freeze({
  repository: 'zsadiq79/ma-kitchens-website', branch: 'codex/order-request-capture-preview',
  path: 'data/published-order-menu.json', timezone: 'Australia/Sydney'
});

function mkOrderPublishOwner_() {
  const owner = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID).getOwner();
  if (!owner || Session.getEffectiveUser().getEmail() !== owner.getEmail()) throw new Error('ORDER_PUBLISH_OWNER_REQUIRED');
}

/* Current editor setup helpers, retained for the preview candidate. */
function configureOrderingPublisherPreview() {
  mkOrderPublishOwner_();
  PropertiesService.getScriptProperties().setProperty('ORDER_MENU_GITHUB_BRANCH', MK_ORDER_PUBLISH.branch);
  return { ok: true, branch: MK_ORDER_PUBLISH.branch };
}

function saveOrderingPublisherSettings() {
  mkOrderPublishOwner_();
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Menu publisher setup', 'Paste your GitHub token here. Do not share this dialog.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const token = response.getResponseText().trim();
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new Error('Paste the complete fine-grained GitHub token.');
  const props = PropertiesService.getScriptProperties();
  props.setProperties({ ORDER_MENU_GITHUB_TOKEN: token, ORDER_MENU_GITHUB_BRANCH: MK_ORDER_PUBLISH.branch }, false);
  if (props.getProperty('ORDER_MENU_GITHUB_TOKEN') !== token) throw new Error('Token was not saved.');
  return { ok: true, branch: MK_ORDER_PUBLISH.branch };
}

function configureOrderingPublisherProduction() {
  throw new Error('PRODUCTION_SWITCH_DISABLED_IN_PREVIEW_CANDIDATE');
}

function mkOrderImagePath_(value) {
  const path = typeof value === 'string' ? value.trim().replace(/^https:\/\/(?:www\.)?makitchens\.com\.au(?=\/)/, '') : '';
  return /^\/menu-images\/[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpe?g|png|webp)$/i.test(path) ? path : '';
}

function mkOrderBeforeCutoff_(deliveryDate, now) {
  const cutoffDay = new Date(Date.parse(deliveryDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const today = Utilities.formatDate(now, MK_ORDER_PUBLISH.timezone, 'yyyy-MM-dd');
  return today < cutoffDay || (today === cutoffDay && Number(Utilities.formatDate(now, MK_ORDER_PUBLISH.timezone, 'HH')) < 22);
}

function mkOrderHexDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function mkOrderPublicItemId_(menuLineId) {
  return 'i_' + mkOrderHexDigest_('MK_ORDER_ITEM|' + menuLineId).slice(0, 24);
}

function mkOrderSnapshot_(menu, now) {
  const date = menu && menu.deliveryDate;
  if (!menu || menu.status !== 'ACTIVE' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
      !mkOrderBeforeCutoff_(date, now) || menu.menuCycleId !== 'MENU-' + date ||
      !Array.isArray(menu.meals)) throw new Error('NO_ACTIVE_IN_DATE_MENU_TO_PUBLISH');
  const meals = menu.meals.filter(m => Number(m.remainingServings) > 0).map(m => {
    const name = String(m.dishName || '').trim(), price = Number(m.price), display = String(m.priceDisplay || '').trim();
    const menuLineId = String(m.menuLineId || '').trim();
    if (!name || name.length > 150 || /[\r\n\u0000-\u001f]/.test(name) || !Number.isFinite(price) || price <= 0 || price > 10000)
      throw new Error('INVALID_DISH_FOR_ORDER_MESSAGE');
    if (!/^ML-\d{8}-[A-Za-z0-9_-]{1,40}$/.test(menuLineId) || menuLineId.slice(3, 11) !== date.replace(/-/g, ''))
      throw new Error('INVALID_MENU_LINE_ID');
    if (display && (!/^\$\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(display) || Math.abs(Number(display.slice(1).replace(/,/g, '')) - price) > 0.005))
      throw new Error('INVALID_PRICE_FOR_ORDER_MESSAGE');
    const result = { id: mkOrderPublicItemId_(menuLineId), dishName: name, price: price };
    result.menuLineId = menuLineId;
    if (display) result.priceDisplay = display;
    const image = mkOrderImagePath_(m.imageUrl);
    if (image) result.imageUrl = image;
    return result;
  });
  if (!meals.length || meals.length > 100) throw new Error('NO_AVAILABLE_DISHES_TO_PUBLISH');
  const rules = getOrderingRules_();
  const publicMeals = meals.map(({ menuLineId, ...meal }) => meal);
  const minimumOrderItems = Number(rules.minimumOrderItems);
  const deliveryFeeCents = Math.round(Number(rules.deliveryFee) * 100);
  if (!Number.isInteger(minimumOrderItems) || minimumOrderItems < 1 || !Number.isInteger(deliveryFeeCents) || deliveryFeeCents < 0)
    throw new Error('INVALID_PUBLIC_ORDERING_RULES');
  const stableMenu = [menu.menuCycleId, date, minimumOrderItems, deliveryFeeCents,
    meals.map(m => [m.id, m.dishName, Math.round(m.price * 100), m.imageUrl || ''])];
  const menuRevision = mkOrderHexDigest_(JSON.stringify(stableMenu));
  return { schemaVersion: 2, menuRevision: menuRevision, minimumOrderItems: minimumOrderItems, deliveryFeeCents: deliveryFeeCents,
    publishedAt: now.toISOString(), menuCycleId: menu.menuCycleId, deliveryDate: date,
    deliveryDateDisplay: menu.deliveryDateDisplay || date, meals: publicMeals };
}

function previewCurrentOrderingMenu() {
  mkOrderPublishOwner_();
  const result = mkOrderSnapshot_(buildActiveMenu_(), new Date());
  const summary = { menuCycleId: result.menuCycleId, deliveryDate: result.deliveryDate, dishCount: result.meals.length,
    dishes: result.meals.map(m => m.dishName + ' - $' + m.price.toFixed(2)) };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function mkOrderGithub_(method, url, token, payload) {
  let response;
  try {
    response = UrlFetchApp.fetch(url, { method: method, contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
      ...(payload ? { payload: JSON.stringify(payload) } : {}), muteHttpExceptions: true, followRedirects: false });
  } catch (_) { throw new Error('ORDER_PUBLISH_TRANSPORT_UNCERTAIN_CHECK_GITHUB_BEFORE_RETRY'); }
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('ORDER_PUBLISH_GITHUB_HTTP_' + status);
  try { return JSON.parse(response.getContentText()); } catch (_) { throw new Error('ORDER_PUBLISH_RESPONSE_UNCERTAIN_CHECK_GITHUB'); }
}

function publishCurrentOrderingMenu() {
  mkOrderPublishOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_PUBLISH_BUSY_RETRY_LATER');
  try {
    // Build once under the same lock used by the existing order writers.
    const menu = buildActiveMenu_();
    const snapshot = mkOrderSnapshot_(menu, new Date());
    mkOrderRequireMenuStateSheet_();
    return mkOrderWriteSnapshot_(snapshot, menu);
  } finally { lock.releaseLock(); }
}

function withdrawPublishedOrderingMenu() {
  mkOrderPublishOwner_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_PUBLISH_BUSY_RETRY_LATER');
  try { mkOrderRequireMenuStateSheet_(); return mkOrderWriteSnapshot_({ schemaVersion: 2, withdrawn: true, publishedAt: new Date().toISOString() }, null); }
  finally { lock.releaseLock(); }
}

function mkOrderRequireMenuStateSheet_() {
  const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName('Order Menu State');
  if (!sheet) throw new Error('ORDER_REQUEST_SETUP_REQUIRED');
  const width = 18, header = MK_ORDER_REQUEST_HEADERS['Order Menu State'];
  const currentHeaders = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(value => String(value || '').trim());
  if (header.some((value, index) => currentHeaders[index] !== value)) throw new Error('ORDER_MENU_STATE_HEADER_MISMATCH');
  return { spreadsheet, sheet, width, header };
}

function mkOrderSavePublishedState_(snapshot, sourceMenu) {
  const ready = mkOrderRequireMenuStateSheet_();
  const { spreadsheet, sheet, width, header } = ready;
  const sourceById = {};
  (sourceMenu && sourceMenu.meals || []).forEach(meal => { sourceById[mkOrderPublicItemId_(String(meal.menuLineId || ''))] = meal; });
  const active = !snapshot.withdrawn;
  const stateRow = ['STATE', active ? snapshot.menuRevision : '', active ? snapshot.menuCycleId : '', active ? snapshot.deliveryDate : '',
    snapshot.publishedAt, active ? 'ACTIVE' : 'WITHDRAWN', '', '', '', '', '', '', '', '', '', '',
    active ? snapshot.minimumOrderItems : '', active ? snapshot.deliveryFeeCents : ''];
  const rows = [stateRow];
  if (active) snapshot.meals.forEach(meal => {
    const source = sourceById[meal.id];
    if (!source || !String(source.menuLineId || '')) throw new Error('ORDER_MENU_STATE_SOURCE_MISMATCH');
    rows.push(['ITEM', snapshot.menuRevision, snapshot.menuCycleId, snapshot.deliveryDate, snapshot.publishedAt, 'ACTIVE', meal.id,
      source.menuLineId, source.itemCode, source.cookId, source.kitchenName, source.dishName,
      Math.round(Number(source.price) * 100), Math.round(Number(source.cookPay || 0) * 100), Number(source.remainingServings || 0), meal.imageUrl || '',
      snapshot.minimumOrderItems, snapshot.deliveryFeeCents]);
  });
  const endRowCount = Math.max(sheet.getLastRow(), rows.length + 1);
  const blankRows = Array.from({ length: endRowCount }, () => ({ values: Array.from({ length: width }, () => ({})) }));
  const dataRows = rows.map(row => ({ values: Array.from({ length: width }, (_, index) => {
    const value = row[index];
    if (value === '' || value === null || value === undefined) return {};
    if (typeof value === 'number' && Number.isFinite(value)) return { userEnteredValue: { numberValue: value } };
    return { userEnteredValue: { stringValue: String(value) } };
  }) }));
  Sheets.Spreadsheets.batchUpdate({ requests: [
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: 0, columnIndex: 0 }, rows: blankRows, fields: 'userEnteredValue' } },
    { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: 0, columnIndex: 0 }, rows: [
      { values: header.map(value => ({ userEnteredValue: { stringValue: value } })) }, ...dataRows
    ], fields: 'userEnteredValue' } }
  ] }, spreadsheet.getId());
}

function mkOrderWriteSnapshot_(snapshot, sourceMenu) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('ORDER_MENU_GITHUB_TOKEN');
  if (!token || /[\r\n]/.test(token)) throw new Error('SET_ORDER_MENU_GITHUB_TOKEN_PRIVATELY');
  const branch = props.getProperty('ORDER_MENU_GITHUB_BRANCH') || MK_ORDER_PUBLISH.branch;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,150}$/.test(branch) || branch.includes('..')) throw new Error('INVALID_PUBLISH_BRANCH');
  if (branch === 'main') throw new Error('PREVIEW_BUILD_CANNOT_WRITE_PRODUCTION_BRANCH');
  const api = 'https://api.github.com/repos/' + MK_ORDER_PUBLISH.repository + '/contents/' + MK_ORDER_PUBLISH.path;
  // This file is created by the website PR. GET failure never guesses a SHA or retries a write.
  const current = mkOrderGithub_('get', api + '?ref=' + encodeURIComponent(branch), token);
  if (!current || current.type !== 'file' || !/^[a-f0-9]{40}$/.test(current.sha)) throw new Error('PUBLISH_FILE_NOT_READY');
  const body = JSON.stringify(snapshot, null, 2) + '\n';
  // Ignore publishedAt when deciding whether an identical menu needs another deployment.
  if (current.encoding === 'base64' && typeof current.content === 'string') {
    try {
      const old = JSON.parse(Utilities.newBlob(Utilities.base64Decode(current.content.replace(/\s/g, ''))).getDataAsString());
      const withoutTime = record => { const copy = Object.assign({}, record); delete copy.publishedAt; return copy; };
      if (JSON.stringify(withoutTime(old)) === JSON.stringify(withoutTime(snapshot))) {
        mkOrderSavePublishedState_(snapshot, sourceMenu);
        const result = { changed: false, menuCycleId: snapshot.menuCycleId || '', branch: branch, note: 'Identical menu already committed. Check website deployment status.' };
        console.log(JSON.stringify(result)); return result;
      }
    } catch (_) { /* Replace an invalid old snapshot only with a validated newly built one. */ }
  }
  const response = mkOrderGithub_('put', api, token, { branch: branch, sha: current.sha,
    message: snapshot.withdrawn ? 'Withdraw published WhatsApp ordering menu' : 'Publish WhatsApp ordering menu ' + snapshot.deliveryDate,
    content: Utilities.base64Encode(body, Utilities.Charset.UTF_8) });
  if (!response.commit || typeof response.commit.sha !== 'string') throw new Error('ORDER_PUBLISH_RESPONSE_UNCERTAIN_CHECK_GITHUB');
  mkOrderSavePublishedState_(snapshot, sourceMenu);
  const result = { changed: true, menuCycleId: snapshot.menuCycleId || '', deliveryDate: snapshot.deliveryDate || '',
    menuRevision: snapshot.menuRevision || '', dishCount: snapshot.meals ? snapshot.meals.length : 0, branch: branch, commit: response.commit.sha,
    note: 'Committed. Wait for the Vercel deployment, then verify the ordering link. This is not a live-deployment confirmation.' };
  console.log(JSON.stringify(result)); return result;
}

