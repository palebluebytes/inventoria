import type { Datom } from "../db/db.client";
import { groupByEntity } from "../db/datom-fold";

const MEDIA_STRING_ATTRIBUTES = [
  "media/title",
  "media/author",
  "media/director",
  "media/release_date",
  "media/poster_url",
  "media/blurb",
  "event/review",
];

/** Coerce a stored value to a finite number, dropping NaN from corrupt data. */
function toFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export interface EnrichedMedia {
  id: string;
  type: "movie" | "tv" | "book";
  title: string;
  director?: string;
  author?: string;
  release_date: string;
  poster_url: string;
  status: "saved" | "started" | "progress" | "completed";
  rating?: number;
  review?: string;
  season?: number;
  episode?: number;
  pages_read?: number;
  last_engaged: number;
  blurb?: string;
  subject?: string[];
  first_publish_year?: number | string;
}

export function computeMediaLibraryState(datoms: Datom[]): EnrichedMedia[] {
  const { twins: twinGroups, events: eventGroups } = groupByEntity(
    datoms,
    "media/",
    MEDIA_STRING_ATTRIBUTES
  );

  const twins = Array.from(twinGroups.values()).map((g) => {
    let type: "movie" | "tv" | "book" = "movie";
    if (g.id.startsWith("isbn:") || g.id.startsWith("olid:")) {
      type = "book";
    } else if (g.id.startsWith("tmdb:tv:")) {
      type = "tv";
    }
    return {
      id: g.id,
      type,
      title: "",
      release_date: "",
      poster_url: "",
      last_engaged: g.firstTime,
      status: "saved", // Default status; overridden by the latest event below.
      ...g.fields,
    } as EnrichedMedia;
  });

  const events = Array.from(eventGroups.values()).map((g) => ({
    id: g.id,
    time: g.firstTime,
    ...g.fields,
  })) as any[];

  // Enrich twins with their events
  for (const twin of twins) {
    const targetEvents = events
      .filter((e) => e.target === twin.id)
      .sort((a, b) => a.time - b.time);

    for (const event of targetEvents) {
      if (event.status) {
        twin.status = event.status;
      }
      if (event.rating !== undefined && event.rating !== null) {
        const n = toFiniteNumber(event.rating);
        if (n !== undefined) twin.rating = n;
      }
      if (event.review !== undefined) {
        twin.review = event.review;
      }
      if (event.season !== undefined && event.season !== null) {
        const n = toFiniteNumber(event.season);
        if (n !== undefined) twin.season = n;
      }
      if (event.episode !== undefined && event.episode !== null) {
        const n = toFiniteNumber(event.episode);
        if (n !== undefined) twin.episode = n;
      }
      if (event.pages_read !== undefined && event.pages_read !== null) {
        const n = toFiniteNumber(event.pages_read);
        if (n !== undefined) twin.pages_read = n;
      }
      twin.last_engaged = event.time;
    }
  }

  return twins;
}
