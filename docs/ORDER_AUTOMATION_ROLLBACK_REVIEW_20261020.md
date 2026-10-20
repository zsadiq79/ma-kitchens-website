# Current rollback references

No rollback was performed. The historical plan below is retained for procedure context. Current Control Tower LIVE A and B are Version 47; prior versions are 46 and 33 respectively. Menu V2 is owner-confirmed Version 22; prior version is 21. Current website menu commit is f8028741a07fe8fbe6b925a0c7e3bb1319411144, READY deployment dpl_99mhN1hbxBjYhgDN4nVnbrCRyDQz. Website application rollout was ef30a61ee4d7ed0e6a34c6f01762651458f004f5; pre-rollout reference is 27ef64557f82361effbb90d7f75442b32df4096a.

Final paused backup is workbook 1NnTXZP-ggscCGRMtzZxdmYpm-Tqm2_3nBpxJgeC7XnY, 20 October 11:46 Sydney. At least ORD-000059 was accepted after that backup and must be preserved. The owner explicitly retained that order and its do-not-prepare note. Never roll back the entire workbook over subsequent orders.

Current triggers: orderRequestInboxOnOpen_ and showPackingSlipsMenu_ ON_OPEN, plus original runFeedbackSender CLOCK every five minutes. Feedback enabled. Poster deadline is now 20:00; website enforcement remains 22:00. New-order delivery is AUD 10, while accepted snapshots retain their prior charges. Earlier pending/unmodified statements below are historical and superseded.

# Production stop and rollback plan for review

Status: NOT APPROVED FOR EXECUTION. Use only during an explicitly approved production window after fresh reads. A workbook backup is separate from editor source, versioned web apps, triggers, script properties, Vercel settings and provider configuration.

## Existing rollback references

- Apps Script LIVE A currently Version 46, deployment URL ending AKfycbxqd0CLenSocTTP7hPl6sQcaBZC6xi3nUvjYBu1EZ5H8LKw_IrU3WKI_Z74KnIMKmzQ/exec.
- Apps Script LIVE B currently Version 33, deployment URL ending AKfycbxqPAodnUOdAQe3x82duA6q-Qld1Bb7XqoW3Mnr3JDvXOMGKuufY9dwh4JFwoEbYTLa/exec.
- Original website main: 27ef64557f82361effbb90d7f75442b32df4096a; READY deployment dpl_8Wt9R8WEcLbFAddsxsfsRCZAjZvj.
- Existing Head triggers: orderEntryEdited on edit; orderEntryMenu on open; showPackingSlipsMenu_ on open; runFeedbackSender time-driven. Reconfirm at cutover and preserve the timer cadence and original provider flags.
- Preparation backup book/script are listed in the installation plan. Take a fresh cutover backup; do not assume this earlier snapshot contains later orders.

## Stop without destructive data restoration

Pause new owner/request writes using the reviewed owner pause function and coordinate all legacy/public writers. Preserve recovery of existing requests and saved-order checks. Retain all operational rows, snapshots, journals, reservations and provider delivery evidence. A menu withdrawal is a separate publication action that needs the agreed maintenance scope.

Reconcile any MIGRATING/COMMITTING/UNCERTAIN result from fresh Sheets state and actual provider evidence before retrying. Never issue a second order or confirmation merely because a response was lost.

## If reverting source/deployments is necessary

Account for source Head and public deployment versions separately. Restoring web-app Versions 46/33 does not restore editor Head or its trigger behavior. Coordinate all writers before reverting; older writers do not understand every new journal reservation or pause flag. Capture and reconcile every order/customer operation created since the backup, current menus and any provider activity. Preserve newer records and reserve/reconcile IDs before reopening older entry paths.

Restore the exact archived editor source/manifest and agreed trigger behavior together with both appropriate web-app versions and website/configuration state. Do not delete the new ledgers or blindly overwrite snapshot formulas or newer rows with an old workbook copy. Recheck all latest customer/order/item links, stock and financial values before resuming. A full data restoration requires a separately reviewed reconciliation plan, not an automatic step in rollback.

No rollback action, source replacement, deployment change, provider send or data overwrite is performed by this package.

## Separate menu generator

The owner selected the original shortcut deployment and reported Version 21 on 20 October at 11:13 Sydney. Preserve that version and the existing shortcut for an independently scoped generator update. The owner-supplied manifest is Sydney / V8 / USER_DEPLOYING / MYSELF with empty dependencies. Its normalized copy and both supplied source baselines are archived. The immutable Version 21 source bytes have not been independently retrieved; do not describe the editor baseline as a hash-matched deployed export.

The private candidate passed owner native rendering and PNG/JPEG/WebP download acceptance. The original working app remains unchanged. Restoring this read-only renderer must not restore an old workbook, change order records, or blindly overwrite newer deadline/price settings. Selected 8 PM poster configuration has not been applied; website enforcement remains 22:00. Keep Control Tower Versions 46/33 and generator Version 21 as distinct rollback references.
