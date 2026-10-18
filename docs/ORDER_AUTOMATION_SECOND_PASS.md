# Ma Kitchens order automation: second pass

Review date: 18 October 2026, Australia/Sydney.

The review found material defects in the first integrated candidate. They are corrected in the preview source and regenerated test installer. The result is ready for controlled installation and runtime verification in the designated test project. It is not a production rollout or a certification that every retained legacy action has run successfully in Google.

## Scope and evidence

- Integrated Apps Script: 424 functions across all twelve supplied original modules, the new order modules, publisher and test boundaries. The full function inventory records source locations and custom call relationships. All supplied original function names remain present. No duplicate function declarations, unresolved custom helper calls or direct external fetch/document operations remain in the generated test file.
- GitHub: reviewed the preview branch and the supplied original source fingerprints. Fixes remain on `codex/order-request-capture-preview`.
- Vercel: inspected the connected project, latest deployment and environment variable names/scopes. The project uses Node 24. The preview inherited legacy provider settings. Added a plain `ORDER_AUTOMATION_TEST_ONLY=true` setting for this preview branch only, plus API middleware that blocks unrelated legacy/contact routes.
- Website: verified both live and preview menu metadata, the 22 October menu, 14 available dishes, all 14 referenced image files, the existing order page, capability recovery, request handlers and neighbouring provider endpoints. The ordering layout has no analytics component that receives its capability fragment.
- Spreadsheet: read the live structure without mutation and audited the test copy's operational columns, formulas, customer registry, intake types, legacy Order Entry metadata and cook summary dependencies. All 45 populated intake phone values were numeric.
- Google Sheets experiment: used synthetic data on a temporary tab in the test workbook. A text phone was excluded from the numeric QUERY result (3 records); replacing it with a number returned all 4. Five servings at $11.20 produced $56 food and $50 payout; changing quantity to six produced $67.20 and $60, while the original line snapshot stayed $56. Cancelling produced $0 revenue and $0 payout. The temporary tab was deleted. No live spreadsheet records or formulas were changed.

Static inspection covers every function in the generated inventory. Focused executable tests cover the changed order paths and listed regressions. Retained provider sends and document generation are intentionally blocked in this test package, so they are not represented as externally exercised.

## Findings and fixes

Severity describes the potential effect if the earlier candidate were used for operational ordering. These findings are not a claim that each failure occurred in production.

| ID | Severity | Finding | Fix and verification |
|---|---|---|---|
| 01 | High | New customer phones were written as text into a registry whose QUERY column is numeric. Timestamp handling also ignored numeric serials, risking customer ID ordering. The old Order Entry customer writer had separate, weaker handling. | New numbers use numeric cells. Existing intake values retain their original type. Date, numeric and ISO timestamps are compared in spreadsheet serial units; new submissions are strictly later than every existing one, with explicit date formatting. Invalid timestamps stop before writing. The old form delegates customer saving to the same durable engine. Verified by tests and the real Sheets experiment. |
| 02 | High | Recovery cleared the review and its COMMITTING journal in separate requests. A failure between them could leave future orders blocked. | Both changes are in one atomic batch. A simulated failed recovery leaves both records COMMITTING; retry clears both together. |
| 03 | High | Saving customer consent could reload the customer's default address over an alternate address entered for the current order. | The owner form retains the entered delivery address/postcode unless an explicit default update was requested. The actual form code is exercised by a regression test. |
| 04 | High | The Vercel preview inherited legacy provider settings. Exercising unrelated APIs could reach existing systems. | Added branch-specific isolation middleware and the explicit preview environment flag. Only the new capture/recovery APIs and public menu metadata are allowed on this review preview. Production is not targeted by the setting. |
| 05 | High | Denied browser session storage stopped saving entirely, and a storage failure after a successful save could prevent opening WhatsApp. | Save/retry identity also lives in memory. Storage reads/writes are optional. State is set before the convenience cache is written. The actual submit function is tested with storage throwing on every operation and a lost first response. |
| 06 | High | A saved request with a lost response could become inaccessible when the menu expired or a new menu was published. | A retained random retry key can recover the existing capability and reference through the signed recovery contract, without creating another request. A recovery control remains available when the menu is closed. A minimal reference-only WhatsApp follow-up can resume the conversation. |
| 07 | High | Writers used fixed column positions while mostly checking column names. Moved columns or changed shared lookup formulas could be detected only after an order was written. | Exact operational layouts and the shared address/item/contact snapshot formulas are checked before commits. Private/public ledger headers are also checked. Reordered columns and corrupted address formulas are tested to stop before operational/journal writes. |
| 08 | High | Public capture trusted recalculating Weekly Menu remaining values and silently overwrote duplicate menu IDs. Cook/name/kitchen changes were not all compared with the published state. | Capacity is derived from authoritative non-cancelled operational inputs under the shared lock. Duplicate menu/state identities fail closed. Current dish status and saved identity fields must match. Stale formula and identity-change regressions are tested. |
| 09 | High | The new line total formula returned the saved total even if an owner later changed quantity, while payout could change with quantity. | Operational line totals calculate current quantity times the frozen unit price, rounded to cents. Original line totals remain as audit snapshots. Cancellation yields zero. This was checked in real Sheets and regression tests. A later edit also causes review reconciliation to withhold the old confirmation. |
| 10 | Medium | Repeating an already successful customer operation could overwrite a default address saved later. | A READY operation returns the current verified customer without applying its old defaults again. Tested with a later address update. |
| 11 | Medium | Buttons were locked during RPCs but editable fields remained active. A response could overwrite details changed while it was in flight. | Inputs, selects, textareas and buttons are locked together during actions. Tested against the actual owner form. |
| 12 | Medium | Re-reviewing an accepted manual draft could display a new quote although acceptance would resolve to its existing order. | A draft with a saved or uncertain order cannot be presented as a fresh review. The owner must load its saved review or start a new manual order. |
| 13 | Medium | The manual-send marker trusted a previously VERIFIED state even after the order changed or was cancelled. | It reconciles the saved order again before recording the owner's manual-send assertion. A cancelled-order regression is covered. |
| 14 | Medium | Packing could include a confirmed order with no remaining items or a failed Order Check. Internal operation/draft text could appear on slips. | Packing excludes zero-pack and flagged orders. New owner notes contain delivery instructions rather than internal operation IDs; the legacy draft prefix is removed from packing notes. |
| 15 | Medium | Feedback resolved dish/cook/kitchen identity from the current catalogue, despite accepted-order snapshots. Its optimized reads also did not load the new snapshot columns. | Both direct and optimized feedback reads use accepted item snapshots, with historical-row fallbacks. A changed or removed catalogue record cannot reassign a snapshotted item to another cook. |
| 16 | Medium | The WhatsApp log ranked Failed above Read, allowing a delayed failure to replace stronger receipt evidence. | Receipt progression ranks Read/Delivered/Sent above a failure. Failure details remain available. Rank regressions are tested. |
| 17 | Medium | The existing Routific/Flow HTTP forwarding paths contained raw payload/error logging, unbounded reads or missing timeouts/endpoint checks. | Removed private payload/provider-response logging, bounded request reads, added upstream timeouts and restricted forwarding to Apps Script endpoints. Routific HMAC and upstream application status are checked. These routes remain blocked on this test preview. |
| 18 | Medium | Retried item arrays used their incoming order in the payload hash. Duplicate retry records were not explicitly rejected. | Items are canonicalized before hashing. Duplicate durable keys fail closed. Retry key case is normalized; malformed cached keys are ignored. Recovery also receives a bounded rate limit, and in-memory rate buckets have a size cap. |
| 19 | High | Withdrawal updated private capture state only after GitHub publication. A provider failure could leave capture active while withdrawal was intended. | The authoritative state closes before the first provider call. A failed GitHub withdrawal is tested to leave capture WITHDRAWN. |
| 20 | Medium | An identical-menu private state write failure was caught as though the old public JSON were invalid, potentially causing another GitHub commit. | JSON parsing and private state writes have separate error handling. A private state failure cannot turn into a redundant public commit. |
| 21 | Medium | The inherited menu selector could choose the earliest closed cycle and return no menu even when a later eligible cycle existed. | Closed cycles are skipped during the original selection step. Descriptions, portions and other existing fields are retained. The next-cycle transition is tested in the Sydney timezone. |
| 22 | Low | The public order bar called its list-price quote “Total”, although the owner applies the final discount/confirmation. | It now says “Estimated total” and explains that availability, discounts and the final total will be confirmed. |

## Test status

- Local tests: 110 passed after the source fixes, including the original tests and focused second-pass regressions. These include actual TypeScript route contracts, signed forwarding into the Apps Script recovery handler, the actual owner form functions, and the actual public submit function with disabled storage.
- Combined Apps Script syntax and top-level loading: pass. All custom helper calls resolve. Runtime initialization has no top-level service side effects.
- Generated inventory: `docs/order-automation-audit-inventory.json`. It is a static inventory, not a claim of individual external runtime coverage for every function.
- Real spreadsheet experiments: pass; temporary test sheet removed.
- Fresh Vercel build/runtime checks: recorded in the deployment verification section after the corrected commit builds.

## Remaining runtime gates

The Apps Script connector cannot install or execute the bound script. No new test web app has been deployed, and the preview still lacks `ORDER_REQUEST_API_URL` and `ORDER_REQUEST_API_SECRET`. Therefore the complete browser → deployed Apps Script → actual operational row flow has not run yet. The corrected source deliberately fails closed in that condition.

After installing the reviewed package, test Google authorization, legacy Order Entry controls, the owner modal on the daily devices, new/existing customer intake, duplicate acceptance, interrupted responses, actual formula reconciliation and downstream outputs in the test copy. Validate exact live trigger and deployment consumers before any production proposal. Sensitive Vercel URL values are not exposed by the current connector, so historical deployment labels are not treated as verified consumer mappings.

External WhatsApp/feedback sends, Routific dispatch and existing Drive document generation stay blocked in this test installer. Their source interfaces were checked, but their providers were not called. Existing legacy WhatsApp cart creation retains its original sequential-write/rollback protocol; the new public request/owner acceptance path uses the durable journal. Changing that legacy protocol or enabling outbound actions requires a separately tested production integration.

The API rate limits are bounded per process, not a distributed abuse-control service. Restricted spreadsheet edits and other Apps Script projects remain outside this project's ScriptLock. No production code or data was changed during this review.

## Deployment verification

Pending the corrected preview commit's build and HTTP read checks. Production remains on its existing branch and deployment.
