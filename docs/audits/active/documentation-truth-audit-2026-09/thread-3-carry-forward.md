---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 carry-forward — API items found while reconciling, not chased

Thread 2 reconciled canonical documentation against promoted September 2026 staging. It did **not**
design the API. These are API and integration issues encountered along the way, recorded so Thread 3
inherits them rather than rediscovering them.

The Thread 1 register — [`api-inventory-and-gaps.md`](./api-inventory-and-gaps.md) — still stands
and is the primary input. These sharpen it with domain evidence.

## What Thread 3 can now assume as settled platform truth

- **The route census is 613** and the generated index reflects it.
- **Maturity is recorded honestly**, including the distinction between an authority that exists and
  a product an operator can reach. See the September matrix in
  [`../../../platform/foundation/platform-capabilities.md`](../../../platform/foundation/platform-capabilities.md).
- **Domain ownership is settled** for Attendance, Staffing, Scheduling (split, deliberately),
  Work Items, Access & Identity, Financials, Subsidy, Processing, Forms and Operational Expectations.
- **Two Director decisions are resolved** (D6, D8); three remain open and bounded (D2, D7, D10) and
  none of them blocks API work.
- **Zero broken links in every governed path.**

## Carry-forward register

| # | Item | Kind | Why Thread 3 |
|---|---|---|---|
| 1 | **The kiosk is a working inbound machine credential** — hashed device secret in a header, org and site read off the resolved row and never the request, capability array on the row, uniform generic denial on every failure class. Thread 1's register says Alloy has *no* inbound machine credential; that is true for partners and false for devices | authentication | It is a hardened answer to "how does a non-human principal authenticate and get scoped", built in this repo this month. Evaluate it as the partner-credential template rather than designing from zero — and note what it lacks: **no expiry column** on either credential table and **no issuance or rotation route** |
| 2 | **`integration_api` is a designed-but-unbuilt seam, and it fails open in a specific way** — it is an accepted provenance channel with an authorization rule and no implementation. A request body carrying it is silently mapped to the operator channel rather than refused | architecture / provider | It is the platform's only designed inbound machine-write seam. The silent mapping means a partner-shaped request today **succeeds while recording the wrong provenance** |
| 3 | **Two attendance read routes bypass their own capability gate** — they resolve the admin context and go straight to the fetch, with no `attendance.read` check and no site-scope narrowing, taking the site id from the query string | authorization | A concrete instance of Thread 1's gap 11: tenant isolation resting on hand-written filters where the filter is simply absent, on a read surface in the domain a partner would most want to read. Sequence before any external read contract |
| 4 | **The kiosk public routes are the real external surface and have no authored contract** — uniform denial, a clamped event time, a per-child idempotency key, authority re-decided per call with no session token. Undocumented, all four read as bugs | documentation | Thread 1's gap 14 with a named instance |
| 5 | **The kiosk rate limiter is in-process** — on N instances the effective limit is N times the intended one, and the person code is the one guessable secret exposed to the open internet | architecture | The highest-consequence instance of Thread 1's gap 12 |
| 6 | **Attendance is the strongest idempotency precedent** — insert-first with conflict-do-nothing and re-read the winner, rather than check-then-insert; a typed conflict on same-key/different-fingerprint; no second event on replay. Its own comment diagnoses why the earlier pattern was weaker | consistency | If Thread 3 defines a platform idempotency convention, this is the shape to generalize and the select-for-update anti-pattern is the one to name |
| 7 | **The Stripe webhook writes a disposition its own CHECK constraint does not admit**, and the update error is not inspected — so a dispute event silently stays unprocessed while the HTTP response claims otherwise | provider / correctness | A webhook contract defect between the handler's stated dispositions and the persisted event ledger, which is the audit trail for an external integration |
| 8 | **No Stripe Connect onboarding surface exists** — the merchant table has no product writer, no `account_links` call and no `account.updated` handler, so readiness flags are hand-seeded facts that never refresh | provider | This is the gate on whether collection is usable at all, and it is a missing provider-integration API surface |
| 9 | **`payer_entity_type` is unconstrained free text with behavioural meaning** — one service refuses settlement unless the string matches exactly, and nothing in the database enforces the spelling | consistency | A payment-API contract question: any caller spelling it differently silently defeats a safety refusal |
| 10 | **A generic org-settings endpoint shallow-merges arbitrary caller-supplied metadata with no key allowlist** — meaning AI policy and other governed settings are writable through an endpoint no UI sends them to | authorization | An API-surface question with a security edge |
| 11 | **The forms public token surface is a large unauthenticated API with no canonical contract** — eleven routes including upload and signature capture, with a deliberate allow-list wire model and no documented token scope, TTL, revocation or rate limit | public contract | Accepts uploads and signatures from unauthenticated parents; the existing public-link contract doc does not cover these routes |
| 12 | **Processing exposes ~20 admin routes with no canonical contract** — the plan/approve/execute triad is the mutation authority for identity, and its versioning, idempotency and stale-plan semantics exist only in migration comments and route code | documentation | No document under `docs/platform/` names a single one of them |
| 13 | **The communications provider-connection route is the single credential door** and says so, refusing secrets by field name everywhere else — but there is no GET, no expiry, no rotation schedule and no revocation propagation to in-flight scheduled sends | provider lifecycle | The credential-lifecycle half of a partner integration model |
| 14 | **Seventeen financial commands are registered, permissioned and certified with no UI caller** | developer experience | When Thread 3 considers an external financial surface, these are the operations that already exist as governed commands — and the action-execute endpoint requires an entity id even where an action declares it does not need one, which every headless command will hit |

## Explicitly not done here

No external resource model, authentication model, versioning strategy, partner contract, webhook
contract, SDK, or Classroom Coach integration design. Thread 2 corrected documentation and recorded
evidence; every item above is a question, not a decision.
