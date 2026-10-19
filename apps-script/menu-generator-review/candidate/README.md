# Ma Kitchens Menu V2 test candidate

These files belong only to the separate Ma Kitchens Menu V2 project. Never add them to the Control Tower Apps Script project. They contain their own doGet and template helpers.

Not installed or deployed. The original shortcut is unchanged. Code.gs is a complete replacement for this separate generator; MenuV2.html is its complete matching template. The distinctly named .txt files contain exactly the same bytes for copying.

The code reads the original LIVE workbook but never writes Sheets, creates orders, sends messages, dispatches routes or publishes website data. All image conversion/downloads occur in the browser.

Corrections: respect a Sheets TIME value and the spreadsheet calendar for deadlines; allow long menus to shrink within export limits; reject mismatched image encodings; respect pre/post-discount free-delivery wording; await font readiness before capture. Preserve the visual design, dish photos, grouping and ordering.

The poster deadline currently comes from Menu Config (one day before, 17:00). The website's agreed ordering cutoff is 22:00. Resolve the advertised-time decision explicitly; no live settings were changed to choose one silently. Use a separate private test copy for native verification before any authorized update to the working generator deployment. Retain the existing shortcut URL for the eventual approved update.
