# Fast weekly WhatsApp ordering link

The customer URL stays https://www.makitchens.com.au/go/order/current and destination stays +61 420 246 023. The message format is unchanged. This MVP is independent of marketing subscription/discount deployment.

## How it works

`data/published-order-menu.json` is a public menu snapshot bundled into each website deployment. The customer route reads that local bundle, checks the delivery date in Australia/Sydney and returns the editable WhatsApp message. There is no customer-click network lookup to Google Sheets, Apps Script, a database or GitHub. The route is dynamic and returns no-store so its Sydney expiry check runs on every request. Expiry is midnight at the END of the delivery day, matching the existing date-based active-menu rule. There is no earlier order-cutoff setting in this MVP.

Expired, missing, invalid or explicitly withdrawn snapshots open the existing “Please send me the current menu” fallback. This link does not send messages, subscribe customers or create orders. Stock, prices and menu selection are captured at publication and do not change until republished. Turning a menu off in Control Tower alone does not withdraw the saved snapshot; use the withdrawal action if closing early.

The initial snapshot is the 13-dish 22 October 2026 menu verified from the live ordering link during implementation. Its generated message was compared byte-for-byte with the live message. It can be tested on the PR preview immediately and after the reviewed website change is deployed, with no Apps Script change required for this first snapshot. If the test is after 22 October, publish a genuine upcoming menu instead of altering the old date.

## First test

1. Open the PR's Vercel preview. Visit `/api/order-menu/published`: expect ok=true, deliveryDate=2026-10-22 and dishCount=13 while that date remains in range.
2. Open `/go/order/current` on a phone. Confirm destination +61 420 246 023, the same 13 dishes/prices and editable quantities. No message is sent unless the customer presses Send.
3. Compare the wait with the current production route. The Google lookup delay is removed; WhatsApp launch time and network/cold-start latency can still vary. No speed target has been measured on the deployed new route yet.
4. Merge the reviewed PR through the existing process, wait for the successful production deployment and repeat at https://www.makitchens.com.au/go/order/current. Do not install the larger marketing package for this test.

## One-time weekly publisher setup

No existing Code.gs, logger, other script module, deployment URL or trigger needs replacement. The helper executes from the editor, not the web-app endpoint.

1. Add the new `apps-script/OrderingMenuPublisher.gs` source as `OrderingMenuPublisher.gs` in the EXISTING Control Tower Apps Script project. Keep all existing files. This adds no automatic setup, triggers, web handlers, Sheets writes or customer sends.
2. In GitHub create a fine-grained personal access token scoped ONLY to `zsadiq79/ma-kitchens-website`, with Contents read/write. Use an expiry and store it privately. No workflow or administration permission is needed. Branch rules may require a PR rather than allowing this direct publish; the helper will fail rather than bypass restrictions.
3. Store the token directly in Apps Script Project Settings > Script Properties as `ORDER_MENU_GITHUB_TOKEN`. Never put it in source, GitHub files, screenshots or chat. GitHub authorization from ChatGPT does not automatically grant access to Apps Script.
4. `ORDER_MENU_GITHUB_BRANCH` defaults to `main`. For a safe first publishing test, set it to the feature/preview branch shown on the PR before merging. The helper writes to that branch, not production. This branch must already contain the snapshot file.
5. Run `previewCurrentOrderingMenu` as the spreadsheet owner. Check date, dishes and prices. It reads the current menu but does not call GitHub or publish.
6. Run `publishCurrentOrderingMenu`. It reads available dishes once, commits only `data/published-order-menu.json` and reports the commit ID. GitHub's SHA check prevents overwriting a concurrent file change. Identical snapshots do not create another commit. A commit result is NOT confirmation that Vercel is live.
7. Wait for that branch's Vercel deployment to succeed and verify its `/api/order-menu/published` metadata and phone link. Once production setup is reviewed, remove the branch override or set it to `main` for weekly production publishing. Keep access to existing GitHub/Vercel controls to inspect build failures and roll back.

## Weekly use

1. Activate the genuine upcoming menu in Control Tower.
2. Run `previewCurrentOrderingMenu`, then `publishCurrentOrderingMenu` in the Apps Script editor. Approve Google authorization if first required, as the owner.
3. Wait for Vercel to finish the production build. Check https://www.makitchens.com.au/api/order-menu/published matches the date, count and publication time; then check the phone link before sharing.
4. Share the same permanent www ordering link. No separate weekly link is required.

Publishing triggers the normal website build, so it is not an instant mutation of a running deployment. Build errors leave the previous deployment live until fixed, subject to its original automatic date expiry. If a GitHub response is uncertain, inspect the snapshot commit and deployment before retrying. Do not clear or recreate any order state.

## Replace or close early

Republish after changing the menu if a dish sells out or a correction is needed. To close early, run `withdrawPublishedOrderingMenu`, wait for successful website deployment and verify metadata returns ok=false and the link uses the fallback. This withdrawal is independent of the Control Tower menu status and does not cancel orders. Neither republishing nor withdrawal can remove a draft already opened in a customer's WhatsApp.

## Rollback

Before merging, retain the current production deployment and commit. To return to the live Sheets lookup, revert this feature commit and deploy through the normal process, or roll back to the recorded previous website deployment. This restores the old delay and live-menu behavior. To reverse just a mistaken menu publication, restore the last correct snapshot and redeploy; an expired snapshot remains unusable because the date is checked at request time. Avoid a whole-site rollback that would also undo unrelated subsequent changes.

The publisher creates no triggers, modifies no orders/customer/feedback data and changes no existing secrets. Remove the helper and revoke its dedicated GitHub token if abandoning it. Removing the helper alone does not withdraw a snapshot already deployed. Keep the publishing token out of backups shared publicly.

## Verification

Run `npm test`, including `tests/published-order-menu.test.cjs`. Tests cover expiry at Sydney midnight and DST offsets, fallbacks, validation, message replacement, no customer-click fetch, owner checks, publishing preview, idempotence, GitHub conflict handling, withdrawal and secret-free logs. Services are mocked for publisher tests; live owner publishing requires one-time credentials above. The website build and preview must pass before merging. Existing marketing package remains uninstalled and unchanged.
