import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeNigerianPhone, displayPhone } from "../phone";
import { pickWave } from "../waves";
import { pickRep } from "../assign";
import { isMissed, recoveredByAlerts, repStats, waitingMinutes, type ConvForMetrics } from "../metrics";
import { verifyMetaSignature } from "../meta-signature";
import { parseInstagramWebhook, parseWhatsAppWebhook } from "../meta";
import { naira, toKobo } from "../format";

describe("normalizeNigerianPhone", () => {
  it.each([
    ["0803 123 4567", "2348031234567"],
    ["+234 803 123 4567", "2348031234567"],
    ["2349051234567", "2349051234567"],
    ["8031234567", "2348031234567"],
    ["07012345678", "2347012345678"],
  ])("%s -> %s", (input, out) => expect(normalizeNigerianPhone(input)).toBe(out));
  it.each(["12345", "0603 123 4567", "+44 7700 900123", ""])("rejects %s", input => expect(normalizeNigerianPhone(input)).toBeNull());
  it("formats for display", () => expect(displayPhone("2348031234567")).toBe("0803 123 4567"));
});

describe("money", () => {
  it("converts naira to kobo and back", () => {
    expect(toKobo("28,500")).toBe(2850000);
    expect(toKobo("₦1,200.50")).toBe(120050);
    expect(Number.isNaN(toKobo("abc"))).toBe(true);
    expect(naira(2850000)).toBe("₦28,500");
  });
});

describe("pickWave", () => {
  const at = (m: number) => ({ id: String(m), createdAt: new Date(2026, 0, 1, 0, m) });
  it("alerts twice the units, oldest first", () => {
    expect(pickWave([at(5), at(1), at(3), at(2), at(4)], 2).map(x => x.id)).toEqual(["1", "2", "3", "4"]);
  });
  it("alerts everyone when the list is short", () => expect(pickWave([at(1)], 5)).toHaveLength(1));
  it("alerts nobody for zero units", () => expect(pickWave([at(1)], 0)).toEqual([]));
});

describe("pickRep", () => {
  const reps = [{ id: "a", active: true }, { id: "b", active: true }, { id: "c", active: false }];
  it("picks the rep with the fewest open chats", () => expect(pickRep(reps, { a: 3, b: 1 })).toBe("b"));
  it("breaks ties by least recently assigned", () => expect(pickRep(reps, { a: 1, b: 1 }, { a: 200, b: 100 })).toBe("b"));
  it("skips inactive reps and handles none", () => {
    expect(pickRep(reps, { a: 5, b: 5, c: 0 })).not.toBe("c");
    expect(pickRep([], {})).toBeNull();
  });
});

describe("metrics", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const min = (m: number) => new Date(now.getTime() - m * 60000);
  const c = (o: Partial<ConvForMetrics>): ConvForMetrics => ({
    repId: "a", status: "OPEN", source: "ORGANIC", startedAt: min(30), firstReplyAt: null, amountKobo: null, ...o,
  });
  it("measures waiting only for unanswered open chats", () => {
    expect(waitingMinutes(c({}), now)).toBe(30);
    expect(waitingMinutes(c({ firstReplyAt: min(20) }), now)).toBeNull();
    expect(waitingMinutes(c({ status: "LOST" }), now)).toBeNull();
  });
  it("counts a chat as missed when the reply is late or still missing past the limit", () => {
    expect(isMissed(c({ startedAt: min(90) }), now, 60)).toBe(true);
    expect(isMissed(c({ startedAt: min(90), firstReplyAt: min(80) }), now, 60)).toBe(false);
    expect(isMissed(c({ startedAt: min(200), firstReplyAt: min(100) }), now, 60)).toBe(true);
    expect(isMissed(c({ startedAt: min(90), status: "LOST" }), now, 60)).toBe(false);
  });
  it("summarises a rep", () => {
    const s = repStats(
      [
        c({ startedAt: min(100), firstReplyAt: min(96), status: "WON", amountKobo: 650000 }),
        c({ startedAt: min(50), firstReplyAt: min(44) }),
        c({ startedAt: min(70) }),
        c({ startedAt: min(10), status: "LOST", firstReplyAt: min(9) }),
      ],
      now,
      60,
    );
    expect(s).toMatchObject({ chats: 4, missed: 1, waitingNow: 1, won: 1, closeRate: 0.25, revenueKobo: 650000 });
    expect(s.avgFirstReplyMin).toBeCloseTo((4 + 6 + 1) / 3);
  });
  it("adds up sales that came from restock alerts", () => {
    expect(recoveredByAlerts([
      c({ source: "ALERT", status: "WON", amountKobo: 100 }),
      c({ source: "ORGANIC", status: "WON", amountKobo: 999 }),
      c({ source: "ALERT", status: "OPEN" }),
    ])).toEqual({ orders: 1, kobo: 100 });
  });
});

describe("verifyMetaSignature", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
  it("accepts a valid signature", () => expect(verifyMetaSignature(body, sig, "s3cret")).toBe(true));
  it("rejects a tampered body, wrong secret or missing header", () => {
    expect(verifyMetaSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body, null, "s3cret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "")).toBe(false);
  });
});

describe("webhook parsing", () => {
  it("reads WhatsApp messages, quick-reply buttons and statuses", () => {
    const out = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "111" },
        contacts: [{ wa_id: "2348031234567", profile: { name: "Ngozi" } }],
        messages: [
          { from: "2348031234567", id: "wamid.1", timestamp: "1761220000", type: "text", text: { body: "YES" } },
          { from: "2348031234567", id: "wamid.2", timestamp: "1761220001", type: "button", button: { text: "Reserve" } },
        ],
        statuses: [{ id: "wamid.out", status: "read" }],
      } }] }],
    });
    expect(out.messages.map(m => [m.phoneNumberId, m.name, m.text])).toEqual([["111", "Ngozi", "YES"], ["111", "Ngozi", "Reserve"]]);
    expect(out.statuses).toEqual([{ id: "wamid.out", status: "read" }]);
  });
  it("reads Instagram DMs and comments, skipping echoes and the shop's own comments", () => {
    const out = parseInstagramWebhook({
      entry: [{
        id: "IG1",
        time: 1761220000,
        messaging: [
          { sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1761220000000, message: { mid: "m1", text: "price?" } },
          { sender: { id: "IG1" }, recipient: { id: "U1" }, timestamp: 1761220000001, message: { mid: "m2", text: "₦5k", is_echo: true } },
        ],
        changes: [
          { field: "comments", value: { id: "C1", text: "RESTOCK", from: { id: "U2", username: "bisola" } } },
          { field: "comments", value: { id: "C2", text: "thanks", from: { id: "IG1", username: "shop" } } },
        ],
      }],
    });
    expect(out.map(e => e.kind)).toEqual(["dm", "comment"]);
    expect(out[1]).toMatchObject({ commentId: "C1", username: "bisola" });
  });
});
