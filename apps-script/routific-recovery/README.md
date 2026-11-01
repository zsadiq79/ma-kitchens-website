# Routific delivery recovery candidate

Production activation is pending measured timing and ingress tests. The public webhook remains inactive. No new Apps Script file is needed: consolidate changes into the owner's current Code.gs with `scripts/build-routific-recovery.cjs`. Marketing.gs is preserved. The private original upload and live backups are not stored in this repository. Historical route audit diagnostics, when present locally, are optional and are not part of the public deliverable.

## Implementation

- Verify raw webhook HMAC before accepting events. With ROUTIFIC_DURABLE_INGRESS=true, return success only after the Vercel Queue SDK acknowledges durable publication. The default retains the existing forwarding path.
- The consumer forwards a distinct recovery envelope. An older Apps Script deployment cannot interpret it as a delivery event; a generic 200 is insufficient to acknowledge queue work.
- Apps Script mode defaults OFF. TEST uses a private fixture workbook, six dummy identities, one explicit route, one recipient, an expiry and separate queue/reservation keys. No production order or delivery records are changed by the test.
- Persist message reservations before sending. Never blindly retry ambiguous sends. Repair accepted-send logging without resending.
- Reconcile actual delivered/missed status independently of ETA freshness. Hold old confirmations for review. Exclude cancelled orders, missing consent, mismatched identities and wrong delivery dates.
- Group co-located orders, support pagination and retain route jobs until reconciled.
- Prepare tracking only for the next physical stop before urgent sends. Refresh ageing timelines within a batch; next-stop messages precede confirmations. Busy locks retain pending work; cleanup contention cannot erase accepted receipts.
- Status callbacks read the WhatsApp and feedback message ledgers, rather than loading feedback answers and links. Feedback receipt updates target only the timestamp cell.

## Validation and current limits

On 2 November the first controlled driver-app test delivered/read all 18 expected messages: six journey, six next-stop and six confirmations. All six fixture delivery records were marked Delivered, the queue drained, and test mode was switched OFF. No uncertain or failed receipts were recorded. This test exposed multi-minute delays and shared-lock contention; it was not a performance acceptance test and did not exercise the new durable website ingress.

The subsequent speed candidate passes 109 focused worker, ingress, diagnostic and feedback checks. They include slow provider calls, snapshot refreshes, grouped stops, cancelled orders, uncertain sends, receipt ordering, callback-before-registration and lock collisions. Original-function verification allows only five changed original functions and preserves all existing constants. The website build passed earlier; repeat it after future website changes. The baseline full suite had 19 unrelated dated/UI fixture failures; these were also present before the repair.

Before production: verify the saved live source against the baseline, deploy a compatible Apps Script version without enabling customer sends, validate queue availability and cost for the actual project, test signed ingress and acknowledgement/retries, measure event-to-send times under overlapping callbacks/feedback work, and obtain final activation review. Do not replay historical events or reconcile old records automatically: historical record repair can trigger existing feedback automation.
