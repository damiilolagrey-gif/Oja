import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { StudioNav } from "../../studio/StudioNav";
import { CampaignForm } from "./CampaignForm";

export const dynamic = "force-dynamic";

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ product?: string; creative?: string }> }) {
  const user = await requirePermission("ads");
  const { product, creative } = await searchParams;
  const [products, creatives] = await Promise.all([
    db.product.findMany({ where: { shopId: user.shopId, archived: false }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, stock: true } }),
    db.adCreative.findMany({ where: { shopId: user.shopId }, orderBy: { createdAt: "desc" }, select: { id: true, productId: true, angle: true, source: true } }),
  ]);
  const start = products.find(p => p.id === product)?.id ?? "";

  return (
    <>
      <StudioNav on="ads" />
      <Link href="/app/ads" className="small">← Campaigns</Link>
      <h1>New campaign</h1>
      <CampaignForm
        products={products}
        creatives={creatives}
        startProduct={start}
        startCreative={creatives.find(c => c.id === creative && c.productId === start)?.id ?? ""}
      />
    </>
  );
}
