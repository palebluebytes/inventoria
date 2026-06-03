import type { EntityPayload } from "../ingestion/ingest";

export interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number | null;
  isbn?: string[];
  subject?: string[];
  description?: string | { type: string; value: string };
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

  const blurb = !book.description
    ? ""
    : typeof book.description === "object"
      ? book.description.value
      : book.description;

  const subject = JSON.stringify(book.subject || []);

  return {
    entity,
    attributes: {
      "media/title": book.title,
      "media/author": author,
      "media/release_date": releaseDate,
      "media/poster_url": posterUrl,
      "media/blurb": blurb,
      "media/subject": subject,
      "media/first_publish_year": book.first_publish_year
        ? String(book.first_publish_year)
        : "",
    },
  };
}

const OL_SEARCH_BASE = "https://openlibrary.org/search.json";

export async function searchOpenLibrary(
  query: string
): Promise<EntityPayload[]> {
  try {
    const url = `${OL_SEARCH_BASE}?q=${encodeURIComponent(query)}&fields=key,title,author_name,first_publish_year,cover_i,isbn,subject,description&limit=15`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs || []).map(mapOpenLibraryBookToPayload);
  } catch (err) {
    return [];
  }
}

export async function lookupOpenLibraryBook(
  id: string
): Promise<EntityPayload> {
  const parts = id.split(":");
  const prefix = parts[0];
  const value = parts[1];

  let query = "";
  if (prefix === "isbn") {
    query = `isbn:${value}`;
  } else if (prefix === "olid") {
    query = `key:${encodeURIComponent("/works/" + value)}`;
  } else {
    throw new Error(`Unsupported book ID format: ${id}`);
  }

  const url = `${OL_SEARCH_BASE}?q=${query}&fields=key,title,author_name,first_publish_year,cover_i,isbn,subject,description&limit=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Book details not found for id: ${id}`);
  }
  const data = await res.json();
  if (!data.docs || data.docs.length === 0) {
    throw new Error(`Book details not found for id: ${id}`);
  }
  return mapOpenLibraryBookToPayload(data.docs[0]);
}
