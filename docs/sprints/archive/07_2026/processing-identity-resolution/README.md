# Processing Identity Resolution Engine V1 — Architecture & Implementation Sprint

**Status: Frozen for V1 implementation** (architecture is implementation-authoritative; product-owner decisions incorporated). **Design baseline:** `origin/staging` @ `65afc8527…`; **promotion target:** latest `origin/staging`.
**B1a status: implemented locally — awaiting full sprint validation and promotion** — Canonical Identity Normalization Primitives and Compatibility Adapters (`web/lib/identity`).
**B0 status: implemented locally — awaiting full sprint validation and promotion** — Tenant security prerequisites (org-scoped identity RLS + `persons.org_id` FK). See migration `20260716120000_processing_identity_b0_tenant_security.sql`.
**B1b status: implemented locally — awaiting full sprint validation and promotion** — Canonical candidate generation + 6-band classification (`web/lib/identity/*`, intake bridge). Flags: none (pure library). Tests: `web/tests/identity/candidateClassification.test.ts`.
**B2 status: implemented locally — awaiting full sprint validation and promotion** — Durable `processing_facts` + case/source extensions. Migration `20260716130000_processing_identity_b2_facts.sql`. Runtime: `web/lib/pos/processingIdentity/processingFactsDb.ts`. Flag: `PROCESSING_PERSIST_FACTS` (default off). Tests: `web/tests/processing/processingIdentityB2Facts.test.ts`, migration shape in `processingIdentityB2B3Migrations.test.ts`.
**B3 status: implemented locally — awaiting full sprint validation and promotion** — `processing_resolutions` persistence + canonical resolver engine. Migration `20260716140000_processing_identity_b3_resolutions.sql`. Seam: `web/lib/pos/recordResolution/recordResolverSeam.ts` (`createProcessingRecordResolver`). Flag: `PROCESSING_REAL_RESOLVER` (default off). Tests: `web/tests/processing/processingIdentityB3Resolver.test.ts`.
**C1 status: implemented locally — awaiting full sprint validation and promotion** — Public form shadow mode (non-authoritative). Hook: public submit route + `web/lib/pos/processingIdentity/formIdentityShadow.ts`. Flag: `PROCESSING_SHADOW_FORMS` (default off). Tests: `web/tests/processing/processingIdentityC1Shadow.test.ts`.
**D0 status: implemented locally — awaiting full sprint validation and promotion** — Registered semantic identity commands (`web/lib/pos/processingIdentity/commands/*`): typed contracts, registry, org/cross-tenant enforcement, idempotency, side-effect-free preview, real handlers over canonical helpers (`IdentityCommandPorts`). **No feature flag** (safety is architectural — commands reachable only via the server-side registry). Tests: `web/tests/commands/identityCommands.test.ts`.
**D1 status: implemented locally — awaiting full sprint validation and promotion** — Versioned, immutable, content-hashed Commit Plans + approval binding (`web/lib/pos/processingIdentity/plan/*`). Migration `20260717120000_processing_identity_d1_commit_plans.sql` (`processing_commit_plans`/`_plan_operations`/`_approvals`, immutability triggers, RLS). **No feature flag.** Tests: `web/tests/processing/processingIdentityD1Plans.test.ts`.
**D2 status: implemented locally — awaiting full sprint validation and promotion** — Deterministic commit executor (`web/lib/pos/processingIdentity/executor/*`): fail-closed preflight, one-transaction atomic identity group (`execute_processing_identity_group` RPC), sequenced dependents, async outbox, compensation, idempotent retry/resume. Migration `20260717130000_processing_identity_d2_executor.sql` (`processing_commit_attempts` append-only, `processing_exceptions`, RPC). **No feature flag** — safety boundary is "no valid approval → no execution" and no source integration. Tests: `web/tests/processing/processingIdentityD2Executor.test.ts`.
**D3 status: implemented locally — awaiting full sprint validation and promotion** — Operator review integration wired into the existing Digital Mailroom case surface. Canonical server-side application service `web/lib/pos/processingIdentity/operator/operatorReviewService.ts` (load review, correction, resolution decision, build/revise plan, approve, explicit execute, read attempts) + deterministic recommendation builder (`recommendationBuilder.ts`, registered semantic ops only; merge = escalation) + readiness projection (`caseStateModel.ts`, derived — no new status column). API: `web/app/api/admin/processing/cases/[caseId]/identity/{review,correction,resolution,plan,approve,execute}/route.ts` (admin context + service-role). UI: `web/app/adminV2/processing/IdentityReviewPanel.tsx` mounted additively in `ProcessingCaseDetailContent.tsx`. **No feature flag** — execution requires a deliberate operator action on an approved plan; no intake source reaches it. Tests: `web/tests/processing/processingIdentityD3Operator.test.ts`.
**D4 status: implemented locally — awaiting full sprint validation and promotion** — Manual Create Lead authoritative cutover. Source adapter `web/lib/pos/processingIdentity/sources/createLeadIntakeAdapter.ts` opens/reuses `create_lead` Processing Cases, persists facts/resolutions, and returns `mode: processing_review` (no CRM identity writes at intake). `executeCreateLeadAction` routes exclusively through Processing; legacy direct-write body removed from active path. Create Lead modal embeds shared `IdentityReviewPanel` for approve + explicit commit. Migration `20260718120000_processing_identity_d4_d5_source_kinds.sql` adds `create_lead` source kind. **No feature flag.** Tests: `web/tests/processing/processingIdentityD4CreateLead.test.ts` + updated Create Lead action tests.
**D5 status: implemented locally — awaiting full sprint validation and promotion** — Public form authoritative Processing intake. `ingestPublicFormThroughProcessing` in `formIntakeAdapter.ts` replaces `applyFormIntakeSafe` on public submit for lead-capture forms; public response succeeds without identity commit; CRM FKs remain null until operator commit. C1 shadow dual-authority removed from submit path (comparison helpers retained for audit). **No feature flag.** Tests: `web/tests/processing/processingIdentityD5PublicForm.test.ts`.
**E1 status: implemented locally — certified against local Postgres (partial)** — Superseded direct-write paths retired: `applyFormIntakeSafe` always throws; legacy body isolated in-file for archaeology only (no replay flag). Static boundary tests: `web/tests/processing/processingIdentityE1Boundaries.test.ts`.
**Type:** Architecture RFC + frozen decision register + phased Cursor implementation plan.
**Owner:** Platform / Processing. **Created:** 2026-07-10. **Decision + freeze pass:** 2026-07-10.

> This is the sprint **named and explicitly deferred** by `docs/sprints/archive/07_2026/processing-form-workflow-finish-closeout.md`:
> *"Record identity resolution … is intentionally out of scope and remains the next separate sprint."*

## Scope in one line
Everything entering Alloy through an inbound channel passes through **one canonical Processing intake engine**: *Understand → Identify → Resolve → Recommend → Approve → Commit.* Sources submit **facts**; Processing decides what they **mean**; authoritative changes occur only through an **approved, immutable Commit Plan** executed via **semantic commands**. Processing owns inbound **information resolution** — it does not replace lifecycle/scheduling/billing/comms/business-process owners.

## Two identity domains — do not conflate
- **Record identity resolution (this sprint):** matching an inbound person/child/household against `persons`/`customers`/`customer_members`/`opportunities`.
- **Communications identity (separate, shipped):** the org's own send/receive channels (`communication_identities`) — never creates a person.

## Frozen V1 decisions (see [open-decisions](processing-identity-resolution-open-decisions.md))
| | Decision | Freeze |
|---|---|---|
| A | Person canonical; **Parent/Guardian = roles** (not entities); Child = `customer_members` (optional person backing); Family = `customers` container derived from relationships. Processing emits **semantic commands**, never table names | 🔒 (child-backing 🧩) |
| B | Participation via semantic `create_process_participation`; **`process_instances` forward, OCM legacy** — a command owns translation | 🧩 abstraction |
| C | Email/phone are **strong signals, not unique keys**; **no person-level uniqueness**; one canonical normalizer (E.164) | 🔒 (reverses prior email-unique lean) |
| D | Min-evidence thresholds for create (Person=name+contact/identity/relationship; Child=name+DOB/age/guardian/family-context; never empty Family; Lead=family+child+interest; participation=family+child+context+no-open-process); **no auto-commit of creation** | 🔒 product-owner finalized |
| E | Lead vs Enrollment recommendation rules; **reopen window = 180 days default, org-configurable, policy-driven (not hardcoded)** | 🔒 product-owner finalized |
| — | **Retention classes:** committed-lineage = life of record + org/legal; uncommitted/rejected/duplicate = 24 mo; raw OCR/transient = 12 mo; plans/approvals/attempts/audit = 7 yr; PII logs = only as long as needed. `retention_class` from foundation; purge jobs later | 🔒 product-owner finalized |
| F | **Whole-plan approval + per-op include flags**; edit voids approval | 🔒 |
| G | **Atomic identity groups** + sequenced dependents + async outbox; comms failure never rolls back identity | 🔒 |
| H | **Merge = propose-only in V1**; privileged execution Phase F | 🔒 |
| I | **Shadow public forms first; first executor cutover = Manual Create Lead**; forms commit second | 🔒 (revises "forms first") |
| J | Deterministic-first, human-authoritative; **no identity auto-commit in V1** | 🔒 |

## First Cursor slice
**B1a — Canonical Identity Normalization Primitives and Compatibility Adapters** (`web/lib/identity`: email/phone/name/dob normalizers + E.164 lookup variants + compatibility adapters + bounded **intake** call-site convergence + parity tests + docs). Branch `claude/proc-identity-lib-normalization`. **Non-destructive, no schema, independently mergeable.** **Candidate generation + confidence classification are NOT in B1a — they are B1b.** Security (**B0**) runs on a **separate parallel branch** and is never bundled with B1a. Full boundary at the end of [implementation-plan](processing-identity-resolution-implementation-plan.md).

**Slice order (frozen):** B0 ∥ **B1a** → B1b (candidate generation + match classification) → B2 (facts/evidence) → B3 (resolver persistence) → C1 (form shadow) → D0 (identity commands) → D1 (commit plan + approval) → D2 (executor) → D3 (operator review) → **D4 (Manual Create Lead cutover — first executor)** → D5 (public-form cutover) → E → F → G.

## Artifacts
| # | Artifact | Purpose |
|---|----------|---------|
| 1 | [current-state-audit](processing-identity-resolution-current-state-audit.md) | Evidence audit of the three intake substrates, gaps, legacy/duplication |
| 2 | [source-mutation-inventory](processing-identity-resolution-source-mutation-inventory.md) | Per-path: entry → matching → direct writes → idempotency → status → risk |
| 3 | [architecture-rfc](processing-identity-resolution-architecture-rfc.md) | **Implementation-authoritative** V1 architecture (frozen) |
| 4 | [data-model](processing-identity-resolution-data-model.md) | **7 typed tables** (reduced from 13) + phase gating + ERD |
| 5 | [migration-strategy](processing-identity-resolution-migration-strategy.md) | Gates G1–G10; rollout (shadow forms → Create Lead commit → forms commit) |
| 6 | [implementation-plan](processing-identity-resolution-implementation-plan.md) | Bounded Cursor slices + exact first slice |
| 7 | [test-strategy](processing-identity-resolution-test-strategy.md) | Unit / integration / 25 scenarios / shadow comparison |
| 8 | [risk-register](processing-identity-resolution-risk-register.md) | Likelihood/impact/detection/prevention/mitigation/rollback |
| 9 | [open-decisions](processing-identity-resolution-open-decisions.md) | **Decision register (A–J frozen)** + original-20 mapping |
| 10 | [doctrine-reconciliation](processing-identity-resolution-doctrine-reconciliation.md) | Docs to reconcile at closeout |

## Reading order
Decisions first: **9 (open-decisions)** → **3 (RFC)** → **4 (data-model)** → **5 (migration)** → **6 (implementation)**. Evidence base: **1 → 2**. Validation/impact: **7 → 8 → 10**. Every material claim cites exact repo paths; findings tagged **[C]** confirmed / **[I]** inferred / **[P]** proposed / **[D]** doctrine.

## Provenance
Seven parallel read-only trace streams + firsthand reads of the load-bearing contracts + July 2026 Processing/Forms doctrine, followed by a decision-finalization pass (this revision). **B1a–C1 local implementation** on branch `claude/proc-identity-lib-normalization` (not promoted).

## Local implementation notes (B1b–C1)
| Phase | Commit(s) | Focused tests | Known limitations |
|---|---|---|---|
| B1b | see git log | `candidateClassification.test.ts`, B1a/B0 regressions | Booking/comms matchers not migrated; legacy `resolveIntakeRecordResolution` still assembles proposals |
| B2 | see git log | `processingIdentityB2Facts.test.ts`, migration static | No live DB RLS integration; remote migration not applied |
| B3 | see git log | `processingIdentityB3Resolver.test.ts` | Resolver persistence flag-gated; no record writes |
| C1 | see git log | `processingIdentityC1Shadow.test.ts` | Shadow comparison stored in `processing_cases.metadata.identity_shadow`; legacy intake remains authoritative |
| D0 | see git log | `commands/identityCommands.test.ts` | No feature flag (per D0–D3 execution instruction); commands executable only through the server-side registry, never from intake sources; `attach_document`/comms preference ports write directly (no canonical single helper existed); merge is escalation-only (not executable in V1) |
| D1 | see git log | `processingIdentityD1Plans.test.ts` | No feature flag; migration authored locally, not applied remotely (RLS/immutability validated by static shape + in-memory round-trip, not a live DB); `create_lead` treated as a dependent op sequencing after the atomic identity group (per RFC §7.14), reconciling the §24 example that lists it inside the group |
| D2 | see git log | `processingIdentityD2Executor.test.ts` | No feature flag; atomic-group RPC authored locally and validated by static shape + all-or-nothing in-memory runner (not a live DB — remote migration prohibited by sprint policy); atomic group = person/household/links/child (lead+participation sequence as dependents); compensation flags created records for the operator (hard-delete prohibited) rather than auto-reversing; executor reachable only via server-side service (no route/source wired in D2) |
| D3 | see git log | `processingIdentityD3Operator.test.ts` | No feature flag; no new migration (readiness is a derived projection over B2/B3/D1/D2, not a new status column — `processing_cases.status` unchanged); operator workflow surfaced additively in the existing Digital Mailroom case detail (no parallel app); plan built from durable resolution decisions via the deterministic recommendation builder; approval/execute gated on privileged operator role + valid approval; merge/duplicate remain escalation-only; execution reachable only through the operator API service (no intake source), verified against in-memory Supabase + executor fakes (not a live DB) |
| D4 | see git log | `processingIdentityD4CreateLead.test.ts`, updated Create Lead action tests | No feature flag; migration authored locally not applied remotely; intake opens Processing Case only — records created after operator approve + explicit commit via D3 panel; flat gather and household-commit payloads both supported |
| D5 | see git log | `processingIdentityD5PublicForm.test.ts` | No feature flag; public submit never commits identity; shadow dual-path removed from submit route; idempotent case open per submission |
| E1 | see git log | `processingIdentityE1Boundaries.test.ts`, `processingIdentityLocalPostgres.test.ts` | Replay flag removed; `applyFormIntakeSafe` always throws; contacts uniqueness cleanup deferred |

### Local certification (2026-07-12, isolated stack)

**Implemented locally · Certified against isolated local Supabase/Postgres · Not pushed · Not promoted · Not deployed**

| Item | Value |
|------|-------|
| Stack project ID | `alloy-processing-identity-cert` |
| API | `http://127.0.0.1:55321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:55322/postgres` |
| Default stack | `54321`/`54322` left untouched |
| Branch | `claude/proc-identity-lib-normalization` |
| Baseline commit | `5b44c475a` |
| Supabase CLI | 2.75.0 |
| Migrations applied | **263** (262 prior + `20260718140000_has_org_role_security_definer.sql`) |

**Procedure (isolated stack):**
```bash
./scripts/processing/processingIdentityCertStack.sh ports
supabase start
./scripts/processing/processingIdentityCertStack.sh reset
npm run cert:processing-identity-env   # writes web/.env.local (gitignored)
npm run cert:processing-identity-local
cd web && npm run test -- tests/processing/processingIdentityCert*.ts
```

**Migration inventory (processing identity sprint):**
`20260716120000` B0 tenant security · `20260716130000` B2 facts · `20260716140000` B3 resolutions · `20260717120000`–`20260717126000` D1 commit plans (split apply) · `20260717130000` D2 executor · `20260718120000` D4/D5 source kinds · `20260718130000` D2 RPC fix · `20260718140000` has_org_role SECURITY DEFINER

**Cert runner (`npm run cert:processing-identity-local`):** **17/17 PASS** — B0 orphan/FK · processing tables · RPC atomicity/rollback · org-scoped policies · cross-org fact FK · has_org_role predicates · create_lead source kind

**Authenticated RLS (real JWT via `signInWithPassword`):** **7/7 PASS** — Org A admin/ops/manager/staff same-org reads; cross-org denial; no recursion stack overflow after `has_org_role` SECURITY DEFINER fix

**API integration E2E (`processingIdentityCertE2E.integration.test.ts`, fresh reset + seed):** **7/7 PASS**
- Manual Create Lead: brand-new family (zero pre-commit writes) · existing family + new child · shared-email ambiguity · idempotent case reuse
- Public form: zero pre-commit writes · cross-tenant isolation · `applyFormIntakeSafe` throws (E1)
- Target guard: refuses port `54321` / non-local URLs

**Replay bypass:** `__legacyDirectWriteReplay` removed; `applyFormIntakeSafe` throw-only; static boundary tests updated

**Build / typecheck:** `npm run typecheck` PASS · `npm run typecheck:tests` PASS · `npm run build` PASS (required local `npm ci` — Turbopack rejects out-of-worktree `node_modules` symlink)

**Combined unit suites:** `web/tests/processing/**` **89/89 PASS** (14 files)

**Remaining gaps (promotion blockers):**
- Playwright/browser E2E for Manual Create Lead + public form not executed (existing Create Lead spec still expects legacy immediate `opportunity_id`)
- Full scenario matrix A–H per test strategy not implemented (DOB conflict, atomic failure rollback proof, null-org diagnostic, attachment metadata, state-model assertions across all readiness states)
- Digital Mailroom / POS / broad mutation suites not re-run in this pass
- RLS matrix does not yet cover write paths for all roles on processing tables

**Verdict:** **NOT CERTIFIED** for full sprint promotion — core isolated-stack, migration replay, authenticated RLS, API integration E2E, executor, E1 boundaries, typecheck, and production build pass; browser E2E and complete scenario matrix remain open.

**Not promoted. Not deployed. No push.**

### D4–E1 no-flag execution note
Per the D4–E1 continuous-local execution instruction, **no new feature flags/env vars/org toggles**. D4 and D5 are structurally authoritative — canonical Processing adapters are the only active mutation path for Manual Create Lead and public lead-capture forms. Safety boundary unchanged: only approved Commit Plans reach the D2 executor via deliberate operator action.

### D0–D3 no-flag execution note
Per the D0–D3 continuous-local execution instruction, **no new feature flags/env vars/org toggles are introduced for D0–D3**. Safety is architectural: only an approved, immutable Commit Plan reaches the executor, and only the canonical server-side Processing operator workflow may approve and invoke it. This **supersedes** the `PROCESSING_RECORD_COMMANDS` / `PROCESSING_COMMIT_*` / `PROCESSING_OPERATOR_REVIEW` flag references in the frozen implementation and migration plans for the D0–D3 slices (earlier B/C flags are unchanged).
