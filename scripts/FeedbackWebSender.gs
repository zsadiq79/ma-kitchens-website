/* New sender implementation, dormant unless FEEDBACK_V2_SENDER_ENABLED=true.
 * Installation never sets the flag or changes/installs a trigger.
 */
function feedbackSenderDecision_(table, row, rowNumber, now) {
  const book = fwBook_();
  const orders = fwTable_(book, 'Orders', ['Order ID', 'Order Status']);
  const c = table.col, orderId = String(row[c['Order ID']] || '').trim();
  const status = String(row[c['Feedback Status']] || '').trim();
  const deliveredAt = row[c['Delivered At']]; const due = feedbackNextDay10am_(deliveredAt);
  let reason = 'ELIGIBLE';
  if (!/^ORD-\d+$/.test(orderId)) reason = 'INVALID_ORDER_ID';
  else if (orders.rows.filter(o => String(o[orders.col['Order ID']]).trim() === orderId).length !== 1 || orders.rows.find(o => String(o[orders.col['Order ID']]).trim() === orderId)[orders.col['Order Status']]?.toString().trim().toLowerCase() !== 'confirmed') reason = 'ORDER_NOT_CONFIRMED';
  else if (String(row[c['Delivery Status']]).trim() !== 'Delivered') reason = 'NOT_DELIVERED';
  else if (!String(row[c['Routific ID']] || '').trim()) reason = 'MISSING_ROUTIFIC_ID';
  else if (status && status !== 'Not Sent') reason = 'ALREADY_REQUESTED';
  else if (fwFeedback_(book).rows.some(r => String(r[2]).trim() === orderId)) reason = 'LEGACY_FEEDBACK_EXISTS';
  else if (!due) reason = 'INVALID_DELIVERED_AT';
  else if (now < due.getTime()) reason = 'BEFORE_48_HOURS';
  if (reason === 'ELIGIBLE') {
    try {
      const order = fwOrder_(book, orderId);
      if (!feedbackV2Eligibility_(order, false, now).eligible) reason = 'BEFORE_48_HOURS';
    } catch (error) { if (error.code === 'INELIGIBLE') reason = 'NO_ELIGIBLE_ITEMS'; else throw error; }
  }
  return { eligible: reason === 'ELIGIBLE', reason: reason, dueAt: due ? due.toISOString() : null, candidate: { deliveryRowNumber: rowNumber, orderId: orderId, routificId: String(row[c['Routific ID']] || ''), deliveredAt: deliveredAt, feedbackDueAt: due, feedbackStatus: status } };
}
function fwWebTemplateContract_() {
  // A submitted path-token template cannot be reused for fragment-only links.
  const props = fwProps_(), name = props.getProperty('FEEDBACK_WEB_TEMPLATE_NAME');
  const base = fwConfig_('FEEDBACK_WEB_BASE_URL');
  if (name !== 'customer_feedback_web_v2_fragment' ||
      !/^https:\/\/[^/?#]+\/feedback\/open$/.test(base) ||
      props.getProperty('FEEDBACK_WEB_TEMPLATE_URL') !== base + '#{{1}}') fwError_('CONFIGURATION_ERROR');
  return { name: name };
}
function fwPrepareWebMessage_(resolution) {
  fwEnabled_();
  if (fwProps_().getProperty('FEEDBACK_V2_SENDER_ENABLED') !== 'true' || !feedbackIsLiveEnabled_() || fwProps_().getProperty('FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED') !== 'true') fwError_('TEMPORARY_ERROR');
  const template = fwWebTemplateContract_(); // Validate before reserving a link/message.
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), order = fwOrder_(book, resolution.orderId);
    const decision = feedbackSenderDecision_(order.delivery.table, order.delivery.row, order.delivery.number, Date.now());
    if (!decision.eligible) fwError_('INELIGIBLE');
    const fresh = resolveFeedbackCandidate_(decision.candidate);
    if (!fresh.allowed) fwError_('INELIGIBLE');
    resolution = fresh; // Recheck contact/opt-in inside the reservation lock.
    const link = fwCreateLinkLocked_(book, schema, resolution.orderId, true);
    return { attemptId: link.attemptId, orderId: resolution.orderId, recipient: resolution.recipient,
      payload: { messaging_product: 'whatsapp', recipient_type: 'individual', to: resolution.recipient, type: 'template', template: { name: template.name, language: { code: 'en' }, components: [
        { type: 'body', parameters: [{ type: 'text', text: resolution.customerFirstName }, { type: 'text', text: resolution.orderId }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: link.token }] }
      ] } }
    };
  });
}
function fwSendWebMessage_(prepared) {
  // Never use the existing sender's raw provider-response logger for secure links.
  const props = fwProps_(), token = fwConfig_('WHATSAPP_ACCESS_TOKEN'), phone = fwConfig_('WHATSAPP_PHONE_NUMBER_ID');
  const version = props.getProperty('GRAPH_API_VERSION') || 'v26.0';
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phone)) fwError_('CONFIGURATION_ERROR');
  const response = UrlFetchApp.fetch('https://graph.facebook.com/' + version + '/' + phone + '/messages', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(prepared.payload), muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) fwError_('MESSAGE_REQUIRES_RECONCILIATION');
  let data; try { data = JSON.parse(response.getContentText()); } catch (_) { fwError_('MESSAGE_REQUIRES_RECONCILIATION'); }
  const messageId = data && data.messages && data.messages[0] && data.messages[0].id;
  fwString_(messageId, 256, 1);
  return messageId;
}
function fwAcceptWebMessage_(prepared, messageId, acceptedAt) {
  return fwLock_(() => {
    const book = fwBook_(), schema = fwSchema_(book), state = fwState_(schema, prepared.orderId, false);
    if (state.row[15] !== prepared.attemptId || (state.row[16] && state.row[16] !== messageId)) fwError_('CONFLICT');
    // Callback-before-registration records are preserved in WhatsApp Log.
    // Same atomic batch fills outbound metadata, acceptance and delivery lifecycle.
    const log = fwTable_(book, 'WhatsApp Log', WHATSAPP_LOG_HEADERS);
    const found = log.rows.map((row, i) => ({ row: row, number: i + 2 })).filter(x => x.row[0] === messageId);
    if (found.length > 1) fwError_('CONFIGURATION_ERROR');
    const row = found.length ? found[0].row.slice() : WHATSAPP_LOG_HEADERS.map(() => '');
    if (row[1] && row[1] !== prepared.orderId) fwError_('CONFLICT');
    if (row[3] && whatsappLogNormalisePhone_(row[3]) !== '+' + prepared.recipient) fwError_('CONFLICT');
    row[0] = messageId; row[1] = prepared.orderId; row[2] = 'feedback_web_request'; row[3] = '+' + prepared.recipient; row[4] = row[4] || acceptedAt; row[8] = row[8] || 'Accepted';
    const order = fwOrder_(book, prepared.orderId); const originalAcceptance = fwTime_(row[4]); if (Number.isFinite(originalAcceptance)) acceptedAt = new Date(originalAcceptance);
    state.row[16] = messageId; state.row[17] = acceptedAt.toISOString();
    [5, 6, 7].forEach((logIndex, i) => { const time = fwTime_(row[logIndex]); if (Number.isFinite(time)) state.row[18 + i] = new Date(time).toISOString(); });
    const requests = [fwUpdate_(schema.orders.sheet, state.number, state.row),
      fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Requested At'], acceptedAt)];
    if (!fwCompleted_(schema, prepared.orderId, state, order.delivery)) requests.push(fwCell_(order.delivery.table.sheet, order.delivery.number, order.delivery.table.col['Feedback Status'], 'Sent'));
    if (found.length) {
      [1, 2, 3, 4, 8].forEach(i => requests.push(fwCell_(log.sheet, found[0].number, i, row[i])));
    } else requests.push(fwAppend_(log.sheet, [row]));
    fwBatch_(book, requests);
  });
}
function runFeedbackWebSender_() {
  if (!feedbackIsLiveEnabled_() || fwProps_().getProperty('FEEDBACK_V2_SENDER_ENABLED') !== 'true') return { enabled: false, accepted: 0 };
  fwEnabled_(); let accepted = 0, reconcile = 0;
  // No reminders and no automatic resend after ambiguous acceptance failures.
  // A durable reservation blocks another worker before the provider call.
  buildFeedbackQueueSnapshot_().filter(r => r.allowed).slice(0, 5).forEach(resolution => {
    let prepared;
    try { prepared = fwPrepareWebMessage_(resolution); } catch (_) { reconcile++; return; }
    try { const id = fwSendWebMessage_(prepared); fwAcceptWebMessage_(prepared, id, new Date()); accepted++; }
    catch (_) { reconcile++; } // Keep reservation; operator must reconcile WhatsApp Log/provider.
  });
  return { enabled: true, accepted: accepted, requiresReconciliation: reconcile };
}
function feedbackV2ReconcileAcceptedMessage(orderId, attemptId, recipient, messageId, acceptedAtISO) {
  // Operator-only recovery from independently confirmed provider acceptance.
  // No sends, token exposure, reservation clearing or inferred receipt times.
  fwEnabled_(); fwOrderId_(orderId); fwString_(attemptId, 80, 1); fwString_(messageId, 256, 1);
  if (typeof recipient !== 'string' || !/^614\d{8}$/.test(recipient)) fwError_('INVALID_INPUT');
  const time = fwTime_(acceptedAtISO); if (!Number.isFinite(time) || time > Date.now()) fwError_('INVALID_INPUT');
  fwAcceptWebMessage_({ orderId: orderId, attemptId: attemptId, recipient: recipient }, messageId, new Date(time));
  return { reconciled: true };
}
