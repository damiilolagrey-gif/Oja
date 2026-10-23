# Oja

Mobile web app for Nigerian vendors who sell on Instagram and WhatsApp.

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

## Rules the app enforces

- Buyers opt in themselves (shop page) or a rep ticks that the buyer agreed. Consent wording and time are stored on each waitlist entry.
- A WhatsApp reply of `STOP` opts the buyer out and removes them from every waitlist for that shop.
- Free-form WhatsApp replies only deliver within 24 hours of the buyer's last message (Meta's rule); outside that window the app shows the send as not delivered.
