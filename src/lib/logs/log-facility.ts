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
 * Records live in `localStorage`, one namespaced key per channel, **never in the
 * ledger** (§3). `src/lib/stores/secrets.ts` states the principle in its own
 * header — "The ledger is undeletable and it syncs" — and this facility needs
 * both properties for the same reasons: a redaction is a deletion, the cap
 * removes entries, and nothing here may travel to a second device. The guarded
 * accessors below are that module's, kept here rather than shared because they
 * are the whole of what the two have in common.
 *
 * **There is no transport and there never will be** (§11), and that, with the
 * review the export is conditional on, is now the **whole** of the protection.
 * No sink, no endpoint, no optional remote mode: the only way a record leaves the
 * device is a file the user exports by hand after reading it.
 * `log-facility.test.ts` asserts that this file names no network API at all,
 * because the distinction ADR-0053 rests on — that a local record is not
 * telemetry — holds only while it is structurally true.
 */

import { domainsOf, type TrackedDomainId } from "../facets/registry";

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

/** What a channel declares, before the purpose guard is layered over it. */
interface ChannelFields<E> {
  name: string;
  domain: TrackedDomainId | null;
  purpose: string;
  cap: number;
  version: number;
  parse: (raw: unknown) => E | null;
}

/**
 * A channel declaration. `purpose` is a literal string in code, deliberately: a
 * purpose assembled at runtime is a purpose nobody wrote down, and the
 * conditional below rejects the widened `string` for that reason as much as it
 * rejects `""`.
 */
type ChannelDeclaration<E, P extends string> = Omit<
  ChannelFields<E>,
  "purpose"
> & { purpose: P } & ("" extends P
    ? { purpose: ChannelNeedsAStatedPurpose }
    : unknown);

const channels = new Map<string, LogChannel<unknown>>();

/**
 * Declares a channel and registers it in the same act, so the review surface
 * finds it without anyone maintaining a second list.
 *
 * **Three runtime throws, and only these three** (§12): a whitespace-only
 * `purpose` (the type above catches the empty literal and the widened `string`,
 * but cannot see through a space), a cap that retains nothing, and a name
 * already taken — two channels sharing a `localStorage` key would each read the
 * other's records as unreadable and shed them.
 *
 * `name` is deliberately **not** a central literal union. That would catch typos
 * only, duplicates would still need the check below, and it re-introduces the
 * central registry #221 exists to remove.
 */
export function defineChannel<E, P extends string>(
  declaration: ChannelDeclaration<E, P>
): LogChannel<E> {
  // The guard's own boundary: the declared type exists to reject a blank
  // `purpose` at the call site, and the body below only ever reads the plain
  // fields underneath it. The module's other cast is `readRecord`'s, over stored
  // JSON, which is the genuine external boundary of the two.
  const { name, domain, purpose, cap, version, parse } =
    declaration as unknown as ChannelFields<E>;
  if (purpose.trim() === "")
    throw new Error(
      `Log channel "${name}" needs a purpose stating what it is for (ADR-0092 §2).`
    );
  if (cap < 1)
    throw new Error(`Log channel "${name}" needs a cap of at least one entry.`);
  if (channels.has(name))
    throw new Error(`Log channel "${name}" is already registered.`);
  const channel: LogChannel<E> = {
    name,
    domain,
    purpose,
    cap,
    version,
    parse,
  };
  channels.set(name, channel as LogChannel<unknown>);
  return channel;
}

/** Every channel declared so far, in declaration order. */
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

const LS_PREFIX = "inventoria_log_";
// The channels whose recording the user has switched off, as one JSON list.
//
// Deliberately OUTSIDE the `inventoria_log_<name>` keyspace: a channel named
// `paused` would otherwise claim this very key, and the duplicate-name guard
// only ever compares a channel against another channel, so the two would
// silently delete each other's records.
//
// Not a datom either, and would not be one even if settings still could be
// (ADR-0085 §1): the entries it governs are per-device and unsynced, and a switch
// that syncs would silence an instrument on a device its owner has never seen.
// The one ledger-side fact about this facility is the export consent, which is a
// recorded act about disclosure rather than a setting about this device.
const LS_PAUSED_KEY = "inventoria_logs_paused";
// The dial's threshold, as one of the three `SeverityNumber`s below.
//
// Beside the pause and for the same reasons (ADR-0092 §4): a switch that syncs
// would silence an instrument on a device its owner has never seen, and a budget
// dial is per-device by nature. ADR-0085's rule points the same way — this is a
// device's own state rather than a preference that should travel.
//
// Neither key is under any domain's `localStorage` namespace, so a Facet-scoped
// wipe leaves both standing: they govern the jar's whole facility.
const LS_DIAL_KEY = "inventoria_logs_level";

// `localStorage` is absent under the Node unit runner and can throw outright in
// a privacy-locked browser, so every access is guarded — the arrangement
// `stores/secrets.ts` uses. A missing store reads empty and writes as a no-op,
// which is §3's best-effort rule: no feature fails because a log could not be
// written.
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
 * The `localStorage` key one channel's records live under.
 *
 * Exported because a Facet-scoped wipe has to take its own channels' records
 * and cannot work the key out from the registry: the key follows the channel's
 * **name**, and a channel names its domain rather than being named after it
 * (ADR-0079 §2, `facets/facet-wipe.ts`). Everything else about the keyspace
 * stays private to this module.
 */
export function channelStorageKey(channel: LogChannel<unknown>): string {
  return `${LS_PREFIX}${channel.name}`;
}

/** The raw stored records of one channel, unparsed. `[]` for anything else. */
function storedRecords(channel: LogChannel<unknown>): unknown[] {
  const raw = safeGet(channelStorageKey(channel));
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(channel: LogChannel<unknown>, records: unknown[]): void {
  if (records.length === 0) safeRemove(channelStorageKey(channel));
  else safeSet(channelStorageKey(channel), JSON.stringify(records));
}

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
  for (const record of storedRecords(channel)) {
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
  return storedRecords(channel).length;
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
 * **The order of the two returns is load-bearing for what comes next.** §9's
 * counters are not gated by the dial — a counter is not bytes, and a rate read
 * from a suppressed record's absence would be a rate wearing a lifetime label it
 * has not earned. So the tally #354 adds goes ABOVE the `capturedAt` gate, not
 * beside the write below it.
 */
export function appendToChannel<E>(
  channel: LogChannel<E>,
  entry: E,
  level: SeverityNumber
): void {
  if (!isChannelRecording(channel)) return;
  if (!capturedAt(level)) return;
  // The envelope is stamped here and nowhere else, which is what lets a channel
  // write its own shape and read it back without either half knowing about `v`
  // or `lvl`. One facility-stamped wrapper carries both facility-owned fields.
  const record = { v: channel.version, lvl: level, entry };
  writeRecords(
    channel,
    capEntries([...storedRecords(channel), record], channel.cap)
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
  const records = storedRecords(channel);
  let readable = -1;
  for (let i = 0; i < records.length; i++) {
    if (readRecord(channel, records[i]) === null) continue;
    readable += 1;
    if (readable < index) continue;
    records.splice(i, 1);
    writeRecords(channel, records);
    return;
  }
}

/** Empties a channel, removing its key outright. */
export function clearChannel(channel: LogChannel<unknown>): void {
  safeRemove(channelStorageKey(channel));
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
 * Brings every registered channel back under the shared budget, rewriting only
 * the ones that actually shed. Runs after each append, which is the only moment
 * the total can grow.
 */
function enforceBudget(): void {
  const registered = registeredChannels();
  const before = registered.map((channel) => ({
    name: channel.name,
    entries: storedRecords(channel),
  }));
  const after = shedToBudget(before, LOG_BUDGET_BYTES);
  for (let i = 0; i < registered.length; i++)
    if (after[i].entries.length !== before[i].entries.length)
      writeRecords(registered[i], after[i].entries);
}

// ---------------------------------------------------------------------------
// The recording switch
// ---------------------------------------------------------------------------

function pausedChannels(): string[] {
  const raw = safeGet(LS_PAUSED_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n) => typeof n === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Whether a channel is recording. On by default — ADR-0053 §1's reason, that a
 * recorder gated behind an opt-in measures nothing — with the switch below as
 * the control that makes it stoppable.
 */
export function isChannelRecording(channel: LogChannel<unknown>): boolean {
  return !pausedChannels().includes(channel.name);
}

/** Switches one channel's recording on or off. Keeps whatever it already holds. */
export function setChannelRecording(
  channel: LogChannel<unknown>,
  recording: boolean
): void {
  const paused = pausedChannels().filter((name) => name !== channel.name);
  if (!recording) paused.push(channel.name);
  if (paused.length === 0) safeRemove(LS_PAUSED_KEY);
  else safeSet(LS_PAUSED_KEY, JSON.stringify(paused));
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
  const raw = safeGet(LS_DIAL_KEY);
  const stored: unknown = raw === null ? null : Number(raw);
  resolvedDial = isDialPosition(stored) ? stored : DEFAULT_DIAL_POSITION;
  return resolvedDial;
}

/** Moves the dial, and refreshes what {@link dialPosition} hands back. */
export function setDialPosition(position: DialPosition): void {
  resolvedDial = position;
  safeSet(LS_DIAL_KEY, String(position));
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
    channels: selected.map((channel) => {
      const { entries, unreadable } = partitionChannel(channel);
      return {
        name: channel.name,
        purpose: channel.purpose,
        version: channel.version,
        unreadable,
        entries,
      };
    }),
  };
}
