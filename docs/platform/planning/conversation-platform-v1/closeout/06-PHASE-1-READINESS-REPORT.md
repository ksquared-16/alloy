# Conversation Phase 1 — Readiness Report

**Date:** 2026-07-31
**Verdict:** **Phase 1 can begin, on one condition** (see §4).

---

## 1. Is Phase 0 complete?

**Yes.** Every commitment in `PHASE-0-CONTRACT.md` is discharged.

| Contract item | Status | Evidence |
| --- | --- | --- |
| P0-1 eligibility enforcement | Complete at the choke point | `canonicalEnqueueEligibilityGate.test.ts` |
| P0-2 storage authorization | Complete; **severity downgraded by live verification** — bucket private, RLS fail-closed, so no redesign was warranted | `documentAccessAuthorization.test.ts` |
| P0-3 rendering | Complete on the send path | `canonicalRenderer.test.ts` |
| P0-4 `announcement_targets` | Complete | replay-verified in the certification DB |
| S-1 legacy SMS containment | Complete | `test_legacy_dispatch_containment.py` (31 cases) |
| Payment-route containment | Complete | `test_payment_executor_auth.py` |
| Migration certification | Complete | clean replay, upgrade replay, idempotent rerun |
| Closeout + retirement ledger | Complete | this package |

**Verification actually run** (not asserted):

| Check | Result |
| --- | --- |
| Clean replay, all 301 migrations from scratch | exit 0 |
| Upgrade replay (the 4 onto the prior 297) | pass |
| Idempotent rerun of all 4 | pass |
| Schema + CHECK constraints match D3 | pass |
| Web suite | 778 passed / 25 failed — **all 25 pre-existing**, none Phase 0's |
| Documents suite | 78 / 78 |
| Backend suite | 124 tests, 2 errors — **baseline** (absent `pytest`, `twilio`) |
| `tsc --noEmit` | clean |
| Send-path inventory | no direct provider call outside the choke point |
| Signer inventory | all guarded, capped, authorize-before-mint — now test-pinned |

**Explicitly not done, by instruction:** no live provider send, no live charge, no
mutating remediation run, no migration applied to any shared environment, and
public reachability of the payment route was never confirmed (remediation
proceeded without waiting, per decision).

## 2. Phase 1 prerequisites

| # | Prerequisite | Status |
| --- | --- | --- |
| PR-1 | A single enforceable enqueue choke point exists | ✅ `enqueueCanonicalOutboundMessage` |
| PR-2 | Classification vocabulary decided and constrained in the DB | ✅ D3; CHECK constraints verified post-replay |
| PR-3 | Eligibility is a pure, versioned, testable function | ✅ `ELIGIBILITY_POLICY_VERSION` |
| PR-4 | Cross-runtime contract mechanism proven | ✅ JSON contracts + parity tests both sides |
| PR-5 | Server-authoritative rendering with a stored snapshot | ✅ `rendered_snapshot` |
| PR-6 | No unauthenticated write path in comms or payments | ✅ |
| PR-7 | No credential outliving its authorization | ✅ test-pinned |
| PR-8 | Migrations certified replayable | ✅ three modes |
| PR-9 | Behavioral test harness for routes and DB | ✅ commit 0 |
| PR-10 | Known debt written down with owners and phases | ✅ Debt Register |
| PR-11 | Retirement conditions named for every shim | ✅ Retirement Ledger |
| PR-12 | Runtime documented as-is, including divergences | ✅ Runtime Architecture |

**All twelve are met.**

## 3. Can Phase 1 begin?

**Yes.**

The prerequisites Phase 1 genuinely depends on are structural: a choke point to
enforce at, a vocabulary to classify with, a contract mechanism for the two
runtimes, and a safe floor underneath. All four exist and are held by tests.

The four P1 debts (D-1…D-4) are **Phase 1 and Phase 2 content, not blockers**.
Two of them — converging the remaining send paths (D-2) and making classification
mandatory (D-3) — are literally Phase 1's opening work.

## 4. The one condition

**Deployment, not development, is gated.**

Staging carries a **28-migration Processing-Identity backlog** that is unapplied,
and `db push` is blocked by **three orphan ledger versions**. Until that is
resolved, the four Phase 0 migrations cannot be promoted, and therefore neither
can any Phase 1 migration.

This is not Phase 0's debt and not Phase 1's. But it means:

- ✅ Phase 1 **development** may begin immediately.
- ⛔ Nothing may be **promoted** until the backlog clears.

If Phase 1 is expected to ship rather than merely be built, resolve that first.

## 5. Decisions still open

None of these block Phase 1 from starting. Three would change Phase 1's shape if
answered differently, so they should be answered early.

| # | Decision | Effect if deferred | Urgency |
| --- | --- | --- | --- |
| O-1 | DB trigger as the eligibility floor? | Phase 1 proceeds with two layers (TS + Python). A trigger would be a third, covering raw SQL and seed scripts — at the cost of relocating an executable invariant into the database, against "code owns executable invariants" | **Answer during Phase 1 planning** |
| O-2 | Decommission the GHL cleaning vertical? | Containment holds; guard stays process-local | Low — but gated on a GHL check only you can run |
| O-3 | Disposition of the 6 unowned vendor objects | They stay unreachable | Low |
| O-4 | Promotion window | Nothing promotes | **Tied to §4** |

## 6. Recommended Phase 1 entry sequence

Front-load the two things that make every later phase safer:

1. **Converge the four remaining send paths** (D-2). Until this lands, every
   subsequent statement about eligibility carries an asterisk.
2. **Make `category` required at the enqueue boundary** (D-3). Cheap now; it gets
   more expensive with every new send path.
3. Then the Phase 1 message-model work proper.

Rationale: both are small, both remove an asterisk from claims the rest of the
program will rely on, and both get harder the longer the platform grows around
them.

## 7. One thing to carry into Phase 1

Phase 0's most transferable finding was not a defect. It was that **the system's
real enforcement points were not where the naming suggested** —
`executeCommunicationsSend` looked like the gate and was not; a route that called
the authorization helper correctly still leaked a week-long credential.

Phase 1 should assume the same is true of anything it has not inventoried, and
should leave behind **a test, not a claim**. Every convergence assertion in this
package that could be pinned by a test has been.
