import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, buildBrief, checkCheckout, productCard, wantsHuman, type AgentContext } from "../agent";
import { alertText, nextAlert, stockLevel } from "../stock";
import { instagramCardPayload, parseInstagramWebhook, parseWhatsAppWebhook, whatsappButtonsPayload } from "../meta";

const product = { id: "p1", stock: 5, archived: false };
const good = { product_id: "p1", quantity: 2, name: "Ada Obi", address: "12 Admiralty Way, Lekki Phase 1", city: "Lagos" };

describe("checkCheckout", () => {
  it("accepts a complete order and uses the chat's WhatsApp number", () => {
    expect(checkCheckout(good, product, "2348031234567")).toEqual({
      ok: true, quantity: 2, name: "Ada Obi", address: good.address, city: "Lagos", phone: "2348031234567",
    });
  });
  it("prefers a phone the buyer gave, normalised", () => {
    const r = checkCheckout({ ...good, phone: "0803 999 8888" }, product, null);
    expect(r.ok && r.phone).toBe("2348039998888");
  });
  it("needs a phone on Instagram", () => {
    expect(checkCheckout(good, product, null)).toMatchObject({ ok: false, error: expect.stringMatching(/phone/) });
  });
  it("refuses products outside the shop or archived", () => {
    expect(checkCheckout(good, null, "234803")).toMatchObject({ ok: false });
    expect(checkCheckout(good, { ...product, archived: true }, "234803")).toMatchObject({ ok: false });
  });
  it("refuses more than is in stock, and sold-out items", () => {
    expect(checkCheckout({ ...good, quantity: 6 }, product, "2348031234567")).toMatchObject({ ok: false, error: expect.stringMatching(/Only 5/) });
    expect(checkCheckout(good, { ...product, stock: 0 }, "2348031234567")).toMatchObject({ ok: false, error: expect.stringMatching(/restock/) });
  });
  it.each([0, -1, 1.5, 21, "two"])("refuses quantity %s", q => {
    expect(checkCheckout({ ...good, quantity: q }, product, "2348031234567").ok).toBe(false);
  });
  it("asks for a real address and city", () => {
    expect(checkCheckout({ ...good, address: "Lekki" }, product, "2348031234567")).toMatchObject({ ok: false, error: expect.stringMatching(/address/) });
    expect(checkCheckout({ ...good, city: "" }, product, "2348031234567")).toMatchObject({ ok: false, error: expect.stringMatching(/city/) });
  });
});

describe("wantsHuman", () => {
  it.each(["Can I talk to a person?", "I want customer care", "speak with your oga", "Are you a human?", "please call me"])("hands over on %s", t =>
    expect(wantsHuman(t)).toBe(true));
  it.each(["How much is the dress?", "Is delivery agent coming today?", "I'll take 2"])("keeps the agent on %s", t =>
    expect(wantsHuman(t)).toBe(false));
});

describe("productCard", () => {
  it("offers Buy now for in-stock items and shows scarcity", () => {
    const c = productCard({ id: "p1", name: "Adire maxi", priceKobo: 2850000, stock: 2, description: null });
    expect(c.buttons.map(b => b.title)).toEqual(["Buy now", "Ask a question"]);
    expect(c.body).toContain("Only 2 left");
    expect(c.body).toContain("₦28,500");
  });
  it("offers Notify me for sold-out items", () => {
    const c = productCard({ id: "p1", name: "Adire maxi", priceKobo: 2850000, stock: 0, description: "Sizes 8 to 16" });
    expect(c.buttons[0]).toEqual({ id: "notify:p1", title: "Notify me" });
    expect(c.body).toContain("Sizes 8 to 16");
  });
  it("keeps every button title within WhatsApp's 20 characters", () => {
    for (const stock of [0, 9]) {
      for (const b of productCard({ id: "x", name: "n", priceKobo: 100, stock, description: null }).buttons) expect(b.title.length).toBeLessThanOrEqual(20);
    }
  });
});

describe("buildBrief", () => {
  const ctx: AgentContext = {
    shopName: "Asa Wears", channel: "WHATSAPP", buyerName: "Ada", buyerWaPhone: "2348031234567", notes: "Lagos delivery ₦2,500",
    buyerFeeKobo: 30000,
    products: [
      { id: "p1", name: "Adire maxi", priceKobo: 2850000, stock: 4, description: null, hasImage: true },
      { id: "p2", name: "Kaftan", priceKobo: 1500000, stock: 0, description: null, hasImage: false },
    ],
    orders: [{ reference: "oja_1", itemName: "Kaftan", status: "SHIPPED", totalKobo: 1530000, trackingLink: "https://x/o/t", payLink: null }],
    waitlisted: ["Kaftan"],
    messages: [{ from: "buyer", text: "Hi, is the maxi available?" }],
  };
  const brief = buildBrief(ctx);
  it("lists live stock, sold-out items and the fee", () => {
    expect(brief).toContain("id p1: Adire maxi, ₦28,500, 4 in stock");
    expect(brief).toContain("id p2: Kaftan, ₦15,000, SOLD OUT");
    expect(brief).toContain("Buyer protection fee per order: ₦300");
  });
  it("includes the owner's notes, the buyer's orders and the chat", () => {
    expect(brief).toContain("Lagos delivery ₦2,500");
    expect(brief).toContain("oja_1: Kaftan");
    expect(brief).toContain("Already waiting for: Kaftan");
    expect(brief).toContain("Ada: Hi, is the maxi available?");
  });
});

describe("agent tools", () => {
  it("declares the four tools with required fields", () => {
    expect(AGENT_TOOLS.map(t => t.name)).toEqual(["show_product", "create_checkout", "join_waitlist", "hand_over"]);
    expect(AGENT_TOOLS[1].input_schema.required).toEqual(["product_id", "quantity", "name", "address", "city"]);
  });
});

describe("stock alerts", () => {
  it("classifies stock against the threshold", () => {
    expect(stockLevel(10, 3)).toBe("ok");
    expect(stockLevel(3, 3)).toBe("low");
    expect(stockLevel(0, 3)).toBe("out");
  });
  it("alerts once when low, once when out, and resets after restock", () => {
    let last: string | null = null;
    const step = (stock: number) => {
      const r = nextAlert(stockLevel(stock, 3), last);
      last = r.remember;
      return r.send;
    };
    expect([step(10), step(3), step(2), step(0), step(0), step(2), step(8), step(3)]).toEqual([null, "low", null, "out", null, null, null, "low"]);
  });
  it("writes the alert with the waitlist count", () => {
    expect(alertText({ shopName: "Asa Wears", product: "Kaftan", stock: 0, waiting: 12, level: "out", link: "L" }))
      .toBe("Kaftan is out of stock at Asa Wears. 12 customers are waiting for it. Restock it here: L");
    expect(alertText({ shopName: "Asa Wears", product: "Kaftan", stock: 2, waiting: 0, level: "low", link: "L" }))
      .toBe("Kaftan is running low at Asa Wears: 2 left. Restock it here: L");
  });
});

describe("chat cards", () => {
  it("builds a WhatsApp button message with an image header", () => {
    const p = whatsappButtonsPayload("234803", "body", [{ id: "buy:p1", title: "Buy now, it's lovely really" }], "https://img");
    expect(p.interactive.header).toEqual({ type: "image", image: { link: "https://img" } });
    expect(p.interactive.action.buttons[0].reply).toEqual({ id: "buy:p1", title: "Buy now, it's lovely" });
  });
  it("builds an Instagram generic template", () => {
    const p = instagramCardPayload("ig1", "Adire maxi", "₦28,500", [{ id: "buy:p1", title: "Buy now" }], null);
    const el = p.message.attachment.payload.elements[0];
    expect(el.buttons).toEqual([{ type: "postback", title: "Buy now", payload: "buy:p1" }]);
    expect(el).not.toHaveProperty("image_url");
  });
  it("reads a WhatsApp button tap as the button's words", () => {
    const { messages } = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "1" },
        messages: [{ from: "234803", id: "w1", timestamp: "1767225600", type: "interactive", interactive: { button_reply: { title: "Buy now" } } }],
      } }] }],
    });
    expect(messages[0].text).toBe("Buy now");
  });
  it("reads an Instagram card tap (postback) as a DM", () => {
    const evs = parseInstagramWebhook({
      entry: [{ id: "shop", messaging: [{ sender: { id: "buyer" }, timestamp: 1767225600000, postback: { mid: "m1", title: "Notify me", payload: "notify:p2" } }] }],
    });
    expect(evs).toEqual([{ kind: "dm", igAccountId: "shop", from: "buyer", text: "Notify me", id: "m1", at: new Date(1767225600000) }]);
  });
});
