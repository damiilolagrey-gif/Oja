import { describe, expect, it } from "vitest";
import { BUDGET, CODE_LENGTH, NEXT, campaignLink, newCode, parseRef, placesLine, results, validateCampaign, verdict } from "../ads";
import { can } from "../permissions";

const shop = { name: "Asa Wears", slug: "asa-wears", whatsappNumber: "2348031234567", igHandle: "asawears" };
const good = { platform: "META", name: "Adire December", dailyBudget: "3,000", days: "7", locations: ["Lagos"], ageMin: "18", ageMax: "45" };

describe("campaign codes", () => {
  it("are 6 characters with no look-alike letters", () => {
    let i = 0;
    const code = newCode(n => i++ % n);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(code).not.toMatch(/[01OIL]/);
    expect(code).toMatch(/[2-9]$/);
    expect(parseRef(`ref ${code}`)).toBe(code);
  });

  it("are found in a buyer's first message", () => {
    expect(parseRef("Hi Asa Wears, I'd like the Adire maxi dress (ref K7Q2M4)")).toBe("K7Q2M4");
    expect(parseRef("hello ref: k7q2m4 please")).toBe("K7Q2M4");
    expect(parseRef("Ref#K7Q2M4")).toBe("K7Q2M4");
  });

  it("are not found in ordinary messages", () => {
    expect(parseRef("I'd like a refund")).toBeNull();
    expect(parseRef("my reference is 123456")).toBeNull();
    expect(parseRef("ref K7Q2M49")).toBeNull(); // too long
    expect(parseRef("ref K7Q2M0")).toBeNull(); // 0 isn't used
    expect(parseRef("ref thanks")).toBeNull(); // codes end in a digit
    expect(parseRef("refK7Q2M4")).toBeNull();
  });
});

describe("campaignLink", () => {
  it("opens WhatsApp with the product and code typed", () => {
    const link = campaignLink(shop, { id: "p1", name: "Adire maxi dress" }, "K7Q2M4", "https://oja.app");
    expect(link.startsWith("https://wa.me/2348031234567?text=")).toBe(true);
    const text = decodeURIComponent(link.split("text=")[1]);
    expect(text).toBe("Hi Asa Wears, I'd like the Adire maxi dress (ref K7Q2M4)");
    expect(parseRef(text)).toBe("K7Q2M4");
  });

  it("falls back to the checkout page with the code when there's no WhatsApp number", () => {
    expect(campaignLink({ ...shop, whatsappNumber: null }, { id: "p1", name: "Dress" }, "K7Q2M4", "https://oja.app")).toBe("https://oja.app/s/asa-wears/buy/p1?c=K7Q2M4");
    expect(campaignLink({ ...shop, whatsappNumber: null }, null, "K7Q2M4", "https://oja.app")).toBe("https://oja.app/s/asa-wears?c=K7Q2M4");
  });

  it("works for a whole-shop campaign", () => {
    const text = decodeURIComponent(campaignLink(shop, null, "K7Q2M4", "").split("text=")[1]);
    expect(text).toBe("Hi Asa Wears, I saw your ad (ref K7Q2M4)");
  });
});

describe("validateCampaign", () => {
  it("accepts a normal campaign and reads naira with commas", () => {
    const r = validateCampaign(good);
    expect(r.ok && r.value).toMatchObject({ platform: "META", dailyBudgetKobo: 300_000, days: 7, locations: ["Lagos"], ageMin: 18, ageMax: 45 });
  });

  it.each([
    [{ platform: "SNAPCHAT" }, "Pick where"],
    [{ name: " " }, "name"],
    [{ dailyBudget: "500" }, "at least ₦1,000"],
    [{ dailyBudget: "abc" }, "at least"],
    [{ dailyBudget: String(BUDGET.maxKobo / 100 + 1) }, "up to"],
    [{ days: "0" }, "1 to 60"],
    [{ days: "61" }, "1 to 60"],
    [{ days: "2.5" }, "1 to 60"],
    [{ locations: ["Accra"] }, "isn't a Nigerian state"],
    [{ ageMin: "13" }, "between 18 and 65"],
    [{ ageMin: "40", ageMax: "30" }, "above the oldest"],
  ])("rejects %o", (change, message) => {
    const r = validateCampaign({ ...good, ...change });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(message);
  });

  it("treats no states as all of Nigeria and drops repeats", () => {
    const r = validateCampaign({ ...good, locations: ["Lagos", "Lagos", ""] });
    expect(r.ok && r.value.locations).toEqual(["Lagos"]);
    expect(placesLine([])).toBe("All of Nigeria");
    expect(placesLine(["Lagos", "Oyo", "Ogun", "Rivers", "Edo"])).toBe("Lagos, Oyo, Ogun and 2 more");
  });
});

describe("results", () => {
  it("leaves cost figures empty until spend is known", () => {
    const r = results({ chats: 12, orders: 3, revenueKobo: 8_550_000, spendKobo: 0 });
    expect(r.costPerChatKobo).toBeNull();
    expect(r.costPerOrderKobo).toBeNull();
    expect(r.returnOnSpend).toBeNull();
    expect(r.chatToOrder).toBe(0.25);
    expect(verdict(r)).toBe("12 chats and 3 orders worth ₦85,500. Add what you've spent to see the cost per order.");
  });

  it("works out cost per chat, per order and money back", () => {
    const r = results({ chats: 10, orders: 2, revenueKobo: 6_000_000, spendKobo: 1_500_000 });
    expect(r.costPerChatKobo).toBe(150_000);
    expect(r.costPerOrderKobo).toBe(750_000);
    expect(r.returnOnSpend).toBe(4);
    expect(verdict(r)).toBe("10 chats and 2 orders worth ₦60,000: ₦4 back for every ₦1 spent.");
  });

  it("counts only chats that bought, not checkout-link orders, in the chat rate", () => {
    expect(results({ chats: 1, orders: 2, revenueKobo: 0, spendKobo: 0, chatOrders: 1 }).chatToOrder).toBe(1);
    expect(results({ chats: 4, orders: 3, revenueKobo: 0, spendKobo: 0, chatOrders: 1 }).chatToOrder).toBe(0.25);
  });

  it("says plainly when an ad has brought nothing yet, or less than it cost", () => {
    expect(verdict(results({ chats: 0, orders: 0, revenueKobo: 0, spendKobo: 0 }))).toBe("No chats from this ad yet.");
    expect(verdict(results({ chats: 1, orders: 0, revenueKobo: 0, spendKobo: 500_000 }))).toContain("less back than you spent");
  });
});

describe("campaign states", () => {
  it("only allows sensible moves", () => {
    expect(NEXT.DRAFT).toEqual(["start", "end"]);
    expect(NEXT.ACTIVE).toEqual(["pause", "end"]);
    expect(NEXT.PAUSED).toEqual(["resume", "end"]);
    expect(NEXT.ENDED).toEqual([]);
  });
});

describe("ads permission", () => {
  it("is for owners and managers, not sales reps", () => {
    expect(can("OWNER", "ads")).toBe(true);
    expect(can("MANAGER", "ads")).toBe(true);
    expect(can("REP", "ads")).toBe(false);
  });
});
