---
owner: platform
status: freeze-report
last_reviewed: 2026-07-19
supersedes: [docs/handoffs/runtime-v1-freeze-report.md]
---

# Runtime V1 — Freeze Report (governance)

This is the authoritative freeze recommendation for Runtime V1 as constitutional infrastructure. It
supersedes the operational status in `docs/handoffs/runtime-v1-freeze-report.md` (a prior implementation
artifact). The implementation is the source of truth; documentation was reconciled to it.

> **PROMOTION DECISION (2026-07-19).** Runtime V1 was **accepted as complete** and promoted. The
> historical Runtime **test debt was explicitly decoupled** into a separate initiative
> ([`runtime-test-hygiene-initiative.md`](./runtime-test-hygiene-initiative.md)) that does **not** block
> promotion — it is independent engineering, not Runtime V1 architecture. The recommendation below
> (Option B) documented the state *before* that decision; with test hygiene decoupled, Runtime V1 met
> the freeze bar and was merged to `staging` (fast-forward, local). See
> [`runtime-v1-closeout.md`](./runtime-v1-closeout.md).

## Recommendation: **OPTION B — architecturally ready to freeze; ONE final targeted sprint remains before merge to staging.**

The Runtime **architecture** is mature, documented, certified, and free of known defects. Products can be
built on it without reopening it (see the Executive Summary). Exactly **one small, well-defined
engineering sprint** stands between here and a clean merge: **the Runtime Test-Suite Sweep** (§3). You do
not merge constitutional infrastructure with a baseline-red runtime suite.

This is not Option A (there is a bounded blocker) and not Option C (no defect, no immaturity — the
architecture is sound).

## 1. What was verified this session

| Governance check | Result |
|---|---|
| Constitution reflects reality (Destination→Preparation→Provisioning→Commit→Settlement) | ✅ Ratified in `runtime-constitution-v1.md`; kernel/spec/doctrine reconciled |
| Ownership boundary (Runtime vs Product) documented + true | ✅ Constitution §3; no second owner; config drives runtime |
| Focus Panel = published Summary at commit; settlement enriches; workspace owns detail | ✅ Constitution §4; browser-certified (`docSource: published-doc`, summary card 362px) |
| Runtime Consumer doctrine (prepare→commit→settle; no click→loading→render) | ✅ Constitution §5; warm-first certified across Activity + 4 workspaces |
| Dead runtime code removed | ✅ Proven-dead deleted; flag-gated + superseded-but-wired documented (Purification Report) |
| Browser certification passes, no regression | ✅ All green; **0 max-update-depth loops**; Focus Panel / Work View / Activity / workspaces (Browser Certification) |
| Documentation matches implementation | ✅ Reconciliation found **no defects** — only docs trailing intentional changes; corrected (Law 5, spec §1.3, kernel vocabulary) |
| Clean tree, local commits, no push | ✅ (see §5) |

## 2. Freeze criteria — status

| # | Criterion | Status |
|---|---|---|
| 1 | Runtime owns Destination→Preparation→Provisioning→Commit→Settlement | ✅ documented + certified |
| 2 | Ownership boundaries clear; configuration drives runtime | ✅ |
| 3 | Focus Panel commits the published Summary composition | ✅ certified |
| 4 | Work View transitions behave like Runtime (no remount/flash) | ✅ certified |
| 5 | Operational workspaces share the warm-first lifecycle | ✅ (data lifecycle; not yet commit consumers — intentional deferral) |
| 6 | Runtime honors published composition (existing cards) | ✅ live-proven |
| 7 | Legacy/dead runtime code removed | ✅ proven-dead; flag-gated documented |
| 8 | No architectural questions open | ✅ reconciliation found no defects |
| 9 | **Runtime tests reflect the final contract (green)** | ❌ **baseline-red — the one remaining sprint** |
| 10 | Clean tree, local commits, no push/merge | ✅ |

## 3. The one remaining sprint (Option B, defined)

**Runtime Test-Suite Sweep** — bounded, self-contained, no new architecture.

- **Scope:** `tests/runtime/` + `tests/adminV2/runtime/` + the comms/tasks runtime tests.
- **The problem:** ~79 baseline-red tests, in three buckets: (a) **architecture-cutover assertions**
  that encode *superseded* behavior (delete/rewrite to the final contract — the largest bucket);
  (b) **brittle source-grep tests** standing in for behavior (replace with behavioral tests);
  (c) **cross-file test contamination** (shared module state makes a 3-file combo show 7 failures that
  the files pass individually — add proper `resetXForTests()` isolation). Plus updating D1/D4-style
  provisioning fixtures for the answer's new `focusPanelSummaryDoc` field.
- **Definition of done:** the runtime suites are green; every remaining test asserts the final contract;
  no test asserts deleted/superseded behavior; module-cache isolation is fixed.
- **Explicitly NOT in scope:** any architecture change, any new feature, any V2 concept.

Once this sprint is green, Runtime V1 is Option A and the branch merges to staging.

## 4. What is intentionally deferred to Runtime V2 (NOT freeze blockers)

Separated from defects — these are extensions built *on* frozen V1, not reopenings of it:

- Brand-new card **types** (existing archetypes are honored today; a new key needs code — scoped 5-step
  plan in the Scalability Certification).
- Archetype-driven rendering of the doctrine's not-yet-implemented archetypes.
- Operational workspaces as full K1→K2→K3 **commit** consumers (they share the warm-first *data*
  lifecycle today).
- Inbox to literal zero-fetch reopen (content already paints warm).
- The three bespoke warm caches (`oip` fuzzy key, `communications` multi-dataset, `family-workspace`
  prefix-invalidation) — legitimately different shapes, deliberately not forced onto `createWarmCache`.
- Flag-gated `comms_v2` legacy deletion (~1090 lines) — a **product decision** to make the flags
  permanent, then delete.
- The redundant late right-rail settlement fetch — a scoped V1.1 refactor.

## 5. Branch state (prepared, not merged)

- Branch `agent/claude/3-runtime-drawer-deletion` (Slot 3). Tree clean, all local commits, **nothing
  pushed, no PR, no merge** — per protocol. The branch is *prepared*: documentation and certification
  committed; the architecture frozen. Merge is gated on the §3 sprint and promotion authorization.

## 6. Answer to the governing question

> Can Alloy now confidently build products on Runtime V1 without reopening Runtime architecture?

**Yes — architecturally.** The lifecycle, ownership, Focus Panel model, and consumer doctrine are frozen
and certified; the extension points are clear; products publish composition and extend the answer, not
the runtime. The one caveat is hygiene, not architecture: land the test-suite sweep before the branch
merges. See the Executive Summary.
