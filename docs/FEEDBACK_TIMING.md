# Feedback timing instrumentation

This measures the current flow. It does not change saving, submission, link security, sending switches or the 72-hour delay.

## Installation order

1. Replace the contents of the existing production `FeedbackWeb.gs` with `scripts/FeedbackWeb.gs`. Do not create a second Apps Script file or run setup again.
2. Save and update the existing production web app deployment to a new version. Keep the same deployment URL and access settings.
3. Deploy the website changes only after that Apps Script deployment completes. The website sends an optional `browserOpened=true` signal with its initial read. Older Apps Script code rejects that field. The timing-enabled website also sends an internal `timingId`. An older website works with the new Apps Script code.
4. No new script properties or third-party analytics are required. An optional script property `FEEDBACK_TIMING_ENABLED=false` disables the Apps Script profiling. Basic browser and Vercel timings still work.
5. Test loading and draft saving with an existing unsubmitted test link. Test submission only with a designated test order. Do not reset a real customer's feedback or send a new message merely to obtain timings.

Rollback the website first, then Apps Script, to maintain the same compatibility order. Never disable submission locks or duplicate protection to gather measurements.

## Browser measurements

Performance measures have fixed names and numeric durations only. They remain in browser memory, with at most 100 entries per name before that name's entries are cleared. No analytics requests, local storage or feedback content are added.

- `feedback:load`: client order request and response validation, from after hydration until that request settles. It does not measure navigation, hydration or the paint that follows.
- `feedback:submission`: submit handler duration, including draft wait and uncertainty recovery.
- `feedback:draft_flush_before_submit`: draft flush and any reconciliation before the final submit request.
- `feedback:feedback_read`, `feedback:feedback_draft`, `feedback:feedback_event`, `feedback:feedback_submit`: complete logical request, including a recovery read when applicable.
- `feedback:http_feedback_*`: individual HTTP attempt, including response JSON parsing.

In browser DevTools Console, export only safe measures:

```javascript
console.table(performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('feedback:'))
  .map(entry => ({ stage: entry.name, milliseconds: Math.round(entry.duration) })));
```

For document, image and JavaScript loading, use the browser Network/Performance panels. Do not share full HAR files or request bodies: those can contain feedback tokens and customer details.

## Vercel measurements

Every validated feedback request has a server-generated random correlation ID. It is not derived from the link, order, submission or customer. Browser input cannot set it. Search Vercel logs for `feedback_timing`.

Records include action, HTTP status, route duration, upstream duration, and validated numeric backend timings when available. Durations exclude platform startup before handler entry and final delivery to the browser. Upstream duration includes Google execution, network transit, the Content Service redirect and response parsing.

Responses include `X-Feedback-Request-Id` and `Server-Timing` headers, allowing the browser Network panel to correlate an individual request with Apps Script logs. The normal JSON result remains unchanged. Missing or malformed backend telemetry is ignored, including all unknown fields.

## Apps Script measurements

Open Executions, select the corresponding Web App execution and view its logs. Search for `feedback_timing` or the request ID.

Authenticated, validated requests with a valid timing ID record:

- `totalMs`: elapsed time inside the handler, before response delivery.
- `lockWaitMs`: time attempting to obtain the shared script lock, including failed attempts.
- `readMs` and `readCalls`: actual table data reads, excluding reuse within the request.
- `tableReadMs`: per-table timings for individual reads only. With the targeted web reader this is empty because its three batched calls span multiple tables. Their total duration is reported in `readMs`, with `readCalls=3` on a normal successful request.
- `writeMs` and `writeCalls`: Sheets atomic batch calls, including failed calls.
- `bookMs`: opening the spreadsheet.
- `timezoneMs`: separate time-zone retrieval. The batched reader gets the time zone with the same API response, so this is zero.
- `outcome`: OK or a sanitized allowlisted error code.

The phase measurements do not cover every small operation and must not be blindly added to browser timings. `totalMs` includes validation, in-memory processing and uninstrumented metadata calls. Logging itself, platform startup and response delivery are not fully measured.

Instrumentation performs no additional Sheets writes, network requests, messages or property writes. Timing is execution-local. Failed logging does not change a feedback outcome. It logs no token, link, secret, order/customer/submission ID, phone, dish name, rating, comment, payload, exception message or stack.

## Interpretation

- Large draft-flush time: submission is waiting for autosave before the final request.
- Large lock wait: another request or writer is occupying the shared lock.
- Large read time: reduce or batch spreadsheet reads; compare aggregate read timings.
- Large write time: investigate batch size and spreadsheet formula workload.
- Upstream duration much larger than Apps Script duration: investigate transit, redirect and platform overhead. This difference cannot isolate cold start on its own.
- Browser duration much larger than Vercel route duration: investigate mobile transit, startup and response handling.

Use multiple requests and report median and 95th percentile separately for load, draft and submit. Compare cold and subsequent requests and concurrent sessions. Mock test timings validate accounting and privacy, not production performance.


## Targeted reads and combined interaction tracking

The initial full-table batch reader reduced median measured reads from 7.07 to about 6.03 seconds in small production samples, leaving reads as the recurring bottleneck. The next revision uses three small, fresh read batches inside the same shared lock:

1. Read live headers and narrow global keys: Feedback columns A/C/F, link hashes/order IDs/statuses, and V2 order IDs. Do not fetch historical feedback comments, ratings or unrelated V2 drafts. Include the spreadsheet time zone and date-type metadata.
2. Scan the actual source ID columns and Order Items item-code column using the validated live header positions. Do not assume Order ID is in column A. Find all matching rows, including duplicates, with no row-count cutoff.
3. Retrieve only required source fields from matching Orders, Deliveries, Order Items and Dishes rows, plus full V2 state/link rows for the current order. Preserve original sheet row numbers and provider metadata.

All historical Feedback IDs/order IDs/item codes remain available for shared completion safeguards, legacy-in-progress detection, duplicate checks and global ID generation. The active state, revocation, expiry, confirmation, delivery, eligibility and revision checks are still fresh and remain under the writer lock. There is no persistent state cache. Snapshots are discarded after attempted writes and at the end of the operation. Sender and receipt-handler behavior is unchanged.

The website folds browser-open tracking into its initial read with the strictly validated optional browserOpened=true flag. Draft saving and successful web submission fill a missing First Interaction At in the existing atomic write. The website no longer sends separate browser_opened or first_interaction feedback_event requests. Older clients can still use those events. Page Requested At and Browser Opened At remain separate signals; the page-request rate limit cannot consume the browser-signal budget. First Interaction At now means the server received the first successful draft save or submission, so it can follow the first input by the autosave debounce/network time. Opening the page without changing feedback does not mark an interaction. These signals do not prove a human identity.

Install the current production FeedbackWeb.gs first by replacing its contents with scripts/FeedbackWeb.gs, saving, and updating the existing web app deployment to a new version. Keep its URL and access settings. Then merge/deploy the website changes. This order is required because the new website sends browserOpened=true. No new .gs file, setup run, property change or trigger change is required. Keep Advanced Sheets enabled. The old website continues to work with the new backend.

Use the existing unsubmitted test link to check loading, change a rating/comment, wait for Saved, and refresh to check resume. Capture three Server-Timing headers for the same action, ideally feedback_draft, and compare sheet_reads and route durations. In the Network panel confirm that the new website sends no separate feedback_event requests. Check the Browser Opened At and First Interaction At fields on a suitable fresh test state; existing timestamps are intentionally retained. Then test designated test-order submission and repeat opening to confirm completion is retained. Do not reset an order or send another message merely for measurements. Backend tests validate safety, targeted data and request shape, not live speed.

For rollback, deploy the previous website first, then restore the previous FeedbackWeb.gs and redeploy the same Apps Script deployment. Both older website request forms remain supported by the new backend. Keep the shared locks and atomic submission protections enabled.
