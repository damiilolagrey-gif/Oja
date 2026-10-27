import { describe, expect, it } from "vitest";
import { demandMilestone, parseNairaAmount, parseStaffCommand, productFromCaption } from "../staff-commands";
import { parseInstagramWebhook, parseWhatsAppWebhook } from "../meta";

describe("parseNairaAmount", () => {
  it.each([
    ["25000", 2500000],
    ["25,000", 2500000],
    ["₦25,000", 2500000],
    ["N25k", 2500000],
    ["25.5k", 2550000],
  ])("%s", (input, kobo) => expect(parseNairaAmount(input)).toBe(kobo));
  it.each(["abc", "", "0", "-5"])("rejects %s", input => expect(parseNairaAmount(input)).toBeNull());
});

describe("parseStaffCommand", () => {
  it("reads a photo caption as a new product", () => {
    expect(parseStaffCommand("Ankara two-piece 25000 3", true)).toEqual({ kind: "add", name: "Ankara two-piece", priceKobo: 2500000, stock: 3 });
  });
  it("keeps numbers in the name and defaults stock to 1", () => {
    expect(parseStaffCommand("Size 10 gown ₦15,000", true)).toEqual({ kind: "add", name: "Size 10 gown", priceKobo: 1500000, stock: 1 });
  });
  it("accepts stock written x5 or 5 pcs", () => {
    expect(parseStaffCommand("add Lace bubu 30k x5", false)).toMatchObject({ name: "Lace bubu", priceKobo: 3000000, stock: 5 });
    expect(parseStaffCommand("add Lace bubu 30k 5 pcs", false)).toMatchObject({ stock: 5 });
  });
  it("doesn't read a small number as the price", () => {
    expect(parseStaffCommand("Gown 2 15000", true)).toMatchObject({ name: "Gown 2", priceKobo: 1500000, stock: 1 });
    expect(parseStaffCommand("Gown 15000 2", true)).toMatchObject({ name: "Gown", priceKobo: 1500000, stock: 2 });
  });
  it("treats text without 'add' or a photo as not a new product", () => {
    expect(parseStaffCommand("Ankara two-piece 25000 3", false)).toBeNull();
    expect(parseStaffCommand("Lovely fabric", true)).toBeNull();
  });
  it("reads restock with and without a product name", () => {
    expect(parseStaffCommand("restock Ankara two-piece 10", false)).toEqual({ kind: "restock", query: "Ankara two-piece", units: 10 });
    expect(parseStaffCommand("Restock 12", false)).toEqual({ kind: "restock", query: null, units: 12 });
    expect(parseStaffCommand("12", false)).toEqual({ kind: "restock", query: null, units: 12 });
    expect(parseStaffCommand("restock Ankara", false)).toBeNull();
    expect(parseStaffCommand("0", false)).toBeNull();
  });
  it("reads sold out, price, list and help", () => {
    expect(parseStaffCommand("sold out Ankara", false)).toEqual({ kind: "soldout", query: "Ankara" });
    expect(parseStaffCommand("soldout", false)).toEqual({ kind: "soldout", query: null });
    expect(parseStaffCommand("price Ankara 27,000", false)).toEqual({ kind: "price", query: "Ankara", priceKobo: 2700000 });
    expect(parseStaffCommand("price 27k", false)).toEqual({ kind: "price", query: null, priceKobo: 2700000 });
    expect(parseStaffCommand("LIST", false)).toEqual({ kind: "list" });
    expect(parseStaffCommand("help", false)).toEqual({ kind: "help" });
  });
});

describe("productFromCaption", () => {
  it("takes the first line as the name and finds the price", () => {
    expect(productFromCaption("✨ Adire maxi dress ✨\nPrice: 18,500\n#adire #lagosfashion")).toEqual({ name: "Adire maxi dress", priceKobo: 1850000 });
  });
  it("finds ₦ and k prices", () => {
    expect(productFromCaption("Corset top. Now ₦12k only").priceKobo).toBe(1200000);
    expect(productFromCaption("Two-piece set 25k").priceKobo).toBe(2500000);
  });
  it("leaves the price empty when the caption has none", () => {
    expect(productFromCaption("Comment RESTOCK to get notified\nAso-oke gele set 🔥")).toEqual({ name: "Aso-oke gele set", priceKobo: null });
    expect(productFromCaption(undefined)).toEqual({ name: "Item from Instagram", priceKobo: null });
  });
});

describe("demandMilestone", () => {
  it("tells the owner at 1, 5, 10, 25... waiting, once each", () => {
    expect(demandMilestone(1, 0)).toBe(1);
    expect(demandMilestone(3, 1)).toBeNull();
    expect(demandMilestone(5, 1)).toBe(5);
    expect(demandMilestone(12, 5)).toBe(10);
    expect(demandMilestone(12, 10)).toBeNull();
    expect(demandMilestone(0, 0)).toBeNull();
  });
});

describe("webhook parsing for uploads", () => {
  it("reads a WhatsApp photo and its caption", () => {
    const { messages } = parseWhatsAppWebhook({
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "111" },
        messages: [{ from: "2348031234567", id: "wamid.1", timestamp: "1761400000", type: "image", image: { id: "media-9", caption: "Ankara 25000 3" } }],
      } }] }],
    });
    expect(messages[0]).toMatchObject({ text: "Ankara 25000 3", imageId: "media-9" });
  });
  it("reads which post an Instagram comment is on", () => {
    const [ev] = parseInstagramWebhook({
      entry: [{ id: "ig-shop", time: 1761400000, changes: [{ field: "comments", value: { id: "c1", text: "RESTOCK", from: { id: "u1", username: "ada" }, media: { id: "post-7" } } }] }],
    });
    expect(ev).toMatchObject({ kind: "comment", mediaId: "post-7", commentId: "c1" });
  });
});
