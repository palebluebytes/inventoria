import { describe, it, expect } from "vitest";
import {
  annotateSchedule,
  clusterByTime,
  type RawScheduleItem,
} from "../../src/lib/cal_events/schedule-grouping";

// The pure grouping helpers only read `kind`, `time`, `hasEnd`, and `dtendTime`
// and pass the rest through untouched, so the lineage/blueprint/slot payloads
// can be stand-ins here.
function habit(time: string, targetId = "t"): RawScheduleItem {
  return {
    kind: "habit",
    lineage: {} as any,
    targetId,
    time,
    hasEnd: false,
    dtendTime: undefined,
  };
}

function event(
  time: string,
  opts: { hasEnd?: boolean; dtendTime?: string; slotId?: string } = {}
): RawScheduleItem {
  return {
    kind: "event",
    blueprint: {} as any,
    slot: { slotId: opts.slotId } as any,
    occurrence: undefined,
    time,
    hasEnd: opts.hasEnd ?? false,
    dtendTime: opts.dtendTime,
  };
}

describe("annotateSchedule", () => {
  it("sorts untimed 'ALL DAY' items ahead of timed ones, then by time", () => {
    const out = annotateSchedule([
      event("14:00"),
      habit("08:00"),
      event("ALL DAY"),
      habit("11:00"),
    ]);
    expect(out.map((i) => i.time)).toEqual([
      "ALL DAY",
      "08:00",
      "11:00",
      "14:00",
    ]);
  });

  it("does not mutate its input array", () => {
    const raw = [event("14:00"), habit("08:00")];
    const before = raw.map((i) => i.time);
    annotateSchedule(raw);
    expect(raw.map((i) => i.time)).toEqual(before);
  });

  it("marks a point-in-time item that falls strictly within a block as during", () => {
    const out = annotateSchedule([
      event("09:00", { hasEnd: true, dtendTime: "11:00" }),
      habit("10:00"),
    ]);
    const point = out.find((i) => i.kind === "habit")!;
    expect(point.isDuring).toBe(true);
  });

  it("does not mark an item sharing the block's start or end time as during", () => {
    const out = annotateSchedule([
      event("09:00", { hasEnd: true, dtendTime: "11:00" }),
      habit("09:00"),
      habit("11:00"),
    ]);
    for (const point of out.filter((i) => i.kind === "habit")) {
      expect(point.isDuring).toBe(false);
    }
  });

  it("marks two blocks that overlap in time as overlapping", () => {
    const out = annotateSchedule([
      event("09:00", { hasEnd: true, dtendTime: "11:00", slotId: "a" }),
      event("10:00", { hasEnd: true, dtendTime: "12:00", slotId: "b" }),
    ]);
    expect(out.every((i) => i.isOverlap)).toBe(true);
  });

  it("does not mark adjacent, non-overlapping blocks as overlapping", () => {
    const out = annotateSchedule([
      event("09:00", { hasEnd: true, dtendTime: "10:00", slotId: "a" }),
      event("10:00", { hasEnd: true, dtendTime: "11:00", slotId: "b" }),
    ]);
    expect(out.every((i) => !i.isOverlap)).toBe(true);
  });
});

describe("clusterByTime", () => {
  it("merges consecutive items sharing a time into one group", () => {
    const items = annotateSchedule([
      habit("08:00", "a"),
      habit("08:00", "b"),
      habit("09:00", "c"),
    ]);
    const groups = clusterByTime(items);
    expect(groups.map((g) => g.time)).toEqual(["08:00", "09:00"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it("captures the block range when any item in the group has an end", () => {
    const items = annotateSchedule([
      event("09:00", { hasEnd: true, dtendTime: "11:00" }),
    ]);
    const [group] = clusterByTime(items);
    expect(group.isBlock).toBe(true);
    expect(group.dtendTime).toBe("11:00");
  });

  it("leaves a plain point group with no range", () => {
    const [group] = clusterByTime(annotateSchedule([habit("08:00")]));
    expect(group.isBlock).toBe(false);
    expect(group.dtendTime).toBeUndefined();
  });
});
