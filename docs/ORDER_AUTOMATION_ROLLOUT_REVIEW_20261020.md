# Production installation plan for review

Status: NOT APPROVED. Recent LIVE execution review is complete based on the inspected Order Entry sample, native record checks and the owner's 20 October confirmation of no other failures. Identify and verify the current weekly-menu artwork generator including PNG/WebP/JPEG downloads, and obtain explicit rollout approval before changing original LIVE source, settings, deployments or data. Rehearsal and the preparation backup are separate files.

The menu artwork generator is a newly disclosed external dependency, absent from consolidated Code.gs. The included ordering-menu JSON publisher does not replace it. The existing Weekly Menu/Dishes columns and inspected formula anchors are preserved in rehearsal, but current generator source, deployment mapping and exports remain unverified. Preserve its shortcut, project and template/output resources; do not change or consolidate them during the order-system installation. Record its current baseline and verify the same workflow after the approved in-place upgrade.

## Targets

- Original LIVE workbook: 1m_QLaKXFQcUTcU0pMK9l42_DPm9YA0WHHqq_sU6mHW4.
- Original LIVE script: 1hjXoo82Cv5bQ8a6AQibLqmD96j9FtXUtUkIsDuz_kkrf-F71nbW0XsIE.
- Preparation backup workbook: 1iDPVdKHQKLnF3PGS40USwxXztU0RlRV7KL08TVKgSwM.
- Preparation backup script: 1dm5nrH-MmcbUmfh_e-SiBCBYT_1CDu08voldBNbK5bXwVSXPlA3pLmbh.
- Rehearsal remains paused; it is not the production destination.

## Agreed-window sequence, only after approval

1. Coordinate a brief owner-entry pause and all known automated writers. Reconcile the current LIVE draft and outstanding submissions. Do not clear or resend uncertain attempts. Capture a fresh LIVE inventory and private backup immediately before changes, including current source/manifest and rollback references. Preserve all newer real orders and customer updates.
2. Record existing provider settings and trigger inventory privately. Preserve credentials, flags, document IDs, publisher token and the feedback timer. Never export secret values into chat or this repository. Review any recent failure before replacing its code.
3. Install the production-profile Code.gs and matching OwnerOrderWorkspace.html/appsscript.json in the original LIVE project. Consolidate the old 13 .gs files into the single reviewed Code.gs in the controlled window. Saving changes Head immediately. Complete the source save promptly and check Head executions; public web-app versions remain separately versioned. Do not paste the rehearsal profile into LIVE.
4. Run configureOrderAutomationProduction and previewOrderAutomationMigration. Confirm PRODUCTION, the original LIVE book/project, LEGACY and expected current schemas. Preserve existing provider settings. Stop for any unexpected state or trigger.
5. Update both existing web-app deployment IDs to the reviewed candidate in LEGACY stage, retaining their URLs. Verify current authenticated service contracts and routing before migration. Do not create replacement URLs or silently redirect provider settings.
6. Run migrateOrderAutomationWorkspace once. If uncertain, use reconcileOrderAutomationMigration before another write. Run the unchanged migration/preview verification and compare every latest order/customer/item identity, quantity, status, payment and financial value against the fresh baseline and approved cancelled-charge corrections.
7. Run repairOrderDeliveryChargeDisplay and repairOrderDiscountLabelDisplay, then repeat each to confirm zero further changes. Verify active totals, cancelled totals/payouts, label displays and existing validations.
8. Prepare the current LIVE private menu state and activateOwnerOrderWorkspace. Confirm the correct owner workspace and preserved packing/feedback behavior. New public capture remains disabled. Preserve all genuine LIVE draft/customer/order histories and IDs; do not import rehearsal data.
9. Privately configure a production-specific ORDER_REQUEST_API_SECRET of at least 32 characters, preserving an existing suitable production value if already configured. The owner copies it privately into the Vercel Production secret. Configure Production ORDER_REQUEST_API_URL to the designated LIVE request-capable deployment. Preserve FLOW_MENU_API_URL and CONTROL_TOWER_WEBHOOK_URL and their existing secrets. Set Production ORDER_REQUEST_ALLOWED_ORIGINS to https://www.makitchens.com.au, preserving any other explicitly approved origins. Verify ORDER_AUTOMATION_TEST_ONLY is absent or false in Production and remains preview-only. Keep the rehearsal preview variables scoped to their branch.
10. Replace the rehearsal-derived data/published-order-menu.json with a fresh snapshot of the prepared LIVE menu before merging the website release. The website and publisher must use the same schema-2 revision, delivery date and live dishes/prices. Reconcile any publisher/merge conflict using freshly verified LIVE state. Never resolve it by retaining stale rehearsal menu data. Verify Vercel READY and actual public/private menu agreement before enabling requests.
11. Enable request capture only after configuration and schema/menu checks pass. Verify the production capture/recovery path and one explicitly agreed owner test or real incoming order, then its actual WhatsApp sender, customer match, final quote, acceptance and saved-order recheck. Verify stock and no duplicate. Clean test outcomes only through agreed operational actions, never by deleting ledgers.
12. Check packing/cook/delivery/feedback previews and existing provider ingress. Any provider send, route dispatch or document generation test must be explicitly included in the approved window and recipient/order scope. Do not blindly rerun old failed sends or reinstall the feedback timer.
13. Resume normal entry only after every latest pre-cutover order and new operation is accounted for. Retain the backup, journals, snapshots and rollback evidence.

The 58-order preparation count is historical, not a production limit or reserved next ID. Re-read current LIVE records and durable reservations at cutover. Keep recording real orders in original LIVE until the agreed pause begins.
