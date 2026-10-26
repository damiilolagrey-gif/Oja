import { describe, expect, it } from "vitest";
import { followUpDue } from "../followup";
import { normalizeCac, trustLevel } from "../verification";

describe("followUpDue", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const h = (n: number) => new Date(now.getTime() - n * 3600_000);
  const convo = (buyerHoursAgo: number, lastDir: "IN" | "OUT", lastHoursAgo: number, status = "OPEN") => ({
    status, lastBuyerAt: h(buyerHoursAgo), messages: [{ direction: lastDir, createdAt: h(lastHoursAgo) }],
  });
  it("is due when the shop spoke last and the buyer has been quiet a few hours", () => {
    expect(followUpDue(convo(5, "OUT", 4), now)).toEqual({ due: true, hoursLeft: 19 });
  });
  it("waits a few hours first", () => expect(followUpDue(convo(2, "OUT", 1), now).due).toBe(false));
  it("is not due when the buyer spoke last", () => expect(followUpDue(convo(5, "IN", 5), now).due).toBe(false));
  it("stops once the 24-hour window has closed", () => expect(followUpDue(convo(25, "OUT", 24), now).due).toBe(false));
  it("ignores closed chats", () => expect(followUpDue(convo(5, "OUT", 4, "WON"), now).due).toBe(false));
});

describe("verification", () => {
  it.each([
    ["RC 1234567", "RC 1234567"],
    ["rc-1234567", "RC 1234567"],
    ["BN3456789", "BN 3456789"],
    ["1234567", "RC 1234567"],
  ])("normalises %s", (input, out) => expect(normalizeCac(input)).toBe(out));
  it.each(["", "RC", "AB 123456", "12"])("rejects %s", input => expect(normalizeCac(input)).toBeNull());
  it("ranks business over bank", () => {
    expect(trustLevel({ businessVerifiedAt: new Date(), paystackRecipient: "RCP_1" })).toBe("business");
    expect(trustLevel({ businessVerifiedAt: null, paystackRecipient: "RCP_1" })).toBe("bank");
    expect(trustLevel({ businessVerifiedAt: null, paystackRecipient: null })).toBe("none");
  });
});
