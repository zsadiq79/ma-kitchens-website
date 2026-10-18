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

function orderRequestRequireHeaders_(sheet, expected) {
  if (!sheet || !expected) throw new Error('ORDER_REQUEST_NOT_READY');
  const actual = sheet.getRange(1,1,1,expected.length).getValues()[0] || [];
  if (expected.some((value,index)=>String(actual[index]||'').trim() !== value)) throw new Error('ORDER_REQUEST_NOT_READY');
}

function orderRequestReadMenuState_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.menuStateSheet);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('ORDER_REQUEST_NOT_READY');
  const values = sheet.getDataRange().getValues();
  orderRequestRequireHeaders_(sheet,MK_ORDER_REQUEST_HEADERS['Order Menu State']);
  const columns = orderRequestHeaderMap_(values[0]);
  const meta = values.slice(1).find(row => String(row[columns['Record Type']] || '') === 'STATE');
  if (!meta || values.slice(1).filter(row => String(row[columns['Record Type']] || '') === 'STATE').length !== 1) throw new Error('ORDER_REQUEST_NOT_READY');
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
    if (items[id]) throw new Error('MENU_STALE');
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
  const lines = {}, committed = mkCommitted_(spreadsheet, state.deliveryDate);
  mkMenuLines_(spreadsheet,state.deliveryDate).forEach(line => {
    if (lines[line.menuLineId]) throw new Error('MENU_STALE');
    if (!Number.isSafeInteger(line.capacity) || line.capacity < 0) throw new Error('MENU_STALE');
    lines[line.menuLineId] = Object.assign({},line,{id:line.menuLineId,
      remainingServings:Math.max(0,line.capacity-(committed[line.menuLineId]||0))});
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
  const matches = values.filter(row=>String(row[2]||'')===retryKey);
  if (matches.length > 1) throw new Error('REQUEST_CONFLICT');
  return matches[0] || null;
}

function orderRequestCapture_(body) {
  const requestKey = String(body.requestKey || '').toLowerCase();
  const revision = String(body.menuRevision || ''), cycleId = String(body.menuCycleId || ''), deliveryDate = String(body.deliveryDate || '');
  const capability = String(body.recoveryCapability || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestKey) ||
      !/^[a-f0-9]{64}$/.test(revision) || !/^MENU-\d{4}-\d{2}-\d{2}$/.test(cycleId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || !Number.isFinite(Date.parse(deliveryDate+'T00:00:00Z')) ||
      new Date(deliveryDate+'T00:00:00Z').toISOString().slice(0,10) !== deliveryDate || cycleId !== 'MENU-'+deliveryDate ||
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
  items.sort((a,b)=>a.id.localeCompare(b.id));

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('ORDER_REQUEST_BUSY');
  try {
    const spreadsheet = SpreadsheetApp.openById(CONTROL_TOWER_SPREADSHEET_ID);
    const requestSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.requestSheet);
    const itemSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.itemSheet);
    const eventSheet = spreadsheet.getSheetByName(MK_ORDER_REQUEST.eventSheet);
    if (!requestSheet || !itemSheet || !eventSheet) throw new Error('ORDER_REQUEST_NOT_READY');
    [[requestSheet,MK_ORDER_REQUEST.requestSheet],[itemSheet,MK_ORDER_REQUEST.itemSheet],[eventSheet,MK_ORDER_REQUEST.eventSheet]]
      .forEach(([sheet,name])=>orderRequestRequireHeaders_(sheet,MK_ORDER_REQUEST_HEADERS[name]));

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
    if (state.minimumOrderItems !== Number(rules.minimumOrderItems) || state.deliveryFeeCents !== deliveryFeeCents)
      throw new Error('MENU_STALE');
    if (totalQty < Number(rules.minimumOrderItems)) throw new Error('MINIMUM_ORDER_NOT_MET');
    const live = orderRequestLiveLines_(spreadsheet, state);
    const matched = items.map(item => {
      const published = state.items[item.id];
      const line = published && live[published.menuLineId];
      if (!published || !line || line.id !== published.menuLineId || line.cycleId !== cycleId || line.deliveryDate !== deliveryDate ||
          line.itemCode !== published.itemCode || line.priceCents !== published.priceCents || line.menuStatus !== 'Available' ||
          line.dishName !== published.dishName || line.cookId !== published.cookId || line.kitchenName !== published.kitchenName ||
          line.dishStatus !== 'Active' || line.availabilityStatus !== 'Available' || line.readiness !== 'READY') throw new Error('MENU_STALE');
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
    if (row[14] || !['UNASSIGNED', 'RECEIVED', 'UNDER_REVIEW'].includes(String(row[8]))) throw new Error('This request cannot be marked received in its current state.');
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
    if (found.row[14] || !['UNASSIGNED', 'RECEIVED', 'UNDER_REVIEW'].includes(String(found.row[8]))) throw new Error('This request cannot be rejected in its current state.');
    const now = new Date().toISOString();
    Sheets.Spreadsheets.batchUpdate({ requests: [orderRequestCellUpdate_(found.sheet, found.rowNumber, 9, 'REJECTED'),
      orderRequestCellUpdate_(found.sheet, found.rowNumber, 17, now), orderRequestCellUpdate_(found.sheet, found.rowNumber, 21, note),
      orderRequestOwnerEventRequest_(spreadsheet, found.row, 'REQUEST_REJECTED', { reason: note })] }, spreadsheet.getId());
    return { ok: true };
  } finally { lock.releaseLock(); }
}
