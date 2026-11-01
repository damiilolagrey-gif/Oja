"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { uniqueCode } from "@/lib/services/ads";
import { NEXT, PLATFORMS, validateCampaign, type CampaignState } from "@/lib/ads";
import { naira, toKobo } from "@/lib/format";
import type { FormState } from "@/components/ActionForm";

const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** Saves a new campaign as a draft with its own tracked link. Nothing is sent to an ad platform in test mode. */
export async function createCampaign(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("ads");
  const checked = validateCampaign({
    platform: str(data, "platform"),
    name: str(data, "name"),
    dailyBudget: str(data, "dailyBudget"),
    days: str(data, "days"),
    locations: data.getAll("locations").map(String),
    ageMin: str(data, "ageMin"),
    ageMax: str(data, "ageMax"),
  });
  if (!checked.ok) return { error: checked.error };

  const productId = str(data, "productId");
  const product = productId ? await db.product.findFirst({ where: { id: productId, shopId: user.shopId, archived: false } }) : null;
  if (productId && !product) return { error: "That product is no longer in your shop." };
  const creativeId = str(data, "creativeId");
  const creative = creativeId ? await db.adCreative.findFirst({ where: { id: creativeId, shopId: user.shopId } }) : null;
  if (creativeId && (!creative || (product && creative.productId !== product.id))) return { error: "Pick ad copy written for this product." };

  const v = checked.value;
  const campaign = await db.campaign.create({
    data: {
      shopId: user.shopId,
      platform: v.platform,
      productId: product?.id ?? null,
      creativeId: creative?.id ?? null,
      name: v.name,
      code: await uniqueCode(),
      dailyBudgetKobo: v.dailyBudgetKobo,
      days: v.days,
      locations: v.locations,
      ageMin: v.ageMin,
      ageMax: v.ageMax,
      createdById: user.id,
    },
  });
  await logActivity(user, "ads.create", `Set up the ${PLATFORMS[v.platform].short} campaign "${v.name}" at ${naira(v.dailyBudgetKobo)} a day`, { type: "campaign", id: campaign.id });
  redirect(`/app/ads/${campaign.id}`);
}

const MOVES = {
  start: { to: "ACTIVE", verb: "Started" },
  pause: { to: "PAUSED", verb: "Paused" },
  resume: { to: "ACTIVE", verb: "Resumed" },
  end: { to: "ENDED", verb: "Ended" },
} as const;

/** Start, pause, resume or end a campaign. */
export async function moveCampaign(data: FormData) {
  const user = await requirePermission("ads");
  const c = await db.campaign.findFirst({ where: { id: str(data, "id"), shopId: user.shopId } });
  const move = str(data, "move") as keyof typeof MOVES;
  if (!c || !(move in MOVES) || !NEXT[c.status as CampaignState].includes(move)) return;
  const { to, verb } = MOVES[move];
  const now = new Date();
  // Only move from the state we read, so two people pressing at once can't skip a step.
  await db.campaign.updateMany({
    where: { id: c.id, status: c.status },
    data: { status: to, ...(move === "start" ? { startedAt: now } : {}), ...(move === "end" ? { endedAt: now } : {}) },
  });
  await logActivity(user, `ads.${move}`, `${verb} the campaign "${c.name}"`, { type: "campaign", id: c.id });
  revalidatePath("/app/ads", "layout");
}

/** The total the shop has paid the platform for this campaign so far, from its ads manager or card statement. */
export async function recordSpend(_: FormState, data: FormData): Promise<FormState> {
  const user = await requirePermission("ads");
  const c = await db.campaign.findFirst({ where: { id: str(data, "id"), shopId: user.shopId } });
  if (!c) return { error: "Campaign not found" };
  const spendKobo = toKobo(str(data, "spend") || "0");
  if (!Number.isFinite(spendKobo) || spendKobo > 1_000_000_000_00) return { error: "Enter the amount in naira, like 15000." };
  await db.campaign.update({ where: { id: c.id }, data: { spendKobo } });
  await logActivity(user, "ads.spend", `Set spend on "${c.name}" to ${naira(spendKobo)}`, { type: "campaign", id: c.id });
  revalidatePath(`/app/ads/${c.id}`);
  return { ok: "Saved. Cost per chat and per order are updated." };
}
