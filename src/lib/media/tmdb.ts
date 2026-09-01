import type { EntityPayload } from "../ingestion/ingest";
import { mintEntity } from "../facets/entity-id";
import {
  ingestionRegistry,
  type IngestionAdapter,
} from "../ingestion/registry";
import { getSecret } from "../stores/secrets";

// Read the current key on demand (evaluated per call) from the localStorage-
// backed secrets accessor (ADR-0034 §8), rather than the EAVT ledger.
function activeTmdbKey(): string {
  return getSecret("tmdb_api_key");
}

export interface TmdbMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  credits?: {
    crew: Array<{
      job: string;
      name: string;
    }>;
  };
}

/**
 * Maps a TMDB movie details payload to an EntityPayload.
 */
export function mapTmdbMovieToPayload(movie: TmdbMovie): EntityPayload {
  const directorObj = movie.credits?.crew?.find((c) => c.job === "Director");
  const director = directorObj?.name || "Unknown";

  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "";

  return {
    entity: mintEntity("tmdb:movie:", movie.id),
    attributes: {
      "media/title": movie.title,
      "media/director": director,
      "media/release_date": movie.release_date || "",
      "media/poster_url": posterUrl,
    },
  };
}

export interface TmdbTv {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  created_by?: Array<{
    name: string;
  }>;
}

/**
 * Maps a TMDB TV details payload to an EntityPayload.
 */
export function mapTmdbTvToPayload(tv: TmdbTv): EntityPayload {
  const director = tv.created_by?.map((c) => c.name).join(", ") || "Unknown";

  const posterUrl = tv.poster_path
    ? `https://image.tmdb.org/t/p/w500${tv.poster_path}`
    : "";

  return {
    entity: mintEntity("tmdb:tv:", tv.id),
    attributes: {
      "media/title": tv.name,
      "media/director": director, // Maps TV creator(s) to media/director
      "media/release_date": tv.first_air_date || "",
      "media/poster_url": posterUrl,
    },
  };
}

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function searchTmdbMovies(
  query: string,
  apiKey: string = activeTmdbKey()
): Promise<EntityPayload[]> {
  if (!apiKey) return [];
  try {
    const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((m: any) => mapTmdbMovieToPayload(m));
  } catch (err) {
    return [];
  }
}

export async function searchTmdbTv(
  query: string,
  apiKey: string = activeTmdbKey()
): Promise<EntityPayload[]> {
  if (!apiKey) return [];
  try {
    const url = `${TMDB_BASE}/search/tv?query=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((t: any) => mapTmdbTvToPayload(t));
  } catch (err) {
    return [];
  }
}

export const tmdbMovieAdapter: IngestionAdapter<TmdbMovie> = {
  scheme: "tmdb:movie",
  map: mapTmdbMovieToPayload,
  fetch: async (idValue: string) => {
    const apiKey = activeTmdbKey();
    if (!apiKey) throw new Error("TMDB API Key is not configured.");
    const url = `${TMDB_BASE}/movie/${idValue}?append_to_response=credits&api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Movie details not found for id: ${idValue}`);
    return res.json();
  },
};

export const tmdbTvAdapter: IngestionAdapter<TmdbTv> = {
  scheme: "tmdb:tv",
  map: mapTmdbTvToPayload,
  fetch: async (idValue: string) => {
    const apiKey = activeTmdbKey();
    if (!apiKey) throw new Error("TMDB API Key is not configured.");
    const url = `${TMDB_BASE}/tv/${idValue}?api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TV details not found for id: ${idValue}`);
    return res.json();
  },
};

// Register adapters automatically when this file is imported
ingestionRegistry.register(tmdbMovieAdapter);
ingestionRegistry.register(tmdbTvAdapter);
