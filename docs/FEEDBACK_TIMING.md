# Feedback timing instrumentation

This measures the current flow. It does not change saving, submission, link security, sending switches or the 72-hour delay.

## Installation order

1. Replace the contents of the existing production `FeedbackWeb.gs` with `scripts/FeedbackWeb.gs`. Do not create a second Apps Script file or run setup again.
2. Save and update the existing production web app deployment to a new version. Keep the same deployment URL and access settings.
3. Deploy the website changes only after that Apps Script deployment completes. The website sends a new internal `timingId` field which older Apps Script code rejects. An older website works with the new Apps Script code.
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
- `tableReadMs`: per-table timings for individual reads only. With the batched web reader this is empty, because one API call retrieves all seven tables; its duration is reported once in `readMs` and `readCalls=1`.
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


## First measured speed improvement: batched web reads

Three production samples reported 5.46 to 7.52 seconds in spreadsheet reads, with one request also waiting 4.74 seconds for the script lock. The web handler now retrieves the same seven tables with one fresh Sheets API call instead of seven separate SpreadsheetApp data reads. The response includes effective cell values and date-format types only, plus the spreadsheet time zone. It excludes formula text, notes and unrelated formatting. All populated history is retained; there is no row-2000 cutoff or cross-request cache.

Date serials are decoded using the spreadsheet time zone. Numeric quantities and booleans retain their types. Missing tables or duplicate headers fail closed. The shared lock and atomic completion write remain in place. The snapshot is discarded after any attempted write and at the end of the operation. Sender and receipt-handler behavior is unchanged.

Install this backend-only improvement by replacing the existing production FeedbackWeb.gs with scripts/FeedbackWeb.gs, saving, and updating the same web app deployment to a new version. Keep its URL and access settings. No website redeployment, new .gs file, setup run, trigger change or property change is required for this improvement. The existing Advanced Sheets service must remain enabled.

Use the existing unsubmitted test link to check loading, change a rating/comment, wait for Saved, and refresh to check resume. Capture three Server-Timing headers for the same action, ideally feedback_draft, and compare sheet_reads and route durations. Then test designated test-order submission and repeat opening to check that completion is retained. Do not reset an order or send another message for these checks. Backend tests validate safety and call counts, not live speed.

Rollback by restoring the preceding FeedbackWeb.gs and updating the same deployment again. The website protocol and saved state have not changed.
