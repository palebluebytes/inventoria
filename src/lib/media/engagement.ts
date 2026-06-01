import { ingestEntity } from "../ingestion/ingest";
import type { Datom } from "../db/db.client";

export function logWatchEvent(
  targetId: string,
  status: "saved" | "started" | "progress" | "completed",
  opts: {
    rating?: number;
    review?: string;
    season?: number;
    episode?: number;
  } = {},
  now: number = Date.now()
): Datom[] {
  const eventId = `event:engage_${now}_${Math.random().toString(36).slice(2, 9)}`;
  const attributes: Record<string, string | number> = {
    "event/type": "WatchAction",
    "event/target": targetId,
    "event/status": status,
  };

  if (opts.rating !== undefined) attributes["event/rating"] = opts.rating;
  if (opts.review !== undefined) attributes["event/review"] = opts.review;
  if (opts.season !== undefined) attributes["event/season"] = opts.season;
  if (opts.episode !== undefined) attributes["event/episode"] = opts.episode;

  const datoms = ingestEntity({
    entity: eventId,
    attributes,
  });

  // Inject time
  for (const d of datoms) {
    d.time = now;
  }
  return datoms;
}

export function logReadEvent(
  targetId: string,
  status: "saved" | "started" | "progress" | "completed",
  opts: { pages_read?: number } = {},
  now: number = Date.now()
): Datom[] {
  const eventId = `event:engage_${now}_${Math.random().toString(36).slice(2, 9)}`;
  const attributes: Record<string, string | number> = {
    "event/type": "ReadAction",
    "event/target": targetId,
    "event/status": status,
  };

  if (opts.pages_read !== undefined)
    attributes["event/pages_read"] = opts.pages_read;

  const datoms = ingestEntity({
    entity: eventId,
    attributes,
  });

  // Inject time
  for (const d of datoms) {
    d.time = now;
  }
  return datoms;
}
