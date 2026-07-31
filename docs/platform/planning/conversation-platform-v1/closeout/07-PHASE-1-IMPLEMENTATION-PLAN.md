# Conversation Phase 1 — Implementation Plan (rewritten)

**Supersedes** the Phase 1 section of `PHASE-CONTRACTS.md`.
**Status:** proposal, awaiting approval. **Not started.**

## What changed from the original plan, and why

The original Phase 1 was written during discovery, before Phase 0 executed. Four
findings invalidate parts of it:

| Original assumption | What Phase 0 found | Consequence for Phase 1 |
| --- | --- | --- |
| `executeCommunicationsSend` is the send gate | It is a wrapper with four independent bypasses | Phase 1 no longer builds *on* it — it **finishes retiring** it |
| Classification could be introduced alongside the message-model work | Columns without a required argument default silently to `operational` | Making `category` mandatory is now **step 1**, not a side effect |
| Eligibility is one check | It is two facts: authoring (immutable) and live (mutable) | The message model must carry a **snapshot**, which changes its shape |
| Preview and send share a renderer | They do not — the preview endpoint uses a different engine | Preview convergence moves **into** Phase 1's risk register even though it lands in Phase 3 |

The plan below is ordered by **what removes an asterisk from later claims**, not
by what is most visible.

---

## 1. Objective

Establish the canonical message model — structured content, mandatory
classification, and a Conversation entity above Thread — with **universal**
eligibility enforcement.

**Phase 1 succeeds when:** no send path can reach a provider without passing the
canonical enqueue gate, and no message can be enqueued without an explicit
classification.

## 2. Scope

**In:**
1. Converge the four remaining send paths onto `enqueueCanonicalOutboundMessage`.
2. Make `category` and `audience` required at the enqueue boundary.
3. Retire or reduce `executeCommunicationsSend` to a thin delegate.
4. Introduce the **Conversation** entity above Thread.
5. Structured message content model (the substrate for interactive messages).
6. Retire `recordCategoryFallback` once it reads zero.

**Out — explicitly:**
- Composer convergence (Phase 2)
- Preview renderer convergence (Phase 3)
- Attachments, tracking, analytics (Phases 4–5)
- Any change to the legacy GHL vertical (contained; decommission is separate)
- Any storage redesign (live verification showed none is warranted)

## 3. Dependencies

| Dependency | State | Note |
| --- | --- | --- |
| Enqueue choke point | ✅ exists | Phase 1 extends coverage from 10/14 to 14/14 |
| Classification vocabulary + constraints | ✅ exists | D3, verified post-replay |
| Pure versioned evaluator | ✅ exists | bump `ELIGIBILITY_POLICY_VERSION` on any policy change |
| Cross-runtime contracts | ✅ exists | any new vocabulary goes here, not in either codebase |
| Behavioral harness | ✅ exists | commit 0 |
| **Staging migration ledger** | ✅ **repaired 2026-07-31** | 298/298, 0 orphans, 0 pending; promotion restored |

## 4. Work order

Ordered so each step removes an asterisk from the next.

### Step 1 — Universal enqueue coverage *(removes D-2)*

Re-point the four bypassing paths. Then add the structural test:
**no module may import a provider adapter except the dispatch worker.**

*Why first:* every later statement about eligibility is qualified until this
lands.

*The free-text recipient question this step raised is now **DECIDED** — see §4a.
Implement the recipient model before re-pointing `/communications/send`.*

### Step 1a — Canonical recipient modelling *(decided 2026-07-31)*

`/api/admin/communications/send` accepted a free-text `to` with no
`recipient_person_id`, so there was no person whose consent could be checked.
That is why the old gate was inert by construction. The resolution is not "allow
it" or "ban it" — it is to make the recipient an explicit, typed thing.

**Three recipient kinds. There is no fourth, and no untyped fallback.**

**1 · Person recipient — the normal path for family/customer communication.**

```
Person → channel identity → communication preferences → eligibility
       → conversation/thread → message
```

A bare address or phone number is **not** sufficient for family or customer
communication. Full consent semantics apply.

**2 · Internal recipient.** Resolves to an Alloy User/Person identity and sets
`audience = internal`. External consent semantics do not apply — but permissions,
org scope, audit, and identity validity all do. Internal is not a bypass.

**3 · External operational recipient** — bounded, explicit, non-Person.

For vendors, contractors, inspectors, attorneys, professional service providers,
and contacts at other organizations who are not canonical People. Requires
**all** of:

| Requirement | Rule |
| --- | --- |
| Recipient type | explicit `external_operational_recipient` — never inferred |
| Audience | explicit external-operational |
| Category | `operational` or `transactional` **only** |
| Marketing | **prohibited** |
| Purpose | **server-owned** — never client-supplied |
| Recipient object | bounded: name + address/phone captured together |
| Attribution | organization and authorizing actor recorded |
| Reason | audited reason for use |
| Fallback | **none** — a failed Person resolution must fail, never silently downgrade |
| Semantics | no household or customer semantics attach |
| Exposure | no arbitrary public API send |
| Lifecycle | promotable to a canonical Person later where appropriate |

**The load-bearing rule is "no silent fallback."** If Person resolution fails,
the send fails. A downgrade path would recreate exactly the hole Phase 0 closed —
an unresolvable recipient that no consent check can evaluate.

*Acceptance for this step:* a send with an unresolvable Person and no explicit
external-operational recipient **fails**; an external-operational send with
`category = marketing` **fails**; a client-supplied `purpose` on an
external-operational send is **ignored or rejected**, never honoured.

### Step 2 — Mandatory classification *(removes D-3, R-7)*

Make `audience` and `category` required arguments. Let the compiler find the call
sites. Keep the DB defaults as a backstop, not as the mechanism.

*Exit:* `recordCategoryFallback` reports zero across a full test run and a
staging cycle.

### Step 3 — Reduce `executeCommunicationsSend` *(completes A-10)*

Once steps 1–2 land it should be a thin delegate or deleted. Judge by whether
anything still needs it; do not preserve it for symmetry.

### Step 4 — Conversation entity

Introduce `conversations` above `communication_threads`: one conversation groups
threads across channels for one counterparty.

*Migration strategy:* additive. New table, nullable FK on threads, backfill one
conversation per existing thread. **No thread is deleted or merged in Phase 1** —
merging is a product decision, not a migration.

### Step 5 — Structured message content

A content model that can express more than a body string — the substrate
interactive messages need in Phase 3.

*Constraint:* `rendered_snapshot` must keep reconstructing a delivered message
exactly. Structured content does not replace the snapshot; it feeds it.

## 5. Migration strategy

Same discipline as Phase 0, which certified cleanly:

- **Additive only.** New tables, new nullable columns, new constraints on new
  columns. No drops, no destructive backfills.
- **Every migration guarded** (`IF NOT EXISTS` / `IF EXISTS`) so rerun is a no-op.
- **Certified in three modes before review:** clean replay from scratch, upgrade
  replay onto the prior set, idempotent rerun.
- **Local certification stack only** (`alloy-db-reset ./certification --recover-docker`).
  No shared-environment mutation without an explicit promotion window.
- Code must never be deployable ahead of its migration; migrations must be safe
  ahead of code.

## 6. Testing strategy

Phase 0 learned that source-shape assertions rot and behavioral tests do not.
Phase 1 inherits that ranking.

| Tier | Use for | Example |
| --- | --- | --- |
| **Behavioral** (preferred) | anything with an observable outcome | "an opted-out recipient is not dispatched to" |
| **Structural** | invariants no behavioral test can express | "no module imports a provider adapter except the worker" |
| **Parity** | cross-runtime vocabulary | both runtimes drive their real functions through the contract table |
| **Source-shape** | last resort only | must strip comments; must justify why behavior cannot be tested |

**Non-negotiable:** provider clients mocked; no live sends; disposable fixtures
or mocked storage; never mutate production objects.

**Two specific tests Phase 1 owes:**
1. Structural: no provider-adapter import outside the dispatch worker.
2. Behavioral: enqueue without a classification **fails** rather than defaulting.

**Baseline honesty.** Phase 1 inherits 25 pre-existing web failures and 2 backend
errors. Record the baseline at kickoff and hold to it; do not let a red suite
normalize. Fixing them is a separate decision (D-11).

## 7. Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | `/send`'s free-text `to` cannot be gated without a product decision | **High** | Blocks step 1 | Surface in week 1; propose "require resolvable identity, or restrict to internal/operational" |
| R2 | Mandatory classification breaks call sites broadly | Medium | Schedule | Let types find them; land behind the existing conservative default |
| R3 | Conversation entity invites thread-merge scope creep | Medium | Schedule | Backfill 1:1 and freeze; merging is a product decision |
| R4 | Staging backlog persists | **High** | Nothing promotes | Escalate now; it is not a Phase 1 task |
| R5 | Preview/send divergence surfaces as a Phase 1 bug report | Medium | Confusion | Documented (D-1); route reports to Phase 3, do not fix opportunistically |
| R6 | Another "correct-looking but wrong" gate exists | **Medium** | Silent security gap | Run inventories, not review; pin each with a test |

R6 is the one to take seriously. It already happened once (A-5) and was caught
only because an inventory ran at closeout.

## 8. Acceptance criteria

| # | Criterion | Evidence required |
| --- | --- | --- |
| AC-1 | All 14 send paths route through the canonical enqueue | inventory + structural test |
| AC-2 | Enqueue without classification fails | behavioral test |
| AC-3 | `recordCategoryFallback` reads zero | telemetry over a full cycle |
| AC-4 | `executeCommunicationsSend` is a thin delegate or deleted | diff + no orphan callers |
| AC-5 | Conversation entity exists; every thread has exactly one | migration + query |
| AC-6 | Structured content renders identically to today for existing messages | snapshot comparison |
| AC-7 | Migrations pass all three replay modes | certification transcript |
| AC-8 | Test baseline not regressed | before/after counts |
| AC-9 | Retirement Ledger updated (R-7 closed; new shims registered) | ledger diff |
| AC-10 | No live send, charge, or shared-environment mutation | commit review |

## 9. Exit criteria

Phase 1 is complete when **all** hold:

1. AC-1 … AC-10 satisfied.
2. **No asterisks.** Every eligibility claim is unconditional — no "10 of 14".
3. Debt Register updated: D-2 and D-3 closed; anything new registered with an
   owner and a phase.
4. A closeout inventory has been run — send paths, renderers, signers — and each
   surviving claim is pinned by a test.
5. Phase 2 readiness assessed the way this report assesses Phase 1.

**Explicitly not exit criteria:** composer convergence, preview convergence,
attachments, tracking. Those are later phases and must not be pulled forward to
make Phase 1 look complete.

## 10. What Phase 1 must not do

- Do not rebuild the legacy GHL vertical into the Conversation Runtime.
- Do not redesign storage.
- Do not make `purpose` compliance-bearing.
- Do not recompute classification after authoring.
- Do not give BOS or Current Work send authority.
- Do not add a send path that skips the message row.
