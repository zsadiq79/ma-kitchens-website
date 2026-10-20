# Menu V2 final review

The separate original Menu V2 application is installed at owner-confirmed Version 22. Version 21 remains the rollback reference. Original shortcut, owner-only Sydney/V8 manifest, pictures, grouping and original 22 server functions are preserved.

Three Medium findings were fixed: MG-01 correctly parses Sheets time values and calendar dates; MG-02 bounds large exports, allows downscaling and checks output MIME; MG-03 respects the selected free-delivery threshold basis in wording. Nine automated generator tests pass. The owner accepted native PNG/JPG/WebP downloads first in the private review copy and then at the original shortcut. Current output correctly shows 21 October, 8 PM, for delivery 22 October. Website enforcement remains 10 PM Sydney.

Prepared Code.gs SHA-256: dea7211901cd3ecc3beacd7afafdbf9ba335e3e97d1007f7c39df0215d59021e.
Prepared MenuV2.html SHA-256: c7ded32b9811d83fe9f71fce885bfd80162319c0b799d08733c573e6c5f5d66a.
Normalized manifest SHA-256: 0dfbef8ae3a3bff2cd92e52d3a5c9afa5fbd49d4b36e245ba3b1c7d5d8df475f.

This renderer remains separate from Control Tower; its doGet and global constants were not merged. It does not write Sheets, send messages, publish GitHub changes or add triggers. It reads the original LIVE workbook. Native version/source bytes and image dimensions were not independently retrieved; owner confirmations underpin native acceptance. Extreme-size native exports were not exercised. Historical source-review JSON fields describe the earlier preparation snapshot; finalProductionStatus records supersede those flags.
