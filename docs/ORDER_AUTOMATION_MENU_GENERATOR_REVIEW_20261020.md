# Weekly menu generator compatibility review

20 October 2026, Australia/Sydney. Both supplied source files reviewed. Three Medium fixes prepared and covered by nine automated checks. Actual native rendering and PNG/JPEG/WebP downloads remain pending. Production is unchanged.

## What the existing tool does

Ma Kitchens Menu V2 is a separate, read-only HTML web app. It reads the original LIVE workbook's Weekly Menu, Dishes and Menu Config tabs. It has its own doGet and template helpers and must stay separate from the consolidated Control Tower source. OrderingMenuPublisher publishes JSON and does not replace this image generator. The September Slides handoff describes an older architecture, not the supplied current source.

The source selects READY / Available rows for a requested cycle, retains historical cycle selection, groups public kitchen names, packs main dishes into four-slot rows and separates desserts. It preserves prices, portions, images and dietary tags. Existing sold-out selection behavior has not been changed. The supplied code has no Sheet writes, triggers, provider sends, route dispatches or Slides operations. All three image downloads use html2canvas and browser canvas encoding.

All 26 Weekly Menu headers and all 17 Dishes headers, including Q / Dish Category, match current LIVE and migrated rehearsal. Existing compared row-2 formula anchors also match. The migration preserves these source tabs and columns. The native-data fixture builds the 22 October menu with 14 dishes, comprising 12 mains and two desserts; all retain portions and image URLs. Apart from the corrected deadline, baseline and candidate data models match.

## Findings and prepared fixes

| ID | Severity | Issue | Prepared fix | Evidence and remaining limit |
| --- | --- | --- | --- | --- |
| MG-01 | Medium | The deadline helper treats a Sheets TIME Date as clock text. With the captured 17:00 configuration it falls back to 20:00. | Parse Date, numeric time fraction or strict clock text; reject invalid values; calculate against the spreadsheet calendar with explicit Sydney formatting. | Reproduced original error. Date/fraction/text, invalid values, both DST transitions and a different script timezone pass. Not installed in Apps Script. |
| MG-02 | Medium | Export scaling was clamped to at least 1, so very long menus could exceed configured canvas limits. Unsupported encoders could also return the wrong image type. | Permit scaling below 1, validate dimensions and reject mismatched MIME output for every format. Await fonts and realign before capture. | Long/wide-menu bounds, all format paths, filenames, encoder fallback and render-error recovery pass using browser-function mocks. Actual browser encoders and downloads remain unverified. |
| MG-03 | Medium | Free-delivery text always says before discount, even for a post-discount threshold. | Choose the wording from the existing basis setting. | Both basis settings and current disabled-threshold state pass. No live price/configuration was changed. |

All 22 original server functions remain. Only calculateDeadlineV2_ changes on the server; invariance is checked with line endings normalized. The HTML design, photos, grouping and format settings are retained. PNG uses preferred 3x scale with 24000-dimension / 120-megapixel bounds; JPEG and WebP use preferred 2x scale with 16000 / 70-megapixel bounds and quality 0.93 / 0.90. The pinned html2canvas 1.4.1 response matched its integrity hash and allowed cross-origin loading. This does not prove food-photo CORS, font rendering or canvas behavior in the owner's browser.

## Deadline decision and current prices

The owner selected 8 PM on the day before delivery for the menu image. The local candidate fixture can simulate 20:00; LIVE still contains 17:00. The candidate reads the real setting and does not silently override it. Until an approved configuration change, a native test against current LIVE should therefore display 5 PM. The website's previously agreed enforcement cutoff remains 22:00; the poster-specific answer did not authorize changing it. Reconfirm both intended customer-facing policies before production changes.

The latest captured LIVE pricing is 0% standard discount, minimum five items, AUD 2.50 delivery and free-delivery threshold zero. Rehearsal remains 20% / AUD 10. Read current LIVE values at cutover, preserve accepted snapshots and never copy rehearsal pricing into production.

## Source and test evidence

| File | Original SHA-256 | Candidate SHA-256 |
| --- | --- | --- |
| Code.gs | 19fbf51903d677d82ee1074f0c4ae2192b8bfc2d5ccc5153a5cecef3d927fc86 | dea7211901cd3ecc3beacd7afafdbf9ba335e3e97d1007f7c39df0215d59021e |
| MenuV2.html | 580bdb7d74c0d9f012e10f8a4e2ce55897ad4864553987f7ea4e3b7b6ac67f99 | c7ded32b9811d83fe9f71fce885bfd80162319c0b799d08733c573e6c5f5d66a |

The complete suite passed 188 tests with zero failures: 179 order-system tests plus nine generator tests. These are source/model and mocked-client checks, not 188 native Google or browser transactions. The local template emulator is not Google's contextual template engine.

## Native review target and pending checks

A Drive copy named Ma Kitchens Menu V2 PRIVATE REVIEW COPY 20 Oct 2026 is verified shared=false with only its owner permission. Its script ID is 1aU80zoZXg1-VVmJ3mMwFmEZJz_FrcTuun7JugnTh8-APHAIiNRRF9Foy. It currently contains the copied original source; the prepared candidate has not been installed or deployed. The connector cannot read or edit native Apps Script source, so the owner must paste the complete matching candidate files there for native testing.

Use only apps-script/menu-generator-review/candidate/Code.gs and MenuV2.html (or their identical distinctly named .txt copies) in that separate review project. Do not paste either into Control Tower. Verify the current menu visually, food photos, fonts, row layout, deadline, prices and actual PNG/JPEG/WebP outputs, including correct extensions, readable images and no missing content. Keep the working menu shortcut unchanged. Before any eventual original-generator update, record its actual current deployment mapping/version and hidden manifest, preserve rollback source, and retain the existing shortcut URL.

Browser verification stopped at an access boundary. Protected-preview access was not established. Opening a local generated HTML file in the cloud browser was rejected by its URL policy because only HTTP/HTTPS protocols are permitted. No workaround was attempted after that rejection. No real output file or visual export evidence is claimed. Temporary static fixture pages are removed from the preview branch checkpoint; the reusable test fixture and builder remain.

No LIVE script, deployment, spreadsheet setting or production website was modified. The consolidated production Control Tower source remains SHA-256 fb1c9abc7ebff102715b15ce51705bee60b90b274a7332e4a344da9d09cb2693.
