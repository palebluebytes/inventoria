/**
 * The `app` channel: what the app itself did, and what failed.
 *
 * ADR-0054's Context opened on these calls and then wrote a rule that excluded
 * every one of them, so a projection error wrote to a devtools console nobody
 * was watching and was unavailable at the moment it matters, which is after the
 * fact. ADR-0092 §5.3 reverses that, and the shape of the reversal is the point:
 * **the write also calls the matching `console.*` method**. One call site,
 * records *and* devtools output, which is what every framework does — so "which
 * of these survive as records and which stay devtools-only" stops being a
 * question. All of them do both.
 *
 * The channel is **jar-wide** (`domain: null`, ADR-0092 §13). Boot narration,
 * the storage-mode fallback and a database error belong to none of the six
 * Tracked Domains, and picking one arbitrarily would put database errors behind
 * Rations' export consent. What that costs is two filters pointing opposite
 * ways, both of them already built: `channelsOfFacet` admits this channel to
 * every Facet, because a Rations user's OPFS failure is written by Rations'
 * running code and Rations governs its disclosure; `facets/facet-wipe.ts`
 * excludes it from every Facet-scoped wipe, because that control is ADR-0079
 * §1's *delete all my food data* and the app's own narration is not that.
 *
 * **Three populations are printed and never recorded**, and the exclusions are
 * as load-bearing as the inclusions:
 *
 * - `db/db.worker.ts`'s eight sites. It is a real `new Worker()` and this
 *   facility is `localStorage` end to end, so they cannot reach it at all. The
 *   one fact worth keeping from them — whether the database opened on OPFS —
 *   crosses on the init reply instead and is recorded from `db.client.ts`. A
 *   worker-to-main logging bridge was refused: it is a second transport for
 *   records, which is a larger thing than this channel.
 * - `db.client.ts:50`'s per-message trace, which fires once per database query
 *   rather than once per boot. Recorded, it would turn a 100-record ring over
 *   roughly every fifty queries so that it never holds a boot at all, and would
 *   put a `localStorage` write on the DB message path.
 * - The two `[DEFERRED STUB]` markers, which mark unbuilt features rather than
 *   events.
 *
 * `scripts/console-routing-check.mjs` is what keeps that list honest: every one
 * of those files is an allowlist entry carrying its reason, and a `console.`
 * anywhere else fails the build.
 */

import {
  appendToChannel,
  defineChannel,
  SEVERITY,
  type SeverityNumber,
} from "./log-facility";

/**
 * One thing the app did or failed at.
 *
 * `msg` is the field ADR-0092 §5.3 did not have, and the Amendment of
 * 2026-09-05 says why: six call sites pass a bare error and no text of their
 * own, and `TypeError: x is not a function` with nothing saying what the user
 * was doing is a record of nothing. It is **the call site's own string
 * literal**, and it may be a template over values from a closed set — a Facet
 * name, a pipeline name — but never over a value read out of the ledger. That
 * is #227's discipline stated at the shape rather than left to a reviewer.
 *
 * `name` and `message` are the error's, and both are optional because three
 * sites have no error to report — a boot line is not a failure.
 *
 * **No stack trace**, on ADR-0092 §5.3's two grounds, neither of them privacy:
 * no `build.sourcemap` in `vite.config.ts`, so a production stack is minified
 * frame names, which is the thing it would be wanted for; and a stack is 1-3 KB
 * against a record measured in hundreds of bytes.
 */
export interface AppLogEntry {
  /** The call site's own words, truncated at {@link MSG_BYTES}. */
  msg: string;
  /** `err.name`, truncated at {@link NAME_BYTES}. Absent when there is no error. */
  name?: string;
  /** `err.message`, truncated at {@link MESSAGE_BYTES}. Absent likewise. */
  message?: string;
}

/**
 * The bound on `msg`, and it is nearly exhausted by a real site.
 *
 * `mount-facet.ts`'s cross-origin-isolation warning weighs **252 bytes** with
 * the longer Facet name in it, against this 256. ADR-0092 §7 chose the number
 * for `err.message`; the measurement is what justifies re-using it here rather
 * than picking something smaller because the other literals are short.
 */
const MSG_BYTES = 256;

/**
 * The bound on `err.name`, which ADR-0092 §7 did not have.
 *
 * §7 bounds `msg` and `message` and says nothing about `name`, and a custom
 * error class name is an arbitrary-length string — so without this there is no
 * maximum record for this channel and §8's invariant is not computable at all.
 * 64 clears every built-in error name several times over.
 */
const NAME_BYTES = 64;

/** The bound on `err.message`, ADR-0092 §7's own figure. */
const MESSAGE_BYTES = 256;

/**
 * The first `limit` bytes of a string, cut on a codepoint boundary.
 *
 * Bytes rather than characters, because the budget in ADR-0092 §8 is measured
 * in `TextEncoder` bytes and a bound in characters would not bound it. The
 * boundary matters: slicing a UTF-8 buffer mid-codepoint and decoding it yields
 * a replacement character, which is a corrupted record rather than a short one.
 */
function truncateBytes(value: string, limit: number): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length <= limit) return value;
  return new TextDecoder("utf-8", { fatal: false })
    .decode(encoded.subarray(0, limit))
    .replace(/�$/, "");
}

/**
 * The entry for one call, bounded.
 *
 * Pure and exported for the budget test, which builds the worst record this
 * shape admits and weighs it. A non-`Error` throw contributes nothing rather
 * than `"[object Object]"`: `err.name` and `err.message` are what §5.3 captures,
 * and a value that has neither has told us nothing the `msg` did not.
 */
export function appLogEntry(msg: string, err?: unknown): AppLogEntry {
  const entry: AppLogEntry = { msg: truncateBytes(msg, MSG_BYTES) };
  if (err instanceof Error) {
    if (err.name !== "") entry.name = truncateBytes(err.name, NAME_BYTES);
    if (err.message !== "")
      entry.message = truncateBytes(err.message, MESSAGE_BYTES);
  }
  return entry;
}

/**
 * A stored record read back.
 *
 * An unreadable record is kept, disclosed as a count, and removed only by the
 * cap or `Clear` — `parse` is not a deletion authority (ADR-0092 §3.1).
 */
function parseAppLogEntry(raw: unknown): AppLogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { msg, name, message } = raw as {
    msg?: unknown;
    name?: unknown;
    message?: unknown;
  };
  if (typeof msg !== "string") return null;
  if (name !== undefined && typeof name !== "string") return null;
  if (message !== undefined && typeof message !== "string") return null;
  return {
    msg,
    ...(name === undefined ? {} : { name }),
    ...(message === undefined ? {} : { message }),
  };
}

/** ADR-0092 §5.3's record, as the facility's third channel. */
export const APP_CHANNEL = defineChannel({
  name: "app",
  // Jar-wide, and the null is the true thing rather than an owner invented to
  // satisfy a rule written for something else (ADR-0092 §13).
  domain: null,
  purpose:
    "What the app itself did and what failed — startup, the database, and errors from any screen. It carries an error's name and its message, never a stack trace and never a value read out of your ledger.",
  // ADR-0092 §7's cap, on the argument its Amendment of 2026-09-05 restates:
  // the boot burst never priced this. At the default `Normal` the ring holds a
  // hundred error-class events and no narration at all, and that is the case
  // the number is for. At `Noisy` a cold boot is five records, so it holds
  // roughly twenty of them.
  cap: 100,
  // The shape above, as it stands. It moves under `ledger-export.ts`'s rule —
  // when a reader written against the previous version would misread a newer
  // record — per channel, so a change to `search` never invalidates these.
  version: 1,
  // No counters. ADR-0092 §9 requires a counter to total a field the entries
  // already record, and it exists because a capped ring cannot report a rate —
  // which needs a denominator, and this channel has no session.
  parse: parseAppLogEntry,
});

/**
 * Records one line and prints it, in that order.
 *
 * **The console call goes first, and that is not incidental.** Everything here
 * was a working `console.*` before this channel existed, and a `localStorage`
 * quota error inside `appendToChannel` must not take that away — a logging
 * facility that swallows the diagnostic it was added to keep is worse than no
 * facility. The record is the addition; the print is the floor.
 *
 * The facility's own guards mean the append cannot throw for any reason it
 * knows about, so the `try` is for what it does not: a store that refuses a
 * write. Nothing is reported when it fails, because the only place left to
 * report it is the console line that has already run.
 */
function write(
  level: SeverityNumber,
  print: (...args: unknown[]) => void,
  msg: string,
  err?: unknown
): void {
  if (err === undefined) print(msg);
  else print(msg, err);
  try {
    appendToChannel(APP_CHANNEL, appLogEntry(msg, err), level);
  } catch {
    // See above: the print has already happened, and there is nowhere else.
  }
}

/**
 * The app failed at something the user asked for (ADR-0092 §5, ERROR 17).
 *
 * One function per level rather than a `level` parameter, so the console method
 * cannot diverge from the severity: which function you called *is* the level,
 * which satisfies §12's every-write-names-a-level guard at the call site
 * without a fourth argument anybody can get wrong.
 */
export function appError(msg: string, err?: unknown): void {
  write(SEVERITY.ERROR, console.error, msg, err);
}

/**
 * A dependency failed or the app degraded, and the user may not have noticed
 * (ADR-0092 §5, WARN 13).
 *
 * Three sites, and the Amendment of 2026-09-05 is why it is three rather than
 * §5.3's one: cross-origin isolation missing, service worker registration
 * failed, and the database opened in memory. Each says the same class of thing —
 * *the app is running in a shape you did not ask for and cannot see*.
 */
export function appWarn(msg: string, err?: unknown): void {
  write(SEVERITY.WARN, console.warn, msg, err);
}

/**
 * The app did something the user asked for and cannot otherwise see a record of
 * (ADR-0092 §5, INFO 9).
 *
 * **One site, and it is a deletion.** The jar-wide wipe drops the whole
 * `datoms` table, so every ledger-side trace of it is destroyed by the act that
 * would have written one; the log lives in `localStorage`, which that wipe does
 * not touch, so this is the only place the act can leave a mark. A person who
 * later asks where everything went has an answer.
 *
 * **INFO rather than DEBUG, because DEBUG is not recorded by default.** The
 * dial's default position is `Normal`, whose threshold *is* INFO
 * (`DEFAULT_DIAL_POSITION` in `log-facility.ts`), so a wipe logged at DEBUG
 * would print and never be kept — coverage that looks like coverage and is
 * not. And not WARN:
 * the three sites there all say *the app is running in a shape you did not ask
 * for*, and a wipe the user confirmed is the opposite of that.
 *
 * It takes no error, for {@link appDebug}'s reason: a site with a failure to
 * report belongs at one of the two levels above.
 */
export function appInfo(msg: string): void {
  write(SEVERITY.INFO, console.info, msg);
}

/**
 * The app's internal trace (ADR-0092 §5, DEBUG 5).
 *
 * Takes no error: a boot line narrates something that worked, and a site with an
 * error to report is reporting a failure and belongs at one of the two levels
 * above. Captured only at `Noisy`, so at the default `Normal` none of this is
 * recorded and all of it still prints.
 */
export function appDebug(msg: string): void {
  write(SEVERITY.DEBUG, console.log, msg);
}
