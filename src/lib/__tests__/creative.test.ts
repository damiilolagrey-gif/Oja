import { describe, expect, it } from "vitest";
import { clip, copyBrief, fitCopy, LIMITS, orderLink, stripEmoji, templateCopy, textOn, type AdCopy } from "../creative";
import { isPrivateAddress } from "../net";
import { can } from "../permissions";

const shop = { name: "Asa Wears", slug: "asawears", whatsappNumber: "2348031234567", igHandle: "asawears", brandVoice: null };
const maxi = { id: "p1", name: "Adire maxi dress", priceKobo: 2850000, stock: 3, description: "Hand-dyed in Abeokuta", options: ["8", "10", "12"] };

describe("orderLink", () => {
  it("opens WhatsApp with the product typed in", () => {
    expect(orderLink(shop, maxi, "https://oja.app")).toBe("https://wa.me/2348031234567?text=Hi%20Asa%20Wears%2C%20I'd%20like%20the%20Adire%20maxi%20dress");
  });
  it("falls back to the shop page without a WhatsApp number", () => {
    expect(orderLink({ ...shop, whatsappNumber: null }, maxi, "https://oja.app")).toBe("https://oja.app/s/asawears/buy/p1");
  });
});

describe("clip and fitCopy", () => {
  it("cuts at a word and drops trailing punctuation", () => {
    expect(clip("Order the adire maxi dress today, before it sells out", 30)).toBe("Order the adire maxi dress");
    expect(clip("  short  text ", 30)).toBe("short text");
  });
  it("keeps every field within its platform's limit", () => {
    const long = "word ".repeat(200);
    const c: AdCopy = {
      angle: "Big",
      instagram: { caption: long, hashtags: ["#One", "two words", "Three!", "#One", "", "a", "b", "c", "d", "e", "f"] },
      facebook: { primaryText: long, headline: long },
      tiktok: { adText: "🔥 Hot deal 🔥 " + long },
      google: { headlines: [long, "Same", "Same", "🔥 Fire", "a", "b", "c"], descriptions: [long, long + "x", "c"] },
      whatsappStatus: long,
    };
    const f = fitCopy(c);
    expect(f.instagram.caption.length).toBeLessThanOrEqual(LIMITS.instagramCaption);
    expect(f.instagram.hashtags).toEqual(["#One", "#twowords", "#Three", "#a", "#b", "#c", "#d", "#e"]);
    expect(f.facebook.primaryText.length).toBeLessThanOrEqual(125);
    expect(f.facebook.headline.length).toBeLessThanOrEqual(40);
    expect(f.tiktok.adText.startsWith("Hot deal")).toBe(true);
    expect(f.tiktok.adText.length).toBeLessThanOrEqual(100);
    expect(f.google.headlines).toHaveLength(5);
    expect(f.google.headlines.every(h => h.length <= 30)).toBe(true);
    expect(f.google.headlines).toContain("Fire");
    expect(f.google.descriptions).toHaveLength(2);
    expect(f.whatsappStatus.length).toBeLessThanOrEqual(140);
  });
  it("strips emoji", () => expect(stripEmoji("New 🔥 in ❤️ store")).toBe("New in store"));
});

describe("templateCopy", () => {
  const sets = templateCopy(maxi, shop);
  it("gives three angles with real price, stock and options", () => {
    expect(sets.map(s => s.angle)).toEqual(["Straight to the point", "Few left", "Safe to buy"]);
    expect(sets[0].instagram.caption).toContain("₦28,500");
    expect(sets[0].instagram.caption).toContain("Available in 8, 10, 12");
    expect(sets[1].facebook.headline).toBe("Only 3 left");
  });
  it("fits every limit", () => {
    for (const s of sets) expect(fitCopy(s)).toEqual(s);
  });
  it("doesn't claim scarcity when there's plenty", () => {
    expect(templateCopy({ ...maxi, stock: 40 }, shop)[1].angle).toBe("Treat yourself");
  });
});

describe("copyBrief", () => {
  it("passes the facts and the brand voice, and flags sold-out items", () => {
    const b = copyBrief({ ...maxi, stock: 0 }, { ...shop, brandVoice: "playful" }, "Owambe season");
    expect(b).toContain("Brand voice: playful");
    expect(b).toContain("Price: ₦28,500");
    expect(b).toContain("sold out");
    expect(b).toContain("Options: 8, 10, 12");
    expect(b).toContain("The owner wants this angle: Owambe season");
  });
});

describe("textOn", () => {
  it("picks readable text for the brand colour", () => {
    expect(textOn("#2f3b8f")).toBe("#ffffff");
    expect(textOn("#f5d76e")).toBe("#111111");
    expect(textOn("nope")).toBe("#ffffff");
  });
});

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])("blocks %s", ip =>
    expect(isPrivateAddress(ip)).toBe(true));
  it.each(["102.89.1.1", "8.8.8.8", "172.32.0.1", "2a00:1450:4001::1"])("allows %s", ip => expect(isPrivateAddress(ip)).toBe(false));
});

describe("studio permission", () => {
  it("is for owners and managers, not reps", () => {
    expect([can("OWNER", "studio"), can("MANAGER", "studio"), can("REP", "studio")]).toEqual([true, true, false]);
  });
});
