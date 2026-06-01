import type { EntityPayload } from "../ingestion/ingest";

export interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number | null;
  isbn?: string[];
}

/**
 * Maps an Open Library search doc to an EntityPayload.
 */
export function mapOpenLibraryBookToPayload(
  book: OpenLibraryBook
): EntityPayload {
  const isbn = book.isbn && book.isbn.length > 0 ? book.isbn[0] : null;
  const olid = book.key.replace(/^\/(works|books)\//, "");
  const entity = isbn ? `isbn:${isbn}` : `olid:${olid}`;

  const author =
    book.author_name && book.author_name.length > 0
      ? book.author_name.join(", ")
      : "Unknown";

  const releaseDate = book.first_publish_year
    ? String(book.first_publish_year)
    : "";

  const posterUrl = book.cover_i
    ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
    : "";

  return {
    entity,
    attributes: {
      "media/title": book.title,
      "media/author": author,
      "media/release_date": releaseDate,
      "media/poster_url": posterUrl,
    },
  };
}

const OL_SEARCH_BASE = "https://openlibrary.org/search.json";

export async function searchOpenLibrary(
  query: string
): Promise<EntityPayload[]> {
  try {
    const url = `${OL_SEARCH_BASE}?q=${encodeURIComponent(query)}&limit=15`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs || []).map(mapOpenLibraryBookToPayload);
  } catch (err) {
    return [];
  }
}
