/**
 * The local log facility (ADR-0092): one module owning every local diagnostic
 * and instrumentation record this app keeps.
 *
 * **Every record carries a level, and the level decides exactly one thing:
 * whether the record is captured at all** (§1, §4). It decides nothing about
 * retention — §6 keeps the last `cap` records by age, because a log is read as a
 * sequence and shedding by level deletes the context around the record it saves
 * — and nothing about disclosure, since §10.1 withdrew the export filter. What a
 * level buys after capture is that a reader can tell an error from a boot line
 * without parsing either.
 *
 * A **channel** is a namespace and a consent unit, never a gate. It owns one
 * `localStorage` key, names the Tracked Domain whose act writes it, declares the
 * prose that says what it is for, and is the unit the export selection and the
 * per-channel recording pause are chosen over. ADR-0054 §1's *channels rather
 * than levels* and §2's *no channel without a reader and an open question* are
 * both superseded: two of the three channels have no question, and `purpose` is
 * what the anti-sprawl gate left behind.
 *
 * A channel may also declare **counters** (§9): named whole numbers that only
 * ever increase, live under a key of their own, are never shed, and are cleared
 * only when the channel is. They exist because a capped ring cannot report a
 * rate — a total taken over the last `cap` records wears a lifetime label it has
 * not earned — and they are the facility's one permanent part. The write tallies
 * **above** the dial's gate and **below** the pause; {@link appendToChannel}
 * carries why each way round.
 *
 * Records live in `localStorage`, one namespaced key per channel, **never in the
 * ledger** (§3). `src/lib/stores/secrets.ts` states the principle in its own
 * header — "The ledger is undeletable and it syncs" — and this facility needs
 * both properties for the same reasons: a redaction is a deletion, the cap
 * removes entries, and nothing here may travel to a second device. The guarded
 * accessors are that module's arrangement, copied rather than shared because
 * they are the whole of what the two have in common; they live one module down,
 * in `log-keyspace.ts`, which owns every log key and every read and write under
 * one. **This module never builds a key and never touches `localStorage`.**
 *
 * **There is no transport and there never will be** (§11), and that, with the
 * review the export is conditional on, is now the **whole** of the protection.
 * No sink, no endpoint, no optional remote mode: the only way a record leaves the
 * device is a file the user exports by hand after reading it.
 * `scripts/log-egress-check.mjs` holds that as a claim about the program rather
 * than about this file's text — the import closure of `src/lib/logs/` names no
 * way out of the browser, and the vehicle that does is one named module beside
 * the screen that calls it — because the distinction ADR-0053 rests on, that a
 * local record is not telemetry, holds only while it is structurally true.
 *
 * **On its length**, which is still past `CODING_STANDARDS.md` §4's thousand
 * lines: about three fifths of it is this commentary, and the code under that
 * is a little under four hundred lines. The seam that came out is the one that
 * runs the right way — the keyspace is a layer *below* every part of this file,
 * so `log-keyspace.ts` is a module nothing here has a cycle with and the
 * dependency points one way (#220). The seams that would divide this file
 * *across* still run the wrong way: the facility reaches into the dial from
 * `appendToChannel` and into the counters from `buildLogExport`, so splitting
 * by feature is three modules with a cycle through two of them, dividing one
 * channel's life across the files that own its parts — where ADR-0092 §1 puts a
 * channel's whole life in one place on purpose.
 */

import { domainsOf, type TrackedDomainId } from "../facets/registry";
import {
  clearChannelKeys,
  heldKeys,
  keyCollision,
  readCounters,
  readDialValue,
  readPausedNames,
  readRecords,
  writeCounters,
  writeDialValue,
  writePausedNames,
  writeRecords,
} from "./log-keyspace";

/**
 * The four levels, on OpenTelemetry's `SeverityNumber` scale (ADR-0092 §5).
 *
 * The rule that assigns them, which is the whole of it:
 *
 * > **ERROR (17)** — the app failed at something the user asked for.
 * > **WARN (13)** — a dependency failed or the app degraded, and the user may
 * > not have noticed.
 * > **INFO (9)** — something the user did, which completed.
 * > **DEBUG (5)** — the app's internal trace, *and any field whose only reader
 * > is a person reproducing a bug*.
 *
 * A record's level is **the severity of what happened, not the importance of the
 * record**: an empty search is a WARN because the app failed to answer, not
 * because #142 wants to read it.
 *
 * **Four anchors and nothing between them, and no FATAL.** The dial reads three
 * thresholds and §6 reads no level at all, so a fifth value would change capture
 * for nothing and buy a table nobody can hold in their head.
 *
 * **Ascending, which is not the universal direction.** #264 found winston
 * descending, Go's `slog` negative and `os_log` not ordinal at all. OTel's is
 * taken because a numeric threshold is what makes "a position includes anything
 * more severe" true without a table.
 */
export const SEVERITY = {
  ERROR: 17,
  WARN: 13,
  INFO: 9,
  DEBUG: 5,
} as const;

/** One of the four anchors above. Never a bare `number` (§12). */
export type SeverityNumber = (typeof SEVERITY)[keyof typeof SEVERITY];

/**
 * A registered channel. Constructed only by {@link defineChannel}, which is what
 * makes a declaration and a registration the same act.
 */
export interface LogChannel<E> {
  /** The `localStorage` key suffix and the label in the review UI. */
  readonly name: string;
  /**
   * The Tracked Domain whose act writes this channel, or **`null` for a
   * jar-wide channel** the app itself authors (ADR-0092 §13).
   *
   * A **domain** rather than a Facet, because ADR-0086 §1 leaves no other kind
   * of owner: the root holds all six domains, so under Facet-ownership every
   * channel would have two owners.
   *
   * `null` says the true thing rather than inventing an owner to satisfy a rule
   * written for something else — boot narration and database errors belong to
   * none of the six, and picking one arbitrarily would put a database error
   * behind Rations' export consent. What it then means costs **two** filters
   * rather than one, and they point opposite ways: {@link channelsOfFacet}
   * admits such a channel to **every** Facet, because a Rations user's OPFS
   * failure is written by Rations' running code and Rations governs its
   * disclosure; `facets/facet-wipe.ts` excludes it from **every** Facet-scoped
   * wipe, because that control is ADR-0079 §1's *delete all my food data* and
   * the app's own narration is not that. Deletion is irreversible, so it stays
   * jar-wide while visibility and export follow the writer.
   */
  readonly domain: TrackedDomainId | null;
  /**
   * What this channel is for, in prose (§2).
   *
   * It was `reader`, naming *a consumer and the decision it takes*, which was
   * ADR-0054 §2's anti-sprawl discipline and is a lie on two of the three
   * channels. The prose gets **more** load-bearing rather than less: with §11's
   * classification refused it is the only thing on the review sheet that says
   * what a channel contains before somebody hands the file over.
   */
  readonly purpose: string;
  /** Maximum entries retained, oldest dropped. */
  readonly cap: number;
  /**
   * The version of THIS channel's entry shape, stamped onto every record it
   * writes and required of every record it reads (#215, #229).
   *
   * Per channel, deliberately: no supported-versions list, no range, and no
   * facility-wide constant — one number for the facility would mean a change to
   * `search`'s shape invalidating `app`'s records.
   *
   * The move-rule is `db/ledger-export.ts`'s, quoted rather than restated: it
   * moves when a reader written against the previous version would misread a
   * newer record, and adding a field an old reader can ignore does not move it.
   */
  readonly version: number;
  /**
   * The counters this channel keeps: named whole numbers that only ever
   * increase, are never shed, are not subject to the cap, and are cleared only
   * when the channel is (§9).
   *
   * **A declared literal array, not a name space a function invents.** The
   * cardinality bound is then an invariant the type system holds and the write
   * path enforces, rather than a rule a reviewer might apply to a
   * `(entry) => string[]` they cannot see the range of — an unbounded name
   * space is a cardinality explosion in a 5 MB store. It also makes the export
   * self-describing: a counter that has never fired reads zero rather than
   * being silently absent.
   *
   * Declared with {@link tally} or not at all, in both directions (§12).
   */
  readonly counters?: readonly string[];
  /**
   * What one entry adds, as the counter names it contributes to — each
   * occurrence a separate increment, so an entry may count twice.
   *
   * A function over the **whole entry**, which is what admits a counter derived
   * from a pair of fields (ADR-0071 §5's `unreachable`-then-a-door) without the
   * facility knowing the shape. It is handed the entry the channel built, never
   * the envelope, exactly as {@link parse} hands one back.
   *
   * **It is a running total of a field the entries already record, and never a
   * new fact.** A counter that measures something no entry carries is a second
   * instrument wearing a counter's name, and nothing in the review would show
   * what it is counting.
   *
   * The **declaration** types this over `E` and over the declared counter names;
   * what is stored erases both, exactly as `purpose: P` narrows at the call site
   * and is held as a plain `string` here. The erasure is what keeps a channel
   * usable as a `LogChannel<unknown>` — `E` in a parameter position would make
   * every erased surface, from the review sheet to the wipe, unable to hold one —
   * and it costs nothing, because the only caller is {@link appendToChannel},
   * which has the entry's real type in hand.
   */
  readonly tally?: (entry: unknown) => readonly string[];
  /**
   * Reads one stored record back into the channel's shape, or `null` for
   * anything it does not recognise. Stored JSON is not a typed boundary — it
   * survives a downgrade, a hand edit and a half-written shape — so a channel
   * owns the parse of its own records, and this is also what infers `E` for
   * every function below.
   *
   * It is handed the **entry**, never the envelope around it (§3.1): the
   * facility owns `v` and the channel owns everything inside. It is also never a
   * deletion authority — a record it cannot read is kept, disclosed as
   * unreadable, and removed only by the cap, the shared budget or `Clear`.
   */
  readonly parse: (raw: unknown) => E | null;
}

/**
 * The type a blank `purpose` collapses to, so §12's compile-time guard is an
 * error at the call site rather than a review comment. The brand's name is what
 * the error message says.
 *
 * Compile-time rather than runtime because registration is an import side
 * effect (#221): a throw at declaration is either a boot crash or a channel that
 * silently vanishes from the review and the export.
 */
interface ChannelNeedsAStatedPurpose {
  readonly __a_channel_needs_a_stated_purpose: never;
}

/**
 * The type a lone `tally` collapses to, the same device the purpose guard uses
 * and for the same reason: the brand's name is what the error message says.
 */
interface ATallyNeedsTheCountersItTotals {
  readonly __a_tally_needs_the_counters_it_totals: never;
}

/** What a channel declares, before the two guards are layered over it. */
interface ChannelFields<E> {
  name: string;
  domain: TrackedDomainId | null;
  purpose: string;
  cap: number;
  version: number;
  counters?: readonly string[];
  tally?: (entry: unknown) => readonly string[];
  parse: (raw: unknown) => E | null;
}

/**
 * The counter half of a declaration: **both fields or neither**, and a `tally`
 * that may name only what `counters` declared (§12).
 *
 * A union rather than two optional fields, because that is what makes the
 * dependency between them a thing the compiler holds. `C` is inferred from the
 * `counters` array alone — `NoInfer` keeps the tally's own return from widening
 * it back to `string`, which would give the guard back with the bound removed —
 * and `entry` is contextually typed from `parse`'s `E` for the same reason.
 */
type CounterDeclaration<E, C extends string> =
  | { counters?: undefined; tally?: ATallyNeedsTheCountersItTotals }
  | {
      counters: readonly C[];
      tally: (entry: NoInfer<E>) => readonly NoInfer<C>[];
    };

/**
 * A channel declaration. `purpose` is a literal string in code, deliberately: a
 * purpose assembled at runtime is a purpose nobody wrote down, and the
 * conditional below rejects the widened `string` for that reason as much as it
 * rejects `""`.
 */
type ChannelDeclaration<E, P extends string, C extends string> = Omit<
  ChannelFields<E>,
  "purpose" | "counters" | "tally"
> & { purpose: P } & ("" extends P
    ? { purpose: ChannelNeedsAStatedPurpose }
    : unknown) &
  CounterDeclaration<E, C>;

const channels = new Map<string, LogChannel<unknown>>();

/**
 * Declares a channel and registers it in the same act, so the review surface
 * finds it without anyone maintaining a second list.
 *
 * **Four runtime throws, and only these four** (§12, and ADR-0092's Amendment
 * of 2026-09-05, which is where the fourth comes from): a whitespace-only
 * `purpose` (the type above catches the empty literal and the widened `string`,
 * but cannot see through a space), a cap that retains nothing, a name already
 * taken, and a name whose **derived keys** are somebody else's.
 *
 * The last two are not one check. A duplicate name is about the **registry**:
 * this `Map` is keyed by name, so the second declaration would silently replace
 * the first and the review would show one row where two channels are writing.
 * The keyspace check is about **`localStorage`**, and it is what catches the
 * pair a name comparison cannot see — `notes_counters` against `notes`, in
 * either order of arrival, where one channel's records key is the other's
 * counters key. That case was a comment in `log-keyspace.ts`'s predecessor and
 * is a guard here, derived from the key list rather than from the collisions
 * anybody enumerated (#220).
 *
 * `name` is deliberately **not** a central literal union. That would catch typos
 * only, duplicates would still need the check below, and it would declare a
 * channel's name away from the channel. `channels.ts` is a central list of
 * channel *modules*, which is a different thing and the one a build cannot
 * derive: it is what guarantees the registry below is full, and it says nothing
 * about what any channel is called (#221).
 */
export function defineChannel<E, P extends string, C extends string = never>(
  declaration: ChannelDeclaration<E, P, C>
): LogChannel<E> {
  // The guard's own boundary: the declared type exists to reject a blank
  // `purpose` at the call site, and the body below only ever reads the plain
  // fields underneath it. The module's other cast is `readRecord`'s, over stored
  // JSON, which is the genuine external boundary of the two.
  const { name, domain, purpose, cap, version, counters, tally, parse } =
    declaration as unknown as ChannelFields<E>;
  if (purpose.trim() === "")
    throw new Error(
      `Log channel "${name}" needs a purpose stating what it is for (ADR-0092 §2).`
    );
  if (cap < 1)
    throw new Error(`Log channel "${name}" needs a cap of at least one entry.`);
  if (channels.has(name))
    throw new Error(`Log channel "${name}" is already registered.`);
  const collision = keyCollision(name, heldKeys(channels.keys()));
  if (collision !== null)
    throw new Error(
      `Log channel "${name}" would claim the localStorage key "${collision.key}", which belongs to ${collision.heldBy}.`
    );
  const channel: LogChannel<E> = {
    name,
    domain,
    purpose,
    cap,
    version,
    counters,
    tally,
    parse,
  };
  channels.set(name, channel as LogChannel<unknown>);
  return channel;
}

/**
 * Every channel declared so far, in declaration order.
 *
 * **"Declared so far" is a property of the import graph, not of the app.** This
 * returns the channels whose modules have been evaluated, so a caller that
 * reaches it before the roster has been imported gets a short list and no
 * error. `channels.ts` is what makes the answer complete, and it re-exports
 * {@link channelsOfFacet} so that no surface has to know this (#221). Inside
 * this module the ordering is the roster's for the same reason — the registry
 * is filled by the roster's imports, in the roster's order.
 */
export function registeredChannels(): LogChannel<unknown>[] {
  return [...channels.values()];
}

/**
 * The channels one Facet carries: the jar-wide ones plus those written by a
 * domain it holds, in declaration order (ADR-0080 §2, ADR-0092 §13).
 *
 * **Derived, never declared.** A Facet already names its domains and a channel
 * already names the domain that writes it, so the Local Logs card is one
 * component parameterised by Facet id rather than a list per Facet — the shape
 * ADR-0080 §8 requires of every part of this split.
 *
 * **The `null` test is first, and it is not a convenience.** This builds a `Set`
 * of domain **id strings**, so a `null` domain is in no Facet's set at all — the
 * root's included, even though the root holds all six domains. Written as
 * `owned.has(channel.domain)` alone, a jar-wide channel would be invisible in
 * every card, absent from every export, untouched by every wipe, and still
 * spending the budget: a permanent invisible record.
 *
 * A Facet nobody has heard of holds no domains, and still gets the jar-wide
 * channels, because those belong to the app rather than to a roster.
 */
export function channelsOfFacet(facetId: string): LogChannel<unknown>[] {
  const owned = new Set(domainsOf(facetId).map((d) => d.id));
  return registeredChannels().filter(
    (channel) => channel.domain === null || owned.has(channel.domain)
  );
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Reads one stored record: the envelope is the facility's, everything inside it
 * is the channel's.
 *
 * A record whose `v` is not this channel's is one **this build cannot read**,
 * and that is the whole of the rule — no version-0 fallback, no absence rule and
 * no upcasting (#229). Rewriting a stored record is a write path over data the
 * code has just admitted it does not understand, so an unreadable record is kept
 * and skipped instead.
 */
function readRecord<E>(channel: LogChannel<E>, record: unknown): E | null {
  if (typeof record !== "object" || record === null) return null;
  const { v, entry } = record as { v?: unknown; entry?: unknown };
  if (v !== channel.version) return null;
  // `lvl` is not read here and is not passed on: `parse` never sees it, exactly
  // as it never sees `v` (§3.1). A record written before `lvl` existed simply
  // has no level — it is retained, it appears in the review, it stays redactable,
  // and it leaves the ring by age like everything else.
  return channel.parse(entry);
}

/** What one walk of a channel's store found. */
export interface ChannelPartition<E> {
  /** The entries this build can read, oldest first. */
  entries: E[];
  /** How many records it could not — a count, never the contents. */
  unreadable: number;
}

/**
 * One channel's store, walked **once**, split into what this build can read and
 * a count of what it cannot.
 *
 * A malformed record is not an error to report: nothing awaits a log, and a
 * reader that threw would take the review screen down with it. The count is what
 * stops the review denying that such a record exists — before #229 three
 * surfaces told the user a channel of unreadable records was empty, showed them
 * nothing of it, and disabled the one control that could remove it.
 */
export function partitionChannel<E>(
  channel: LogChannel<E>
): ChannelPartition<E> {
  const entries: E[] = [];
  let unreadable = 0;
  for (const record of readRecords(channel.name)) {
    const entry = readRecord(channel, record);
    if (entry === null) unreadable += 1;
    else entries.push(entry);
  }
  return { entries, unreadable };
}

/**
 * One channel's entries, oldest first, with anything the channel cannot read
 * dropped.
 */
export function readChannel<E>(channel: LogChannel<E>): E[] {
  return partitionChannel(channel).entries;
}

/**
 * How many records a channel currently holds — the count Settings shows, and
 * what its `Clear` button is enabled on.
 *
 * **Raw records, not parsed entries.** An unreadable record occupies a cap slot
 * and budget bytes exactly like any other, so a parsed count would be the app
 * denying that something it is storing exists (#229).
 */
export function channelEntryCount(channel: LogChannel<unknown>): number {
  return readRecords(channel.name).length;
}

/**
 * Appends one entry **at a level**, applies the channel's cap, and brings the
 * whole log back under {@link LOG_BUDGET_BYTES}. Best-effort and synchronous: it
 * returns nothing, throws nothing, and does nothing at all while the channel's
 * recording is switched off or the dial sits above `level`.
 *
 * **`level` is required and has no default** (§12). An inheritable default means
 * a site that should be ERROR records as INFO because somebody omitted it, and
 * then vanishes at any dial position above `Noisy` — the one failure nothing
 * downstream can detect. A channel's own module may hold a local constant; that
 * is the module's business, not the declaration's.
 *
 * **The pause and the dial are orthogonal.** The pause says whether this stream
 * at all; the dial says how much detail. Neither is the other's off switch.
 *
 * **It tallies first and gates second, and both halves of that are deliberate**
 * (§9). The dial does NOT gate a counter: §4's gate is a budget device and a
 * counter is not bytes but a fixed-width integer that never grows, and counters
 * exist precisely because a capped ring cannot report a rate — so gating them
 * would let a global setting silently hole the one number that survives
 * shedding. Turn the dial down and you keep the rate, you lose the detail.
 *
 * **The pause DOES stop a counter**, which is the smaller version of the same
 * hole and is accepted rather than closed. Pausing is an explicit, visible,
 * per-channel act shown in Settings beside the count, where the dial is a global
 * setting whose effect on any one counter is invisible; a counter that kept
 * running while the channel reads "not recording" would make "stop recording"
 * stop meaning what it says.
 *
 * `now` is the instant a counter set that does not exist yet is stamped with,
 * and it is the only clock this module reads. A caller may pass its own; the
 * default is here rather than at each of the write sites because a stamp written
 * once in a channel's life is not something a channel's builder should have to
 * remember to supply.
 */
export function appendToChannel<E>(
  channel: LogChannel<E>,
  entry: E,
  level: SeverityNumber,
  now: number = Date.now()
): void {
  if (!isChannelRecording(channel)) return;
  tallyEntry(channel, entry, now);
  if (!capturedAt(level)) return;
  // The envelope is stamped here and nowhere else, which is what lets a channel
  // write its own shape and read it back without either half knowing about `v`
  // or `lvl`. One facility-stamped wrapper carries both facility-owned fields.
  const record = { v: channel.version, lvl: level, entry };
  writeRecords(
    channel.name,
    capEntries([...readRecords(channel.name), record], channel.cap)
  );
  enforceBudget();
}

/**
 * The last `cap` entries. Pure — the cap is a retention rule, and a retention
 * rule that can only be exercised through `localStorage` is a rule nobody
 * tests.
 */
export function capEntries<E>(entries: E[], cap: number): E[] {
  return entries.length <= cap ? entries : entries.slice(entries.length - cap);
}

/**
 * Removes one entry from a channel by its index in {@link readChannel}'s order.
 *
 * Redaction is a **deletion**, in every channel (§4): the point of removing a
 * record is that the text is gone, and a later "retracted" record would leave
 * the original sitting there for the next reader. It also keeps the review
 * screen showing exactly what exists, which is the only thing that makes it a
 * consent surface.
 *
 * **It takes one record and leaves the rest of the store byte for byte** (#219).
 * The index the review sheet holds counts PARSED entries, while the record to
 * remove sits in the raw list, so the walk below maps one onto the other. Its
 * predecessor spliced `readChannel`'s output and wrote that back, which deleted
 * every record the current code could not read as a side effect of removing an
 * unrelated one — silently, in a channel ADR-0071 designs to outlive many entry
 * shapes, on the one screen somebody reaches for just before handing the file
 * over. `parse` is not a deletion authority: only the cap, the shared budget and
 * `Clear` remove a record.
 */
export function deleteChannelEntry<E>(
  channel: LogChannel<E>,
  index: number
): void {
  if (index < 0) return;
  const records = readRecords(channel.name);
  let readable = -1;
  for (let i = 0; i < records.length; i++) {
    if (readRecord(channel, records[i]) === null) continue;
    readable += 1;
    if (readable < index) continue;
    records.splice(i, 1);
    writeRecords(channel.name, records);
    return;
  }
}

/**
 * Empties a channel: its records **and its counters**, which is the one act that
 * takes a counter (§9).
 *
 * The two keys go together because a counter is cleared only when the channel
 * is, and because the epoch below is what makes the zeroes that follow honest —
 * a set left standing beside emptied records would be a total whose entries
 * nobody can see, and one re-minted without its records would be a rate over a
 * window nothing states.
 *
 * *Which* keys those are is `log-keyspace.ts`'s, and it takes every key the
 * channel claims rather than the two it happens to have written — the same
 * derivation a Facet-scoped wipe uses, so neither can fall behind the other
 * (#220). What stays here is the act: emptying a channel is something the
 * facility does, and the keyspace knows only about keys.
 */
export function clearChannel(channel: LogChannel<unknown>): void {
  clearChannelKeys(channel.name);
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * One channel's counters and the epoch they run from.
 *
 * `since` is not optional and is never inferred by a reader: a number without
 * its epoch is a dishonest label, which is the whole reason the stamp exists
 * (#214 §9). **One per channel**, not one per counter — counters are cleared
 * together, so per-counter stamps could never diverge.
 */
export interface ChannelCounters {
  counts: Record<string, number>;
  since: number;
}

/**
 * The declaration's counter half as one value, or `null` for a channel that
 * keeps none.
 *
 * `counters` and `tally` are declared both-or-neither and {@link defineChannel}
 * is where that is held (§12), but a stored {@link LogChannel} carries them as
 * two independent optionals — so this is the one place the pairing is
 * re-established, rather than each reader deciding for itself which of the two
 * to test.
 */
function countersOf(channel: LogChannel<unknown>): {
  names: readonly string[];
  tally: (entry: unknown) => readonly string[];
} | null {
  const { counters, tally } = channel;
  if (counters === undefined || tally === undefined) return null;
  return { names: counters, tally };
}

/**
 * The declared counters over whatever the store holds: every declared name, a
 * whole number each, and nothing else.
 *
 * Pure, and the single place both constraints live. **Reads and writes both go
 * through it**, so the bounded name space is a property of what is stored rather
 * than only of what is shown: a name a previous build declared and this one does
 * not is not a counter any more, and leaving it in the store would let a
 * declaration change grow the very unbounded key space the literal array exists
 * to prevent. A value that is not a whole count reads zero for the same reason
 * `parse` refuses a record it does not recognise — a fraction is not a total.
 */
function projectCounters(
  declared: readonly string[],
  stored: Record<string, unknown>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of declared) {
    const value = stored[name];
    counts[name] =
      typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : 0;
  }
  return counts;
}

/**
 * One channel's counters, or `null` for a channel that declares none.
 *
 * `now` is the epoch a set that does not exist yet is minted at, and the caller
 * supplies it: the export passes the moment it was reviewed, so a file's
 * `counters_since` is the file's own instant rather than a clock read somewhere
 * inside the facility.
 *
 * **A read mints nothing in the store.** The set is persisted by the first
 * append that tallies, and the statement stays true either way — before that,
 * the counts are zero and no event has gone uncounted, so any epoch is
 * accurate about what is below it.
 */
export function channelCounters(
  channel: LogChannel<unknown>,
  now: number
): ChannelCounters | null {
  const declared = countersOf(channel);
  if (declared === null) return null;
  const stored = readCounters(channel.name);
  return {
    counts: projectCounters(declared.names, stored?.counts ?? {}),
    since: stored?.since ?? now,
  };
}

/**
 * Adds one entry's contribution to the channel's counters.
 *
 * **A name the declaration does not carry is dropped here**, at write time,
 * rather than stored and filtered later — which is what makes the type-level
 * bound and the stored key space the same set. Each occurrence the tally returns
 * is its own increment, so an entry may count twice under one name.
 *
 * **It writes only when it must**: when a count moved, or when the set does not
 * exist yet. The second half is what puts the epoch at the channel's first
 * append rather than at its first *counted* one — a window that starts when
 * counting started can only understate a rate, where one that starts at the
 * first hit overstates it — and without that clause a tally contributing
 * nothing would rewrite the same bytes on every event.
 *
 * **The channel's own `tally` is caller code on the write path**, and the one
 * place this facility runs any. §3's rule is that no feature fails because a log
 * could not be written, so a tally that throws costs its counters and nothing
 * else: the record below is still written, and the search that logged it still
 * returns. {@link parse} is unguarded because a throw there takes down a screen
 * the user opened deliberately, which is a bug worth seeing.
 */
function tallyEntry(
  channel: LogChannel<unknown>,
  entry: unknown,
  now: number
): void {
  const declared = countersOf(channel);
  if (declared === null) return;
  const stored = readCounters(channel.name);
  const counts = projectCounters(declared.names, stored?.counts ?? {});
  const permitted = new Set<string>(declared.names);
  let moved = false;
  try {
    for (const name of declared.tally(entry))
      if (permitted.has(name)) {
        counts[name] += 1;
        moved = true;
      }
  } catch {
    return;
  }
  if (!moved && stored !== null && stored.since !== null) return;
  writeCounters(channel.name, { counts, since: stored?.since ?? now });
}

// ---------------------------------------------------------------------------
// The shared budget
// ---------------------------------------------------------------------------

/**
 * The ceiling across ALL channels together, because a per-channel cap alone does
 * not bound the total (§3).
 *
 * 256 KiB of a `localStorage` quota that is roughly 5 MB and shared with the
 * secrets and the rest of the app's state. The search channel's 200 sessions
 * measure in tens of kilobytes, so this is room for several more channels rather
 * than headroom for one greedy one — ADR-0054's Consequences name a channel that
 * wants per-keystroke volume as the trigger to revisit the storage choice, not a
 * reason to raise this number.
 */
export const LOG_BUDGET_BYTES = 256 * 1024;

const encoder = new TextEncoder();

/** One channel's records, in the form the budget weighs them. */
export interface ChannelContents {
  name: string;
  entries: unknown[];
}

function serialisedBytes(entries: unknown[]): number {
  return encoder.encode(JSON.stringify(entries)).length;
}

/**
 * Sheds oldest entries from the LARGEST channel until every channel's records
 * together fit inside `budget`. Pure, so the rule is asserted directly rather
 * than through a quota nobody can provoke.
 *
 * Largest-first rather than round-robin: a channel that is over the shared
 * budget is over it because of its own volume, and taking one entry from a
 * hundred-entry channel and one from a two-entry channel would spend the small
 * channel's whole history paying for the big one's. It stops when nothing is
 * left to shed, so an empty log under an impossible budget terminates.
 */
export function shedToBudget(
  contents: ChannelContents[],
  budget: number
): ChannelContents[] {
  const shed = contents.map((c) => ({ name: c.name, entries: [...c.entries] }));
  let total = shed.reduce((sum, c) => sum + serialisedBytes(c.entries), 0);
  while (total > budget) {
    let largest: ChannelContents | null = null;
    let largestBytes = 0;
    for (const channel of shed) {
      if (channel.entries.length === 0) continue;
      const bytes = serialisedBytes(channel.entries);
      if (bytes > largestBytes) {
        largest = channel;
        largestBytes = bytes;
      }
    }
    if (!largest) break;
    largest.entries.shift();
    total = shed.reduce((sum, c) => sum + serialisedBytes(c.entries), 0);
  }
  return shed;
}

/**
 * The channels a shed actually took from, **paired by name**.
 *
 * Its predecessor was three arrays walked by one index — the registry, the
 * before-state and the after-state — so any future divergence between them
 * would have written one channel's entries to another channel's key, silently.
 * "Budget shedding only ever walks entries" is a real property of
 * {@link shedToBudget}, and this is where it stops being implicit in a loop.
 *
 * **Exported, and pure, for the reason {@link capEntries} is**: a rule that can
 * only be exercised through `localStorage` is a rule nobody tests, and the
 * divergence this guards against is one an order-preserving {@link shedToBudget}
 * can never be made to produce from outside.
 *
 * **Fewer entries, not merely different** — which is the same property stated
 * on the other side. A name `before` does not carry, and a count that grew, are
 * both divergences rather than sheds, and the conservative answer to a
 * divergence is to write nothing: a shed cannot invent a channel and cannot
 * add an entry, so either would be this function writing something it has just
 * failed to recognise.
 */
export function channelsThatShed(
  before: ChannelContents[],
  after: ChannelContents[]
): ChannelContents[] {
  const held = new Map(before.map((c) => [c.name, c.entries.length]));
  return after.filter((c) => {
    const kept = held.get(c.name);
    return kept !== undefined && c.entries.length < kept;
  });
}

/**
 * Brings every registered channel back under the shared budget, rewriting only
 * the ones that actually shed. Runs after each append, which is the only moment
 * the total can grow.
 */
function enforceBudget(): void {
  const before = registeredChannels().map((channel) => ({
    name: channel.name,
    entries: readRecords(channel.name),
  }));
  const after = shedToBudget(before, LOG_BUDGET_BYTES);
  for (const { name, entries } of channelsThatShed(before, after))
    writeRecords(name, entries);
}

// ---------------------------------------------------------------------------
// The recording switch
// ---------------------------------------------------------------------------

/**
 * Whether a channel is recording. On by default — ADR-0053 §1's reason, that a
 * recorder gated behind an opt-in measures nothing — with the switch below as
 * the control that makes it stoppable.
 */
export function isChannelRecording(channel: LogChannel<unknown>): boolean {
  return !readPausedNames().includes(channel.name);
}

/** Switches one channel's recording on or off. Keeps whatever it already holds. */
export function setChannelRecording(
  channel: LogChannel<unknown>,
  recording: boolean
): void {
  const paused = readPausedNames().filter((name) => name !== channel.name);
  if (!recording) paused.push(channel.name);
  writePausedNames(paused);
}

// ---------------------------------------------------------------------------
// The dial
// ---------------------------------------------------------------------------

/** A threshold the dial can sit at. ERROR is not one: no position hides a WARN. */
export type DialPosition =
  | typeof SEVERITY.WARN
  | typeof SEVERITY.INFO
  | typeof SEVERITY.DEBUG;

/** One position, and what sitting at it means. */
export interface DialOption {
  threshold: DialPosition;
  /** What the control calls it. */
  label: string;
  /**
   * What it records, in the words the hint under the control uses. Named for
   * ADR-0092 §4's own column: at this position, the log *reads* this.
   */
  reads: string;
}

/**
 * The three positions, most restrictive first (ADR-0092 §4).
 *
 * A **threshold on a continuous scale, never three categories**, so a position
 * includes everything more severe for free and widening later moves a number
 * rather than migrating records.
 *
 * **"Off" is deliberately not a position.** Stopping a stream is the per-channel
 * recording pause, which is untouched and orthogonal.
 *
 * They live here rather than in the card so the control is a rendering of the
 * facility's own positions and a fourth costs one entry.
 */
export const DIAL_POSITIONS: readonly DialOption[] = [
  {
    threshold: SEVERITY.WARN,
    label: "Errors & warnings",
    reads: "Only what went wrong.",
  },
  {
    threshold: SEVERITY.INFO,
    label: "Normal",
    reads: "Every session, and every error.",
  },
  {
    threshold: SEVERITY.DEBUG,
    label: "Noisy",
    reads: "Everything, including the app's internal trace.",
  },
];

/**
 * Where the dial sits when nobody has moved it.
 *
 * `Normal` rather than `Noisy`: at this position the boot narration and the
 * per-fire search sequence are never written, so `Noisy` is something switched
 * on to reproduce a bug rather than a standing cost — which is what makes the
 * budget arithmetic a worst case somebody chose.
 */
export const DEFAULT_DIAL_POSITION: DialPosition = SEVERITY.INFO;

// Resolved once and held, because `capturedAt` sits on the search's per-fire
// path and a `localStorage` read per keystroke is precisely the thing #264 found
// every fast implementation avoids — pino goes as far as rebinding a disabled
// level's method to `noop`. `null` means "not yet read", not "no dial".
//
// So this is held where `isChannelRecording` re-reads the store on every call,
// and the asymmetry is stated rather than left to be discovered: a tab that was
// already open when another surface moved the dial keeps capturing at the
// position it resolved. Both surfaces that draw the control are in one document,
// so {@link setDialPosition} refreshes what they share; a second tab is the
// uncovered case, and it costs that tab's records their new position until it
// reloads. Re-reading per fire is the cost this exists to avoid.
let resolvedDial: DialPosition | null = null;

function isDialPosition(value: unknown): value is DialPosition {
  return DIAL_POSITIONS.some((position) => position.threshold === value);
}

/**
 * The threshold in force. Anything the store cannot be read as one of the three
 * positions reads as the default, which is the same best-effort rule the rest of
 * this module keeps: no feature fails because a dial could not be read.
 */
export function dialPosition(): DialPosition {
  if (resolvedDial !== null) return resolvedDial;
  const stored = readDialValue();
  resolvedDial = isDialPosition(stored) ? stored : DEFAULT_DIAL_POSITION;
  return resolvedDial;
}

/** Moves the dial, and refreshes what {@link dialPosition} hands back. */
export function setDialPosition(position: DialPosition): void {
  resolvedDial = position;
  writeDialValue(position);
}

/**
 * Whether something at `level` is being captured right now.
 *
 * The facility's one predicate about levels, and the answer to both questions a
 * builder asks (§3.2). {@link appendToChannel} calls it for a whole record.
 * The second caller is a channel's entry builder, for a **field riding inside a
 * record whose own level is set elsewhere** — `search`'s fire sequence, captured
 * at DEBUG inside a session record that is usually WARN. There is exactly one
 * such field and it arrives with #355; the predicate ships now because the level
 * and the dial it reads are one change.
 *
 * A field asks through this predicate rather than through a declared
 * field-to-level map, because such a map would make the facility reach inside an
 * entry shape per-channel `parse` exists precisely so it never has to, and would
 * be a second structural description to keep in step with both `parse` and the
 * builder. It also could not work: a sequence accumulated across a session has
 * to be decided at session **start**, and a post-hoc filter would accumulate it
 * all session and then throw it away, paying the cost the gate exists to avoid.
 *
 * **The asymmetry to keep in mind:** a record's level is computed at session
 * end, because the outcome decides it; a field's is decided at session start.
 * Which fields a channel omits at which position is a property of that channel's
 * builder, checked by nothing — an honestly-accepted weakness rather than a
 * checkbox that re-stamping satisfies.
 */
export function capturedAt(level: SeverityNumber): boolean {
  return level >= dialPosition();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** One channel as it appears in a review and in the file that follows it. */
export interface ExportedChannel {
  name: string;
  /**
   * The channel's own prose. With classification refused (§11), it is the only
   * thing in the payload that says what the entries beside it are.
   */
  purpose: string;
  /** The entry-shape version the readable entries below are at. */
  version: number;
  /**
   * How many of this channel's records this build could not read — a count, and
   * **never the contents** (#229). An older shape may hold exactly the free text
   * a current one excludes by construction, so the only version of this that
   * discloses more is the one that shows the record. `version` beside it is what
   * makes the number interpretable to whoever receives the file.
   */
  unreadable: number;
  entries: unknown[];
  /**
   * The channel's counters, **whole** (§10): they are aggregates over
   * everything that happened, so no selection or filter applies to them.
   *
   * Absent, with the stamp below, on a channel that declares none — rather than
   * an empty object a reader has to interpret.
   */
  counters?: Record<string, number>;
  /**
   * The instant the counters above run from. It rides in the payload rather
   * than only on the review screen, because an exported file outlives the screen
   * that would have explained it and a number without its epoch is a dishonest
   * label.
   *
   * **It sees neither of the two ways entries and counters can disagree** (§9,
   * #214 §8): a redaction deletes an entry without decrementing, and the dial
   * suppresses an entry that was already tallied. Both are deliberate, there is
   * no reconciliation, and the file carries both numbers for a person to fold.
   */
  counters_since?: number;
}

/** The whole of what a hand-export writes. JSON, and nothing else. */
export interface LogExport {
  artifact: "inventoria-local-log";
  /**
   * The **file format's** version, mirroring line one of the ledger export.
   * A record's `v` is a different object: one file may carry several channels
   * at several record versions.
   */
  schema_version: typeof LOG_EXPORT_SCHEMA_VERSION;
  exported_at: number;
  /**
   * The dial position this payload was built under (§10) — which on this device
   * is the position in force when Export was pressed, for the reason the
   * builder states.
   *
   * **Disclosure, never a filter.** At *Errors & warnings* a log looks like a
   * quiet app rather than a filtered one, and a reader could conclude "nothing
   * happened" when the truth is "nothing was recorded". This is the failure
   * `counters_since` was invented for — a number without its epoch is a
   * dishonest label — applied to the entries instead of the counters. It also
   * completes §9: counters run regardless of the dial and entries do not, so
   * the position is precisely what explains the gap between the complete rate
   * and the filtered detail, and a reader holding both can tell quiet from
   * filtered.
   *
   * **One value for the file, not one per record.** Records older than the last
   * move of the dial were captured under a different position; per-record
   * disclosure was rejected as bytes on every record answering a question
   * nobody asks, when the record's own `lvl` already says what it is.
   *
   * Typed to the three positions rather than to `SeverityNumber`, which is
   * ADR-0092 §10's sketch of it: ERROR is not a position the dial can sit at,
   * and a wider type here would say it is.
   */
  dial: DialPosition;
  channels: ExportedChannel[];
}

/**
 * The log export format's version. It moves under `ledger-export.ts`'s rule —
 * when a reader written against the previous version would misread a newer file.
 */
export const LOG_EXPORT_SCHEMA_VERSION = 1;

/**
 * Builds the export payload for the channels the user selected — and only those.
 *
 * **Per channel, all or nothing, and that is the only granularity on offer**
 * (§10). One switch over everything would be a consent surface that does not
 * mean what it appears to; a level filter beneath it was designed and withdrawn
 * (§10.1), because `search`'s WARN records are exactly the ones carrying the
 * text somebody typed, so filtering at ≥ WARN would keep the most sensitive
 * subset and drop the least.
 *
 * The review renders THIS value, and the file is this value serialised, so what
 * was shown is what leaves.
 */
export function buildLogExport(
  selected: LogChannel<unknown>[],
  exported_at: number
): LogExport {
  return {
    artifact: "inventoria-local-log",
    schema_version: LOG_EXPORT_SCHEMA_VERSION,
    exported_at,
    // Read here rather than taken as a parameter, unlike `exported_at`. There
    // is no instant a caller could not legitimately choose, and there is
    // exactly one dial position in force — a parameter would let a caller label
    // a file with a position nothing in it was captured under, which is the one
    // thing this field exists to rule out.
    //
    // **What that buys is bounded, and the bound is worth saying.** This is the
    // position at the moment the payload is BUILT, not at the moment a button
    // was pressed: the review rebuilds it on every selection, and the dial's
    // control sits behind the open sheet, so on this device the two are one
    // moment. A second tab that moved the dial meanwhile is the stale case
    // {@link dialPosition} already names, and the value here is then still the
    // position this tab's records were actually captured at — the honest one.
    dial: dialPosition(),
    channels: selected.map((channel) => {
      const { entries, unreadable } = partitionChannel(channel);
      // `exported_at` is the epoch a never-minted counter set takes, so the
      // review and the file agree on it and neither reads a clock of its own.
      const counters = channelCounters(channel, exported_at);
      return {
        name: channel.name,
        purpose: channel.purpose,
        version: channel.version,
        unreadable,
        entries,
        ...(counters === null
          ? {}
          : { counters: counters.counts, counters_since: counters.since }),
      };
    }),
  };
}
