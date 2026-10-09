/* Complete replacement: read-only. No simulated delivery, messages, links, writes,
 * setup, logging customer details, trigger changes, or next-day timing logic.
 */
function feedbackDryRunForOrder_(orderId, simulateDelivered) {
  if (simulateDelivered) fwError_('SIMULATION_NOT_SUPPORTED');
  fwOrderId_(orderId);
  const book = fwBook_();
  const table = fwTable_(book, 'Deliveries', ['Order ID', 'Delivery Status', 'Delivered At', 'Feedback Status', 'Routific ID']);
  const found = table.rows.map((row, i) => ({ row: row, number: i + 2 })).filter(x => String(x.row[table.col['Order ID']]).trim() === orderId);
  if (found.length !== 1) fwError_('INELIGIBLE');
  const decision = feedbackSenderDecision_(table, found[0].row, found[0].number, Date.now());
  const resolution = decision.eligible ? resolveFeedbackCandidate_(decision.candidate) : null;
  return { readOnly: true, orderId: orderId, dueAt: decision.dueAt, reason: resolution && !resolution.allowed ? resolution.reason : decision.reason,
    wouldSend: decision.eligible && !!resolution.allowed && feedbackIsLiveEnabled_(), liveEnabled: feedbackIsLiveEnabled_(),
    sender: fwProps_().getProperty('FEEDBACK_V2_SENDER_ENABLED') === 'true' ? 'WEB_V2' : 'LEGACY', messageSent: false, spreadsheetWrites: false };
}
function testFeedbackDryRun_ORD000002() { return feedbackDryRunForOrder_('ORD-000002', false); }
// Compatibility only; all consumers use the production 96-hour helper.
function getNextDay10am_(deliveredAt, timeZone) { return feedbackNextDay10am_(deliveredAt, timeZone); }
