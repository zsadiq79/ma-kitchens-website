# Sold-out availability amendment

This release keeps dishes visible on the current ordering page after they sell out, disables adding them, and restores selection when stock returns. It uses the owner-supplied current Code.gs from 28 October 2026, including the fixed-dollar reduction feature. It does not change the cutoff, 10 on 10, messages, cook payouts, accepted prices, or order acceptance rules.

## Installation sequence

1. Keep a backup of the currently installed Code.gs and record the active web-app deployment version and URL. If Code.gs has changed since the supplied file (SHA-256 in source-manifest.json), compare and incorporate those later changes before installing. Do not replace later work blindly.
2. In the LIVE project identified in source-manifest.json, replace only Code.gs with this folder's Code.gs. Leave OwnerOrderWorkspace.html, appsscript.json, properties, triggers and all other files intact. Do not install the standalone OrderAvailability.gs reference module alongside this consolidated file.
3. Save and run previewCurrentOrderingAvailability as the owner. For an open, published menu it should report OPEN and counts. It reads availability without sending messages or modifying orders. CLOSED outside the existing cutoff is expected.
4. Update the existing Apps Script web-app deployment used by ORDER_REQUEST_API_URL to a new version, retaining its existing deployment ID, URL, access settings and execution identity. Do not create a replacement URL or run migration/setup functions. The website route reuses the existing ORDER_REQUEST_API_SECRET and ORDER_REQUEST_API_URL; no new credentials are required. Verify the signed availability endpoint before releasing the website branch.
5. Release the matching website commit. Run previewCurrentOrderingMenu, check the selected delivery cycle/dishes, then publishCurrentOrderingMenu once if any sold-out dishes were already absent from the old snapshot. Existing published dishes do not require republishing just because availability changes. Menu publication still follows the existing GitHub/Vercel process.
6. Compare actual availability for the active cycle with GET /api/order-menu/availability. Verify a controlled test dish becoming sold out and available again, preserving its original state. Do this in rehearsal first, then use a genuine live state or explicitly approved reversible test. Do not generate live orders or send WhatsApp messages as a test.
7. Verify the existing owner workspace including a dollar reduction, saved-request recovery, order cutoff and message wording. No new schema migration is needed.

Development can proceed alongside normal Control Tower use. Coordinate the script deployment and website release. Do not declare the feature live until the authenticated feed and website work together.

## Availability and performance contract

- Initial menu HTML, dish photos and prices remain bundled. No Sheets or Apps Script request is added to server rendering.
- Public responses contain only public dish IDs, statuses and menu identity/check time. No customer records, raw stock counts, credentials or operational rows leave the backend.
- Browser polling runs every 30 seconds only while visible. Returning to the tab refreshes it. Quantity edits do not restart polling. Concurrent browser checks share one promise.
- Shared CDN caching lasts 10 seconds; Apps Script caching lasts 15 seconds. Typical worst-case visual propagation is approximately 55 seconds plus network/processing time, not a strict real-time guarantee.
- Concurrent upstream requests coalesce within each website server instance. Apps Script caching also covers different instances. Cold requests across instances can still coincide; this is not a global concurrency lock.
- Failed checks are not cached as stock. The page explains the failure. Existing authoritative request capture remains available and checks stock without the availability cache.
- An already selected sold-out item is retained for review, with an explicit Remove button. It cannot be included in a new request. An already saved request can still be reopened; this does not reserve stock or automatically confirm it.
- Fully sold-out published menus remain visible. Hidden, inactive, unready, changed-price or mismatched dishes are unavailable, not silently made orderable.
- The new display-menu builder is used only by preview/publication. Existing buildActiveMenu_ and owner/legacy selection functions are unchanged.
- No polling writes, scheduled triggers, order-writer locks, automatic publications or new paid service.

## Validation

Run `node --test tests/order-availability.test.cjs tests/owner-orders.test.cjs tests/order-production-candidate.test.cjs`, `npx tsc --noEmit`, and the production build. The optional DOM acceptance runner is `node scripts/test-order-availability-ui.cjs` after installing jsdom for testing only (`npm install --no-save jsdom@30.1.3`). No runtime package was added.

The source-preservation test compares every function from the supplied source with normalized line endings. Only five existing functions change. All dollar-reduction functions and existing pricing/acceptance/recovery functions retain their supplied bodies, except the narrowly amended stock-status check in request capture.

Local comparative Next.js 15.5.28 builds, using the same dependencies:

| Ordering route | Route JS | First-load JS |
|---|---:|---:|
| Current source baseline | 7.04 kB | 115 kB |
| Availability amendment | 8.09 kB | 116 kB |

This is about 1 kB additional compressed route JavaScript, not a measurement of live page load time. Mock concurrency tests prove coalescing and response size, not production latency or load capacity. Production and real Sheets timing remain acceptance checks after installation.

## Rollback

Roll back the website to its recorded previous deployment first, then restore the backed-up Code.gs deployment version if needed. The new script remains compatible with the old website. No order data, schema, credentials, consent or pricing records need reversing. If the once-republished public menu includes sold-out entries, retain the new backend safeguards until the old website snapshot has been checked or republished appropriately.
