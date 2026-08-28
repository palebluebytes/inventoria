# ADR 0067: A ledger comes back by merging, never by replacing

**Status:** Accepted  
**Date:** 2026-08-28  
**Amends:** [ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md) (its Scope defers the read side to this record, and its Consequences say the arc is unfinished until this lands)  
**Implemented:** #182 `c7c072f` (the reader and its refusals), `052dfc6` (the write path), `4c17166` (the worker seam), `00501ac` (the Settings surface)

## Context

[ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md) gave
the ledger a way out and nothing to come back through. A user who cleared site
data, lost a device, or mis-tapped `Wipe Database` had a file and no program that
could read it, which is a backup only in the sense that it makes you feel better.

The architecture makes this cheaper than it looks. Import is pure appends, so it
never approaches the `AGENTS.md` §3 immutability line. The primary key
[ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md) installed spans
entity, attribute and the whole hybrid logical clock stamp including the
originating device, so a row is its own identity and an insert that ignores a
conflict is the entire deduplication. And
[ADR-0014](0014-namespace-prefixes-for-eavt-entity-identification.md) already
argues that facts from two devices merge without a coordinator, because an
entity id is derived rather than issued, which is what makes reading a file back
a merge rather than a negotiation.

### Scope

This record covers reading one exported file into the ledger on this device. It
does not cover peer-to-peer sync, parked as
[#179](https://github.com/palebluebytes/inventoria/issues/179), and it is not a
sync design: merging two devices' exports happens to work here, and that is a
consequence of the key rather than a feature this record offers.

## Decision

### 1. The import merges, and there is no replacing import

Every datom in the file is appended to whatever the ledger already holds.
Nothing is removed, nothing is overwritten, and a fact the file does not carry
survives the import untouched.

A "restore" that made the file the only truth would silently eat every meal
logged since the backup was taken, which is a data-loss bug wearing a helpful
label. Anyone who genuinely wants the file to be the only truth already has a
way to say so: `Wipe Database`, then import. That composition stays two
deliberate steps rather than hiding inside one button, because the destructive
half should be chosen rather than implied.

### 2. Idempotence is the primary key, not bookkeeping

`importLedgerRows` inserts with `OR IGNORE`. A row the table already holds is
the same row, key for key, so skipping it loses nothing, and importing the same
file twice adds nothing the second time.

No import log, no imported-file registry, no content hash. All three would be
state about the ledger kept outside the ledger, and none of them would be more
correct than the key already is. The count of skips is what the screen reports
as "already here", read from the connection's own change counter rather than
from a second pass over the table.

This is the one write path in the app that keeps a stamp it did not issue.
`appendDatoms` keeps its plain `INSERT` for the opposite reason: a collision
there means the clock issued one stamp twice, which has to be heard about rather
than ignored.

### 3. An import moves this device's clock

The batch reports the greatest stamp it carried, and the worker feeds it to
`Hlc.update`. Without that, a datom written straight after an import could sort
before the facts the import brought in, and the newer fact would lose.

This is exactly the case ADR-0020 gave `update` to handle, and this record is
the first caller. Seeding from the ledger's high-water mark at startup does not
cover it, because the import happens long after startup.

### 4. An unrecognised `schema_version` is refused, not guessed

The reader checks `artifact` and `schema_version` on line one and stops there if
either is unfamiliar, naming both the file's version and the versions it reads.
That is what ADR-0064 §2 put those two fields at the front for: the refusal
costs one line of a file that may run to hundreds of megabytes.

A file that names no version and a file that names an unknown one get separate
refusals, and neither says the file is newer. An unknown version number is not
evidence of a newer build, and asserting it would be a guess in the one place
the format exists to stop the reader guessing.

The supported versions are a list rather than a single number, because a reader
may legitimately understand more than one. Today the list holds one entry.

### 5. The file is read twice, and the guarantee is stated exactly

A half-imported ledger is worse than a refused one, so nothing is written until
every line has been checked. Over a file too large to hold in memory the only
way to do that is to read it twice: pass one parses every line and writes
nothing, pass two parses them again and writes them in batches. A `File` the
user picked is a handle rather than its contents, so a second pass is available
and costs a second read rather than a second copy.

**What that delivers:** a file that is truncated, corrupt, from another program,
or from a future format is refused with the ledger byte for byte as it was. A
file truncated 400 MB in fails on its last, incomplete line during pass one, and
nothing is written.

**What it does not deliver:** a promise against the file changing between the
two passes, or against the tab dying part way through pass two. Both leave a
prefix of the file written. Neither is corruption, because every row is an
append and the same row twice is the same row, so re-running the import
completes it. Claiming a transaction across a two-pass read of a
user-picked file would be a lie, and this clause exists so the next reader does
not go looking for one.

The screen says both halves. A failure during the writing pass names how many
datoms did land and says that importing the same file again finishes it, since
a caveat that only lives in this record is a caveat the person holding the
half-written ledger never sees.

A file truncated exactly on a line boundary is valid NDJSON and imports. The
envelope's `row_count` will not match, and the screen says so, but ADR-0064 §2
already rules that count advisory rather than an integrity check, so it is
reported rather than treated as a refusal.

### 6. Rows cross into the worker in batches, and the screen reports both counts

`AGENTS.md` §3 keeps SQLite in the Worker, so the main thread reads the file and
posts batches bounded by size, mirroring `readLedgerPage` in the other
direction. One label photo outweighs a thousand ordinary datoms, so a batch
measured in rows would sometimes carry a few kilobytes and sometimes a few
hundred megabytes.

Invalidation is broadcast once, on the batch that says it is the last. Every
ledger-backed store re-reads on a broadcast, so announcing each batch would
re-run every projection in the app a few hundred times during one import.

The result names rows added and rows already present separately. They are
different facts about what happened, and collapsing them into one total would
hide the difference between a restore and a re-run.

### 7. The screen says what did not come back

API credentials and the [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)
search log live in `localStorage` rather than in `datoms`, so ADR-0064 §4 leaves
them out of the file and there is nothing here to restore. Silence would be
read as failure by anyone whose keys are missing after a restore, so the section
says it before the import and the result says it again after.

## Consequences

**The arc closes, and the file is a backup rather than a gesture.** Export, wipe
and import compose into a real recovery, and each of the three is a thing the
user chose. This record amends ADR-0064, whose Scope defers the read side here
and whose Consequences say no program can use the file; both are now out of
date, and the lifeboat has someone to row it.

**Reading twice costs twice.** A 400 MB export is 800 MB of reading, and on a
phone that is slow enough to need saying on screen, which is why the progress
line names the pass rather than just spinning. Reading once would mean either
holding the file in memory or writing before checking, and both were worse.

**A partial import can exist, and is safe.** A tab that dies mid-write leaves a
prefix. Nothing detects that, and nothing needs to: running the import again
finishes it, and running it again after it finished changes nothing.

**Two devices' exports merge, and that is not sync.** The key makes it work and
the clock makes it order, but there is no propagation, no deletion story and no
conflict surface, so nothing here should be read as a claim about #179.

**A format change now has two ends.** ADR-0064 §2 said every future column has
to reach the envelope's version; this record adds that the reader's supported
list has to move with it, or a file the app just wrote is a file it refuses.
