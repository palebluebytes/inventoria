# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues, worked through the `gh`
CLI. Triage labels are listed in `AGENTS.md` §2.

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
