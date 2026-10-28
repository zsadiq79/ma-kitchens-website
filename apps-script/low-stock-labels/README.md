# Display-only low-stock labels

Uses the refreshed live Code.gs from the sold-out release. Only orderAvailabilityRead_ changes; mkLowStockSettings_ is added. Capacity, pricing, reservations, submission and acceptance rules are unchanged.

Owner settings are in Menu Config:

| Cell | Setting | Default |
|---|---|---|
| B18 | Show Low Stock Labels | Checked (On) |
| B19 | Low Stock Threshold | 5 |

The switch is a native checkbox. The threshold requires a whole number from 1 to 999. Existing settings and formatting are preserved. Invalid, duplicate or missing settings hide low-stock counts without disabling the existing sold-out response.

Only AVAILABLE dishes with a positive integer remaining count at or below the threshold receive lowStockRemaining. One displays "Last serving available"; two or more display "Only X servings left". Higher counts are omitted. SOLD_OUT and UNAVAILABLE retain their previous behaviour. Counts use capacity minus saved, non-cancelled quantities. Website requests do not reserve stock.

No new endpoint, credential, runtime package, polling interval, deployment per stock change, or trigger is introduced. The existing 10-second CDN and 15-second Apps Script cache remain. Initial page rendering does not wait for Sheets. Setting changes propagate on the same availability refresh schedule.

Install only this folder's consolidated Code.gs, preserving the other editor files, properties, triggers and deployed URLs. Update the existing ordering deployment to a new version, then release the corresponding website change. The previous ordering deployment version 52 and the website commit 32b2eb2e29d3775d0e77bff09ea93b74ec9944a3 are the rollback baseline. Turning the checkbox off hides counts without a rollback.

Validation: run low-stock-labels.test.cjs and the previous availability/owner/release regression tests, the optional DOM runner scripts/test-order-availability-ui.cjs (with test-only jsdom installed), TypeScript checking and the production build. Real stock is not changed for acceptance testing. A temporary threshold increase may be used to inspect truthful live labels, then restored to 5. Record final production versions and verification in the PR release description.
