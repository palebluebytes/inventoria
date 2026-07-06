# Resources

Canonical sources for every outside-system claim the docs site makes. Verified at the
date of the journal entry that cites them; re-verify before extending a claim.

- [Datomic data model](https://docs.datomic.com/whatis/data-model.html)
  Rich Hickey's Datomic, the origin of the datom concept and the accumulate-only
  discipline. Defines a datom as "an immutable atomic fact" over entity, attribute, value,
  and transaction, and states that "new transactions only Accumulate new data. Existing
  datoms never change." Use for: the lineage claim on `append-only-ledger.html` and the
  one-line attribution on `eavt-vocabulary.html`, including the note that Inventoria
  diverges by timestamping with wall-clock `time` and carrying no explicit retraction Op.
