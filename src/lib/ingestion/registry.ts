import type { EntityPayload } from "./ingest";

export interface IngestionAdapter<RawT = any> {
  /** The prefix schema to match, e.g., 'tmdb:movie' or 'isbn' */
  scheme: string;
  /** The pure mapping function isolating domain conversion */
  map: (raw: RawT) => EntityPayload;
  /** The isolated network fetcher */
  fetch: (idValue: string) => Promise<RawT>;
}

class Registry {
  private adapters = new Map<string, IngestionAdapter>();

  register(adapter: IngestionAdapter) {
    this.adapters.set(adapter.scheme, adapter);
  }

  async resolve(globalId: string): Promise<EntityPayload> {
    let matchedAdapter: IngestionAdapter | null = null;
    let idValue = "";

    // Sort by longest scheme first to handle "tmdb:movie" before "tmdb" (if both existed)
    const schemes = Array.from(this.adapters.keys()).sort(
      (a, b) => b.length - a.length
    );

    for (const scheme of schemes) {
      if (globalId.startsWith(scheme + ":")) {
        matchedAdapter = this.adapters.get(scheme)!;
        idValue = globalId.substring(scheme.length + 1);
        break;
      }
    }

    if (!matchedAdapter) {
      throw new Error(`No ingestion adapter registered for ID: ${globalId}`);
    }

    // Isolate fetch from map
    const raw = await matchedAdapter.fetch(idValue);
    const payload = matchedAdapter.map(raw);

    // Attach immutable provenance metadata
    payload.attributes["provenance/raw"] = JSON.stringify({
      timestamp: Date.now(),
      adapter: matchedAdapter.scheme,
      raw_data: raw,
    });

    return payload;
  }
}

export const ingestionRegistry = new Registry();
