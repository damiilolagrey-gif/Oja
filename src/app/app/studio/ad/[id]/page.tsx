import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { LIMITS, orderLink, type AdCopy } from "@/lib/creative";
import { CopyButton } from "@/components/CopyButton";
import { deleteAd, saveDesign } from "@/app/actions/studio";
import { StudioNav } from "../../StudioNav";
import { AdMaker } from "../../AdMaker";
import { adView } from "../../view";

export const dynamic = "force-dynamic";

function Block({ title, text, limit }: { title: string; text: string; limit?: number }) {
  return (
    <div className="studio-block" data-copy>
      <div className="row between">
        <b className="small">{title}</b>
        <span className="row">{limit && <span className="hint num">{text.length}/{limit}</span>}<CopyButton text={text} /></span>
      </div>
      <p className="studio-text" data-copy-text>{text}</p>
    </div>
  );
}

export default async function Ad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("studio");
  const c = await db.adCreative.findFirst({ where: { id, shopId: user.shopId }, include: { product: { select: { name: true, priceKobo: true, imageUrl: true } } } });
  if (!c) notFound();
  const v = adView(c, user.shop.name);
  if (!v) notFound();
  const copy = c.copy as unknown as AdCopy;
  const link = c.productId && c.product
    ? orderLink(user.shop, { id: c.productId, name: c.product.name }, process.env.APP_URL ?? "")
    : user.shop.whatsappNumber
      ? `https://wa.me/${user.shop.whatsappNumber}?text=${encodeURIComponent(`Hi ${user.shop.name}, I'd like the ${v.item.name}`)}`
      : `${process.env.APP_URL ?? ""}/s/${user.shop.slug}`;

  return (
    <>
      <StudioNav on="studio" />
      <Link href="/app/studio" className="small">← Ad studio</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1>{c.angle}: {v.item.name}</h1>
        {c.prompt && <p className="muted small">From your idea: &ldquo;{c.prompt}&rdquo;</p>}
      </div>

      <section className="panel panel-b">
        <AdMaker id={c.id} design={v.design} item={v.item} photo={v.photo} save={saveDesign} />
      </section>

      <div className="row">
        {can(user.role, "ads") && c.productId && <Link className="btn primary" href={`/app/ads/new?product=${c.productId}&creative=${c.id}`}>Run as a campaign</Link>}
        <span className="row" data-copy style={{ flex: 1, minWidth: 0 }}><span className="code" data-copy-text style={{ flex: 1 }}>{link}</span><CopyButton text={link} label="Copy WhatsApp link" /></span>
      </div>
      {!c.productId && <p className="hint">Add this item to your products to run it as a tracked campaign and sell it with checkout in the chat.</p>}

      <section className="panel">
        <div className="panel-h"><h2>Captions</h2></div>
        <div className="panel-b">
          <Block title="Instagram caption" text={`${copy.instagram.caption}\n\n${copy.instagram.hashtags.join(" ")}`.trim()} />
          <Block title="Facebook primary text" text={copy.facebook.primaryText} limit={LIMITS.facebookPrimary} />
          <Block title="Facebook headline" text={copy.facebook.headline} limit={LIMITS.facebookHeadline} />
          <Block title="TikTok ad text" text={copy.tiktok.adText} limit={LIMITS.tiktokAdText} />
          <Block title="Google headlines" text={copy.google.headlines.join("\n")} />
          <Block title="Google descriptions" text={copy.google.descriptions.join("\n")} />
          <Block title="WhatsApp Status" text={copy.whatsappStatus} limit={LIMITS.whatsappStatus} />
        </div>
      </section>

      <form action={deleteAd}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="back" value="/app/studio" /><button className="btn ghost small">Delete this ad</button></form>
    </>
  );
}
