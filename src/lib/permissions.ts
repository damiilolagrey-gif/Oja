import type { Role } from "@prisma/client";

/** What each staff role may do. Pure, so it can be unit tested and shown on the Team page. */

export type Permission =
  | "chats" // read and reply to chats assigned to them, take over from the AI
  | "chats.assign" // reassign chats to other staff
  | "orders" // build orders, mark dispatched or delivered, book riders
  | "products.edit" // add and edit products, prices and stock, restock
  | "waitlist.add" // add a buyer to a restock list by hand
  | "reports" // see everyone's scorecard and the activity log
  | "studio" // creative studio: write ad copy, make ad images
  | "ads" // ads manager: set up campaigns, budgets and targeting, see results
  | "team" // invite, remove and change roles of staff
  | "settings"; // shop settings, WhatsApp/Instagram, AI agent, payouts

const ALL: Permission[] = ["chats", "chats.assign", "orders", "products.edit", "waitlist.add", "reports", "studio", "ads", "team", "settings"];

const MATRIX: Record<Role, Permission[]> = {
  OWNER: ALL,
  MANAGER: ["chats", "chats.assign", "orders", "products.edit", "waitlist.add", "reports", "studio", "ads"],
  REP: ["chats", "orders", "waitlist.add"],
};

export const can = (role: Role, p: Permission) => MATRIX[role].includes(p);

export const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", MANAGER: "Manager", REP: "Sales rep" };

export const ROLE_HELP: Record<Exclude<Role, "OWNER">, string> = {
  MANAGER: "Chats, orders, products and stock, ads and campaigns, and everyone's activity. No payouts, settings or team changes.",
  REP: "Their chats, orders and restock lists. Can't change prices or stock.",
};

/** A short, human label for the device from its user-agent, e.g. "Android phone". */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  if (/Windows/i.test(ua)) return "Windows computer";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux computer";
  return "Other device";
}
