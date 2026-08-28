/**
 * Where a ledger import reads from on this particular browser (ADR-0067), and
 * the mirror of {@link ./export-target}.
 *
 * A `File` the user picked is a handle rather than its contents, so it can be
 * streamed, and it can be streamed twice. That is what the import's two passes
 * need: one to check the file, one to write it. Nothing here is about the
 * ledger; everything that decides what a line means is pure and lives in
 * `src/lib/db/ledger-import.ts`.
 */

import type { ImportChunkSource } from "../../db/ledger-import";

/** The suffix the export writes, offered to the file dialog as a filter. */
export const LEDGER_IMPORT_ACCEPT = ".ndjson,application/x-ndjson";

/**
 * The file's text, decoded a chunk at a time, ready to be read again.
 *
 * The decoder is fed with `stream: true` because a chunk boundary falls
 * wherever the disk put it, which for base64 photo values is routinely in the
 * middle of a multi-byte character. Decoding each chunk on its own would put a
 * replacement character there and silently corrupt a datom.
 */
export function fileChunks(file: File): ImportChunkSource {
  return async function* () {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
      const tail = decoder.decode();
      if (tail.length > 0) yield tail;
    } finally {
      reader.releaseLock();
    }
  };
}
