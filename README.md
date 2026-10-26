# Oja

Mobile web app for Nigerian vendors who sell on Instagram and WhatsApp.

- **SafePay checkout.** A "Pay safely" link for each item. Buyers pay through Paystack into escrow, follow the order on a tracking page, and the shop is paid only when they confirm delivery (or 48 hours after delivery with no complaint). Buyers can report a problem to freeze the money, and Oja staff settle disputes with a refund or a release.
- **Waitlists** for sold-out items, filled from Instagram DMs, Instagram comments ("comment RESTOCK"), WhatsApp and the shop page.
- **Restock alerts** sent on WhatsApp to the first wave of the waitlist (twice as many buyers as units, oldest first). A reply goes straight into the inbox, tagged "from alert", so recovered sales are counted.
- **One inbox** for Instagram DMs and WhatsApp chats, with chats assigned to sales reps.
- **Rep scorecard**: first reply time, missed chats (owner sets the limit), close rate and sales per rep.

Until a shop connects WhatsApp and Instagram in Settings, sends are recorded as *simulated* and the inbox has a "pretend buyer" form, so the whole flow can be tried before Meta approves anything.

## Stack

Next.js 15 (App Router, server actions), Postgres with Prisma, WhatsApp Cloud API and the Instagram API with Instagram Login. Designed phone-first and installable to the home screen.

## Run it locally

```bash
cp .env.example .env        # fill in DATABASE_URL, SESSION_SECRET, TOKEN_ENCRYPTION_KEY
npm install
npx prisma migrate deploy
npm run db:seed             # optional demo shop: owner@asawears.test / demo-password
npm run dev
```

`npm test` runs the unit tests (phone numbers, waves, rep assignment, metrics, webhook signatures and parsing, token encryption).

## Deploy (Vercel + Supabase)

1. **Database.** Create a Supabase project. Under *Connect*, copy the **Session pooler** connection string (it works over IPv4, which Vercel needs) and use it as `DATABASE_URL`. Tables are created automatically: the build runs `prisma migrate deploy`.
2. **App.** Import the GitHub repo into Vercel. Add every variable from `.env.example`. Set `APP_URL` to the Vercel URL (or your domain).
3. **Meta app.** At developers.facebook.com create an app of type *Business* and add the **WhatsApp** and **Instagram** products.
   - Webhooks: callback URLs are `APP_URL/api/webhooks/whatsapp` and `APP_URL/api/webhooks/instagram`, verify token is `META_WEBHOOK_VERIFY_TOKEN`. Subscribe WhatsApp to `messages`, Instagram to `messages` and `comments`.
   - Copy the app secret into `META_APP_SECRET`. Webhook calls without a valid signature are rejected.
   - Create the restock message template (category *Marketing*), named as in `WA_RESTOCK_TEMPLATE`, with body variables `{{1}}` product, `{{2}}` shop, `{{3}}` units left, `{{4}}` price. Example body: *Good news! {{1}} is back at {{2}}. {{3}} left at {{4}}. Reply YES to reserve yours. Reply STOP to opt out.*
   - Complete business verification and app review (`whatsapp_business_messaging`, `instagram_business_manage_messages`, `instagram_business_manage_comments`) before real vendors connect.
4. **Each shop** pastes its WhatsApp phone number ID and a permanent System User token, and its Instagram account ID and token, in Settings. Tokens are encrypted with `TOKEN_ENCRYPTION_KEY`.

## SafePay (escrow checkout)

How money moves: the buyer pays item price + buyer protection fee into the platform's Paystack balance. When the order is released, the shop gets the item price minus the commission by Paystack transfer to the account it set up in Settings. A refund goes back to the buyer's card or account through Paystack.

| Status | Who moves it | Next |
| --- | --- | --- |
| Paid | Paystack webhook (or straight away in test mode) | Shop marks dispatched |
| Dispatched | Shop | Shop marks delivered, or buyer confirms |
| Delivered | Shop | Buyer confirms, or auto-release after `SAFEPAY_RELEASE_HOURS` |
| Problem reported | Buyer | Admin refunds or releases |
| Completed | Buyer, cron or admin | Transfer to the shop |

Set up:

1. **Paystack.** Add `PAYSTACK_SECRET_KEY`. In the Paystack dashboard set the webhook URL to `APP_URL/api/webhooks/paystack`. Transfers must be enabled on the account, and OTP for transfers turned off (Settings > Preferences) so payouts can run from the API.
2. **Cron.** Set `CRON_SECRET`. `vercel.json` calls `/api/cron/release` every hour to pay out delivered orders, retry failed payouts and cancel unpaid checkouts older than a day. Vercel's Hobby plan only runs crons once a day; use Pro, or call the URL from another scheduler with the same `Authorization: Bearer` header.
3. **Admins.** Put Oja staff emails in `ADMIN_EMAILS`. They see a Disputes tab across all shops.
4. **Order updates on WhatsApp (optional).** Create a *Utility* template with body variables `{{1}}` shop, `{{2}}` update, `{{3}}` link, e.g. *{{1}}: {{2}} Track your order: {{3}}*, and set `WA_ORDER_TEMPLATE`. Buyers are messaged when paid, dispatched and delivered.

Before taking real money, get legal advice on holding buyer funds in Nigeria, and confirm with Paystack that your account may be used this way.

## Rules the app enforces

- Buyers opt in themselves (shop page) or a rep ticks that the buyer agreed. Consent wording and time are stored on each waitlist entry.
- A WhatsApp reply of `STOP` opts the buyer out and removes them from every waitlist for that shop.
- Free-form WhatsApp replies only deliver within 24 hours of the buyer's last message (Meta's rule); outside that window the app shows the send as not delivered.
