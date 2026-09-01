import type { Datom } from "../db/db.client";
import { mintEntity } from "../facets/entity-id";
import { ingestEntity } from "../ingestion/ingest";
import { isScheduleRuleActive } from "../recurrence/rules";
import type { ScheduleRule } from "../recurrence/rules";
import { toLocalDateStr } from "../habits/habits";

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

  // Delegate all recurrence logic to the unified engine
  return isScheduleRuleActive(rules, dateStr);
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
// Occurrence lookups
// ---------------------------------------------------------------------------

/**
 * All confirmed Occurrence Events that fall on a given local calendar date.
 * Buckets by the user's local day (matching Habit day math and the Agenda's
 * local `selected_date_str`), not UTC.
 */
export function occurrencesForDate(
  occurrences: OccurrenceRecord[],
  dateStr: string
): OccurrenceRecord[] {
  return occurrences.filter((o) => toLocalDateStr(o.time) === dateStr);
}

/**
 * The confirmed Occurrence Event for a specific projected slot, if any:
 * matched by Calendar Event Blueprint, optional Sub-Target slot, and local date.
 */
export function findOccurrence(
  occurrences: OccurrenceRecord[],
  calEventId: string,
  slotId: string | undefined,
  dateStr: string
): OccurrenceRecord | undefined {
  return occurrences.find((o) => {
    if (o.target !== calEventId) return false;
    if (slotId !== undefined && o.slot_id !== slotId) return false;
    return toLocalDateStr(o.time) === dateStr;
  });
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
  const eventId = mintEntity(
    "event:occur_",
    `${now}_${Math.random().toString(36).slice(2, 9)}`
  );
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
