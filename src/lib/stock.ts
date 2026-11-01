/** Stock alert rules. Pure functions only, so they can be unit tested without a database. */

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(stock: number, lowStockAt: number): StockLevel {
  if (stock <= 0) return "out";
  if (stock <= lowStockAt) return "low";
  return "ok";
}

/**
 * Decides whether to alert the owner, given the new level and the last alert sent for this product.
 * One "low" alert per drop and one "out" alert; going back above the threshold resets it.
 */
export function nextAlert(level: StockLevel, lastAlert: string | null): { send: "low" | "out" | null; remember: string | null } {
  if (level === "ok") return { send: null, remember: null };
  if (level === "out") return lastAlert === "out" ? { send: null, remember: "out" } : { send: "out", remember: "out" };
  // low
  // Already warned (low, or out and now partly restocked): stay quiet until it is back above the threshold.
  if (lastAlert === "low" || lastAlert === "out") return { send: null, remember: "low" };
  return { send: "low", remember: "low" };
}

export function alertText(p: { shopName: string; product: string; stock: number; waiting: number; level: "low" | "out"; link: string }): string {
  const head =
    p.level === "out"
      ? `${p.product} is out of stock at ${p.shopName}.`
      : `${p.product} is running low at ${p.shopName}: ${p.stock} left.`;
  const waiting = p.waiting ? ` ${p.waiting} customer${p.waiting === 1 ? " is" : "s are"} waiting for it.` : "";
  return `${head}${waiting} Restock it here: ${p.link}`;
}

/** When some options of a product sell out but others are left. */
export function variantOutText(p: { product: string; options: string[]; stockLeft: number; link: string }): string {
  const which = p.options.length === 1 ? p.options[0] : `${p.options.slice(0, -1).join(", ")} and ${p.options[p.options.length - 1]}`;
  return `${p.product}: ${which} ${p.options.length === 1 ? "is" : "are"} sold out. ${p.stockLeft} left in other options. Restock here: ${p.link}`;
}
