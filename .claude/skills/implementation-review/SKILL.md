---
name: implementation-review
description: Validate a finished change in headless-mde before pushing - a fresh reviewer subagent checks the diff for modularity, gaps, blockers, conditional sprawl and a better design, verifying findings with probe tests; then fix the blockers. Use when the implementation is done and tests pass, before `git push` or opening or updating a PR, or when asked to review the current branch.
---

# Implementation review: validate the diff before it ships

The author of a change is the worst judge of its gaps. When the change is done and `npm run lint`,
`npx tsc --noEmit` and `npm test` pass, hand the diff to a reviewer that starts cold.

## 1. Fix the range

Find the base the branch started from (`git merge-base HEAD origin/master`, or the last released commit
in a shallow clone) and check that `git diff <base>..HEAD` holds only this change. Commit first: the
reviewer reads commits, not the working tree.

## 2. Run the reviewer as a subagent

Spawn one `general-purpose` subagent in the foreground with this brief, filled in. Pass the intended
behavior (the plan's table, or the PR description), never your reasoning.

> You are a critical senior reviewer. Review the change `git -C <repo path> diff <base>..HEAD` in the
> TypeScript library at `<repo path>`, a headless textarea markdown editor. Read the diff and the code
> around it in `src/lib` and `src/tests`. Intended behavior: `<table or summary>`.
> Do not modify the repo. You may run `npx jest`, `npx tsc --noEmit` and `npm run lint`, and write probe
> tests: copy them into `src/tests` named `zz-critic-*`, and delete them before you finish so
> `git status` is clean.
>
> Answer, with file:line references, marking each finding you reproduced with a probe as verified:
> 1. **Modularity**: is pure logic kept apart from DOM and `Cursor`? Is anything duplicated that an
>    existing helper already does (line splitting, quote and list parsing, fence detection)? Are names
>    honest?
> 2. **Gaps**: which behaviors are wrong or missing? Probe nesting, empty lines, caret vs selection,
>    caret inside markup, code blocks, CRLF, the other extensions on the same key or event and their
>    order in `bootstrap.ts`, Shift and other modifiers, IME, undo, the React component, and code that
>    only runs outside `NODE_ENV === 'test'`. Does the change alter behavior for users who did not opt
>    in to a new option? That is a regression and ranks first.
> 3. **Blockers**: what must be fixed before merge, and what can wait? Rank them.
> 4. **Spaghetti**: does the change spread conditionals across files or grow functions with many
>    branches? Name the worst spots and say whether they are acceptable.
> 5. **A better way**: is there a simpler or more general design? Weigh cost against benefit for a small
>    library.
>
> Be specific, don't pad with praise, stay under ~900 words, and end with a ranked "fix now" list.

## 3. Act on it

- Fix every blocker and every regression on the same branch, each with a test that failed before the fix.
- Fix "should fix" items now when they are small; otherwise list them under "Follow-ups" in the PR
  description.
- A larger redesign the reviewer proposes goes to its own issue or PR with instructions for whoever picks
  it up, not into this change.
- Re-run lint, types and tests, update the README if behavior changed, push, and update the PR
  description with what the review found and what was fixed.

Run the review again only after substantial rework.
