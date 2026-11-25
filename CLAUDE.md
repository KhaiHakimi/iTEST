# AI testing agent: notes for Claude

Local AI testing agent from _Proposal: Local AI Testing Agent_ (v1.0,
24 November 2026). Phase 1 (foundation, no AI) is built; see README for the
phase table.

## Commands

- `npm run agent -- run demo` runs the agent on the bundled demo app.
- `npm test` (Vitest; includes an end-to-end run that needs Chromium). The AI
  loop is tested with `tests/helpers/scripted-ai.ts`, a scripted stand-in for
  the model; it has not yet been run against a real Ollama model.
- `npm run lint`, `npm run fix` (gts, Google TypeScript style).
- `npm run typecheck` (whole repo) and `npm run build` (`tsconfig.build.json`, `src/` only).

## Conventions

- TypeScript, ESM (`"type": "module"`, `nodenext`): relative imports end in `.js`.
- Types and interfaces go in `<module>/interfaces/*.interface.ts`; constants in
  `<module>/<module>.constants.ts`.
- One service class per file. Logic reused by several services gets its own
  service; helpers used by one service are `private` members of that class.
  Test private helpers through the public method that uses them.
- Services are wired by hand (no DI framework); `TestRunService` builds the
  per-run services.
- Dependencies are pinned to exact versions that were at least two weeks old
  when added. `playwright` and `playwright-core` must stay on the same version
  (`@axe-core/playwright` peers on `playwright-core`).

## Safety rules (do not weaken)

- The URL allowlist is enforced in code for every browser request; new AI
  tools (Phase 2) must go through it too.
- `environment` accepts only `local` and `staging`.
- Ollama must be on a loopback address. No cloud models.
- Never log secrets or values extracted from documents. Reports stay out of git.
- Dangerous actions (log out, delete, pay, send) are refused unless a test goal
  explicitly allows them.
- Page text given to the AI is wrapped as untrusted content and neutralised
  so it cannot close the block (`AgentBrainService`). Credentials never enter
  prompts; log-in is scripted (`LoginService`).
- AI-reported bugs must pass the evidence check and are marked "to confirm".

## Next: Phase 2 part 2

In the proposal's build order: reliability (checkpoints after each goal so a
failed run resumes), then the replay check (replay recorded steps in a fresh
browser: confirmed or could-not-reproduce) and the per-project "not a bug"
list, then per-project rules files with fixed Playwright checks.
