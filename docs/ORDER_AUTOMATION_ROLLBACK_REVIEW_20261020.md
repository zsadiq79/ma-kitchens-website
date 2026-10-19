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

Preserve the original Ma Kitchens Menu V2 source files, manifest, actual deployment version and working shortcut before any separately approved generator update. Supplied baselines and candidate hashes are in the menu-generator review, but the shortcut's deployed source version has not been independently retrieved. The private review copy is not a rollback source for later production edits unless its exact source is verified. Restoring this read-only renderer must not restore an old workbook, change order records, or blindly overwrite deadline/price settings updated by the owner. An 8 PM poster time is selected but no LIVE configuration change has been made. Control Tower and generator rollback scopes remain separate.
