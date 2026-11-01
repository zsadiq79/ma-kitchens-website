# Routific recovery baseline

Status: assessment only. No production application files are changed by this directory.

## Run the inspection

In the existing **Ma Kitchens WhatsApp Automation** Apps Script project:

1. Add a new Script file named `RoutificRecoveryInspection`.
2. Replace that new file's placeholder with the complete contents of `ReadOnlyInspection.txt`.
3. Save, select `inspectRoutificRecoveryReadOnly` and run it as the workbook owner.
4. Copy the complete execution log, including the `SEND_RESERVATION` and `OCT29_ORDER` lines.

Keep Code.gs, Marketing.gs, deployments, triggers and Routific settings unchanged.
Saving this separate file does not install a trigger or activate anything.

The function uses the existing read-only owner/project binding check. It does not call
the broken trigger allowlist, acquire locks, change properties or sheets, send messages,
or make network requests. If Google asks for additional permissions, record the permission
request before proceeding; the diagnostic itself does not require external API access.

## Evidence and limits

- Runtime mode, existing credentials' presence (never their values), feedback mode and triggers.
- Pending ETA jobs and send reservations, including uncertain sends.
- Sheet allocation, used range and read time. The customer table is counted, not read.
- Orders for 29 October 2026 and their delivery UUIDs and message-stage log statuses.
- Phone numbers, names, addresses, credentials and provider message IDs are excluded from output.
- Unknown errors are sanitized. Incomplete reads and row limits are reported explicitly.
- The result describes editor/runtime state. It cannot verify either deployed web-app version.
- Missing log entries do not establish that no message was sent. Reservations and provider
  evidence must be reconciled before any historical repair or retry.
- Historical route timelines are a separate read-only step. This inspection makes no Routific calls.

## Verified website baseline

The production Vercel deployment was READY at commit
`d05d2bac41acce5a410f00fb5a3437fa42d10009`. The recovery branch starts at that commit.
The source manifest records hashes of the owner's latest Code.gs and Marketing.gs uploads.
Those original uploads are not replaced by older repository copies.

## Repair constraints carried forward

1. Acknowledge verified Routific events only after durable persistence at the website boundary.
2. Retain retryable delivery work independently of ETA freshness. Never replay obsolete ETA messages.
3. Use persistent, atomic message reservations before external sends. Ambiguous sends require review.
4. No Routific or WhatsApp call while holding the workbook's shared writer lock.
5. Preserve cancelled-order exclusion, consent checks, order UUID matching, pricing and marketing.
6. Support multiple routes, grouped stops, reordered/repeated events and complete paginated timelines.
7. Exercise the exact production processing path with designated test orders before activation.
8. Keep historical reconciliation separate from notification activation and retain all old receipts.

The managed queue option remains subject to a project capability and cost check. No resource,
subscription, integration or service has been provisioned. Vercel's published pricing currently
meters queue API operations and separately meters consumer function execution. Do not describe
the eventual implementation as free without checking the account's actual plan and usage.

## Validation

Run `node --test tests/routific-recovery-inspection.test.cjs` from the repository root.
The tests validate read-only operation, redaction, malformed records, missing headers,
truncated history, duplicate identities, Sydney dates and bounded log entries.
They validate this diagnostic only, not the future message-processing repair.
