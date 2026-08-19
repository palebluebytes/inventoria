/**
 * Reading the records out of a FoodData Central bulk archive, for
 * `scripts/usda-backup.mjs` and `scripts/usda-coverage.mjs` (ADR-0045).
 *
 * Why this exists: the manifest's `records` field drifted unnoticed because
 * nothing checked it. Foundation's 2026-04-30 archive states 395 array entries,
 * 32 of which are literally `null` — so anyone sizing a bundle or a coverage
 * claim off the array length is out by 9%. Verification now measures the number
 * instead of restating it.
 *
 * Two constraints shape the implementation. The mirror check runs on a bare
 * GitHub runner with no `pnpm install`, so this is Node built-ins only; and SR
 * Legacy expands to 210 MB of JSON, so nothing here ever holds the parsed
 * document — the counter walks the inflate stream a chunk at a time and keeps
 * only two integers, or a single record while a reader is looking at it.
 */

import { createInflateRaw } from "node:zlib";

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const COMMA = 0x2c;
const LOWER_N = 0x6e;

/** Whitespace, and the `:` between a key and its value — never a value itself. */
const isSkippable = (byte) =>
  byte === 0x20 ||
  byte === 0x09 ||
  byte === 0x0a ||
  byte === 0x0d ||
  byte === 0x3a;

/**
 * A streaming count of the array under `root_key`, optionally handing each
 * record to `onRecord` as its JSON text.
 *
 * Scanning bytes rather than characters is deliberate: every structural
 * character in JSON is ASCII and every UTF-8 continuation byte is >= 0x80, so a
 * chunk boundary can fall mid-character without the scanner noticing. It tracks
 * nesting depth and string state, which is all that is needed to tell a comma
 * separating two records from one inside a food description.
 *
 * `found` distinguishes an empty array from a key that is not there. A counter
 * that returned a bare 0 for both would turn a renamed root key into a silent
 * pass, which is the failure this whole check exists to prevent.
 *
 * `onRecord` is what lets a caller measure the records rather than only tally
 * them, at one record of memory instead of the whole document: SR Legacy
 * expands to 210 MB of JSON, so a coverage measurement that parsed the array
 * would have to hold all of it. Nothing is buffered unless a reader asks for it,
 * and null slots are never handed over — they are absence, not records.
 */
export function createRecordCounter(root_key, onRecord) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  /** Bytes of the string being read, or null while one cannot be the root key. */
  let keyBytes = [];
  let lastKey = "";
  /** Depth at which the target array's elements sit; 0 while outside it. */
  let arrayDepth = 0;
  let found = false;
  let inSlot = false;
  /** True while the open slot holds a record rather than a `null`. */
  let slotIsRecord = false;
  let records = 0;
  let null_entries = 0;
  /** Bytes of the open record carried over from earlier chunks. */
  let carried = [];

  return {
    push(chunk) {
      // Where the open record starts in THIS chunk: 0 when one is already open
      // from an earlier chunk, -1 while none is. Slicing the chunk once per
      // record beats appending 210 MB one byte at a time.
      let start = onRecord && inSlot && slotIsRecord ? 0 : -1;

      /** A value has started at element level, so an array slot begins here. */
      const beginSlot = (byte, at) => {
        if (!arrayDepth || depth !== arrayDepth || inSlot) return;
        inSlot = true;
        // `null` is the only value that can begin with an `n` at element level,
        // and Foundation's archive ends in a run of them. They are slots, not
        // records.
        slotIsRecord = byte !== LOWER_N;
        if (slotIsRecord) records++;
        else null_entries++;
        if (onRecord && slotIsRecord) start = at;
      };

      /** The open slot ends before `at`; a record's text goes to the reader. */
      const endSlot = (at) => {
        inSlot = false;
        if (!onRecord || !slotIsRecord || start === -1) {
          start = -1;
          carried = [];
          return;
        }
        const tail = chunk.subarray(start, at);
        const text = carried.length
          ? Buffer.concat([...carried, tail]).toString("utf8")
          : tail.toString("utf8");
        start = -1;
        carried = [];
        onRecord(text.trim());
      };

      for (let i = 0; i < chunk.length; i++) {
        const byte = chunk[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (byte === BACKSLASH) escaped = true;
          else if (byte === QUOTE) {
            inString = false;
            if (keyBytes) {
              lastKey = Buffer.from(keyBytes).toString("utf8");
              keyBytes = null;
            }
            continue;
          }
          if (keyBytes) keyBytes.push(byte);
          continue;
        }
        if (byte === QUOTE) {
          beginSlot(byte, i);
          inString = true;
          // Only the keys of the root object can name the array, so nothing
          // deeper is worth buffering — and buffering it would mean holding a
          // 210 MB document's strings one by one.
          keyBytes = !found && depth <= 1 ? [] : null;
          continue;
        }
        if (byte === OPEN_BRACE || byte === OPEN_BRACKET) {
          beginSlot(byte, i);
          depth++;
          if (!found && byte === OPEN_BRACKET && lastKey === root_key) {
            arrayDepth = depth;
            found = true;
          }
          continue;
        }
        if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
          depth--;
          // The array's own closing bracket ends the last slot; a record's
          // inner brackets close above `arrayDepth` and end nothing.
          if (arrayDepth && depth < arrayDepth) {
            arrayDepth = 0;
            if (inSlot) endSlot(i);
          }
          continue;
        }
        if (byte === COMMA) {
          if (arrayDepth && depth === arrayDepth && inSlot) endSlot(i);
          continue;
        }
        if (isSkippable(byte)) continue;
        beginSlot(byte, i);
      }

      if (start !== -1) {
        carried.push(chunk.subarray(start));
        start = -1;
      }
    },
    total() {
      return { found, records, null_entries };
    },
  };
}

/**
 * The entries of a zip, read from its central directory.
 *
 * The directory is authoritative rather than the local headers: a local header
 * may leave the sizes at zero and carry them in a trailing data descriptor
 * instead. Its name and extra-field lengths are still needed, because they are
 * allowed to differ from the directory's and they are what the payload sits
 * behind.
 */
function readZipEntries(zip) {
  const EOCD = 0x06054b50;
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;

  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 0xffff; i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1)
    throw new Error("not a zip: no end-of-central-directory record");

  const entries = [];
  let at = zip.readUInt32LE(eocd + 16);
  for (let n = zip.readUInt16LE(eocd + 10); n > 0; n--) {
    if (zip.readUInt32LE(at) !== CENTRAL)
      throw new Error(`corrupt zip: no central directory entry at ${at}`);
    const nameLength = zip.readUInt16LE(at + 28);
    const localAt = zip.readUInt32LE(at + 42);
    if (zip.readUInt32LE(localAt) !== LOCAL)
      throw new Error(`corrupt zip: no local header at ${localAt}`);
    entries.push({
      name: zip.toString("utf8", at + 46, at + 46 + nameLength),
      method: zip.readUInt16LE(at + 10),
      compressedSize: zip.readUInt32LE(at + 20),
      dataAt:
        localAt +
        30 +
        zip.readUInt16LE(localAt + 26) +
        zip.readUInt16LE(localAt + 28),
    });
    at +=
      46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return entries;
}

/**
 * Counts the records in a zipped FDC archive: `{ found, records, null_entries }`.
 * Each record's JSON text goes to `onRecord` when one is given.
 *
 * `zip` is the compressed bytes, which are small enough to hold (13 MB at the
 * largest); only what comes out of the inflater is streamed.
 */
export async function countArchiveRecords(zip, root_key, onRecord) {
  const entries = readZipEntries(zip);
  if (entries.length !== 1)
    throw new Error(
      `expected one entry in the archive, found ${entries.length}` +
        (entries.length ? `: ${entries.map((e) => e.name).join(", ")}` : "")
    );
  const [entry] = entries;
  const body = zip.subarray(entry.dataAt, entry.dataAt + entry.compressedSize);
  const counter = createRecordCounter(root_key, onRecord);

  // Every FDC archive is one deflated JSON file. Anything else is a shape change
  // worth stopping on rather than quietly widening to accept.
  if (entry.method !== 8)
    throw new Error(
      `${entry.name}: unsupported compression method ${entry.method}`
    );

  const inflate = createInflateRaw();
  inflate.on("data", (chunk) => counter.push(chunk));
  await new Promise((resolve, reject) => {
    inflate.on("end", resolve);
    inflate.on("error", reject);
    inflate.end(body);
  });
  return counter.total();
}
