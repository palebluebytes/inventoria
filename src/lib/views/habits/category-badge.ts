import type { BadgeVariant } from "../../ui/badge";

/**
 * Single source of the habit-category → Badge colour mapping. Category is a
 * free-form string; the five outcomes are a closed set, with `neutral` (grey)
 * as the fallback for any unrecognised category. Case-insensitive.
 */
export function categoryBadgeVariant(category: string): BadgeVariant {
  switch (category.toLowerCase()) {
    case "fitness":
      return "success";
    case "health":
      return "error";
    case "mind":
      return "default";
    case "productivity":
      return "warning";
    default:
      return "neutral";
  }
}
