# Historical planning documents

Superseded material, kept because it records how the project got here. **Nothing in
this directory is current.** Do not take direction from it, and do not cite it as
evidence of how the system works today.

`pnpm docs:check` excludes this directory for the same reason.

| File                 | What it was                                           | Why it is here                                                                                                     |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `TODO.md`            | The V1 and V2 milestone checklist                     | Every V1 box is ticked, and the V2 section drifted in both directions. Work in flight is tracked as GitHub issues. |
| `V1_REQUIREMENTS.md` | Data shapes and ingestion payloads for the V1 modules | V1 shipped. The live registry of entity prefixes and attributes is `docs/eavt-vocabulary.md`.                      |
| `V2_REQUIREMENTS.md` | The V2 scope sketch                                   | Its live items are GitHub issues.                                                                                  |

For what is current, start at the [README](../../README.md).

## What was carried out before archiving

Five facts existed only in these files and are now recorded in the live docs:

- The media Engagement Event status enum (`saved`, `started`, `progress`, `completed`)
  is in `CONTEXT.md` and `docs/eavt-vocabulary.md`.
- The six `event/type` verbs, `event/target`'s polymorphism, `event/rating`'s 1 to 5
  range, and `event/quantity`'s string encoding are in `docs/eavt-vocabulary.md`.
- The OFF sodium-not-salt mapping rule is an amendment on ADR-0021, which also
  corrects that ADR's worked example.
- Data export and local-first sync, the one live V2 milestone with no ticket, is
  issue #105.
- The O(N\*M) event-to-twin matching in the media and acquisition folds, described
  in V2_REQUIREMENTS Module D and nowhere else, is issue #106.

`habit/target_reps` and `habit/rest_interval` were deliberately not carried: they
appear only in two test fixtures and are never written by `src/`.
