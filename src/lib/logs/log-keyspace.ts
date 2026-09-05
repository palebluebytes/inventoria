/**
 * The log facility's `localStorage` keyspace: **the only module that builds a
 * log key, and the only one that reads or writes under one** (#220).
 *
 * Four key shapes were held apart by comments. Three sit beside each other —
 * a channel's records, the pause list, the dial — and the fourth, a channel's
 * counters, sits *inside* the channel keyspace. That last one is what made the
 * collision hazard live rather than theoretical: the pause key was already
 * renamed once (`inventoria_log_paused` → `inventoria_logs_paused`) because a
 * channel *named* `paused` would have claimed it, and a channel named
 * `<x>_counters` claims `<x>`'s counter key with no rename available to fix it.
 * {@link keyCollision} is the guard that replaces both comments, and it is
 * derived from {@link channelKeys} rather than from the collisions somebody
 * thought of — so a fifth shape is guarded the day it is added rather than the
 * day it collides.
 *
 * **It owns the stored shape too, not just the name.** Reading one key as one
 * JSON array and removing it when the array empties was an assumption spread
 * across four private functions in `log-facility.ts`; anything that widened it
 * made every existing record read as malformed and vanish on the next write.
 * Here there is one reader and one writer per shape, and the shape is stated
 * where the key is built.
 *
 * **It keys off a channel's NAME, never a channel.** That is what keeps the
 * dependency one-way — `log-facility.ts` imports this and nothing here imports
 * it back — and it is also what a Facet-scoped wipe needs, since a wipe holds
 * channels and asks this module what keys they claim (`facets/facet-wipe.ts`,
 * ADR-0079 §2).
 *
 * The guarded accessors below are `stores/secrets.ts`'s arrangement, copied
 * rather than shared: `localStorage` is absent under the Node unit runner and
 * can throw outright in a privacy-locked browser, and ADR-0092 §3's rule is
 * that no feature fails because a log could not be written. A missing store
 * reads empty and writes as a no-op.
 */

/**
 * The channel keyspace's prefix. Every per-channel key starts with it, which is
 * what makes {@link channelKeys} enumerable and the reserved keys below safe by
 * being outside it.
 */
const LS_PREFIX = "inventoria_log_";

/**
 * The suffix a channel's counters key carries (ADR-0092 §9).
 *
 * **Inside the channel keyspace, deliberately and unavoidably**: the counters
 * belong to the channel, and no suffix is unclaimable while names are free
 * strings. So the collision is guarded rather than designed away.
 */
const COUNTERS_SUFFIX = "_counters";

/** The channels whose recording the user has switched off, as one JSON list. */
const LS_PAUSED_KEY = "inventoria_logs_paused";

/** The dial's threshold, as one number (ADR-0092 §4). */
const LS_DIAL_KEY = "inventoria_logs_level";

/** A key that is already spoken for, and what holds it. */
export interface HeldKey {
  key: string;
  /** What holds it, in the words a refusal uses. */
  heldBy: string;
}

/**
 * The keys the facility holds for itself rather than for a channel.
 *
 * Both sit **outside** the channel keyspace, by the single character between
 * `logs_` and `log_`, so no channel name reaches either and this arm of
 * {@link keyCollision} is vacuous today. It is derived and kept anyway: the
 * pause key was inside the keyspace once, and a note explaining why the next
 * key must stay outside is a note that has to be re-argued every time one is
 * added.
 *
 * Neither is a datom, and neither would be even if settings still could be
 * (ADR-0085 §1): both govern one device's instruments, and a switch that synced
 * would silence one on a device its owner has never seen. Neither is under any
 * domain's `localStorage` namespace either, so a Facet-scoped wipe leaves both
 * standing — they govern the jar's whole facility.
 */
export const RESERVED_KEYS: readonly HeldKey[] = [
  { key: LS_PAUSED_KEY, heldBy: "the facility's record of what is paused" },
  { key: LS_DIAL_KEY, heldBy: "the facility's capture dial" },
];

/**
 * Every key a channel of this name claims, whether or not it has written one.
 *
 * **Claimed, not occupied**: a channel that declares no counters still claims
 * its counters key, because it may declare some tomorrow and the key would then
 * already be somebody else's. The same list is what a Facet-scoped wipe takes,
 * so a fifth per-channel shape is wiped and guarded by the one edit — #311
 * found once already that a key nobody derived is a key the wipe reports
 * success without taking.
 */
export function channelKeys(name: string): string[] {
  return [recordsKey(name), countersKey(name)];
}

/** Where one channel's records live. */
function recordsKey(name: string): string {
  return `${LS_PREFIX}${name}`;
}

/**
 * Where one channel's counters live — **beside** the records rather than inside
 * them (ADR-0092 §9).
 *
 * ADR-0054's Amendment promises counters still stand when every entry has been
 * shed, and that promise is *false in code* while the two share a key:
 * {@link writeRecords} removes the key outright once the record list empties, so
 * redacting the last entry took the totals with it. A separate key is the only
 * shape under which the promise is literally true rather than
 * true-until-the-ring-empties, and it keeps a few integers out of the byte
 * measurement the shared budget takes, which the Amendment already argued.
 */
function countersKey(name: string): string {
  return `${recordsKey(name)}${COUNTERS_SUFFIX}`;
}

/**
 * Every log key already spoken for, given the channels registered so far.
 *
 * Takes the names rather than reading a registry, so it is pure and the caller
 * that owns the registry stays the only thing that knows about one.
 */
export function heldKeys(registered: Iterable<string>): HeldKey[] {
  const held = [...RESERVED_KEYS];
  for (const name of registered)
    for (const key of channelKeys(name))
      held.push({ key, heldBy: `log channel "${name}"` });
  return held;
}

/**
 * The first key `name` would claim that something already holds, or `null`.
 *
 * Whole key sets against whole key sets, which is what makes it symmetric: it
 * refuses `notes_counters` after `notes` and `notes` after `notes_counters`,
 * where a one-directional check written from the collision somebody noticed
 * would catch one order and pass the other.
 */
export function keyCollision(
  name: string,
  held: readonly HeldKey[]
): HeldKey | null {
  const claimed = new Set(channelKeys(name));
  return held.find(({ key }) => claimed.has(key)) ?? null;
}

// ---------------------------------------------------------------------------
// The guarded accessors
// ---------------------------------------------------------------------------

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    /* quota-exceeded / privacy-locked — the record just isn't kept */
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    /* privacy-locked — there was nothing readable to clear either */
  }
}

/**
 * What one key holds, parsed, or `undefined` for a key that is absent or that
 * does not hold JSON at all.
 *
 * The two collapse into one answer because every reader below treats them the
 * same: a store that cannot be read holds nothing, which is §3's best-effort
 * rule rather than an error to report.
 */
function readJson(key: string): unknown {
  const raw = safeGet(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// The four shapes
// ---------------------------------------------------------------------------

/**
 * One channel's stored records, unparsed. `[]` for anything that is not a JSON
 * array — the envelope inside each one is `log-facility.ts`'s to read.
 */
export function readRecords(name: string): unknown[] {
  const parsed = readJson(recordsKey(name));
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * A list-valued key, or no key at all: **the facility never stores an empty
 * list.** Both list shapes below go through it, so neither can drift into
 * leaving `[]` behind for the other's reader to weigh, enumerate or count.
 *
 * It is also the clause that makes a channel's counters need a key of their own
 * (ADR-0092 §9): the records key vanishes the moment the ring empties, so a
 * counter sharing it would go with the last entry redacted.
 */
function writeListOrRemove(key: string, list: unknown[]): void {
  if (list.length === 0) safeRemove(key);
  else safeSet(key, JSON.stringify(list));
}

/** Replaces one channel's records. */
export function writeRecords(name: string, records: unknown[]): void {
  writeListOrRemove(recordsKey(name), records);
}

/**
 * The counter key's contents before a declaration is read over them: both
 * halves still untrusted.
 */
export interface StoredCounters {
  counts: Record<string, unknown>;
  /** `null` for a stamp the store cannot be read for. */
  since: number | null;
}

/**
 * What one channel's counter key holds, as far as the store can be trusted for
 * it.
 *
 * **The two halves degrade separately**, because they fail for different
 * reasons and one is recoverable: totals whose stamp is unreadable are still
 * totals, and re-stamping them understates the window they were taken over
 * rather than overstating the rate. Only a blob that is not an object at all
 * reads as no set, and then the next tally starts from zero at a new epoch.
 *
 * That is not the *kept and disclosed* rule a record gets, deliberately: a
 * record is content somebody may want back and the review has a place to say it
 * exists, where a total nothing can read is a number with no honest rendering.
 */
export function readCounters(name: string): StoredCounters | null {
  const parsed = readJson(countersKey(name));
  if (typeof parsed !== "object" || parsed === null) return null;
  const { counts, since } = parsed as { counts?: unknown; since?: unknown };
  return {
    counts:
      typeof counts === "object" && counts !== null
        ? (counts as Record<string, unknown>)
        : {},
    since: typeof since === "number" ? since : null,
  };
}

/** Replaces one channel's counters and the epoch they run from. */
export function writeCounters(
  name: string,
  counters: { counts: Record<string, number>; since: number }
): void {
  safeSet(countersKey(name), JSON.stringify(counters));
}

/**
 * Every key a channel of this name holds, gone.
 *
 * Derived from {@link channelKeys} rather than naming the two, so clearing a
 * channel and wiping a Facet take the same set and neither can fall behind the
 * other.
 */
export function clearChannelKeys(name: string): void {
  for (const key of channelKeys(name)) safeRemove(key);
}

/** The names of the channels whose recording is switched off. */
export function readPausedNames(): string[] {
  const parsed = readJson(LS_PAUSED_KEY);
  return Array.isArray(parsed)
    ? parsed.filter((n): n is string => typeof n === "string")
    : [];
}

/** Replaces that list. */
export function writePausedNames(names: string[]): void {
  writeListOrRemove(LS_PAUSED_KEY, names);
}

/**
 * The stored dial threshold as a number, or `null` for a store that holds none
 * **or holds something that is not a number** — a hand edit, a half-written
 * value, a downgrade. The two collapse the way every other read here collapses
 * them: a key that cannot be read holds nothing.
 *
 * Whether the number is one of the three positions is the facility's question,
 * not this module's: the keyspace knows the key holds a number and nothing
 * about what the numbers mean.
 */
export function readDialValue(): number | null {
  const raw = safeGet(LS_DIAL_KEY);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Moves the stored dial. */
export function writeDialValue(value: number): void {
  safeSet(LS_DIAL_KEY, String(value));
}
