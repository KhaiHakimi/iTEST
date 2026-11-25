# AI testing agent

A local AI testing agent for YTL Cement Group's in-house web applications. It
opens an app in a browser, uses it the way a tester would, watches for hidden
errors and writes a bug report after every run. Everything runs on this
computer; no project data is sent to outside AI services.

Based on _Proposal: Local AI Testing Agent_ (v1.0, 24 November 2026).

## Status

| Phase              | What it builds                                                                           | Status             |
| ------------------ | ---------------------------------------------------------------------------------------- | ------------------ |
| 1. Foundation      | Project settings, app launcher, browser control, automatic error checkers, simple report | **Built**          |
| 2. AI testing      | Local AI connection and the testing loop for written test goals                          | **Built** (part 1) |
| 3. Requirements    | Requirements reader (README, spec, page list, recent changes)                            | Not started        |
| 4. Document reader | Image and PDF reading, evidence-based form auto-fill                                     | Not started        |
| 5. Better reports  | Screenshots, HTML report, severity sorting, duplicate removal                            | Not started        |
| 6. Automation      | Run on every change, AI-suggested tests                                                  | Optional           |

Phase 2 part 1 covers the prompt-injection safeguards, the testing loop,
scripted log-in and the evidence check. Still to come, in the proposal's build
order: checkpoints and resume, the replay check, the "not a bug" list, and
per-project rules files with fixed Playwright checks.

The AI loop is tested with a scripted stand-in for the model. It has not yet
been tried against a real local model; expect to tune the prompt once Ollama
is installed.

## Requirements

- Node.js 20.12 or newer (developed on Node 26)
- Playwright Chromium (`npm run browsers`)
- From Phase 2: [Ollama](https://ollama.com) with a local model

## Getting started

```powershell
npm install
npm run browsers          # downloads Chromium for Playwright (once)
copy .env.example .env    # model choice and fake test-account details
npm run agent -- doctor   # checks Node, Chromium and Ollama
npm run agent -- run demo # tests the bundled demo app
```

Without Ollama, the automatic checks still run and each AI test goal is
marked "could-not-finish" with the reason. Use `--skip-ai` to skip the goals.

The report is written to `reports/<project>/<timestamp>/report.md` (and
`report.json`). The `reports/` folder is excluded from git.

### Commands

| Command                               | What it does                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run agent -- run <project>`      | Tests a project and writes a report. `--headed` shows the browser; `--skip-ai` skips the AI goals. |
| `npm run agent -- list`               | Lists projects in `projects/`                                                                      |
| `npm run agent -- doctor`             | Checks this computer is ready                                                                      |
| `npm test`                            | Unit tests and the end-to-end demo run                                                             |
| `npm run lint` / `npm run fix`        | Google TypeScript style (gts)                                                                      |
| `npm run typecheck` / `npm run build` | TypeScript checks / compile to `dist/`                                                             |

Exit codes: `0` no high or critical findings, `1` high or critical findings
or a failed test goal, `2` the agent could not finish.

## Adding a project

Create `projects/<name>/project.json` (lower-case letters, digits and `-`):

```json
{
  "name": "scholarship-portal",
  "environment": "local",
  "baseUrl": "http://localhost:3000",
  "app": {
    "startCommand": "npm run dev",
    "cwd": "C:/path/to/scholarship-portal",
    "readyUrl": "http://localhost:3000/api/health",
    "readyTimeoutSeconds": 120
  },
  "pages": ["/", "/login", "/register"],
  "allowedOrigins": [],
  "checks": {"brokenLinks": true, "accessibility": true, "maxLinksPerPage": 50},
  "accounts": {
    "applicant": {
      "usernameEnv": "PORTAL_APPLICANT_USER",
      "passwordEnv": "PORTAL_APPLICANT_PASS"
    }
  },
  "login": {
    "path": "/login",
    "usernameSelector": "#email",
    "passwordSelector": "#password",
    "submitSelector": "button[type=submit]",
    "successSelector": "text=Dashboard"
  },
  "testGoals": [
    {
      "id": "submit-application",
      "goal": "Fill in the application form with valid fake data and submit it. A confirmation message should appear.",
      "startPath": "/apply",
      "account": "applicant",
      "maxSteps": 15,
      "allowActions": ["send"]
    }
  ]
}
```

| Field            | Meaning                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment`    | `local` or `staging`. Production is refused by design.                                                                                                                          |
| `baseUrl`        | Where the app is served. Also the only origin the agent may contact.                                                                                                            |
| `app`            | Optional. Omit it if the app is already running. `cwd` is relative to the project folder. If the app already answers at `readyUrl`, it is not started again.                    |
| `pages`          | Paths to open and check.                                                                                                                                                        |
| `allowedOrigins` | Extra origins the app genuinely needs (e.g. a staging login server). Everything else is blocked and reported as a low finding.                                                  |
| `checks`         | Turn the link and accessibility checks on or off.                                                                                                                               |
| `accounts`       | Test accounts by role. Settings hold only the **names** of environment variables; put the fake credentials in `.env`.                                                           |
| `login`          | Scripted log-in (no AI): page path, selectors for the fields and button, and a selector that only appears once logged in. Required if a goal uses an account.                   |
| `testGoals`      | Goals for the AI, written in plain language. `account` logs in first; `maxSteps` caps the AI's actions; `allowActions` lists dangerous words (e.g. `send`) this goal may click. |

Unknown keys are rejected, so typos fail loudly.

## How an AI test goal runs

1. A fresh browser session opens and, if the goal names an account, logs in
   with plain scripted steps. Credentials never reach the AI.
2. The agent lists the page's visible buttons, links and fields as short refs
   (`e1`, `e2`, …) and passes them, with the page text, to the local AI inside
   an `<untrusted_page_content>` block.
3. The AI replies with one action as JSON: `click`, `fill`, `select`,
   `navigate` (a path on the app only), `report_bug` or `finish`.
4. The action guard checks it in code before anything happens (see below).
   Refused actions are recorded and the AI is told why.
5. The automatic checkers keep watching for technical errors throughout.
6. A reported bug must quote text that is really on the page (evidence
   check). Kept bugs get a screenshot and steps to reproduce, and are marked
   **to confirm** for a person to review.
7. The goal ends when the AI finishes it (passed or failed) or runs out of
   steps ("could-not-finish").

## What Phase 1 detects

| Check                                     | Severity             |
| ----------------------------------------- | -------------------- |
| Page could not be opened                  | high                 |
| Uncaught JavaScript error                 | high                 |
| Server error (HTTP 5xx) from any request  | high                 |
| Client error (HTTP 4xx) or failed request | medium               |
| Console error                             | medium               |
| Broken same-origin link                   | medium (high if 5xx) |
| Accessibility (axe-core, WCAG 2.1 A/AA)   | medium or low        |
| Request blocked by the allowlist          | low                  |

## Safety rules built into the code

- **Allowlist**: every browser request outside `baseUrl` and `allowedOrigins`
  is aborted (`src/shared/url-allowlist.service.ts`). Service workers are
  blocked so they cannot bypass it.
- **No production**: `environment` only accepts `local` or `staging`.
- **Risky links are never followed**: log-out, delete, remove, cancel and
  similar links are skipped by the link checker, and redirects are not followed.
- **Local AI only**: the Ollama address must be localhost; anything else is
  refused (`src/ai/ollama.service.ts`).
- **Minimum tools for the AI**: click, fill, select, navigate to a path,
  report a bug, finish. No command line, file access or free URLs
  (`src/agent/agent-decision.schema.ts`).
- **Action guard**: the AI can only touch elements listed on the current
  page, cannot leave the allowlist, and cannot click buttons such as Delete,
  Pay, Send or Log out unless the goal's `allowActions` permits the word
  (`src/agent/action-guard.service.ts`).
- **Untrusted content is labelled**: page text reaches the AI only inside a
  marked block it is told never to obey, and page text cannot close that
  block early.
- **Suspicious text is reported**: phrases such as "ignore previous
  instructions" are flagged as findings.
- **Untrusted text stays inert in reports**: page text is fenced so it cannot
  reformat the report.
- **Test data only**: use fake data and documents marked "SPECIMEN / TEST".
  Never point the agent at real customer or staff data.

## Setting up Ollama (for Phase 2)

1. Install Ollama for Windows (ask IT Support if software installs are
   restricted on your machine).
2. Pull a model: `ollama pull qwen3:8b` (about 5 GB). Without a dedicated GPU,
   start with `ollama pull qwen3:4b` and set `AGENT_OLLAMA_MODEL=qwen3:4b` in
   `.env`.
3. Run `npm run agent -- doctor` until the Ollama line shows `OK`.
4. Do not change Ollama to listen on the network (`OLLAMA_HOST=0.0.0.0`); the
   proposal requires the AI service to be reachable from this computer only.
5. Confirm each model's licence allows company use before adopting it.

## Project layout

```
src/
  cli.ts                     Command-line entry point
  config/                    project.json schema and loader
  launcher/                  Starts and stops the app under test
  browser/                   Playwright browser with the allowlist guard
  checkers/                  Error, link and accessibility checkers (no AI)
  report/                    Finding store and Markdown/JSON report writer
  runner/                    Orchestrates a run (checks, then AI goals)
  agent/                     AI testing loop: observer, brain, guard, executor, log-in
  ai/                        Local Ollama client (start-up check and chat)
  doctor/                    Environment readiness checks
  shared/                    Logger and URL allowlist
projects/<name>/project.json Per-project settings
examples/demo-app/           SPECIMEN app with deliberate bugs
tests/                       Vitest unit tests and the end-to-end demo run
tests/helpers/scripted-ai.ts Stand-in for the model so the loop is testable
```
