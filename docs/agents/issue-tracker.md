# Issue tracker: GitHub

Track work in GitHub Issues for `Egge21M/real-open-bidding`. Use the `gh` CLI from this repository; use `--repo Egge21M/real-open-bidding` when running elsewhere.

## Conventions

- Read a ticket with `gh issue view <number> --comments`; include its labels when evaluating readiness.
- List work with `gh issue list`, using state and label filters appropriate to the task.
- When an invoked workflow calls for publishing a ticket, create a GitHub issue with `gh issue create`.
- For multiline issue bodies or comments, write the exact text to a temporary file and pass `--body-file <path>`.
- Update labels with `gh issue edit <number> --add-label <label>` or `--remove-label <label>`, using `docs/agents/triage-labels.md`.
- Use `gh issue comment` and `gh issue close` when the task calls for commenting or closing.

Protocol requirements remain in `FLOW.md` and `NOSTR.md`; issues track proposed and ongoing work.

## Pull requests as a triage surface

**PRs as a request surface: no.**
