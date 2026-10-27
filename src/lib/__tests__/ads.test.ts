import { describe, expect, it } from "vitest";
import { adSetBody, creativeBody, endDate, normalizeAdAccountId, parseInsights, simulatedSpend, type AdPlan } from "../metaAds";
import { defaultCaption, returnOnSpend } from "../ads";

const start = new Date("2026-10-27T09:00:00Z");
const plan: AdPlan = {
  name: "Oja · Ankara dress",
  platforms: ["facebook", "instagram"],
  dailyKobo: 200_000,
  start,
  end: endDate(start, 7),
  geo: { cities: [{ key: "2420605", radius: 40, distance_unit: "kilometer" }] },
  link: "https://oja.app/s/asa/buy/p1?ad=a1",
  message: "Ankara wrap dress, ₦18,500",
  pictureUrl: "https://img.example/dress.jpg",
};

describe("normalizeAdAccountId", () => {
  it("accepts the forms Ads Manager shows", () => {
    expect(normalizeAdAccountId("act_1234567890")).toBe("1234567890");
    expect(normalizeAdAccountId(" 1234567890 ")).toBe("1234567890");
    expect(normalizeAdAccountId("ACT_123 456 7890")).toBe("1234567890");
  });
  it("rejects anything else", () => {
    expect(normalizeAdAccountId("my shop")).toBeNull();
    expect(normalizeAdAccountId("12")).toBeNull();
  });
});

describe("ad set body", () => {
  const b = adSetBody("c1", plan);
  it("sends the budget in kobo and the run dates", () => {
    expect(b.daily_budget).toBe(200_000);
    expect(b.campaign_id).toBe("c1");
    expect(new Date(b.end_time).getTime() - new Date(b.start_time).getTime()).toBe(7 * 24 * 3600_000);
  });
  it("targets the chosen places and platforms only", () => {
    expect(b.targeting.geo_locations).toEqual(plan.geo);
    expect(b.targeting.publisher_platforms).toEqual(["facebook", "instagram"]);
    expect(b.targeting.targeting_automation.advantage_audience).toBe(0);
  });
});

describe("creative body", () => {
  it("links to the Pay safely page with a Shop now button", () => {
    const c = creativeBody("page1", "ig1", plan);
    expect(c.object_story_spec.page_id).toBe("page1");
    expect(c.object_story_spec.instagram_user_id).toBe("ig1");
    expect(c.object_story_spec.link_data.link).toBe(plan.link);
    expect(c.object_story_spec.link_data.call_to_action).toEqual({ type: "SHOP_NOW", value: { link: plan.link } });
    expect(c.object_story_spec.link_data.picture).toBe(plan.pictureUrl);
  });
  it("leaves out Instagram when it isn't chosen or connected", () => {
    expect(creativeBody("page1", "ig1", { ...plan, platforms: ["facebook"] }).object_story_spec).not.toHaveProperty("instagram_user_id");
    expect(creativeBody("page1", null, plan).object_story_spec).not.toHaveProperty("instagram_user_id");
  });
  it("skips the picture when the product has none", () => {
    expect(creativeBody("page1", null, { ...plan, pictureUrl: null }).object_story_spec.link_data).not.toHaveProperty("picture");
  });
});

describe("insights", () => {
  it("turns Meta's naira strings into kobo and counts", () => {
    expect(parseInsights({ data: [{ spend: "1234.56", impressions: "8000", clicks: "95" }] })).toEqual({ spendKobo: 123456, impressions: 8000, clicks: 95 });
  });
  it("reads no rows as nothing spent", () => {
    expect(parseInsights({ data: [] })).toEqual({ spendKobo: 0, impressions: 0, clicks: 0 });
  });
});

describe("test-mode spend", () => {
  const c = { dailyKobo: 200_000, startAt: start, endAt: endDate(start, 3) };
  it("is the daily budget pro rata", () => {
    expect(simulatedSpend(c, new Date(start.getTime() + 12 * 3600_000))).toBe(100_000);
  });
  it("stops at the end date", () => {
    expect(simulatedSpend(c, endDate(start, 10))).toBe(600_000);
  });
  it("is zero before the start", () => {
    expect(simulatedSpend(c, new Date(start.getTime() - 1000))).toBe(0);
  });
});

describe("ad helpers", () => {
  it("writes a starter caption for the area", () => {
    expect(defaultCaption("Ankara dress", 1_850_000, "Lagos")).toContain("in Lagos");
    expect(defaultCaption("Ankara dress", 1_850_000, "Nigeria")).toContain("anywhere in Nigeria");
  });
  it("works out sales per naira spent", () => {
    expect(returnOnSpend(840_000, 200_000)).toBe(4.2);
    expect(returnOnSpend(100, 0)).toBeNull();
    expect(returnOnSpend(0, 2)).toBeNull();
  });
});
