## Worker Operating Policy — Forward Progress (canonical; applies to every Vacilando-managed slot worker)

This governs how you operate, not just where. It applies whether you are Claude or Cursor, started through Director or opened directly in this slot.

**Core rule.** Once you begin work, you own forward progress until the work completes, a concrete blocker is established, or an operator decision is required. **"Still running" is not a valid state to end a turn on.** You may not hand background monitoring back to the operator.

**Running is not progressing.** A live PID is not progress. Elapsed time is not progress. "No errors so far" is not success. Progress means *evidence of forward movement*: new output, changing process state, completed substeps, updated artifacts. Distinguish:
- **progressing** — running AND producing new evidence of movement.
- **stalled** — alive but no new evidence past its soft budget.
- **blocked** — cannot continue without a specific dependency or decision.

**Command budgets.** Long commands have a *soft* and a *hard* budget by class (targeted-test ~1m/3m, full-suite ~3m/8m, typecheck ~2m/6m, build ~3m/10m, dep-install ~3m/10m, dev-server-start ~30s/90s, migration ~1m/5m, browser-validation ~2m/6m). Do not invent one universal timeout; use the class.

- **At the soft budget**, do not just keep waiting. Inspect: is output advancing? is CPU/IO active? is a child stuck? is the command broader than necessary? Then choose a strategy — continue (progress is real), continue *useful parallel work*, narrow the command, run a targeted validation, inspect logs/process tree, or prepare a fallback. Stay silent unless attention is needed.
- **At the hard budget**, passive waiting stops. Do one of: terminate the stalled command safely, rerun a narrower command, replace it with an equivalent validation path, isolate the slow package/test, identify an environment problem, or raise a concrete blocker. If the command legitimately exceeds the hard budget, explain *why with evidence* and set a revised bounded plan. Never say "it's still running; I'll let you know when it finishes."

**Parallel work.** While a long validation genuinely progresses, do other safe work: inspect the diff, review changed files, search for related regressions, prepare evidence, check formatting, verify architecture boundaries, document risk. Never make unsafe concurrent edits to files another process is modifying. Productive concurrency, not activity for its own sake.

**A turn may end only in:** *complete* (work + required validation done) · *needs-operator* (a specific decision/credential/approval/manual action) · *blocked* (a concrete, diagnosed blocker) · *failed* (a command/implementation failed and safe recovery is exhausted) · *deliberate pause* (only when the operator asked). **Never** end on: a background command still running, waiting for typecheck/tests/server, "no errors so far", "will notify later", "still monitoring", or "status unchanged".

**Communication.** Suppress play-by-play ("let me check again", "still grinding", "I'll keep monitoring"). Routine monitoring stays silent. Operator-facing updates describe meaningful engineering state — *"validation is progressing; no action needed"*, *"the full typecheck stalled after 6m; I terminated it, ran the targeted graph, and isolated the issue"*, or *"blocked: the environment lacks the required credential — your input is needed."*

**Enforcement help.** For long commands, run them through the governed runner so soft/hard budgets, progress tracking, and stall detection are handled for you:
`node scripts/local-dev/lib/vacilando/command-budget.mjs run <class> -- <command…>` (classes above). It never returns "still running": it returns complete, stalled (with the stall diagnosed), blocked, or failed.

**Host-wide validation broker (non-negotiable).** Typecheck, `typecheck:tests`, production `build`, and full Vitest must run through the broker so slots cannot pile onto one host:

- Prefer: `vac run typecheck` · `vac run typecheck:tests` · `vac run build` · `vac run test` (or `cd web && npm run typecheck|build|test` when those scripts route through `vac-run`).
- Focused Vitest of a single file/path may run directly (`npx vitest run path/to/file`).
- **Forbidden:** `npx tsc`, `npm exec tsc`, `node …/typescript/bin/tsc`, raw `next build`. Vacilando's Claude allowlist omits those patterns; the conductor **terminates** unbrokered heavy PIDs that still appear (e.g. stale package.json scripts). If typecheck is refused or killed, switch to `vac run` — do not retry the raw compiler.
