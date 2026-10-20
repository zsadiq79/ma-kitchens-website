# Ma Kitchens LIVE handover

20 October 2026. The reviewed system is live and the designated rollout checks have passed.

## What to use

Use the original [MVP Control Tower](https://docs.google.com/spreadsheets/d/1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4/edit). Open **Website Requests → Open owner order workspace** for manual orders and website requests. Keep rehearsal and backup files closed to avoid confusion. No rehearsal records were imported.

Customer ordering link: [Choose dishes](https://www.makitchens.com.au/go/order/current).

For a website request, match the actual WhatsApp sender, mark that message received, load or save the real customer, check delivery details and dishes, review the quote, then accept once. If the result is uncertain, use the saved-order check instead of creating another order. Confirmations are still copied and sent manually; mark sent only after actually sending.

Orders are saved Pending with Payment Requested. When a genuine order is ready for fulfilment, set its Order Status to Confirmed and verify Order Check is OK. Payment Status is a separate record. Select the correct date and refresh Packing Slips. Existing 22 October orders ORD-000053 through ORD-000058 were still Pending at final reconciliation, which explains their absence from the packing preview.

## Retained owner test order

ORD-000059 is retained as explicitly requested: Confirmed, five packs, AUD 77.50, Payment Requested. Note remains exactly:

> LIVE rollout test. DO NOT PREPARE OR DELIVER. Cancel after verification.

The owner instructed that both order and note remain. No cancellation is scheduled or required by this handover. The note is informational and does not itself block packing/dispatch. The native packing preview showed one bag with five packs. No saved confirmation was sent or marked sent during acceptance.

## Prices and weekly menus

New-order settings are in Menu Config: 0% standard discount, minimum five items, AUD 10 delivery and no free-delivery threshold. Accepted orders retain their saved prices, including ORD-000059's earlier AUD 2.50 delivery charge.

After updating dishes, menu dates or public pricing, run previewCurrentOrderingMenu to inspect the menu, then publishCurrentOrderingMenu in the LIVE Control Tower Apps Script. Wait for the website deployment and check the customer ordering link. The publisher is configured for main. Publishing the ordering menu is separate from downloading the poster.

The existing Menu V2 internet shortcut still works. It is owner-only and at Version 22. PNG, JPG and WebP downloads passed owner checks. Its current poster says 21 October at 8 PM for 22 October delivery. Website ordering enforcement remains 21 October at 10 PM Sydney; these two deadlines currently differ by design of the retained settings.

## What was checked and fixed

39 findings were fixed: 16 High, 20 Medium, 3 Low. Main protections cover customer identity, duplicate requests/orders, lost-response recovery, atomic commits, stock, frozen prices/cook identities, legacy writers and environment isolation. Other fixes cover totals, fees, labels, feedback identities, forwarding, packing and poster deadline/export behavior. The full review lists each issue, severity, fix and evidence.

193 automated checks passed. Native migration, final schema/trigger preview, retained-order verification, packing, website capture and menu publication passed their designated checks. All 58 original orders remain. The final read counted 59 orders, 221 item rows and 50 customers, including the retained test order. Original active-order financial values were preserved. The two old cancelled orders correctly have zero totals/fees.

Feedback is enabled with one original five-minute runFeedbackSender trigger. Both original web-app URLs are preserved at Version 47. No provider credentials were exposed. No automatic feedback, confirmation or dispatch was manually sent as part of the final acceptance.

## Versions and recovery

| Component | Current verified reference | Previous rollback reference |
| --- | --- | --- |
| Control Tower LIVE A | Version 47, existing URL | Version 46 |
| Control Tower LIVE B | Version 47, existing URL | Version 33 |
| Standalone Menu V2 | Version 22, owner-confirmed | Version 21 |
| Website application rollout | ef30a61ee4d7ed0e6a34c6f01762651458f004f5 | 27ef64557f82361effbb90d7f75442b32df4096a |
| Current public menu | f8028741a07fe8fbe6b925a0c7e3bb1319411144, READY | Earlier snapshot retained in Git history |

Final paused workbook backup: [20 October 11:46 Sydney](https://docs.google.com/spreadsheets/d/1NnTXZP-ggscCGRMtzZxdmYpm-Tqm2_3nBpxJgeC7XnY/edit). Never restore this over newer orders without reconciliation. Backups may retain source constants pointing at LIVE, so do not run their scripts casually. Restoring a web-app version does not restore editor Head, its triggers, settings or workbook data.

If an operation appears uncertain, keep its reference and use Check saved order. Do not create a duplicate or resend a confirmation merely because a response timed out. Pause/reconcile before any rollback and preserve every new order, journal, stock change and provider delivery record.

## Remaining future features and verification limits

Workspace confirmation sending and 10 on 10 automation remain in the future-feature log. They are not part of this release. Immutable Google source bytes were not independently retrieved. Owner-tested image files were not independently measured. Extreme-size exports were checked offline. Real provider dispatch/send/document generation paths were not replayed end to end; safe boundary tests and preserved configuration provide the stated evidence.
