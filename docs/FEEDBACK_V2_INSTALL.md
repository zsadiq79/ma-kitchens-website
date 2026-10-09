# Feedback V2 installation and verification guide

**Prepared for review, not installed. Do not apply these steps to production during PR #35 review.** Main/PR #36's standalone demo stays at `/feedback/demo-sameera`; it requires no service credentials. No sender cutover, trigger change, live data change, deployment or WhatsApp message is authorized by this PR task. The historical handoff's production rollout instructions do not override that restriction.

## Replacement inventory

| Repository artifact | Future Apps Script operation |
| --- | --- |
| scripts/FeedbackWeb.gs | Add as the new web backend, or replace the earlier proposed file if installed on the test copy |
| scripts/FeedbackLegacyBridge.gs | Add new helper file |
| scripts/FeedbackWebSender.gs | Add new, dormant web sender/helper file |
| scripts/FeedbackInteraction.gs | Replace the entire existing FeedbackInteraction.gs; do not keep duplicate old writers |
| scripts/FeedbackSender.gs | Replace entire FeedbackSender.gs; default is still `customer_feedback_request`, existing `runFeedbackSender` name and five-minute trigger |
| scripts/FeedbackDryRun.gs | Replace entire outdated diagnostic; it is read-only and does not simulate delivered orders |
| scripts/PermanentWhatsAppLog.gs | Replace entire file; same eleven headers, strict actual event timestamps and shared locking |
| scripts/Code-doPost.gs | Replace **only the existing doPost function inside Code.gs** with this complete function. Do not add a second file defining doPost |

Other Code.gs functions/constants, doGet, RoutificWebhook.gs, Routific.gs and PackingSlips.gs remain the supplied implementation. Do not copy the `.txt` headings into Apps Script. New files and replacements share one global namespace and one project's ScriptLock. A separately deployed second Apps Script project writing the same spreadsheet is unsupported.

The website adds `/api/feedback` and `/api/whatsapp-events`, `/feedback/open` and isolated feedback layouts. Existing `/api/whatsapp-flow`, `/api/routific-webhook` and their authentication are unchanged. Static demo route/content is preserved.

## Prerequisites/properties (names, never secret values)

Create a **separate spreadsheet copy and separate Apps Script test project without live triggers**, using the supplied live scripts as its baseline. Do not use the corrupted historical spreadsheet snapshot identified in the handoff. In that test project set Code.gs `CONTROL_TOWER_SPREADSHEET_ID` to the copy's ID and set the property below to exactly the same copy ID. The replacement sender and permanent log constants reuse that Code.gs constant. Do not point any test project or preview at the production spreadsheet or deployment.

Enable the **Google Sheets API advanced service** as identifier `Sheets`, version `v4`, and enable Google Sheets API in its Google Cloud project. Use Apps Script V8. Existing SpreadsheetApp, PropertiesService, LockService, Utilities, ContentService, CacheService and UrlFetchApp remain dependencies. The copy's script owner must have read/write access to its spreadsheet. Spreadsheet and script time zones should be Australia/Sydney. Elapsed 48-hour eligibility uses milliseconds and is not a local-calendar calculation.

| Apps Script property | Purpose / test-copy setting |
| --- | --- |
| CONTROL_TOWER_SPREADSHEET_ID | Spreadsheet copy ID; must agree with Code.gs constant |
| FLOW_MENU_API_SECRET | Existing server-to-server secret mechanism; use a separate secure test secret on the copy and test website |
| FEEDBACK_TOKEN_SIGNING_KEY | Independently generated random 32-byte secret, encoded as 64 hex characters; never use the test fixture key |
| FEEDBACK_WEB_BASE_URL | HTTPS test website's exact `/feedback/open` URL, no query or fragment; production URL only after separately approved deployment |
| FEEDBACK_LINK_TTL_HOURS | Optional integer 1–720; default 720 (thirty days) |
| FEEDBACK_V2_WRITES_ENABLED | Default absent/false; enable only on the copy after schema/integration verification |
| WHATSAPP_REQUIRE_VERIFIED_FORWARD | Must be true for V2 writes; only authenticated server-forwarded Meta POSTs are then accepted |
| FEEDBACK_V2_SENDER_ENABLED | Leave absent/false. Explicit later cutover switch; installation never changes it |
| FEEDBACK_WEB_TEMPLATE_NAME | Required for the prepared sender: `customer_feedback_web_v2_fragment`; submitted v1 is rejected |
| FEEDBACK_WEB_TEMPLATE_URL | Required exact approved template URL: `FEEDBACK_WEB_BASE_URL` followed by `#{{1}}`; no path/query token alternatives |
| FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED | Leave absent/false until replacement approval and fragment-preserving button behavior are verified; this flag alone cannot bypass the name/URL guards |
| FEEDBACK_LIVE_ENABLED | Preserve the owner's production true setting and existing sender; use **false on the copy** to prohibit all outbound feedback |
| WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, GRAPH_API_VERSION | Existing send transport. Not needed for local no-send tests; do not bind real customer messaging to the copy |

The test website uses `FLOW_MENU_API_URL` (copy's deployed Apps Script `/exec` URL) and `FLOW_MENU_API_SECRET`. Only `https://script.google.com/macros/s/<deployment-id>/exec` is accepted; Apps Script redirects to script.googleusercontent.com must be reachable. These remain server-only. Feedback needs no login, OTP, customer password or identity challenge.

For future verified Meta webhook forwarding, the website also needs `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. New `/api/whatsapp-events` verifies the exact raw request using `X-Hub-Signature-256` and forwards the authenticated envelope to Apps Script with the existing server secret. Backend feedback/forwarding secrets are never URL query parameters. All other existing ordering/delivery properties remain unchanged. Do not submit secret values in GitHub, chat, test fixtures or committed `.env` files.

Generate a signing key with a cryptographically secure generator and enter it through Script Properties securely. Do not log it or save it in this repository. Rotation affects future issuance; already-issued links are stored by hash and remain valid until expiry/revocation. Revoke existing links explicitly if rotation follows a compromise.

## Guarded setup on the copy

1. Snapshot the copy and record existing headers, data-validation rules, formulas and spill anchors. Install the reviewed replacement files as listed above, with outbound switches false and no time-driven triggers in the copy. Keep exactly one doPost.
2. Check source headers. Orders requires Order ID, Order Status, Delivery Date, Customer ID, Customer Name. Order Items requires Order ID, Order Status, Fulfilment Status, Item Code (AUTO, INTERNAL), Qty. Dishes requires Item Code, Cook ID, Dish Name, Menu Kitchen Name, Image URL, Average Rating, Rating Count. Customers requires Customer ID, Name, Phone, WhatsApp Opt-In. Deliveries requires Order ID, Delivery Status, Delivered At, Feedback Status, Feedback Requested At, Feedback Reminder Sent At, Feedback Completed At, Routific ID. Header lookup is case-sensitive and duplicate headers are rejected.
3. Run `feedbackV2Setup()` on the **copy only**. It validates source/WhatsApp headers and Feedback A:L, checks all proposed new headers before writing, and issues one guarded batch. It explicitly adds physical columns when only twelve exist. It never renames or overwrites conflicting headers. Running it again is safe.
4. Confirm Feedback A:L are unchanged: Feedback ID, Submitted At, Order ID, Customer ID, Cook ID, Item Code, Rating / 5, Complaint, Refund, Comments, Follow-up Status, WhatsApp Message ID. M:Q must be Marketing Consent, Marketing Consent At, Submission ID, Feedback Channel, Skipped. Existing complaint/refund/follow-up validations and numerical rating rules remain in place. The new tabs are Feedback V2 Links and Feedback V2 Orders; do not import old raw tokens.
5. Inspect Dishes formula anchors with `feedbackV2RatingFormulaAudit()`. Supply its **exact audited** address-to-formula map to `feedbackV2ExpandRatingRanges(map)`. This function checks exact current formulas, targets only Average Rating/Rating Count, and expands supported Feedback `2:2000` ranges to open-ended bounds without altering their blank-rating exclusions or other logic. If a formula is unsupported or changed, it aborts. Validate skipped/blank ratings and rows beyond 2000 on the copy and evaluate full-column performance. Do not rewrite a spill result cell. Actual live formulas were not included in the handoff, so no live formula changes have been claimed.
6. Set `WHATSAPP_REQUIRE_VERIFIED_FORWARD=true` and `FEEDBACK_V2_WRITES_ENABLED=true` on the copy only. Keep `FEEDBACK_LIVE_ENABLED=false` and `FEEDBACK_V2_SENDER_ENABLED=false`. Point only the test website to the copy's server endpoint. New web writes and hardened legacy writes must be enabled together; enabling the web writer while keeping old unconverted FeedbackInteraction functions defeats cross-channel safety.

## No-send functional verification on the copy

Use copied existing orders, not fake production customers/orders. Choose a Confirmed order with Delivered status, valid Delivered At, at least one positive-quantity non-cancelled dish, and no historical feedback. Orders currently stores the authoritative confirmation in column I; never substitute Order Items status for it.

- `feedbackDryRunForOrder_(orderId, false)` returns read-only eligibility and precise due time using the production sender's decision and customer resolution. It sends nothing, generates no links and makes no writes. Simulation arguments are rejected. Check exactly 48 hours minus one millisecond, equality, and plus one millisecond on controlled copy fixtures. Check Orders Pending/Cancelled and invalid delivery timestamps. Check phone/opt-in and Routific ID requirements for sending.
- Call `createFeedbackWebLinkForOrder(orderId)` on the copy and securely use its returned URL; the function never logs it. It stores only a hash. Every explicit issuance replaces earlier open links, but keeps the same order session/submission ID and draft. Do not print URLs in execution logs or paste them into a PR.
- Reopen, rate/skip/comment, pause typing, verify “Your progress is saved automatically”, reload and reopen the link in a second browser. Confirm draft JSON/revision and updated time are outside Feedback; published averages/counts must remain unchanged. A stale tab gets a conflict instead of silently overwriting newer progress.
- Submit once, double-click, retry the exact persistent submission ID, and race two clients. Confirm exactly one set of feedback rows and one completed order. All new rows, order/link completion markers and Deliveries J/M updates must appear together. Trigger a pre-commit failure and a lost response after commit on the copy, then retry. Do not reset completion flags to test idempotency.
- Revoke with `feedbackV2RevokeOrderLinks(orderId)` on an uncompleted copy order. Verify rejection. Replace an uncompleted link and verify the old one is rejected while the new one resumes the draft. Verify expiry at equality and malformed expiry fail closed.
- Before exercising the old conversation, temporarily replace sendWhatsAppPayload_ on the **copy only** with a no-network stub returning JSON containing a synthetic messages[0].id; never add a duplicate function or copy that stub into production. FEEDBACK_LIVE_ENABLED=false blocks the scheduled sender, but does not block the old interactive reply transport. Exercise the old conversation's rating handlers only with this mocked transport. All writers must use the replacements. New conversational answers stage outside Feedback and publish atomically when delivery is rated. Low dish reasons keep Y/N/Open, low delivery ratings N/N/Open; high ratings and skips N/N/None. Test completed web then late legacy replies, and the reverse. Optional legacy comments remain allowed only for legacy completion and are deduplicated persistently.
- Historical partial legacy feedback blocks web submission. Continue that legacy questionnaire on the copy and verify existing rows/IDs/complaint/refund/follow-up fields stay unchanged; only missing items are appended at completion. Historical DELIVERY/completion markers block new complete submissions. Malformed or duplicate historical data requires explicit reconciliation, not deletion or automatic rewriting.
- Test literal `=`, `+`, `-`, `@`, tabs/newlines and Unicode comments. Cells must be literal text, not formulas. Submitted At and consent/completion dates must remain typed dates. Skipped ratings must be empty, not zero, and new ID generation must recognise FB and FDBK IDs beyond row 2000.
- Use signed **synthetic** Meta receipt envelopes against the copy/test forwarding endpoint to test invalid signatures, multiple entries/changes, missing timestamps, callback-before-registration, duplicated/out-of-order read/delivered/sent events and actual event timestamps. These tests do not contact Meta or send messages. Direct unverified POSTs must not change V2 timestamps.

No production order was used for writes in this PR task. A future end-to-end provider/customer test requires separate authorization and should be reported as its own result.

## Sender preparation and later explicit cutover

The current sender remains selected while `FEEDBACK_V2_SENDER_ENABLED` is false; `FEEDBACK_LIVE_ENABLED` and its five-minute production trigger are not changed by any installer. The owner confirms that submitted `customer_feedback_web_v1` uses language `en`, body {{1}} = customer first name, body {{2}} = Order ID, and website button index 0 with prefix `https://www.makitchens.com.au/feedback/` and sample `https://www.makitchens.com.au/feedback/demo-sameera`. Its approval status has not been independently inspected. **That submitted URL contract is incompatible with this implementation. Do not use or activate v1 for secure links.** The demo sample has no secure token and remains demonstration-only.

Retain fragment-only tokens and submit a **replacement template**, without changing or activating the current sender. Proposed exact submission settings:

| Setting | Replacement value |
| --- | --- |
| Name | `customer_feedback_web_v2_fragment` |
| Category | Marketing (request approval in this category; do not assume Meta will classify a feedback request as Utility) |
| Language | English, code `en` |
| Header / footer | None |
| Body | `Hi {{1}}, how was your Ma Kitchens order {{2}}? Share your feedback using the button below.` |
| Body sample {{1}} / {{2}} | `Sameera` / `ORD-12345` |
| Button | Call to action → Visit website, dynamic URL, index `0` |
| Button text | `Share feedback` |
| Complete URL field | `https://www.makitchens.com.au/feedback/open#{{1}}` |
| Fixed URL prefix | `https://www.makitchens.com.au/feedback/open#` |
| Button variable sample | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` (43 characters, synthetic and never issued) |
| Complete button URL sample | `https://www.makitchens.com.au/feedback/open#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` |

Body {{1}}/{{2}} and button {{1}} belong to separate component parameter lists. The sender sends **two** body text parameters in that order (first name, Order ID), then one button parameter containing only the 43-character token. It selects the replacement name and `en`. The assembled URL must equal the issued link exactly.

Fragments do not reach the website's HTTP paths or referrers. Adapting the submitted `/feedback/` prefix by appending a raw token would expose it in HTTP URLs/access logs and the retired path-token route will not accept it. Appending `open#token` to that prefix is also not an accepted workaround: it changes the submitted dynamic suffix contract and assumes unverified Meta handling. No path/query fallback is implemented.

Before any separately authorized activation, obtain approval of the replacement, inspect its returned template JSON for name, language, both body placeholders and exact URL button, and verify that Meta accepts and WhatsApp preserves the fragment through a controlled, separately authorized test. Neither approval nor fragment preservation has been verified here. If Meta rejects or strips fragments, **stop the cutover**; leave the existing sender active and design a separately reviewed privacy-preserving delivery mechanism. Do not downgrade to path/query tokens.

Only after these checks, on the authorized target set `FEEDBACK_WEB_TEMPLATE_NAME=customer_feedback_web_v2_fragment`, `FEEDBACK_WEB_BASE_URL=https://www.makitchens.com.au/feedback/open`, and `FEEDBACK_WEB_TEMPLATE_URL=https://www.makitchens.com.au/feedback/open#{{1}}`. A test-domain template needs the matching test base and complete URL. Name and URL guards run before reserving a link/message; missing settings, v1, a different host, or path/query suffixes fail closed even if `FEEDBACK_WEB_TEMPLATE_URL_CONFIRMED=true`. Keep confirmation and sender switches false until separately approved cutover. These settings describe future installation; no template was submitted, message sent or production setting changed in this task.

A durable message-attempt reservation is written under lock before the provider call. Provider calls happen outside the lock. Acceptance logging and Deliveries Feedback Requested At are committed atomically afterward. Ambiguous send/log failures retain the reservation and require operator reconciliation: **never automatically resend or generate a new token** after uncertain acceptance. `feedbackV2ReconcileAcceptedMessage(...)` can record an independently confirmed provider message ID/accepted time for the same attempt without sending. There is deliberately no automated clear-reservation or resend function; revoking an unsafe link does not prove the provider did not send it.

No reminder sender was present in the supplied source. This implementation does not invent one or clear historical Feedback Reminder Sent At. Reminders require separately approved business rules. Explicit new issuance replaces a link rather than reconstructing a stored raw token; session/drafts remain order-scoped.

Before any future production activation: audit additional writers, verify the copy end-to-end and formula behavior, verify provider callback routing and approved template, snapshot the live configuration, then obtain separate approval for installation/callback transition and sender cutover. Once approved, update Meta's callback to the authenticated Next forwarding route and require verified forwarding in the Apps Script backend as a coordinated change. Do not enable V2 writes before that coordinated transition. Rollback must keep the hardened shared legacy writers, reconcile pending message reservations and completed orders, and then select the legacy sender; restoring the old non-atomic writers would reintroduce duplicates.

## Local development tests

```bash
npm install --package-lock=false
npm test
npm run build
npm start -- --hostname 0.0.0.0
```

In another terminal, using a separately installed Playwright and Chromium:

```bash
npm install --prefix /tmp/feedback-browser --no-package-lock playwright
PLAYWRIGHT_MODULE=/tmp/feedback-browser/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium node tests/feedback-browser.cjs
```

Optional `FEEDBACK_TEST_BASE_URL` selects an authorized local/test deployment. Browser tests mock `/api/feedback`, so they never call Apps Script or Control Tower. Node tests run the actual .gs functions in a service emulator and test atomic request construction, failure-before-commit, lost-response-after-commit, overlapping lock contention, cross-channel behavior and strict validation. API tests mock upstream fetch and verify signatures/timeouts/redaction. These tests provide implementation evidence, not live Google/Meta verification.

Feedback must stay out of analytics, search indexing and referrers. New token fragments never enter HTTP access-log paths; browser requests use only a static API path and POST body. Disable credential-bearing body logging in proxies/hosting/APM; redact retired token-path requests, which existing old links can still cause. Protect the static feedback API with the hosting firewall for volumetric abuse; persisted per-order limits bound writes, not total reads or project-wide Apps Script quotas.
