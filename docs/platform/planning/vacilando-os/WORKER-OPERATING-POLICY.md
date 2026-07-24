# Worker Operating Policy — Forward Progress & Command Budgets

*How every worker in a Vacilando-managed slot operates when a command is long-running. The slot governs how the worker operates, not merely where.*

## The problem this ends

A Claude or Cursor worker could start a long-running command (typecheck, tests, build), poll it, report *"still running,"* and end its turn with the work incomplete — handing background monitoring back to the operator and treating passive waiting as progress. *"Still running" is not a valid state to end a turn on.*

## Core rule

Once a worker begins work, it **owns forward progress** until the work completes, a concrete blocker is established, or an operator decision is required. Running is not progressing (a live PID and elapsed time are not evidence of movement; "no errors so far" is not success). At a **soft** budget the worker inspects and chooses a strategy instead of waiting; at a **hard** budget passive waiting stops and it takes corrective action. A turn may end only in **complete / needs-operator / blocked / failed / deliberate-pause** — never on a background command still running.

The full operational text (injected into every worker) is the single canonical source: [`scripts/local-dev/lib/vacilando/worker-operating-policy.md`](../../../../scripts/local-dev/lib/vacilando/worker-operating-policy.md).

## One source, every worker (the shared seam)

The policy is **one file**, read by both transports so no worker path is missed and the policy is never duplicated per provider:

| Worker path | How it receives the policy |
|---|---|
| **Direct Claude** in a managed slot | `alloy_generate_agent_instructions` (in `lib/agent.sh`) appends the canonical policy to the slot's `.alloy-agent-instructions.md` |
| **Direct Cursor** in a managed slot | same instruction file — the policy is provider-neutral |
| **Director-started mission** worker | the mission runtime's TURN PROTOCOL imports `WORKER_POLICY` from `command-budget.mjs` (which reads the same file) |
| **Any future provider** | inherits via the same two seams; a provider adapter needs at most a thin translation, not its own policy |

## Enforcement — runtime vs. advisory

**Enforced by runtime** (`scripts/local-dev/lib/vacilando/command-budget.mjs`, unit-tested):
- **Command classes with soft/hard budgets** — `COMMAND_CLASSES` (targeted-test, full-suite, typecheck, build, dep-install, dev-server-start, migration, browser-validation). Not one universal timeout.
- **State classification** — `classifyCommandState` distinguishes progressing / stalled / blocked / complete / failed from *evidence*, never from a PID or elapsed time.
- **The control loop** — `assessCommand` returns the required directive: continue (within budget) · continue-with-parallel-work (soft, still progressing) · **diagnose** (soft, stalled) · **corrective-action** (hard, never "keep waiting").
- **The governed runner** — `runGoverned` (and its CLI, `command-budget.mjs run <class> -- <cmd…>`) runs a command with its budget, tracks real progress, and at the hard budget **terminates a stalled command and returns a diagnosed result**. It never returns "still running", and its CLI exits non-zero on anything but a clean completion, so a stall cannot be treated as success.
- **Valid turn-end** — `isValidTurnEnd` / `turnEndViolation` reject "running", "still_running", "waiting_for_typecheck", "monitoring", "no_errors_so_far", etc.

**Advisory (instruction, not hard-enforced):** whether the worker *chooses* to run its long commands through the governed runner rather than raw polling, and whether it suppresses play-by-play narration, are guided by the injected policy text. The runtime provides the sanctioned tool and the classification; a worker that ignores the tool and polls by hand is out of policy but not mechanically stopped. This is the honest boundary — the runtime makes the right path easy, cheap, and unambiguous, but the AI's turn-by-turn tool choice remains guided by instruction.

## The regression, encoded

The exact failure — *edit a trivial file → start a full typecheck → it exceeds the soft threshold → poll → try to end with "typecheck is still running; it will notify on completion"* — is a permanent test: the turn-end is rejected (`turnEndViolation`), and at 7 minutes with no progress the typecheck is classified `stalled` / `hard_exceeded` with directive `corrective_action`, not another poll. Proven live on real commands: a typecheck-class and a full-suite-class command completed through the governed runner; a stall was diagnosed and terminated at the hard budget, never left "running".

## Verdict

A Vacilando-managed worker now owns forward progress: long commands run under a bounded control loop with required decisions, and the turn cannot end because a background command is still running. The worker keeps waiting only while evidence shows real progress — it can never keep doing the same thing forever or hand that waiting back to the operator.
