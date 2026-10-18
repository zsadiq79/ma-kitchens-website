# Integrated order automation test candidate

This supersedes the isolated installer for the user's requested integration approach. It is source prepared for the designated TEST project, not a production replacement. The user installed the integrated Code.gs, removed all duplicate .gs files, added OwnerOrderWorkspace.html and saved the reviewed manifest. Configuration and initialization now complete. Both runtime fixes are installed. The owner workspace opens, saved-customer lookup succeeds, and ORD-000053 now reconciles as VERIFIED. A fresh manual acceptance produced ORD-000054, VERIFIED, at AUD 73.00 with five servings and a 10% discount. Independent TEST-sheet reads confirm the alternate order address/postcode, matching snapshots, unchanged customer defaults and correct cook payout/operational checks. The next step is a new TEST web app deployment and preview-only signed website capture. New-customer, legacy and downstream runtime checks also remain pending.

## Targets

- TEST spreadsheet: `1qsayqbrcSdSnwHIRzTvy7qgE2rWYltrqgzz3oykeZcs`
- TEST editor: `https://script.google.com/u/0/home/projects/1vOFXAu8UYKlsrSR9SJbPGLUfR7764W4uou8ZfyENouJs19fvpcJu_vA_/edit`
- Live editor, read only: `https://script.google.com/u/0/home/projects/1hjXoo82Cv5bQ8a6AQibLqmD96j9FtXUtUkIsDuz_kkrf-F71nbW0XsIE/edit`
- Repository branch: `codex/order-request-capture-preview`

## What is included

`integration-baseline/` contains the twelve supplied original modules, unchanged, with hashes in the generated manifest. These are review and build inputs, not installable production updates. `integration-test/Code.gs` contains their integrated versions, the six new order/publisher modules, a test service boundary and one dispatcher. Original module sections are labelled. Consolidation is for manual installation convenience. Do not install it alongside any of the original .gs modules or the previous isolated installer.

All original named functions remain available. Integration changes are recorded in the manifest and builder. No claim is made that all existing workflows have been verified in Google or that the supplied source exactly matches every current editor helper.

The new workflow uses the original Menu Config parser. Existing complete menu content, including descriptions and portions, is retained and enriched with menu-line/cook identity and authoritative capacity. Active public ordering closes at 22:00 Sydney on the previous day. The legacy explicit-date owner order form keeps its existing date selection behavior.

Existing Order Entry and the new owner workspace share the ScriptLock. New commits check the other interface's COMMITTING record. ID allocation considers operational orders, the new journal and the old planned ID. Legacy Order Entry customer creation uses the durable owner customer engine. Legacy commits add contact, postcode, item, price and cook-cost snapshots and validate the quote before accepting the result. Historical formulas retain their existing fallback. The legacy WhatsApp writer remains sequential with its existing rollback behavior; it is not represented as having the new atomic journal protocol.

## Test restrictions

- All spreadsheet opens and batch writes enforce the exact test workbook. The packing module's independent ID is redirected to that copy.
- All UrlFetchApp sends are blocked, including WhatsApp, feedback, Routific and publisher GitHub writes. Backend capture uses no outbound fetch from Apps Script, so signed request capture remains usable.
- Existing public WhatsApp, menu, feedback and delivery routes remain in the original dispatcher for private owner simulation. The test deployment exposes only signed capture and recovery, plus health metadata. No live consumer is repointed.
- Production feedback setup/enabling, sending and dispatch entry points stop before action.
- Existing Drive documents and packing document generation are blocked. The original packing data collector now excludes flagged and empty orders. Packing data collection and spreadsheet preview remain available. Document rendering requires separately isolated test documents in a later verification step.
- Only owner menu/edit triggers bound to the exact test workbook can be installed. Background sender triggers are blocked.
- The manifest currently uses the previous minimal test scopes. It is not a production manifest, and does not authorize document generation.

## Before installing

The current editor `OrderingMenuPublisher.gs` was supplied and reviewed on 18 October. Its three setup helpers are now retained, with the preview branch updated to `codex/order-request-capture-preview`. Production switching is blocked, and the integrated test package blocks token collection because publishing network calls are disabled. The original `appsscript.json` was also supplied and reviewed. It enables Sheets v4, Sydney time, V8 and anonymous web app access executing as the deployer, with no explicit scopes. The generated test manifest preserves those settings and adds the explicit test scope list. Its public dispatcher remains restricted to signed request capture/recovery. Also compare the current editor file list with the twelve baseline names and publisher; obtain any genuinely additional source instead of deleting it blindly.

The publisher and manifest comparison is complete and the package has been regenerated. In the confirmed TEST editor only, replace Code.gs with the consolidated file, remove the now-duplicated .gs files, add OwnerOrderWorkspace.html, and merge/install the reviewed test manifest. Keep the live editor untouched. Do not run the package while duplicate original modules remain.

The installation is then guided one step at a time:

1. Run `configureOrderAutomationIntegrationTest` as the active owner. It checks the bound workbook and trigger inventory, configures TEST and creates a private request signing secret if needed.
2. Run `initializeOrderAutomationIntegrationTest`. It initializes schemas, snapshot formulas, private ledgers and the test menu state. Compare its menu revision with the preview website.
3. Reopen the TEST spreadsheet. Its installed on-open trigger adds the Website Requests menu. Editor initialization deliberately does not call spreadsheet UI APIs. Do not re-run old production setup helpers.
4. Test both owner interfaces with synthetic records, preserving any existing copied uncertain draft for reconciliation. Test manual order, website request, customer creation, duplicate acceptance, timeout recovery, last capacity, discounts and alternate postcode.
5. Create a new TEST web app deployment and configure only the preview branch environment. Transfer the signing property directly to Vercel, never through chat or logs.
6. Complete actual browser-to-test-sheet tests and downstream cook/packing/dispatch-payload checks. Do not send messages or dispatch routes.

## Evidence and remaining work

116 local Node tests pass, including the second-pass regressions and the earlier integration checks: original function inventory/hashes, shared compilation, service boundaries, public dispatcher restriction, menu enrichment, integrated owner acceptance/deduplication, both cross-writer pending barriers, legacy snapshots/rounding original packing data consumption and publisher helper branch/switch restrictions and supplied manifest setting preservation. Runtime regressions cover UI-free initialization, stale reads after commits/customer intake, post-commit read failures and the owner recovery control. Existing public capture/recovery and owner engine tests also pass.

The automated checks use local mocks/source. Google authorization, initialization, owner workspace, saved-customer lookup, manual acceptance, quote override, alternate delivery address and saved-review reconciliation now also have Google runtime evidence. Actual legacy form interaction, remaining runtime scenarios and browser end-to-end website verification remain pending. Deployed consumer mapping and trigger inventory remain production gates. Integration source preparation does not authorize production deployment.

Regenerate with `node scripts/build-order-integration-test.cjs`. An alternative baseline path can be supplied through `MK_INTEGRATION_BASELINE`. Run `node --test tests/*.test.cjs` afterward. The generated Code.gs is about 16,000 lines and includes 425 functions.

## Second pass

See `docs/ORDER_AUTOMATION_SECOND_PASS.md` for the detailed severity-ranked findings, fixes, evidence and remaining runtime gates. Earlier installer downloads are superseded by the current generated package.
