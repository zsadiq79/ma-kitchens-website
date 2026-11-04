# Routific delivery recovery

The repair keeps the existing Apps Script project and public URLs. Consolidate modules into the owner’s current Code.gs. Marketing.gs and existing order, payment, discount and feedback records are preserved.

## Behavior

Webhook requests are authenticated using the raw Routific signature, then acknowledged only after durable Vercel Queue acceptance. The queue consumer requires a specific durable Apps Script acknowledgement and retries failed forwarding. Apps Script reconciles current route state using short writer locks and performs provider requests outside the shared lock. Accepted messages and uncertain attempts retain durable reservations to prevent blind resends.

The worker batches spreadsheet reads, groups co-located deliveries, refreshes ageing timelines, and prioritises next-stop notifications. It suppresses stale ETAs instead of sending incorrect arrival times. Delivered and missed status reconciliation is independent of ETA freshness. The cutover timestamp excludes routes that departed before activation.

Authenticated WhatsApp receipts are captured in immutable event properties without spreadsheet access or the shared writer lock. The existing minute worker applies bounded atomic batches to WhatsApp, feedback and marketing ledgers. Replays merge monotonic statuses and earliest timestamps, including receipt-before-registration and ambiguous-commit recovery. Feedback defers while delivery jobs are pending. Receipt activation remains controlled by MK_RCPT_ENABLED.

## Evidence and limits

Two earlier driver tests established real provider delivery and exposed latency. One delivered all 18 messages; the other delivered 15 and missed three next-stop notifications after their ETA expired. These tests did not establish acceptable burst performance.

On 4 November, a separate hosted Apps Script rehearsal passed ten concurrent HTTP operations against a private synthetic workbook. Four capture operations took 92 to 227 ms of server execution time. All 54 unique status events reconciled to 18 unique Read rows with correct identities, feedback timestamps and marketing receipt rows. A deliberately interrupted post-commit write recovered without duplicate rows. The actual feedback deferral branch yielded. No Routific calls, real messages or customer record changes were made. These server timings exclude HTTP and cold-start overhead and do not measure real provider delivery latency.

The saved Code.gs candidate passed 130 focused worker, ingress, receipt, concurrency-fixture and feedback checks. The full repository suite retains unrelated baseline and date-sensitive fixture failures, so it is not wholly green. A prior hosted queue rehearsal confirmed durable acknowledgement, duplicate suppression, consumer forwarding and retry. No additional Routific orders are required for the automated rehearsal.

Private source snapshots, credentials and customer records are excluded from this public repository. The temporary preview probe and injected consumer failure have been removed before release. Preserve deployment versions and activation settings for rollback. Historical record reconciliation is a separate task because it can trigger existing feedback automation.
