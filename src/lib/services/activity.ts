import "server-only";
import { headers } from "next/headers";
import { db } from "../db";
import { deviceLabel } from "../permissions";

type Actor = { id: string; shopId: string };

/**
 * Writes one line to the shop's activity log. Never throws: a failed log line must not undo the action the
 * person just took, so errors are printed and swallowed.
 */
export async function logActivity(actor: Actor, action: string, summary: string, target?: { type: string; id: string }) {
  try {
    let device: string | null = null;
    let ip: string | null = null;
    try {
      const h = await headers();
      device = deviceLabel(h.get("user-agent"));
      ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    } catch {
      // Not inside a request (a script or cron): no device to record.
    }
    await db.activity.create({
      data: { shopId: actor.shopId, userId: actor.id, action, summary: summary.slice(0, 300), targetType: target?.type, targetId: target?.id, device, ip },
    });
  } catch (e) {
    console.error("activity log failed", action, e);
  }
}
