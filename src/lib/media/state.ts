import type { Datom } from "../db/db.client";

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
  const twinsMap = new Map<string, any>();
  const eventsMap = new Map<string, any>();

  for (const datom of datoms) {
    const { entity, attribute, value, time } = datom;

    let parsedValue: any;
    try {
      parsedValue = JSON.parse(value);
      const stringAttributes = [
        "media/title",
        "media/author",
        "media/director",
        "media/release_date",
        "media/poster_url",
        "media/blurb",
        "event/review",
      ];
      if (
        stringAttributes.includes(attribute) &&
        typeof parsedValue !== "string"
      ) {
        parsedValue = value;
      }
    } catch {
      parsedValue = value;
    }

    if (attribute.startsWith("media/")) {
      if (!twinsMap.has(entity)) {
        let type: "movie" | "tv" | "book" = "movie";
        if (entity.startsWith("isbn:") || entity.startsWith("olid:")) {
          type = "book";
        } else if (entity.startsWith("tmdb:tv:")) {
          type = "tv";
        }

        twinsMap.set(entity, {
          id: entity,
          type,
          title: "",
          release_date: "",
          poster_url: "",
          last_engaged: time,
        });
      }
      const twin = twinsMap.get(entity);
      const field = attribute.replace("media/", "");
      twin[field] = parsedValue;
    } else if (attribute.startsWith("event/")) {
      if (!eventsMap.has(entity)) {
        eventsMap.set(entity, {
          id: entity,
          time,
        });
      }
      const event = eventsMap.get(entity);
      const field = attribute.replace("event/", "");
      event[field] = parsedValue;
    }
  }

  // Enrich twins with their events
  const twins = Array.from(twinsMap.values()) as EnrichedMedia[];
  const events = Array.from(eventsMap.values());

  for (const twin of twins) {
    twin.status = "saved"; // Default status
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
