# Release candidate and fresh-copy rehearsal

Prepared 19 October 2026. This is a rehearsal installation package, not production rollout approval. The original reviewed TEST build is unchanged. No LIVE source, web-app version, trigger, setting or workbook write was issued while building this package.

## Exact installation target

- Workbook: Ma Kitchens PRODUCTION REHEARSAL 19 Oct 2026.
- Workbook ID: `1aMJuPNJM2vVEeSlMZx8LIdkwSCKqd-_FojZelZ87RSs`.
- Owner-supplied editor URL: https://script.google.com/u/0/home/projects/1bf4ZUVw5ugJt3PiDBpRTLG_bdfTkuzSEtB8vpfcPjkfLseESaD-e_Tf5/edit.
- Script ID: `1bf4ZUVw5ugJt3PiDBpRTLG_bdfTkuzSEtB8vpfcPjkfLseESaD-e_Tf5`.

The owner supplied this editor URL on 19 October. Its ID differs from both LIVE and the earlier TEST project. The owner has installed and saved Code.gs, the HTML file and manifest. Configuration completed at 5:12:28 PM Sydney and checked the actual bound workbook, script ID and active owner. It reported REHEARSAL, external actions BLOCKED and zero triggers. Current editor source has not been independently fetched or hashed.

The native preview completed at 5:14:30 PM with the expected 26 tabs, widths 31/23, nine recognized formula anchors and seven ledgers to add. Migration completed at 5:19:40 PM and reported MIGRATED. Independent native readback at 5:21 PM verified 33 tabs, widths 37/30, all operational/ledger headers and all nine snapshot formulas. All 52 orders, 184 item rows and 45 customer ID/phone mappings were preserved. No new ledger contains identifier records. Existing quantities, payment states, cook payouts and item inputs are unchanged. The only financial changes are the expected cancellation correction: two cancelled orders' remaining $10 delivery charges and their derived contribution are now zero. ORD-000052 retains CREATED / confirmation UNCERTAIN. Protection validation is evidenced by the successful script reconciliation; the metadata connector does not expose protected ranges. The owner then repeated migration and ran the preview at 5:25:05 PM. It retained MIGRATED, 33 tabs, widths 37/30 and no new ledgers. Independent comparison after that sequence confirms all 52 order and 184 item financial records unchanged. Native rerun/preview checks passed. Private menu preparation completed at 5:27:04 PM. Independent readback verified 14 dishes for 22 October, their menu-line and public IDs, revision hash, prices, cook costs and remaining servings against current source data, plus the minimum of five servings and $10 standard delivery fee. The menu is saved only in the rehearsal workbook. Owner workspace activation completed at 5:31:19 PM, with capture still disabled and no legacy entry triggers to remove in this copy. The owner opened the dialog successfully and confirmed the PRODUCTION REHEARSAL banner. Independent metadata confirms the legacy entry screen is hidden. A new synthetic customer, CUST-000046, was then saved through the owner form. Native readback verifies the correct identity/address/postcode, No feedback consent, a numeric intake phone and a timestamp later than every prior numeric timestamp. The operation is READY, one intake submission was created, and all 45 original customer ID/phone digests match the pre-test checkpoint. The owner reviewed and accepted five Crazy Haleem packs for 22 October as ORD-000053. Independent native readback verifies one order and one item row, the matching review and RECORDED operation journal, all identity/address/pricing/cook snapshots, $56 food plus $10 delivery, $66 total, $50 cook payout and $16 contribution. Stock changed from 50 to 45. All original 52 order and 184 item financial rows still match the post-migration baseline. After acceptance the order was Pending / Payment Requested, with no manual confirmation marked. The owner then reported the same VERIFIED result after the requested repeated saved-order checks. Native reads confirm one order, one item, one review and one journal operation, with a fresh review-check timestamp. For downstream rehearsal, only ORD-000053 was changed to Confirmed and the three date controls were set to 22 October. Native formulas show five Crazy Haleem servings, one placed order, FOODIE CLUB quantity five and the matching preparation-message text. The Routific preview includes exactly this synthetic order with the correct identity, address, window and instructions. Its payment remains Payment Requested and total/payout remain $66/$50. The packing control is on the correct date; its Apps Script preview refresh remains pending. No formula error was found in the inspected outputs. Website request, packing refresh, cancellation/restoration and other downstream checks remain pending. Public capture remains disabled. See order-automation-rehearsal-native-migration-20261019.json for the safe evidence record; detailed before/after financial rows are kept only as private intermediate checkpoints.

## Files

Install the three files from `apps-script/production-rehearsal/`:

1. `Code.gs`, the complete consolidated script. It includes all twelve supplied original modules, the reviewed publisher and owner/request modules, and the release controls. Keep a single `.gs` file in this rehearsal project to avoid duplicate functions. Remove the other `.gs` files from this copy only.
2. `OwnerOrderWorkspace.html`, an HTML file named `OwnerOrderWorkspace` in Apps Script. Its banner says PRODUCTION REHEARSAL.
3. `appsscript.json`, preserving the supplied Sydney timezone, V8, Sheets v4 service and existing web-app settings, with explicit rehearsal scopes. External request, Docs and Drive scopes are absent. The code also rejects their native entry points before use.

The separate `apps-script/production-candidate/` output is for review and subsequent rehearsal comparison. Do not install it in LIVE at this stage.

## Native rehearsal sequence

Give the owner one step at a time. All three files must be installed and saved before running setup.

1. Run `configureOrderAutomationRehearsal`. It verifies the exact project and bound copy, checks owner identity and allowed triggers, sets only rehearsal configuration, and creates a private request signing secret. It logs no secret. Existing operational records and the legacy confirmation uncertainty are preserved. No provider credential needs to be copied.
2. Run `previewOrderAutomationMigration`. Expect the known operational widths of 31 and 23 columns, nine recognized formula anchors, seven new ledgers to add, and legacy CREATED / ORD-000052 / UNCERTAIN. These are baseline expectations, not values to force over different data. Investigate any mismatch before migration. The preview issues no schema writes.
3. Run `migrateOrderAutomationWorkspace`. It validates all inputs, records the migration identity privately, and submits compatible schema changes in one Sheets API batch. Expected result: MIGRATED, seven protected ledgers added, widths 37 and 30, records preserved, capture still disabled.
4. If the response is uncertain, run `reconcileOrderAutomationMigration`. It reads the actual schema. It never blindly repeats the batch. A complete migration becomes MIGRATED; a confirmed unapplied migration returns LEGACY and permits a separate deliberate retry. A partial or unfamiliar state stops for review.
5. Run the migration again after success to verify an unchanged rerun. Independently compare order IDs, customer/phone identities, totals, historical entry state and formula anchors through native Sheets reads.
6. In a separate execution, run `prepareOrderAutomationMenuState`. It creates private authoritative menu state from the current copied menu. It does not publish to GitHub or connect the website.
7. Run `activateOwnerOrderWorkspace`. It installs the owner menu trigger, hides the old entry screen and removes only this workbook's two legacy entry triggers. Records and reconciliation helpers remain. Reopen the workbook and use Website Requests. Public capture remains off.
8. Exercise manual/customer/request acceptance and downstream cook, delivery, packing and feedback previews using isolated rehearsal records. Reconcile the old CREATED/UNCERTAIN evidence without sending a confirmation. Compare against the fresh baseline. Do not dispatch routes, generate existing Drive documents or send messages.
9. For website capture tests, deploy this rehearsal web app and configure an explicitly scoped preview to this new endpoint and its own signing secret privately. The current preview is still connected to the earlier TEST endpoint. Do not change production settings. Enable capture only after the private menu state and matching preview are ready. Test capture, recovery and acceptance, then pause and verify recovery remains available.

The copied workbook is private and contains real historical data. Test records stay in this copy and must never be imported into LIVE. Public capture stores tentative requests only; an owner acceptance creates an operational order.

## Additional release findings and fixes

These were found while adapting the completed 27-finding TEST review to a staged production installation. Their new code is verified offline; native fresh-copy confirmation remains pending.

| Severity | Issue | Change and evidence |
| --- | --- | --- |
| High | Pasting the TEST source in LIVE would block existing provider jobs. The four LIVE triggers use Head, so saving source affects them before deployment changes. | Separate immutable production/rehearsal profiles. Production preserves the original feedback delegation, menu handlers and authenticated service routes before activation. The rehearsal rejects all network/document/provider configuration entry points. Compatibility and rejection tests pass. |
| High | The inherited cart writer used sequential writes and cleanup; a lost response could leave an uncertain operation without the new owner journal protections. | After migration, carts reserve a durable operation and order ID, save their operation on the cart, and atomically commit order, lines, snapshots and journal. Uncertainty blocks other writers until fresh-read reconciliation. Recovery never sends a message and does not reuse planned IDs. Before migration, the original writer is retained. Applied and unapplied response-loss tests pass. |
| High | The inherited WhatsApp customer path could still write text phones, append out-of-order timestamps, pick the first duplicate phone and alter defaults independently of the reviewed customer engine. | After migration, both manual and legacy-cart intake use the same internal durable engine, numeric new phones, strictly later timestamps, duplicate checks, stable retry input and baseline ID checks. Existing feedback choices/default addresses remain; a new cart customer is not automatically granted feedback consent. No real consent setting was changed. Pending-customer retry tests pass. |
| Medium | Aggregate legacy discount rounding can differ from the new frozen unit prices. For five $15.01 packs at 12.5%, the old food subtotal is $65.67 and the unit-based subtotal $65.65. | Migrated carts use the same integer unit rounding as owner orders. An open cart whose shown total changes must receive another final review before an operational commit. Legacy-stage pricing is retained. Both rounding and re-review tests pass. |
| Medium | A saved-order recheck could miss changes to delivery date, customer identity, kitchen labels or pricing-rule snapshots if totals remained consistent. | Release rechecks compare these fields with the accepted review, including conversion of fresh API date serials. Cart checks also compare actual formula outputs with frozen cook, price and payout values. Tampering tests return REVIEW_REQUIRED. |

## Offline validation

- 172 tests passed, including the previous 137 and 35 release-specific checks.
- Both builds parse and load, contain 468 unique functions, retain every original function name and have no unresolved custom helper calls.
- Source hashes, function changes, exact targets and approval/native-runtime status are recorded in each `source-manifest.json`.
- Schema checks cover changed headers/formulas, occupied destinations, pending submissions, unexpected triggers, partial migration, broadened ledger permissions, reruns and lost responses.
- Runtime simulations cover owner identity, request gating, preserved authenticated routes, current Head handler behavior, shared IDs, owner acceptance and cart reconciliation.
- The earlier TEST source hash still matches its existing manifest. It was not rebuilt or modified.

These checks use simulated Apps Script services and do not certify native Google behavior, external message delivery, route dispatch, generated documents or current deployed source snapshots. Those remain explicit rollout gates.

## Production staging and rollback requirements

1. Obtain the exact current LIVE editor files and manifest, or confirm their hashes against the supplied originals. Deployed Version 46/33 source has not been retrieved. Record any additional files before consolidation.
2. Reconcile upstream Meta callback settings and relevant recent failed executions. The two website destinations are already traced: LIVE A/46 for menu, feedback and verified WhatsApp; LIVE B/33 for Routific.
3. Prepare the final source, website changes, current production menu state, credentials/configuration checks and rollback package. Obtain explicit approval for that concrete rollout and any controlled provider test.
4. During the approved window, install the separate production candidate with phase LEGACY. Saving changes Head immediately. Preserve the existing feedback and packing triggers and flags; do not reinstall the feedback timer.
5. Update both existing web-app deployment IDs to the reviewed candidate in LEGACY stage before migration. This brings the known public writers under the same migration gate. Verify the existing authenticated contracts. Keep their URLs unchanged.
6. Configure the production profile without replacing credentials or provider flags. Preview and perform migration under the shared lock while direct sheet edits are paused. Reconcile an uncertain result before continuing.
7. Validate native data and activate the owner workspace. Install the matching website request release and publish its current schema-2 menu through the existing production flow. Configure the new request signing secret privately, then enable capture only after the complete path is verified. The original Vercel provider destinations remain unchanged.
8. Pause capture/new owner writes if needed while preserving capability recovery and saved-order checks. Do not delete ledgers, accepted orders or snapshot columns, and do not restore old formulas over records using them.
9. A full rollback must account for saved Head source and trigger behavior separately from web-app versions. LIVE A currently rolls back to Version 46 and LIVE B to Version 33. Do not merely restore those versions while leaving incompatible Head code. Reconcile orders created during the window before any source/formula rollback.

No production installation, deployment, consent update, provider send or dispatch was performed as part of this build.
