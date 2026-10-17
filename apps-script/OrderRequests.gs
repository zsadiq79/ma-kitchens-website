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
  'Order Requests': ['Request ID', 'Request Reference', 'Retry Key', 'Payload Hash', 'Recovery Capability Hash', 'Menu Revision', 'Menu Cycle ID', 'Delivery Date', 'Status', 'Customer ID', 'Public Food Subtotal Cents', 'Public Delivery Fee Cents', 'Public Total Cents', 'Owner Discount Percent', 'Linked Order ID', 'Created At', 'Updated At', 'Received At', 'Accepted At', 'Expires At', 'Owner Notes'],
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
  orderRequestOwner_();
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
    const requestRef = 'MK-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
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
