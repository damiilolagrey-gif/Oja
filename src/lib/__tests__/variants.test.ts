import { describe, expect, it } from "vitest";
import { chooseVariant, itemName, optionsLine, parseOptions, restockReaches, totalStock, unitPrice } from "../variants";
import { buildBrief, checkCheckout, productCard, type AgentContext } from "../agent";
import { variantOutText } from "../stock";
import { planImport } from "../catalogue-import";

const v8 = { id: "v8", label: "Size 8", stock: 2, priceKobo: null };
const v10 = { id: "v10", label: "Size 10", stock: 0, priceKobo: null };
const v16 = { id: "v16", label: "Size 16", stock: 5, priceKobo: 3000000 };
const gone = { id: "vx", label: "Size 18", stock: 9, priceKobo: null, archived: true };
const options = [v8, v10, v16, gone];

describe("parseOptions", () => {
  it("splits on commas and new lines, trims and drops repeats", () => {
    expect(parseOptions(" 8, 10 ,\n12, 10\n\nsize  14 ")).toEqual({ labels: ["8", "10", "12", "size 14"], error: null });
    expect(parseOptions("Red, red, RED").labels).toEqual(["Red"]);
  });
  it("rejects empty, too long and too many", () => {
    expect(parseOptions(" , ").error).toMatch(/at least one/);
    expect(parseOptions("x".repeat(41)).error).toMatch(/under 40/);
    expect(parseOptions(Array.from({ length: 31 }, (_, i) => `S${i}`).join(",")).error).toMatch(/Up to 30/);
  });
});

describe("option helpers", () => {
  it("totals stock of options still on sale", () => expect(totalStock(options)).toBe(7));
  it("uses the option's price only when it has one", () => {
    expect(unitPrice(2850000, v16)).toBe(3000000);
    expect(unitPrice(2850000, v8)).toBe(2850000);
    expect(unitPrice(2850000, null)).toBe(2850000);
  });
  it("names the item with its option", () => {
    expect(itemName("Adire maxi", v8)).toBe("Adire maxi (Size 8)");
    expect(itemName("Adire maxi", null)).toBe("Adire maxi");
  });
  it("describes options for cards, leaving out removed ones", () => {
    expect(optionsLine(2850000, options)).toBe("Options: Size 8 (2 left), Size 10 sold out, Size 16 ₦30,000");
    expect(optionsLine(2850000, [])).toBeNull();
  });
  it("requires an option only when the product has them", () => {
    expect(chooseVariant([], undefined)).toEqual({ ok: true, variant: null });
    expect(chooseVariant(options, "v16")).toEqual({ ok: true, variant: v16 });
    expect(chooseVariant(options, "vx")).toEqual({ ok: false, error: "Ask which option they want: Size 8, Size 10, Size 16." });
    expect(chooseVariant(options, undefined).ok).toBe(false);
  });
  it("alerts buyers who wanted this option or any option", () => {
    expect(restockReaches(null, "v10")).toBe(true);
    expect(restockReaches("v10", "v10")).toBe(true);
    expect(restockReaches("v8", "v10")).toBe(false);
    expect(restockReaches("v8", null)).toBe(true);
  });
  it("writes the owner's alert when some options sell out", () => {
    expect(variantOutText({ product: "Adire maxi", options: ["Size 10"], stockLeft: 7, link: "L" })).toBe("Adire maxi: Size 10 is sold out. 7 left in other options. Restock here: L");
    expect(variantOutText({ product: "Adire maxi", options: ["8", "10", "12"], stockLeft: 1, link: "L" })).toBe("Adire maxi: 8, 10 and 12 are sold out. 1 left in other options. Restock here: L");
  });
});

describe("the AI agent with options", () => {
  const product = { id: "p1", stock: 7, archived: false, variants: options };
  const good = { product_id: "p1", quantity: 1, name: "Ada Obi", address: "12 Admiralty Way, Lekki Phase 1", city: "Lagos" };
  it("asks which option before checkout", () => {
    expect(checkCheckout(good, product, "2348031234567")).toEqual({ ok: false, error: "Ask which option they want: Size 8, Size 10, Size 16." });
  });
  it("checks the option's own stock", () => {
    expect(checkCheckout({ ...good, variant_id: "v10" }, product, "2348031234567")).toMatchObject({ ok: false, error: expect.stringMatching(/Size 10 is sold out/) });
    expect(checkCheckout({ ...good, variant_id: "v8", quantity: 3 }, product, "2348031234567")).toMatchObject({ ok: false, error: expect.stringMatching(/Only 2/) });
    expect(checkCheckout({ ...good, variant_id: "v16" }, product, "2348031234567")).toMatchObject({ ok: true, variant: v16 });
  });
  it("lists option ids and stock in the brief, and options on the card", () => {
    const ctx: AgentContext = {
      shopName: "Asa Wears", channel: "WHATSAPP", buyerName: "Ada", buyerWaPhone: null, notes: null, buyerFeeKobo: 30000,
      products: [{ id: "p1", name: "Adire maxi", priceKobo: 2850000, stock: 7, description: null, hasImage: false, options }],
      orders: [], waitlisted: [], messages: [{ from: "buyer", text: "Do you have size 10?" }],
    };
    const brief = buildBrief(ctx);
    expect(brief).toContain("option id v10: Size 10, SOLD OUT");
    expect(brief).toContain("option id v16: Size 16, ₦30,000, 5 in stock");
    expect(brief).not.toContain("Size 18");
    expect(productCard({ id: "p1", name: "Adire maxi", priceKobo: 2850000, stock: 7, description: null, options }).body).toContain("Options: Size 8 (2 left)");
  });
});

describe("spreadsheet upload and options", () => {
  it("won't overwrite the total stock of a product with options", () => {
    const existing = [{ id: "p1", name: "Adire maxi", priceKobo: 2850000, stock: 7, imageUrl: null, description: null, lowStockAt: 3, waiting: 0, hasOptions: true }];
    expect(planImport("Name,Stock\nAdire maxi,20", existing).errors[0].message).toMatch(/per option/);
    expect(planImport("Name,Price\nAdire maxi,30000", existing).rows[0]).toMatchObject({ kind: "update", changes: { priceKobo: 3000000 } });
  });
});
