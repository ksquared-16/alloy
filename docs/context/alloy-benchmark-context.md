---
title: Alloy benchmark context pack
owner: platform
status: canonical
last_reviewed: 2026-09-29
supersedes: []
---

# Alloy benchmark context pack — V0

**This file defines which Alloy documents may be loaded as authoritative context, and what may be
inferred from each.** It is a curated corpus, deliberately much smaller than the repository. Loading
the whole documentation tree into a model is the failure this manifest exists to prevent: the tree
contains several generations of design history, and most of it is not current truth.

| | |
|---|---|
| **Version** | V0 |
| **Certified** | 2026-09-29 |
| **Base** | `b73482479` (staging) |
| **Domains certified** | Developer Platform / API · Runtime |
| **Domains pending** | Business Process (§5) · Identity/Access (§6) · Enrollment beyond BP core · Attendance · Scheduling/Staffing · Financials · Commercial · Subsidy · Communications · Configuration · Operational Intelligence · AI/BOS · foundation synthesis |

A domain appears here only when it has been certified by an authority-discovery pass. Absence means
"not yet certified", never "not important" — and never "safe to infer from whatever the tree holds".

---

## 1. Corpus rules

These govern the whole manifest and outrank any individual entry.

1. **`status: canonical` alone does not qualify a document for DIRECT context.** Canonical means
   someone owns it; it does not mean it is the right thing to load, nor that it is current.
2. **A newer `last_reviewed` does not outrank an older canonical owner.** Review dates record
   attention, not authority. A recently-touched summary never displaces the owner it summarizes.
3. **Generated copies never outrank canonical sources.** Where a generated artifact and its source
   disagree, the source is right and the generator is stale.
4. **Sprint, audit and history material is excluded from current-truth inference** unless a task
   explicitly asks for evidence of how something came to be.
5. **Runtime, schema and code evidence outranks documentation.** When they contradict, the code is
   what ships.
6. **PLANNED_ONLY content must never be presented as implemented.** A document describing intended
   behaviour is evidence of intent only.
7. **REFERENCE_ON_DEMAND is authoritative but not part of default loading.** Pull it when the task
   touches that authority; do not preload it.
8. **Context inclusion is domain-certified, not repository-wide.** There is no default-include rule.

## 2. Treatments

| Treatment | Meaning |
|---|---|
| `DIRECT` | Load by default. Current Alloy doctrine for its domain. |
| `REFERENCE_ON_DEMAND` | Authoritative; load only when the task touches it. |
| `GENERATED_REFERENCE` | Machine-generated exactness (schemas, OpenAPI). Cite verbatim; never paraphrase. |
| `SUMMARY` | Orientation only. Never the basis for a specific claim. |
| `EXCLUDE_HISTORY` | Do not load for current-state reasoning. |
| `PLANNED_ONLY` | Intent, not implementation. |

---

## 3. Developer Platform / API — CERTIFIED

Certification: `API_DOCUMENTATION_CONTEXT_READY_PROMOTED_CERTIFIED`.

The distinction that matters most in this domain: **Alloy has two APIs**, and conflating them is the
characteristic error. `/api/v1/**` is the external partner surface with its own frozen contract.
`/api/admin/**` is internal and shares none of that contract.

| Document | Role | Authority owned | Treatment |
|---|---|---|---|
| `api/README.md` | Domain index | Which API is which; what is built vs not | DIRECT |
| `api/api-architecture.md` | Architecture | Route taxonomy, internal/external boundary | DIRECT |
| `api/developer-platform/external/alloy-developer-platform-specification.md` | External spec | The public contract as published to partners | DIRECT |
| `api/openapi/alloy-public-api.v1.json` | Machine contract | Exact public paths, operations, scopes, schemas | GENERATED_REFERENCE |
| `api/api-response-contract.md` | Internal envelope | The `/api/admin` response envelope — **internal only** | REFERENCE_ON_DEMAND |
| `api/developer-platform/guide/**` | Partner guide | Integration narrative for partners | REFERENCE_ON_DEMAND |
| `api/developer-platform/package/**` | Generated partner package | A build output; frontmatter is stripped by the generator | GENERATED_REFERENCE |
| `api/developer-platform/product/01–27` | Design history | How the platform was decided | EXCLUDE_HISTORY |
| `api/api-documentation-audit.md`, `api-contract-migration-status.md`, `openapi-readiness.md` | Workstream records | Point-in-time status | EXCLUDE_HISTORY |

**Safe inferences.** The public surface is closed and small: 18 paths, 22 operations, 13 grantable
scopes, 10 reads, 10 writes, one token exchange. The public error taxonomy is fixed. Attendance is
public; Financials and Communications are not. There are no generic PUT/PATCH/DELETE verbs.

**Forbidden inferences.** Never infer that an `/api/admin` behaviour applies to `/api/v1`, or the
reverse — shared code is not a shared contract. Never infer a public operation exists because an
internal one does. Never treat the generated package as a second source of truth for the surface.

**Higher authority.** `web/app/api/v1/**` route handlers and the OpenAPI document outrank prose.
`web/tests/support/publicSurfaceInventory.ts` derives the surface three independent ways.

**Staleness triggers.** Any new `/api/v1` route or operation; any scope added or removed; any change
to the public error taxonomy; any change to what is publicly exposed.

---

## 4. Runtime — CERTIFIED

Certification: `RUNTIME_DOCUMENTATION_CONTEXT_READY_PROMOTED_CERTIFIED`.

| Document | Role | Authority owned | Treatment |
|---|---|---|---|
| `platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md` | Freeze | The 15 canonical laws and 11 load-bearing seams | DIRECT |
| `platform/runtime/runtime-realization-architecture.md` | Architecture | How the runtime is realized | DIRECT |
| `platform/runtime/alloy-runtime-kernel.md` | Kernel | Preparation keying and kernel contract | DIRECT |
| `runtime/CARD-READINESS-LIFECYCLE.md` | Readiness definition | `ALL_FIRST_ORDER_READY` and the readiness lifecycle | REFERENCE_ON_DEMAND |
| `platform/runtime/operator-runtime-performance-certification.md` | Certification | Measured performance envelope | REFERENCE_ON_DEMAND |
| `platform/runtime/runtime-realization-engineering-specification.md` | Engineering spec | Orientation; still `status: proposed` | SUMMARY |
| `platform/runtime/runtime-implementation-authorization.md` | D1 contract | Proposed; **not ratified** | PLANNED_ONLY |
| `platform/runtime/stage-work-view-queue-canonical-model.md` | Fork diagnosis / plan | Why the queue fork exists and how it would resolve | PLANNED_ONLY |
| Runtime sprint, audit and preparation records | History | How the runtime got here | EXCLUDE_HISTORY |

**Safe inferences.** The freeze's laws hold and are verified by content rather than by file hash.
The runtime keys preparation by lens. Guard suites exist for the named seams.

**Forbidden inferences.** Never infer that a document being governed makes it the context owner.
Never treat `runtime-implementation-authorization.md` as ratified — two D1 guard suites cite it, and
a test citation is not ratification. Never read the Stage/Work View/Queue model as current
architecture: the fork it describes is still live.

**Higher authority.** The guard suites under `web/tests/runtime/**` and the seam files the freeze
names. Where the freeze and a seam disagree, read the seam.

**Staleness triggers.** Any law or seam changed; any guard suite removed; a performance envelope
re-measured; the D1 contract ratified or withdrawn.

---

## 5. Business Process — PENDING CERTIFICATION

**State:** `PENDING_CERTIFICATION`. Authority discovery is complete and the documentation has been
converged and promoted, but **implementation convergence is not done**, so this domain is not
certified for DIRECT context in V0.

**Blockers, as measured on `eab6805b1`:**

- **D-BP1** — two operator surfaces still mutate opportunity `status_key` through the generic record
  PATCH. The **authorization half of this is now resolved** (2026-09-29): a lifecycle transition is a
  decision, so `enrollment.decide` is the correct rule, and both seeded role packages (ADMIN and OPS)
  grant it alongside `enrollment.record.manage` under an in-migration self-test that aborts if either
  is missing — so converging does not lock out a default operator. What remains is the **resolution
  layer**: the canonical route takes a typed `destination_key`, while these surfaces hold a configured
  ref (`action.actionRef`) and `needs_a_quote`. **The reverse resolver now exists** (2026-09-30,
  `resolveConfiguredTransitionRef.ts`): a configured `transition_ref` resolves to a typed
  `destinationKey`, scoped to the subject's current stage and failing closed on unknown, ambiguous,
  unavailable or unmapped refs. What remains for Current Work is the server boundary that accepts a
  ref plus the surface rewire.
- **The two senders are not the same kind of thing.** Measured 2026-09-30: `needs_a_quote` is **not a
  configured Business Process outcome or rule anywhere**. It belongs to the book-v2 quote pipeline
  (`lib/book-v2/resolvePipelineStage.ts`) and the MVP status catalog. So Quote Intake is not an
  enrollment decision at all, and routing it through the enrollment transition boundary would be
  wrong. It needs its own disposition — a quote-pipeline authority, or acceptance as a record write —
  which is a product question, not part of the enrollment convergence.
- **D-BP4** — outcome execution writes durable status without consulting the transition-policy gate
  the Action paths use.
- **D-BP5** — whether a fresh child participation should carry `new_inquiry` (shipped) or a null
  disposition (intended) is an open product decision.

**What may still be used, carefully.** The Business Process documents are accurate about *current*
behaviour, including their own open debt — that is what the convergence packet established. They may
be loaded as `REFERENCE_ON_DEMAND` for Business Process tasks, provided the reader treats the three
blockers above as open. They are not V0 DIRECT context.

Interim owners, for on-demand use: `platform/core/business-process-system.md`,
`platform/core/stage-membership-and-outcomes.md`, `platform/core/status-and-state-system.md`,
`platform/core/work-view-membership-and-navigation.md`.

**Promotion trigger.** When D-BP1, D-BP4 and D-BP5 close and the writer census shows zero
unexplained operator-facing lifecycle writers, this domain moves to CERTIFIED / DIRECT.

---

## 6. Identity / Authentication / Roles / Access — PENDING CERTIFICATION

**State:** `PENDING_CERTIFICATION`. Read-only authority discovery completed 2026-09-29; the domain is
coherent in parts and genuinely contested in others, so it is not certified.

**What is solid.** One permission registry (`permission_keys` / `permissions`), one additive grant
model (`user_roles` → `role_permission_grants`), real scope tables for department, site and access
profile, and seeded ADMIN/OPS packages guarded by in-migration self-tests. `user_person_links` joins
`auth.users` to `persons` through an **explicit operator-created link with no email fallback** —
identity is never inferred, deliberately.

**Blockers, measured:**

- **~~An open Director gate~~ — RATIFIED 2026-09-30 (Model A).** The decision now lives in
  `platform/foundation/platform-decisions.md` § *2026-09 — Route capabilities authorize; RLS isolates
  tenants; mutation is server-side*, and the measurement document points at it rather than holding an
  unmade decision. What remains is **convergence, not choice**: retire the excess authenticated write
  grants and repair the tenancy class. Original analysis retained below because the measurement is
  what the ratification rests on.
- **(analysis, retained)**
  `platform/governance/rls-authority-model-director-gate.md` is `status: canonical` while carrying
  `DIRECTOR_DECISION_READY`. On reading it fully, it is not an architectural fork: the recommended
  model (routes authorize, RLS tenants, mutation server-only) is **already the written doctrine** in
  `implementation-patterns.md` § Supabase access and `configuration-publication-model.md`, and 604 of
  682 route files arrive as `service_role`, which bypasses RLS by definition — so a layer the product
  never executes cannot be the authorization model. The drift is **latent unused grants, not a live
  dual-authority conflict**, reachable only by calling PostgREST directly, which no product code does
  and the browser client cannot (it is auth-only; the 6 server components touching `supabase.from()`
  are `select`-only). So the blocker is a **ratification plus a precision requirement** — authority
  claims should read "on the supported path" until grants are retired — rather than an unknown. The
  document's own verdict on whether this blocks Access & Identity V2 is NO.
- **Admission is not authority on most routes.** Of 682 API route files, ~128 rely on
  `requireAdminOrOps` (portal admission, no role, no capability) while only ~17 assert a capability.
  The enrollment area already repaired exactly this and proves the pattern; it has not propagated.
- **No canonical owner for the authentication/session layer.** Roles and permissions are well owned by
  `platform/governance/roles-and-permissions.md`; sessions and account lifecycle are owned by nobody.
- **Customer/parent authentication is absent**, stated as unsolved in code rather than documented.

**What may be used on demand.** `platform/governance/roles-and-permissions.md` is the strongest
document in the domain and is the DIRECT candidate once the domain certifies: it explicitly separates
"the rule" from "what the code does today" and names each gap with a workstream id, on the stated
principle that a canonical document asserting an unfollowed rule as as-built is itself a defect. Read
the RLS gate as an **open decision**, never as settled. Treat `platform/planning/access-identity-v2/**`
as PLANNED_ONLY — it is planning material, not authority.

**Promotion trigger.** The RLS authority decision is made, capability assertion propagates past
admission on the route population above, and the authentication/session layer gets an owner.

---

## 7. How downstream AI should use this pack

**Default reasoning.** Treat DIRECT entries as current Alloy doctrine. That is the whole default
context; nothing outside it is implied.

**Detail retrieval.** Load REFERENCE_ON_DEMAND only when the task touches that authority. Pulling it
speculatively re-creates the context bloat this manifest prevents.

**Machine contracts.** For anything that must be exact — a public path, a scope name, a schema field
— read GENERATED_REFERENCE and quote it. Do not paraphrase a contract.

**Conflicts.** If runtime, schema or code evidence contradicts a document, **do not silently prefer
the document, and do not silently prefer the code.** Surface the contradiction, name both sides, and
say which one the corpus rules make authoritative (rule 5: the code ships). A silently-resolved
contradiction is how a stale doc becomes a confident wrong answer.

**Planning.** Never infer implementation from PLANNED_ONLY. If a task depends on something only a
PLANNED_ONLY document describes, say it is not implemented.

**History.** Exclude EXCLUDE_HISTORY from current-state reasoning. Use it only when asked why
something is the way it is.

**Uncertified domains.** For a domain not listed here, say it is uncertified rather than reasoning
from whatever the tree happens to contain. The tree is not the corpus.

---

## 8. Maintenance

This manifest is versioned, not eternal. The base SHA records what was true when V0 was certified;
it is not a claim that the repository must stay there.

Re-certify a domain when any of these occur:

- product behaviour in that domain changes;
- schema ownership moves;
- a new platform decision lands;
- a canonical owner changes, is split, or is retired;
- a domain's certification is reopened;
- a document in the pack changes treatment.

Adding a domain requires an authority-discovery pass for it first — the same standard API, Runtime
and Business Process were held to. Do not add a domain to this pack because its documents look tidy.
