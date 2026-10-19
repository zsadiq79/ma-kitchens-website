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

Obtain active live web-app deployment URLs and descriptions, and the live project trigger list. Confirm which deployments serve website menu/Flow, feedback, verified WhatsApp forwarding and Routific forwarding. Record exact consumers and versions before proposing a deployment. Labels and historical notes alone are insufficient proof.

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
