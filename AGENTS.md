# Agent context for headless-mde

A headless markdown editor for a plain `<textarea>`, in TypeScript, ESM only, with an optional React wrapper.

- `src/lib/Cursor.ts`: reading and editing the textarea value and selection. `Cursor.MARKER` in replacement
  text places the caret or selection. Every edit goes through `Cursor.applyEdit`: a native edit
  (`fireInput` in `utils.ts`, `execCommand('insertText')`, so undo works), then the selection, then
  `revealCaret` (`src/lib/caret.ts`), because browsers don't scroll to the caret after `execCommand`.
- `src/lib/handlers.ts`: toolbar commands (bold, lists, quotes, ...), wired by name in `commands.ts`.
- `src/lib/extensions.ts`: keyboard and paste behaviors, each behind an `enable*Extension` option in
  `types.ts`; `bootstrap.ts` registers them in order, and the order matters when two handle the same key.
- `src/lib/blockquote.ts`: pure functions for Enter, Backspace and paste inside quotes.
- `src/lib/utils.ts`: pure helpers (lines, quote markers, fenced code detection).
- `docs/`: the human-facing guide (`usage.md`) and behavior reference (`behavior.md`), rendered on the project site.
- `site/`: the project site (GitHub Pages), a playground built from `src/lib` plus the docs. `site/catalog.ts`
  holds the label and description of every extension and built-in command, typed so a new one fails the
  typecheck until it is described. `npm run start-site` serves it; `e2e/site.spec.ts` smoke-tests it.
- Tests live in `src/tests` (jest + jsdom) and `e2e/` (Playwright: Chromium, Firefox, WebKit). jsdom has no
  `document.execCommand` and no layout, so there `fireInput` sets the value directly and `revealCaret` does
  nothing.

Checks, all run by CI: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:site`,
`npm run test:browser`.

## Which suite a change needs

- Pure logic (`blockquote.ts`, `utils.ts` helpers, command text transforms): jest in `src/tests`.
- Anything that touches `fireInput`, `Cursor` edits, keyboard default actions, IME, paste, scroll or undo:
  also a browser test in `e2e/`. jsdom doesn't run those paths the way a browser does.

The browser suite serves `e2e/fixture` with the live `src/lib` (`node e2e/serve.ts`, started by Playwright).
`e2e/helpers.ts` has `open`, `setValue` and `expectValue` in the same notation as jest (`src/tests/notation.ts`),
and `runCases`, whose `undo: true` checks that an edit is one undo step. Use `page.keyboard`, never
`page.fill`: it skips key handling. Write a browser difference down as a per-browser expectation, not a skip.
Browsers: `npx playwright install --with-deps chromium firefox webkit`.

## Required workflow

1. **Plan, then critic.** Before changing `src/` for a feature, fix or refactor, write a plan and run the
   `critic` skill (`.claude/skills/critic/SKILL.md`) on it. Revise the plan for every blocker it finds.
2. **Implement**, with a test for each behavior and each bug fixed.
   **Keep the docs and the site current in the same change**: a new or changed behavior goes into
   `docs/behavior.md` (plain words, examples with `│` for the caret), a new option or command into the README
   API tables and `site/catalog.ts`, and a new behavior worth trying into the playground's sample text in
   `site/main.ts`. `src/tests/site.test.ts` checks that every extension is in the behavior doc with its default.
3. **Implementation review.** Once lint, types and tests pass, and before pushing or updating a PR,
   run the `implementation-review` skill (`.claude/skills/implementation-review/SKILL.md`) on the diff.
   Fix its blockers and regressions in the same change.

Both skills check the same five points:
- Is the code kept modular?
- What are the gaps?
- Which blockers are worth fixing now?
- Does the change turn the code into a spaghetti of conditionals?
- Is there a better way?

Agents without skill support read the `SKILL.md` files directly.

A one-line fix (a typo, a dependency bump, a docs change) needs neither step.

## Bugs you won't fix in this session

When you find a bug that isn't related to your change and you aren't going to fix it in the session, always
open a GitHub issue for it before you finish: what happens, how to reproduce it (input, caret, key, browser),
what should happen, and where in the code the cause is if you found it. Link the issue from the PR
description, and from the docs if they mention the bug.
