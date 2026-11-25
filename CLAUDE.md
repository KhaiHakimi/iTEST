# AI testing agent: notes for Claude

Local AI testing agent from _Proposal: Local AI Testing Agent_ (v1.0,
24 November 2026). Phase 1 (foundation, no AI) is built; see README for the
phase table.

## Commands

- `npm run agent -- run demo` runs the agent on the bundled demo app.
- `npm test` (Vitest; includes an end-to-end run that needs Chromium).
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
- Page text given to the AI must be wrapped as untrusted content (Phase 2).

## Next: Phase 2 (AI testing)

Per the proposal's build order: prompt-injection protection first (minimum
tool set, untrusted-content wrapping, dangerous-action block, suspicious-text
flagging), then reliability (scripted routine steps, timeouts and retries,
checkpoints), then evidence and replay checks, then per-project rules files.
