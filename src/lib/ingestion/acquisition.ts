import { ingestEntity } from "./ingest";
import { mintEntity } from "../facets/entity-id";
import type { Datom } from "../db/db.client";

export function logAcquisitionEvent(
  target_id: string,
  status: "wanted" | "owned",
  now: number = Date.now()
): Datom[] {
  const eventId = mintEntity(
    "event:acquire_",
    `${now}_${Math.random().toString(36).slice(2, 9)}`
  );
  const attributes: Record<string, string | number> = {
    "event/type": "AcquisitionAction",
    "event/target": target_id,
    "event/status": status,
  };

  const datoms = ingestEntity({
    entity: eventId,
    attributes,
  });

  // Inject timestamp
  for (const d of datoms) {
    d.time = now;
  }
  return datoms;
}
