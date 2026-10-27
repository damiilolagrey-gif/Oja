import { naira } from "./format";

/** Choices on the "Promote a product" form. Pure, shared by the page, the actions and tests. */
export const AREAS = ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Nigeria"] as const;
export const DAILY_BUDGETS_KOBO = [100_000, 200_000, 500_000, 1_000_000] as const; // ₦1,000 to ₦10,000 a day
export const DAYS = [3, 5, 7, 14] as const;

export const areaLabel = (a: string) => (a === "Nigeria" ? "All of Nigeria" : a);

/** Used when AI drafts are off. The shop edits it before launching. */
export function defaultCaption(product: string, priceKobo: number, area: string) {
  return `${product}, ${naira(priceKobo)}. Delivered ${area === "Nigeria" ? "anywhere in Nigeria" : `in ${area}`}.\nPay with Oja SafePay: your money is held until the item reaches you.`;
}

/** Sales per naira of ad spend, e.g. 4.2 means ₦4.20 of sales for each ₦1 spent. Null until ₦1 has been spent. */
export function returnOnSpend(salesKobo: number, spendKobo: number): number | null {
  return spendKobo >= 100 ? Math.round((salesKobo / spendKobo) * 10) / 10 : null;
}
