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

### Confirmed consumer contracts, deployment destination pending

Read the following files from production main commit 27ef64557f82361effbb90d7f75442b32df4096a through GitHub on 19 October. Main still points to that commit. The Vercel environment read used decrypt=false and confirmed that the production URL values are sensitive and omitted. No secret values were requested or printed.

| Consumer | Vercel destination setting | Apps Script routing and authentication | Matching LIVE URL |
| --- | --- | --- | --- |
| app/api/whatsapp-flow/route.ts | FLOW_MENU_API_URL | POST action=menu; FLOW_MENU_API_SECRET in JSON body | A or B, pending |
| lib/feedbackApi.ts | FLOW_MENU_API_URL | POST action=feedback_read, feedback_draft, feedback_event or feedback_submit; same secret in JSON body | Same setting as menu; A or B, pending |
| app/api/whatsapp-events/route.ts | FLOW_MENU_API_URL | Verify Meta signature, then POST action=whatsapp_verified with forwarding secret and payload | Same setting as menu; A or B, pending |
| app/api/routific-webhook/route.js | CONTROL_TOWER_WEBHOOK_URL | Verify Routific signature, then POST controlTowerSecret and payload; backend requires status=200 acknowledgement | A or B, pending |

The supplied original Code.gs dispatcher supports these menu, feedback, verified WhatsApp and Routific contracts. This is source evidence, not proof that both active deployed snapshots match editor source. Direct provider callback configuration and any additional consumers still require reconciliation. Do not infer that a deployment is unused because it is absent from these two Vercel settings.

Current deployment versions, blank descriptions, access settings and the owner-supplied LIVE trigger list are now recorded above. Privately compare the two production Vercel URL settings with LIVE A/B without sharing any secret. Confirm the actual Meta and Routific callback routes. Record exact consumers and versions before proposing a deployment. Labels and historical notes alone are insufficient proof. No production endpoint requests or configuration changes were issued while recording this inventory.

## Production candidate to prepare

1. Build a separate production candidate from the reviewed source, using the live workbook and an explicit production environment. Do not disable TEST guards in-place as a deployment shortcut.
2. Preserve all required existing service handlers and their authentication contracts, including verified WhatsApp/Routific ingress, feedback and publisher functions. Re-enable providers only in the deliberate production configuration and approved rollout stage.
3. Keep the new Owner Order workspace as the sole manual/website entry interface. Retire old entry controls only after pending-state checks, while retaining draft/order history, ID reservations and recovery helpers.
4. Use the existing live Menu Config and customer/registry identities. Start production request/review/journal ledgers from production data. Do not import synthetic TEST customers, requests, orders, journals or counters.
5. Make schema and formula migration idempotent and validate exact inputs before writes. Capture current schemas, formulas, deployment versions and trigger inventory for rollback.
6. Preserve current live provider credentials and existing document IDs. Never copy TEST provider settings or copied TEST output links over live configuration.

## Rehearsal and rollout gates

Rehearse against a fresh authorized copy of the live workbook, compare operational/customer identities and totals, and verify shared downstream outputs. Preserve or explicitly reconcile any active in-flight submission before cutover. Prepare exact install, deployment, trigger and rollback steps as a concrete reviewable package before requesting production rollout approval.

Actual provider sends, route dispatch and existing document generation were blocked during the TEST pilot. Their activation and any controlled live-order test require the rollout authorization. No customer messages or dispatch actions are authorized by this preparation note.
