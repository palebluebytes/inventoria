import { describe, it, expect } from "vitest";
import { computeCalEvents } from "../../src/lib/cal_events/state";
import {
  occurrencesForDate,
  findOccurrence,
  type OccurrenceRecord,
} from "../../src/lib/cal_events/cal_events";
import { toLocalDateStr } from "../../src/lib/habits/habits";

const dailyRule = { type: "daily_multiple", count: 1 };

describe("computeCalEvents", () => {
  it("folds blueprints and occurrences into separate arrays", () => {
    const datoms = [
      // Blueprint
      {
        entity: "cal_event:meds_1",
        attribute: "cal_event/title",
        value: "Meds",
        time: 1000,
      },
      {
        entity: "cal_event:meds_1",
        attribute: "cal_event/dtstart",
        value: "2026-06-10T08:00:00Z",
        time: 1000,
      },
      {
        entity: "cal_event:meds_1",
        attribute: "cal_event/tracking",
        value: JSON.stringify(true),
        time: 1000,
      },
      {
        entity: "cal_event:meds_1",
        attribute: "cal_event/schedule_rules",
        value: JSON.stringify(dailyRule),
        time: 1000,
      },
      // Occurrence targeting it
      {
        entity: "event:occur_a",
        attribute: "event/type",
        value: "OccurrenceAction",
        time: 2000,
      },
      {
        entity: "event:occur_a",
        attribute: "event/target",
        value: "cal_event:meds_1",
        time: 2000,
      },
      {
        entity: "event:occur_a",
        attribute: "event/status",
        value: "completed",
        time: 2000,
      },
    ];

    const { blueprints, occurrences } = computeCalEvents(datoms);

    expect(blueprints).toHaveLength(1);
    expect(blueprints[0].entity).toBe("cal_event:meds_1");
    expect(blueprints[0].title).toBe("Meds");
    expect(blueprints[0].tracking).toBe(true);
    expect(blueprints[0].schedule_rules).toEqual(dailyRule);

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].target).toBe("cal_event:meds_1");
    expect(occurrences[0].time).toBe(2000);
  });

  it("drops blueprints missing a title or dtstart, and targetless occurrences", () => {
    const datoms = [
      {
        entity: "cal_event:bad",
        attribute: "cal_event/title",
        value: "No start",
        time: 1000,
      },
      {
        entity: "event:occur_orphan",
        attribute: "event/status",
        value: "completed",
        time: 2000,
      },
    ];

    const { blueprints, occurrences } = computeCalEvents(datoms);
    expect(blueprints).toHaveLength(0);
    expect(occurrences).toHaveLength(0);
  });
});

describe("occurrence lookups bucket by local date", () => {
  // A tap late in the local evening whose UTC date is the *next* day. Bucketing
  // by UTC (the old getOccurrence bug) would file it under the wrong day.
  const eveningLocal = new Date("2026-06-10T23:30:00");
  const occurrences: OccurrenceRecord[] = [
    {
      entity: "event:occur_1",
      target: "cal_event:meds_1",
      slot_id: "08:00",
      status: "completed",
      time: eveningLocal.getTime(),
    },
  ];
  const localDay = toLocalDateStr(eveningLocal.getTime());

  it("finds the occurrence on its local calendar day", () => {
    expect(occurrencesForDate(occurrences, localDay)).toHaveLength(1);
    const found = findOccurrence(
      occurrences,
      "cal_event:meds_1",
      "08:00",
      localDay
    );
    expect(found?.entity).toBe("event:occur_1");
  });

  it("does not match a different slot or a different day", () => {
    expect(
      findOccurrence(occurrences, "cal_event:meds_1", "20:00", localDay)
    ).toBeUndefined();
    expect(
      findOccurrence(occurrences, "cal_event:meds_1", "08:00", "2026-06-11")
    ).toBeUndefined();
  });
});
