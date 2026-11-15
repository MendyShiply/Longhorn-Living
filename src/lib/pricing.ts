import type { ItemCondition, Settings } from "./types";

/** Suggested sale price: retail times the percent for this condition, rounded to a friendly number. */
export function suggestPrice(
  retail: number | null | undefined,
  condition: ItemCondition | null | undefined,
  settings: Pick<Settings, "default_price_pct" | "condition_pct">,
): number | null {
  if (!retail || retail <= 0) return null;
  const pct = condition ? settings.condition_pct[condition] ?? settings.default_price_pct : settings.default_price_pct;
  return friendlyRound((retail * pct) / 100);
}

/** 137.42 -> 135, 1234 -> 1230, 18.6 -> 19. Marketplace buyers like round numbers. */
export function friendlyRound(n: number): number {
  if (n < 20) return Math.round(n);
  if (n < 200) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "–";
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
