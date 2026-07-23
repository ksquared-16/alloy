# Operating Model Validation + Interaction QA — audit findings

Product certification audit, 2026-07-23. No implementation. Not a defence of the
architecture — a measurement of it.

## Part 1 — Director orchestration audit (Access & Roles V2)

**Question: is Director orchestrating, or forwarding one big prompt?**

| Stage | Real runtime? | Evidence |
|---|---|---|
| Capability Retrieval | **YES** | `capability.mjs::retrieveCapability` — durable capability store, deterministic id/name/token match. No provider call. Returned `cap_access_roles`, maturity=mature. |
| Knowledge Retrieval | **YES, but thin** | `knowledge.mjs::retrieveForCapability` — resolves the capability's *curated pointers*, stats each file (size + sha), versioned ranking, immutable snapshot `ksnap_…`. **It is reference-resolution, not search/discovery** — it can only return what the capability object already names. |
| Gap Analysis | **NO — not implemented** | `compiler_trace.reasoning_invocations: []` on every real package. No gap-analysis code path exists. |
| Reasoning Engine | **NO — does not exist** | `ls lib/vacilando \| grep -iE "reason\|gap"` → nothing. No module, no service, no invocation anywhere. |
| Mission Compilation | **YES, but templated** | `mission-compiler.mjs::compile` runs as deterministic code (trace stages = `[capability, knowledge, compiler]`). **But** acceptance criteria, QA plan and deliverables are *hardcoded per mission-class inside the compiler*, not derived from capability acceptance truth. A structured envelope, not a reasoned brief. |
| Mission Package | **YES** | `mission-packages.mjs` — durable, versioned, projected; `readiness_status` **computed** by validation; reproducible via `compiler_trace` + `knowledge_snapshot`. |
| Worker Runtime | **YES** | `mission-executor.mjs` owns spawn, tracking, layered timeouts, session capture, outcome classification, output persistence, resume. The *work itself* is one `claude -p` turn — by design. |
| Provider Runtime | **YES** | Auth pre-check, capability matrix, fixed argv, prompt on stdin, `shell:false`. |
| Acceptance Runtime | **YES, basic** | `acceptance.mjs` — real deterministic evidence checks (file exists, sections present, git-attributed diff vs a mission baseline). Product fidelity honestly returns `operator_review` rather than faking a verdict. |

**Honest headline.** Director is **not** a prompt-forwarder for *preparation*: capability
truth, knowledge references, package structure, governance, criteria and acceptance
are all real runtime code executing outside any prompt. **But the two "intelligence"
stages of the claimed pipeline — Gap Analysis and the Reasoning Engine — do not
exist at all.** Consequently **all actual reasoning still happens inside the single
provider turn.** The claimed 8-stage pipeline is really a 5-stage deterministic one:

`intent → Capability → Knowledge → Compiler → Package → Worker → Acceptance`

## Part 2/3/4 — Interaction, lifecycle and response-time audit

### Measured API latency (standalone, server otherwise idle)

| Endpoint | Latency | Note |
|---|---|---|
| `/api/missions`, `/api/mission` | **0.02–0.04s** | durable stores are fast |
| `/api/state`, `/api/audit`, `/api/policies`, `/api/usage` | **0.02s** | cached |
| `/api/closeout` | **3.98s** | git |
| `/api/resources` | **5.84s** | process/disk scan |
| `/api/providers` | **22.93s** | shells out: `security`, `claude --version`, `cursor-agent status` |

### Same endpoints, as the UI actually experiences them

`providers 40.6s` · `closeout 25.4s` · `resources 21.2s` · **`missions 11.0s`** — an
endpoint that costs 0.04s standalone. **Head-of-line blocking confirmed:** the
single-threaded server serialises, so one slow shell-out starves every fast read.

### Button inventory + classification

| Control | Behaviour | Feedback | Class |
|---|---|---|---|
| Dashboard Refresh | works | toast in **1ms** ("this can take a moment under load") | **Working** |
| Nav (Command Center/History/Policies/Settings) | works | instant (2–4ms) | **Working** |
| Worker card select, Tabs | works | client-side instant | **Working** |
| Director → Quick Ask (empty draft) | refuses | toast "Empty instruction" | **Working** |
| Director → Quick Ask/Send (confirm dialog) | opens ~1s | Cancel/Ask | **Working** |
| Director → **Confirm ("Ask")** | executes | **213ms** to ack; card appears "Starting · 0s"; draft cleared; completed 11.8s with response | **Working (best-in-product)** |
| Mission → Compile Mission | works | toast + package panel | **Working** |
| Mission → Review Package | overlay 731ms | none while loading | **Working** |
| Mission → View Outputs | overlay **2.9s** | **no spinner** | **Slow / no feedback** |
| Mission → View Evidence | overlay **1.8s** | **no spinner** | **Slow / no feedback** |
| Mission → select a mission chip | correct after **~2.5s** (10s+ under load) | **none**; panel shows the *previous* mission meanwhile | **Misleading / state not refreshed** |
| Mission → Start Mission | enabled on **Completed** and **Interrupted** missions | — | **Disabled incorrectly** |
| Mission → Resume | **control does not exist** despite `interrupted (resumable)` state | — | **Missing** |
| Closeout tab | renders 3.4s | none | **Slow** |
| Closeout → readiness verdict | **reports the wrong worktree** (see below) | — | **Misleading (dangerous)** |
| Worker dock | showed **5 cards, slot 5 missing** (6 earlier) | — | **State not refreshed** |

### Lifecycle consistency — three different lifecycles

| Action class | Lifecycle | Audited? | Confirmed? |
|---|---|---|---|
| Command registry (`worker.pause/resume`, `server.start/stop`, `closeout.*`, `repository.push`, delete worktree) | preview → confirm → execute → audit | **YES** | **YES** (typed confirm for destructive) |
| Director send (Quick Ask / Worker Instruction) | durable request created *before* execution → queued → starting → worker-running → terminal, retryable | **YES** (`director.send`) | **YES** |
| **Mission actions** (compile/start/steer/stop/evaluate/accept) | mission + package records with their own status vocabulary | **NO — zero audit events** | **NO — no confirmation gate** |

Evidence: `grep -c writeAuditEvent` = **0** across `mission-director.mjs`,
`mission-executor.mjs`, `mission-compiler.mjs`, `acceptance.mjs`. Audit log distinct
commands contain **no `mission.*`**. `active_request_id` is declared in the mission
schema and **never populated** — missions never create a Director request record.

**So the single most consequential action in the platform — Start Mission, which
spawns a real Claude process that writes files into the repo — is the *least*
governed action in the product.**

## The #1 finding — slot identity mismatch (data-integrity risk)

The Closeout tab for slot 6 reports:

> **Safe to close — next: Delete Worktree.** Nothing blocks closing this worker.
> PR merged into staging · Branch **0 ahead** · "all commits merged" · **0 uncommitted** · "no source at risk"

Ground truth:

| | Slot-6 metadata worktree | Where the server + all work actually is |
|---|---|---|
| Path | `wt6-vacilando-v2` | `wt6-vacilando-os-product-def` |
| HEAD | `0ad3e2f93` (merged PR #233) | `a118f97b4` |
| Ahead of staging | **0** | **7 commits** |
| Dirty | 0 | 0 (all committed) |
| Remote branches containing HEAD | — | **0** |

The server's own cwd is `wt6-vacilando-os-product-def`. **The same "slot 6" surface
describes two different worktrees:** the Mission/Worker runtime executes in
`wt6-vacilando-os-product-def` (a deliberate V1 decision to never touch siblings),
while the Dock card, Repository panel and Closeout readiness all describe
`wt6-vacilando-v2`. The "safe to close" verdict is *true for the sibling* and
*false for where the operator's work lives* — and it is presented with no
indication of which worktree it refers to. An operator following the UI's own
recommendation gets no warning that 7 unmerged commits exist.

This divergence was introduced by the V1 `REPO_ROOT` execution decision; the audit
shows its product consequence.

## Part 5 — Honest verdict

1. **Is Director actually orchestrating?** Partially. Real deterministic
   orchestration across Capability → Knowledge → Compiler → Package → Worker →
   Acceptance. Not theatre — but a 5-stage pipeline, not the claimed 8-stage one.
2. **Where is Director still a prompt forwarder?** Everywhere reasoning is
   required. With no Reasoning Engine and no Gap Analysis, scope interpretation,
   decomposition, criteria derivation and contradiction detection all happen
   inside the one provider turn. The compiler's criteria are hardcoded templates.
3. **Runtimes actually implemented:** Capability (1 seeded object), Knowledge
   (reference resolution only), Mission Compiler (templated), Mission Package,
   Worker, Provider, Acceptance (basic), Director routing.
4. **Runtimes still conceptual:** **Reasoning Engine**, **Gap Analysis**,
   **Product Definition Runtime** (decisions live inline on the capability object,
   not in a ledger), Knowledge *indexing/discovery*, capability registry beyond one
   hand-seeded capability, split-mission orchestration, staleness detection.
5. **Percentage genuinely implemented: ~50%.** The *execution* half (Package →
   Worker → Provider → Acceptance) is substantially real. The *preparation* half
   (Knowledge → Reasoning → Compiler → Product Definition) — the half that was the
   entire point of the upstream architecture — is roughly a quarter real.
6. **Would I trust it for daily operation today? No.** The mission pipeline itself
   is sound and honest, but Closeout actively misreports which worktree it is
   describing, mission actions are unaudited and unconfirmed, and the UI routinely
   stalls 10–40s with no loading state so the operator cannot tell success from
   hang.
7. **Top five defects blocking daily use:** see below.

## Recommended fixes — priority order

1. **Fix slot identity (P0, correctness/safety).** One slot must mean one
   worktree. Either repoint slot-6 metadata at `wt6-vacilando-os-product-def` or
   make every surface display and compute against the runtime's actual worktree.
   Closeout must name the worktree it audits and must count commits not contained
   in the base (`git log base..HEAD`), never infer "fully merged" from a merged PR.
2. **Stop head-of-line blocking (P0, responsiveness).** Cache/queue the shell-out
   projections (`providers` 23s, `resources` 6s, `closeout` 4s) off the request
   path — serve last-known-good immediately and refresh in the background, as the
   snapshot already does. No operator read should ever queue behind an auth probe.
3. **Put mission actions on the governed lifecycle (P0, governance).** Start /
   Stop / Steer / Accept must emit audit events and — at minimum for Start and
   Accept — require confirmation, matching every other consequential action.
   Populate `active_request_id` so a mission turn is a first-class durable request.
4. **Add loading state everywhere async (P1, trust).** Mission selection, View
   Outputs/Evidence, Closeout and tab data must show a pending state and must never
   render a *different* record's data while fetching. This single change removes
   most "did that work?" moments.
5. **Correct mission controls (P1).** Disable Start on `completed`/`running`;
   add the missing **Resume** control for `interrupted (resumable)`; disable
   Outputs/Evidence when there are none instead of toasting after a 3s wait.

Secondary: worker dock intermittently drops a slot (5 of 6 rendered); repeated
`/api/audit` polling floods the server.
