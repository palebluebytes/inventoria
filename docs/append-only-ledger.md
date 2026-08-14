# State Is a Reading of the Past

Why Inventoria stores facts it can never change, and reads the present by folding
them forward.

Inventoria keeps one table and never edits a row in it. Everything the interface
shows is computed rather than stored: the length of a habit streak, today's calories,
whether a medication slot was taken. The design treats the present as the present
tense of the past, a value read from an accumulated history of facts rather than a
cell that someone overwrote.

## The ledger only grows

Each fact is a **datom**, a single row of entity, attribute, and value in an
append-only **ledger**, stamped with both a domain timestamp and a hybrid logical
clock. Recording something new never rewrites what was there; it appends a later
datom. There are no `UPDATE` or `DELETE` statements anywhere in the write path, as a
standing rule. A correction is simply a newer fact that the read logic learns to
prefer.

The column-by-column shape of a row is in
[EAVT Vocabulary](eavt-vocabulary.md); the DDL is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Reading the present

To answer what is true now, the application folds the history forward. A
**projection** walks an entity's datoms in clock order and lets the latest value for
each attribute win, so the current state falls out of the log without anything being
mutated to produce it. Because the fold is a pure function of the datoms, the same
history always yields the same state.

Two datoms about one physical item:

| entity        | attribute           | value    | when    |
| ------------- | ------------------- | -------- | ------- |
| `twin:mug_01` | `acquisition/state` | `wanted` | earlier |
| `twin:mug_01` | `acquisition/state` | `owned`  | later   |

The read resolves to `owned`, because the later datom wins. The earlier `wanted` fact
is never deleted; the read simply prefers the newer one. Current state is not stored
anywhere. It is what falls out when the log is folded forward.

Because every earlier fact is still on disk, an earlier state stays _derivable_ in
principle. No as-of read is implemented, though:
[ADR-0020](adr/0020-logical-clock-ordering-over-wall-clock-key.md) defers bitemporal
history until a concrete feature demands it.

## What immutability buys

The payoff is that nothing is ever quietly lost. An **Execution Event** marked
`uncompleted` is not a deletion but a later datom that cancels the most recent
matching completion, so both the completion and its undo stay on the record. The
original payload fetched from an external source is kept verbatim as **Provenance**,
so a later schema change can remap old data without going back to the network.

The deeper reason is extensibility. Because the whole history is one legible log, a
new capability can read it without a migration and without permission from whatever
wrote it first. That is the substrate the project was built to be, and the same
legibility is what the author intends to hand to LLM-driven workflows over the
history later on.

## Where the idea comes from

This is not a new invention. The datom and its accumulate-only discipline come from
Rich Hickey's [Datomic](https://docs.datomic.com/whatis/data-model.html), which
defines a datom as "an immutable atomic fact" over entity, attribute, value, and
transaction, and holds that "new transactions only Accumulate new data. Existing
datoms never change."

Inventoria borrows that model and simplifies it. It orders facts by a hybrid logical
clock seeded from wall-clock time rather than by a transaction id, and it carries no
explicit retraction operation, so an undo is a cancelling fact rather than a formal
retraction. The debt is stated rather than hidden: the shape of the store is
Datomic's, adapted down to what a single-user browser database actually needs.

The logical clock is there because bare wall-clock time was not enough. It orders
writes fine on one device but not once several devices sync, the weakness that
already cost a **Note** its edits in
[ADR-0018](adr/0018-notes-checklist-crdt-oplog-in-ledger.md). So the ordering borrows
just enough of Datomic back, while the heavier machinery of reified transactions,
formal retractions, covering indexes, and bitemporal history stays declined. The
reasoning, and why the fuller model is the wrong trade for a browser database, is
recorded in [ADR-0020](adr/0020-logical-clock-ordering-over-wall-clock-key.md).

## The cost the project accepts

Immutability is not free. Every read folds history, and every append invalidates the
projections so they fold again, work that a mutable read-model would avoid. The
project accepts this deliberately at its current scale: under 5,000 tracked entities
the fold is cheap, and the simplicity of one uniform store is worth more than the
saved cycles.

The escape hatch is written down rather than improvised, in
[ADR-0015](adr/0015-worker-side-eavt-projection-engine.md) and
[ADR-0019](adr/0019-param-less-projections-with-main-thread-narrowing.md). A CQRS
read-model is the designated scaling path, and it waits for the day the ledger passes
roughly 10,000 entities and `postMessage` serialization becomes a measured
bottleneck.

## The same idea, applied to text

The body of a **Note** is where the model meets its own edge. Collaborative text
cannot be resolved by letting the latest datom win, because two devices editing the
same sentence would erase each other's words. So Notes and Checklists ride the ledger
as an append-only op-log of merge operations rather than as last-write-wins facts,
described in [ADR-0018](adr/0018-notes-checklist-crdt-oplog-in-ledger.md).

The accumulate-only instinct is kept and only the resolution rule changes, from last
write wins to one that merges: the same commitment, append and never overwrite,
carried into the one place where last-write-wins would destroy data.
