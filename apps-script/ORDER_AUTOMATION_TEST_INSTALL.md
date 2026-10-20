# Order automation test installation

This is a preview candidate, not a production rollout. The bound script cannot write operational orders outside the exact test workbook below. The test base contains no WhatsApp, Routific, feedback or legacy order writers. No customer confirmation is sent automatically.

## Exact targets

- Test spreadsheet: https://docs.google.com/spreadsheets/d/1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs/edit
- Title: **Ma Kitchens Order Automation TEST 18 Oct 2026**
- Website branch: `codex/order-request-capture-preview`
- Vercel project: `ma-kitchens-website`, preview environment only
- Installation files: `apps-script/test-install/Code.gs`, `OwnerOrderWorkspace.html`, `appsscript.json`

The test spreadsheet is a fresh, owner-only copy. Its seven new ledger tabs and six snapshot lookup formulas have already been prepared through the connected Sheets API. No production workbook values or formulas were changed. Temporary formula test records were removed after verification.

## Install in the test spreadsheet only

1. Open the test spreadsheet above. Verify its title. Choose **Extensions > Apps Script**.
2. Inspect the project file list before replacing anything. A copied bound project may contain original production modules. Only in this test project's editor, replace the script files with the combined installer `Code.gs` and the single `OwnerOrderWorkspace.html` file. Do not add the combined installer alongside the individual source modules; that would duplicate global constants and the dispatcher.
3. Show the manifest from Project Settings, then replace its contents with `test-install/appsscript.json`. The Sheets advanced service is declared there. Enable the Google Sheets API in the linked Cloud project if Apps Script requests it.
4. Run `configureOrderAutomationTest` as the spreadsheet owner. Complete Google's authorization. This verifies the bound test spreadsheet, sets `ORDER_AUTOMATION_ENV=TEST`, and creates a private signing property without logging its value.
5. Run `initializeOrderAutomationTest`. It checks for unexpected triggers, checks the exact formula baseline, protects the private owner ledgers and seeds the authoritative published-menu state. Its reported menu revision must equal the preview website's `/api/order-menu/published` revision before capture is enabled. A mismatch requires refreshing the preview snapshot; do not work around it by disabling validation.
6. Reopen the test spreadsheet. Use **Website Requests > Open owner order workspace**. Only the spreadsheet owner's active Google account can use these actions. Missing active-user identity fails closed.

## Connect the preview backend

1. In this test Apps Script project, create a new **Web app** deployment. Execute as the owner and allow the public endpoint to be called. `doPost` accepts only the two signed capture/recovery actions. Owner actions are not exposed by the dispatcher.
2. In Vercel, set `ORDER_REQUEST_API_URL` to that test deployment's `/exec` URL for the preview branch only.
3. Copy the `ORDER_REQUEST_API_SECRET` Script Property directly into Vercel's preview environment variable of the same name. Do not paste the value in chat, commit it, add it to a URL, or include it in screenshots.
4. If using any additional preview domain, add its exact HTTPS origin to `ORDER_REQUEST_ALLOWED_ORIGINS`. Vercel's generated deployment and branch hosts are allowed automatically.
5. Redeploy the preview branch. Do not set these values for production or point them at either historical live Apps Script deployment.

## Owner flow

- Website requests load their saved date and quantities. Mark receipt using the actual WhatsApp sender phone. A redirect or app switch never marks receipt.
- Find the saved customer. Duplicate phone matches and mismatched IDs block review. For a new customer, collect the missing details privately, choose explicit feedback consent and use **Create or update customer** before review.
- The customer action writes a uniquely identified intake submission. It verifies recalculation and checks that all original Customer IDs still map to the same raw phones. Pending recalculation can be retried without another intake submission.
- Check the order address and postcode. Alternate delivery details are snapshotted on this order. Saving customer defaults is a separate explicit action.
- Review adjustments and their reason. Per-order discounts, late orders and capacity overrides require reasons. The global Menu Config is not modified.
- Accept once. The order is Pending with Payment Requested. New order contact, address, postcode, price, cook cost, item identity, kitchen identity and rule snapshots are retained.
- Copy the saved confirmation and send it manually. **I sent it manually** is an owner assertion, never a provider receipt. It never recreates the order.
- **New manual order** uses the same validation, pricing, durable review and acceptance engine.
- Rejection/expiry affects only unaccepted requests. A linked operational order cannot be cancelled through these actions.

## Recovery and capacity

An uncertain operational commit persists its planned Order ID before the grouped write. Retry or **Check saved order** reconciles that identity. It never allocates a replacement merely because a response was lost. New operations stop while an uncertain journal entry needs reconciliation. Recovery with no matching order/items is available after seven minutes, then the current facts must be reviewed again.

Unaccepted requests reserve no stock. Acceptance reads authoritative non-cancelled Orders and Order Items under the shared script lock. Pending operational orders consume capacity. A logged capacity override can save an order in REVIEW_REQUIRED; a confirmation remains withheld until existing checks pass. Restricted manual spreadsheet edits and other projects are outside this lock.

Operational ranges remain 2,000 Orders and 5,000 Order Items. Missing formula coverage or exhausted input rows stops acceptance. Ledger rows grow without extending operational formula ranges silently.

## Verification completed

- Node tests cover public capture/recovery, owner matching, manual orders, acceptance deduplication, changed prices, audit reasons, capacity changes, alternate postcodes, discounts, new-customer retries, registry renumbering, timeouts, formula failures and request expiry/rejection.
- Test spreadsheet formula checks: five Crazy Haleem servings at $14, 20% discount and $10 delivery produced $66 total and $50 cook payout; name/phone/postcode snapshots were used. Changing the copied cook cost to $20 changed the live menu price to $28 while the test order retained its original $14 list price, $11.20 unit price, $10 cook cost and $66 total. Cancelling the test item produced zero line total and payout and returned stock to 50. All temporary inputs and catalogue edits were restored.
- These checks do not substitute for running the deployed Apps Script, its Google authorization and the complete browser-to-test-sheet flow. Those checks remain to be completed after installation.

## Remaining gates before any production proposal

- Complete the deployed preview flow with an owner test request, customer creation, duplicate acceptance and interrupted-response recovery.
- Verify the owner form on the actual daily devices and confirm full manual-order creation.
- Verify accepted cook-summary quantities/payouts and the existing Confirmed + Order Check OK packing/Routific eligibility. Do not call live dispatch or feedback functions during the test.
- Map exact current Apps Script deployments, their consumers/access settings, editor manifest and trigger inventory. Historical version numbers do not identify the right target.
- Reconcile uncertain operations before rollout. Pilot with owner-selected customers. Preserve the old workflow until the pilot and historical reconciliation are complete.
- Prepare production source separately. This installer intentionally refuses production and does not modify either live deployment. Rollback must retain all saved requests and orders while restoring the message-only handoff.

## Source generation

Run `node scripts/build-order-automation-test-install.cjs` after changing any Apps Script module or owner HTML. The generated combined installer has one `doPost` and one `doGet`. Never install the old full `Code.gs` review copy from the handoff into this test project.
