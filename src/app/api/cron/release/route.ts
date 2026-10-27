import { NextResponse } from "next/server";
import { sweep } from "@/lib/services/orders";
import { syncAds } from "@/lib/services/ads";

/** Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET" (see vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
  return NextResponse.json({ ...(await sweep()), ...(await syncAds()) });
}
