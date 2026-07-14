# Processing Identity Resolution Engine V1 — Architecture & Implementation Sprint

**Status:** **Implemented locally · Locally certified · Reconciled onto latest `origin/staging` · Awaiting PR merge to staging · Not deployed.**
Architecture and V1 decisions remain frozen. **Design baseline:** `origin/staging` @ `65afc8527…`; **certified HEAD:** current branch tip; **promotion target:** latest staging after an explicit reconciliation.

All V1 slices **B1a–E1 are implemented and locally certified.** The Manual Create Lead identity-review authority defect is fixed: plausible child/household matches force blocking operator review; `IdentityResolutionEligibility` gates plan build, approve, and execute for every source. Full local certification (reset stack, 17/17 Postgres checks, Processing vitests, typechecks, production build) re-passed after the fix. Remaining work is staging reconciliation / promotion only — not new V1 platform functionality.
**E1 status: implemented locally — certified locally** — Superseded direct-write paths retired: `applyFormIntakeSafe` always throws and has no replay flag. Static boundary tests: `web/tests/processing/processingIdentityE1Boundaries.test.ts`.
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

## Historical first Cursor slice
**B1a — Canonical Identity Normalization Primitives and Compatibility Adapters** (`web/lib/identity`: email/phone/name/dob normalizers + E.164 lookup variants + compatibility adapters + bounded **intake** call-site convergence + parity tests + docs). Branch `claude/proc-identity-lib-normalization`. **Non-destructive, no schema, independently mergeable.** **Candidate generation + confidence classification are NOT in B1a — they are B1b.** Security (**B0**) runs on a **separate parallel branch** and is never bundled with B1a. Full boundary at the end of [implementation-plan](processing-identity-resolution-implementation-plan.md).

**Completed V1 order:** B0 ∥ **B1a** → B1b → B2 → B3 → C1 → D0 → D1 → D2 → D3 → **D4** → D5 → E1. Additional source adapters, merge execution, and policy automation remain outside V1.

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
| 11 | [release-notes](processing-identity-resolution-release-notes.md) | PR-ready sprint summary, migration inventory, risks, and verification |
| 12 | [promotion-checklist](processing-identity-resolution-promotion-checklist.md) | Staging reconciliation through production prerequisites |
| 13 | [rollback-plan](processing-identity-resolution-rollback-plan.md) | Staging rollback order, data safety, replay, and direct-write authority |
| 14 | [regression-checklist](processing-identity-resolution-regression-checklist.md) | Consolidated automated, browser, API, security, and domain verification |
| 15 | [commit-inventory](processing-identity-resolution-commit-inventory.md) | Complete phase-grouped implementation and certification history |
| 16 | [migration-audit](processing-identity-resolution-migration-audit.md) | Sprint migration ordering, replay, RLS/index/function verification |
| 17 | [cert-cleanup](processing-identity-resolution-cert-cleanup.md) | Isolated local cert DB cleanup (IDs, tables, method) |

## Reading order
Decisions first: **9 (open-decisions)** → **3 (RFC)** → **4 (data-model)** → **5 (migration)** → **6 (implementation)**. Evidence base: **1 → 2**. Validation/impact: **7 → 8 → 10**. Closeout: **11–17**. Every material claim cites exact repo paths; findings tagged **[C]** confirmed / **[I]** inferred / **[P]** proposed / **[D]** doctrine.

## Provenance
Seven parallel read-only trace streams + firsthand reads of the load-bearing contracts + July 2026 Processing/Forms doctrine, followed by the B1a–E1 local implementation and certification on `claude/proc-identity-lib-normalization`.

## Local implementation notes (B1b–E1)
| Phase | Commit(s) | Focused tests | Known limitations |
|---|---|---|---|
| B1b | see git log | `candidateClassification.test.ts`, B1a/B0 regressions | Booking/comms matchers not migrated; legacy `resolveIntakeRecordResolution` still assembles proposals |
| B2 | see git log | `processingIdentityB2Facts.test.ts`, database certification | Immutable facts and org-scoped RLS certified on the isolated stack |
| B3 | see git log | `processingIdentityB3Resolver.test.ts`, integration certification | Durable resolver generations certified; no source toggle |
| C1 | see git log | `processingIdentityC1Shadow.test.ts` | Historical comparison tooling retained for audit; it is not an active authority path |
| D0 | see git log | `commands/identityCommands.test.ts` | No feature flag (per D0–D3 execution instruction); commands executable only through the server-side registry, never from intake sources; `attach_document`/comms preference ports write directly (no canonical single helper existed); merge is escalation-only (not executable in V1) |
| D1 | see git log | `processingIdentityD1Plans.test.ts` | No feature flag; immutable plan/version/hash and approval invalidation certified against the isolated local database |
| D2 | see git log | `processingIdentityD2Executor.test.ts` | Real local RPC certified for atomic rollback, retry, stale-plan rejection, compensation recording, and idempotency |
| D3 | see git log | `processingIdentityD3Operator.test.ts` | Existing Digital Mailroom case detail owns review; readiness is derived; approval and explicit commit are permission-gated |
| D4 | see git log | `processingIdentityD4CreateLead.test.ts`, updated Create Lead action tests | Create Lead is structurally authoritative through Processing; no legacy fallback or source flag |
| D5 | see git log | `processingIdentityD5PublicForm.test.ts` | No feature flag; public submit never commits identity; shadow dual-path removed from submit route; idempotent case open per submission |
| E1 | see git log | `processingIdentityE1Boundaries.test.ts`, `processingIdentityLocalPostgres.test.ts` | Replay flag removed; `applyFormIntakeSafe` always throws; contacts uniqueness cleanup deferred |

### Local certification (2026-07-12, isolated stack)

**Implemented locally · Certified locally · Reconciled onto latest `origin/staging` · Awaiting PR merge to staging · Not deployed**

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
npm run cert:processing-identity-full    # orchestrator: reset + 17-check runner + serial vitest + typecheck + build
```

**Migration inventory (processing identity sprint):**
`20260716120000` B0 tenant security · `20260716130000` B2 facts · `20260716140000` B3 resolutions · `20260717120000`–`20260717126000` D1 commit plans (split apply) · `20260717130000` D2 executor · `20260718120000` D4/D5 source kinds · `20260718130000` D2 RPC fix · `20260718140000` has_org_role SECURITY DEFINER

**Cert runner (`npm run cert:processing-identity-local`):** **17/17 PASS**

**Authenticated RLS (real JWT):** **10/10 PASS** — org A admin/ops/manager/staff reads; cross-org denial; staff write denial on `processing_resolutions`; service-role cross-org reads

**API integration E2E (`processingIdentityCert*.integration.test.ts`, fresh reset + seed, serial file execution):** **29/29 PASS**
- Manual Create Lead: new family · DOB conflict blocked · existing family/child · shared email · idempotent intake · execute idempotency · cross-tenant · atomic RPC rollback
- Public form: new household · existing household · shared email · duplicate submission · null-org exclusion · approval-without-commit · E1 throw
- Operator: state transitions · stale plan · stale execute rejection + exception
- Target guard: refuses port `54321`

**Replay bypass:** `__legacyDirectWriteReplay` removed; `applyFormIntakeSafe` throw-only

**Build / typecheck:** `npm run typecheck` PASS · `npm run typecheck:tests` PASS · `npm run build` PASS

**Combined Processing + resolver suites:** `web/tests/processing/**` + `web/tests/pos/recordResolverSeam.test.ts` **119/119 PASS** (after isolated DB reset + `--no-file-parallelism`)

**Regression spot-check:** Create Lead · intake · forms · processingCase tests **101/101 PASS**

**Verdict:** **LOCALLY CERTIFIED — READY FOR FINAL STAGING RECONCILIATION**

**Staging reconciliation follow-ups (not local blockers):**
- Playwright/browser E2E for Manual Create Lead + public form (no `*.spec.ts` in this worktree; API integration is authoritative substitute)
- Full POS / Digital Mailroom / workflow / record-system browser regression on staging after migration apply
- Re-export generated schema docs from the reconciled staging migration set after staging apply
- RLS write-matrix expansion for all processing tables × all roles

**Not promoted. Not deployed.**

### D4–E1 no-flag execution note
Per the D4–E1 continuous-local execution instruction, **no new feature flags/env vars/org toggles**. D4 and D5 are structurally authoritative — canonical Processing adapters are the only active mutation path for Manual Create Lead and public lead-capture forms. Safety boundary unchanged: only approved Commit Plans reach the D2 executor via deliberate operator action.

### D0–D3 no-flag execution note
Per the D0–D3 continuous-local execution instruction, **no feature flags/env vars/org toggles are introduced for D0–D3**. Safety is architectural: only an approved, immutable Commit Plan reaches the executor, and only the canonical server-side Processing operator workflow may approve and invoke it. The authoritative D4/D5 adapters likewise require no Processing Identity runtime toggle.
