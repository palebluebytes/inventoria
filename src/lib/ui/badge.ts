/**
 * The Badge display-label colour axis. Single source of the variant union so
 * both `Badge.svelte` and any helper that maps a domain value onto a badge
 * colour (e.g. `categoryBadgeVariant`) agree on the same closed set.
 */
export type BadgeVariant =
  | "default"
  | "success"
  | "error"
  | "warning"
  | "neutral";
