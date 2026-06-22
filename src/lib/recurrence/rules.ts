export interface BaseScheduleRule {
  until?: string;
  count?: number;
  targets?: { id: string; time_hint?: string }[];
}

export interface DailyMultipleRule extends BaseScheduleRule {
  type: "daily_multiple";
}

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface WeeklyDaysRule extends BaseScheduleRule {
  type: "weekly_days";
  days: DayOfWeek[];
}

export interface WeeklyFlexibleRule extends BaseScheduleRule {
  type: "weekly_flexible";
  count: number;
}

export interface MonthlyFixedRule extends BaseScheduleRule {
  type: "monthly_fixed";
  day_of_month: number; // 1–31
}

export interface MonthlyRelativeRule extends BaseScheduleRule {
  type: "monthly_relative";
  week: -1 | 1 | 2 | 3 | 4; // -1 = last
  day: DayOfWeek;
}

export interface YearlyFixedRule extends BaseScheduleRule {
  type: "yearly_fixed";
  month: number; // 1–12
  day_of_month: number; // 1–31
}

export type ScheduleRule =
  | DailyMultipleRule
  | WeeklyDaysRule
  | WeeklyFlexibleRule
  | MonthlyFixedRule
  | MonthlyRelativeRule
  | YearlyFixedRule;

const DOW_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Returns the day-of-month for the Nth (or last) occurrence of a weekday in a month. */
export function getNthWeekdayOfMonth(
  year: number,
  month: number, // 1–12
  dayOfWeek: number, // 0=Sun … 6=Sat
  n: -1 | 1 | 2 | 3 | 4
): number {
  if (n === -1) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let d = lastDay;
    while (new Date(Date.UTC(year, month - 1, d)).getUTCDay() !== dayOfWeek) {
      d--;
    }
    return d;
  }
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === dayOfWeek && ++count === n) return d;
  }
  return -1;
}

/**
 * Evaluates whether a generic ScheduleRule is actively scheduled for a specific date string.
 */
export function isScheduleRuleActive(
  rules: ScheduleRule,
  dateStr: string // "YYYY-MM-DD"
): boolean {
  if (rules.until && dateStr > rules.until) return false;

  const d = new Date(dateStr + "T00:00:00Z");

  switch (rules.type) {
    case "daily_multiple":
      return true;

    case "weekly_days": {
      const dows = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const dow = dows[d.getUTCDay()];
      const scheduledDays = Array.isArray(rules.days)
        ? rules.days.map((x) => x.toLowerCase())
        : [];
      return scheduledDays.includes(dow);
    }

    case "weekly_flexible":
      // Flexible — active every day (completion is measured over rolling 7 days)
      return true;

    case "monthly_fixed":
      return d.getUTCDate() === rules.day_of_month;

    case "monthly_relative": {
      const target = getNthWeekdayOfMonth(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        DOW_INDEX[rules.day],
        rules.week
      );
      return d.getUTCDate() === target;
    }

    case "yearly_fixed":
      return (
        d.getUTCMonth() + 1 === rules.month &&
        d.getUTCDate() === rules.day_of_month
      );

    default:
      return false;
  }
}
