# DevOps 8 — Agent Configuration Hygiene V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `8ccf4988b`, with DevOps 7 (`63c308d0a`,
carrying DevOps 6, 5, 4, 3, 2 and 1) merged in as the first commit.

---

## 1. Capabilities were verified before anything was written down

The mission warned against assuming settings from an article. Everything below
was read from the installed build first.

```
claude 2.1.269
--effort <level>   low, medium, high, xhigh, max     ← supported
--model <model>                                      ← supported
--agents <json>                                      ← supported
prompt-audit                                         ← DOES NOT EXIST
cost command                                         ← DOES NOT EXIST
```

So no prompt-audit wrapper was built and no cost baseline was fabricated. The
audit is Vacilando-side static inspection, which is what remained once the
unavailable options were struck out.

**Measured configuration state on this host:**

- `~/.claude/settings.json` — theme and notifications only. **No model, no
  effort.**
- project `.claude/settings.json` — `$schema` and `hooks` only.
- `~/.claude/agents/` — **does not exist.** No custom subagents are defined
  anywhere.

Every lane therefore runs at the session default, and a slot-renaming inventory
receives the same budget as a promotion-gate correctness trace.

## 2. The surprise: there is no per-lane prompt drift

All **39 lane worktrees** carry a byte-identical root `CLAUDE.md` — one SHA-256
across all of them, matching `origin/staging`. There is no "each lane accumulates
its own personality" problem to solve, because git already solves it.

What there is instead is **drift against reality**: prose stating values the
system computes differently. Shortening prompts would not have found one
instance of it. That reframing is the mission's actual result.

## 3. The precedence map

| # | Layer | Injected | Owner |
|---|---|---|---|
| 1 | Claude Code system prompt | yes | Anthropic / build |
| 2 | repository `CLAUDE.md` | yes | git — **the canonical baseline** |
| 3 | nested `CLAUDE.md` | yes | git — none exist; declared so adding one is visible |
| 4 | `.claude/settings.json` hooks | no | project — **enforcement, not instruction** |
| 5 | Vacilando run instruction | yes | Gateway `lane-dispatch`, per run — **the mission overlay** |
| — | toolkit `AGENT-INSTRUCTIONS.md`, `CHEAT-SHEET.md` | **no** | installed toolkit |

The last row matters more than it looks. Grepped across the toolkit and the
Vacilando library: **nothing reads those files at dispatch.** They are
documentation an agent may open, not active instruction — and treating them as
active is exactly how a stale line in one was assumed harmless.

The model the mission asked for falls straight out:
**canonical baseline (2) + program overlay (5) + mission instruction (5)**, with
a mission overlay structurally unable to outrank the durable baseline.

## 4. Findings, measured

### 4.1 The canonical root had drifted — `problem`, fixed

`CLAUDE.md` stated **`/Users/Kelly/Alloy`** as "the only sanctioned engineering
root". `alloy-root`, which owns that answer, reports **`/Users/vacilando/Alloy`**
and classifies this worktree as `managed-worktree · SANCTIONED`.

The prompt was restating, as a literal, a fact that a command computes — and the
literal had gone stale. Fixed by citing the owner:

```diff
-**The only sanctioned engineering root is `/Users/Kelly/Alloy`.**
+**`alloy-root` names the only sanctioned engineering root. Run it; do not assume a path.**
```

### 4.2 The port ceiling had drifted — `problem`, fixed

`CLAUDE.md` said "Permanent ports are **3011–3016**. Do not invent ports." The
slot registry allocates **3011–3022** — six beyond the stated ceiling. An agent
obeying the instruction would treat its own assigned port as invented.

Fixed the same way: the registry is cited, and "do not invent one" — the durable
half — is kept.

### 4.3 The same stale ceiling, restated in a second layer — `watch`

The toolkit's `AGENT-INSTRUCTIONS.md` line 81 repeats `3011–3016`. Correcting
`CLAUDE.md` alone leaves a second wrong copy in a layer nobody injects and
therefore nobody re-reads.

> **A detector bug caught in the act.** The first version of this check compared
> the toolkit's range against the range `CLAUDE.md` stated. The moment
> `CLAUDE.md` was corrected, the toolkit's stale copy became **invisible** — a
> detector that stopped working precisely because the thing it depended on got
> better. Each layer is now compared against the registry independently, which is
> the only way a duplicate can outlive the copy it duplicated.

### 4.4 A prompt rule whose guard is wired nowhere — `problem`, deliberately not fixed here

`scripts/local-dev/hooks/guard-push.sh` exists, has its own test, and documents
the incident it prevents (188 Vercel deployments from 120 pushed branches). It is
registered in **no** hook config and installed as **no** git hook —
`.claude/settings.json` names only `guard-supabase-start.sh` and
`route-heavy-validation.sh`, and `/Users/vacilando/Alloy/.git/hooks/` holds
nothing but samples.

**This is the finding that justifies the whole enforcement-check design.** A
hygiene pass that saw the file and concluded "pushing is code-enforced, the
prompt can stop saying it" would have deleted the only thing actually preventing
a push. So `enforcementStatus` credits enforcement **only when a wiring reference
is supplied**, and an unwired guard makes the prompt rule *more* necessary.

Recorded with an owner; wiring a push-blocking guard is a behavioural change to
another owner's enforcement path and is not this mission's to make.

### 4.5 The counter-example: a rule that is correctly enforced

`Never run supabase start` **is** backed by a registered `PreToolUse` hook. The
prompt keeps it and explains *why* — the 35-container incident — which is the
`CODE ENFORCES / PROMPT EXPLAINS` pattern working. Emphatic and correct, left
exactly alone.

### 4.6 Model compensation: measured, and largely absent

Scanned for anti-laziness and over-prompting language. `CLAUDE.md` returns **two
matches**, and both are `Never run supabase start` and a root-discipline line —
real safety rules attached to real enforcement, not model compensation.

**Reported as found rather than manufactured.** The mission warned against
blindly shortening, and the honest result here is that the canonical baseline is
already disciplined. The audit separates `class` from `keep` precisely so
"emphatic AND correct" and "calm and wrong" are different outcomes — 4.5 and 4.1
are the two cases, and only one of them was a defect.

## 5. Effort and subagent policy

```
mechanical    low       routine  medium
architecture  high      governance / certification / recovery  high
```

Configurable per model; an **unknown work class resolves to `medium`, not to the
cheapest option**, because guessing low on unrecognised work costs more than a
medium run. An unsupported level resolves to `null` with a reason rather than
being passed through to be silently ignored.

The policy **sets nothing** — a control asserts the module writes no environment
variable and names no `--effort` flag. Silently changing how much thinking
another lane's work receives is not something an audit module should be able to
do.

**Subagents: default posture `none`, ceiling 4.** Delegable work is a bounded
read whose output is a conclusion — targeted search, narrow inventory, isolated
proof, mechanical validation. Synthesis, design decisions, governance judgement
and final certification are never delegated, because delegating the reasoning is
how an agent ends up summarising a conclusion it cannot defend. Unrecognised work
is not delegated: silence means do it yourself.

Model routing per subagent **is** supported by this build and **is not**
configured — recorded as a fact, not proposed as a change.

## 6. Baseline version and drift

The baseline version is the **content hash** of the canonical instruction, not a
hand-maintained constant — a control asserts no such constant exists. A version
somebody must remember to bump is a version that silently stops moving, and the
failure mode is a lane believing it is current because nobody edited a number.

Drift reports `CURRENT` / `DRIFTED` / `UNRECORDED` / `UNKNOWN`, and a drifted
lane carries `durable_knowledge_action: "none"` — stated in the payload so no
consumer infers the opposite. DevOps 4 is explicit that a durable decision is not
invalidated because state moved, and a prompt version bump is state moving.

The lane record holds a **pointer and a version**, never the instruction text: a
copy of the instruction in every lane record is a second instruction system
wearing a different hat.

## 7. The audit, and what it will not do

`auditAgentConfiguration` is **read-only by construction** — a control asserts the
module contains no `readFileSync`, `writeFileSync`, `existsSync` or
`child_process`. Everything is passed in, so "read-only" is a property rather
than a claim.

It **never gates maintenance.** DevOps 7's seam declares `gates_admission:
false`; the audit payload repeats `gates_maintenance: false`; and a control drives
the real DevOps 7 reboot gate with a `problem`-severity audit and asserts the
reboot still proceeds. Failing a weekly reboot on prompt hygiene would be a
category error.

**One collector, two consumers.** `vac config-audit` and the `config.hygiene`
health check call the same `collectConfigurationAudit()`, so the CLI and the
health verdict cannot disagree — the preview-versus-execution divergence DevOps 3
already paid for once.

Live:

```
config.hygiene  problem  baseline ib_uklacx17l9i70  claude 2.1.269
  findings 3 · problems 1 · conflicts 0 · drifted lanes 0 · effort_configured false
```

## 8. What DevOps 9 gets, including the honest gaps

Provided: instruction baseline version, Claude version, effort policy and
supported levels, subagent policy, audit result, behaviour metrics.

**Not available, and said so rather than fabricated:**

- **per-run model identity** — Vacilando records the provider, not the model
- **token or cost accounting** — this build exposes none to a session

A canary can compare outcomes and durations. It cannot compare spend, and
inventing a number would give DevOps 9 a comparison between two fabrications.

## Certification

`agent-configuration` — **31 passed, 0 failed**, covering all fourteen required
proofs plus precedence determinism under input reordering, duplication versus
conflict, the unwired-guard distinction, and the read-only and no-second-registry
structural controls.

`test-canonical-root.sh` **19/0** and `test-sprint-ops-instructions.sh` **41/0** —
both exercise `CLAUDE.md` directly.

> **A correction the tests caught.** The first edit also removed the literal
> `Alloy-Claude`, and `test-canonical-root.sh` failed: that name is *not* a
> drifted host path but a retired clone named identically in the governance doc
> and the Cursor rule, so removing it broke a three-way agreement. The name was
> restored and only the stale absolute path stayed out.

Regression green: `host-maintenance` 50/0, `promotion-train` 63/0,
`development-migration-parity` 37/0, `development-production-apply-owner` 28/0,
`development-health` 30/0, `development-host-steward` 39/0,
`development-host-steward-automation` 23/0, `development-control-plane-recovery`
20/0, `development-governed-approval` 38/0, `governed-action-handoff` 15/0, and
the DevOps 1–5 contracts (17/22/27/22/23, all 0 failed).

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing installed, no Gateway
restarted, no toolkit replaced, Host Lifecycle lane and soak evidence untouched.
Held with `16601e54f`, `25c85997d` and `63c308d0a`.

## Remaining debt

- **`guard-push.sh` is wired nowhere.** The prompt rule is the only enforcement.
  Owner: the hook configuration in `.claude/settings.json`, or a git-hook
  installer. Recorded as a `problem` finding so it stays visible.
- **The toolkit's `AGENT-INSTRUCTIONS.md` still restates `3011–3016`.** It ships
  with the toolkit, so correcting it belongs to a toolkit change, not a repo edit.
- **No effort level is configured anywhere.** The policy exists and resolves; no
  caller passes `--effort` yet. Wiring it into session launch is a behavioural
  change that belongs with DevOps 9's canary, not with an audit.
- **Drift is measured against an empty lane list** in the live CLI: lanes do not
  yet record `instruction_baseline`. The shape is defined and the detector is
  proven against fixtures; populating it belongs with the next lane-bootstrap
  write.
