"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { normalizeNigerianPhone } from "@/lib/phone";
import { createRecipient, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { requireOwner } from "@/lib/session";
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
