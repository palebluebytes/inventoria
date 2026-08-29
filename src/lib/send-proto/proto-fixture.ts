/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
 *
 * The meals a send hands over, canned. Nothing here is read from the ledger and
 * nothing here is written to it: the prototype answers "what does a person tap",
 * and a real closure would only make the screens slower to reach.
 *
 * The figures are #199's shapes at a domestic size — a Sunday dinner of five
 * rows including one Recipe Instantiation and one barcode food. What matters to
 * the screens is not the arithmetic but which of #197's narrowings show:
 * a photo'd food arrives with no image at all, and a `gtin:` twin arrives with
 * no provenance, so its NOVA reads "not rated" rather than a number.
 */

export interface ProtoRow {
  name: string;
  /** As logged, in the sender's units — the wire carries the amount verbatim. */
  amount: string;
  calories: number;
  /** A Recipe Instantiation. It crosses whole (#197), so it lands in the
   *  recipient's recipe list even though they did not write it. */
  recipe?: boolean;
  /** A `gtin:` twin whose `twin/raw_provenance` did not cross (#197 §1.2), so
   *  ADR-0041's verdict degrades silently to "not rated". */
  notRated?: boolean;
  /** A label-captured food. `food/label_photos` and `food/photo_base64` are both
   *  omitted (#197 §1.3), so there is no image to show — before or after accept. */
  photoStripped?: boolean;
}

import { formatDate } from "./proto-date";

export interface ProtoPayload {
  id: string;
  /** What the sender called the meal on their day. The recipient's own Meal
   *  Type is what it lands in (#197 §2.2). */
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  /** The sender's date, shown so the recipient knows what they are looking at.
   *  It is NOT what the meal lands on — accept re-mints onto their clock, which
   *  is exactly why it is a written date rather than "Sunday": across two
   *  devices, a weekday names nothing. */
  senderDay: string;
  rows: ProtoRow[];
  /** Frozen at send: the recipient sees the sender's numbers, not a recompute. */
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Decoded bytes, against #199 §13's 1 MiB ceiling. */
  bytes: number;
}

export const sum = (rows: ProtoRow[]) =>
  rows.reduce((n, r) => n + r.calories, 0);

export const SUNDAY_DINNER: ProtoPayload = {
  id: "p1",
  meal_type: "dinner",
  senderDay: formatDate(new Date(2026, 0, 4)),
  rows: [
    {
      name: "Chicken, broilers or fryers, thigh, roasted",
      amount: "140 g",
      calories: 289,
    },
    { name: "Potatoes, roasted", amount: "180 g", calories: 271 },
    { name: "Broccoli, cooked, boiled, drained", amount: "90 g", calories: 31 },
    {
      name: "Gravy from the pan",
      amount: "1 serving",
      calories: 78,
      recipe: true,
    },
    { name: "Cranberry sauce", amount: "30 g", calories: 51, notRated: true },
  ],
  protein_g: 48.2,
  carbs_g: 61.4,
  fat_g: 28.9,
  bytes: 43_112,
};

export const A_BREAKFAST: ProtoPayload = {
  id: "p2",
  meal_type: "breakfast",
  senderDay: formatDate(new Date(2026, 0, 5)),
  rows: [
    { name: "Oats, rolled, dry", amount: "60 g", calories: 233 },
    { name: "Milk, whole, 3.25% milkfat", amount: "200 ml", calories: 122 },
    { name: "Blueberries, raw", amount: "80 g", calories: 46 },
  ],
  protein_g: 16.1,
  carbs_g: 54.0,
  fat_g: 12.4,
  bytes: 14_805,
};

export const A_LUNCH: ProtoPayload = {
  id: "p3",
  meal_type: "lunch",
  senderDay: formatDate(new Date(2026, 0, 5)),
  rows: [
    {
      name: "Soup of the day, from the deli counter",
      amount: "1 serving",
      calories: 214,
      photoStripped: true,
    },
    { name: "Sourdough, sliced", amount: "70 g", calories: 178 },
  ],
  protein_g: 11.8,
  carbs_g: 49.3,
  fat_g: 6.2,
  bytes: 9_640,
};

export const INCOMING: ProtoPayload[] = [SUNDAY_DINNER, A_BREAKFAST, A_LUNCH];
