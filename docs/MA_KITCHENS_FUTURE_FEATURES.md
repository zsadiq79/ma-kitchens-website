# Ma Kitchens future features

Recorded: 20 October 2026, Australia/Sydney.

Status: requested for a later release. This is a requirements log, not authorization to implement, activate a campaign or send messages. Finish the current order-automation rehearsal and production rollout first. Add these features to the same Control Tower and owner workspace afterward.

## 1. Send order confirmations from the owner workspace

Owner request: send the saved order confirmation from inside the Ma Kitchens owner order workspace, instead of copying it and sending it manually.

Plan the later feature around an explicit owner action for a saved order. Show the intended customer/recipient and saved confirmation before sending. Record the send outcome against that order, protect against accidental duplicate sends, and reconcile an uncertain provider response before retrying. Use the saved order's final prices and details.

Decide the sending method, provider/template requirements and retry interface during that feature's design. No confirmation sending is added to the current release.

## 2. 10 on 10 automation

Owner request: implement the previously agreed offer as a separate later update.

Previously agreed offer rules:

- Explicit WhatsApp opt-in grants one allocation per customer.
- 10% off food for the next 10 orders. Delivery is excluded; no item or savings cap.
- Opt-in remains frictionless, without requiring a name or address. Match existing customers by phone. Collect a new customer's required details when they order.
- Reserve an entitlement when pricing a cart. Consume it only after the order is successfully recorded. Discarding the cart releases the reservation.
- Full cancellation restores the entitlement once while the customer remains subscribed. A partial amendment does not restore it.
- Unsubscribing permanently forfeits unused entitlements. Rejoining does not restore them or grant another allocation.
- Honour existing priced unfinished carts and historical order prices.

Still to decide before implementation: expiry policy and interaction with the current standard discount, including the present 20% default. Do not assume the discounts stack or choose an expiry period silently.

## Current release boundary

Continue validating the existing request capture, real WhatsApp receipt, customer matching, review, acceptance and manual confirmation process. The existing standard discount is separate from 10 on 10. Both requested features remain in this backlog until their later implementation is agreed.
