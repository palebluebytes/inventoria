import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapTmdbMovieToPayload,
  mapTmdbTvToPayload,
  searchTmdbMovies,
  searchTmdbTv,
} from "../../src/lib/media/tmdb";
import {
  mapOpenLibraryBookToPayload,
  searchOpenLibrary,
} from "../../src/lib/media/open-library";
import { ingestionRegistry } from "../../src/lib/ingestion/registry";
import { logWatchEvent, logReadEvent } from "../../src/lib/media/engagement";
import { computeMediaLibraryState } from "../../src/lib/media/state";
import { asStored } from "./support/stored";

// tmdb.ts reads its key through the localStorage-backed secrets accessor now
// (ADR-0034 §8), not the settings store — stub it so searches get a live key.
vi.mock("../../src/lib/stores/secrets", () => ({
  getSecret: (key: string) => (key === "tmdb_api_key" ? "test-key" : ""),
}));

describe("mapTmdbMovieToPayload", () => {
  it("maps basic movie data correctly", () => {
    const movie = {
      id: 155,
      title: "The Dark Knight",
      release_date: "2008-07-16",
      poster_path: "/qJ2tWGB2Z1YECBiQx1qOYdcb5Un.jpg",
      credits: {
        crew: [
          { job: "Director", name: "Christopher Nolan" },
          { job: "Producer", name: "Emma Thomas" },
        ],
      },
    };

    const payload = mapTmdbMovieToPayload(movie);

    expect(payload.entity).toBe("tmdb:movie:155");
    expect(payload.attributes["media/title"]).toBe("The Dark Knight");
    expect(payload.attributes["media/director"]).toBe("Christopher Nolan");
    expect(payload.attributes["media/release_date"]).toBe("2008-07-16");
    expect(payload.attributes["media/poster_url"]).toBe(
      "https://image.tmdb.org/t/p/w500/qJ2tWGB2Z1YECBiQx1qOYdcb5Un.jpg"
    );
  });

  it("handles missing director and poster_path", () => {
    const movie = {
      id: 123,
      title: "Indie Film",
      release_date: "2025-01-01",
      poster_path: null,
      credits: { crew: [] },
    };

    const payload = mapTmdbMovieToPayload(movie);

    expect(payload.attributes["media/director"]).toBe("Unknown");
    expect(payload.attributes["media/poster_url"]).toBe("");
  });
});

describe("mapTmdbTvToPayload", () => {
  it("maps basic TV show data correctly", () => {
    const tv = {
      id: 1399,
      name: "Game of Thrones",
      first_air_date: "2011-04-17",
      poster_path: "/u3bZ6oqGRv8w6u5HGv9R16eii6m.jpg",
      created_by: [{ name: "David Benioff" }, { name: "D.B. Weiss" }],
    };

    // @ts-ignore
    const payload = mapTmdbTvToPayload(tv);

    expect(payload.entity).toBe("tmdb:tv:1399");
    expect(payload.attributes["media/title"]).toBe("Game of Thrones");
    expect(payload.attributes["media/director"]).toBe(
      "David Benioff, D.B. Weiss"
    );
    expect(payload.attributes["media/release_date"]).toBe("2011-04-17");
    expect(payload.attributes["media/poster_url"]).toBe(
      "https://image.tmdb.org/t/p/w500/u3bZ6oqGRv8w6u5HGv9R16eii6m.jpg"
    );
  });

  it("handles missing creator and poster_path", () => {
    const tv = {
      id: 999,
      name: "Unknown Show",
      first_air_date: "",
      poster_path: null,
      created_by: [],
    };

    // @ts-ignore
    const payload = mapTmdbTvToPayload(tv);

    expect(payload.attributes["media/director"]).toBe("Unknown");
    expect(payload.attributes["media/poster_url"]).toBe("");
  });
});

describe("mapOpenLibraryBookToPayload", () => {
  it("maps basic Open Library book correctly", () => {
    const book = {
      key: "/works/OL27479W",
      title: "1984",
      author_name: ["George Orwell"],
      first_publish_year: 1949,
      cover_i: 8358482,
      isbn: ["9780141187761"],
    };

    // @ts-ignore
    const payload = mapOpenLibraryBookToPayload(book);

    expect(payload.entity).toBe("isbn:9780141187761");
    expect(payload.attributes["media/title"]).toBe("1984");
    expect(payload.attributes["media/author"]).toBe("George Orwell");
    expect(payload.attributes["media/release_date"]).toBe("1949");
    expect(payload.attributes["media/poster_url"]).toBe(
      "https://covers.openlibrary.org/b/id/8358482-L.jpg"
    );
  });

  it("falls back to olid if isbn is missing", () => {
    const book = {
      key: "/works/OL27479W",
      title: "1984",
      author_name: ["George Orwell"],
      first_publish_year: 1949,
      cover_i: null,
      isbn: [],
    };

    // @ts-ignore
    const payload = mapOpenLibraryBookToPayload(book);

    expect(payload.entity).toBe("olid:OL27479W");
    expect(payload.attributes["media/poster_url"]).toBe("");
  });

  it("handles missing author and release date", () => {
    const book = {
      key: "/works/OL999W",
      title: "Untitled Book",
      author_name: [],
      first_publish_year: null,
      cover_i: null,
      isbn: [],
    };

    // @ts-ignore
    const payload = mapOpenLibraryBookToPayload(book);

    expect(payload.attributes["media/author"]).toBe("Unknown");
    expect(payload.attributes["media/release_date"]).toBe("");
  });
});

describe("searchOpenLibrary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the correct Open Library API URL and transforms results", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [
          {
            key: "/works/OL27479W",
            title: "1984",
            author_name: ["George Orwell"],
            first_publish_year: 1949,
            cover_i: 8358482,
            isbn: ["9780141187761"],
          },
        ],
      }),
    } as Response);

    const results = await searchOpenLibrary("1984");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://openlibrary.org/search.json?q=1984&fields=key,title,author_name,first_publish_year,cover_i,isbn,subject,description&limit=15"
    );
    expect(results.length).toBe(1);
    expect(results[0].entity).toBe("isbn:9780141187761");
    expect(results[0].attributes["media/title"]).toBe("1984");
  });

  it("handles fetch errors gracefully by returning empty array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const results = await searchOpenLibrary("fails");
    expect(results).toEqual([]);
  });
});

describe("lookupOpenLibraryBook (via Registry)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches book by isbn and maps payload correctly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [
          {
            key: "/works/OL27479W",
            title: "1984",
            author_name: ["George Orwell"],
            first_publish_year: 1949,
            cover_i: 8358482,
            isbn: ["9780141187761"],
            subject: ["Classic", "Dystopian"],
            description: "Dystopian classic",
          },
        ],
      }),
    } as Response);

    const result = await ingestionRegistry.resolve("isbn:9780141187761");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://openlibrary.org/search.json?q=isbn:9780141187761&fields=key,title,author_name,first_publish_year,cover_i,isbn,subject,description&limit=1"
    );
    expect(result.entity).toBe("isbn:9780141187761");
    expect(result.attributes["media/title"]).toBe("1984");
    expect(result.attributes["media/blurb"]).toBe("Dystopian classic");
    expect(JSON.parse(result.attributes["media/subject"])).toEqual([
      "Classic",
      "Dystopian",
    ]);
  });

  it("fetches book by olid and maps payload correctly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [
          {
            key: "/works/OL27479W",
            title: "1984",
            author_name: ["George Orwell"],
            first_publish_year: 1949,
            cover_i: 8358482,
            isbn: ["9780141187761"],
            subject: ["Classic", "Dystopian"],
            description: "Dystopian classic",
          },
        ],
      }),
    } as Response);

    const result = await ingestionRegistry.resolve("olid:OL27479W");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://openlibrary.org/search.json?q=key:%2Fworks%2FOL27479W&fields=key,title,author_name,first_publish_year,cover_i,isbn,subject,description&limit=1"
    );
    expect(result.entity).toBe("isbn:9780141187761");
  });

  it("throws error if response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
    } as Response);

    await expect(ingestionRegistry.resolve("isbn:123")).rejects.toThrow(
      "Book details not found"
    );
  });

  it("throws error if no docs are returned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    } as Response);

    await expect(ingestionRegistry.resolve("isbn:123")).rejects.toThrow(
      "Book details not found"
    );
  });
});

describe("searchTmdbMovies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls search movie endpoint and returns mapped movies", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 155,
            title: "The Dark Knight",
            release_date: "2008-07-16",
            poster_path: "/qJ2tWGB2Z1YECBiQx1qOYdcb5Un.jpg",
          },
        ],
      }),
    } as Response);

    const results = await searchTmdbMovies("Dark Knight", "test-key");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/search/movie?query=Dark%20Knight&api_key=test-key"
    );
    expect(results.length).toBe(1);
    expect(results[0].entity).toBe("tmdb:movie:155");
    expect(results[0].attributes["media/director"]).toBe("Unknown"); // Search results don't have credits
  });

  it("returns empty array on error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const results = await searchTmdbMovies("Dark Knight", "invalid-key");
    expect(results).toEqual([]);
  });
});

describe("searchTmdbTv", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls search tv endpoint and returns mapped tv shows", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 1399,
            name: "Game of Thrones",
            first_air_date: "2011-04-17",
            poster_path: "/u3bZ6oqGRv8w6u5HGv9R16eii6m.jpg",
          },
        ],
      }),
    } as Response);

    const results = await searchTmdbTv("Game of Thrones", "test-key");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/search/tv?query=Game%20of%20Thrones&api_key=test-key"
    );
    expect(results.length).toBe(1);
    expect(results[0].entity).toBe("tmdb:tv:1399");
    expect(results[0].attributes["media/director"]).toBe("Unknown");
  });

  it("returns empty array on error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const results = await searchTmdbTv("Game of Thrones", "invalid-key");
    expect(results).toEqual([]);
  });
});

describe("lookupTmdbMovie (via Registry)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls details movie endpoint and returns a mapped movie twin payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 155,
        title: "The Dark Knight",
        release_date: "2008-07-16",
        poster_path: "/qJ2tWGB2Z1YECBiQx1qOYdcb5Un.jpg",
        credits: {
          crew: [{ job: "Director", name: "Christopher Nolan" }],
        },
      }),
    } as Response);

    const payload = await ingestionRegistry.resolve("tmdb:movie:155");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/movie/155?append_to_response=credits&api_key=test-key"
    );
    expect(payload.entity).toBe("tmdb:movie:155");
    expect(payload.attributes["media/title"]).toBe("The Dark Knight");
    expect(payload.attributes["media/director"]).toBe("Christopher Nolan");
  });

  it("throws error when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    await expect(
      ingestionRegistry.resolve("tmdb:movie:999999")
    ).rejects.toThrow("Movie details not found for id: 999999");
  });
});

describe("lookupTmdbTv (via Registry)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls details tv endpoint and returns a mapped tv twin payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1399,
        name: "Game of Thrones",
        first_air_date: "2011-04-17",
        poster_path: "/u3bZ6oqGRv8w6u5HGv9R16eii6m.jpg",
        created_by: [{ name: "David Benioff" }],
      }),
    } as Response);

    const payload = await ingestionRegistry.resolve("tmdb:tv:1399");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/tv/1399?api_key=test-key"
    );
    expect(payload.entity).toBe("tmdb:tv:1399");
    expect(payload.attributes["media/title"]).toBe("Game of Thrones");
    expect(payload.attributes["media/director"]).toBe("David Benioff");
  });

  it("throws error when response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    await expect(ingestionRegistry.resolve("tmdb:tv:999999")).rejects.toThrow(
      "TV details not found for id: 999999"
    );
  });
});

describe("logWatchEvent", () => {
  it("creates a WatchAction event datom list with correct attributes", () => {
    const timestamp = 1234567890;
    const datoms = logWatchEvent(
      "tmdb:movie:155",
      "completed",
      {
        rating: 5,
        review: "Masterpiece",
      },
      timestamp
    );

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/type",
      value: "WatchAction",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/target",
      value: "tmdb:movie:155",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/status",
      value: "completed",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/rating",
      value: 5,
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/review",
      value: "Masterpiece",
      time: timestamp,
    });
  });

  it("handles optional season and episode attributes for TV", () => {
    const timestamp = 1234567890;
    const datoms = logWatchEvent(
      "tmdb:tv:1399",
      "progress",
      {
        season: 2,
        episode: 3,
      },
      timestamp
    );

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/season",
      value: 2,
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/episode",
      value: 3,
      time: timestamp,
    });
  });
});

describe("logReadEvent", () => {
  it("creates a ReadAction event datom list with correct attributes", () => {
    const timestamp = 1234567890;
    const datoms = logReadEvent(
      "isbn:9780141187761",
      "started",
      {
        pages_read: 120,
      },
      timestamp
    );

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/type",
      value: "ReadAction",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/target",
      value: "isbn:9780141187761",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/status",
      value: "started",
      time: timestamp,
    });

    expect(datoms).toContainEqual({
      entity: expect.stringMatching(/^event:engage_/),
      attribute: "event/pages_read",
      value: 120,
      time: timestamp,
    });
  });
});

describe("computeMediaLibraryState", () => {
  it("groups datoms into media twins with their latest engagement status", () => {
    const datoms = [
      // Twin: Dark Knight
      {
        entity: "tmdb:movie:155",
        attribute: "media/title",
        value: "The Dark Knight",
        time: 1000,
      },
      {
        entity: "tmdb:movie:155",
        attribute: "media/director",
        value: "Christopher Nolan",
        time: 1000,
      },
      {
        entity: "tmdb:movie:155",
        attribute: "media/release_date",
        value: "2008-07-16",
        time: 1000,
      },
      {
        entity: "tmdb:movie:155",
        attribute: "media/poster_url",
        value: "poster-url",
        time: 1000,
      },

      // Twin: 1984
      {
        entity: "isbn:9780141187761",
        attribute: "media/title",
        value: "1984",
        time: 2000,
      },
      {
        entity: "isbn:9780141187761",
        attribute: "media/author",
        value: "George Orwell",
        time: 2000,
      },

      // Event 1: Watch Dark Knight (Started)
      {
        entity: "event:engage_1",
        attribute: "event/type",
        value: "WatchAction",
        time: 3000,
      },
      {
        entity: "event:engage_1",
        attribute: "event/target",
        value: "tmdb:movie:155",
        time: 3000,
      },
      {
        entity: "event:engage_1",
        attribute: "event/status",
        value: "started",
        time: 3000,
      },

      // Event 2: Watch Dark Knight (Completed)
      {
        entity: "event:engage_2",
        attribute: "event/type",
        value: "WatchAction",
        time: 4000,
      },
      {
        entity: "event:engage_2",
        attribute: "event/target",
        value: "tmdb:movie:155",
        time: 4000,
      },
      {
        entity: "event:engage_2",
        attribute: "event/status",
        value: "completed",
        time: 4000,
      },
      {
        entity: "event:engage_2",
        attribute: "event/rating",
        value: "5",
        time: 4000,
      },
      {
        entity: "event:engage_2",
        attribute: "event/review",
        value: "Amazing",
        time: 4000,
      },

      // Event 3: Read 1984 (Started)
      {
        entity: "event:engage_3",
        attribute: "event/type",
        value: "ReadAction",
        time: 5000,
      },
      {
        entity: "event:engage_3",
        attribute: "event/target",
        value: "isbn:9780141187761",
        time: 5000,
      },
      {
        entity: "event:engage_3",
        attribute: "event/status",
        value: "started",
        time: 5000,
      },
    ];

    const result = computeMediaLibraryState(asStored(datoms));

    expect(result).toHaveLength(2);

    const darkKnight = result.find((m) => m.id === "tmdb:movie:155");
    expect(darkKnight).toBeDefined();
    expect(darkKnight?.title).toBe("The Dark Knight");
    expect(darkKnight?.director).toBe("Christopher Nolan");
    expect(darkKnight?.status).toBe("completed");
    expect(darkKnight?.rating).toBe(5);
    expect(darkKnight?.review).toBe("Amazing");

    const book1984 = result.find((m) => m.id === "isbn:9780141187761");
    expect(book1984).toBeDefined();
    expect(book1984?.title).toBe("1984");
    expect(book1984?.author).toBe("George Orwell");
    expect(book1984?.status).toBe("started");
    expect(book1984?.rating).toBeUndefined();
  });
});
