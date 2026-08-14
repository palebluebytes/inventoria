# Architectural Decision Records

An ADR records a decision and the reasoning that produced it, so that a reader six
months later can tell what was chosen from what was merely never questioned. Copy
[TEMPLATE.md](TEMPLATE.md) to start one.

## When to write one

Write an ADR for a non-obvious architectural or data-model choice: a new attribute
family, a change to how the ledger is read or written, a shared UI primitive that
forbids alternatives, a dependency that is hard to reverse.

Do not write one for work that merely applies a decision already recorded. If you
find yourself writing "as ADR-0027 requires", you are implementing, not deciding.

## Sourcing outside claims

Cite a canonical source for every claim about an outside system, and treat it as
verified at the date the record was written. Re-verify before extending a claim
rather than inheriting it. Deeper investigation belongs in a research note at
`docs/research/NN-slug.md`, numbered by the issue that commissioned it and linked
from the ADR that consumed it.

What this project kept or dropped of somebody else's model is a repo fact. Read that
from the ADR, never from the source.

## The header

Every record carries the same block directly under its H1, and `pnpm docs:check`
enforces it:

```markdown
# ADR NNNN: Title

**Status:** Accepted
**Date:** 2026-08-14
**Amended by:** ADR-0043 §2 (what the later record changed)
**Implemented:** #101 `45f6b21`, #102 `535aedf`
```

Only `**Status:**` is required. Each line ends with two trailing spaces so the block
renders as one paragraph.

### Status is a closed vocabulary

Exactly three values are legal:

| Value                    | Meaning                                            |
| ------------------------ | -------------------------------------------------- |
| `Accepted`               | The decision stands.                               |
| `Superseded by ADR-NNNN` | A later record replaces this decision wholesale.   |
| `Withdrawn`              | The decision was reversed and nothing replaced it. |

All three change only when a human decides they should. That is the point. Status
used to be free prose carrying implementation state, and by 2026-08 five records
claimed "not yet implemented" for work that had shipped months earlier, because
nothing about shipping prompted anyone to edit the record. Anything that can go
stale on its own belongs in a trailer line, not in the status.

### The trailer lines

- **`Date:`** when the decision was made. It never changes.
- **`Amended by:`** a later ADR that revises part of this one. See below.
- **`Implemented:`** evidence that the decision landed. Commits, issue numbers, or
  the files that carry it. Treat it as a code pointer as much as a status: it is the
  fastest route from "why is this so" to "where is this".

## Supersession must be linked from both ends

If a record says it amends or supersedes an earlier one, the earlier one's header
must name it. `pnpm docs:check` fails otherwise.

This is the highest-value rule here. A stale status misleads a reader; an unlinked
supersession makes them implement a design that was explicitly overturned. ADR-0035
declared in three separate places that it amends ADR-0034 §1 and §2, and ADR-0034
said nothing, so anyone reading ADR-0034 alone built the wrong thing.

Use **`Superseded by`** in the status when a later record replaces the decision
whole, and **`Amended by`** in the trailer when it revises only part of it. Partial
revision is much the more common case.

## Corrections go at the bottom, never in place

When a clause of a shipped ADR turns out to be false, append an
`## Amendment (YYYY-MM-DD): <what changed>` section rather than editing the decision
text. The record is a historical document; rewriting it destroys the evidence of what
was actually decided and when.

This mirrors the ledger the project is built on. ADR-0002, ADR-0014, and ADR-0023 all
carry amendments of this kind.

## Numbering and naming

Files are `NNNN-kebab-case-slug.md`, numbered sequentially with no gaps and never
reused. Nothing generates an index; `ls` is the index.

Records are never deleted. A decision that turned out wrong becomes `Withdrawn` or
`Superseded by`, which is information a reader needs.
