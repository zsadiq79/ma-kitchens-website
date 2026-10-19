# Rehearsal website capture verification, 20 October 2026

## Finding and fix

Severity: Medium. Customer request capture could save successfully in Apps Script while the website abandoned its response after 12 seconds. Native testing reproduced this: the initial request returned HTTP 502 ORDER_CAPTURE_UNCERTAIN, but exactly one request, one request item and one save event existed. Signed recovery using the original retry key found reference 1000, UNASSIGNED, $80 public estimate. Orders remained at 53, with no linked operational order, customer or sender. No provider messages were sent.

Both website capture and recovery routes now allow up to 45 seconds for the Apps Script fetch, bounded by an explicit 60-second Vercel function duration. The existing uncertainty response, private recovery capability and retry-key idempotence remain. No automatic write retry was added. Apps Script and its installed source are unchanged.

179 automated tests pass, including two new route budget checks and the existing uncertainty, signature, conflict and recovery tests. The revised preview build is READY. Native retry, private capability recovery, changed-payload conflict rejection and a fresh capture all passed. The fresh capture took 19,929 ms and returned HTTP 200 with reference 1001, demonstrating completion beyond the former 12-second limit. Retrying that new request returned the same reference. This document must not be interpreted as a successful browser interaction or production release.

Vercel configuration reference: https://vercel.com/docs/functions/configuring-functions/duration

Production source, deployments, settings and workbook data remain unchanged.

## Native result

Verified deployment: dpl_6epSNkCeMBNcfqsmrGafbvaY5ZD4, commit debe342078310e2c689a7fe38a02fc4a93f1dd5d.

Rehearsal contains exactly two synthetic unassigned requests, references 1000 and 1001, each with one five-pack item and one save event. Both have a $70 public food estimate and $10 delivery, totalling $80 before owner discounts. Neither has a customer, sender or linked operational order. Counts remain 53 operational orders, 185 item rows and 46 customers. No provider message, route dispatch or production change was issued. The generated WhatsApp message uses Order ref: 1001.

Browser interaction, actual manual WhatsApp send/receipt, sender/customer matching and acceptance of a website request remain pending. No request has been marked received without the actual message.
