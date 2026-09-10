---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Thread 3 — gap register and Thread 4 decision packet

Closing synthesis. Sections 1–3 are findings. Section 4 is the decision packet:
questions for a Director, each with the evidence needed to answer it and an
explicit note of what Thread 3 is **not** deciding.

## 1. The architectural verdict

**Alloy does not have an API platform. It has 613 internal transport endpoints,
a capability layer with its authorization seam deliberately closed, and six
domains whose mutation authority is genuinely externalizable.**

The three-sentence version:

1. **Transport is not the constraint.** The routes exist, they are typed, and
   ~577 of them reach a service-role client that can do anything. Nothing about
   HTTP needs building.
2. **Identity is the constraint.** There is no non-human principal —
   `api_tokens`, `service_account`, `api_keys`, `personal_access` and
   `x-api-key` return **zero** hits across `web/app` and `web/lib`. Every route
   derives tenancy from a session cookie. An external caller has nothing to be.
3. **Authorization is the second constraint.** 22 of 396 mutating routes
   (5.6%) check a capability. The Command Runtime types authorization's absence
   as a literal (`authorizationEvaluated: false`) and *refuses any invocation
   claiming otherwise* — the seam is closed deliberately, which means opening it
   is a designed change, not a repair.

**EXTERNAL_READY: 0 of 613.** Not one route passes all five gates. This is a
measurement, locked by `web/tests/api/apiEstateClassification.test.ts`, and the
test is written so it stays green as defects are repaired — it asserts the
inventory is honest, not that the estate is broken.

## 2. Gap register

### P0 — blocks any external exposure

| # | Gap | Evidence |
|---|---|---|
| P0-1 | **No non-human principal model.** No API tokens, service accounts or application identity. | zero grep hits across `web/app`, `web/lib` |
| P0-2 | **Authorization is not a layer.** 5.6% of mutating routes check a capability; the runtime seam is closed by design. | `commandRuntimeTypes.ts:165`, `executeCommandInvocation.ts:300` |
| P0-3 | **The authz domain writes no audit.** Granting permissions leaves no record. | SEC-4; zero hits across `users/**`, `rbac/**` |
| P0-4 | **Tenancy from request body on the workflow run route**, combined with an unallowlisted dynamic table write. | SEC-0b + SEC-0c, chain verified at 5 sites |
| P0-5 | **Unauthenticated cross-tenant write on `contacts`.** | SEC-0; repair proven bounded |
| P0-6 | **Money actions execute with no permission check.** | `financialChargeActions.ts`, `financialPaymentActions.ts` import no permission module |

### P1 — blocks a trustworthy contract

| # | Gap | Evidence |
|---|---|---|
| P1-1 | **No outbound delivery.** Facts are strong (`workflow_events`, `mutation_events`); there is no webhook, subscription or retry substrate. A partner cannot be told anything. | platform-boundary §3 |
| P1-2 | **OpenAPI covers 14 of 613 routes** and is a gate artifact, not a coverage artifact. | route-classification.json |
| P1-3 | **No versioning strategy.** Nothing prevents a breaking change; `/api/v1/…` is documented as not existing. | `api-architecture.md:166` |
| P1-4 | **Error contracts are broadly inconsistent** — no shared shape, no error codes. | contract-readiness §4 |
| P1-5 | **No collection contract** — pagination, filtering and sorting are per-route. | contract-readiness §5 |
| P1-6 | **40 org-blind RLS policies**, latent because 0 routes bind RLS. | SEC-5 |
| P1-7 | **Authority changes take up to 120s to bite**; the invalidator has zero production callers. | SEC-6 |
| P1-8 | **No rate limiting or abuse control** on the unauthenticated participant surface. `W-35` is recorded NOT BUILT. | `unauthenticatedSideEffects.allowlist.json` |

### P2 — quality of the resulting platform

| # | Gap |
|---|---|
| P2-1 | Nine idempotency patterns; the strongest guard is opt-in. |
| P2-2 | The single-record read *is* the view model — no external resource representation exists. |
| P2-3 | Two dead guards; three production paths do what they forbid (SEC-0b/P0-0b). |
| P2-4 | `access-scope` is a five-statement non-transactional replace that can lock a member out. |
| P2-5 | No observability a tenant developer could see — no request ids, no per-tenant logs. |

### P3 — deferrable

Legacy compatibility adapters with live callers; the dormant second general
ledger; three coexisting layout stores; `operationalAssignments` unmapped.

## 3. Two applied readiness tests

### 3.1 Classroom Coach — the first named external consumer

**Repository trace: two lines, both in one test file.**
`web/tests/childcareOperational/attendance/attendanceProvenance.test.ts:80,84`
— `producerKey: "classroom-coach-prod"`. There is no implementation, no design
doc, and no validated requirement anywhere in the repository.

**But the seam it would use is already built.** `integration_api` is a modeled
provenance channel with a full resolver entry —
`attendanceProvenance.ts:97`: `{ actorType: "system", sourceType: "integration_api", requiresUser: false }`
— it is in the vocabulary (`attendanceVocabulary.ts:44`), in the DB `CHECK`
constraint, and covered by tests. **It has no production producer.**

This is the single most actionable finding in Thread 3. `requiresUser: false`
means someone already decided that an integration writes attendance facts
without a human actor — the exact decision an external API needs, made and
tested and never wired. And attendance is independently the strongest authority
in the codebase: one ingestion function, a trigger the application cannot bypass,
server-derived provenance, and idempotency anchored on one real-world event.

**So: the shortest credible path from here to a real external integration is
attendance ingestion via `integration_api`, and it is blocked by exactly one
thing — P0-1, the absence of a principal to authenticate as.** Not by the
domain, not by the contract, not by idempotency.

**What remains unvalidated and must not be assumed:** direction (inbound writes,
outbound notification, or both), volume, data scope, and whether attendance is
even what Classroom Coach needs. If it needs *outbound notification*, the answer
changes completely — P1-1 says no delivery substrate exists at all, and that is
a build, not a wiring.

### 3.2 White-label stress test

Asked of the estate: *could a second brand operate on this platform with its
own developers?*

**No, and the blocking reason is not branding.** Three findings compound:

1. **Tenancy is a TypeScript convention, not an enforced property.** 0 of 613
   routes bind RLS; 577 hold a service-role client. Every isolation guarantee is
   a line of code someone remembered to write — and SEC-0c is the case where
   somebody did not.
2. **`resolveAdminAccessCore.ts:233` refuses multi-org outright**
   (`if (orgs.length !== 1) return null;`). A user belonging to two tenants
   resolves to no access at all. A white-label operator serving multiple brands
   cannot exist today as a *user*, before any API question arises.
3. **Provider credentials degrade to global secrets.** The Resend webhook
   verifies against a single deployment-wide `RESEND_WEBHOOK_SECRET`, and the
   Twilio token falls back to the global `TWILIO_AUTH_TOKEN` on every
   non-matching case (`twilioAuthToken.ts:19-26`). Per-tenant isolation of
   provider identity silently becomes shared.

The estate is **single-tenant-shaped with an `org_id` column**, which is a
different thing from multi-tenant. That is a legitimate architecture and it is
not what a white-label API implies.

## 4. Thread 4 decision packet

Thread 3 resolves none of these. Each is stated with what would answer it.

### Product-scope decisions (Director)

| # | Decision | What answers it |
|---|---|---|
| D-1 | Is Classroom Coach **inbound**, **outbound**, or both? | Requirement validation with that team. Everything below branches on this. |
| D-2 | Is the first external surface a **partner integration** (few, contracted) or a **developer platform** (many, self-serve)? | These need different identity, rate-limit and support models; building the second when you need the first is the expensive error. |
| D-3 | Is the **gutters vertical** live? *(carried unanswered from Thread 3)* | Determines whether SEC-0 is scoped or the route retired. A live component still POSTs to it. |
| D-4 | Is **white-label multi-brand** a target? | If yes, `resolveAdminAccessCore.ts:233` and the provider-credential model are foundational rework, not follow-ons. |
| D-5 | Does the **commercial vertical** (jobs, Python payment executor) get an API, or is childcare first? | Two verticals share table names with different rules. |

### Architectural decisions (Director + platform)

| # | Decision | What answers it |
|---|---|---|
| D-6 | **What is an application?** Token, service account, OAuth client, or signed partner key. | P0-1. Nothing external exists until this is decided; it is the true critical path. |
| D-7 | Does authorization open **in the Command Runtime** (one seam, 57 actions) or **per route** (396 edits)? | The runtime seam was closed deliberately; opening it is a design decision with a blast radius of 57, versus 396 individually certified routes. |
| D-8 | Is the external surface **commands** (`POST /actions/execute`-shaped) or **resources** (REST)? | 5 domains are command candidates, 2 resource candidates. The evidence favors commands; a partner may expect REST. |
| D-9 | **Outbound delivery**: build a webhook substrate, or offer polling first? | P1-1. Polling is far cheaper and may satisfy D-1. |
| D-10 | Does `/api/v1/` become a **new namespace** or a **façade over existing routes**? | Determines whether P1-2…P1-5 are new work or retrofits. |
| D-11 | Is the **audit table** built before or with the first credential? | P0-3. Recommend before — a credential issued into a system with no audit cannot be investigated. |
| D-12 | Do the 40 org-blind RLS policies get **fixed** or **formally declared inert**? | Either is defensible; leaving them undocumented is not. |

### Repair-sequencing decisions

| # | Decision |
|---|---|
| D-13 | Which P0s are repaired **before** Thread 4 design, and which during? |
| D-14 | Does SEC-0c get an out-of-band fix now? It is a one-line-shaped change with the correct pattern twelve lines away, and it is currently exploitable. |
| D-15 | Who owns the 6 `UNSAFE_OR_AMBIGUOUS` domains' convergence, and is it a precondition for exposing *any* domain? |
| D-16 | Are the two dead guards wired, or is `applyChildParticipationEdit` rerouted through the supersede functions? |

**Thread 3's own recommendation, offered as input and not as a decision:**
answer D-1 first, because it is cheap and everything branches on it; then D-6,
because nothing external exists without it; then repair P0-4 and P0-5, because
they are live, bounded and independent of every design choice above.
