# Processing Identity Resolution — Implementation Plan (Historical; V1 complete locally)

**Status:** Historical implementation plan; V1 slices B1a through E1 are **implemented locally and locally certified**. The branch is **awaiting staging reconciliation, not promoted, and not deployed.** Frozen decisions remain authoritative in [open-decisions](processing-identity-resolution-open-decisions.md) and the [RFC](processing-identity-resolution-architecture-rfc.md).

**Global non-goals (all slices):** no OCR; no AI in extraction/matching/commit; no email-attachment/inbound-email intake; no destructive schema before parity; no new source-specific matcher/normalizer; no raw identity writes from Processing (semantic commands only); no auto-commit of identity.

**Final validation:** `npm run cert:processing-identity-full` resets the isolated stack, replays migrations, runs the 17-check database certification, runs the serial Processing suites, then runs `npm run typecheck`, `npm run typecheck:tests`, and the production build.

---

## Slice DAG (completed V1 sequence)

```
B0  Tenant security prerequisites ───────────── (independent, parallel; never bundled with B1a)
      (persons.org_id FK; org-scope admin_ops_full_access; RLS tests)

B1a Canonical Identity Normalization Primitives and Compatibility Adapters   ◄── FIRST PACKAGE
 │      (email/phone/name/dob normalizers + lookup variants + intake call-site convergence)
 ▼
B1b Canonical Candidate Generation and Match Classification
 │      (person/child candidate generation, confidence bands, signal scoring, contradiction eval)
 ▼
B2  Durable facts / evidence            (processing_facts + case/source extensions; NO uniqueness)
 ▼
B3  Resolver persistence                (real RecordResolver → processing_resolutions; proposals only)
 ▼
C1  Public-form comparison              (historical pre-cutover divergence recorder)
 │
D0  Registered identity commands ◄──────┘   (semantic record/link/participation commands; uniqueness after de-dup)
 ▼
D1  Commit Plan + approval               (versioned immutable plan + approval binding; no execution)
 ▼
D2  Commit executor                      (atomic groups, idempotency, partial-failure/compensation)
 ▼
D3  Operator review integration          (three-pane review on Processing surface)
 ▼
D4  Manual Create Lead reviewed cutover  (FIRST executor cutover; low blast radius)
 ▼
D5  Public form reviewed cutover         (after executor validation; largest dup-prevention win)
 ▼
E1  Direct-write retirement              (Create Lead + public forms only)
```

All listed V1 slices are complete on `claude/proc-identity-lib-normalization`. Remaining source adapters, privileged merge execution, import/multi-household work, and policy automation are future roadmap work outside this sprint.

---

## B0 — Tenant security prerequisites *(independent parallel branch)*
- **Objective:** close cross-tenant identity exposure before the engine touches identity (gate G2).
- **Dependencies:** none. **Parallel:** yes (own branch).
- **Inspect:** `admin_ops_full_access` policies on `customers/opportunities/contacts/opportunity_customer_members`; `persons` table def; `docs/schema/schema-policies-and-security.md`.
- **Scope:** `persons.org_id` FK (validate rows first); replace non-org-scoped `admin_ops_full_access` with org-scoped `has_org_role(org_id, …)`.
- **Non-goals:** no dedup, no identity uniqueness, no engine code, no normalization.
- **Schema:** FK + policy replacement (additive/replacement; non-destructive to data). **Runtime:** none. **Tests:** RLS tests proving org-A admin/ops cannot read org-B `customers/opportunities/contacts/OCM`; existing suites green.
- **Flags:** none. **Rollback:** revert migration. **Exit (G2):** cross-org blocked; in-org flows work. **Docs:** none in this sprint dir.

## B1a — Canonical Identity Normalization Primitives and Compatibility Adapters **← FIRST PACKAGE**
See the exact first-slice box below. **Includes only:** canonical email / phone / name / date-DOB normalization; deterministic lookup variants; compatibility adapters for existing intake callers; behavior-preserving migration of **bounded intake normalization call sites**; focused parity tests; identity-library documentation. **Excludes:** candidate generation, confidence bands, signal scoring, contradiction eval (→ B1b); resolver persistence, Processing Case wiring, schema, uniqueness, RLS/security, Commit Plans, approval, execution, source cutover, UI.

## B1b — Canonical Candidate Generation and Match Classification
- **Objective:** the matching brain, built on B1a primitives.
- **Dependencies:** B1a. **Parallel:** no (after B1a).
- **Inspect:** `intake/resolve/matchIdentity.ts`, `queryMatches.ts`, `resolveIntakeRecordResolution.ts`, `forms/intake/intakeIdentityLookups.ts`.
- **Scope:** `generatePersonCandidates`, `generateChildCandidates` (capped, org-scoped, archived-included+flagged); 6-band confidence classifier (`confirmed|strong|possible|weak|conflicted|excluded`); typed signal scoring (polarity/weight/evidence); contradiction evaluation. All in `web/lib/identity/`.
- **Non-goals:** no persistence; no Processing Case wiring; no commit; no schema.
- **Tests:** candidate-generation + band-classification parity vs `resolveIntakeRecordResolution` on fixtures; contradiction cases (email match + DOB mismatch → Conflicted); tenant-scope.
- **Flags:** none. **Rollback:** revert. **Exit:** candidate generation + classification available as pure functions; parity green.

## B2 — Durable facts / evidence
- **Objective:** `processing_facts` (immutable lineage) + `processing_cases`/`_sources` extensions + `persons` normalized cols/non-unique indexes + `retention_class` (gate G3). **No uniqueness constraints.**
- **Dependencies:** none for schema (parallel to B1); resolver use needs B1a/B1b.
- **Inspect:** `20260612120100_pos_processing_cases_v1.sql`; `lib/pos/processingCase/*`.
- **Schema:** additive tables/columns + RLS (`has_org_role` + service) + immutability trigger on `processing_facts`; `retention_class` column from foundation (data-model §7).
- **Non-goals:** no writes wired; no uniqueness; no purge job.
- **Implemented:** migration, org-scoped RLS, immutable facts, append-only corrections, and source lineage. **Runtime toggle:** none required by the authoritative D4/D5 paths.

## B3 — Resolver persistence
- **Objective:** implement the real `RecordResolver` behind the seam (B1a+B1b), persisting `processing_resolutions` (gate G4). Proposals only.
- **Dependencies:** B1a, B1b, B2.
- **Inspect:** `recordResolverSeam.ts`, `intake/resolve/*`.
- **Non-goals:** no plan; no identity writes; no commit.
- **Implemented:** canonical engine persists org-scoped resolution generations and candidate evidence through the existing resolver seam. **Runtime toggle:** none required by the authoritative D4/D5 paths.

## C1 — Public-form shadow certification (historical bridge)
- **Implemented outcome:** comparison tooling validated canonical resolution without identity mutation. It is retained for audit only and is not an active authority path after D5.

## D0 — Registered identity commands
- **Objective:** register semantic commands + uniqueness (gate G7).
- **Dependencies:** B1a (normalizer for de-dup), B2.
- **Scope:** register `create_person`, `create_household`, `link_person_to_household`, `add_child_to_household`, `create_lead`, `link_person_to_lead`, `create_process_participation`, `update_record_fields`, `attach_document`; register `person_status` handler; add uniqueness (`customer_members` natural key; opportunity/submission/event idempotency) **after** a `lib/identity` de-dup backfill (collisions quarantined, never force-merged). `create_process_participation` owns OCM↔`process_instances` mapping (Decision B).
- **Inspect:** `lib/mutations/*`, `lib/admin/actions/*`, `entryLifecycleActions.ts`, `lib/persons/*`.
- **Tests:** each command idempotent (double-call = one record); backfill collision report; uniqueness enforced. **Runtime toggle:** none; safety is architectural and commands are reachable only through the server-side registry. **Deps:** B1a. **Risk:** backfill collisions — quarantine. **Cursor boundary:** wrap existing helpers; report collision volume before adding uniques.

## D1 — Commit Plan + approval
- **Objective:** generalize `CreateLeadCommitSelection` → persisted, versioned, immutable `processing_commit_plans`/`_plan_operations` + `processing_approvals` (gates G5, G6). No execution.
- **Dependencies:** B2, D0.
- **Inspect:** `applyResolutionToCommitSelection`, `createLeadCommitSelection.ts`.
- **Tests:** plan determinism; hash stability; edit→new version voids approval; whole-plan-approve + per-op include (Decision F). **Flags:** **superseded — none** (D0–D3 introduce no flags; approval binding is the gate). **Cursor boundary:** ops reference `command_key`; no raw writes.

## D2 — Commit executor
- **Objective:** execute an approved plan via semantic commands; atomic groups; idempotency; partial-failure + compensation; stale-plan (Decision G).
- **Dependencies:** D0, D1.
- **Inspect:** `lib/pos/processingCase/commit/*` (new), `POST /api/admin/mutations/execute`.
- **Tests:** scenarios 21–23; idempotent re-exec; tenant revalidation; **comms-failure-does-not-rollback-identity**. **Flags:** **superseded — none** (executor is not flag-gated; its safety boundary is "no valid approval → no execution" + no direct source integration). **Cursor boundary:** never reinterpret the plan or change targets; precondition mismatch → fail op + reopen.

## D3 — Operator review integration
- **Objective:** three-pane review (Evidence/Resolution/Plan); accept/reject/declare-new/mark-unresolved; approve one immutable plan.
- **Dependencies:** D1, D2.
- **Inspect:** `intakeCasePresentation.ts`, submission linkage-review components, `ProcessingModal`.
- **Non-goals:** no Digital Mailroom restyle (frozen). **Tests:** component + approval-binds-to-hash. **Flags:** none.

## D4 — Manual Create Lead reviewed cutover (first executor cutover, complete)
- **Implemented outcome:** Create Lead routes exclusively through intake → resolution → plan → approval → explicit executor commit. The direct-write fallback is retired and there is no source flag.

## D5 — Public form reviewed cutover (complete)
- **Implemented outcome:** public lead-capture submissions create Processing facts/resolutions and zero identity records before operator approval and explicit commit. `applyFormIntakeSafe` is a throw-only retired boundary; there is no source flag.

## E1 — Direct-write retirement (complete)
- Manual Create Lead and public forms each have one authoritative identity mutation path through Processing.
- `__legacyDirectWriteReplay` is removed and `applyFormIntakeSafe` always throws.
- Other source families (document/packet, book-v2, gutters/backend, vendor, import, communications-derived) are future independent adapters, not duplicate D4/D5 authority.

## Deferred beyond V1
- Remaining source adapters and compatibility retirement.
- Privileged merge execution, import, and broader household graph operations.
- Versioned policy automation. No such automation may bypass human approval for V1 identity changes.

---

## Exact first Cursor slice — **B1a: Canonical Identity Normalization Primitives and Compatibility Adapters**

Chosen because it is the **dependency root** for the entire matching stack, **non-destructive** (pure normalization refactor + parity tests), **independently mergeable** (no schema, no flags, no source cutover, no UI), and it **proves one architectural foundation** — a single canonical normalizer with lookup variants — without touching any production write behavior. B0 (security) proceeds on a separate parallel branch and is **not bundled** with this slice. Candidate generation and confidence classification are **explicitly out** (they are B1b).

| Field | Value |
|---|---|
| **Branch name** | `claude/proc-identity-lib-normalization` |
| **Starting baseline** | The **promoted `origin/staging` tip** that contains these artifacts (recorded in the handoff) — verify before starting |
| **In scope (create)** | `web/lib/identity/`: `normalizeEmail.ts` · `normalizePhone.ts` (**canonical E.164** storage form) · `phoneLookupVariants.ts` (deterministic variant set for legacy non-E.164 rows) · `normalizeName.ts` (trim+lower+collapse `\s+`) · `normalizeDob.ts` (ISO `YYYY-MM-DD`) · compatibility adapters wrapping the legacy signatures · `index.ts` · `README.md` |
| **In scope (re-point, behavior-preserving — bounded intake call sites only)** | `web/lib/intake/normalize/{email,phone,personName,date,age}.ts` · `web/lib/forms/intake/intakePersonMatch.ts` (normalization helpers only) · `web/lib/forms/intake/intakeIdentityLookups.ts` (normalization helpers only) · `web/lib/persons/findOrCreatePersonInOrg.ts` (normalization only) — each delegates to `lib/identity` via the compatibility adapter, preserving current outputs |
| **Explicitly OUT of scope** | person candidate generation; child candidate generation; confidence bands; signal scoring; contradiction evaluation (**all → B1b**); resolver persistence; Processing Case wiring; ANY schema/uniqueness/index; RLS/security (**→ B0**); Commit Plans; approval; execution; source cutover; UI; booking/comms normalization call sites (a later non-blocking cleanup); changing first-match vs ambiguity-safe *matching* semantics (this slice touches normalization only) |
| **Schema changes** | **None** |
| **Required tests** | `web/tests/identity/*`: golden-value **parity** per normalizer against every legacy implementation on a corpus **including** +1-vs-10-digit phones, double-space names, empty→null email, DOB variants; assert **no behavior change** at each re-pointed intake call site (compatibility adapter returns byte-identical results) |
| **Required docs** | `web/lib/identity/README.md` (canonical E.164 phone form; "email/phone are signals, not unique identity keys" per Decision C; scope = normalization primitives only, candidate generation is B1b); update this sprint's `README.md` status row for B1a → in progress |
| **Commit expectations** | Small, reviewable commits on the branch; **do not commit to `staging`**; **do not push or open a PR** unless the human asks; end commit messages with the required Co-Authored-By line |
| **Stop condition** | Stop when `lib/identity` normalizers + variants + compatibility adapters exist, the listed **intake** call sites delegate, `npm run typecheck:build` passes, and all parity tests are green. Report: the canonical phone form chosen, any call site whose behavior could not be preserved, and any legacy-normalizer divergence surfaced by the parity corpus |
| **Do NOT start afterward** | Do not begin B1b (candidate generation/classification), B0 (security), B2 (schema), the resolver, or any commit/executor/UI work. Await B1a review first |

This slice lands the single-normalizer foundation every later slice depends on, with zero production-behavior change and nothing to roll back beyond a branch revert.

---

## Per-slice reporting expectation
Cursor reports, per slice: baseline SHA verified; files changed; tests added + results; `typecheck:build` result; any deviation from the frozen contracts (with rationale); any behavior that could not be preserved. Cursor does **not** proceed to the next slice's design.
