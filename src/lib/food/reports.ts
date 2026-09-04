import type { ConsumptionEvent } from "./consumption-state";
import { dayKeyOf, dayLabel, midnight } from "./past-meals";

/**
 * The three readings of the ledger, and the period they are read over (#346,
 * ADR-0091 §6, §7).
 *
 * **A report is never a datom.** Everything here is computed when the Reports
 * page renders and stored nowhere, so a reading cannot fall out of step with
 * the facts it summarises and none of it needs an attribute in
 * `docs/eavt-vocabulary.md`. That is also what makes this module the whole of
 * the work: the page is a drawing, and every decision a report makes is one of
 * the functions below.
 *
 * The three readings are the three that are answerable from `event/metrics`,
 * which every logged food already froze at log time (ADR-0022, widened by
 * ADR-0030) — so none of them needs a fact the app was not already keeping.
 *
 * **An absent measurement is not a zero** (ADR-0048), and it is the rule these
 * folds are built around rather than a caveat on them. A day nobody ate on is
 * absent from the energy reading, not a bar of height zero; a macro no logged
 * food ever froze has no share of the plate, not a share of 0%. Each is spelt
 * as `undefined` rather than `0`, which is the same distinction `Meter` already
 * draws between a bar and a striped track.
 *
 * Everything that touches a day buckets through {@link dayKeyOf} and
 * {@link midnight}, both of which read a `Date`'s **local** fields. A period
 * boundary or a day key that went through an ISO string would speak UTC and put
 * a late-evening meal on a day nobody ate on — the hazard `logged-days.ts` was
 * written around, one scale up.
 */

/** The periods the page switches between, in the order its tabs show them. */
export const PERIODS = ["weekly", "monthly", "yearly", "custom"] as const;

export type PeriodKind = (typeof PERIODS)[number];

/** What a period's tab is called. */
export function periodLabel(kind: PeriodKind): string {
  switch (kind) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "custom":
      return "Custom";
  }
}

/**
 * The window a report is read over, in milliseconds, **half-open**: `start` is
 * the local midnight the period opens on and `end` is the local midnight of the
 * day *after* the one it closes on.
 *
 * Half-open rather than the inclusive `23:59:59.999` `getDayBounds` uses, and
 * deliberately so: a period is a run of whole days, and an exclusive end says
 * that exactly, with no millisecond of the last day left outside the window and
 * no fudge factor to get wrong. `getDayBounds` answers a different question —
 * "which events are on this one day" — and stays as it is.
 */
export interface Period {
  start: number;
  end: number;
}

/**
 * The two ends of a custom period, as the range picker has them so far. Both
 * keys are always present and either may be `undefined`, which is the shape
 * bits-ui's `DateRange` uses and the shape a half-chosen range needs: "not
 * chosen yet" is a value, not a missing key.
 */
export interface CustomEnds {
  start?: Date;
  end?: Date;
}

/** The local midnight of the day after `date` — a period's exclusive end. */
function dayAfter(date: Date): Date {
  const day = midnight(date);
  day.setDate(day.getDate() + 1);
  return day;
}

/**
 * `date`'s local midnight `months` months earlier, **clamped to the last day of
 * the month it lands in** — 31 March a month back is 28 February, not 3 March.
 *
 * The clamp is the whole of this function, and it is not decoration. `new
 * Date(2026, 1, 31)` does not throw and does not clamp: it *overflows* to 3
 * March, so a month stepped back off 31 March lands three days after the month
 * it was aiming at and the window that opens the day after it is 28 days long
 * with no February in it at all. That is the bug an anniversary is supposed to
 * avoid, arrived at by the arithmetic that was supposed to avoid it.
 *
 * `new Date(y, m + 1, 0)` is the last day of month `m` — day zero of the next
 * month — which is how the length of the month being landed in is read without
 * a table of month lengths or a leap-year rule.
 */
function monthsBefore(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() - months;
  const lastDayOfThatMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDayOfThatMonth));
}

/**
 * The window `kind` covers, or `null` where there is not one yet.
 *
 * **The three fixed periods are rolling, not calendar-aligned.** A calendar week
 * makes Monday morning a report on one day, and the question a report answers
 * is how somebody has been eating *lately* — so each window ends today and
 * opens a week, a month or a year before it. `today` is passed in rather than
 * read from a clock, which is what keeps this pure and its tests deterministic.
 *
 * Each window is **the day after the step back, up to and including today**, so
 * a week is seven days rather than eight. A month is a month and a year is a
 * year, counted by the calendar rather than as 30 or 365 days: the step back is
 * {@link monthsBefore}, which clamps rather than overflowing, so February's
 * length and a leap day are answered by the calendar and never by a month of
 * the wrong length.
 *
 * `custom` is `null` until **both** ends are set. A half-chosen range is not a
 * period (ADR-0091 §6), and a window that filled in the missing end would draw
 * a real report of something nobody asked for.
 */
export function periodOf(
  kind: PeriodKind,
  today: Date,
  ends: CustomEnds
): Period | null {
  if (kind === "custom") {
    if (!ends.start || !ends.end) return null;
    return {
      start: midnight(ends.start).getTime(),
      end: dayAfter(ends.end).getTime(),
    };
  }

  const back =
    kind === "weekly"
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)
      : monthsBefore(today, kind === "monthly" ? 1 : 12);

  return { start: dayAfter(back).getTime(), end: dayAfter(today).getTime() };
}

/** The logged foods that fall inside a period. */
export function eventsIn(
  events: ConsumptionEvent[],
  period: Period
): ConsumptionEvent[] {
  return events.filter((e) => e.time >= period.start && e.time < period.end);
}

/** One day's energy — the first reading's row. */
export interface DayEnergy {
  /** The {@link dayKeyOf} key this row buckets under. */
  dayKey: string;
  /** The day's own local midnight, which is what the row is labelled by. */
  date: Date;
  /**
   * The energy logged on it, or absent where the day has food on it but nothing
   * on it froze one. A row exists because there was food, not because there was
   * a number.
   */
  kcal?: number;
}

/**
 * **Energy by day**: a row per day that has food on it, oldest first.
 *
 * A day nobody ate on is **absent** rather than plotted as a zero (ADR-0048). A
 * gap in the reading is a gap in the eating, and a bar of height zero would be
 * the app claiming a measurement it never took.
 */
export function energyByDay(events: ConsumptionEvent[]): DayEnergy[] {
  const days = new Map<string, DayEnergy>();
  for (const event of events) {
    const when = new Date(event.time);
    const dayKey = dayKeyOf(when);
    let row = days.get(dayKey);
    if (!row) {
      row = { dayKey, date: midnight(when) };
      days.set(dayKey, row);
    }
    // Only the events that froze one contribute, so an event with no energy
    // leaves the day's reading where it was rather than adding a zero to it.
    if (typeof event.calories === "number") {
      row.kcal = (row.kcal ?? 0) + event.calories;
    }
  }
  return [...days.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * What a day's row is called: the day screen's own reading of a date, plus the
 * year where it is not this one.
 *
 * {@link dayLabel} is the canonical one — "Today", "Yesterday", a weekday for a
 * near day, "Mon 11 Aug" for a far one — and reusing it means a date reads the
 * same in a report as it does in the past-meal picker. What it does not carry is
 * a year, because nothing that reaches for it looks back further than a week or
 * two. A yearly period does: without the year, last August and this one are the
 * same four characters, and two bars a year apart would be indistinguishable.
 */
export function dayEnergyLabel(date: Date, today: Date): string {
  const said = dayLabel(date, today);
  return date.getFullYear() === today.getFullYear()
    ? said
    : `${said} ${date.getFullYear()}`;
}

/**
 * The energy a gram of each macro carries — the Atwater general factors, which
 * are what a nutrition label's own energy figure is computed from.
 */
export const ATWATER = { protein: 4, fat: 9, carbs: 4 } as const;

export type Macro = keyof typeof ATWATER;

/** The three, in the order the reading lists them. */
export const MACROS = ["protein", "fat", "carbs"] as const;

/** One macro's contribution to the period's energy — the second reading's row. */
export interface EnergyShare {
  macro: Macro;
  /** Grams over the period, absent where no logged food froze this macro. */
  grams?: number;
  /** What those grams carry, by {@link ATWATER}. */
  kcal?: number;
  /** Percent of the energy the three of them carry between them. */
  percent?: number;
}

/**
 * **Where the energy came from**: each macro's share of the period's energy by
 * Atwater factors, always three rows.
 *
 * The denominator is the three macros' own Atwater sum, **never the logged
 * calories**. A food's label energy and its Atwater arithmetic disagree —
 * alcohol, polyols and the fibre gap (#122) all live in the difference — so
 * dividing by the logged figure would leave a remainder nothing on the reading
 * accounts for, and three shares that do not read as a whole.
 *
 * A macro no logged food froze is absent from the reading rather than 0 g of
 * it, which matters most for a period of manual-entry intents: those freeze
 * calories only (ADR-0035 §7), and a plate reported as 0% of everything would
 * be a measurement the ledger never holds.
 */
export function energyShares(events: ConsumptionEvent[]): EnergyShare[] {
  const grams = new Map<Macro, number>();
  for (const event of events) {
    for (const macro of MACROS) {
      const value = event[macro];
      if (typeof value === "number") {
        grams.set(macro, (grams.get(macro) ?? 0) + value);
      }
    }
  }

  const kcalOf = (macro: Macro): number | undefined => {
    const g = grams.get(macro);
    return g === undefined ? undefined : g * ATWATER[macro];
  };
  const total = MACROS.reduce((sum, macro) => sum + (kcalOf(macro) ?? 0), 0);

  return MACROS.map((macro) => {
    const kcal = kcalOf(macro);
    return {
      macro,
      grams: grams.get(macro),
      kcal,
      // No energy between them is no share to state, rather than three zeroes
      // drawing three empty bars over a plate nothing measured.
      percent:
        kcal === undefined || total === 0 ? undefined : (kcal / total) * 100,
    };
  });
}

/** One food and how often it was logged — the third reading's row. */
export interface FoodCount {
  name: string;
  count: number;
}

/**
 * **What you eat most**: every food logged over the period, counted by name and
 * ranked, ties settled alphabetically.
 *
 * **By name, not by the twin it points at.** The same porridge reached through
 * a search, a scan and a past meal is three food twins with three ids, and a
 * reader asking what they eat most means the food rather than the row the app
 * happened to create. Counting by target would answer three when the honest
 * answer is one.
 *
 * A logging whose twin has no name is left out. It has nothing to be counted
 * under, and two of them are not the same food as each other — an "unknown" row
 * gathering them would rank a thing nobody can read.
 *
 * Names are compared **exactly**, case and all. Folding them would merge two
 * spellings the user can see are different, and it would have to choose one of
 * them to print — which is a display the reader never wrote.
 *
 * The whole ranking is returned rather than a top few: a report that quietly
 * cut its tail would read as the whole period while describing part of it.
 */
export function foodCounts(events: ConsumptionEvent[]): FoodCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const name = event.foodName;
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
