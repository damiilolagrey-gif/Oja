import { describe, expect, it } from "vitest";
import { can, deviceLabel } from "../permissions";

describe("permissions", () => {
  it("lets the owner do everything", () => {
    for (const p of ["chats", "chats.assign", "orders", "products.edit", "waitlist.add", "reports", "team", "settings"] as const) expect(can("OWNER", p)).toBe(true);
  });
  it("keeps managers out of team, settings and payouts", () => {
    expect(can("MANAGER", "products.edit")).toBe(true);
    expect(can("MANAGER", "reports")).toBe(true);
    expect(can("MANAGER", "team")).toBe(false);
    expect(can("MANAGER", "settings")).toBe(false);
  });
  it("lets reps sell but not change prices, stock or see others' activity", () => {
    expect(can("REP", "chats")).toBe(true);
    expect(can("REP", "orders")).toBe(true);
    expect(can("REP", "waitlist.add")).toBe(true);
    expect(can("REP", "products.edit")).toBe(false);
    expect(can("REP", "chats.assign")).toBe(false);
    expect(can("REP", "reports")).toBe(false);
  });
});

describe("deviceLabel", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 14; TECNO KJ5) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36", "Android phone"],
    ["Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/128.0 Safari/537.36", "Android tablet"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "iPhone"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0", "Windows computer"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15", "Mac"],
  ])("labels %s", (ua, label) => expect(deviceLabel(ua)).toBe(label));
  it("returns null without a user-agent", () => expect(deviceLabel(null)).toBeNull());
});
