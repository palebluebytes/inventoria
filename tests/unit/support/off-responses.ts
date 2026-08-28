/**
 * The Open Food Facts product responses the lookup tests answer `fetch` with.
 *
 * Shared because the barcode path is now read by two suites — `lookupBarcode`'s
 * own status matrix (#204) and the retry over it (#206) — and a second copy of
 * "what a failing OFF looks like" is exactly how the two would come to disagree
 * about a status without either noticing.
 *
 * Deliberately NOT shared with `curated-drift.test.ts`: that suite holds the
 * app's rules against a hand-restated copy in a plain-Node ops script, and its
 * independence is the point of the lock (#205).
 */

/** OFF answering 200 with a body of its own. */
export const offAnswering = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

/** OFF answering with a failing HTTP status and no product body. */
export const offFailingWith = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

/** The barcode both suites look up, and the product OFF holds under it. */
export const TEST_BARCODE = "737628064502";

/** OFF's answer for a barcode it holds. */
export const offHoldingTestFood = () =>
  offAnswering({
    code: TEST_BARCODE,
    status: "success",
    product: {
      product_name: "Test Food",
      nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 },
    },
  });
