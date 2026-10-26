"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { normalizeNigerianPhone } from "@/lib/phone";
import { createRecipient, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { requireAdmin, requireOwner } from "@/lib/session";
import { normalizeCac } from "@/lib/verification";
import { savePickup } from "@/lib/services/delivery";
import type { FormState } from "@/components/ActionForm";

export async function updateShop(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const name = String(data.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter your shop's name" };
  const rawPhone = String(data.get("whatsappNumber") ?? "").trim();
  const whatsappNumber = rawPhone ? normalizeNigerianPhone(rawPhone) : null;
  if (rawPhone && !whatsappNumber) return { error: "Enter your shop's WhatsApp number like 0803 123 4567" };
  await db.shop.update({
    where: { id: owner.shopId },
    data: {
      name,
      igHandle: String(data.get("igHandle") ?? "").trim().replace(/^@/, "") || null,
      bankDetails: String(data.get("bankDetails") ?? "").trim() || null,
      whatsappNumber,
    },
  });
  revalidatePath("/app", "layout");
  return { ok: "Shop details saved" };
}

export async function connectWhatsApp(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const phoneNumberId = String(data.get("phoneNumberId") ?? "").trim();
  const token = String(data.get("token") ?? "").trim();
  if (!/^\d{6,}$/.test(phoneNumberId)) return { error: "The phone number ID is the long number shown under WhatsApp > API setup" };
  if (token.length < 20) return { error: "Paste the full access token" };
  const taken = await db.shop.findFirst({ where: { waPhoneNumberId: phoneNumberId, NOT: { id: owner.shopId } } });
  if (taken) return { error: "That WhatsApp number is already connected to another shop" };
  await db.shop.update({ where: { id: owner.shopId }, data: { waPhoneNumberId: phoneNumberId, waTokenEnc: encrypt(token) } });
  revalidatePath("/app/settings");
  return { ok: "WhatsApp connected. Restock alerts and replies will now send for real." };
}

export async function connectInstagram(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const accountId = String(data.get("accountId") ?? "").trim();
  const token = String(data.get("token") ?? "").trim();
  if (!/^\d{6,}$/.test(accountId)) return { error: "Enter the Instagram account ID (numbers only)" };
  if (token.length < 20) return { error: "Paste the full access token" };
  const taken = await db.shop.findFirst({ where: { igAccountId: accountId, NOT: { id: owner.shopId } } });
  if (taken) return { error: "That Instagram account is already connected to another shop" };
  await db.shop.update({ where: { id: owner.shopId }, data: { igAccountId: accountId, igTokenEnc: encrypt(token) } });
  revalidatePath("/app/settings");
  return { ok: "Instagram connected. New DMs will appear in your inbox." };
}

export async function disconnect(data: FormData) {
  const owner = await requireOwner();
  const which = data.get("which");
  await db.shop.update({
    where: { id: owner.shopId },
    data: which === "whatsapp" ? { waPhoneNumberId: null, waTokenEnc: null } : { igAccountId: null, igTokenEnc: null },
  });
  revalidatePath("/app/settings");
}

/** Saves the bank account SafePay pays this shop into. The account name always comes from the bank lookup. */
export async function savePayoutAccount(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const [bankCode, bankName] = String(data.get("bank") ?? "").split("|");
  const accountNumber = String(data.get("accountNumber") ?? "").replace(/\D/g, "");
  if (!bankCode || !bankName) return { error: "Pick your bank" };
  if (!/^\d{10}$/.test(accountNumber)) return { error: "Account numbers are 10 digits" };
  if (!paystackConfigured()) {
    await db.shop.update({
      where: { id: owner.shopId },
      data: { payoutBankCode: bankCode, payoutBankName: bankName, payoutAccountNumber: accountNumber, payoutAccountName: "Not checked (test mode)", paystackRecipient: null },
    });
    revalidatePath("/app/settings");
    return { ok: "Saved in test mode. The name will be checked with your bank once payments go live." };
  }
  const resolved = await resolveAccount(accountNumber, bankCode);
  if (!resolved.ok) return { error: "Your bank couldn't find that account. Check the number and bank." };
  const name = resolved.data.account_name;
  const recipient = await createRecipient({ name, accountNumber, bankCode });
  if (!recipient.ok) return { error: `Couldn't set up payouts: ${recipient.error}` };
  await db.shop.update({
    where: { id: owner.shopId },
    data: { payoutBankCode: bankCode, payoutBankName: bankName, payoutAccountNumber: accountNumber, payoutAccountName: name, paystackRecipient: recipient.data.recipient_code },
  });
  revalidatePath("/app/settings");
  return { ok: `Payouts will go to ${name}.` };
}

export async function requestVerification(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const cacNumber = normalizeCac(String(data.get("cacNumber") ?? ""));
  const registeredName = String(data.get("registeredName") ?? "").trim();
  if (!cacNumber) return { error: "Enter the RC or BN number from your CAC certificate, e.g. RC 1234567" };
  if (registeredName.length < 3) return { error: "Enter the business name exactly as registered with CAC" };
  await db.shop.update({
    where: { id: owner.shopId },
    data: { cacNumber, registeredName, verificationRequestedAt: new Date(), businessVerifiedAt: null, verificationNote: null },
  });
  revalidatePath("/app/settings");
  return { ok: "Sent. We usually check within 2 working days." };
}

/** Oja staff approve or reject a shop's business verification after checking CAC's public register. */
export async function reviewVerification(_: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const shopId = String(data.get("shopId"));
  const approve = data.get("decision") === "approve";
  const note = String(data.get("note") ?? "").trim();
  if (!approve && !note) return { error: "Say why, so the shop knows what to fix" };
  await db.shop.update({
    where: { id: shopId },
    data: approve
      ? { businessVerifiedAt: new Date(), verificationRequestedAt: null, verificationNote: note || null }
      : { businessVerifiedAt: null, verificationRequestedAt: null, verificationNote: note },
  });
  revalidatePath("/app/admin");
  return { ok: approve ? "Approved" : "Rejected" };
}

export async function savePickupAddress(_: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const address = String(data.get("address") ?? "").trim();
  const city = String(data.get("city") ?? "").trim();
  const phone = normalizeNigerianPhone(String(data.get("phone") ?? ""));
  if (address.length < 8 || !city) return { error: "Add the full street address and city riders should come to." };
  if (!phone) return { error: "Add a phone number the rider can call, like 0803 123 4567." };
  const r = await savePickup(owner.shop, owner.email, { address, city, phone });
  revalidatePath("/app/settings");
  return r;
}
