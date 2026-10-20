/* New helpers used by the complete FeedbackInteraction.gs replacement.
 * All ratings are staged outside Feedback; only delivery finalisation publishes.
 */
function fwLegacyDraft_(schema, order, state) {
  let draft;
  if (state.row[5]) { try { draft = fwPayload_(JSON.parse(state.row[5]), order, true); } catch (_) { fwError_('CONFIGURATION_ERROR'); } }
  else draft = { dishes: order.dishes.map(d => ({ itemCode: d.itemCode, rating: 0, skipped: false, comment: '' })), deliveryRating: 0, overallComment: '', testimonialConsent: false };
  schema.feedback.rows.filter(r => String(r[2]).trim() === order.orderId).forEach(r => {
    if (r[5] === 'DELIVERY') { draft.deliveryRating = Number(r[6]); draft.overallComment = String(r[9] || '').slice(0, 1200); }
    else { const d = draft.dishes.find(x => x.itemCode === r[5]); if (d) { d.rating = r[6] === '' ? 0 : Number(r[6]); d.skipped = r[6] === ''; d.comment = String(r[9] || '').slice(0, 600); } }
  });
  return fwPayload_(draft, order, true);
}
function fwLegacySave_(orderId, customerId, item, rating, comment, followUp, message) {
  fwEnabled_(); fwOrderId_(orderId);
  if (!item || typeof item.itemCode !== 'string' || (rating !== '' && (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5)) || !['None', 'Open', 'Resolved'].includes(followUp)) fwError_('INVALID_INPUT');
  const text = fwString_(comment, item.itemCode === 'DELIVERY' ? 1200 : 600);
  const messageId = fwString_(message && message.id, 256, 1);
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), order = fwOrder_(book, orderId), state = fwState_(schema, orderId, true);
    if (customerId !== order.customerId) fwError_('INVALID_INPUT');
    if (fwCompleted_(schema, orderId, state, order.delivery)) return { status: 'COMPLETED' };
    if (!feedbackV2Eligibility_(order, false, Date.now()).eligible) fwError_('INELIGIBLE');
    let ids; try { ids = JSON.parse(state.row[21] || '{}'); } catch (_) { fwError_('CONFIGURATION_ERROR'); }
    if (ids[item.itemCode] === messageId) return { status: 'STAGED' };
    // Per-item first response is immutable in the legacy questionnaire.
    const draft = fwLegacyDraft_(schema, order, state);
    const answer = draft.dishes.find(d => d.itemCode === item.itemCode);
    if (item.itemCode !== 'DELIVERY' && !answer) fwError_('INVALID_INPUT');
    if (item.itemCode === 'DELIVERY') {
      if (rating === '') fwError_('INVALID_INPUT');
      draft.deliveryRating = rating; draft.overallComment = text;
    } else {
      if (answer.rating || answer.skipped) return { status: 'STAGED' };
      answer.rating = rating === '' ? 0 : rating; answer.skipped = rating === ''; answer.comment = text;
    }
    ids[item.itemCode] = messageId; state.row[21] = JSON.stringify(ids);
    state.row[5] = JSON.stringify(draft); state.row[6] = Number(state.row[6] || 0) + 1; state.row[7] = new Date().toISOString();
    if (item.itemCode === 'DELIVERY') {
      return fwCommit_(book, schema, order, state, fwPayload_(draft, order, false), 'LEGACY', Date.now());
    }
    fwBatch_(book, fwCapacity_(schema.orders.sheet, state.number, FW.orderHeaders.length).concat([fwUpdate_(schema.orders.sheet, state.number, state.row)]));
    return { status: 'STAGED' };
  });
}
function fwLegacyCodes_(orderId, includeDelivery) {
  const book = fwBook_(), schema = fwSchema_(book), order = fwOrder_(book, orderId), state = fwState_(schema, orderId, true);
  const draft = fwLegacyDraft_(schema, order, state); const codes = {};
  draft.dishes.forEach(d => { if (d.rating || d.skipped) codes[d.itemCode] = true; });
  if (includeDelivery && draft.deliveryRating > 0) codes.DELIVERY = true;
  return codes;
}
function fwLegacyStatus_(orderId, status, completed) {
  fwEnabled_(); fwOrderId_(orderId);
  if (!['In Progress', 'Completed'].includes(status) || typeof completed !== 'boolean') fwError_('INVALID_INPUT');
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), order = fwOrder_(book, orderId), state = fwState_(schema, orderId, true);
    if (state.row[2]) return;
    if (completed) {
      // Completion was committed with rows by the delivery-rating save above.
      // Existing historical rows can be reconciled here without rewriting them.
      const draft = fwLegacyDraft_(schema, order, state); fwPayload_(draft, order, false);
      if (!schema.feedback.rows.some(r => r[2] === orderId && r[5] === 'DELIVERY')) fwError_('TEMPORARY_ERROR');
      const at = new Date(); state.row[2] = at.toISOString(); state.row[3] = 'LEGACY'; state.row[5] = '';
      fwBatch_(book, fwCapacity_(schema.orders.sheet, state.number, FW.orderHeaders.length).concat([
        fwUpdate_(schema.orders.sheet, state.number, state.row),
        fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Status'], 'Completed'),
        fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Completed At'], at)
      ]));
      return;
    }
    if (fwCompleted_(schema, orderId, state, order.delivery)) return;
    fwBatch_(book, [fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Status'], status)]);
  });
}
function fwLegacyComment_(orderId, itemCode, comment, message, label) {
  fwEnabled_(); fwOrderId_(orderId); fwString_(itemCode, 80, 1);
  const text = fwString_(comment, itemCode === 'DELIVERY' ? 1200 : 600); const cleanLabel = fwString_(label, 40);
  const id = fwString_(message && message.id, 256, 1);
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), order = fwOrder_(book, orderId), state = fwState_(schema, orderId, true);
    if (state.row[3] === 'WEB') return; // A late legacy comment cannot modify web feedback.
    let seen; try { seen = JSON.parse(state.row[22] || '[]'); } catch (_) { fwError_('CONFIGURATION_ERROR'); }
    if (seen.includes(id)) return;
    if (seen.length >= 50 || !fwLimit_(state.row, Date.now(), 10, 11, 20)) fwError_('RATE_LIMITED');
    const rows = schema.feedback.rows.map((row, i) => ({ row: row, number: i + 2 })).filter(r => r.row[2] === orderId && r.row[5] === itemCode);
    if (rows.length > 1) fwError_('CONFIGURATION_ERROR');
    const addition = cleanLabel ? cleanLabel + ': ' + text : text;
    const combine = existing => (cleanLabel === 'Other' && existing === 'Other' ? addition : existing ? existing + ' | ' + addition : addition);
    const requests = fwCapacity_(schema.orders.sheet, state.number, FW.orderHeaders.length);
    if (rows.length) {
      const next = combine(String(rows[0].row[9] || '')); fwString_(next, itemCode === 'DELIVERY' ? 1200 : 600);
      requests.push(fwCell_(schema.feedback.sheet, rows[0].number, 9, next), fwCell_(schema.feedback.sheet, rows[0].number, 11, id));
    } else {
      const draft = fwLegacyDraft_(schema, order, state), d = draft.dishes.find(x => x.itemCode === itemCode);
      if (!d || !d.rating) fwError_('INVALID_INPUT');
      d.comment = fwString_(combine(d.comment), 600); state.row[5] = JSON.stringify(draft); state.row[6] = Number(state.row[6] || 0) + 1; state.row[7] = new Date().toISOString();
    }
    seen.push(id); state.row[22] = JSON.stringify(seen); requests.push(fwUpdate_(schema.orders.sheet, state.number, state.row)); fwBatch_(book, requests);
  });
}
