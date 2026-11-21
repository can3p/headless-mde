---
name: critic
description: Challenge a plan before any code is written - send it to a fresh critic subagent that checks modularity, gaps, blockers, conditional sprawl and better alternatives against the real code, then revise the plan. Use after drafting a plan for a feature, fix or refactor in headless-mde and before editing src/, or when asked to "critique", "challenge" or "stress-test" a plan.
---

# Critic: test a plan before implementing it

A plan is cheaper to fix than code. Before you change `src/`, hand the plan to a critic that did not write
it and has not seen your reasoning. Its job is to find what is wrong, not to approve.

## 1. Write the plan down

Put it in a file in your scratchpad (not in the repo). It holds:

- the problem in one or two sentences, and where it lives (`src/lib/<file>.ts`)
- the intended behavior as a table of input → result, using the test notation `>` for `selectionEnd`,
  `<` for `selectionStart`, `│` for a caret in prose
- the files and functions you will add or change, and which existing ones you will reuse
- what stays out of scope
- the tests you will add (`src/tests/<area>.test.ts(x)`)

## 2. Run the critic as a subagent

Spawn one `general-purpose` subagent in the foreground. Give it the plan file path and this brief,
filled in. It must start cold: don't paste your reasoning, only the plan.

> You are a critical senior reviewer of a plan for the TypeScript library at `<repo path>`, a headless
> textarea markdown editor (`src/lib`: `Cursor.ts` text and selection edits, `handlers.ts` commands,
> `extensions.ts` keyboard and paste behaviors, `utils.ts` pure helpers, `bootstrap.ts` wiring).
> Read the plan at `<plan path>` and the code it touches. Do not modify the repo. You may write probe
> tests to check the current behavior: copy them into `src/tests` named `zz-critic-*`, run `npx jest
> <file>`, and delete them before you finish so `git status` is clean.
>
> Answer, with file:line references and saying which claims you verified with a probe:
> 1. **Modularity**: will the change keep pure logic separate from DOM and `Cursor`, reuse existing
>    helpers instead of duplicating them (line splitting, quote and list parsing, fence detection), and
>    put each rule in one place?
> 2. **Gaps**: which inputs or interactions does the plan miss? Consider nesting, empty lines, caret vs
>    selection, caret inside markup, code blocks, CRLF, the other extensions that listen to the same key
>    or event (and their registration order in `bootstrap.ts`), Shift and other modifiers, IME, undo,
>    the React component, and the `NODE_ENV === 'test'` paths that jsdom runs instead of the browser ones.
> 3. **Blockers**: what must change in the plan before coding starts, ranked?
> 4. **Spaghetti**: will the change spread conditionals across files or grow functions with many branches?
>    Where exactly, and is it acceptable?
> 5. **A better way**: is there a simpler or more general design? Compare cost and benefit honestly for
>    a small library, including "do less".
>
> Be specific, don't pad with praise, stay under ~700 words, and end with a ranked list of plan changes.

## 3. Act on it

- Fix every blocker in the plan, or write down why it does not apply.
- Move "can wait" findings to the out-of-scope list so the PR description can name them.
- If the critic proposes a better design, either adopt it or record in one line why not.
- Tell the user what changed in the plan before you start coding, when the change is not small.

Run the critic again only if the plan changed substantially.
