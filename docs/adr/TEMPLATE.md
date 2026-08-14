# ADR NNNN: A sentence that states the decision, not the topic

**Status:** Accepted  
**Date:** YYYY-MM-DD

<!--
Delete this comment before committing.

Title: state what was decided. "Order datoms by a conflict-free logical clock"
beats "Datom ordering". A reader scanning `ls docs/adr/` should be able to tell
what each record settled without opening it.

Header: see README.md. Status is one of Accepted / Superseded by ADR-NNNN /
Withdrawn. Add `**Amended by:**` and `**Implemented:**` trailer lines as they
become true. Every line ends with two trailing spaces.

If this ADR amends or supersedes an earlier record, say so below AND add the
backlink to that record's header. docs:check fails otherwise.
-->

## Context

What forced the decision. The constraint, the bug, the thing that stopped working,
or the ambiguity that kept producing inconsistent code. Enough that a reader who
was not there understands why this could not simply be left alone.

Name the alternatives that were genuinely live, and say what ruled each one out.
An ADR whose Context reads as if only one option ever existed is not recording a
decision.

Cite research notes (`docs/research/NN-slug.md`) and the issues that produced them.

**Scope.** What this record covers, and explicitly what it does not. The second half
matters more; it is what stops a later reader treating a silence as a ruling.

## Decision

The decision itself, in sections if it has parts. Write it as a rule someone can
follow and check, not as a description of an implementation.

Where a clause constrains future work, say so plainly: "X is never written directly;
it is always derived from Y."

## Consequences

What this costs, what it makes easy, and what it forecloses. Include the negatives
honestly, especially the ones you expect to be argued with later. This section is
what an amendment will be measured against.

Note anything deferred behind a seam, and what would trigger picking it back up.
