import { headers } from "next/headers";
import { requireUser } from "@/lib/session";
import { displayPhone } from "@/lib/phone";
import { instagramConnected, whatsappConnected } from "@/lib/meta";
import { ActionForm, Submit } from "@/components/ActionForm";
import { connectInstagram, connectWhatsApp, disconnect, requestVerification, saveAgentSettings, savePayoutAccount, savePickupAddress, updateShop } from "@/app/actions/settings";
import { aiConfigured } from "@/lib/ai";
import { TrustBadge } from "@/components/TrustBadge";
import { listBanks, paystackConfigured } from "@/lib/paystack";
import { shipbubbleConfigured } from "@/lib/shipbubble";
import { logout } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

// Used only in test mode, when there is no Paystack key to fetch the full list.
const TEST_BANKS = [
  ["044", "Access Bank"], ["011", "First Bank of Nigeria"], ["058", "Guaranty Trust Bank"], ["50211", "Kuda Bank"],
  ["50515", "Moniepoint MFB"], ["999992", "OPay"], ["999991", "PalmPay"], ["033", "United Bank For Africa"], ["035", "Wema Bank"], ["057", "Zenith Bank"],
].map(([code, name]) => ({ code, name }));

export default async function Settings() {
  const user = await requireUser();
  const shop = user.shop;
  const h = await headers();
  const base = process.env.APP_URL || `https://${h.get("host")}`;
  const isOwner = user.role === "OWNER";
  const banks = isOwner ? (paystackConfigured() ? await listBanks().then(r => (r.ok ? r.data : [])) : TEST_BANKS) : [];

  return (
    <>
      <h1>Settings</h1>

      {isOwner && (
        <>
          <section className="panel">
            <div className="panel-h"><h2>Shop</h2></div>
            <div className="panel-b">
              <ActionForm action={updateShop}>
                <label className="field">Shop name<input className="input" name="name" defaultValue={shop.name} required /></label>
                <label className="field">Instagram handle<input className="input" name="igHandle" defaultValue={shop.igHandle ?? ""} placeholder="asawears.ng" /></label>
                <label className="field">WhatsApp number buyers order on
                  <input className="input" name="whatsappNumber" type="tel" inputMode="tel" defaultValue={shop.whatsappNumber ? displayPhone(shop.whatsappNumber) : ""} placeholder="0803 123 4567" />
                </label>
                <label className="field">Bank details for quick replies
                  <input className="input" name="bankDetails" defaultValue={shop.bankDetails ?? ""} placeholder="GTBank 0123456789 (Asa Wears)" />
                </label>
                <Submit>Save</Submit>
              </ActionForm>
              <p className="small muted">Your shop page: <span className="code">{base}/s/{shop.slug}</span></p>
            </div>
          </section>

          <section className="panel" id="payouts">
            <div className="panel-h">
              <h2>SafePay payouts</h2>
              {shop.payoutAccountNumber ? <span className="pill good">Set up</span> : <span className="pill gold">Not set up</span>}
            </div>
            <div className="panel-b">
              {shop.payoutAccountNumber && (
                <p className="small">Paying into <b>{shop.payoutAccountName}</b>, {shop.payoutBankName} {shop.payoutAccountNumber}</p>
              )}
              <ActionForm action={savePayoutAccount}>
                <p className="small muted">When a buyer confirms delivery, we transfer the item amount minus our fee to this account. It must be in your or your business&apos;s name.</p>
                <label className="field">Bank
                  <select className="input" name="bank" required defaultValue={shop.payoutBankCode ? `${shop.payoutBankCode}|${shop.payoutBankName}` : ""}>
                    <option value="" disabled>Choose your bank</option>
                    {banks.map(b => <option key={b.code + b.name} value={`${b.code}|${b.name}`}>{b.name}</option>)}
                  </select>
                </label>
                <label className="field">Account number<input className="input" name="accountNumber" inputMode="numeric" maxLength={10} defaultValue={shop.payoutAccountNumber ?? ""} required /></label>
                <Submit pendingText="Checking with your bank…">{shop.payoutAccountNumber ? "Change account" : "Save payout account"}</Submit>
              </ActionForm>
              <p className="small muted">Your SafePay link for Instagram and TikTok bios: <span className="code">{base}/s/{shop.slug}</span></p>
            </div>
          </section>

          <section className="panel" id="agent">
            <div className="panel-h">
              <h2>AI sales agent</h2>
              <span className={`pill ${shop.agentMode === "AUTO" ? "good" : "plain"}`}>{shop.agentMode === "AUTO" ? "Answering buyers" : shop.agentMode === "DRAFT" ? "Drafts only" : "Off"}</span>
            </div>
            <div className="panel-b">
              <ActionForm action={saveAgentSettings}>
                <label className="field">How it works
                  <select className="input" name="agentMode" defaultValue={shop.agentMode}>
                    <option value="AUTO">Answer buyers on its own, hand over when unsure</option>
                    <option value="DRAFT">Only draft replies for my team to send</option>
                    <option value="OFF">Off</option>
                  </select>
                </label>
                <label className="field">What should it know about your shop?
                  <textarea className="input" name="agentNotes" rows={4} defaultValue={shop.agentNotes ?? ""}
                    placeholder={"Delivery: Lagos ₦2,500, 1 to 2 days. Other states ₦4,500, 3 to 5 days.\nReturns: exchange within 3 days if unworn.\nWe reply 8am to 9pm."} />
                </label>
                <label className="field">Your WhatsApp for stock alerts
                  <input className="input" name="alertPhone" type="tel" inputMode="tel" defaultValue={displayPhone(shop.alertPhone ?? "")} placeholder="0803 123 4567" />
                </label>
                <p className="small muted">It only quotes your live prices and stock, takes orders with a SafePay link, and adds buyers to restock lists. Complaints, discounts and custom requests go to your team. Try it with the pretend buyer in the Inbox.</p>
                {!aiConfigured() && <p className="small error">Needs ANTHROPIC_API_KEY on the server before it can answer.</p>}
                <Submit>Save</Submit>
              </ActionForm>
            </div>
          </section>

          <section className="panel" id="delivery">
            <div className="panel-h">
              <h2>Delivery pickup</h2>
              {shop.pickupAddress ? <span className="pill good">Set up</span> : <span className="pill gold">Not set up</span>}
            </div>
            <div className="panel-b">
              <ActionForm action={savePickupAddress}>
                <p className="small muted">Where riders collect orders when you book delivery from an order. You see each courier&apos;s price first, and it comes out of that order&apos;s payout.</p>
                <label className="field">Street address<input className="input" name="address" defaultValue={shop.pickupAddress ?? ""} placeholder="12 Admiralty Way, Lekki Phase 1" required /></label>
                <label className="field">City<input className="input" name="city" defaultValue={shop.pickupCity ?? ""} placeholder="Lagos" required /></label>
                <label className="field">Phone for the rider
                  <input className="input" name="phone" type="tel" inputMode="tel" defaultValue={displayPhone(shop.pickupPhone ?? shop.whatsappNumber ?? "")} placeholder="0803 123 4567" required />
                </label>
                <Submit pendingText="Checking the address…">Save pickup address</Submit>
              </ActionForm>
              {!shipbubbleConfigured() && <p className="small muted">Delivery booking is in test mode: prices are examples and no rider is sent.</p>}
            </div>
          </section>

          <section className="panel" id="verification">
            <div className="panel-h">
              <h2>Verification</h2>
              <TrustBadge shop={shop} />
            </div>
            <div className="panel-b">
              <p className="small muted">Buyers see a badge on your shop page and checkout. <b>Bank verified</b> comes automatically once your payout account is checked. <b>Business verified</b> needs your CAC registration.</p>
              {shop.businessVerifiedAt ? (
                <p className="small">Verified as <b>{shop.registeredName}</b> ({shop.cacNumber}).</p>
              ) : shop.verificationRequestedAt ? (
                <p className="notice small">We&apos;re checking {shop.registeredName} ({shop.cacNumber}). This usually takes up to 2 working days.</p>
              ) : (
                <ActionForm action={requestVerification}>
                  {shop.verificationNote && <p className="error small">Last check: {shop.verificationNote}</p>}
                  <label className="field">CAC number<input className="input" name="cacNumber" placeholder="RC 1234567 or BN 3456789" defaultValue={shop.cacNumber ?? ""} required /></label>
                  <label className="field">Registered business name<input className="input" name="registeredName" defaultValue={shop.registeredName ?? ""} required /></label>
                  <Submit>Request business verification</Submit>
                </ActionForm>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2>WhatsApp</h2>
              {whatsappConnected(shop) ? <span className="pill good">Connected</span> : <span className="pill gold">Not connected</span>}
            </div>
            <div className="panel-b">
              {whatsappConnected(shop) ? (
                <form action={disconnect}><input type="hidden" name="which" value="whatsapp" />
                  <p className="small muted">Phone number ID {shop.waPhoneNumberId}</p>
                  <button className="btn ghost">Disconnect</button></form>
              ) : (
                <ActionForm action={connectWhatsApp}>
                  <p className="small muted">From your Meta app: WhatsApp &gt; API setup. Use a permanent System User token, not the 24-hour test token.</p>
                  <label className="field">Phone number ID<input className="input" name="phoneNumberId" inputMode="numeric" required /></label>
                  <label className="field">Access token<input className="input" name="token" type="password" autoComplete="off" required /></label>
                  <Submit>Connect WhatsApp</Submit>
                </ActionForm>
              )}
              <p className="small muted">Webhook URL for the Meta app: <span className="code">{base}/api/webhooks/whatsapp</span></p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2>Instagram</h2>
              {instagramConnected(shop) ? <span className="pill good">Connected</span> : <span className="pill gold">Not connected</span>}
            </div>
            <div className="panel-b">
              {instagramConnected(shop) ? (
                <form action={disconnect}><input type="hidden" name="which" value="instagram" />
                  <p className="small muted">Account ID {shop.igAccountId}</p>
                  <button className="btn ghost">Disconnect</button></form>
              ) : (
                <ActionForm action={connectInstagram}>
                  <p className="small muted">From your Meta app: Instagram &gt; API setup with Instagram login. Your account must be a Business or Creator account.</p>
                  <label className="field">Instagram account ID<input className="input" name="accountId" inputMode="numeric" required /></label>
                  <label className="field">Access token<input className="input" name="token" type="password" autoComplete="off" required /></label>
                  <Submit>Connect Instagram</Submit>
                </ActionForm>
              )}
              <p className="small muted">Webhook URL for the Meta app: <span className="code">{base}/api/webhooks/instagram</span>. Subscribe to <b>messages</b> and <b>comments</b>.</p>
              <p className="small muted">Post tip: &quot;Comment RESTOCK and we&apos;ll WhatsApp you when it&apos;s back.&quot; Oja DMs every commenter your waitlist link.</p>
            </div>
          </section>
        </>
      )}

      <form action={logout}><button className="btn block">Log out</button></form>
    </>
  );
}
