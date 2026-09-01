/**
 * The local log facility (ADR-0054): one module owning every local diagnostic
 * and instrumentation record this app keeps.
 *
 * A **channel** is a named stream with its own shape, its own cap and its own
 * sensitivity. There are no severity levels — levels invite "log everything at
 * debug and filter later", which is right for a server draining to a sink and
 * wrong for a device with a 5 MB quota and a user who may hand the file to
 * someone (§1).
 *
 * **A channel may not exist without a `reader`** naming a real consumer and the
 * decision it will take (§2). That is the whole of the anti-sprawl guard, and it
 * is enforced here rather than asked for in a comment: {@link defineChannel}
 * will not compile with a blank reader and throws on one that is only
 * whitespace. "It might be useful later" is not a reader, and a channel whose
 * question has been answered is removed rather than left running.
 *
 * Records live in `localStorage`, one namespaced key per channel, **never in the
 * ledger** (§3). `src/lib/stores/secrets.ts` states the principle in its own
 * header — "The ledger is undeletable and it syncs" — and this facility needs
 * both properties for the same reasons: §4's redaction is a deletion, the cap
 * removes entries, and nothing here may travel to a second device. The guarded
 * accessors below are that module's, kept here rather than shared because they
 * are the whole of what the two have in common.
 *
 * **There is no transport and there never will be** (§5). No sink, no endpoint,
 * no optional remote mode: the only way a record leaves the device is a file the
 * user exports by hand after reading it. `log-facility.test.ts` asserts that
 * this file names no network API at all, because the distinction ADR-0053 rests
 * on — that a local record is not telemetry — holds only while it is
 * structurally true.
 */

/**
 * Whether a channel's records are about the person using the app or about the
 * app itself. Shown in the export review, where `personal` channels are marked,
 * so that agreeing to hand over a technical channel is never also agreeing to
 * hand over what someone searched for (§4).
 */
export type ChannelSensitivity = "personal" | "technical";

/**
 * A registered channel. Constructed only by {@link defineChannel}, which is what
 * makes a declaration and a registration the same act.
 */
export interface LogChannel<E> {
  /** The `localStorage` key suffix and the label in the review UI. */
  readonly name: string;
  /** Who reads this, and the question it decides (§2). */
  readonly reader: string;
  /** Maximum entries retained, oldest dropped. */
  readonly cap: number;
  readonly sensitivity: ChannelSensitivity;
  /**
   * Reads one stored record back into the channel's shape, or `null` for
   * anything it does not recognise. Stored JSON is not a typed boundary — it
   * survives a downgrade, a hand edit and a half-written shape — so a channel
   * owns the parse of its own records, and this is also what infers `E` for
   * every function below.
   */
  readonly parse: (raw: unknown) => E | null;
}

/**
 * The type a blank `reader` collapses to, so §2 is a compile error rather than a
 * review comment. The brand's name is what the error message says.
 */
interface ChannelNeedsANamedReader {
  readonly __a_channel_needs_a_named_reader: never;
}

/** What a channel declares, before the reader guard is layered over it. */
interface ChannelFields<E> {
  name: string;
  reader: string;
  cap: number;
  sensitivity: ChannelSensitivity;
  parse: (raw: unknown) => E | null;
}

/**
 * A channel declaration. `reader` is a literal string in code, deliberately: a
 * reader assembled at runtime is a reader nobody wrote down, and the conditional
 * below rejects the widened `string` for that reason as much as it rejects `""`.
 */
type ChannelDeclaration<E, R extends string> = Omit<
  ChannelFields<E>,
  "reader"
> & { reader: R } & ("" extends R
    ? { reader: ChannelNeedsANamedReader }
    : unknown);

const channels = new Map<string, LogChannel<unknown>>();

/**
 * Declares a channel and registers it in the same act, so the review surface
 * finds it without anyone maintaining a second list.
 *
 * Throws on a whitespace-only reader (the type guard above catches the empty
 * literal; it cannot see through a space), on a cap that retains nothing, and on
 * a name already taken — two channels sharing a `localStorage` key would each
 * read the other's records as unparseable and delete them.
 */
export function defineChannel<E, R extends string>(
  declaration: ChannelDeclaration<E, R>
): LogChannel<E> {
  // The one cast in the module, and it is the guard's own boundary: the
  // declared type exists to reject a blank `reader` at the call site, and the
  // body below only ever reads the plain fields underneath it.
  const { name, reader, cap, sensitivity, parse } =
    declaration as unknown as ChannelFields<E>;
  if (reader.trim() === "")
    throw new Error(
      `Log channel "${name}" needs a reader naming who reads it and what it decides (ADR-0054 §2).`
    );
  if (cap < 1)
    throw new Error(`Log channel "${name}" needs a cap of at least one entry.`);
  if (channels.has(name))
    throw new Error(`Log channel "${name}" is already registered.`);
  const channel: LogChannel<E> = { name, reader, cap, sensitivity, parse };
  channels.set(name, channel as LogChannel<unknown>);
  return channel;
}

/** Every channel declared so far, in declaration order. */
export function registeredChannels(): LogChannel<unknown>[] {
  return [...channels.values()];
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

function keyOf(channel: LogChannel<unknown>): string {
  return `${LS_PREFIX}${channel.name}`;
}

/** The raw stored records of one channel, unparsed. `[]` for anything else. */
function storedRecords(channel: LogChannel<unknown>): unknown[] {
  const raw = safeGet(keyOf(channel));
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(channel: LogChannel<unknown>, records: unknown[]): void {
  if (records.length === 0) safeRemove(keyOf(channel));
  else safeSet(keyOf(channel), JSON.stringify(records));
}

/**
 * One channel's entries, oldest first, with anything the channel cannot read
 * dropped. A malformed record is not an error to report: nothing awaits a log,
 * and a reader that threw would take the review screen down with it.
 */
export function readChannel<E>(channel: LogChannel<E>): E[] {
  const entries: E[] = [];
  for (const record of storedRecords(channel)) {
    const entry = channel.parse(record);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/** How many entries a channel currently holds — the count Settings shows. */
export function channelEntryCount(channel: LogChannel<unknown>): number {
  return readChannel(channel).length;
}

/**
 * Appends one entry, applies the channel's cap, and brings the whole log back
 * under {@link LOG_BUDGET_BYTES}. Best-effort and synchronous: it returns
 * nothing, throws nothing, and does nothing at all while the channel's recording
 * is switched off.
 */
export function appendToChannel<E>(channel: LogChannel<E>, entry: E): void {
  if (!isChannelRecording(channel)) return;
  writeRecords(
    channel,
    capEntries([...storedRecords(channel), entry], channel.cap)
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
 */
export function deleteChannelEntry<E>(
  channel: LogChannel<E>,
  index: number
): void {
  const kept = readChannel(channel);
  if (index < 0 || index >= kept.length) return;
  kept.splice(index, 1);
  writeRecords(channel, kept);
}

/** Empties a channel, removing its key outright. */
export function clearChannel(channel: LogChannel<unknown>): void {
  safeRemove(keyOf(channel));
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
// Export
// ---------------------------------------------------------------------------

/** One channel as it appears in a review and in the file that follows it. */
export interface ExportedChannel {
  name: string;
  reader: string;
  sensitivity: ChannelSensitivity;
  entries: unknown[];
}

/** The whole of what a hand-export writes. JSON, and nothing else. */
export interface LogExport {
  artifact: "inventoria-local-log";
  exported_at: number;
  channels: ExportedChannel[];
}

/**
 * Builds the export payload for the channels the user selected — and only those
 * (§4). Export is chosen per channel at export time rather than by one switch
 * over everything, because bundling a `personal` channel with a `technical` one
 * behind a single yes is a consent surface that does not mean what it appears
 * to.
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
    exported_at,
    channels: selected.map((channel) => ({
      name: channel.name,
      reader: channel.reader,
      sensitivity: channel.sensitivity,
      entries: readChannel(channel),
    })),
  };
}
