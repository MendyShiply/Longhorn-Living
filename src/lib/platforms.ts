import type { ItemCondition } from "./types";

export interface PlatformSpec {
  id: string;
  name: string;
  titleMax: number;
  descriptionMax: number;
  /** How the platform words each of our condition grades. */
  conditions: Record<ItemCondition, string>;
  /** Can we post through an official API from the server? */
  hasApi: boolean;
  style: string;
  createUrl: string;
}

export const PLATFORMS: Record<string, PlatformSpec> = {
  facebook: {
    id: "facebook",
    name: "Facebook Marketplace",
    titleMax: 100,
    descriptionMax: 5000,
    conditions: {
      new_in_box: "New",
      open_box: "Used - Like New",
      like_new: "Used - Like New",
      good: "Used - Good",
      fair: "Used - Fair",
      damaged: "Used - Fair",
      parts_only: "Used - Fair",
    },
    hasApi: false,
    style: "Casual and friendly. Lead with the item and price value vs retail. Mention local pickup. Short paragraphs, no hashtags.",
    createUrl: "https://www.facebook.com/marketplace/create/item",
  },
  offerup: {
    id: "offerup",
    name: "OfferUp",
    titleMax: 80,
    descriptionMax: 4000,
    conditions: {
      new_in_box: "New",
      open_box: "Open box",
      like_new: "Reconditioned",
      good: "Used",
      fair: "Used",
      damaged: "For parts",
      parts_only: "For parts",
    },
    hasApi: false,
    style: "Short and direct. Key specs as a few lines. Mention pickup location and that the price is firm or negotiable.",
    createUrl: "https://offerup.com/post",
  },
  ebay: {
    id: "ebay",
    name: "eBay",
    titleMax: 80,
    descriptionMax: 50000,
    conditions: {
      new_in_box: "New",
      open_box: "Open box",
      like_new: "Used",
      good: "Used",
      fair: "Used",
      damaged: "For parts or not working",
      parts_only: "For parts or not working",
    },
    hasApi: true,
    style:
      "Keyword rich title (brand, model, type, color, size). Detailed description with specs and dimensions, an honest condition section, and local pickup or freight shipping terms.",
    createUrl: "https://www.ebay.com/sl/sell",
  },
  craigslist: {
    id: "craigslist",
    name: "Craigslist",
    titleMax: 70,
    descriptionMax: 10000,
    conditions: {
      new_in_box: "new",
      open_box: "like new",
      like_new: "like new",
      good: "good",
      fair: "fair",
      damaged: "salvage",
      parts_only: "salvage",
    },
    hasApi: false,
    style: "Plain text. Item, condition, dimensions, retail price for comparison, pickup area. Cash or app payment.",
    createUrl: "https://post.craigslist.org/",
  },
  mercari: {
    id: "mercari",
    name: "Mercari",
    titleMax: 80,
    descriptionMax: 1000,
    conditions: {
      new_in_box: "New",
      open_box: "Like new",
      like_new: "Like new",
      good: "Good",
      fair: "Fair",
      damaged: "Poor",
      parts_only: "Poor",
    },
    hasApi: false,
    style: "Concise with key specs. Note shipping or local pickup.",
    createUrl: "https://www.mercari.com/sell/",
  },
};

export const ALL_PLATFORM_IDS = Object.keys(PLATFORMS);

export const CROSSLISTERS: Record<string, { name: string; site: string; note: string }> = {
  vendoo: {
    name: "Vendoo",
    site: "https://www.vendoo.co",
    note: "Import the CSV (import add on), or let Vendoo import the eBay listing we post and crosslist from there.",
  },
  listperfectly: {
    name: "List Perfectly",
    site: "https://listperfectly.com",
    note: "Import the CSV, or import from the eBay listing we post.",
  },
  crosslist: {
    name: "Crosslist",
    site: "https://crosslist.com",
    note: "Import the CSV (higher plans), or import from the eBay listing we post.",
  },
  other: {
    name: "Other crosslister",
    site: "",
    note: "Use the generic CSV and photo links.",
  },
};
