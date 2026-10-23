import { headers } from "next/headers";
import { requireUser } from "@/lib/session";
import { displayPhone } from "@/lib/phone";
import { instagramConnected, whatsappConnected } from "@/lib/meta";
import { ActionForm, Submit } from "@/components/ActionForm";
import { connectInstagram, connectWhatsApp, disconnect, updateShop } from "@/app/actions/settings";
import { logout } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requireUser();
  const shop = user.shop;
  const h = await headers();
  const base = process.env.APP_URL || `https://${h.get("host")}`;
  const isOwner = user.role === "OWNER";

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
