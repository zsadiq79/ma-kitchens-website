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
  const lock = LockService.getScriptLock();
  if (lock.hasLock()) return callback();
  lock.waitLock(15000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function mkOwnerFreshValues_(book, sheet, firstRow, rowCount, width) {
  if (book.getId() !== MK_OWNER.testBookId) throw new Error('Fresh owner reads require the TEST workbook.');
  let column = '', remaining = width;
  while (remaining > 0) { remaining--; column = String.fromCharCode(65 + remaining % 26) + column; remaining = Math.floor(remaining / 26); }
  const range = "'" + sheet.getName().replace(/'/g, "''") + "'!A" + firstRow + ':' + column + (firstRow + rowCount - 1);
  // Sheets API writes do not refresh SpreadsheetApp's earlier read snapshot.
  // Read back through the same API, preserving raw numbers and booleans.
  const result = Sheets.Spreadsheets.Values.get(book.getId(), range, {
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER', majorDimension: 'ROWS'
  });
  return (result.values || []).map(row => Array.from({ length: width }, (_, index) => row[index] === undefined ? '' : row[index]));
}

function mkTable_(book, name, fresh) {
  const sheet = book.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name + '. Run the test workspace setup.');
  const expected = MK_OWNER_HEADERS[name] || MK_ORDER_REQUEST_HEADERS[name];
  const values = fresh ? mkOwnerFreshValues_(book, sheet, 1, sheet.getMaxRows(), expected ? expected.length : sheet.getMaxColumns()) : sheet.getDataRange().getValues();
  if (expected) {
    if (fresh) {
      if (expected.some((header,index) => String((values[0] || [])[index] || '').trim() !== header)) throw new Error('ORDER_REQUEST_NOT_READY');
    } else orderRequestRequireHeaders_(sheet,expected);
  }
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

function mkCustomers_(book, fresh) {
  const table = mkTable_(book, CUSTOMERS_SHEET, fresh);
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

function mkOwnerRequest_(book, reference, fresh) {
  if (!reference) return null;
  let found;
  if (fresh) {
    const requests = mkTable_(book, MK_ORDER_REQUEST.requestSheet, true), match = mkUnique_(requests, 1, reference);
    if (!match) throw new Error('REQUEST_NOT_FOUND');
    found = { sheet: requests.sheet, row: match.row, rowNumber: match.number };
  } else found = orderRequestOwnerFindRow_(book, reference);
  const table = mkTable_(book, MK_ORDER_REQUEST.itemSheet, fresh);
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
    // Compare dish/quantity values, independent of RPC object property order.
    const original = request.items.map(item => [item.menuLineId, item.quantity]).sort((a, b) => a[0].localeCompare(b[0]));
    const edited = input.items.map(item => [item.menuLineId, item.quantity]).sort((a, b) => a[0].localeCompare(b[0]));
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
    const existingReviews = mkTable_(book,MK_OWNER.reviews);
    if (input && existingReviews.rows.some(row=>String(row[12])===String(input.draftKey) && row[8]))
      throw new Error('This draft already has a saved or uncertain order. Open its saved review, or start a new manual order.');
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
  const table = mkTable_(book, MK_OWNER.reviews, true), found = mkUnique_(table, 0, id);
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
    mkAssertOperationalLayout_(book);
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
      14: review.details.instructions,
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
    try { return mkOwnerReconcile_(book, mkOwnerFindReview_(book, id)); }
    catch (_) { throw new Error('SUBMISSION_UNCERTAIN: the write finished but verification could not complete. Use Check saved order; do not create another order.'); }
  });
}

function mkOwnerReconcile_(book, saved) {
  const orderId = String(saved.row[8] || '');
  if (!orderId) throw new Error('This review has no planned order.');
  const orders = mkTable_(book, ORDERS_SHEET, true), found = mkUnique_(orders, 0, orderId);
  const items = mkTable_(book, ORDER_ITEMS_SHEET, true);
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
    current = mkOwnerFreshValues_(book, orders.sheet, found.number, 1, 37)[0] || [];
    if (String(current[23]) === 'OK') break;
    Utilities.sleep(200);
  }
  const expected = review.quote.items;
  lines = mkTable_(book, ORDER_ITEMS_SHEET, true).rows.filter(row => String(row[0]) === orderId);
  const snapshotsOK = lines.length === expected.length && expected.every(item => lines.some(line => String(line[27]) === item.menuLineId &&
    String(line[22]) === item.itemCode && String(line[25]) === item.cookId && Number(line[6]) === item.quantity &&
    Math.round(Number(line[23]) * 100) === item.listPriceCents && Math.round(Number(line[24]) * 100) === item.cookPayCents &&
    Math.round(Number(line[28]) * 100) === item.unitPriceCents && Math.round(Number(line[29]) * 100) === item.lineTotalCents &&
    String(line[4]) === item.itemCode && String(line[5]) === item.cookId && Math.round(Number(line[8]) * 100) === item.listPriceCents &&
    Math.round(Number(line[9]) * 100) === item.unitPriceCents && Math.round(Number(line[10]) * 100) === item.cookPayCents &&
    Math.round(Number(line[11]) * 100) === item.lineTotalCents && Math.round(Number(line[12]) * 100) === item.cookPayCents * item.quantity));
  const request = review.requestReference ? mkOwnerRequest_(book, review.requestReference, true) : null;
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
    const journal = mkTable_(book, MK_OWNER.journal), operationRow = mkUnique_(journal, 1, id);
    if (!operationRow) throw new Error('Recovery journal is missing. Reconcile before continuing.');
    const now = new Date().toISOString(), changes = mkSetColumns_(saved.table.sheet, saved.number, { 4: 'NOT_RECORDED', 8: now, 9: '' });
    changes.push(...mkSetColumns_(journal.sheet, operationRow.number, { 4: 'NOT_RECORDED', 6: now }));
    Sheets.Spreadsheets.batchUpdate({ requests: changes }, book.getId());
    return { state: 'NOT_RECORDED', message: 'No order or items were written. Review the current form again before accepting.' };
  });
}

function ownerOrderMarkManualSend(id) {
  const book = mkOwnerBook_();
  return mkLocked_(() => {
    const saved = mkOwnerFindReview_(book, id);
    if (String(saved.row[3]) !== 'VERIFIED') throw new Error('Verify the saved order before marking a manual send.');
    if (mkOwnerReconcile_(book, saved).state !== 'VERIFIED') throw new Error('Saved order changed. Check it before marking a manual send.');
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
