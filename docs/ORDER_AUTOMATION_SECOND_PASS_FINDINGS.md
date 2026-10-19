# Ma Kitchens order automation: consolidated second-pass findings

Reviewed on 18 and 19 October 2026.

The review identified **27 defects: 13 High, 13 Medium and 1 Low**. Fixes are in the reviewed source. **137 automated tests pass.** The updated TEST candidate is installed. Old-entry retirement completed, and the owner workspace still verifies ORD-000055. The existing TEST web-app deployment is updated and passes health, unsigned-request and legacy-ingress checks.

Severity reflects the potential effect of using the earlier candidate for operational ordering.

The new Owner Order workspace is the single interface for manual orders and website requests. Shared cook, stock, packing, delivery and feedback functions remain integrated. The old entry screen's write actions are disabled in the updated TEST candidate. Its draft records, history, planned IDs and reconciliation helpers are retained.

## Findings, severity and fixes

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
| 23 | Medium | Initializing from the Apps Script editor called a spreadsheet UI API after schema writes, so setup stopped before finishing. | Initialization no longer builds menus; the installed on-open trigger handles menus. A retry regression and Google runtime initialization pass. |
| 24 | High | The new owner workspace could report no planned order after a successful Sheets API commit because SpreadsheetApp still exposed its earlier read snapshot. | Fresh API reads now reconcile reviews, orders, item snapshots, request links and customer recalculation. Errors preserve the planned identity and offer Check saved order. Local regressions and Google runtime ORD-000054 and ORD-000055 verify the fix. |
| 25 | High | Comparing whole item objects made an unchanged website selection appear edited when object properties arrived in another order. | Both sides are projected to sorted menu-line/quantity pairs. Real edits still need an audit reason. Regressions pass; unchanged captured selection accepted as ORD-000055 without a false reason. |
| 26 | High | The older Order Entry metadata, checker and recovery could miss API-written state or rows. A stale absence check could restore a committed draft for another submission. | Fresh API reads cover metadata, duplicate lookup, reconciliation and recovery's order/item existence checks. Six regressions pass, including read failure and orphan-item retention. The final TEST candidate also blocks old-form writers and prepares retirement of its controls. Only the preserved reconciliation helpers remain for historical recovery; the old entry UI is no longer a runtime gate. |
| 27 | Medium | A cancelled order retained its delivery fee in Order Total, and Dashboard revenue included that charge. | The shared total array returns zero for Cancelled orders. The source migration recognizes the old/new formulas and acceptance guards the new one. Native TEST cancellation removes the full AUD 66 from dashboard revenue; active totals remain AUD 66.80, AUD 73 and AUD 66. |

## What passed in Google

- TEST configuration, initialization and owner workspace opening.
- Existing-customer lookup and synthetic new-customer creation. All 45 original customer ID/phone mappings remained unchanged.
- Manual orders ORD-000053 and ORD-000054, including a 10% order discount and an alternate address without changing the customer's default address.
- Website selection capture, signed forwarding, private request saving, public recovery and owner acceptance as ORD-000055. WhatsApp receipt was deliberately simulated in TEST.
- Numeric reference 1000 in the prepared WhatsApp message, saved-request recovery and private owner lookup. Tentative capture created no operational order or stock reservation.
- Three accepted test orders: 15 servings and AUD 151 cook payout. Haleem has 11 committed servings and 39 remaining.
- Whole-order cancellation: stock released, cook payout zero, total revenue zero after the delivery-fee fix. The dashboard removes the full AUD 66 when ORD-000055 is cancelled. Its original quote snapshot is preserved.
- Item cancellation: active quantity zero, payout zero, stock released, Order Check flagged and delivery preview excluded. The item was restored afterward.
- Cook preparation summaries: 14 servings for FOODIE CLUB and one for ZAUQ KITCHEN; no internal customer/request/operation codes in the messages.
- Delivery preview includes confirmed ORD-000055 with matching contact, address and delivery window, and excludes pending or cancelled/flagged orders. No route was dispatched.
- Packing preview: one bag for ORD-000055, five packs, first name and suburb only; no phone/full address or internal codes.
- Feedback status: sending disabled, zero sender triggers and 14 copied historical queue candidates. The status check sent no messages.

## Linked configuration and preserved source

All twelve supplied original modules remain in the source baseline with recorded hashes. The final TEST package has 428 functions, one public dispatcher and no unresolved custom helper calls. The source inventory records each function and its calls; individual provider runtime coverage varies.

Fixes are confined to the GitHub preview branch `codex/order-request-capture-preview`. Production main remains `27ef64557f82361effbb90d7f75442b32df4096a`; the production Vercel deployment remains READY at that commit. The capture URL, signing secret and TEST isolation flag are scoped to this preview branch. No secret was decrypted or printed. The unintended broad preview secret was previously overwritten with an inert value, leaving the actual signing secret branch-specific.

The public reference format is now `Order ref: 1000`. Numeric references increase automatically and may have gaps after failed writes. Existing MK references remain supported. Public recovery still requires a separate random capability, so guessing the visible number does not expose a request.

## Final TEST steps

1. Completed: installed the consolidated 19 October Code.gs candidate in the TEST project. The owner HTML and manifest were retained.
2. Completed: ran `retireLegacyOrderEntryInTest`. The old entry sheet is hidden, records are retained, and zero matching old entry triggers were present to remove.
3. Completed: reopened the TEST spreadsheet and confirmed ORD-000055 / VERIFIED in the Owner Order workspace.
4. Completed: updated the existing TEST web-app deployment to a new version at the same URL. Health returns TEST / external actions BLOCKED; unsigned capture and legacy ingress are rejected. Public handler source is unchanged from the earlier successful signed capture/recovery version.

The cancelled-order total formula is already corrected and verified in the TEST spreadsheet. The consolidated candidate adds its migration and acceptance guard for subsequent setup/writes.

## Production limits and rollout gates

This is a TEST package. All external message sends, Routific dispatch, GitHub publishing from Apps Script and existing Drive document operations are blocked. Actual outbound message delivery, route dispatch and packing document generation have not been exercised in this run.

Before a production proposal, verify the exact live Apps Script deployment URLs used by website feedback/menu services, WhatsApp and Routific, inventory live triggers, prepare the production-specific integration and rollback, and obtain explicit rollout authorization. The current connector does not expose all sensitive production URL values. Labels alone are not proof of a live consumer mapping.

The legacy WhatsApp cart writer retains its original sequential-write/rollback behavior; the new public-request/owner-acceptance path uses the atomic journal. Per-process API rate limits are not distributed. Other projects and direct sheet edits are outside this project's ScriptLock.

No production code, operational data, consumer URL or trigger was changed during this review.

## Subsequent release review, 20 October 2026

The fresh production rehearsal added nine findings to the 27 above: three High, four Medium and two Low. The combined review now records **36 findings: 16 High, 17 Medium and 3 Low**. The additional details and fixes are in ORDER_AUTOMATION_RELEASE_REHEARSAL.md. The current suite has **179 passing tests**. These counts describe the reviewed original TEST source and subsequent release changes; they do not claim production deployment or real provider delivery.

Native rehearsal passed manual and website request acceptance, saved-order rechecks, pricing/stock/snapshots, cancellation/restoration, downstream previews and paused recovery. A native website save exposed a 12-second upstream timeout; the isolated preview now permits a 45-second bounded wait within a 60-second function limit and successfully saved a fresh request in approximately 20 seconds. A final cosmetic discount-label correction is prepared in both release builds and verified on the two rehearsal order labels. Installation and execution of that latest owner repair helper remain pending. Current LIVE source backup/comparison, upstream Meta subscription checks and production approval remain separate release gates.
