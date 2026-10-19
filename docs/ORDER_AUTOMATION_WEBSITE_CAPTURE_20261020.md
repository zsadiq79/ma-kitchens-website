# Rehearsal website capture verification, 20 October 2026

## Finding and fix

Severity: Medium. Customer request capture could save successfully in Apps Script while the website abandoned its response after 12 seconds. Native testing reproduced this: the initial request returned HTTP 502 ORDER_CAPTURE_UNCERTAIN, but exactly one request, one request item and one save event existed. Signed recovery using the original retry key found reference 1000, UNASSIGNED, $80 public estimate. Orders remained at 53, with no linked operational order, customer or sender. No provider messages were sent.

Both website capture and recovery routes now allow up to 45 seconds for the Apps Script fetch, bounded by an explicit 60-second Vercel function duration. The existing uncertainty response, private recovery capability and retry-key idempotence remain. No automatic write retry was added. Apps Script and its installed source are unchanged.

179 automated tests pass, including two new route budget checks and the existing uncertainty, signature, conflict and recovery tests. The fresh preview build and native retry/recovery/conflict checks are pending. This document must not be interpreted as a successful browser interaction or production release.

Vercel configuration reference: https://vercel.com/docs/functions/configuring-functions/duration

Production source, deployments, settings and workbook data remain unchanged.
