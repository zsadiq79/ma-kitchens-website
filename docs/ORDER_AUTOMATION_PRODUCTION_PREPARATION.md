# Production preparation after the reviewed TEST pilot

Status as of 19 October 2026: the reviewed TEST installation and its designated checks are complete. Production deployment is not authorized or started. The current TEST Code.gs is deliberately restricted and is not a production installer.

## Read-only live preflight completed

- Live spreadsheet: 1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4.
- Live Apps Script editor: https://script.google.com/u/0/home/projects/1hjXoo82Cv5bQ8a6AQibLqmD96j9FtXUtUkIsDuz_kkrf-F71nbW0XsIE/edit.
- 26 tabs; Orders has 31 columns and Order Items 23 columns.
- Nine formula anchors match recognized migration inputs. Address and item-code snapshots are already present; the additional contact, price, cook-cost and owner journal structures are not yet installed.
- Latest live order observed: ORD-000052. Re-read under the live lock at cutover; this observation is not an ID reservation.
- Legacy state is CREATED, planned order ORD-000052, confirmation UNCERTAIN. Preserve this evidence and historical records. No resend is authorized.
- Production main remains 27ef64557f82361effbb90d7f75442b32df4096a with READY deployment dpl_8Wt9R8WEcLbFAddsxsfsRCZAjZvj.
- Production FLOW_MENU_API_URL and CONTROL_TOWER_WEBHOOK_URL are sensitive. Their actual values cannot be read through the connector. Keep existing secret values private.

## Required mapping

The owner confirmed these two active web-app URLs in the production MVP Control Tower Apps Script project on 19 October 2026:

| Label | Active web-app URL | Current version, description and access settings |
| --- | --- | --- |
| LIVE A | https://script.google.com/macros/s/AKfycbxqd0CLenSocTTP7hPl6sQcaBZC6xi3nUvjYBu1EZ5H8LKw_IrU3WKI_Z74KnIMKmzQ/exec | Version 46, dated 11 October 2026 at 8:31 PM as displayed; Untitled, blank description; execute as Me; access Anyone |
| LIVE B | https://script.google.com/macros/s/AKfycbxqPAodnUOdAQe3x82duA6q-Qld1Bb7XqoW3Mnr3JDvXOMGKuufY9dwh4JFwoEbYTLa/exec | Version 33, dated 21 September 2026 at 12:34 PM as displayed; Untitled, blank description; execute as Me; access Anyone |

The owner supplied current Manage deployments screenshots on 19 October at 1:22 PM, confirming versions 46 and 33, and the lower settings screenshots at 1:45 PM, confirming execute-as and access for both. The library URL in those lower screenshots contains the expected LIVE script project ID. These version numbers now have current screenshot evidence, rather than relying solely on the historical handoff. Their deployed source snapshots have not been retrieved. The timestamps above are UI values, not independently verified version-creation timestamps. Preserve the existing deployment IDs and record both versions for the rollback plan.

The previously supplied URL ending in AKfycbzFP3fsgl8ZW36XShFxOBVqwgH1W3qfXNbYHxy_nAoCATDJW3wd8YfUxgJi9AWPjIml/exec is TEST. The earlier single-trigger screenshot was not used as production evidence.

### LIVE trigger inventory supplied 19 October at 1:52 PM

| Function | Event | Deployment | Last run as displayed | Error rate as displayed | Production preparation requirement |
| --- | --- | --- | --- | --- | --- |
| orderEntryEdited | From spreadsheet, On edit | Head | 17 October 2026, 1:20:48 PM | 0.2% | Retire only at the approved owner-workspace cutover; retain historical reconciliation helpers |
| orderEntryMenu | From spreadsheet, On open | Head | 19 October 2026, 12:21:40 PM | 0% | Replace the old entry menu with the new owner-workspace menu at cutover |
| showPackingSlipsMenu_ | From spreadsheet, On open | Head | 19 October 2026, 12:21:40 PM | 0% | Preserve the packing menu and its existing trigger |
| runFeedbackSender | Time-based | Head | 19 October 2026, 1:49:41 PM | 0.23% | Preserve the existing timer, credentials, enabled flags and template selection; no send or configuration change is authorized during preparation |

All four handlers are present in the supplied originals and reviewed consolidated TEST source. The TEST feedback sender is deliberately blocked, so that TEST file remains unsuitable for LIVE installation. The original installer sets a five-minute feedback timer, but the screenshot does not reveal the installed timer interval. Do not present five minutes as an independently verified current setting or recreate the timer unnecessarily. A timer run is not evidence that customer messages were sent; the sender also checks its existing feature flags.

All four triggers target Head. Treat pasting/saving replacement editor source as a production change even before either web-app deployment is updated. The candidate and staged migration must preserve existing trigger behavior until the approved switchover. Reverting web-app versions alone does not revert saved editor source or trigger behavior. The rollback package therefore needs the exact pre-cutover editor files/manifest and trigger inventory as well as versions 46/33. Current live editor source must be confirmed unchanged from the supplied originals or freshly backed up before the final installation.

The two small displayed error rates are aggregate historical evidence; the screenshot supplies no error messages or failure dates. Do not claim a current outage, a specific cause, or that these historical failures are fixed. Reconcile relevant failed executions before declaring production readiness if they are recent or recurring.

### Consumer contracts and verified website destination

Read the following files from production main commit 27ef64557f82361effbb90d7f75442b32df4096a through GitHub on 19 October. Main still points to that commit. The Vercel environment read used decrypt=false and confirmed that the production URL values are sensitive and omitted. No secret values were requested or printed.

| Consumer | Vercel destination setting | Apps Script routing and authentication | Matching LIVE URL |
| --- | --- | --- | --- |
| app/api/whatsapp-flow/route.ts | FLOW_MENU_API_URL | POST action=menu; FLOW_MENU_API_SECRET in JSON body | LIVE A, Version 46, verified through shared setting and execution trace |
| lib/feedbackApi.ts | FLOW_MENU_API_URL | POST action=feedback_read, feedback_draft, feedback_event or feedback_submit; same secret in JSON body | LIVE A, Version 46, directly traced through invalid-link lookup |
| app/api/whatsapp-events/route.ts | FLOW_MENU_API_URL | Verify Meta signature, then POST action=whatsapp_verified with forwarding secret and payload | LIVE A, Version 46, verified through shared setting and execution trace; upstream Meta subscription destination still to reconcile |
| app/api/routific-webhook/route.js | CONTROL_TOWER_WEBHOOK_URL | Verify Routific signature, then POST controlTowerSecret and payload; backend requires status=200 acknowledgement | LIVE B, Version 33; owner confirmed the matching provider-test execution at 2:38 PM |

The supplied original Code.gs dispatcher supports these menu, feedback, verified WhatsApp and Routific contracts. This is source evidence, not proof that both active deployed snapshots match editor source. Direct provider callback configuration and any additional consumers still require reconciliation. Do not infer that a deployment is unused because it is absent from these two Vercel settings.

Current deployment versions, blank descriptions, access settings and the owner-supplied LIVE trigger list are now recorded above. Both production URL variables are sensitive and non-readable after creation, including in the Vercel Dashboard; do not ask the owner to reveal their values there. Official platform guidance: https://vercel.com/docs/environment-variables/manage-across-environments. Confirm the actual Meta and Routific callback routes and match the consumer destinations through execution evidence or another non-secret configuration record. Record exact consumers and versions before proposing a deployment. Labels and historical notes alone are insufficient proof. No production configuration changes were issued while recording this inventory.

### Read-only production FLOW_MENU_API_URL routing trace

Earlier setup context retrieved on 19 October indicates an intended Routific destination of LIVE B and a Meta destination of LIVE A, but it does not establish the currently saved Vercel values. The FLOW_MENU_API_URL mapping is now verified by the execution trace below. The separate Routific destination remains pending.

To identify the deployment behind FLOW_MENU_API_URL without reading that sensitive value, issued one request to https://www.makitchens.com.au/api/feedback using action=feedback_read and a newly generated random, nonexistent feedback token. No existing customer link was used, and browserOpened, submission, revision and event fields were absent. Reviewed the production website forwarding contract and original Apps Script read path first. A nonexistent token is rejected during the locked link lookup before any tracking, feedback, customer or operational-order write. No test link was created, and the random token was not retained or printed.

- Request started 19 October 2026 at 1:58:29.536 PM Sydney time; completed at 1:58:45.553 PM.
- HTTP 410, response {"error":"INVALID_LINK"}, which is the expected rejection for this input.
- Correlation ID a793d258f0a7467da0408069e0b1cc0d.
- Server timing: route 2770 ms, upstream 2770 ms, Apps Script 1481 ms, lock 65 ms, sheet reads 751 ms, sheet writes 0 ms.
- The owner confirmed Version 46 at 2:02 PM and supplied screenshot image(20261019-030233).png. It shows doPost, Web App, Version 46, start 19 October at 1:58:43 PM, duration 2.218 seconds, Completed. This falls inside the probe interval and matches the backend timing. Logs were not available to the owner; the execution metadata is sufficient for this routing check.
- FLOW_MENU_API_URL is therefore verified as LIVE A. The menu and verified-WhatsApp forwarding code use that same production setting, so their downstream deployment is also identified. The test directly exercised only an invalid feedback lookup, not a real feedback submission, menu transaction or Meta delivery event.
- The same screenshot shows two Head/runFeedbackSender executions at 1:54:41 PM and 1:59:41 PM, both Completed. This is direct evidence of a five-minute observed cadence for that interval, not proof that any messages were sent and not a reason to reinstall the timer.
- Routific uses its separate CONTROL_TOWER_WEBHOOK_URL setting and still needs independent destination mapping. Do not assign it to Version 33 by elimination.

Attempted a read-only production Vercel runtime-log lookup for existing Routific calls. A seven-day lookback was rejected because the project's Hobby retention window is too short. A corrected recent-window query did not identify either Apps Script deployment. This does not show that Routific is unused or failing. Current provider callback configuration or a matching existing execution is still needed. No new Routific event, signature bypass, diagnostic route, route dispatch, secret extraction or configuration change was attempted.

Only this invalid-link read probe was issued to production during this mapping step. Production source, deployments, triggers, sheet data, settings, credentials, provider sends and dispatch were not changed.

### Routific provider callback supplied 19 October at 2:30 PM

The owner reports the active callback in Routific as https://makitchens.com.au/api/routific-webhook. This identifies the provider-to-website hop; it does not reveal the sensitive CONTROL_TOWER_WEBHOOK_URL value used for the website-to-Apps-Script hop.

Read-only boundary checks, without following redirects:

| URL | HEAD result | POST with empty JSON and no signature |
| --- | --- | --- |
| https://makitchens.com.au/api/routific-webhook | 308 redirect to the corresponding www URL | 308 redirect to the corresponding www URL; request started 2:32:49 PM Sydney |
| https://www.makitchens.com.au/api/routific-webhook | 405, method not allowed | 401, Missing signature; request started 2:32:56 PM Sydney |

Main is still 27ef64557f82361effbb90d7f75442b32df4096a. Its original Routific website handler checks the provider signature before parsing or forwarding the body; the missing-signature checks above therefore do not reach Apps Script or update delivery/customer records. HEAD 405 on the direct address is consistent with a POST-only route and is not a failed webhook test. Neither probe is an authenticated provider-to-Apps-Script test.

The configured non-www address adds a canonical-domain redirect. The owner-initiated provider test below followed that path successfully and reached the www website handler. Therefore this redirect is not a demonstrated current connection failure. Configuring https://www.makitchens.com.au/api/routific-webhook directly remains an optional improvement to remove an extra hop in an approved maintenance step, rather than a reason to change the current callback during preparation. The callback was not changed. Do not claim missed deliveries from the redirect observation or change both Apps Script deployments by elimination.

Routific's official help describes a built-in Test Connection action under Company Settings > Routific Webhook, for checking reachability: https://help.routific.com/en/articles/68-webhooks-get-real-time-updates-from-routific. The owner used that existing test button and supplied image(20261019-033459).png at 2:35 PM. Its dialog says a test was sent to the unchanged non-www callback and asks the owner to check its arrival. That dialog alone is not a backend success acknowledgement.

Read the production Vercel runtime logs for the corresponding request, 694ms-1792380883054-414c3d1f6ba4, without printing customer payloads or credentials. They show:

- 19 October at 2:34:43.120 PM Sydney, POST /api/routific-webhook, domain www.makitchens.com.au, production main deployment dpl_8Wt9R8WEcLbFAddsxsfsRCZAjZvj: provider signature verified.
- The verified test payload is exactly a message of Routific test webhook and timestamp 2026-10-19T03:34:42.536Z. It has no type, order, route or delivery data.
- At 2:34:44.294 PM, the same website request logged the Apps Script acknowledgement {"status":200,"message":"Ignored unsupported Routific event."}.
- That is the expected harmless response to a payload with no event type. The original receiver returns before operational processing for that input. No delivery was manufactured, status changed, route published or customer message requested.
- This verifies the current provider signature, redirect-following behavior for this test, Vercel forwarding credentials, transport to an Apps Script receiver and backend acknowledgement. It does not exercise a real order.status_updated or route.published event or identify the Apps Script deployment/version by itself.
- The error log at 2:33:05 PM reporting a missing signature corresponds to the deliberate unsigned boundary check above. Do not classify it as a failing Routific delivery.

The owner checked the matching LIVE Apps Script doPost execution and confirmed Version 33 at 2:38 PM. No screenshot or logs were requested again. Together with the authenticated provider test and current deployment inventory, this verifies CONTROL_TOWER_WEBHOOK_URL as LIVE B. The two existing Vercel backend destinations are now mapped: FLOW_MENU_API_URL to LIVE A/46, and CONTROL_TOWER_WEBHOOK_URL to LIVE B/33. Preserve both existing URLs and their different current rollback versions. Upstream Meta subscription settings and source/migration rehearsal remain separate readiness checks; do not claim that tracing the two backend connections completes production rollout preparation.

## Production candidate to prepare

The two existing Vercel backend destinations are now verified. Preparation has moved to the production-specific build and a fresh-copy migration rehearsal. No production candidate has been installed or deployed.

1. Build a separate production candidate from the reviewed source, using the live workbook and an explicit production environment. Do not disable TEST guards in-place as a deployment shortcut.
2. Preserve all required existing service handlers and their authentication contracts, including verified WhatsApp/Routific ingress, feedback and publisher functions. Re-enable providers only in the deliberate production configuration and approved rollout stage.
3. Keep the new Owner Order workspace as the sole manual/website entry interface. Retire old entry controls only after pending-state checks, while retaining draft/order history, ID reservations and recovery helpers.
4. Use the existing live Menu Config and customer/registry identities. Start production request/review/journal ledgers from production data. Do not import synthetic TEST customers, requests, orders, journals or counters.
5. Make schema and formula migration idempotent and validate exact inputs before writes. Capture current schemas, formulas, deployment versions and trigger inventory for rollback.
6. Preserve current live provider credentials and existing document IDs. Never copy TEST provider settings or copied TEST output links over live configuration.

## Rehearsal and rollout gates

Created a fresh native copy directly from LIVE on 19 October, after completing the connection map. It is distinct from LIVE and the previous TEST installation:

- Title: Ma Kitchens PRODUCTION REHEARSAL 19 Oct 2026.
- Spreadsheet ID: 1aMJuPNJM2vVEeSlMZx8LIdkwSCKqd-_FojZelZ87RSs.
- Verified connector URL: https://docs.google.com/spreadsheets/d/1aMJuPNJM2vVEeSlMZx8LIdkwSCKqd-_FojZelZ87RSs/edit?usp=drivesdk.
- Stored in the owner's private ChatGPT folder. Drive metadata reports shared=false and only an owner permission.
- Native copy checks: all 26 sheet property records match, including sheet IDs/order, row/column counts and frozen rows. All 6,505 sampled native cells match for user-entered values/formulas, formatting, validation and chips.
- All nine formula anchors are identical. The 52 Order IDs, operational item-to-order ID relationships and 45 customer ID-to-phone mappings match the source baseline.
- Order Entry K1:K18 metadata matches the captured LIVE values exactly, including CREATED / ORD-000052 / confirmation UNCERTAIN. Nine historical entry IDs match. No resend was attempted or authorized.
- The seven new request/owner ledgers are not installed. Orders still has 31 columns and Order Items 23. No TEST synthetic customer, request, order, journal, reference counter or provider configuration was imported.
- No source workbook writes were issued. Screen rendering has not been inspected; verification used native copy metadata and bounded native formatting/validation reads.
- Safe, non-customer baseline results are recorded in docs/order-automation-production-rehearsal-baseline.json. Actual customer mappings, cart JSON and feedback tokens are not included in that repository artifact.

The owner supplied the rehearsal editor URL on 19 October: https://script.google.com/u/0/home/projects/1bf4ZUVw5ugJt3PiDBpRTLG_bdfTkuzSEtB8vpfcPjkfLseESaD-e_Tf5/edit. Its project ID differs from LIVE and the old TEST project. A separate rehearsal package is now compiled for this exact workbook/project pair. Configuration will independently check the actual bound workbook and owner before setup. Do not run the copied original functions: they contain the LIVE workbook binding. Do not paste the old TEST installer into this fresh copy.

The production/rehearsal pair has been built from the supplied original modules plus reviewed shared source. Both outputs retain all original function names. The earlier TEST build is unchanged. Offline validation now passes 177 tests. The owner has now installed the rehearsal package, configured it successfully at 5:12 PM and completed its native migration at 5:19 PM. Independent readback confirms the expected schema, 52 existing orders, 184 item rows and all 45 customer ID/phone mappings, with only the intended cancelled-delivery-fee correction. Native rerun/preview checks now passed, with existing financial records unchanged. Private menu preparation is verified for all 14 dishes on 22 October, including identity/revision hashes, prices, cook costs, stock and ordering rules. The rehearsal owner workspace is now ACTIVE, its dialog opens with the correct rehearsal banner, and the old entry screen is hidden. A synthetic CUST-000046 customer was saved and independently verified, with all 45 original customer identities preserved. The first manual order, ORD-000053, is accepted and VERIFIED, with repeated-check and saved-review reopening checks passed. Cook and delivery previews, packing, cancellation/restoration and delivery-charge correction are verified in the fresh copy. Both owner and packing menus now appear. The next native gate is connecting a separately deployed rehearsal web app to the scoped website preview and testing request capture/recovery/acceptance. Public capture remains disabled. Production installation and rollout remain unapproved and have not started. See ORDER_AUTOMATION_RELEASE_REHEARSAL.md and order-automation-rehearsal-native-migration-20261019.json for the current evidence and remaining gates.

Build requirements for the production/rehearsal pair:

1. Generate from the supplied original modules plus reviewed shared order modules, preserving a function inventory and exact input hashes. Keep the completed TEST build unchanged.
2. Give the rehearsal package an explicit workbook/project binding and block all network, document/Drive output and background provider triggers before any provider side effect. Keep native read/write operations within the new copied workbook only. Do not copy production credentials into it.
3. Preserve the four LIVE Head handlers before activation. Saving source and changing web-app versions are separate changes. In particular, the feedback timer must not acquire TEST guards or new-schema requirements before migration is ready.
4. Validate all operational headers, destination columns, recognized formula variants, pending submissions and allowed triggers before schema writes. Group compatible schema mutations atomically; preserve records and handle an uncertain response by reconciliation rather than a blind repeat.
5. Start the new owner/request ledgers from this fresh baseline, reserve IDs under the shared lock across old and new writers, and keep public capture disabled until schema/menu state and the approved rollout stage are ready.
6. Rehearse normal installation, rerun/idempotence, unexpected-schema rejection, uncertain migration recovery, owner-only authorization, capture/recovery, customer identity preservation, accepted-order totals, stock and all existing downstream outputs. Use no external provider effects in the rehearsal.
7. Prepare rollback for both web-app versions and saved Head source/trigger controls. Preserve new ledgers and accepted operational records; do not blindly undo new snapshot formulas or delete new orders after use.

Rehearse against a fresh authorized copy of the live workbook, compare operational/customer identities and totals, and verify shared downstream outputs. Preserve or explicitly reconcile any active in-flight submission before cutover. Prepare exact install, deployment, trigger and rollback steps as a concrete reviewable package before requesting production rollout approval.

Actual provider sends, route dispatch and existing document generation were blocked during the TEST pilot. Their activation and any controlled live-order test require the rollout authorization. No customer messages or dispatch actions are authorized by this preparation note.
