import type { StoredDatom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";
import { compareHlc } from "../db/hlc";

/**
 * The descriptors a physical item twin carries. These were `twin/*` until
 * ADR-0086 §5: `twin/` was never a domain namespace but the generic descriptive
 * shell any ingested entity got, named after the first domain to use it, while
 * `twin:` was an entity prefix physical items own outright. One character apart,
 * opposite scoping rules, which is very plausibly how the projection below came
 * to be scoped by the attribute in the first place (#280).
 */
const ACQUISITION_STRING_ATTRIBUTES = [
  "item/name",
  "item/image",
  "item/description",
  "item/brand",
  "item/source_url",
  "item/note",
];

export interface EnrichedAcquisition {
  id: string;
  name: string;
  image?: string;
  description?: string;
  brand?: string;
  source_url?: string;
  status: "wanted" | "owned";
  last_updated: number;
  tags?: string[];
  note?: string;
}

export function computeAcquisitionState(
  datoms: StoredDatom[]
): EnrichedAcquisition[] {
  const { twins: twinGroups, events: eventGroups } = groupByEntity(
    datoms,
    "item/",
    ACQUISITION_STRING_ATTRIBUTES
  );

  const twins = Array.from(twinGroups.values()).map(
    (g) =>
      ({
        id: g.id,
        name: "",
        image: "",
        description: "",
        brand: "",
        source_url: "",
        tags: [],
        note: "",
        last_updated: g.lastTime,
        status: "wanted", // Default status; overridden by the latest event below.
        ...g.fields,
      }) as EnrichedAcquisition
  );

  const events = Array.from(eventGroups.values()).map((g) => ({
    id: g.id,
    time: g.firstTime,
    stamp: g.firstStamp,
    ...g.fields,
  })) as any[];

  // Events arrive from the fold already in `firstStamp` order (HLC-ordered rows,
  // Map insertion order preserved), so this sort defensively re-asserts the
  // HLC-order/latest-wins invariant rather than reordering.
  for (const twin of twins) {
    const targetEvents = events
      .filter((e) => e.target === twin.id && e.type === "AcquisitionAction")
      .sort((a, b) => compareHlc(a.stamp, b.stamp));

    for (const event of targetEvents) {
      if (event.status) {
        twin.status = event.status as "wanted" | "owned";
      }
      if (event.time > twin.last_updated) {
        twin.last_updated = event.time;
      }
    }
  }

  return twins;
}
