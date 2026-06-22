import { createProjectionStore } from "./datoms.store";
import { dbClient, type Datom } from "../db/db.client";
import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import type { EnrichedMedia } from "../media/state";
import { logWatchEvent, logReadEvent } from "../media/engagement";

// Reactive store providing fully-enriched media twins from the worker
export const mediaLibraryStore = createProjectionStore<EnrichedMedia[]>(
  "MEDIA_LIBRARY",
  {},
  []
);

/**
 * Saves a media digital twin to the database and logs its initial status.
 */
export async function saveMediaTwin(
  payload: EntityPayload,
  initialStatus: "saved" | "started" | "progress" | "completed" = "saved"
): Promise<string> {
  const now = Date.now();
  const twinDatoms = ingestEntity(payload);

  for (const d of twinDatoms) {
    d.time = now;
  }

  let eventDatoms: Datom[] = [];
  const type =
    payload.entity.startsWith("isbn:") || payload.entity.startsWith("olid:")
      ? "book"
      : "video";
  if (type === "book") {
    eventDatoms = logReadEvent(payload.entity, initialStatus, {}, now);
  } else {
    eventDatoms = logWatchEvent(payload.entity, initialStatus, {}, now);
  }

  await dbClient.append([...twinDatoms, ...eventDatoms]);
  return payload.entity;
}

/**
 * Appends a new engagement event to update status, ratings, reviews or progress.
 */
export async function updateMediaStatus(
  targetId: string,
  type: "movie" | "tv" | "book",
  status: "saved" | "started" | "progress" | "completed",
  opts?: {
    rating?: number;
    review?: string;
    season?: number;
    episode?: number;
    pages_read?: number;
  }
): Promise<void> {
  const now = Date.now();
  let datoms: Datom[] = [];

  if (type === "book") {
    datoms = logReadEvent(
      targetId,
      status,
      { pages_read: opts?.pages_read },
      now
    );
  } else {
    datoms = logWatchEvent(
      targetId,
      status,
      {
        rating: opts?.rating,
        review: opts?.review,
        season: opts?.season,
        episode: opts?.episode,
      },
      now
    );
  }

  await dbClient.append(datoms);
}

/**
 * Enriches an existing media twin with details from the API (if missing).
 */
export async function enrichMediaTwin(
  id: string,
  type: "movie" | "tv" | "book"
): Promise<void> {
  const now = Date.now();
  if (type === "book") {
    await import("../media/open-library");
  } else {
    await import("../media/tmdb");
  }

  const { ingestionRegistry } = await import("../ingestion/registry");
  const payload = await ingestionRegistry.resolve(id);

  // Construct datoms for missing or enriched attributes:
  // we filter to only append attributes that aren't empty/falsy.
  const twinDatoms = ingestEntity(payload);
  const validDatoms = twinDatoms.filter(
    (d) => d.value !== undefined && d.value !== null && d.value !== ""
  );

  for (const d of validDatoms) {
    d.time = now;
  }

  if (validDatoms.length > 0) {
    await dbClient.append(validDatoms);
  }
}
