# Processing Identity Resolution — Migration & Rollout Strategy (V1, refined)

**Baseline:** `origin/staging` @ `65afc8527`. Design only. Reflects frozen decisions ([open-decisions](processing-identity-resolution-open-decisions.md)); rollout order per **Decision I** (shadow forms → **Create Lead first commit** → forms commit).

**Doctrine.** Additive-first (no destructive schema until parity proven); shadow before authority; **the first executor cutover is the lowest-risk source (Create Lead), not the highest-volume**; deterministic automation last. Direct writes are wrapped then retired — never cut cold. **No indefinite dual-write:** every dual-write window has a named exit gate.

---

## Explicit gates (must pass in order)

| Gate | Definition | Blocks |
|---|---|---|
| **G1 Normalization** | `lib/identity` is the single normalizer (**B1a**) and single candidate generator/classifier (**B1b**); intake call sites delegate; parity green | any uniqueness or resolver work |
| **G2 Security** | `persons.org_id` FK; `admin_ops_full_access` org-scoped; RLS tests green | any engine identity read/write |
| **G3 Durable facts/evidence** | `processing_facts` populated with lineage; immutable; corrections append | resolver persistence |
| **G4 Resolver persistence** | real `RecordResolver` writes `processing_resolutions` (proposals only) | shadow |
| **G5 Recommendation → plan** | plan builder produces versioned `processing_commit_plans` + `_plan_operations` (built, not executed) | approval/executor |
| **G6 Approval** | `processing_approvals` binds to version+hash; edit voids | reviewed commit |
| **G7 Command registration** | semantic record commands registered + idempotent + constraint-backed | reviewed commit |
| **G8 Shadow parity** | forms shadow: `would-create-duplicate == 0`; agreement ≥ target | reviewed commit |
| **G9 Reviewed commit (Create Lead)** | executor commits Create Lead via commands, no dup regression | forms commit |
| **G10 Legacy retirement** | per-source direct writer removed after its adapter is authoritative | phase exit |

---

## Phase A — Inventory & contracts (this sprint) ✅
- **Scope:** freeze contracts + decisions (done). **Authoritative:** legacy everything. **Shadow:** none. **Prohibited:** code. **Exit:** decisions frozen, owners assigned. **Rollback:** n/a.

## Phase B — Foundation (dormant)
- **Scope:** G1 (`lib/identity` — **B1a** normalization primitives + **B1b** candidate generation/classification), G2 (security), G3 (`processing_facts` + case/source extensions + `persons` normalized cols/indexes + **`retention_class` from foundation**), G4 (real resolver, proposals only, behind flag). New `processing_facts`/`processing_resolutions` tables (additive). **No uniqueness constraints yet.**
- **Authoritative:** legacy runtime (all commits). **Shadow:** none. **Dual-write:** none. **Prohibited:** any Processing commit; any DB uniqueness on persons.
- **Flags:** `PROCESSING_IDENTITY_ENGINE_ENABLED`(off), `PROCESSING_REAL_RESOLVER`(off).
- **Rollback:** drop flags; additive tables inert. **Exit:** G1–G4 pass; resolver parity vs `resolveIntakeRecordResolution` green.

## Phase C — Shadow mode (public forms)
- **Scope:** `FormSubmissionAdapter` → engine → **build** `processing_commit_plans` (G5) — never executed; comparison recorder captures legacy vs proposed.
- **Authoritative:** legacy `applyFormIntakeSafe` (still commits). **Shadow:** engine plan for forms. **Dual-write:** none (engine writes only `processing_*` proposal rows). **Prohibited:** engine execution; any identity write from the engine.
- **Flags:** `PROCESSING_SHADOW_FORMS`(pilot org). **Schema:** `form_submissions.submission_idempotency_key`.
- **Observability:** divergence dashboard (agreement, would-prevent-dup, **would-create-dup must trend to 0**).
- **Rollback:** flag off; shadow rows discarded. **Exit (G8):** ≥ N weeks, would-create-dup == 0, agreement ≥ target, all divergences triaged.

## Phase D — Reviewed commit
Implementation slices **D0 → D5** (labels match the implementation plan). Order per Decision I: **D4 Manual Create Lead first, then D5 public forms.**

### D0 — Registered identity commands (G7) — prerequisite
- Register semantic commands (`create_person`, `create_household`, `link_person_to_household`, `add_child_to_household`, `create_lead`, `link_person_to_lead`, `create_process_participation`, `update_record_fields`, `attach_document`), each idempotent + org-scoped, wrapping existing helpers. Add uniqueness (`customer_members` natural key; opportunity/submission/event idempotency) **after** a `lib/identity` backfill de-dups existing rows (collisions quarantined, not force-merged). Register `person_status` handler.
- **Authoritative:** legacy. **Prohibited:** raw identity writes from new commands.

### D1 — Commit Plan + approval (G5, G6); D2 — Commit executor; D3 — Operator review
- **Scope:** versioned immutable `processing_commit_plans`/`_plan_operations` + `processing_approvals` (D1); atomic-group executor with partial-failure/compensation (D2, Decision G); three-pane operator review on the Processing surface (D3).
- **Authoritative:** legacy (no cutover yet). **Prohibited:** execution before approval; auto-commit.

### D4 — Manual Create Lead reviewed commit (FIRST executor cutover, G9)
- **Scope:** route Create Lead commit through plan→approval→executor when flagged; legacy `executeCreateLeadHouseholdCommit` becomes fallback.
- **Authoritative:** engine (pilot org) for Create Lead; legacy fallback when flag off. **Dual-write:** none — one path per flag state. **Prohibited:** auto-commit.
- **Flags:** `PROCESSING_COMMIT_CREATE_LEAD`(pilot). **Tests:** scenarios 1–5, 18–23; partial-failure/retry/stale-plan; tenant isolation.
- **Rollback:** flag off → `executeCreateLeadHouseholdCommit`. **Exit (G9):** pilot Create Lead on engine, no dup regression, acceptable review load.

### D5 — Public forms reviewed commit
- **Scope:** route form lead-capture commit through the engine (de-risked by C1 shadow + D4 executor); `applyFormIntakeSafe` becomes fallback.
- **Authoritative:** engine (pilot) for forms; legacy fallback when flag off. **Dual-write:** none. **Prohibited:** auto-commit; pre-resolution direct write when flag on.
- **Flags:** `PROCESSING_COMMIT_FORMS`(pilot). **Tests:** forms scenario suite; duplicate-regression guard.
- **Rollback:** flag off → `applyFormIntakeSafe`. **Exit:** pilot forms on engine, no dup regression.

## Phase E — Source-by-source cutover + legacy retirement (G10)
- **Order:** document/packet (wire real resolver seam) → book-v2 quote-start (share ambiguity-aware matcher) → gutters + backend cleaning leads (**retire**) → vendor. One adapter + one flag per source; **retire the legacy writer at each phase exit**; delete dead code (`applyFormLeadCaptureIntake.ts`, `deferredRecordResolver` after last consumer); retire global `contacts` uniques after person-first parity.
- **Authoritative:** engine per source as cut over. **Dual-write:** none (flag switches path). **Prohibited:** leaving both writers live past the exit gate (risk R-LEGACY-SURV). **Exit:** each source flag defaulted on; retired path unreachable (regression test).

## Phase F — Broader graph & merge
- **Scope:** multi-household split; import adapter (batch envelopes); comms-derived/portal; **merge execution** (privileged, Decision H) with `identity_merges` + alias redirect.
- **Authoritative:** engine. **Prohibited:** automatic merge in intake commit. **Flags:** `PROCESSING_MERGE_ENABLED`, `PROCESSING_IMPORT_ADAPTER`. **Exit:** merge in privileged use; import proven at scale.

## Phase G — Controlled policy automation
- **Scope:** `processing_policies` (versioned, org-scoped); enable narrow deterministic automation (trusted-identity preselect+auto-link on Confirmed; no-op auto-complete) only on measured accuracy. **Prohibited:** any policy overriding hard protections; auto-commit of create/link/merge/contact-change. **Flags:** per-policy, off by default. **Exit:** measured auto-accuracy ≥ threshold, false-match below bound.

---

## Rollout order (frozen, Decision I)
1. Shadow public forms (C1) → 2. **Manual Create Lead reviewed commit (D4)** → 3. Public forms reviewed commit (D5) → 4. Document/packet (E) → 5. book-v2 quote-start (E) → 6. gutters + backend leads retire (E) → 7. vendor (E) → 8. graph/merge/import (F) → 9. policy (G).

## Cross-phase guarantees
- Additive until parity; no destructive schema before the replacing path is proven.
- Every source gains an idempotency key at/before cutover.
- One resolver, one normalizer — no phase reintroduces a source-specific matcher.
- Reversible commits (compensation); merge alias-reversible.
- One flag per capability/source; **removed at phase exit** (risk R-FLAG-FRAG).
- No dual-write ambiguity: flags switch the *whole path*; the engine never writes identity in shadow.
