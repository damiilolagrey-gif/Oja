import { NextResponse } from "next/server";
import { parseShipbubbleEvent, verifyShipbubbleSignature } from "@/lib/shipbubble";
import { onShipmentEvent } from "@/lib/services/delivery";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyShipbubbleSignature(raw, req.headers.get("x-ship-signature"), process.env.SHIPBUBBLE_API_KEY ?? "")) {
    return new Response("Bad signature", { status: 401 });
  }
  const ev = parseShipbubbleEvent(JSON.parse(raw));
  if (ev.kind === "shipment") await onShipmentEvent(ev);
  return NextResponse.json({ ok: true });
}
