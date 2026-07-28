import type { HabitLineage } from "../stores/habits.store";
import type {
  CalEventBlueprint,
  ProjectedSlot,
  OccurrenceRecord,
} from "./cal_events";

// The agenda's SCHEDULE section fuses two sources — timed habit sub-targets and
// projected calendar-event slots — into one time-ordered column. These are the
// pure shaping steps behind that column: annotate each item's temporal
// relationship to the day's blocks, then cluster same-time items into rows. The
// store-reading (which habits/events exist for the day) stays in the view; this
// module is just the math, so it can be reasoned about and tested in isolation.

export type HabitSlot = {
  kind: "habit";
  lineage: HabitLineage;
  targetId: string;
  time: string;
  hasEnd: false;
  dtendTime: undefined;
  isDuring: boolean;
  isOverlap: boolean;
};

export type EventSlot = {
  kind: "event";
  blueprint: CalEventBlueprint;
  slot: ProjectedSlot;
  occurrence: OccurrenceRecord | undefined;
  time: string;
  hasEnd: boolean;
  dtendTime: string | undefined;
  isDuring: boolean;
  isOverlap: boolean;
};

export type ScheduleItem = HabitSlot | EventSlot;

export type RawHabitSlot = Omit<HabitSlot, "isDuring" | "isOverlap">;
export type RawEventSlot = Omit<EventSlot, "isDuring" | "isOverlap">;
export type RawScheduleItem = RawHabitSlot | RawEventSlot;

export type TimeGroup = {
  time: string;
  dtendTime: string | undefined;
  isBlock: boolean;
  items: ScheduleItem[];
};

/**
 * Sort the raw items into agenda order and annotate each with its relationship
 * to the day's block events:
 * - `isDuring` — a point-in-time item that falls strictly inside a block window.
 * - `isOverlap` — a block whose window overlaps another block's.
 *
 * Untimed ("ALL DAY") items sort first, then everything by ascending time. The
 * input array is not mutated.
 */
export function annotateSchedule(raw: RawScheduleItem[]): ScheduleItem[] {
  const sorted = [...raw].sort((a, b) => {
    if (a.time === "ALL DAY" && b.time !== "ALL DAY") return -1;
    if (b.time === "ALL DAY" && a.time !== "ALL DAY") return 1;
    return a.time.localeCompare(b.time);
  });

  const blocks = sorted.filter((item) => item.hasEnd && item.dtendTime);

  return sorted.map((item) => {
    const isDuring =
      !item.hasEnd &&
      item.time !== "ALL DAY" &&
      blocks.some(
        (block) =>
          block !== item &&
          item.time > block.time &&
          item.time < (block.dtendTime ?? "99:99")
      );

    const isOverlap =
      item.hasEnd &&
      !!item.dtendTime &&
      blocks.some(
        (block) =>
          block !== item &&
          block.hasEnd &&
          block.dtendTime &&
          item.time < block.dtendTime &&
          block.time < item.dtendTime!
      );

    return { ...item, isDuring, isOverlap } as ScheduleItem;
  });
}

/**
 * Collapse consecutive items that share a start time into a single row. A group
 * becomes a "block" (and carries a `dtendTime` range) as soon as any of its
 * items has an end time.
 */
export function clusterByTime(items: ScheduleItem[]): TimeGroup[] {
  const groups: TimeGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.time === item.time) {
      last.items.push(item);
      // If any item in the group is a block, show the range.
      if (item.hasEnd && item.dtendTime) {
        last.isBlock = true;
        last.dtendTime = item.dtendTime;
      }
    } else {
      groups.push({
        time: item.time,
        dtendTime: item.hasEnd ? item.dtendTime : undefined,
        isBlock: item.hasEnd,
        items: [item],
      });
    }
  }
  return groups;
}
