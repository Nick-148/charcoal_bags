# Runbook: day-to-day operations (~10 hrs/week)

## Weekly rhythm

| When          | Task                                                                       | Time   |
| ------------- | -------------------------------------------------------------------------- | ------ |
| Mon           | `/admin` overview: check needs-review alerts, open inquiries, what to ship | 15 min |
| Mon–Wed       | Production: stitch and fill this batch (see "Pre-order batches")           | 3 h    |
| Tue + Fri     | Fulfilment: export CSV → buy labels → pack → mark shipped with tracking    | 2 h    |
| Daily, 10 min | Inquiries inbox and DMs                                                    | ~1 h   |
| Content days  | Film and post (see the marketing playbook)                                 | 3 h    |

## Fulfilling orders

1. `/admin/orders?filter=to_fulfill` lists paid orders that haven't shipped yet.
2. Click **Export to-ship CSV** and import it into Pirate Ship (or USPS Click-N-Ship). Map the columns
   on the first import.
3. Buy labels, pack, and drop off.
4. For each order, set the status to **shipped**, paste the tracking number, and save. Shipping
   requires a tracking number.
5. Optional: email the customer the tracking link (the order page has a mailto link). Automated
   shipping emails are on the roadmap.

Statuses: `unfulfilled → in_production → ready_to_ship → shipped → delivered`. Use `canceled` only
for orders that won't ship (refund first).

## Pre-order batches

- `/admin/inventory` sets each SKU's **mode**, **available** count, and **ships-by** date.
- **Open a batch:** set the mode to Pre-order, set available to the batch size (for example 25), and
  set the ships-by date. Every pre-order needs a date.
- **Batch made:** switch the mode to In stock and set available to the finished units left after
  filling the pre-orders.
- **Sell out:** set available to 0. Blank means unlimited (made to order). Use that carefully.
- Checkout reserves units immediately. Abandoned checkouts return them within about 45 minutes,
  through the Stripe expiry webhook and the 15-minute cron.

### If you can't meet a ship-by date (FTC Mail Order Rule)

Before the date passes, email every affected customer with the new date and offer a full refund.
If they don't agree to the delay, refund them. Push the SKU's ships-by date out so new buyers see the
truth.

## Refunds

- Full refund: open the order → Refund → leave "Return reserved units" checked if it hasn't shipped →
  type the order number → **Refund order**.
- Partial refund: issue it in the Stripe dashboard. The webhook marks the order partially refunded.
- Returns: refund once the item is back. Restock manually in Inventory if it's resellable.

## "Needs review" orders

These are flagged when a payment arrived after its stock reservation was released, or when the
amount paid doesn't match the order total. Check stock and the Stripe payment before promising a
ship date. Clear the flag by fulfilling or refunding the order.

## Inquiries

`/admin/inquiries`: reply by email (reply-to is set on alerts too), then set the status to replied
or closed. For bulk quotes, reply with a per-bag price, timeline, and payment method (a Stripe
Payment Link or Invoice for custom orders).

## Health checks

- The admin warning banner should be empty in production. Any warning means a missing secret or var.
- Workers → Observability: search `level:error`. Useful messages: `webhook.failed`,
  `checkout.gateway_failed`, `order.alert_failed`, `reconcile.order_failed`.
- Stripe → Webhooks: failed deliveries retry for 3 days. Fix the cause and Stripe redelivers.
- The LLC tracker on `/admin` estimates progress toward the $500 net-profit trigger for filing the
  NH LLC.
