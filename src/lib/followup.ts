/**
 * A chat needs a follow-up when the shop spoke last and the buyer went quiet for a few hours, but it is still
 * inside the 24 hours after the buyer's last message: after that, WhatsApp and Instagram won't deliver a free reply.
 */
export const FOLLOW_UP_AFTER_HOURS = 3;
export const WINDOW_HOURS = 24;

export function followUpDue(
  c: { status: string; lastBuyerAt: Date; messages: { direction: string; createdAt: Date }[] },
  now: Date,
): { due: boolean; hoursLeft: number } {
  const last = c.messages[c.messages.length - 1];
  const hoursLeft = WINDOW_HOURS - (now.getTime() - c.lastBuyerAt.getTime()) / 3600_000;
  if (c.status !== "OPEN" || !last || last.direction !== "OUT" || hoursLeft <= 0) return { due: false, hoursLeft };
  const quietHours = (now.getTime() - last.createdAt.getTime()) / 3600_000;
  return { due: quietHours >= FOLLOW_UP_AFTER_HOURS, hoursLeft };
}
