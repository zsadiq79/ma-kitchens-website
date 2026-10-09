/* Replace ONLY Code.gs doPost(e) with this complete function. Do not add a
 * second doPost. Other Code.gs functions, menu/ordering and Routific stay intact.
 */
function doPost(e) {
  const text = value => ContentService.createTextOutput(value).setMimeType(ContentService.MimeType.TEXT);
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'menu') return handleMenuApiRequest_(e);
    if (FW.actions.indexOf(action) >= 0) return handleFeedbackWebApiRequest_(e, action);
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 1100000) return json({ ok: false });
    let payload = JSON.parse(raw), verified = false;
    if (action === 'whatsapp_verified') {
      if (!fwObject_(payload) || typeof payload.secret !== 'string' || payload.secret !== fwConfig_('FLOW_MENU_API_SECRET') || !fwObject_(payload.payload)) return json({ ok: false });
      payload = payload.payload; verified = true;
    }
    // Preserve the existing authenticated Routific routing and its handler.
    if (payload && (Object.prototype.hasOwnProperty.call(payload, 'controlTowerSecret') || payload.payload?.type === 'order.status_updated')) return handleRoutificWebhook_(e);
    if (!verified && fwProps_().getProperty('WHATSAPP_REQUIRE_VERIFIED_FORWARD') === 'true') return json({ ok: false });
    let failed = false;
    // Process every entry/change, not just the first callback envelope.
    (Array.isArray(payload.entry) ? payload.entry : []).forEach(entry => {
      (Array.isArray(entry.changes) ? entry.changes : []).forEach(change => {
        const value = change.value || {};
        (Array.isArray(value.messages) ? value.messages : []).forEach(message => {
          try { processIncomingMessageOnce_(message); } catch (_) { failed = true; }
        });
        (Array.isArray(value.statuses) ? value.statuses : []).forEach(status => {
          try {
            // Do not fabricate receipt times. V2 receipts only use verified events.
            if (verified) { recordWhatsAppStatus_(status); updateWhatsAppLogFromStatus_(status); }
            else if (fwProps_().getProperty('FEEDBACK_V2_WRITES_ENABLED') !== 'true') {
              recordWhatsAppStatus_(status); updateWhatsAppLogFromStatus_(status); // Legacy history only; V2 is disabled.
            }
          } catch (_) { failed = true; }
        });
      });
    });
    return verified ? json({ ok: !failed }) : text('EVENT_RECEIVED');
  } catch (_) { return json({ ok: false }); } // Never log exceptions/payloads/tokens.
}
