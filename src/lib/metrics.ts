import { minutesBetween } from "./format";

export type ConvForMetrics = {
  repId: string | null;
  status: "OPEN" | "WON" | "LOST";
  source: "ORGANIC" | "ALERT";
  startedAt: Date;
  firstReplyAt: Date | null;
  amountKobo: number | null;
};

export type RepStats = {
  chats: number;
  avgFirstReplyMin: number | null;
  missed: number;
  waitingNow: number;
  won: number;
  closeRate: number;
  revenueKobo: number;
};

/** Minutes the buyer has been waiting for a first reply, or null if answered or closed. */
export function waitingMinutes(c: Pick<ConvForMetrics, "status" | "firstReplyAt" | "startedAt">, now: Date): number | null {
  return c.firstReplyAt == null && c.status === "OPEN" ? minutesBetween(c.startedAt, now) : null;
}

/** A chat is missed when its first reply came (or still hasn't come) after the shop's limit. */
export function isMissed(c: ConvForMetrics, now: Date, limitMin: number): boolean {
  if (c.firstReplyAt) return minutesBetween(c.startedAt, c.firstReplyAt) > limitMin;
  return c.status === "OPEN" && minutesBetween(c.startedAt, now) > limitMin;
}

export function repStats(convs: ConvForMetrics[], now: Date, limitMin: number): RepStats {
  const replied = convs.filter(c => c.firstReplyAt);
  const won = convs.filter(c => c.status === "WON");
  return {
    chats: convs.length,
    avgFirstReplyMin: replied.length
      ? replied.reduce((s, c) => s + minutesBetween(c.startedAt, c.firstReplyAt!), 0) / replied.length
      : null,
    missed: convs.filter(c => isMissed(c, now, limitMin)).length,
    waitingNow: convs.filter(c => waitingMinutes(c, now) != null).length,
    won: won.length,
    closeRate: convs.length ? won.length / convs.length : 0,
    revenueKobo: won.reduce((s, c) => s + (c.amountKobo ?? 0), 0),
  };
}

export function recoveredByAlerts(convs: ConvForMetrics[]): { orders: number; kobo: number } {
  const won = convs.filter(c => c.source === "ALERT" && c.status === "WON");
  return { orders: won.length, kobo: won.reduce((s, c) => s + (c.amountKobo ?? 0), 0) };
}
