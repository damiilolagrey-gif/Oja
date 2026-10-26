import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePaystackEvent, verifyPaystackSignature, verifyTransaction } from "@/lib/paystack";
import { markPaid } from "@/lib/services/orders";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"), process.env.PAYSTACK_SECRET_KEY ?? "")) {
    return new Response("Bad signature", { status: 401 });
  }
  const ev = parsePaystackEvent(JSON.parse(raw));

  if (ev.kind === "charge") {
    // Trust Paystack's own record of the amount, not just the webhook body.
    const v = await verifyTransaction(ev.reference);
    if (v.ok && v.data.status === "success") await markPaid(ev.reference, v.data.amount);
  }
  if (ev.kind === "transfer") {
    await db.order.updateMany({
      where: { payoutRef: ev.reference },
      data: { payoutStatus: ev.status === "success" ? "success" : "failed" },
    });
  }
  if (ev.kind === "refund") {
    await db.order.updateMany({ where: { reference: ev.reference, status: "REFUNDED" }, data: { resolutionNote: "Refund processed by Paystack" } });
  }
  return NextResponse.json({ ok: true });
}
