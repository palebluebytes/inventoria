# ADR 0064: The ledger leaves as raw datoms, one JSON object per line

**Status:** Accepted  
**Date:** 2026-08-28  
**Implemented:** #105 `3a4065a` (the paged read), `e2f7e17` (the format and the walk), `c55c0c4` (the Settings surface), `e622c5b` (the summary/envelope naming split), `0ceb2a8` (review fixes, including §6's ruling that the ceiling is measured on bytes written)

## Context

The ledger is the app. Every meal, habit, item, note and calendar event exists as a
datom in OPFS and nowhere else, and until this record there was no way to get any
of it out. `navigator.storage.persist()` is never called, so that storage is
best-effort: the browser may evict it under disk pressure, clearing site data takes
it outright, and `Wipe Database` sits in Settings one mis-tap away.

The one export already in the codebase writes the [ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md)
log channels, which live in `localStorage` and are not the ledger. The Developer
Options survival test proves the database survives a page reload. It says nothing
about eviction, about a lost device, or about the wipe button.

This is **durability, not portability**. Portability rides along for free, because
an EAVT stream is legible to a human and to a model, but that is a consequence
rather than the reason.

### The alternatives that were live

**Copy the SQLite file out of OPFS.** The smallest possible change, and the file is
already the whole truth. Rejected because the artifact would then be opaque: nobody
can read it, grep it, or repair a corrupt byte in it, and a durability backup whose
only reader is the program that failed is a poor lifeboat. It also pins the backup
to the storage engine, so swapping SQLite would strand every file already written.

**Export projected state.** One JSON document per domain, current values only. It is
smaller, easier to read, and useless: projecting discards the history that produced
the state, which is the entire premise of an append-only ledger, and a restore from
it would invent a ledger that never existed.

**One JSON array.** Familiar, and refused for three reasons. It cannot be written
without holding the whole document to close the bracket, a truncated write loses the
file rather than its last line, and reading it back needs a streaming JSON parser
where NDJSON needs `split("\n")`.

**Compress the output.** Deferred, not rejected. Base64 photo values compress well
and the saving would be real, but `CompressionStream` adds a second failure mode to
a mechanism whose whole job is to be reliable, and it makes the file unreadable
without a tool. Revisit if the uncompressed size becomes the reason people do not
run it.

### Scope

This record covers the export: what the file holds, how it is written, and where it
is reached from. It does not cover reading one back, which is
[#182](https://github.com/palebluebytes/inventoria/issues/182) and is what finishes
this arc; peer-to-peer sync, parked as
[#179](https://github.com/palebluebytes/inventoria/issues/179); requesting
persistent storage, [#180](https://github.com/palebluebytes/inventoria/issues/180);
or the photo sizes that make the file large,
[#181](https://github.com/palebluebytes/inventoria/issues/181). Silence here on any
of those is deferral, not a ruling.

## Decision

### 1. The artifact is raw datoms, not projected state

Every row of `datoms`, every column, superseded facts included. The file is the log,
not the answer the log produces.

Values travel as the stored TEXT rather than parsed and re-serialised. The `value`
column holds the JSON `appendDatoms` wrote, and writing it back out verbatim is what
makes the round trip byte for byte. A reader that parses on the way out has to
reproduce the exact same serialisation on the way in, and there is no reason to ask
it to.

### 2. The format is NDJSON, and line one is an envelope

One JSON object per line. The first line is not a datom; it is the envelope:

```json
{
  "artifact": "inventoria-ledger",
  "schema_version": 1,
  "exported_at": 1787908000000,
  "device_id": "6f1c…",
  "row_count": 12043
}
```

NDJSON streams natively, needs no closing bracket, greps as plain text, and costs
one line rather than the whole file if a write is truncated.

`schema_version` is the **file format's** version, not the database's. It moves when
a reader written against the previous version would misread a newer file: a renamed
or dropped column, a changed meaning for one, a different line grammar. Adding a
field an old reader can ignore does not move it. The ledger's own schema has already
migrated once, when [ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md)
replaced the primary key, which is exactly why a restore has to be able to tell what
it is holding.

**An importer refuses on line one.** It reads one line, checks `artifact` is
`inventoria-ledger` and that `schema_version` is one it understands, and stops there
if either fails. That is the whole point of putting both at the front of a file that
may run to hundreds of megabytes: the refusal costs a single line.

`row_count` is the count when the write began, so it is what to expect rather than
an integrity check. A ledger appended to mid-write produces more lines than the
envelope claims, and the export says so rather than hiding it.

### 3. Photos are included

Label photos are already inside datom values as base64, and there is no honest way
to omit them: a durability backup that silently drops them is lying about what it
is. This is what forces streaming. A captured photo is stored at full camera
resolution, so the file cannot be assembled as one string in memory.

### 4. Nothing outside `datoms` is included

The export is ledger-only. The `localStorage` side-cars stay out of it: the API
credentials that [ADR-0034](0034-label-photo-food-capture.md) §8 moved there, and
the [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)
search log that followed them.

**No exclusion logic is written for the search log, because none is possible.** This
record amends ADR-0053 §6, which constrained this ticket to keep a `search/`
namespace out of a wholesale export. The namespace never existed: §6's redaction
requires deleting an entry and §7's cap requires dropping the oldest, and neither is
expressible against an append-only table, so the log went to `localStorage` before
this record's work began. A
wholesale export of `datoms` cannot carry the search log because the search log is
not in `datoms`. The constraint is structural rather than disciplinary, and this
clause exists so the point stops being re-litigated by the next reader who arrives
at §6 and starts writing a filter.

### 5. The read streams out of the worker a page at a time

`AGENTS.md` §3 keeps all SQLite execution inside the Web Worker, so the export
cannot pull the table across in one message, and photos mean it could not anyway.

`readLedgerPage` walks `datoms` by its primary key and stops on a **byte budget**
rather than a row count. Rows are counted in bytes because one label photo is larger
than a thousand ordinary datoms, so a page measured in rows would sometimes hand the
main thread a few kilobytes and sometimes a few hundred megabytes. A size probe runs
first, so the widths are known before any value is materialised in JavaScript, and
one row always comes back when one exists, so a value larger than the whole budget
moves rather than stalling the walk.

The cursor is the whole primary key, not the logical clock. Rows migrated from the
pre-ADR-0020 schema all carry `hlc_ctr = 0` and `hlc_ms = time`, so their stamps
collide, and a cursor that could not separate them would skip or repeat rows.

### 6. The write goes to a file the user chooses, and the fallback refuses

`showSaveFilePicker()` into `createWritable()` is the intended path: the user picks
the location, and the file is written as it is read. It is Chromium-only, which
matches this project's de facto target, since the e2e matrix defines chromium and a
Pixel 5 profile with no Firefox or WebKit project and no browserslist.

Where that API is absent there is no streaming write at all, so the fallback
assembles the file in memory and **refuses above a stated ceiling** of 64 MiB.
Refusing is the honest answer: a tab that dies partway through an export is worse
than a message saying it cannot, because the first leaves the user believing they
have a backup. The refusal names both figures and says which browser would work.

**The ceiling is measured on the bytes actually written, never on the estimate.**
The screen says the ceiling exists before the export starts, on the browsers that
have one, but the decision to stop is taken by the thing doing the writing. An
estimate that includes the cached USDA bundle would refuse ledgers that fit, and a
refusal that is wrong about its own reason is worse than a slow one.

The user is told the approximate size before the write starts, from
`navigator.storage.estimate()`, feature-detected because it is absent in some
environments. That figure covers everything the origin stores, so it over-states the
ledger rather than under-stating it, and the screen says so instead of implying a
precision it does not have.

### 7. There is no review gate

ADR-0053 §6 requires one before its log leaves, because that log is passively
collected: the user never knowingly typed it into a record, so the export is the
only consent event available.

The ledger is the opposite. It is deliberately entered data, written to the user's
own disk, at the user's own request. That is not a disclosure, and a review screen
over hundreds of megabytes of base64 would be consent theatre rather than consent.

## Consequences

**The lifeboat exists, and it is legible.** A `.ndjson` file of EAVT rows can be
read by a person, grepped by a shell, and folded by anything that can parse a line
of JSON. That is a property [ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md)'s
Consequences deliberately protect, and it costs nothing here.

**The file is large, and the arc is not finished.** Photos at full camera resolution
dominate it, so an export is a deliberate act rather than something that happens
quietly in the background. Nothing reads the file back yet: #182 builds the import
side on top of this format, and until it lands the backup is a file that no program
can use. That is the honest state of it, and it is still better than the nothing
that came before.

**Firefox and Safari get the ceiling, not the export.** A ledger past 64 MiB has no
path out of those browsers at all. The alternative was a crash, and the refusal at
least names the browser that works. If those become real targets, the fix is a
`WritableStream` over the File System Access API's absence rather than raising this
number.

**A ledger that changes mid-write produces a mismatched header.** The export reports
the count it wrote alongside the count the envelope claims, and tells the user to run
it again. Pinning the count instead would mean holding a read transaction open across
an unbounded user-facing write, which is worse.

**Every future column has to reach the envelope's version.** A change to `datoms`
that a reader could misinterpret means moving `schema_version`, and the ADR-0020
migration is the precedent that says this will happen again.
