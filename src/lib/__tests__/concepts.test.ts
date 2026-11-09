import { describe, expect, it } from "vitest";
import { contrast, fitConcept, fitDesign, safeBadge, templateConcepts, themeFor } from "../concepts";

const shop = { name: "Asa Wears", slug: "asawears", whatsappNumber: "2348030000000", igHandle: "asawears" };
const dress = { id: "p1", name: "Adire maxi dress", priceKobo: 2_850_000, stock: 8, description: "Hand-dyed", options: ["8", "10", "12"] };
const facts = { stock: 8, prompt: "Owambe ad", brand: "#2f3b8f" };

describe("safeBadge", () => {
  it("keeps honest stickers", () => {
    expect(safeBadge("New in", facts)).toBe("New in");
    expect(safeBadge("Only 2 left", { ...facts, stock: 2 })).toBe("Only 2 left");
  });

  it("drops offers the vendor never made", () => {
    expect(safeBadge("50% off", facts)).toBeNull();
    expect(safeBadge("Free delivery", facts)).toBeNull();
    expect(safeBadge("Big sale", facts)).toBeNull();
  });

  it("allows an offer the vendor asked for in the prompt", () => {
    expect(safeBadge("Sale on now", { ...facts, prompt: "Black Friday sale ad" })).toBe("Sale on now");
  });

  it("drops numbers that aren't the real stock", () => {
    expect(safeBadge("Only 3 left", { ...facts, stock: 8 })).toBeNull();
    expect(safeBadge("Only 3 left", { ...facts, stock: null })).toBeNull();
    expect(safeBadge("", facts)).toBeNull();
  });
});

describe("fitDesign", () => {
  it("fixes unreadable text, bad colours, unknown styles and long words", () => {
    const d = fitDesign({ style: "neon" as never, headline: "x".repeat(80), bg: "#ffffff", ink: "#fefefe", accent: "nope", cta: "" }, facts);
    expect(d.style).toBe("bold");
    expect(d.headline.length).toBeLessThanOrEqual(40);
    expect(d.ink).toBe("#111111");
    expect(contrast(d.ink, d.bg)).toBeGreaterThanOrEqual(4.5);
    expect(d.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(d.cta).toBe("Order on WhatsApp");
  });

  it("falls back to the brand colour", () => {
    expect(fitDesign({ bg: "red" }, facts).bg).toBe("#2f3b8f");
  });

  it("keeps a good design as it is", () => {
    const good = { style: "festive" as const, headline: "Owambe ready", subline: "Adire maxi", cta: "Order now", badge: "New in", bg: "#5b1a2e", ink: "#ffffff", accent: "#e6b84a" };
    expect(fitDesign(good, facts)).toEqual(good);
  });
});

describe("templateConcepts", () => {
  it("reads the theme from the vendor's prompt", () => {
    expect(themeFor("Owambe ad, gold vibe")?.angle).toBe("Owambe");
    expect(themeFor("detty december promo")?.angle).toBe("December");
    expect(themeFor("gift for mum")?.angle).toBe("Gift");
    expect(themeFor("just an ad")).toBeNull();
  });

  it("makes three different, safe concepts with copy for every channel", () => {
    const cs = templateConcepts("Owambe ad, gold vibe", dress, shop, "#2f3b8f");
    expect(cs).toHaveLength(3);
    expect(cs[0].design.style).toBe("festive");
    expect(cs[0].design.headline).toBe("Owambe ready");
    expect(new Set(cs.map(c => c.design.style)).size).toBe(3);
    for (const c of cs) {
      expect(contrast(c.design.ink, c.design.bg)).toBeGreaterThanOrEqual(4.5);
      expect(c.copy.instagram.caption).toContain("₦28,500");
      expect(c.copy.google.headlines.every(h => h.length <= 30)).toBe(true);
    }
  });

  it("uses the real stock when few are left", () => {
    const cs = templateConcepts("ad", { ...dress, stock: 2 }, shop, "#2f3b8f");
    expect(cs[1].design.headline).toBe("Only 2 left");
    expect(cs[1].design.badge).toBe("Only 2 left");
  });
});

describe("fitConcept", () => {
  it("cleans AI output before it's saved", () => {
    const [c] = templateConcepts("ad", dress, shop, "#2f3b8f");
    const dirty = { ...c, angle: "", design: { ...c.design, badge: "70% OFF today" }, copy: { ...c.copy, tiktok: { adText: "🔥🔥 Buy now 🔥" } } };
    const clean = fitConcept(dirty, facts);
    expect(clean.angle).toBe("Ad");
    expect(clean.design.badge).toBeNull();
    expect(clean.copy.tiktok.adText).toBe("Buy now");
  });
});
