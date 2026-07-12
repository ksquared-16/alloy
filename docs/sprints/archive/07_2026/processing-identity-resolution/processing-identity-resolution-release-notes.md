# Processing Identity Resolution V1 — Release Notes

**Status:** **Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.**

## Executive summary

Processing Identity Resolution V1 replaces pre-resolution identity writes for Manual Create Lead and public lead-capture forms with one durable, reviewable, auditable path. Intake now records source evidence and candidate resolutions first; identity records change only after an operator approves an immutable Commit Plan and explicitly invokes the executor.

This is a promotion candidate, not a deployment record. Final staging reconciliation, migration replay, certification, CI, and staging smoke remain mandatory.

## Major architectural changes

- One canonical normalization and candidate-generation library under `web/lib/identity`.
- One durable Processing spine for source case, facts, resolution, recommendation, plan, approval, execution, and exception audit.
- One semantic command boundary between Processing intent and physical record mutation.
- One authority path each for Manual Create Lead and public lead-capture forms.
- Human approval is structural, not feature-flag policy.

## New runtime

The runtime is:

`source adapter → Processing Case → facts/evidence → candidate resolution → operator decisions → immutable Commit Plan → exact approval → explicit executor commit`

Processing owns inbound information resolution. Canonical entity, Business Process, workflow, and mutation owners retain downstream authority.

## Identity engine

- Canonical email, phone, name, and DOB normalization with compatibility adapters.
- Capped org-scoped person/child candidate generation.
- Deterministic confidence bands: confirmed, strong, possible, weak, conflicted, excluded.
- Typed support/contradiction/exclusion signals with reasons and evidence.
- Household-aware propagation and explicit child DOB mismatch blocking.
- Email/phone remain signals, never universal person uniqueness keys.

## Processing pipeline

Adapters produce source-neutral intake data. The canonical engine persists facts and one resolution generation per subject, builds operator recommendations, and converts accepted decisions into registered semantic operations. No source-specific matcher or direct identity writer exists in the D4/D5 authority paths.

## Processing Case

`processing_cases` and `processing_case_sources` provide the durable org-scoped work/replay boundary. Create Lead uses the `create_lead` source kind; public forms bind to their submission source. Derived review readiness avoids a second status authority.

## Candidate generation

Candidate queries are org-scoped, ambiguity-safe, and deterministic. Multiple plausible records remain review-required. Archived candidates are visible rather than silently duplicated. Cross-tenant references are rejected.

## Facts/evidence

`processing_facts` stores normalized values and evidence lineage. Facts are immutable; corrections append and reference the superseded fact. `processing_resolutions` stores provisional subjects, candidates, confidence, decisions, and generation lineage.

## Commit Plans

`processing_commit_plans` and `processing_plan_operations` store a deterministic versioned operation DAG. Plans are immutable after build. Material revision creates a new version and invalidates prior approval. Operations name registered semantic commands rather than tables.

## Executor

The executor:

- Revalidates org, plan state, content hash, approval, dependencies, and stale-record preconditions.
- Executes the identity graph through `execute_processing_identity_group` in one transaction.
- Sequences dependent lead/participation operations after identity references resolve.
- Persists append-only attempts and per-operation outcomes.
- Supports idempotent retry/resume and records compensation/exception work.
- Never treats external side-effect failure as grounds to delete committed identity.

## Operator review

The existing Digital Mailroom case detail owns evidence review, fact correction, resolution decisions, plan build/revision, approval, explicit execution, attempts, and exceptions. Rejected/blocking resolutions prevent plan construction. Merge remains escalation-only.

## Source cutovers

- **D4 Manual Create Lead:** command execution opens/reuses a Processing Case and returns review state. No identity record is written at intake.
- **D5 Public forms:** lead-capture submission succeeds with Processing state while CRM foreign keys remain null until explicit commit.
- C1 comparison helpers remain audit-only and do not own authority.

## Direct-write retirement

E1 removes the legacy replay escape hatch. `applyFormIntakeSafe` is throw-only. Create Lead no longer carries an active direct-write fallback. No D4/D5 feature, org, source, or environment toggle can restore dual authority.

## Security improvements

- `persons.org_id` is constrained to `orgs`.
- Identity-adjacent admin/ops policies are org-scoped.
- Processing tables use org-scoped RLS and privileged server-only mutation paths.
- `has_org_role` is security-definer hardened to avoid authenticated RLS recursion.
- Real JWT certification covers in-org role access, staff write denial, cross-org denial, and service-role behavior.

## Migration inventory

| Order | Migration group | Purpose |
|---:|---|---|
| 1 | `20260716120000_processing_identity_b0_tenant_security.sql` | Person FK and org-scoped identity policies |
| 2 | `20260716130000_processing_identity_b2_facts.sql` | Facts, case/source extensions, normalized person columns/indexes |
| 3 | `20260716140000_processing_identity_b3_resolutions.sql` | Durable resolution generations and RLS |
| 4 | `20260717120000`–`20260717126000_processing_identity_d1_*` | Commit-plan, operation, approval tables; indexes; immutability; RLS |
| 5 | `20260717130000_processing_identity_d2_executor.sql` | Attempts, exceptions, executor RPC |
| 6 | `20260718120000_processing_identity_d4_d5_source_kinds.sql` | `create_lead` source-kind support |
| 7 | `20260718130000_processing_identity_d2_rpc_customer_persons_fix.sql` | Align RPC conflict target with existing customer-person uniqueness |
| 8 | `20260718140000_has_org_role_security_definer.sql` | Break authenticated RLS recursion safely |

The chain is chronological and replayed successfully from empty state. It is additive except for policy replacement/hardening and function replacement. No V1 migration drops business data or identity tables.

## Risks

- Staging conflict resolution could reintroduce a source writer, stale command mapping, or policy regression.
- Staging has newer unrelated migrations than this branch baseline; generated schema exports must be refreshed from the reconciled stack, not this pre-rebase branch alone.
- Rollback after staging data exists must preserve Processing audit/data and use deployment-based authority rollback; destructive table drops are not the default.
- Merge execution, additional source adapters, and automation remain explicitly outside V1.

## Rollback

Before production, prefer deployment/Git rollback of runtime entry points while preserving additive Processing rows. Stop executor access first, then source intake, then operator endpoints. Only reverse schema on a disposable/no-data staging database; otherwise retain tables and restore compatible policies/functions. Full procedure: `processing-identity-resolution-rollback-plan.md`.

## Verification checklist

- [x] Fresh isolated 263-migration replay
- [x] 17/17 database certification checks
- [x] Real authenticated JWT RLS matrix
- [x] 29/29 integration scenarios
- [x] 119/119 serial Processing + resolver tests
- [x] Production TypeScript graph
- [x] Test TypeScript graph
- [x] Production build
- [ ] Reconcile onto latest staging
- [ ] Re-export schema references from reconciled stack
- [ ] Re-run full certification and broad regression
- [ ] CI and manual staging smoke

## Future work

- Additional source adapters: documents/packets, book-v2, gutters/backend, vendor, import, communications-derived intake.
- Privileged merge execution and reversible alias/tombstone workflow.
- Broader/multi-household identity graph operations.
- Versioned, measured policy automation.
- Retention automation, metrics, browser E2E, and operational dashboards.
