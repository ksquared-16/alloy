# Vacilando Alpha — Certification

Tag: `vacilando-alpha` @ `468515926` on `staging`. Product Realization V1 complete.

Vacilando is now an **operating environment**, not a finished project: a control plane where the operator manages engineering *work* — never provider sessions, worktrees, branches, or ports.

---

## What is complete

**Engineering Leadership (Director).** Director gives confidence-qualified, evidence-cited counsel using intelligence the product already computes. Readiness speaks differently at 0.2 than at 1.0; prior attempts are interpreted (continue-vs-restart) from the real mission store, not a static count; the one load-bearing unresolved question is surfaced rather than buried behind a green verdict. Machinery stays invisible.

**Shared Understanding.** The reliance surface is legible in the workspace: intent, the curated load-bearing claims the work rests on (typed by epistemic status × authorship — decided / settled / must / approach), the open frontier, what is knowingly carried (tradeoffs, accepted gaps, risk), Director's un-accepted advice, and superseded directions demoted to history. Projected from durable state; survives a restart, a provider change, a new conversation.

**Engineering Operations.** The operator runs work through honest engineering states — Preparing / Ready / Executing / Needs-you / Blocked / Verifying / Ready-for-review / Accepted / Closed — with meaningful progress (what changed, not what the engine said), a single interrupting state (needs-you), automatic verification of evidence against acceptance on completion, an assembled review (what changed · evidence vs. each criterion · risks · recommendation · requested action), operator sign-off, and closure. The engine stays beneath the work.

**Persistent Continuity (partial).** Missions, packages, product definitions, gap reports, and acceptance are durable append-only logs; a capability's Shared Understanding accretes across missions (decisions + rationale written back on accept). The reliance surface and operational state are reconstructed from that durable state alone — not from any provider transcript.

**Validation.** The complete operational loop was demonstrated **on the real runtime with a real provider** (authenticated Claude) against Access & Roles: Start → Executing (live progress) → Verifying → Ready-for-review → Accept → Close, with the provider window never opened. 79 mission-runtime tests + 26 regression tests, all passing, none skipped.

**Product Realization.** Three phases shipped as pure projections over the existing runtime plus two small honest additions (auto-verify, close) — no new doctrine, no competing model, no dashboard, no generic workflow engine. The smallest realization of the frozen architecture.

---

## What is intentionally incomplete

- **Persistent Engineering Continuity in full** — not built. Memory accretes per capability, but there is no cross-capability continuity runtime, no supersession/decay policy engine, no cross-session hand-off beyond durable state. Deferred deliberately.
- **Dynamic, resource-derived capacity** — capacity is still slot-shaped (fixed lanes/metadata), not derived from real machine pressure. Admission, headroom, and reclamation as first-class capacity functions are not built.
- **State reconciliation against ground truth, system-wide** — the mission/operational states are honest and verified per-piece, but the *toolkit's* worker-status can still report a stale "running" (e.g. a slot listed running on a port nothing listens to). The Operations Center's "never reconcile state by hand" promise is realized for a mission, not yet for the whole board.
- **Multi-provider / engine-preference** — execution runs Claude (and Cursor via the same adapter); engine selection, cost-aware routing, and engine-failure retry-on-another are not surfaced.
- **Discovery loop-back** — a load-bearing execution discovery does not yet automatically reopen the upstream understanding; today it surfaces as review risks for the operator to route.
- **Provider-backed reasoning** — Gap Analysis and all counsel remain deterministic. The reasoner seam exists; no provider reasoner is wired.

## What should be learned through operation

- Where the operator still reaches for the provider window, a terminal, `lsof`, or a branch — every such reach is a defect against "manage work, not substrate."
- Whether the single-interrupt rule holds under real load, or whether needs-you fires too often / too rarely.
- Whether "what changed" is the right grain of progress, or whether operators want more (diffs) or less.
- Whether the assembled review is sufficient to accept confidently, or what evidence is missing.
- How reference drift (like the Users & Roles move handled at this closeout) recurs, and whether capabilities need a self-healing reference check.
- Whether the confidence tiers and frontier selection match operator judgment on real, unfamiliar capabilities.

---

## Runtime

- Server: **live**, loopback `http://localhost:3020`, healthy.
- Worktree: `wt6-vacilando-os-product-def` · branch `agent/claude/6-vacilando-os-product-def` · clean.
- `staging` @ `468515926` (== HEAD), tag `vacilando-alpha`.
- Operating-environment note: this worktree carries a slot-6 registry entry (`~/.local/state/alloy-dev/metadata/…`) so work has an authoritative slot identity to run against. It doubles as the server host, so `hostIdentity().conflicts_with_slot` **discloses** the host==slot overlap — expected for a single-worktree alpha; in a multi-worktree setup work runs in a distinct slot.

---

## Next program — Vacilando Alpha Operations

Operate real engineering work through Vacilando. Observe friction. Collect evidence. Improve behaviour from real operation. Do not invent architecture; let real use reveal the next evolution.

**Recommended first capability after Access & Roles:** **Communications** — it is the sharpest not-yet-resolved case in the product (a "V2" with no V1 on record), so operating it exercises the parts Access & Roles did not: a live frontier that must be *decided* before execution, the needs-you interrupt for a real product decision, and the discovery-to-understanding path. Scheduling is the honest second (lowest confidence, thinnest evidence) to test how the weak-support path feels under real work.

## Architectural assumptions that remain unproven

1. **One deterministic Gap Analysis is enough** for real, unfamiliar capabilities — untested beyond seeded capabilities.
2. **Slot-shaped capacity is adequate** — the resource-derived capacity model is asserted in doctrine but unbuilt and unvalidated.
3. **Durable state fully reconstructs understanding** across a genuine provider/session change — proven across a server restart, not yet across a real cross-provider hand-off.
4. **The single-interrupt rule scales** — proven with one piece of work; unproven with many concurrent pieces competing for attention.
5. **The host can also be a slot** for a single-worktree operator without the overlap causing confusion — disclosed, but not exercised over sustained operation.
6. **Acceptance evidence checks generalise** — `file_exists` / `sections_present` / `git_clean` fit a docs-proposal capability; a code-changing capability's acceptance is unproven.
