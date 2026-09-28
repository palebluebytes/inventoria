# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues, worked through the `gh`
CLI. **This file is the label vocabulary's only home**; `AGENTS.md` §2 routes
here rather than restating it.

## The labels

Two families. An issue carries at most one from each.

**Triage — who the issue is waiting on.**

| label             | means                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `needs-triage`    | Filed, not yet evaluated. The default for anything new.                                                                                                                                                                                                                                          |
| `needs-info`      | Waiting on the reporter.                                                                                                                                                                                                                                                                         |
| `ready-for-agent` | Fully specified. An AFK agent can take it without asking a question first.                                                                                                                                                                                                                       |
| `ready-for-human` | Specified, but the decision in it is the maintainer's. Use this when an agent could produce the evidence and should not be the one grading it — [#188](https://github.com/palebluebytes/inventoria/issues/188)'s premise, that whoever writes a rule does not also get to say whether it worked. |
| `wontfix`         | Closed with the reason on the thread.                                                                                                                                                                                                                                                            |

**`wayfinder:` — what kind of work the issue is**, and therefore which skill
answers it. A map charts an arc and hangs the rest off itself.

| label                 | means                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wayfinder:map`       | The parent that charts an arc. Titled `Wayfinder: <what it charts>`. It closes when its children do, and its decisions land in an ADR.                   |
| `wayfinder:research`  | A question answered against primary sources, producing a note in `docs/research/`.                                                                       |
| `wayfinder:grilling`  | A design question to be stress-tested before anything is built.                                                                                          |
| `wayfinder:prototype` | A throwaway built to answer a design question. The branch is discarded; what survives is the finding.                                                    |
| `wayfinder:task`      | Build or measure. The kind that ends in a commit.                                                                                                        |
| `wayfinder:paused`    | Blocked on something unobtainable rather than undecided. Say what in the title, in parentheses — every one of these so far reads `(paused — no device)`. |

**Nothing checks that this table matches the repo.** A gate would have to reach
the GitHub API, and `pnpm check` runs on every commit and offline, so the cost is
wrong for what it buys. It is hand-maintained, and it has been wrong in both
directions at once: `AGENTS.md` named `ready-for-human` from `ce6629d7`
(2026-08-17) until 2026-09-15 while no such label existed on the repo, and over
the same period the six `wayfinder:` labels were carried by 142 issues while no
document mentioned them. If you add a label, add its row.

## Conventions

Most of `gh` needs no notes here. These three are the ones worth carrying:

- **Reading an issue** means reading its thread: `gh issue view <number> --comments`.
  A ticket's real specification usually lives in the comments, not the body.
- **Multi-line bodies go through a heredoc**, not an escaped `--body` string.
- **Listing with full context** in one shot:

  ```sh
  gh issue list --state open \
    --json number,title,body,labels,comments \
    --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'
  ```

  Add `--label` / `--state` filters as needed.

When a skill says "publish to the issue tracker", create a GitHub issue. When it
says "fetch the relevant ticket", run the `view` command above.
