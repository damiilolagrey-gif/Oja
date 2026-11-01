/**
 * Bulk product upload: reads a spreadsheet (CSV saved from Excel or Google Sheets, or cells pasted straight in)
 * and works out what to add and what to update. Pure functions, so they can be tested without a database.
 */
import { naira, toKobo } from "./format";

export const MAX_ROWS = 500;

/** Splits CSV or tab-separated text into rows of cells. Handles quotes, "" inside quotes, CRLF and a BOM. */
export function parseSheet(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

type Field = "name" | "price" | "stock" | "image" | "description" | "lowStockAt";

const ALIASES: Record<Field, string[]> = {
  name: ["name", "product", "product name", "item", "item name", "title"],
  price: ["price", "price (naira)", "price (₦)", "price ₦", "amount", "selling price", "naira"],
  stock: ["stock", "qty", "quantity", "units", "in stock", "stock count"],
  image: ["image", "image url", "image link", "photo", "photo url", "picture", "image_url"],
  description: ["description", "details", "sizes", "notes", "info"],
  lowStockAt: ["low stock at", "low stock alert", "alert at", "low_stock_at", "reorder at"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, " ");

export function mapHeader(header: string[]): { columns: Partial<Record<Field, number>>; missing: string | null } {
  const columns: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (columns[field] === undefined && names.some(a => norm(a) === n)) columns[field] = i;
    }
  });
  if (columns.name === undefined) return { columns, missing: "a Name column" };
  return { columns, missing: null };
}

export type Existing = { id: string; name: string; priceKobo: number; stock: number; imageUrl: string | null; description: string | null; lowStockAt: number; waiting: number };

export type PlannedRow =
  | { line: number; kind: "add"; name: string; priceKobo: number; stock: number; imageUrl: string | null; description: string | null; lowStockAt: number }
  | {
      line: number;
      kind: "update";
      id: string;
      name: string;
      changes: { priceKobo?: number; imageUrl?: string | null; description?: string | null; lowStockAt?: number };
      stockFrom: number;
      stockTo: number;
      waiting: number;
    }
  | { line: number; kind: "same"; name: string };

export type Plan = { rows: PlannedRow[]; errors: { line: number; message: string }[] };

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

function wholeNumber(raw: string, max: number): number | null | "bad" {
  const s = raw.replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : "bad";
}

/** Works out each row's effect. Rows are matched to existing products by name, ignoring case and spacing. */
export function planImport(text: string, existing: Existing[]): Plan {
  const sheet = parseSheet(text);
  if (sheet.length < 2) return { rows: [], errors: [{ line: 1, message: "The sheet needs a header row and at least one product." }] };
  const { columns, missing } = mapHeader(sheet[0]);
  if (missing) return { rows: [], errors: [{ line: 1, message: `Couldn't find ${missing}. The first row should be headings like Name, Price, Stock.` }] };
  if (sheet.length - 1 > MAX_ROWS) return { rows: [], errors: [{ line: 1, message: `Up to ${MAX_ROWS} products at a time. Split the sheet and upload it in parts.` }] };

  const byName = new Map(existing.map(p => [key(p.name), p]));
  const seen = new Map<string, number>();
  const rows: PlannedRow[] = [];
  const errors: Plan["errors"] = [];
  const get = (r: string[], f: Field) => (columns[f] === undefined ? undefined : (r[columns[f]!] ?? "").trim());

  sheet.slice(1).forEach((r, i) => {
    const line = i + 2;
    const fail = (message: string) => errors.push({ line, message });
    const name = get(r, "name") ?? "";
    if (name.length < 2) return fail("Name is missing.");
    if (name.length > 120) return fail("Name is longer than 120 characters.");
    const k = key(name);
    if (seen.has(k)) return fail(`"${name}" is already on row ${seen.get(k)}.`);
    seen.set(k, line);

    const priceRaw = get(r, "price") ?? "";
    const priceKobo = priceRaw === "" ? null : toKobo(priceRaw);
    if (priceKobo !== null && (!Number.isFinite(priceKobo) || priceKobo <= 0)) return fail(`Price "${priceRaw}" isn't a naira amount like 28500.`);

    const stock = wholeNumber(get(r, "stock") ?? "", 100000);
    if (stock === "bad") return fail(`Stock "${get(r, "stock")}" should be a whole number.`);
    const low = wholeNumber(get(r, "lowStockAt") ?? "", 1000);
    if (low === "bad") return fail(`Low stock alert "${get(r, "lowStockAt")}" should be a whole number.`);

    const imageRaw = get(r, "image");
    if (imageRaw && !/^https:\/\/\S+$/i.test(imageRaw)) return fail("Image link must start with https://");
    const description = get(r, "description");
    if (description && description.length > 1000) return fail("Description is longer than 1000 characters.");

    const current = byName.get(k);
    if (!current) {
      if (priceKobo === null) return fail(`"${name}" is new, so it needs a price.`);
      rows.push({ line, kind: "add", name, priceKobo, stock: stock ?? 0, imageUrl: imageRaw || null, description: description || null, lowStockAt: low ?? 3 });
      return;
    }
    // Blank cells leave the product as it is, so a sheet with only Name and Stock just updates stock.
    const changes: Extract<PlannedRow, { kind: "update" }>["changes"] = {};
    if (priceKobo !== null && priceKobo !== current.priceKobo) changes.priceKobo = priceKobo;
    if (imageRaw && imageRaw !== current.imageUrl) changes.imageUrl = imageRaw;
    if (description && description !== current.description) changes.description = description;
    if (low !== null && low !== current.lowStockAt) changes.lowStockAt = low;
    const stockTo = stock ?? current.stock;
    if (!Object.keys(changes).length && stockTo === current.stock) {
      rows.push({ line, kind: "same", name: current.name });
      return;
    }
    rows.push({ line, kind: "update", id: current.id, name: current.name, changes, stockFrom: current.stock, stockTo, waiting: current.waiting });
  });
  return { rows, errors };
}

export const buyers = (n: number) => `${n} waiting buyer${n === 1 ? "" : "s"}`;

/** One plain sentence for the owner before they import. */
export function describePlan(plan: Plan): string {
  const adds = plan.rows.filter(r => r.kind === "add").length;
  const updates = plan.rows.filter((r): r is Extract<PlannedRow, { kind: "update" }> => r.kind === "update");
  const same = plan.rows.filter(r => r.kind === "same").length;
  const restocked = updates.filter(r => r.stockTo > r.stockFrom && r.waiting > 0);
  const waiting = restocked.reduce((n, r) => n + r.waiting, 0);
  const parts: string[] = [];
  if (adds) parts.push(`${adds} new product${adds === 1 ? "" : "s"}`);
  if (updates.length) parts.push(`${updates.length} update${updates.length === 1 ? "" : "s"}`);
  if (same) parts.push(`${same} unchanged`);
  let s = parts.length ? parts.join(", ") + "." : "Nothing to change.";
  if (waiting) s += ` New stock for ${restocked.length} item${restocked.length === 1 ? "" : "s"} with a restock list will message ${buyers(waiting)} on WhatsApp.`;
  return s;
}

/** A row's change in words, for the preview list. */
export function describeRow(r: PlannedRow): string {
  if (r.kind === "same") return "No change";
  if (r.kind === "add") return `New: ${naira(r.priceKobo)}, ${r.stock} in stock`;
  const bits: string[] = [];
  if (r.changes.priceKobo !== undefined) bits.push(`price to ${naira(r.changes.priceKobo)}`);
  if (r.stockTo !== r.stockFrom) bits.push(`stock ${r.stockFrom} to ${r.stockTo}`);
  if (r.changes.imageUrl !== undefined) bits.push("new photo");
  if (r.changes.description !== undefined) bits.push("new description");
  if (r.changes.lowStockAt !== undefined) bits.push(`low stock alert at ${r.changes.lowStockAt}`);
  return bits.join(", ").replace(/^./, c => c.toUpperCase());
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The shop's products as a CSV in the same layout the upload reads, so it doubles as the template. */
export function toCsv(products: { name: string; priceKobo: number; stock: number; imageUrl: string | null; description: string | null; lowStockAt: number }[]): string {
  const head = ["Name", "Price", "Stock", "Image link", "Description", "Low stock at"];
  const lines = products.map(p => [p.name, p.priceKobo / 100, p.stock, p.imageUrl, p.description, p.lowStockAt].map(csvCell).join(","));
  if (!lines.length) lines.push(["Adire maxi dress", 28500, 5, "https://example.com/adire.jpg", "Sizes 8 to 16", 3].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
