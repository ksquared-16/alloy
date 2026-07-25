# Worker Operating Policy — Direct-Worker Certification

*Certifies that the policy changes real behavior in a genuinely fresh, directly-opened worker — not just that unit tests pass or `command-budget.mjs` behaves in isolation. The original defect happened in a directly opened Claude session inside a managed slot; this is the path that had to be proven.*

Environment: managed slot 6, worktree `wt6-vacilando-os-product-def`, branch `agent/claude/6-vacilando-os-product-def`. Fresh workers were spawned as real `claude` subprocesses (`claude --version` → 2.1.217) opened with the slot as cwd — the same bootstrap an operator gets. No policy text was ever pasted into a worker's prompt.

## The defect, and why it survived the first two commits

The prior commits (`d9454c2ff` Understanding stage, `1a8570ed1` Worker Operating Policy) delivered the policy into (a) the mission-runtime TURN PROTOCOL prompt and (b) the governed runner. They also *appended* the policy to each slot's `.alloy-agent-instructions.md`. But **a directly-opened Claude loads `CLAUDE.md`, not `.alloy-agent-instructions.md`** — and the worktree `CLAUDE.md` never referenced it, and there was no hook to inject it. So a file that *contained* the policy was never *consumed* by the exact worker that first failed. Presence ≠ consumption.

### Baseline — the original defect, reproduced

A fresh `claude` opened in slot 6, asked (from startup context only) whether it had a Worker Operating Policy:

```
NO_POLICY_LOADED
```

It even noted it could see the *commit title* in git context but that this "is not an operating rule governing my own behavior." The instructions file existed on disk and contained the policy (grep = 5 hits); the worker still received nothing. **Defect confirmed at the delivery layer.**

## The fix (smallest shared seams in the direct-worker lifecycle)

Two generated, git-ignored, per-slot artifacts, both thin wrappers over the tested `command-budget.mjs`, both rendered from the one canonical `worker-operating-policy.md` (no duplicate policy text):

1. **`SessionStart` hook** (`.claude/settings.local.json`) → `command-budget.mjs session-start <instructions>` injects the slot instructions (incl. policy) as session `additionalContext`. Closes the delivery gap for direct Claude.
2. **`Stop` hook** → `command-budget.mjs stop-guard` reads the transcript's last assistant message and **blocks a passive-wait turn-end**, returning a correction. This is what connects the turn-end validator to a real direct-worker turn boundary for the first time. One-shot (honors `stop_hook_active`), so it corrects without looping.

(Cursor: a generated `.cursor/rules/worker-operating-policy.mdc`, `alwaysApply: true`, from the same source — delivery parity; see Cursor Coverage.)

## Direct Claude certification

### Delivery — certified

With the **generated** `SessionStart` hook in place (produced by the shipping `alloy_generate_agent_instructions`, not hand-crafted; no env var, no paste), a fresh `claude` in the slot answered:

> **"Still running" is not a valid state to end a turn on.**

…and named the governed runner (`command-budget.mjs run <class> -- <command…>`). Baseline `NO_POLICY_LOADED` → policy quoted verbatim. **Delivery certified through the normal bootstrap.**

The `Stop` guard also fired live in the same probe: the worker's first message *quoted* the forbidden phrase, the guard blocked the stop, and the worker was forced to continue and end `complete`. This exposed a benign false positive (quoting the policy); the classifier now strips quoted spans before matching, so quoting alone no longer fires while real passive reports still do.

### Case A — long but progressing

Neutral assignment (no coaching on *how* to handle timing): edit a fixture, then validate with a command that prints a progress line every second and exits 0 after ~18s.

- **Command path used:** the worker chose the **governed runner** unprompted (`command-budget.mjs run targeted-test`).
- **Terminal result:** `state=complete · completed in 18s`, all progress lines emitted, exit 0.
- The healthy-but-slow command was **not** killed for being slow; the worker returned only at the real terminal state.
- **Operator intervention required:** none. **Turn end:** `complete`.

### Case B — stalled / failing validation

Neutral assignment: edit a fixture, then validate with a no-output command that runs ~25s and exits non-zero.

- **Command path used:** the **governed runner** again, unprompted (`state=failed · failed (exit 1)`).
- **Terminal result:** the worker reported `failed` honestly — "an applied edit with a failing validation is a failed result, not a passed one." It did **not** report success, and did **not** end on "still running."
- **Operator intervention required:** none. **Turn end:** `failed` (a valid terminal state).
- Note: the fixture self-exited before the hard budget, so this exercised *worker-chooses-governed-runner + valid-terminal-state*. The stall→**terminate-at-hard** path is certified deterministically in unit tests with compressed budgets (a `setInterval` command with soft 40 ms / hard 150 ms is SIGTERM-killed and returned as `stalled` + `corrective_action`, never "running").

### Incidental defect found by behavioral certification

The worker naturally typed the class name as the policy prose writes it — `targeted-test` (hyphen) — but `COMMAND_CLASSES` keys are underscored (`targeted_test`), so `budgetFor` silently fell back to the **default** budget; `full-suite` didn't map to `full_test_suite` at all. Fixed: `budgetFor` now resolves separators and known aliases, so the advertised per-class budgets actually apply. Covered by a new test.

## Enforcement boundary (honest)

| Layer | Strength |
|---|---|
| Governed runner (routed commands) | **Guaranteed** — cannot end as passive waiting; terminates a stall at the hard budget; CLI exits non-zero on non-completion. |
| SessionStart delivery | **Structural** — a fresh direct Claude now *receives* the policy (certified by quotation). |
| Stop guard | **Best-effort, one-shot** — blocks a detectable passive turn-end once; never loops; imperfect NL detection; not a hard guarantee. |
| Routing choice / narration suppression | **Advisory** — guided by the delivered policy; the AI's per-turn tool choice is not mechanically forced. |

Answers to the Part V audit: the worker **did** choose the governed runner automatically (both cases); the policy-alone delivery is what enabled that, and the Stop guard is a backstop, not the cause; a worker **can** still emit an invalid terminal outside the governed runtime (the guard catches one obvious class of it, once); `isValidTurnEnd()` was connected to **no** turn boundary before — the Stop guard is its first real connection, and only for direct Claude. Hard-enforced = the governed runner. Advisory = everything about arbitrary tool choice.

## Cursor coverage

- **Delivery: structural.** A generated `.cursor/rules/worker-operating-policy.mdc` (`alwaysApply: true`) carries the same canonical policy; `cursor` is installed. No provider-specific duplicate policy exists (single source, rendered).
- **Behavior: unproven.** There is no headless agentic Cursor path in this environment to run a live stalled-command exercise. Cursor also has no governed-runner/Stop-hook equivalent — delivery parity only. Stated plainly rather than claimed.

## Regression evidence & tests

- Live transcript summaries: this document (baseline `NO_POLICY_LOADED`; post-fix verbatim quote; Case A `complete`; Case B `failed`; no operator re-prompt in either case).
- Focused tests added to `scripts/local-dev/tests/mission-runtime.test.mjs` (semantic rules, not brittle prose snapshots): passive-wait classification (flag / resolution-suppressed / quoted-suppressed / clean), `buildStopDecision` (block / allow / `stop_hook_active` loop-backstop), `buildSessionStartContext` (empty → null; framed content), CLI seams (`session-start` emits valid hook JSON; `stop-guard` blocks a passive transcript, allows a resolved one), `budgetFor` alias resolution, and governed-runner Case A / Case B.
- Suites green (node v22.21.1): mission-runtime **107/107**; Vacilando regression **26/26**; `bash -n` clean on `agent.sh`; `:3020` health `ok`.

## Product verdict

*Does a fresh directly-opened Claude worker in a Vacilando-managed slot now handle long-running commands without handing monitoring back to the operator?*

**Yes, for direct Claude, with an honest boundary.** The fresh worker now receives the policy through the normal bootstrap (certified), and in both a progressing and a stalled/failing case it routed the command through the governed runner and ended in a valid terminal state with no operator intervention. The governed command path is a hard guarantee; the Stop guard is a one-shot backstop; routing choice remains advisory but is now actually instructed and demonstrably followed. Cursor gets the same delivery; its runtime behavior is not yet independently certified.
