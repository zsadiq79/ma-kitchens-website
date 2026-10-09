/* Complete replacement. No doPost, triggers, network sends, or automatic setup.
 * All channel writers must use this project's ScriptLock and commit function.
 * Never log request bodies, tokens, URLs, errors, or service credentials.
 */
const FW = Object.freeze({
  legacyHeaders: ['Feedback ID', 'Submitted At', 'Order ID', 'Customer ID', 'Cook ID', 'Item Code', 'Rating / 5', 'Complaint', 'Refund', 'Comments', 'Follow-up Status', 'WhatsApp Message ID'],
  links: 'Feedback V2 Links', orders: 'Feedback V2 Orders', delay: 96 * 60 * 60 * 1000,
  linkHeaders: ['Token Hash', 'Order ID', 'Created At', 'Expires At', 'Status', 'Submitted At', 'Last Page Requested At'],
  orderHeaders: ['Order ID', 'Submission ID', 'Completed At', 'Channel', 'Active Hash', 'Draft JSON', 'Draft Revision', 'Draft Updated At', 'Browser Opened At', 'First Interaction At', 'Draft Window At', 'Draft Writes', 'Event Window At', 'Event Writes', 'Page Requested At', 'Message Attempt ID', 'Message ID', 'Message Accepted At', 'Message Sent At', 'Message Delivered At', 'Message Read At', 'Legacy Message IDs', 'Legacy Comment IDs', 'Page Window At', 'Page Writes'],
  extraHeaders: ['Marketing Consent', 'Marketing Consent At', 'Submission ID', 'Feedback Channel', 'Skipped'],
  actions: ['feedback_read', 'feedback_draft', 'feedback_event', 'feedback_submit']
});
function fwError_(code) { const e = new Error(code); e.code = code; throw e; }
function fwProps_() { return PropertiesService.getScriptProperties(); }
function fwConfig_(name) { const v = fwProps_().getProperty(name); if (!v) fwError_('CONFIGURATION_ERROR'); return v; }
function fwEnabled_() { if (fwProps_().getProperty('FEEDBACK_V2_WRITES_ENABLED') !== 'true' || fwProps_().getProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD') !== 'true') fwError_('TEMPORARY_ERROR'); }
function fwBook_() { const id = fwConfig_('CONTROL_TOWER_SPREADSHEET_ID'); if (id !== CONTROL_TOWER_SPREADSHEET_ID) fwError_('CONFIGURATION_ERROR'); return SpreadsheetApp.openById(id); }
function fwLock_(fn) {
  const lock = LockService.getScriptLock();
  if (lock.hasLock()) return fn(); // Same execution may already hold the shared sender lock.
  if (!lock.tryLock(10000)) fwError_('TEMPORARY_ERROR');
  try { return fn(); } finally { lock.releaseLock(); }
}
function fwObject_(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function fwKeys_(v, allowed, required) {
  if (!fwObject_(v) || Object.keys(v).some(k => allowed.indexOf(k) < 0) || required.some(k => !Object.prototype.hasOwnProperty.call(v, k))) fwError_('INVALID_INPUT');
}
function fwString_(v, max, min) {
  if (typeof v !== 'string' || v.length > max || v.length < (min || 0) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) fwError_('INVALID_INPUT');
  return v;
}
function fwToken_(v) { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v)) fwError_('INVALID_LINK'); return v; }
function fwOrderId_(v) { if (typeof v !== 'string' || !/^ORD-\d{1,20}$/.test(v)) fwError_('INVALID_INPUT'); return v; }
function fwHash_(v) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function fwNewToken_(orderId) {
  const key = fwConfig_('FEEDBACK_TOKEN_SIGNING_KEY');
  if (!/^[a-fA-F0-9]{64,128}$/.test(key)) fwError_('CONFIGURATION_ERROR');
  // HMAC is unpredictable without the independently generated secret key;
  // UUIDs provide uniqueness, not the security assumption.
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(orderId + ':' + Utilities.getUuid() + ':' + Utilities.getUuid(), key)).replace(/=+$/, '');
}
function fwTime_(v) {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : NaN;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)) return NaN;
  return Date.parse(v);
}
function fwTable_(book, name, required) {
  const sheet = book.getSheetByName(name); if (!sheet) fwError_('CONFIGURATION_ERROR');
  const values = sheet.getDataRange().getValues(); const headers = (values[0] || []).map(v => String(v).trim()); const col = Object.create(null);
  headers.forEach((h, i) => { if (h && Object.prototype.hasOwnProperty.call(col, h)) fwError_('CONFIGURATION_ERROR'); col[h] = i; });
  if (required.some(h => !Object.prototype.hasOwnProperty.call(col, h))) fwError_('CONFIGURATION_ERROR');
  return { sheet: sheet, headers: headers, col: col, rows: values.slice(1) };
}
function fwFeedback_(book) {
  const expected = FW.legacyHeaders;
  if (!Array.isArray(expected) || expected.length !== 12 || expected.some(x => typeof x !== 'string' || !x) || new Set(expected).size !== 12) fwError_('CONFIGURATION_ERROR');
  const t = fwTable_(book, 'Feedback', expected);
  if (expected.some((h, i) => t.headers[i] !== h)) fwError_('CONFIGURATION_ERROR');
  return t;
}
function fwSchema_(book) {
  const f = fwFeedback_(book);
  if (FW.extraHeaders.some((h, i) => f.headers[12 + i] !== h)) fwError_('CONFIGURATION_ERROR');
  const links = fwTable_(book, FW.links, FW.linkHeaders), orders = fwTable_(book, FW.orders, FW.orderHeaders);
  if (FW.linkHeaders.some((h, i) => links.headers[i] !== h) || FW.orderHeaders.some((h, i) => orders.headers[i] !== h)) fwError_('CONFIGURATION_ERROR');
  return { feedback: f, links: links, orders: orders };
}
function fwExtended_(v) {
  // Explicit stringValue cells never interpret '=' / '+' / '-' / '@' as formulas.
  if (v === '' || v === null || v === undefined) return {};
  if (v instanceof Date) return { userEnteredValue: { numberValue: Date.parse(Utilities.formatDate(v, fwBook_().getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm:ss.SSS") + 'Z') / 86400000 + 25569 }, userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm:ss' } } };
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
  return { userEnteredValue: { stringValue: String(v) } };
}
function fwUpdate_(sheet, rowNumber, values) {
  return { updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: 0, endColumnIndex: values.length }, rows: [{ values: values.map(fwExtended_) }], fields: 'userEnteredValue' } };
}
function fwCell_(sheet, rowNumber, col, value) {
  return { updateCells: { range: { sheetId: sheet.getSheetId(), startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: col, endColumnIndex: col + 1 }, rows: [{ values: [fwExtended_(value)] }], fields: value instanceof Date ? 'userEnteredValue,userEnteredFormat.numberFormat' : 'userEnteredValue' } };
}
function fwAppend_(sheet, rows) { return { appendCells: { sheetId: sheet.getSheetId(), rows: rows.map(row => ({ values: row.map(fwExtended_) })), fields: 'userEnteredValue,userEnteredFormat.numberFormat' } }; }
function fwBatch_(book, requests) {
  if (!requests.length) return;
  // One atomic Sheets request. Never split rows and completion markers across calls.
  // Do not automatically retry ambiguous transport failures: read persisted state first.
  Sheets.Spreadsheets.batchUpdate({ requests: requests }, book.getId());
}
function fwCapacity_(sheet, rowNumber, columns) {
  const requests = [];
  if (rowNumber > sheet.getMaxRows()) requests.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'ROWS', length: rowNumber - sheet.getMaxRows() } });
  if (columns > sheet.getMaxColumns()) requests.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'COLUMNS', length: columns - sheet.getMaxColumns() } });
  return requests;
}
function fwState_(schema, orderId, create) {
  const t = schema.orders; const matches = [];
  t.rows.forEach((r, i) => { if (r[t.col['Order ID']] === orderId) matches.push({ row: r.slice(), number: i + 2 }); });
  if (matches.length > 1) fwError_('CONFIGURATION_ERROR');
  if (matches.length) { while (matches[0].row.length < FW.orderHeaders.length) matches[0].row.push(''); return matches[0]; }
  if (!create) fwError_('INVALID_LINK');
  const row = FW.orderHeaders.map(() => ''); row[0] = orderId; row[1] = Utilities.getUuid(); row[6] = 0;
  return { row: row, number: t.rows.length + 2 };
}
function fwCompleted_(schema, orderId, state, delivery) {
  const prior = schema.feedback.rows.filter(r => String(r[2]).trim() === orderId);
  if (new Set(prior.map(r => r[5])).size !== prior.length || prior.some(r => !/^(?:FB|FDBK)-\d+$/i.test(String(r[0])))) fwError_('CONFIGURATION_ERROR');
  return !!state.row[2] || schema.feedback.rows.some(r => String(r[2]).trim() === orderId && r[5] === 'DELIVERY') || String(delivery.row[delivery.table.col['Feedback Status']]).toLowerCase() === 'completed' || !!delivery.row[delivery.table.col['Feedback Completed At']];
}
function fwOrder_(book, orderId) {
  const orders = fwTable_(book, 'Orders', ['Order ID', 'Order Status', 'Delivery Date', 'Customer ID', 'Customer Name']);
  const items = fwTable_(book, 'Order Items', ['Order ID', 'Order Status', 'Fulfilment Status', 'Item Code (AUTO, INTERNAL)', 'Qty']);
  const menu = fwTable_(book, 'Dishes', ['Item Code', 'Cook ID', 'Dish Name', 'Menu Kitchen Name', 'Image URL']);
  const deliveries = fwTable_(book, 'Deliveries', ['Order ID', 'Delivery Status', 'Delivered At', 'Feedback Status', 'Feedback Requested At', 'Feedback Completed At', 'Routific ID']);
  const find = t => t.rows.map((row, i) => ({ row: row, number: i + 2 })).filter(x => String(x.row[t.col['Order ID']]).trim() === orderId);
  const o = find(orders), d = find(deliveries);
  if (o.length !== 1 || d.length !== 1) fwError_('INELIGIBLE');
  const value = (t, r, h) => String(r[t.col[h]] || '').trim();
  if (value(orders, o[0].row, 'Order Status').toLowerCase() !== 'confirmed' || value(deliveries, d[0].row, 'Delivery Status').toLowerCase() !== 'delivered') fwError_('INELIGIBLE');
  const deliveredAt = fwTime_(d[0].row[deliveries.col['Delivered At']]);
  if (!Number.isFinite(deliveredAt)) fwError_('INELIGIBLE');
  const eligible = items.rows.filter(r => {
    const qty = r[items.col.Qty];
    return value(items, r, 'Order ID') === orderId && value(items, r, 'Order Status').toLowerCase() !== 'cancelled' && value(items, r, 'Fulfilment Status').toLowerCase() !== 'cancelled' && typeof qty === 'number' && Number.isFinite(qty) && qty > 0;
  });
  const dishes = []; const seen = new Set();
  eligible.forEach(r => {
    const code = value(items, r, 'Item Code (AUTO, INTERNAL)'); if (!/^[A-Za-z0-9_-]{1,80}$/.test(code) || seen.has(code)) return;
    const rows = menu.rows.filter(m => value(menu, m, 'Item Code') === code); if (rows.length !== 1) fwError_('CONFIGURATION_ERROR');
    const m = rows[0]; seen.add(code);
    const image = value(menu, m, 'Image URL');
    // No arbitrary images/referrer destinations from sheet data.
    const imageUrl = /^https:\/\/(?:www\.)?makitchens\.com\.au\/menu-images\/[A-Za-z0-9_.-]+$/.test(image) ? image.replace(/^https:\/\/(?:www\.)?makitchens\.com\.au/, '') : '';
    dishes.push({ itemCode: fwString_(code, 80, 1), dishName: fwString_(value(menu, m, 'Dish Name'), 160, 1), kitchenName: fwString_(value(menu, m, 'Menu Kitchen Name'), 160), imageUrl: imageUrl, cookId: value(menu, m, 'Cook ID') });
  });
  if (!dishes.length || dishes.length > 50) fwError_('INELIGIBLE');
  const date = o[0].row[orders.col['Delivery Date']];
  return { orderId: orderId, customerId: value(orders, o[0].row, 'Customer ID'), customerName: fwString_(value(orders, o[0].row, 'Customer Name'), 160), deliveryDate: date instanceof Date ? Utilities.formatDate(date, book.getSpreadsheetTimeZone(), 'd MMMM yyyy') : String(date || ''), dishes: dishes, deliveredAt: deliveredAt, delivery: { table: deliveries, row: d[0].row, number: d[0].number } };
}
function feedbackV2Eligibility_(order, completed, now) {
  if (completed) return { eligible: false, reason: 'COMPLETED' };
  if (!Number.isFinite(order.deliveredAt) || now < order.deliveredAt + FW.delay) return { eligible: false, reason: 'BEFORE_96_HOURS' };
  return { eligible: true, reason: 'ELIGIBLE' };
}
function fwContext_(book, schema, token, now) {
  const hash = fwHash_(fwToken_(token)); const t = schema.links;
  const found = t.rows.map((row, i) => ({ row: row, number: i + 2 })).filter(x => x.row[0] === hash);
  if (found.length !== 1) fwError_('INVALID_LINK');
  const link = found[0]; const expiry = fwTime_(link.row[3]);
  if (!Number.isFinite(expiry) || now >= expiry) fwError_('EXPIRED');
  if (link.row[4] === 'REVOKED' || link.row[4] === 'REPLACED') fwError_(link.row[4]);
  if (link.row[4] !== 'OPEN' && link.row[4] !== 'COMPLETED') fwError_('INVALID_LINK');
  const state = fwState_(schema, fwOrderId_(link.row[1]), false);
  if (state.row[4] !== hash) fwError_('REPLACED');
  const order = fwOrder_(book, link.row[1]); const completed = fwCompleted_(schema, order.orderId, state, order.delivery);
  if (!completed && !feedbackV2Eligibility_(order, false, now).eligible) fwError_('INELIGIBLE');
  if (!completed && schema.feedback.rows.some(row => String(row[2]).trim() === order.orderId)) fwError_('LEGACY_IN_PROGRESS');
  return { link: link, state: state, order: order, completed: completed };
}
function fwRevision_(v) { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 1000000) fwError_('INVALID_INPUT'); return v; }
function fwPayload_(v, order, draft) {
  fwKeys_(v, ['dishes', 'deliveryRating', 'overallComment', 'testimonialConsent'], ['dishes', 'deliveryRating', 'overallComment', 'testimonialConsent']);
  if (!Array.isArray(v.dishes) || v.dishes.length !== order.dishes.length || typeof v.testimonialConsent !== 'boolean') fwError_('INVALID_INPUT');
  const seen = new Set();
  const dishes = v.dishes.map(item => {
    fwKeys_(item, ['itemCode', 'rating', 'skipped', 'comment'], ['itemCode', 'rating', 'skipped', 'comment']);
    const code = fwString_(item.itemCode, 80, 1);
    if (seen.has(code) || !order.dishes.some(d => d.itemCode === code) || typeof item.skipped !== 'boolean' || typeof item.rating !== 'number' || !Number.isInteger(item.rating) || item.rating < 0 || item.rating > 5 || (!draft && !item.skipped && item.rating === 0) || (item.skipped && item.rating !== 0)) fwError_('INVALID_INPUT');
    seen.add(code); return { itemCode: code, rating: item.rating, skipped: item.skipped, comment: fwString_(item.comment, 600) };
  });
  if (typeof v.deliveryRating !== 'number' || !Number.isInteger(v.deliveryRating) || v.deliveryRating < (draft ? 0 : 1) || v.deliveryRating > 5) fwError_('INVALID_INPUT');
  return { dishes: dishes, deliveryRating: v.deliveryRating, overallComment: fwString_(v.overallComment, 1200), testimonialConsent: v.testimonialConsent };
}
function fwLimit_(row, now, windowIndex, countIndex, limit) {
  const start = fwTime_(row[windowIndex]);
  if (!Number.isFinite(start) || now >= start + 60000) { row[windowIndex] = new Date(now).toISOString(); row[countIndex] = 0; }
  const count = Number(row[countIndex] || 0); if (!Number.isSafeInteger(count) || count < 0 || count >= limit) return false;
  row[countIndex] = count + 1; return true;
}
function fwPublic_(context) {
  const r = context.state.row; let draft = null;
  if (r[5]) { try { draft = fwPayload_(JSON.parse(r[5]), context.order, true); } catch (_) { fwError_('TEMPORARY_ERROR'); } }
  return { customerName: context.order.customerName, deliveryDate: context.order.deliveryDate, orderId: context.order.orderId, status: context.completed ? 'COMPLETED' : 'OPEN', dishes: context.order.dishes.map(d => ({ itemCode: d.itemCode, dishName: d.dishName, kitchenName: d.kitchenName, imageUrl: d.imageUrl })), submissionId: r[1], revision: Number(r[6] || 0), draft: context.completed ? null : draft };
}
function handleFeedbackWebApiRequest_(e, action) {
  const reply = data => ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  try {
    if (FW.actions.indexOf(action) < 0) fwError_('INVALID_INPUT');
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 50000) fwError_('INVALID_INPUT');
    let body; try { body = JSON.parse(raw); } catch (_) { fwError_('INVALID_INPUT'); }
    fwKeys_(body, ['secret', 'token', 'submission', 'revision', 'submissionId', 'event'], ['secret', 'token']);
    const expected = fwConfig_('FLOW_MENU_API_SECRET');
    if (typeof body.secret !== 'string' || body.secret !== expected) fwError_('UNAUTHORISED');
    const required = action === 'feedback_read' ? ['secret', 'token'] : action === 'feedback_event' ? ['secret', 'token', 'event'] : action === 'feedback_submit' ? ['secret', 'token', 'submission', 'revision', 'submissionId'] : ['secret', 'token', 'submission', 'revision'];
    fwKeys_(body, required, required);
    if (action === 'feedback_submit' || action === 'feedback_draft') fwRevision_(body.revision);
    fwEnabled_();
    return reply({ ok: true, result: fwLock_(() => fwRequest_(body, action)) });
  } catch (e) {
    // Only allowlisted codes. No exception messages/stacks or user payload logging.
    const codes = ['INVALID_INPUT', 'INVALID_LINK', 'EXPIRED', 'REVOKED', 'REPLACED', 'COMPLETED', 'CONFLICT', 'RATE_LIMITED', 'INELIGIBLE', 'UNAUTHORISED', 'LEGACY_IN_PROGRESS'];
    return reply({ ok: false, error: codes.indexOf(e.code) >= 0 ? e.code : 'TEMPORARY_ERROR' });
  }
}
function fwRequest_(body, action) {
  const book = fwBook_(), schema = fwSchema_(book), now = Date.now();
  const c = fwContext_(book, schema, body.token, now); const r = c.state.row;
  if (action === 'feedback_read') {
    // Automated requests are explicitly separate from browser/interaction signals.
    if (fwLimit_(r, now, 23, 24, 10)) {
      r[14] = new Date(now).toISOString(); c.link.row[6] = r[14];
      fwBatch_(book, [fwUpdate_(schema.orders.sheet, c.state.number, r), fwUpdate_(schema.links.sheet, c.link.number, c.link.row)]);
    }
    return fwPublic_(c);
  }
  if (action === 'feedback_submit') {
    fwString_(body.submissionId, 80, 1);
    if (c.completed) return { status: 'COMPLETED', submissionId: r[1], alreadyCompleted: true };
    if (body.submissionId !== r[1]) fwError_('CONFLICT');
    if (fwRevision_(body.revision) !== Number(r[6] || 0)) fwError_('CONFLICT');
    return fwCommit_(book, schema, c.order, c.state, fwPayload_(body.submission, c.order, false), 'WEB', now);
  }
  if (c.completed) fwError_('COMPLETED');
  if (action === 'feedback_draft') {
    fwRevision_(body.revision);
    const draft = fwPayload_(body.submission, c.order, true); const encoded = JSON.stringify(draft);
    if (encoded.length > 45000) fwError_('INVALID_INPUT');
    if (encoded === r[5]) return { revision: Number(r[6] || 0) }; // Idempotent retry after lost draft acknowledgement.
    if (body.revision !== Number(r[6] || 0)) fwError_('CONFLICT');
    if (!fwLimit_(r, now, 10, 11, 20)) fwError_('RATE_LIMITED');
    r[5] = encoded; r[6] = Number(r[6] || 0) + 1; r[7] = new Date(now).toISOString();
    fwBatch_(book, [fwUpdate_(schema.orders.sheet, c.state.number, r)]);
    return { revision: r[6] };
  }
  if (action === 'feedback_event') {
    if (['browser_opened', 'first_interaction'].indexOf(body.event) < 0) fwError_('INVALID_INPUT');
    const i = body.event === 'browser_opened' ? 8 : 9;
    if (r[i]) return { recorded: true };
    if (!fwLimit_(r, now, 12, 13, 10)) fwError_('RATE_LIMITED');
    r[i] = new Date(now).toISOString(); fwBatch_(book, [fwUpdate_(schema.orders.sheet, c.state.number, r)]);
    return { recorded: true };
  }
  fwError_('INVALID_INPUT');
}
function fwCommit_(book, schema, order, state, submission, channel, now) {
  if (channel === 'WEB' && schema.feedback.rows.some(r => String(r[2]).trim() === order.orderId)) fwError_('LEGACY_IN_PROGRESS');
  if (fwCompleted_(schema, order.orderId, state, order.delivery)) return { status: 'COMPLETED', submissionId: state.row[1], alreadyCompleted: true };
  let next = 1;
  schema.feedback.rows.forEach(r => { const m = String(r[0]).match(/^(?:FB|FDBK)-(\d+)$/i); if (m) next = Math.max(next, Number(m[1]) + 1); });
  if (!Number.isSafeInteger(next)) fwError_('CONFIGURATION_ERROR');
  const at = new Date(now).toISOString(); const id = state.row[1]; const format = () => 'FB-' + String(next++).padStart(6, '0');
  const existingCodes = new Set(schema.feedback.rows.filter(r => String(r[2]).trim() === order.orderId).map(r => r[5]));
  let legacyIds = {}; try { legacyIds = JSON.parse(state.row[21] || '{}'); } catch (_) { fwError_('CONFIGURATION_ERROR'); }
  const rows = submission.dishes.filter(answer => !existingCodes.has(answer.itemCode)).map(answer => {
    const dish = order.dishes.find(d => d.itemCode === answer.itemCode);
    return [format(), new Date(now), order.orderId, order.customerId, dish.cookId, dish.itemCode, answer.skipped ? '' : answer.rating, !answer.skipped && answer.rating <= 3 ? 'Y' : 'N', 'N', answer.skipped ? "Didn't try this" : answer.comment, !answer.skipped && answer.rating <= 3 ? 'Open' : 'None', channel === 'LEGACY' ? (legacyIds[answer.itemCode] || '') : '', '', '', id, channel, answer.skipped ? 'Y' : 'N'];
  });
  rows.push([format(), new Date(now), order.orderId, order.customerId, '', 'DELIVERY', submission.deliveryRating, 'N', 'N', submission.overallComment, submission.deliveryRating <= 3 ? 'Open' : 'None', channel === 'LEGACY' ? (legacyIds.DELIVERY || '') : '', submission.testimonialConsent ? 'Y' : 'N', submission.testimonialConsent ? new Date(now) : '', id, channel, 'N']);
  const r = state.row; r[2] = at; r[3] = channel; r[5] = ''; r[7] = ''; r[6] = Number(r[6] || 0) + 1;
  const requests = fwCapacity_(schema.orders.sheet, state.number, FW.orderHeaders.length).concat([
    fwAppend_(schema.feedback.sheet, rows), fwUpdate_(schema.orders.sheet, state.number, r),
    fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Status'], 'Completed'),
    fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Completed At'], new Date(now))
  ]);
  schema.links.rows.forEach((link, i) => { if (link[1] === order.orderId && link[4] === 'OPEN') { const updated = link.slice(); updated[4] = 'COMPLETED'; updated[5] = at; requests.push(fwUpdate_(schema.links.sheet, i + 2, updated)); } });
  fwBatch_(book, requests);
  return { status: 'COMPLETED', submissionId: id, alreadyCompleted: false };
}
function feedbackV2SubmitLegacy_(orderId, submission) {
  // Integration boundary: replace ALL actual legacy completion writers with this.
  // Never wrap this in a separate independently acquired ScriptLock.
  fwEnabled_(); fwOrderId_(orderId);
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), order = fwOrder_(book, orderId), state = fwState_(schema, orderId, true);
    if (fwCompleted_(schema, orderId, state, order.delivery)) return { status: 'COMPLETED', submissionId: state.row[1], alreadyCompleted: true };
    if (!feedbackV2Eligibility_(order, false, Date.now()).eligible) fwError_('INELIGIBLE');
    return fwCommit_(book, schema, order, state, fwPayload_(submission, order, false), 'LEGACY', Date.now());
  });
}
function fwCreateLinkLocked_(book, schema, orderId, reserveMessage) {
  const order = fwOrder_(book, orderId), state = fwState_(schema, orderId, true), now = Date.now();
  if (!feedbackV2Eligibility_(order, fwCompleted_(schema, orderId, state, order.delivery), now).eligible) fwError_('INELIGIBLE');
  if (schema.feedback.rows.some(r => String(r[2]).trim() === orderId)) fwError_('LEGACY_IN_PROGRESS');
  if (state.row[15] && (reserveMessage || !state.row[16])) fwError_('MESSAGE_REQUIRES_RECONCILIATION');
  const hours = Number(fwProps_().getProperty('FEEDBACK_LINK_TTL_HOURS') || '720');
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) fwError_('CONFIGURATION_ERROR');
  const base = fwConfig_('FEEDBACK_WEB_BASE_URL');
  if (!/^https:\/\/[^/?#]+\/feedback\/open$/.test(base)) fwError_('CONFIGURATION_ERROR');
  const token = fwNewToken_(orderId), hash = fwHash_(token), at = new Date(now).toISOString();
  const requests = fwCapacity_(schema.orders.sheet, state.number, FW.orderHeaders.length);
  schema.links.rows.forEach((row, i) => { if (row[1] === orderId && row[4] === 'OPEN') { const copy = row.slice(); copy[4] = 'REPLACED'; requests.push(fwUpdate_(schema.links.sheet, i + 2, copy)); } });
  state.row[4] = hash;
  if (reserveMessage) state.row[15] = Utilities.getUuid();
  requests.push(fwAppend_(schema.links.sheet, [[hash, orderId, at, new Date(now + hours * 3600000).toISOString(), 'OPEN', '', '']]), fwUpdate_(schema.orders.sheet, state.number, state.row));
  fwBatch_(book, requests);
  return { url: base + '#' + token, token: token, attemptId: state.row[15], customerName: order.customerName };
}
function getOrCreateFeedbackWebLink_(orderId) {
  // Compatibility name; every explicit issuance replaces the old link atomically.
  fwEnabled_(); fwOrderId_(orderId);
  return fwLock_(() => { const book = fwBook_(); return fwCreateLinkLocked_(book, fwSchema_(book), orderId, false).url; });
}
function createFeedbackWebLinkForOrder(orderId) { return getOrCreateFeedbackWebLink_(orderId); }
function feedbackV2RevokeOrderLinks(orderId) {
  fwOrderId_(orderId);
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), state = fwState_(schema, orderId, false); const requests = [];
    schema.links.rows.forEach((row, i) => { if (row[1] === orderId && row[4] === 'OPEN') { const copy = row.slice(); copy[4] = 'REVOKED'; requests.push(fwUpdate_(schema.links.sheet, i + 2, copy)); } });
    state.row[4] = ''; requests.push(fwUpdate_(schema.orders.sheet, state.number, state.row)); fwBatch_(book, requests);
    return { revoked: true };
  });
}
function feedbackV2Setup() {
  // Operator-run only after auditing source headers/legacy semantics on a COPY.
  return fwLock_(() => {
    const book = fwBook_(), f = fwFeedback_(book), requests = [];
    fwSourceSchema_(book);
    FW.extraHeaders.forEach((h, i) => { const existing = f.headers[12 + i]; if (existing && existing !== h) fwError_('CONFIGURATION_ERROR'); });
    requests.push.apply(requests, fwCapacity_(f.sheet, 1, 17));
    FW.extraHeaders.forEach((h, i) => { if (!f.headers[12 + i]) requests.push(fwCell_(f.sheet, 1, 12 + i, h)); });
    const used = book.getSheets().map(s => s.getSheetId());
    [ [FW.links, FW.linkHeaders], [FW.orders, FW.orderHeaders] ].forEach(entry => {
      const sheet = book.getSheetByName(entry[0]);
      if (sheet) { const t = fwTable_(book, entry[0], entry[1]); if (entry[1].some((h, i) => t.headers[i] !== h)) fwError_('CONFIGURATION_ERROR'); }
      else {
        let id = 50000; while (used.indexOf(id) >= 0) id++; used.push(id);
        requests.push({ addSheet: { properties: { sheetId: id, title: entry[0], gridProperties: { rowCount: 1000, columnCount: entry[1].length, frozenRowCount: 1 } } } });
        requests.push({ updateCells: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: entry[1].length }, rows: [{ values: entry[1].map(fwExtended_) }], fields: 'userEnteredValue' } });
      }
    });
    fwBatch_(book, requests); return { configured: true };
  });
}
function feedbackV2ExpandRatingRanges(expectedFormulas) {
  // Separate, guarded operator step. Never infer/rewrite the rating algorithm.
  // Caller supplies the exact currently audited formulas, keyed by A1 address.
  // Existing blank-rating exclusions and all other formula text are preserved.
  if (!fwObject_(expectedFormulas) || !Object.keys(expectedFormulas).length) fwError_('INVALID_INPUT');
  return fwLock_(() => {
    const book = fwBook_(), table = fwTable_(book, 'Dishes', ['Average Rating', 'Rating Count']), requests = [];
    Object.keys(expectedFormulas).forEach(address => {
      if (!/^[A-Z]{1,3}[2-9]\d*$|^[A-Z]{1,3}1\d+$/.test(address) || typeof expectedFormulas[address] !== 'string') fwError_('INVALID_INPUT');
      const range = table.sheet.getRange(address), col = range.getColumn() - 1;
      if (![table.col['Average Rating'], table.col['Rating Count']].includes(col)) fwError_('INVALID_INPUT');
      const formula = range.getFormula();
      if (formula !== expectedFormulas[address] || !formula.startsWith('=')) fwError_('CONFLICT');
      const next = formula.replace(/((?:'Feedback'|Feedback)!\$?[A-Z]+\$?2:\$?[A-Z]+)\$?2000\b/g, '$1');
      if (next === formula || /(?:'Feedback'|Feedback)![^,;)]*2000/.test(next)) fwError_('CONFIGURATION_ERROR');
      requests.push({ updateCells: { range: { sheetId: table.sheet.getSheetId(), startRowIndex: range.getRow() - 1, endRowIndex: range.getRow(), startColumnIndex: col, endColumnIndex: col + 1 }, rows: [{ values: [{ userEnteredValue: { formulaValue: next } }] }], fields: 'userEnteredValue' } });
    });
    fwBatch_(book, requests); return { expanded: requests.length };
  });
}

function fwSourceSchema_(book) {
  fwTable_(book, 'Orders', ['Order ID', 'Order Status', 'Delivery Date', 'Customer ID', 'Customer Name']);
  fwTable_(book, 'Order Items', ['Order ID', 'Order Status', 'Fulfilment Status', 'Item Code (AUTO, INTERNAL)', 'Qty']);
  fwTable_(book, 'Deliveries', ['Order ID', 'Delivery Status', 'Delivered At', 'Feedback Status', 'Feedback Requested At', 'Feedback Reminder Sent At', 'Feedback Completed At', 'Routific ID']);
  fwTable_(book, 'Dishes', ['Item Code', 'Cook ID', 'Dish Name', 'Menu Kitchen Name', 'Image URL', 'Average Rating', 'Rating Count']);
  fwTable_(book, 'Customers', ['Customer ID', 'Name', 'Phone', 'WhatsApp Opt-In']);
  const log = fwTable_(book, 'WhatsApp Log', WHATSAPP_LOG_HEADERS);
  if (WHATSAPP_LOG_HEADERS.some((h,i) => log.headers[i] !== h)) fwError_('CONFIGURATION_ERROR');
}
function feedbackV2RatingFormulaAudit() {
  const book = fwBook_(), table = fwTable_(book, 'Dishes', ['Average Rating', 'Rating Count']), formulas = {};
  const letters = index => { let result = ''; for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; };
  if (table.rows.length) ['Average Rating', 'Rating Count'].forEach(header => {
    const col = table.col[header]; const values = table.sheet.getRange(2, col + 1, table.rows.length, 1).getFormulas();
    values.forEach((row, i) => { if (row[0]) formulas[letters(col) + (i + 2)] = row[0]; });
  });
  return { readOnly: true, formulas: formulas };
}
