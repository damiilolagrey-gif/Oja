export const PERIODS = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" } as const;
export type Period = keyof typeof PERIODS;

export const periodFrom = (raw: string | undefined): Period => (raw === "7d" || raw === "30d" ? raw : "today");

/** Start of the period; "today" is midnight in Lagos. */
export function periodStart(p: Period, now: Date) {
  if (p === "today") {
    const lagos = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    return new Date(now.getTime() - (lagos.getHours() * 60 + lagos.getMinutes()) * 60000);
  }
  return new Date(now.getTime() - (p === "7d" ? 7 : 30) * 24 * 3600 * 1000);
}
