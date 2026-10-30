# Availability on arrival, prepared only

Status: NOT DEPLOYED. Do not merge or update the Apps Script deployment until Zeeshan explicitly asks.

The ordering page tries a shared five-second Next Data Cache before rendering. A warm, validated result supplies stock labels in the first HTML. A cold or failed lookup adds at most a 200 ms availability wait; the menu then renders with “Checking remaining servings…” and an immediate browser check. Next after() finishes cache warming after the response. Pages are never publicly HTML-cached.

Visible pages poll ten seconds after the preceding response completes. Hidden tabs stop polling; becoming visible checks immediately. Existing in-flight request coalescing stays in place. API CDN caching is two seconds, Apps Script caching is five seconds. This is approximate freshness, not a guaranteed ten-second inventory feed. A server result older than fifteen seconds is rejected rather than allowing Next stale-while-revalidate to show indefinitely old urgency. Backend failures preserve menu access and authoritative order validation.

Counts retain the existing On/Off checkbox and threshold, default On/5. This change does not reserve stock or modify capacity, prices, checkout, customer identity, order acceptance, saved requests, or WhatsApp handling.

## Deployment, after explicit authorization

1. Re-read GitHub main and the live Apps Script Code.gs. Preparation baseline is website cf95fa0658bc776c4938f13917083a1ec5cb338a and Apps Script ordering deployment version 53. The manifest is evidence of the preparation baseline, not permission to overwrite later changes.
2. In the current live source, compare orderAvailabilityRead_ with apps-script/low-stock-labels/Code.gs. Apply only the cache policy changes: V2 to V3 namespace; age check 15000 to 5000 ms; cache TTL 15 to 5 seconds. The adjacent fragment is the proposed complete function for the known baseline. Preserve every unrelated live edit. Never install the fragment as a second duplicate function.
3. Save and verify exact source readback. Update only existing ordering deployment A to a new version with the same deployment ID, execute-as and access settings. Leave Routific deployment B alone. This ordering is compatible with the old website.
4. Rebase the website change on refreshed main, rerun focused validation, then release in the agreed quiet period. There are no new environment variables, dependencies, triggers, sheet edits or production test orders.
5. Verify real first arrival, visible refresh, hidden-tab pause, On/Off/threshold behavior, and request saving without creating unsolicited customer orders or messages.

Rollback: restore the preceding website release and the recorded prior version of ordering deployment A. No data migration is involved. If only the website is rolled back, the shorter read-only script cache remains compatible.

## Preparation validation

- 92 automated tests pass, including cache expiry, display-only source boundaries, bounded initial rendering, stale-data rejection and existing owner/capture regressions.
- 19 DOM acceptance checks pass with mocked network. Initial labels are visible while the first background call is deliberately held. Quantity retention, sold-out removal, hidden tabs and failure recovery pass.
- TypeScript and Next production build pass. Route JS 8.31 kB, first-load JS 116 kB, compared with 8.26 kB / 116 kB in the prior release.
- Local production-server HTTP test with a synthetic 650 ms Apps Script fixture: cold menu returned HTTP 200 in 382 ms, before the fixture completed; warm menu returned HTTP 200 in 58 ms and included the low-stock label in its HTML; API returned HTTP 200 with the matching count in 52 ms. All three requests shared one mock upstream call. These timings are local evidence, not production performance guarantees.
- No live website deployment, live Apps Script edits, spreadsheet edits, customer orders, or messages were performed during preparation.

Run:

```sh
node --test tests/availability-arrival.test.cjs tests/low-stock-labels.test.cjs tests/order-availability.test.cjs tests/owner-orders.test.cjs tests/order-production-candidate.test.cjs
node scripts/test-order-availability-ui.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
```

The optional DOM runner needs local jsdom, as it did previously. No new runtime package is required.
