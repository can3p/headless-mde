# Agent context for headless-mde

A headless markdown editor for a plain `<textarea>`, in TypeScript, ESM only, with an optional React wrapper.

- `src/lib/Cursor.ts`: reading and editing the textarea value and selection. `Cursor.MARKER` in replacement
  text places the caret or selection.
- `src/lib/handlers.ts`: toolbar commands (bold, lists, quotes, ...), wired by name in `commands.ts`.
- `src/lib/extensions.ts`: keyboard and paste behaviors, each behind an `enable*Extension` option in
  `types.ts`; `bootstrap.ts` registers them in order, and the order matters when two handle the same key.
- `src/lib/blockquote.ts`: pure functions for Enter, Backspace and paste inside quotes.
- `src/lib/utils.ts`: pure helpers (lines, quote markers, fenced code detection).
- Tests live in `src/tests` (jest + jsdom). jsdom runs the `NODE_ENV === 'test'` branches, not the
  browser ones.

Checks, all run by CI: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Required workflow

1. **Plan, then critic.** Before changing `src/` for a feature, fix or refactor, write a plan and run the
   `critic` skill (`.claude/skills/critic/SKILL.md`) on it. Revise the plan for every blocker it finds.
2. **Implement**, with a test for each behavior and each bug fixed.
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
