import type { Datom } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import type { ScheduleRule } from "../habits/habits";

export type { ScheduleRule };

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface CalEventBlueprint {
  entity: string; // "cal_event:..."
  title: string;
  dtstart: string; // ISO datetime e.g. "2026-06-10T08:00:00Z"
  dtend?: string; // Optional — block events only
  description?: string;
  tracking: boolean; // true = Compliance Event, false = Appointment
  timed: boolean; // true = has specific time of day, false = all day / untimed event
  schedule_rules?: ScheduleRule; // Absent = single occurrence on dtstart date
  time: number; // Blueprint creation timestamp (ms)
}

export interface ProjectedSlot {
  calEventId: string;
  slotId?: string; // Sub-target ID for multi-slot events
  scheduledTime: string; // "HH:MM" or "ALL DAY"
  dtendTime?: string; // "HH:MM" for block events
  isTracking: boolean;
  hasEnd: boolean;
}

export interface OccurrenceRecord {
  entity: string;
  target: string; // cal_event entity ID
  slot_id?: string;
  status: "completed";
  time: number; // Exact ms of user tap
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHHMM(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function toDateStr(isoOrMs: string | number): string {
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toISOString().slice(0, 10);
}

const DOW_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function getNthWeekdayOfMonth(
  year: number,
  month: number, // 1–12
  dayOfWeek: number, // 0=Sun…6=Sat
  n: -1 | 1 | 2 | 3 | 4
): number {
  if (n === -1) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let d = lastDay;
    while (new Date(Date.UTC(year, month - 1, d)).getUTCDay() !== dayOfWeek)
      d--;
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
 * Determines whether a Calendar Event Blueprint applies on a given calendar date.
 */
export function isActiveOnDate(
  blueprint: CalEventBlueprint,
  dateStr: string // "YYYY-MM-DD"
): boolean {
  const dtstart = blueprint.dtstart;
  const startDateStr = toDateStr(dtstart);

  // Cannot fire before dtstart
  if (dateStr < startDateStr) return false;

  const rules = blueprint.schedule_rules;

  // Single occurrence: fires on dates spanning dtstart to dtend
  if (!rules) {
    if (blueprint.dtend) {
      const endDateStr = toDateStr(blueprint.dtend);
      return dateStr >= startDateStr && dateStr <= endDateStr;
    }
    return dateStr === startDateStr;
  }

  // Respect until
  if (rules.until && dateStr > rules.until) return false;

  const d = new Date(dateStr + "T00:00:00Z");

  switch (rules.type) {
    case "daily_multiple":
      return true;

    case "weekly_days": {
      const dows = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const dow = dows[d.getUTCDay()];
      return rules.days.includes(dow as any);
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

/**
 * Projects virtual agenda slots for a given date from a Calendar Event Blueprint.
 * Nothing is written to the ledger until the user confirms.
 */
export function projectSlotsForDate(
  blueprint: CalEventBlueprint,
  dateStr: string
): ProjectedSlot[] {
  if (!isActiveOnDate(blueprint, dateStr)) return [];

  const startDateStr = toDateStr(blueprint.dtstart);
  const endDateStr = blueprint.dtend ? toDateStr(blueprint.dtend) : undefined;

  // If it has dtend and spans multiple days
  if (endDateStr && startDateStr < endDateStr) {
    let scheduledTime = "00:00";
    let dtendTime: string | undefined = "23:59";

    if (dateStr === startDateStr) {
      scheduledTime = toHHMM(blueprint.dtstart);
      dtendTime = "23:59";
    } else if (dateStr === endDateStr) {
      scheduledTime = "00:00";
      dtendTime = toHHMM(blueprint.dtend!);
    } else {
      scheduledTime = "00:00";
      dtendTime = "23:59";
    }

    return [
      {
        calEventId: blueprint.entity,
        scheduledTime: blueprint.timed ? scheduledTime : "ALL DAY",
        dtendTime: blueprint.timed ? dtendTime : undefined,
        isTracking: blueprint.tracking,
        hasEnd: blueprint.timed,
      },
    ];
  }

  const baseTime = toHHMM(blueprint.dtstart);
  const dtendTime = blueprint.dtend ? toHHMM(blueprint.dtend) : undefined;

  // Multi-slot: one Blueprint with multiple Sub-Targets (e.g. medication 08:00 + 20:00)
  const rules = blueprint.schedule_rules;
  if (
    rules &&
    rules.type === "daily_multiple" &&
    rules.targets &&
    rules.targets.length > 0
  ) {
    return rules.targets.map((target) => ({
      calEventId: blueprint.entity,
      slotId: target.id,
      scheduledTime: blueprint.timed
        ? (target.time_hint ?? baseTime)
        : "ALL DAY",
      dtendTime: blueprint.timed ? dtendTime : undefined,
      isTracking: blueprint.tracking,
      hasEnd: blueprint.timed ? !!blueprint.dtend : false,
    }));
  }

  // Single slot
  return [
    {
      calEventId: blueprint.entity,
      scheduledTime: blueprint.timed ? baseTime : "ALL DAY",
      dtendTime: blueprint.timed ? dtendTime : undefined,
      isTracking: blueprint.tracking,
      hasEnd: blueprint.timed ? !!blueprint.dtend : false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Ledger ingestion
// ---------------------------------------------------------------------------

export function ingestCalEvent(
  blueprint: CalEventBlueprint,
  now: number = Date.now()
): Datom[] {
  const payload = {
    entity: blueprint.entity,
    attributes: {
      "cal_event/title": blueprint.title,
      "cal_event/dtstart": blueprint.dtstart,
      "cal_event/tracking": blueprint.tracking,
      "cal_event/timed": blueprint.timed,
      ...(blueprint.dtend ? { "cal_event/dtend": blueprint.dtend } : {}),
      ...(blueprint.description
        ? { "cal_event/description": blueprint.description }
        : {}),
      ...(blueprint.schedule_rules
        ? {
            "cal_event/schedule_rules": JSON.stringify(
              blueprint.schedule_rules
            ),
          }
        : {}),
    },
  };
  return ingestEntity(payload, now);
}

/**
 * Creates an OccurrenceAction datom for a confirmed Compliance Event slot.
 * Only call this for tracking=true blueprints.
 */
export function logOccurrence(
  calEventId: string,
  slotId?: string,
  now: number = Date.now()
): Datom[] {
  const eventId = `event:occur_${now}_${Math.random().toString(36).slice(2, 9)}`;
  const datoms: Datom[] = [
    {
      entity: eventId,
      attribute: "event/type",
      value: "OccurrenceAction",
      time: now,
    },
    {
      entity: eventId,
      attribute: "event/target",
      value: calEventId,
      time: now,
    },
    {
      entity: eventId,
      attribute: "event/status",
      value: "completed",
      time: now,
    },
  ];
  if (slotId) {
    datoms.push({
      entity: eventId,
      attribute: "event/slot_id",
      value: slotId,
      time: now,
    });
  }
  return datoms;
}
