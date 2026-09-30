---
title: Alloy benchmark context pack
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Alloy benchmark context pack — V1

**This file defines which Alloy documents may be loaded as authoritative context, and what may be
inferred from each.** It is a curated corpus, deliberately much smaller than the repository. Loading
the whole documentation tree into a model is the failure this manifest exists to prevent: the tree
contains several generations of design history, and most of it is not current truth.

| | |
|---|---|
| **Version** | V1 |
| **Certified** | 2026-09-30 |
| **Base** | `5a5771554` (staging) |
| **Domains certified** | Developer Platform / API · Runtime · Business Process |
| **Domains pending** | **Identity/Access (§6 — one gate remaining, named there)** · Enrollment beyond BP core · Attendance · Scheduling/Staffing · Financials · Commercial · Subsidy · Communications · Configuration · Operational Intelligence · AI/BOS · foundation synthesis |

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

## 5. Business Process — CERTIFIED

Certification: `BUSINESS_PROCESS_DOCUMENTATION_CONTEXT_READY` (2026-09-30). Implementation and doctrine
agree, and the final lifecycle writer census carries **zero unexplained writers**.

| Document | Role | Authority owned | Treatment |
|---|---|---|---|
| `platform/core/business-process-system.md` | Operator model | Business Process → Stage → Record; stage membership; what the canonical lifecycle path owns | DIRECT |
| `platform/core/stage-membership-and-outcomes.md` | Stage membership | Persisted `stage_key`, outcomes, subject grain | DIRECT |
| `platform/core/status-and-state-system.md` | Durable status | The three governed status domains and the one transition-policy gate | DIRECT |
| `platform/core/work-view-membership-and-navigation.md` | Work View | Membership evaluation, one evaluator, navigation | DIRECT |
| `platform/modules/business-process-execution-platform.md` | Execution runtime | Command/action execution surface | REFERENCE_ON_DEMAND |
| `platform/modules/actions-and-workflows.md` | Actions | Action runtime contract, Create Lead contract | REFERENCE_ON_DEMAND |
| `platform/operator/current-work-surface.md` | Current Work | The projection surface (owns no durable truth) | REFERENCE_ON_DEMAND |
| `platform/operator/queue-system.md` | Queue | Preview/materialization contract | REFERENCE_ON_DEMAND |
| `platform/core/data/action-status-field-matrix.md` | Field authority | Which action writes which field | REFERENCE_ON_DEMAND |
| `platform/runtime/stage-work-view-queue-canonical-model.md` | Fork diagnosis / plan | Why the queue fork exists; unexecuted convergence | PLANNED_ONLY |
| BP sprint, audit and closeout records | History | How this came to be | EXCLUDE_HISTORY |

**Safe inferences.** Stage position is persisted in `stage_key`. Intake/Processing establishes the
initial position; canonical process/outcome execution owns every subsequent movement. Governed status
changes pass one transition-policy gate (`validateStatusTransition` over `status_transition_rules`),
for case and child grain alike. Prior-stage reconciliation belongs to canonical lifecycle execution and
carries the operator's per-item disposition. The generic record PATCH is not lifecycle authority and
refuses governed lifecycle fields. Current Work is a projection and interaction surface that owns no
durable truth. Work View membership is computed and does not define process position. Queue is
preview/materialization. The Work Items Business Process source projects existing stage work rather
than duplicating it. A fresh child participation stores `new_inquiry`; "New Lead" is display language.

**Forbidden inferences.** Never infer that a raw status PATCH is a valid lifecycle pattern — it is
refused. Never infer that status defines stage, or that Work View membership defines process position.
Never treat the proposed stage-condition vocabulary (`membership_criteria_v1`, `entry_conditions`,
`exit_conditions`) as implemented — only `queue_membership_v1` exists. Never treat
`placement_candidates.status` as a governed Status domain; it is DB-CHECK-bound domain state. Never read
a historical compatibility writer as forward architecture. Never infer an outcome may bypass the
transition gate — no override exists.

**Implementation evidence that outranks these documents.**
`web/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition.ts` (the canonical path, its gate and
its reconciliation), `web/lib/lifecycle/stageOutcomeRuleTargetExecutor.ts` (outcome targets),
`web/app/api/admin/opportunities/[id]/route.ts` (the refusal), and
`web/lib/lifecycle/operationalProjection.ts` (the one membership/count evaluator).

**Staleness triggers.** A new writer of any governed lifecycle field; the record route accepting a
lifecycle key again; reconciliation or the transition gate leaving canonical execution; a second
transition validator; a change to the governed status-domain set; `placement_candidates.status` being
brought into `status_definitions`.

---

## 6. Identity / Authentication / Roles / Access — PENDING CERTIFICATION (one gate)

**State:** `IDENTITY_ACCESS_RLS_CONVERGENCE_MEASURED_MIGRATION_PACKET_READY_HOSTED_VERIFICATION_REQUIRED`.

Authority discovery completed 2026-09-29; RLS Model A was ratified 2026-09-30; the convergence pass
that followed measured the estate afresh, found a cross-tenant mutation class the first pass had no
term for, and **authored the repair**. Everything on the documentation axis is done. One gate remains,
and it is not a documentation gate:

> **THE ONE REMAINING GATE.** Migrations `20261104120000` and `20261104130000` are authored and
> validated — but **applying them to the deployed primary is a separate governed action that has not
> been performed.** Until it is, the exposures described below are **still open in production**, and
> this section must not be read as saying otherwise.
>
> **Re-verified 2026-09-30 08:54 UTC** against the deployed primary, and unchanged: all 14 mutating
> functions remain `EXECUTE`-granted to `authenticated` (4 of them also to PUBLIC), all 14 still carry
> no caller-authority check, and both tables still have no RLS. The hosted ledger's newest applied
> migration is `20261103120000` — before either repair.
>
> This is not a claim you have to take on trust. `tests/docs/identityAccessCertificationEvidence.test.ts`
> reads the committed hosted census artifacts and **fails if this section is ever moved to certified
> while the ledger has not advanced past `20261104130000`, while any mutating function is still
> executable by a client principal, or while any public table lacks RLS.** The artifacts are checked
> against the SHA-256 of the queries that produced them, so one edited by hand to say the happy thing
> is rejected rather than believed.

**Why the distinction is stated this loudly.** The rest of this pack describes documentation that
matches a shipped system. Here, two paragraphs describe a repair that exists in the tree and not yet
in the database. A reader — human or model — who took "closed" to mean "closed in production" would
draw exactly the wrong conclusion about the current risk. Certification of this domain resumes the
moment the apply is confirmed by census; nothing else is outstanding.

**What is solid.** One permission registry (`permission_keys` / `permissions`), one additive grant
model (`user_roles` → `role_permission_grants`), real scope tables for department, site and access
profile, and seeded ADMIN/OPS packages guarded by in-migration self-tests. `user_person_links` joins
`auth.users` to `persons` through an **explicit operator-created link with no email fallback** —
identity is never inferred, deliberately, and re-verified 2026-09-30: every `persons`-by-email lookup
in the tree resolves a *submitted or inbound* address, never the session's own.

**The four layers, and the fact that they are four.** Authentication (Supabase Auth) → admission
(`portal.access`) → authorization (route capability) → tenant isolation (RLS + the server's org pin).
Each answers a question the others do not, and the most common wrong belief about this system is that
the first implies the rest.

### Blockers closed on the documentation axis

- **The Director gate.** RATIFIED 2026-09-30 (Model A): route capabilities authorize, RLS isolates
  tenants, supported mutation is server-side under `service_role`, UI visibility is presentation only.
  Lives in `platform/foundation/platform-decisions.md` § *2026-09 — Route capabilities authorize; RLS
  isolates tenants; mutation is server-side*.
- **The tenancy class.** The 51 `app_users` write policies with no org predicate and the 2 `work_units`
  self-comparison tautologies are **gone** — remeasured to zero 2026-09-30 by reading every write
  policy's text, not by a negative pattern test. Repaired by `20260916040000`; held by
  `tests/access/rlsTenancyLock.test.ts`.
- **Cross-tenant read exposure.** Two tables had no RLS at all (`payment_provider_disputes`,
  `commercial_policy_exceptions`), both with `org_id` and a standing `authenticated` SELECT grant, so
  any authenticated principal read every organization's rows. **Repair authored** in
  `20261104130000` — *not yet applied; see the gate above.* The estate invariant is held going forward
  by `tests/access/rlsEstateCoverage.test.ts`.
- **The authentication/session layer has an owner.**
  `platform/governance/authentication-and-session-model.md` — new, canonical, and explicit about which
  facts are Alloy's, which are Supabase's, which are **UNKNOWN_EXTERNAL** provider configuration, and
  which are simply absent.

### The finding this pass added

**SECURITY DEFINER functions taking their organization as a parameter.** The September measurement
framed the drift as *table grants* and called it latent because RLS still denies the write. That
reasoning does not extend to SECURITY DEFINER, which never consults RLS at all — and nobody had
counted those.

Measured: **14 mutating functions EXECUTE-granted to `authenticated`, 9 SECURITY DEFINER, none
containing any caller-authority check.** Every one took `p_org_id` as a parameter. The live subset is
`execute_lead_status_mutation` / `execute_enrollment_status_mutation`, which write governed lifecycle
state for whatever org the caller names — bypassing the route, the capability check, and
`validateStatusTransition` together. **Repair authored** in `20261104120000`, which also **widens `access_rpc_boundary_report`** so the
existing live lock guards the *shape* rather than the *spellings* that let this family through. *Not
yet applied to the deployed primary; see the gate above.*

### Debt that remains, with exact sizes

| Debt | Size | Why it is not a certification blocker |
|---|---|---|
| `authenticated` INSERT/UPDATE/DELETE grants the architecture never needed | **259 tables**; **56** of them have no write policy at all | Latent by mechanism: RLS denies, and no supported path uses the authenticated principal to write. Phase 4 retires them per table family; the 56 are the risk-free start |
| Route handlers with no declared capability | **321 of 874** (305 owned + 16 frozen), across **122 route families**; **58 are mutations**, 263 reads | Measured, enumerated, and CI-gated by `scripts/checkRouteCapabilities.mjs` with a **downward ratchet**. Authority per route is knowable from `scripts/routeCapabilities.declared.json`; it is a known quantity, not an unknown one |
| Write policies resting on `current_org_id()` | 41 | Returns NULL above one organization (measured: 3 orgs), so all 41 **deny**. Fails closed — but would silently become permissive in a single-org deployment |
| Write policies matching none of the four known shapes | 142 | None are unconditionally permissive (measured: 0). Unclassified, not unsafe |
| Read semantics for the two newly RLS-protected tables | 2 tables | Both are service-role-only reads today, which is what the product does. Choosing an org-scoped authenticated read predicate is a Financials decision, ledgered rather than guessed |

**Route capability, stated correctly.** Of **874** handlers across 677 route files: **458 declare and
bind a capability**, **95 are declared admission-sufficient**, **321 are pending**. An earlier version
of this pack said "~17 assert a capability" — that was wrong by more than an order of magnitude and
would have led a reader to believe the domain was essentially ungated. It is roughly half-gated, with
the remainder enumerated.

**Admission is not authorization, and the helper name hides it.** `requireAdminOrOps` resolves
`portal.access` and *returns* the principal's permission-key union; asserting a key from it is the
route's job. The invariant is locked polarity-aware by
`tests/access/admissionDoesNotAuthorize.test.ts`: using admission affirmatively to grant
(`if (portalEligible) return true`) fails; using it to refuse (`if (!portalEligible) return forbidden`)
is correct and common.

**Customer/parent authentication is ABSENT** — no credential, no portal, no session. Stated in code as
unsolved (`lib/access/linkedPersonIdentity.ts`). Everything in `platform/planning/**` describing one is
PLANNED.

### Treatment

**DIRECT:** `platform/governance/roles-and-permissions.md`,
`platform/governance/authentication-and-session-model.md`,
`platform/foundation/platform-decisions.md` § *2026-09*.
**REFERENCE_ON_DEMAND:** `platform/governance/rls-authority-model-director-gate.md` — read it as the
*measurement and staged plan*, no longer as an open decision; its §*Remeasured 2026-09-30* supersedes
every count in §*The database, measured*.
**GENERATED_REFERENCE:** `scripts/routeCapabilities.declared.json` — the authoritative per-route
answer, and the only place to ask it.
**PLANNED_ONLY:** `platform/planning/access-identity-v2/**`, `platform/planning/vacilando-os/qa/**`.

### SAFE inferences

- Route capability checks authorize domain operations; RLS isolates tenant data.
- Supported server writes run under `service_role` **after** the application has authorized them.
- UI visibility is presentation only and grants no authority.
- Role permissions are additive across roles, scoped to an organization.
- User→Person linkage is explicit (`user_person_links`); email is contact data, never identity.
- Portal admission (`portal.access`) is a real grantable capability, and it is not domain authorization.
- The browser Supabase client is for `supabase.auth.*`; it does not write.

### FORBIDDEN inferences

- ✗ Portal admission means all admin actions are allowed.
- ✗ Hidden UI implies server authorization exists.
- ✗ RLS is the product permission system.
- ✗ Email identifies the canonical Person.
- ✗ Parent or customer login exists.
- ✗ Planned Access V2 constructs are implemented.
- ✗ Direct PostgREST mutation is supported merely because a DB grant exists.
- ✗ A route is capability-gated because it is under `/api/admin/`. Ask the declared table.
- ✗ MFA, trusted devices, or account disabling exist. Two are absent; the third is provider-side and unverified here.
- ✗ There is a session idle timeout. The mechanism exists and ships disabled.
- ✗ Revoking membership disables the credential. It does not — the user still authenticates and fails admission.
- ✗ Provider settings (password policy, token lifetime, signup openness, rate limits) can be inferred from this repository.

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

This manifest is versioned, not eternal. The base SHA records what was true when the current version
was certified; it is not a claim that the repository must stay there.

### Version history

| Version | Base | Change |
|---|---|---|
| **V1** | `5a5771554` | Identity/Access measured, repaired in code, and **still pending certification on one gate** — the migration apply (§6). Its authentication/session layer gained a canonical owner, the cross-tenant SECURITY DEFINER mutation family was closed, and the route-capability figure was corrected from "~17 assert a capability" to **458 of 874 handlers declare and bind one** — an error of more than an order of magnitude that would have led a reader to believe the domain was essentially ungated. |
| V0 | `9cbe2915b` | First certification: Developer Platform / API, Runtime, Business Process. |

Re-certify a domain when any of these occur:

- product behaviour in that domain changes;
- schema ownership moves;
- a new platform decision lands;
- a canonical owner changes, is split, or is retired;
- a domain's certification is reopened;
- a document in the pack changes treatment.

Adding a domain requires an authority-discovery pass for it first — the same standard API, Runtime
and Business Process were held to. Do not add a domain to this pack because its documents look tidy.
