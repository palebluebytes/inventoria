import { createProjectionStore } from "./datoms.store";
import { dbClient, type Datom } from "../db/db.client";
import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import type { EnrichedAcquisition } from "../acquisition/state";
import { logAcquisitionEvent } from "../ingestion/acquisition";

// Reactive store providing fully-enriched acquisition twins from the worker
export const acquisitionLibraryStore = createProjectionStore<
  EnrichedAcquisition[]
>("ACQUISITION_LIBRARY", {}, []);

/**
 * Saves a new acquisition digital twin to the database and logs its initial status event.
 */
export async function saveAcquisitionTwin(
  payload: EntityPayload,
  initialStatus: "wanted" | "owned" = "wanted"
): Promise<string> {
  const now = Date.now();
  const twinDatoms = ingestEntity(payload);

  for (const d of twinDatoms) {
    d.time = now;
  }

  const eventDatoms = logAcquisitionEvent(payload.entity, initialStatus, now);
  await dbClient.append([...twinDatoms, ...eventDatoms]);
  return payload.entity;
}

/**
 * Appends a new acquisition status event (e.g. changing status from wanted to owned).
 */
export async function updateAcquisitionStatus(
  targetId: string,
  status: "wanted" | "owned"
): Promise<void> {
  const now = Date.now();
  const datoms = logAcquisitionEvent(targetId, status, now);
  await dbClient.append(datoms);
}

/**
 * Appends new tag and note datoms to update the digital twin's metadata.
 */
export async function updateAcquisitionMetadata(
  targetId: string,
  tags: string[],
  note: string
): Promise<void> {
  const now = Date.now();
  const datoms: Datom[] = [
    {
      entity: targetId,
      attribute: "item/tags",
      value: tags,
      time: now,
    },
    {
      entity: targetId,
      attribute: "item/note",
      value: note,
      time: now,
    },
  ];
  await dbClient.append(datoms);
}
