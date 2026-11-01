import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { naira } from "@/lib/format";
import { aiConfigured } from "@/lib/ai";
import { LIMITS, orderLink, type AdCopy } from "@/lib/creative";
import { ActionForm, Submit } from "@/components/ActionForm";
import { CopyButton } from "@/components/CopyButton";
import { deleteAd, editAd, writeAds } from "@/app/actions/studio";
import { AdImage } from "../AdImage";

export const dynamic = "force-dynamic";

function Block({ title, text, limit }: { title: string; text: string; limit?: number }) {
  return (
    <div className="studio-block" data-copy>
      <div className="row between">
        <b className="small">{title}</b>
        <span className="row">
          {limit && <span className="hint num">{text.length}/{limit}</span>}
          <CopyButton text={text} />
        </span>
      </div>
      <p className="studio-text" data-copy-text>{text}</p>
    </div>
  );
}

export default async function StudioProduct({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const user = await requirePermission("studio");
  const p = await db.product.findFirst({
    where: { id: productId, shopId: user.shopId, archived: false },
    include: { creatives: { orderBy: { createdAt: "desc" }, take: 12 } },
  });
  if (!p) notFound();
  const shop = user.shop;
  const link = orderLink(shop, p, process.env.APP_URL ?? "");
  const ads = p.creatives.map(c => ({ ...c, copy: c.copy as unknown as AdCopy }));
  const headlines = [...new Set(ads.flatMap(a => [a.copy.facebook.headline, ...a.copy.google.headlines]))].slice(0, 12);

  return (
    <>
      <Link href="/app/studio" className="small">← Studio</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1>{p.name}</h1>
        <p className="muted num">{naira(p.priceKobo)} · {p.stock ? `${p.stock} in stock` : "Sold out"}</p>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>Where the ads send buyers</h2></div>
        <div className="panel-b" data-copy>
          <p className="small muted">{shop.whatsappNumber ? "A WhatsApp chat with your shop, with the product already typed in. Your AI assistant takes it from there." : "Your shop page for this product. Add your WhatsApp number in Settings to send buyers to a chat instead."}</p>
          <div className="row"><span className="code" data-copy-text style={{ wordBreak: "break-all" }}>{link}</span><CopyButton text={link} label="Copy link" /></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Ad image</h2></div>
        <div className="panel-b">
          <AdImage
            productId={p.id}
            hasPhoto={!!p.imageUrl}
            name={p.name}
            price={naira(p.priceKobo)}
            shopName={shop.name}
            stock={p.stock}
            brandColor={shop.brandColor ?? "#2f3b8f"}
            headlines={headlines.length ? headlines : [p.name]}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Ad captions</h2>{ads.length > 0 && <span className="pill plain">{ads.length} saved</span>}</div>
        <div className="panel-b">
          <ActionForm action={writeAds}>
            <input type="hidden" name="productId" value={p.id} />
            <label className="field">Anything to focus on? (optional)
              <input className="input" name="hint" maxLength={200} placeholder="e.g. Owambe season, gift for mum, back in stock" />
            </label>
            <Submit pendingText={aiConfigured() ? "Writing…" : "Preparing…"}>{ads.length ? "Write 3 more" : "Write 3 ads"}</Submit>
          </ActionForm>
        </div>
        <div className="list">
          {ads.map(a => (
            <article key={a.id} className="item stack">
              <div className="row between">
                <b>{a.angle}</b>
                <span className="row small muted">{a.source === "ai" ? "AI" : "Template"} · {a.createdAt.toLocaleDateString("en-NG")}</span>
              </div>
              <Block title="Instagram caption" text={`${a.copy.instagram.caption}\n\n${a.copy.instagram.hashtags.join(" ")}`.trim()} />
              <Block title="Facebook primary text" text={a.copy.facebook.primaryText} limit={LIMITS.facebookPrimary} />
              <Block title="Facebook headline" text={a.copy.facebook.headline} limit={LIMITS.facebookHeadline} />
              <Block title="TikTok ad text" text={a.copy.tiktok.adText} limit={LIMITS.tiktokAdText} />
              <Block title="Google headlines" text={a.copy.google.headlines.join("\n")} />
              <Block title="Google descriptions" text={a.copy.google.descriptions.join("\n")} />
              <Block title="WhatsApp Status" text={a.copy.whatsappStatus} limit={LIMITS.whatsappStatus} />
              <details>
                <summary className="btn small" style={{ display: "inline-flex" }}>Edit</summary>
                <ActionForm action={editAd}>
                  <input type="hidden" name="id" value={a.id} />
                  <label className="field">Instagram caption<textarea className="input" name="igCaption" rows={3} defaultValue={a.copy.instagram.caption} /></label>
                  <label className="field">Hashtags<input className="input" name="igHashtags" defaultValue={a.copy.instagram.hashtags.join(" ")} /></label>
                  <label className="field">Facebook primary text<textarea className="input" name="fbPrimary" rows={2} defaultValue={a.copy.facebook.primaryText} /></label>
                  <label className="field">Facebook headline<input className="input" name="fbHeadline" defaultValue={a.copy.facebook.headline} /></label>
                  <label className="field">TikTok ad text<input className="input" name="tiktok" defaultValue={a.copy.tiktok.adText} /></label>
                  <label className="field">Google headlines (one per line)<textarea className="input" name="gHeadlines" rows={3} defaultValue={a.copy.google.headlines.join("\n")} /></label>
                  <label className="field">Google descriptions (one per line)<textarea className="input" name="gDescriptions" rows={2} defaultValue={a.copy.google.descriptions.join("\n")} /></label>
                  <label className="field">WhatsApp Status<textarea className="input" name="status" rows={2} defaultValue={a.copy.whatsappStatus} /></label>
                  <Submit className="btn">Save changes</Submit>
                </ActionForm>
              </details>
              <form action={deleteAd}><input type="hidden" name="id" value={a.id} /><button className="btn ghost small">Delete this set</button></form>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
