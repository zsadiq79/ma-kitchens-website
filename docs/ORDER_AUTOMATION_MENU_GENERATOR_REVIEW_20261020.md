# Weekly menu generator compatibility review

20 October 2026. Status: current Code.gs reviewed; MenuV2.html, deployed-source mapping and actual downloads remain pending. No production changes.

## Current architecture

The current project is Ma Kitchens Menu V2, script 1P40KjOrj6Efs_2oSWwuP9GOZeDhonUNLYUlfnosPa1Hh4e9C6GKWFuRf. The owner identifies it as the weekly-menu shortcut's project. Its screenshot lists Code.gs and MenuV2.html. The supplied server source is preserved byte-for-byte in apps-script/menu-generator-review/baseline/Code.gs, SHA-256 19fbf51903d677d82ee1074f0c4ae2192b8bfc2d5ccc5153a5cecef3d927fc86. This does not independently establish which immutable deployment version is active.

This is a standalone HTML web app, not the historical Slides-bound generator described in the September handoff. It opens the original LIVE workbook directly and reads Weekly Menu, Dishes and Menu Config. The supplied Code.gs contains no spreadsheet writes, provider sends, triggers or Slides operations. It must remain a separate project; its doGet and other globals must not be pasted into the consolidated Control Tower Code.gs.

The server selects READY / Available rows for the requested cycle, carries displayed prices, portions and dietary tags, groups/sorts public kitchen names, packs main dishes into four-slot rows and separates desserts. Historical cycle selection remains available. No sold-out filtering policy has been changed.

## Compatibility evidence

Current native reads verify all 26 Weekly Menu headers and all 17 Dishes headers, including Dish Category in Q, in LIVE and migrated rehearsal. Menu Config retains the required keys. The migration does not rename or reorder these source tabs/columns. A local execution of the supplied server source against a read-only fixture from current LIVE builds MENU-2026-10-22 with 14 dishes: 12 mains and two desserts. All 14 retain portions and image URLs. This is a local data-model replay, not an authenticated Apps Script execution, rendered browser test or downloaded image check.

## Open finding MG-01, Medium

The deadline helper parses Default Deadline Time as colon-separated text although getValues returns a Date for the current TIME cell. A replay using the current displayed 17:00 value produces 20:00 on 21 October because the hour falls back to 20. Google documents that getValues can return Date objects: https://developers.google.com/apps-script/reference/spreadsheet/range#getValues() . The source-level defect is reproduced; whether and how it appears in exported artwork still requires MenuV2.html.

The original order-automation handoff explicitly sets the new ordering cutoff to 22:00 Sydney on the preceding day, while the poster's current Menu Config says 17:00. That discrepancy was already recorded in the handoff. Do not silently change the poster setting or the agreed ordering cutoff. Review the renderer, prepare a narrow correction for time-cell handling, and resolve any customer-facing deadline wording explicitly. This is an additional open finding, not one of the 36 addressed order-system findings and not yet claimed fixed.

## Current LIVE pricing is authoritative

The latest read shows LIVE at 0% standard discount, five-item minimum and AUD 2.50 delivery, with free delivery disabled. Rehearsal remains 20% / AUD 10. Read the current LIVE configuration at cutover and generate a fresh LIVE public snapshot. Rehearsal prices must not overwrite it. Preserve already accepted order/cart pricing snapshots.

## Still required

Receive MenuV2.html to inspect its template/helper calls, image loading, typography/layout capture, dependencies and PNG/WebP/JPEG conversion/download code. Verify the actual outputs and the shortcut's deployed version before marking the generator preserved. The app's hidden manifest/timezone has not been supplied. No generator source/deployment/configuration has been modified, and the production Control Tower candidate is unchanged.
