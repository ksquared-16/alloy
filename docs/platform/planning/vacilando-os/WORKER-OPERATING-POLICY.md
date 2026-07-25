# Worker Operating Policy — Forward Progress & Command Budgets

*How every worker in a Vacilando-managed slot operates when a command is long-running. The slot governs how the worker operates, not merely where.*

## The problem this ends

A Claude or Cursor worker could start a long-running command (typecheck, tests, build), poll it, report *"still running,"* and end its turn with the work incomplete — handing background monitoring back to the operator and treating passive waiting as progress. *"Still running" is not a valid state to end a turn on.*

## Core rule

Once a worker begins work, it **owns forward progress** until the work completes, a concrete blocker is established, or an operator decision is required. Running is not progressing (a live PID and elapsed time are not evidence of movement; "no errors so far" is not success). At a **soft** budget the worker inspects and chooses a strategy instead of waiting; at a **hard** budget passive waiting stops and it takes corrective action. A turn may end only in **complete / needs-operator / blocked / failed / deliberate-pause** — never on a background command still running.

The full operational text (injected into every worker) is the single canonical source: [`scripts/local-dev/lib/vacilando/worker-operating-policy.md`](../../../../scripts/local-dev/lib/vacilando/worker-operating-policy.md).

## One source, every worker (the shared seam)

The policy is **one file** — [`worker-operating-policy.md`](../../../../scripts/local-dev/lib/vacilando/worker-operating-policy.md) — never duplicated per provider. But *writing* the policy somewhere is not *delivering* it: a file on disk the worker never opens changes nothing. **A directly-opened Claude loads `CLAUDE.md`, not `.alloy-agent-instructions.md`; a directly-opened Cursor loads `.cursor/rules/*.mdc`, not that file either.** So each worker path needs a delivery seam that its provider actually consumes:

| Worker path | How the policy is actually delivered (consumed, not just written) |
|---|---|
| **Direct Claude** in a managed slot | a generated **`SessionStart` hook** in `.claude/settings.local.json` injects the slot instructions (incl. the policy) as session context — *certified*: a fresh `claude` in the slot quotes the rule verbatim |
| **Direct Cursor** in a managed slot | a generated **`.cursor/rules/worker-operating-policy.mdc`** (`alwaysApply: true`), rendered from the same canonical file — *delivery structural; behavior unproven* (no headless Cursor agent to exercise) |
| **Director-started mission** worker | the mission runtime's TURN PROTOCOL imports `WORKER_POLICY` from `command-budget.mjs` (same file) into the provider prompt |
| **Any future provider** | inherits by adding one delivery seam its provider consumes; the policy text stays single-sourced |

Both direct-worker artifacts are **generated per slot and git-ignored** (like `.alloy-agent-instructions.md`), written by `alloy_generate_agent_instructions` in `lib/agent.sh`. They are not committed duplicates — they are rendered from the one canonical file at slot-prep time.

## Enforcement — what is guaranteed vs. what is expected

Honesty about the boundary matters more than a strong-sounding claim. The AI's arbitrary tool use is **not** fully controllable; the product language must not pretend otherwise.

**Guaranteed by runtime — the governed runner** (`command-budget.mjs`, unit-tested). *For commands actually routed through it*, `runGoverned` / its CLI (`command-budget.mjs run <class> -- <cmd…>`) runs the command under its class budget, tracks real stdout/stderr progress, and at the hard budget **terminates a stalled command and returns a diagnosed result** — complete, stalled (diagnosed), blocked, or failed. It can never return "still running", and the CLI exits non-zero on anything but a clean completion, so a stall cannot be laundered into success. This is a real, deterministic guarantee. Supporting pure logic: `COMMAND_CLASSES` (soft/hard budgets by class, resolved tolerantly so hyphenated prose names like `targeted-test`/`full-suite` don't silently degrade to the default budget), `classifyCommandState` (evidence, never a PID), `assessCommand` (the continue / parallel / diagnose / corrective-action control loop).

**Best-effort guard — the Stop hook** (new). `command-budget.mjs stop-guard`, wired as a generated `Stop` hook, is what finally connects the turn-end validator to a **real directly-opened-Claude turn boundary** (previously `isValidTurnEnd`/`turnEndViolation` were pure predicates wired to nothing but tests). If a worker's final message hands passive monitoring back (`classifyPassiveWaitEnding` — the `FORBIDDEN_TURN_ENDS` vocabulary applied to prose), the guard **blocks the stop** and returns a correction that names the governed runner and the valid terminal states. It is deliberately **one-shot**: on Claude Code's `stop_hook_active` re-entry it allows the stop, so it *corrects a lapse without ever looping*. It is conservative (a message showing diagnosis / corrective action / a concrete blocker / real completion is not flagged; quoted or meta mentions of the phrase are stripped before matching). It is **not** a hard guarantee — natural-language detection is imperfect, and a determined worker can still stop on the second pass. Known bounded false positive: a worker that *quotes/discusses* the policy without quote punctuation may be nudged once (costs one clarifying turn, never a loop).

**Expected by policy (advisory).** Whether a worker *chooses* the governed runner over raw polling, and suppresses play-by-play, is guided by the now-delivered policy text — the runtime makes the right path easy and unambiguous but does not mechanically force every tool choice.

So the honest ordering: the governed command path **cannot** end as passive waiting; a direct worker is now **instructed** to use it *and actually receives that instruction*; and a **certified** fresh worker demonstrated compliance — choosing the governed runner unprompted and ending in valid terminal states.

## The regression, encoded

The exact failure — *edit a trivial file → start a long validation → it exceeds the soft threshold → poll → try to end with "still running; I'll notify on completion"* — is now covered at three layers: the turn-end validator (`turnEndViolation`), the stalled-at-hard classification (`assessCommand` → `corrective_action`), and the governed runner terminating a real stalled command. Certified live (see [`qa/worker-operating-policy/CERTIFICATION.md`](qa/worker-operating-policy/CERTIFICATION.md)): a genuinely fresh `claude` opened in a managed slot went from `NO_POLICY_LOADED` (baseline — the original defect, reproduced at the delivery layer) to quoting the rule verbatim once the SessionStart hook was in place, and in Case A (long-but-progressing) and Case B (stalled) it routed the command through the governed runner and ended in a valid terminal state without operator intervention.

## Verdict

A directly-opened Claude worker in a Vacilando-managed slot now **receives** the policy through the normal bootstrap and, when it does, owns forward progress — long commands run under a bounded control loop and the turn does not end because a background command is still running. The governed runner makes that guarantee mechanical for routed commands; the Stop guard catches an accidental passive return once; the rest is honest instruction, not a claim of total control. Cursor gets the same delivery; its behavior is not yet independently certified.
