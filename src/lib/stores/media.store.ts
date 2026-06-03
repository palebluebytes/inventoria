import { createQueryStore } from "./datoms.store";
import { derived } from "svelte/store";
import { dbClient, type Datom } from "../db/db.client";
import { ingestEntity, type EntityPayload } from "../ingestion/ingest";
import { computeMediaLibraryState } from "../media/state";
import { logWatchEvent, logReadEvent } from "../media/engagement";

// Reactive store of all media datoms
export const mediaDatomsStore = createQueryStore<{
  entity: string;
  attribute: string;
  value: string;
  time: number;
}>(
  "SELECT entity, attribute, value, time FROM datoms WHERE attribute LIKE 'media/%' OR attribute LIKE 'event/%' ORDER BY time ASC"
);

// Derived store providing fully-enriched media twins
export const mediaLibraryStore = derived(mediaDatomsStore, ($datoms) => {
  return computeMediaLibraryState($datoms);
});

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
  let payload: EntityPayload;

  if (type === "book") {
    const { lookupOpenLibraryBook } = await import("../media/open-library");
    payload = await lookupOpenLibraryBook(id);
  } else if (type === "movie") {
    const { lookupTmdbMovie } = await import("../media/tmdb");
    const rawId = parseInt(id.replace("tmdb:movie:", ""));
    payload = await lookupTmdbMovie(rawId);
  } else if (type === "tv") {
    const { lookupTmdbTv } = await import("../media/tmdb");
    const rawId = parseInt(id.replace("tmdb:tv:", ""));
    payload = await lookupTmdbTv(rawId);
  } else {
    return;
  }

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
