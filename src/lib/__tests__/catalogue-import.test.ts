import { describe, expect, it } from "vitest";
import { describePlan, describeRow, parseSheet, planImport, toCsv, type Existing } from "../catalogue-import";

const kaftan: Existing = { id: "k1", name: "Kaftan", priceKobo: 1500000, stock: 0, imageUrl: null, description: null, lowStockAt: 3, waiting: 4 };
const maxi: Existing = { id: "m1", name: "Adire Maxi", priceKobo: 2850000, stock: 6, imageUrl: null, description: "Sizes 8 to 16", lowStockAt: 3, waiting: 0 };

describe("parseSheet", () => {
  it("reads CSV with quotes, commas inside quotes, CRLF and a BOM", () => {
    expect(parseSheet('﻿Name,Price\r\n"Ankara, two piece",12000\r\n"Say ""hi""",5\r\n')).toEqual([
      ["Name", "Price"],
      ["Ankara, two piece", "12000"],
      ['Say "hi"', "5"],
    ]);
  });
  it("reads cells pasted from a spreadsheet (tabs) and semicolon CSV", () => {
    expect(parseSheet("Name\tPrice\nKaftan\t15,000")).toEqual([["Name", "Price"], ["Kaftan", "15,000"]]);
    expect(parseSheet("Name;Price\nKaftan;15000")).toEqual([["Name", "Price"], ["Kaftan", "15000"]]);
  });
  it("drops blank rows", () => {
    expect(parseSheet("Name\n\n,\nKaftan\n")).toEqual([["Name"], ["Kaftan"]]);
  });
});

describe("planImport", () => {
  it("adds new products and updates existing ones by name, ignoring case", () => {
    const plan = planImport("Product name,Price (₦),Qty\nAso oke gele,\"₦9,500\",10\nadire  maxi,30000,\nKAFTAN,,8", [kaftan, maxi]);
    expect(plan.errors).toEqual([]);
    expect(plan.rows).toEqual([
      { line: 2, kind: "add", name: "Aso oke gele", priceKobo: 950000, stock: 10, imageUrl: null, description: null, lowStockAt: 3 },
      { line: 3, kind: "update", id: "m1", name: "Adire Maxi", changes: { priceKobo: 3000000 }, stockFrom: 6, stockTo: 6, waiting: 0 },
      { line: 4, kind: "update", id: "k1", name: "Kaftan", changes: {}, stockFrom: 0, stockTo: 8, waiting: 4 },
    ]);
    expect(describePlan(plan)).toBe("1 new product, 2 updates. New stock for 1 item with a restock list will message 4 waiting buyers on WhatsApp.");
    expect(plan.rows.map(describeRow)).toEqual(["New: ₦9,500, 10 in stock", "Price to ₦30,000", "Stock 0 to 8"]);
  });
  it("marks rows that change nothing", () => {
    const plan = planImport("Name,Price,Stock\nAdire Maxi,28500,6", [maxi]);
    expect(plan.rows).toEqual([{ line: 2, kind: "same", name: "Adire Maxi" }]);
    expect(describePlan(plan)).toBe("1 unchanged.");
  });
  it("reports each bad row with its row number", () => {
    const plan = planImport(
      "Name,Price,Stock,Image\nNew thing,,2,\nX,100,1,\nBag,abc,1,\nShoe,100,1.5,\nHat,100,1,http://x\nBag2,100,1,\nbag2,200,1,",
      [],
    );
    expect(plan.errors).toEqual([
      { line: 2, message: '"New thing" is new, so it needs a price.' },
      { line: 3, message: "Name is missing." },
      { line: 4, message: 'Price "abc" isn\'t a naira amount like 28500.' },
      { line: 5, message: 'Stock "1.5" should be a whole number.' },
      { line: 6, message: "Image link must start with https://" },
      { line: 8, message: '"bag2" is already on row 7.' },
    ]);
  });
  it("needs a Name heading and a product row", () => {
    expect(planImport("Price,Stock\n100,1", []).errors[0].message).toMatch(/Name column/);
    expect(planImport("Name", []).errors[0].message).toMatch(/at least one product/);
  });
  it("caps the number of rows", () => {
    const text = "Name,Price\n" + Array.from({ length: 501 }, (_, i) => `P${i},100`).join("\n");
    expect(planImport(text, []).errors[0].message).toMatch(/Up to 500/);
  });
});

describe("toCsv", () => {
  it("writes the products in a layout the upload reads back unchanged", () => {
    const csv = toCsv([{ ...maxi, description: 'Sizes 8, 10 and "12"' }]);
    expect(csv.split("\r\n")[0]).toBe("Name,Price,Stock,Image link,Description,Low stock at");
    const plan = planImport(csv, [{ ...maxi, description: 'Sizes 8, 10 and "12"' }]);
    expect(plan.rows).toEqual([{ line: 2, kind: "same", name: "Adire Maxi" }]);
  });
  it("gives an example row when the shop is empty", () => {
    expect(planImport(toCsv([]), []).rows[0]).toMatchObject({ kind: "add", name: "Adire maxi dress", priceKobo: 2850000 });
  });
});
