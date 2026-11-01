# Oja

Mobile web app for Nigerian vendors who sell on Instagram and WhatsApp.

- **SafePay checkout.** A "Pay safely" link for each item. Buyers pay through Paystack into escrow, follow the order on a tracking page, and the shop is paid only when they confirm delivery (or 48 hours after delivery with no complaint). Buyers can report a problem to freeze the money, and Oja staff settle disputes with a refund or a release.
- **Delivery booking.** From a paid order, the shop picks a package size, sees prices from couriers (Kwik, GIG and others through Shipbubble) and books one. The buyer's tracking page links to the courier's tracker, and the order is marked delivered when the courier delivers. The fee comes out of that order's payout, so the shop pays nothing up front. Shops can still use their own rider.
- **AI sales agent.** Buyers can do everything inside WhatsApp or Instagram. The agent answers on its own from the live catalogue, sends product cards with tap buttons (Buy now, Notify me), collects the delivery address, creates the order and sends a "Pay now" link, adds buyers to restock lists, and answers "where is my order". It hands the chat to a rep for complaints, refunds, discounts, custom requests, or whenever a buyer asks for a person, with a one-line note on why. Reps can take over or hand back any chat. New shops start with it on; each shop can switch to drafts only, or off, in Settings.
- **Order updates in the chat.** Payment received, dispatched and delivered messages go to the buyer and are written into the chat so reps see them too.
- **Stock alerts.** When an item falls to its low-stock level (3 by default, set per product) or sells out, the owner gets a WhatsApp message with how many buyers are waiting and a restock link.
- **AI drafts.** In any chat, "Draft reply with AI" writes the next message from the conversation and your catalogue (prices, stock, Pay safely and notify links). When a buyer goes quiet, Oja flags the chat on Home while there is still time inside WhatsApp's 24-hour window and drafts a follow-up instead. A rep always reads and sends it.
- **Verified badges.** "Bank verified" appears once a payout account is confirmed with the bank. "Business verified" appears after Oja staff check the shop's CAC number on the public register. Buyers see the badge on the shop page and checkout.
- **Waitlists** for sold-out items, filled from Instagram DMs, Instagram comments ("comment RESTOCK"), WhatsApp and the shop page.
- **Restock alerts** sent on WhatsApp to the first wave of the waitlist (twice as many buyers as units, oldest first). A reply goes straight into the inbox, tagged "from alert", so recovered sales are counted.
- **One inbox** for Instagram DMs and WhatsApp chats, with chats assigned to sales reps.
- **Roles and activity log.** Owners add staff as *Sales rep* (their chats, orders and restock lists; can't change prices or stock or reassign chats) or *Manager* (chats, orders, products and stock, everyone's scorecard and activity; no payouts, settings or team changes). Every reply, sale, chat assignment, AI take-over, price or stock change, restock, order step, settings change and login is written to an activity log with the person, time and device. Owners and managers see it under Team, filtered by person and period.
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

## AI sales agent

Set `ANTHROPIC_API_KEY`. In Settings > AI sales agent the owner picks *Answer buyers on its own* (default for new shops), *Only draft replies* (the default for shops created before this feature) or *Off*, writes notes the agent should know (delivery areas and fees, returns, opening hours), and gives the WhatsApp number for stock alerts.

How it runs: the WhatsApp and Instagram webhooks store the buyer's message, return 200 to Meta, then run the agent in the background (`after()`), so a slow reply never makes Meta retry. The agent uses Claude Opus 5.5 at low effort with four tools (`show_product`, `create_checkout`, `join_waitlist`, `hand_over`), up to five steps per message. Every tool call is checked on the server: products must belong to the shop, quantities must be in stock, and an order needs a name, full address, city and a Nigerian phone number. If the AI fails or declines, the chat is handed to a rep. Messages it sends show as "AI agent" in the inbox. Messages asking for a person ("customer care", "talk to someone", "are you human") are handed over without calling the AI.

Orders made in a chat link to the buyer's tracking page, which now has a **Pay now** button; the Paystack page is created on the first tap and reused after that. In test mode (no Paystack key) Pay now marks the order paid straight away.

For stock alerts that arrive at any time, create a *Utility* template and set `WA_STOCK_TEMPLATE` (body variables `{{1}}` product, `{{2}}` units left, `{{3}}` customers waiting, `{{4}}` restock link). Without it, alerts are plain WhatsApp messages, which Meta only delivers if the owner wrote to the shop's number in the last 24 hours. Order updates fall back the same way: without `WA_ORDER_TEMPLATE`, an order made in a WhatsApp chat gets plain messages while the 24-hour window is open.

## Bulk product upload

Products → Upload a spreadsheet takes a CSV saved from Excel or Google Sheets, or cells pasted straight from the sheet.
Columns are Name and Price, plus optional Stock, Image link, Description and Low stock at. Rows whose name matches an
existing product update it, and blank cells leave that field alone. The owner sees what will change and fixes any bad rows
before anything is saved. New stock goes through the normal restock, so buyers on a restock list get their WhatsApp
message. "Download your products" exports the current list in the same layout, so it also serves as the template.

## AI drafts

Set `ANTHROPIC_API_KEY`. Drafts use Claude Opus 5.5 at low effort (short chat replies don't need more), with server-side refusal fallback turned on. Each draft sends the last 20 messages of that chat and up to 40 products. Without a key the button is hidden.

## Delivery booking

Set `SHIPBUBBLE_API_KEY` and point the Shipbubble webhook at `APP_URL/api/webhooks/shipbubble`. Oja books every delivery on its own Shipbubble account, so keep that wallet funded; each fee is deducted from the shop's payout when the order is released. Shops save a pickup address in Settings, which is checked with Shipbubble. Couriers that cost as much as the shop's payout are hidden. If a courier cancels, the order goes back to "paid" with no fee so the shop can book again. Without a key, prices are examples and no rider is sent.

If a booked order is later refunded, Oja has already paid the courier and that fee is not recovered from anyone. Settle it case by case.

## Business verification

Shops request it in Settings with their RC or BN number and registered name. Admins (`ADMIN_EMAILS`) see requests in the Disputes tab, check them on the CAC public search and against the bank account name, then approve or reject with a reason.

## Rules the app enforces

- Buyers opt in themselves (shop page) or a rep ticks that the buyer agreed. Consent wording and time are stored on each waitlist entry.
- A WhatsApp reply of `STOP` opts the buyer out and removes them from every waitlist for that shop.
- Free-form WhatsApp replies only deliver within 24 hours of the buyer's last message (Meta's rule); outside that window the app shows the send as not delivered.
