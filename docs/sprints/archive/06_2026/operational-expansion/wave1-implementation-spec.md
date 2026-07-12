# Implementation Specification — Operational Expansion, Implementation Wave 1

**Status:** Canonical engineering contract for Wave 1. **Architecture is frozen** (see [`operational-expansion-phase1-architecture-rfc.md`](operational-expansion-phase1-architecture-rfc.md)). This document eliminates architectural decision-making during implementation; Cursor executes it exactly.
**Base verified:** `origin/staging` @ `eb189503209d6d14920a71d16d7e451db2d1af1f` (2026-07-10). Every file, table, column, trigger, and idempotency key below was read on this commit — not from memory.
**Scope:** **D2 (Operational Fact Contract)** + **D12a (Correction-Aware Consumption Contract)** ONLY. No D12b, no reactor, no Scheduling, no Attendance UI, no Posting, no Forecasting.

> **Determinism guarantee.** Every implementation choice that could go two ways is *decided here* (marked **[DECISION]**), always choosing the simpler option that fully satisfies the RFC. Cursor must not make architectural decisions. Where this spec says "verify," it means confirm-then-conform, not redesign.

### Determinism pass — four frozen decisions (read first)

These four were unresolved in the first draft and are now frozen against verified staging conventions. They govern Sections 5, 7, 10–14, 16.

- **DP-1 — Transaction boundary = one SECURITY DEFINER RPC.** The D12a draft reconciliation (correction event + obligation reparent/supersede + charge writes + prior-event retirement) executes in **one Postgres function `reconcile_consumption_correction`**, mirroring the house atomic-commit pattern (`execute_lead_status_mutation`, `agent_v*_commit_*_apply`). Interpretation and preview planning stay in TypeScript; the RPC performs all reconciliation writes all-or-nothing. **No sequential client writes, no compensation.** (Sections 5.8, 7.4, 11, 12.)
- **DP-2 — Charge retirement = in-place `draft → void`.** A superseded obligation's **draft** charge is retired by `UPDATE charges SET status='void', voided_at=now()` (the `void` status and `voided_at` column already exist; the immutability trigger already permits a draft→void in-place update, and blocks it for posted rows). **Never deleted** (preserves `charges` + `charge_line_items` lineage), never for a non-draft. Retirement reason/actor/superseding-event recorded in `charges.metadata.retirement`. **No `charges` migration.** (Sections 5.6, 12.)
- **DP-3 — Consumption-event idempotency key identifies the *current* fact.** The correction event key is anchored on the **correction fact's own `sourceEntityId`** (its `child_attendance_events.id`), never on `correctsFactId`. `correctsFactId` is lineage only. Two distinct corrections of the same prior fact therefore create distinct events; replay of one correction converges. (Sections 7.5, 7.6, 13.)
- **DP-4 — Same-key obligations reparent; chains resolve against the immediate prior; branches converge on `resolution_key`.** A corrected pass that reproduces a `resolution_key` **reparents** that obligation's `consumption_event_id` to the new correction event; absent keys are superseded; the immediate prior event is retired via `corrects_event_id`. Corrections resolve against the immediate corrected fact/event only (no chain scan); concurrent branches converge because obligation identity is the `(org_id, resolution_key)` unique constraint under `FOR UPDATE` locks. (Sections 7.4, 7.11, 13.)

---

## Section 1 — Purpose

Wave 1 establishes the **deterministic runtime contract** the entire operational expansion depends on, and nothing else.

- **Why it exists.** The consumption pipeline (`web/lib/operationalConsumption/*`) is built as a forward-only, upsert-idempotent preview/draft engine with **no correction, reversal, or supersession mechanics** (verified: `draftConsumption` iterates only the current pass; `OperationalFactDto` has no correction identity; no interpreter branches on corrections). The independent adversarial review proved that auto-invoking it on real fact writes would **over-bill or orphan a draft charge** whenever an operator records an attendance reversal or downward correction — the common operator path.
- **Architectural decisions fulfilled.** **D2** (a shared Operational Fact contract — invariants + interface + conformance test, not a base class) and **D12a** (make the correction/reversal path first-class in the fact→consumption contract). Both are RFC decisions marked as the blocking prerequisite of Implementation Wave 1.
- **What it enables (later waves, out of scope here).** D12b (wiring a preview-first reactor from real facts), Attendance surfaces (Wave 2), Staffing facts (Wave 4, which must pass the D2 conformance test), and Posting (Wave 5). None of those may begin until this contract exists.

Wave 1 changes **no platform architecture**. It formalizes an existing pattern (the attendance append-only fact stream is the reference) and closes a correctness hole in an existing runtime.

---

## Section 2 — Scope

### In scope
1. **D2 — Operational Fact Contract**: a domain-neutral TypeScript contract (interface + descriptor + emitted-event envelope contract) and a **reusable conformance test harness**, with `child_attendance_events` retrofitted as the asserted reference conformer. **No behavior change to attendance; no attendance migration.**
2. **D12a — Correction-Aware Consumption Contract**:
   - Correction identity on `OperationalFactDto` (`entryType`, `correctsFactId`).
   - Correction/reversal branches in `interpretAttendance` and `interpretSchedule`.
   - Draft-obligation **supersession/void** in `draftConsumption` (and its preview delta in `previewConsumption`) when a corrected pass drops or reduces a directive.
   - Two additive nullable lineage columns (`consumption_events.corrects_event_id`, `resolved_obligations.superseded_by_event_id`).
   - A pure `event_kind → AttendanceFactType` translation function (authored, unit-tested; **not wired**).
   - The **strengthened D2 conformance assertions** applied to the consumption fact DTO (consumer-facing completeness).
   - Full unit/correction/reversal/supersession/replay/idempotency test coverage, exercised through the existing `/consumption/simulate` service path.

### Out of scope (see Section 15 for the exhaustive non-goal list)
D12b (the event reactor / any wiring from real fact writes to consumption), Attendance/Scheduling/Billing UI, Posting/invoices/AR/payments/GL, Forecasting, any new Business Process, any new module, obligation-review actions emitting workflow events (a D9 item, later), and any change to `child_attendance_events`.

---

## Section 3 — Existing Platform Inventory (nothing here is recreated)

**Tables (verified DDL).**
- `child_attendance_events` — append-only fact reference (`20260629120000_childcare_attendance_facts_p2.sql`). `entry_type ∈ {original,correction,reversal}`, self-FK `corrects_event_id`, CHECKs `entry_link_shape` + `no_self_reference`, `BEFORE UPDATE OR DELETE` trigger `prevent_child_attendance_events_mutation` (blocks all roles), consistency trigger, **no `updated_at`**.
- `consumption_events` — mutable (`set_updated_at`), status `{recorded,resolved,no_obligation,superseded}`, unique `(org_id, idempotency_key)`. **No corrects/self-FK today.**
- `resolved_obligations` — mutable, status `{previewed,drafted,no_charge,superseded}`, `review_status {pending,review_required,reviewed,suppressed,stale}`, unique-partial `(org_id, resolution_key)`, FK `consumption_event_id → consumption_events ON DELETE CASCADE`, FK `draft_charge_id → charges`. **No supersede-link column today.**
- `consumption_event_types` — registry, global (`org_id NULL`) + org rows; seeded schedule + attendance event keys.

**Runtime / services (verified signatures).**
- `web/lib/operationalConsumption/consumptionService.ts` — `previewConsumption(supabase, orgId, fact, today)`, `draftConsumption(supabase, orgId, fact, today, actorUserId=null)`; private `resolveDirective`, `upsertConsumptionEvent` (find-by-`(org_id,idempotency_key)`→update-else-insert), `upsertObligation` (find-by-`(org_id,resolution_key)`→update-else-insert).
- `resolveConsumption.ts` — pure `resolveConsumption`, `deriveConsumptionIdempotencyKey`.
- `attendanceInterpretation.ts` — pure `interpretAttendance(fact)`, `minutesBetween`.
- `scheduleInterpretation.ts` — pure `interpretSchedule(fact)`, `weekdaysToScheduleBasis`, `prorateAmountCents`.
- `obligationReviewService.ts` — `recomputeObligation` (replays preview from `context.fact_snapshot`; sets `review_status='stale'` on drift), `reviewObligation` (mark_reviewed/flag/suppress/restore/recompute — **no workflow events emitted**).
- `web/lib/childcareOperational/attendance/attendanceService.ts` — `recordAttendanceEvent` (original), `correctAttendanceEvent` (correction+reversal; reversal terminal — "Cannot correct or reverse a reversal"); `attendanceEvents.ts` — `emitAttendanceEvent` (emits `attendance_event_recorded|_corrected|_reversed`, payload carries `entry_type`, `corrects_event_id`, `schema_version`).
- `web/lib/emitEvent.ts` — `emitEvent` → `workflow_events`.
- `web/lib/financials/childcareChargeService.ts` — draft charge lifecycle (create/recalc/post/reverse); `web/lib/financials/chargeLifecycle/*` (`writeTemplateDraftCharge`, `previewTemplateCharge`, resolver key `tpl:<key>:<occurs_on>:<scope>`).

**Events.** `attendance_event_recorded|_corrected|_reversed` (`ATTENDANCE_EVENT_SCHEMA_VERSION=1`), enrollment/operational events (`operationalEnrollmentEvents.ts`). Consumption writes **no** workflow events.

**DTOs / vocabularies.** `OperationalFactDto`, `ConsumptionEventIntent/Row`, `ResolvedObligationIntent/Row`, `ObligationKind`, `AttendanceFactType` (15), `ScheduleChangeKind`, `buildFactSnapshot` (`consumptionTypes.ts`); review types (`obligationReviewTypes.ts`); attendance vocab `AttendanceEntryType/EventKind/ActorType/SourceType` (`attendanceVocabulary.ts`).

**Calculations.** OIP + Operational Calculations registry (untouched in Wave 1).

**Commands.** Operational Command Runtime + Command Surface (untouched in Wave 1).

**Tests.** `web/tests/operationalConsumption/*` (consumptionService, attendanceInterpretation, scheduleInterpretation, resolveConsumption, obligationReviewService, attendanceConsumptionService, scheduleConsumptionService, consumptionSimulateRoute, obligationsRoute, operationalConsumptionConvergence); `web/tests/childcareOperational/attendance/*`; `web/tests/childcareOperational/effectiveDating.test.ts`.

**Doctrine.** RFC + operational-truth-flow, operational-consumption-platform, attendance-system, billing-financials-platform, platform-event-catalog, actions-and-workflows, current-work-surface. Wave 1 references these; doctrine edits are the §7.4 reconciliations (separate).

**Nothing in this inventory is recreated.** D2 wraps the attendance pattern; D12a extends the consumption runtime in place.

---

## Section 4 — Architecture Constraints (Cursor must obey; restated verbatim intent)

1. **No universal facts table.** Per-domain authoritative fact stores only. Do not create `operational_facts`. (D3)
2. **Events are not authoritative facts.** `workflow_events` communicates fact lifecycle; it is never the fact store. Do not read billing-relevant authoritative detail from an event payload; read it from the domain fact store. (D3)
3. **Facts are immutable, append-only, corrected-by-reference.** Never mutate `child_attendance_events`; never weaken its trigger. (D2, truth-flow Law 4)
4. **Consumers never compute.** No business logic added to Work Units / Focus Panels / Surface Builder in this wave (none is touched). (D10)
5. **Current Work is not generated from raw variance.** Wave 1 creates no Current Work and no attention rules. (D7)
6. **AI never authors truth.** No BOS/AI changes. (D11)
7. **Consumption is recomputable and non-authoritative; Posting is the only authoritative money write and is out of scope.** Draft charges only; never post; never mutate a posted charge. Superseding a draft obligation may void its **draft** charge, never a posted one. (D5, consumption doctrine)
8. **Pricing is delegated, never reimplemented.** Correction handling reuses the existing Rate/Charge Template resolvers; it introduces no pricing. (billing doctrine)
9. **Single mutation path for facts; consumption emits no new workflow events in this wave.** (D9 event-emitting review actions are a later wave.)
10. **No job-vertical regression.** The two additive columns are on childcare-consumption tables only; job billing schema/RLS/flows are untouched. (billing P3.1 gate hard rule)
11. **Effective-dated / corrects-by-reference provenance is mandatory for supersession.** A superseded obligation must record *what* superseded it (a link, not just a status). (D2/D3 provenance)

---

## Section 5 — Required Runtime Changes

### 5.1 `OperationalFactDto` gains correction identity
- **Purpose:** carry the correction/reversal lineage the interpreters and supersession need.
- **Owner:** `web/lib/operationalConsumption/consumptionTypes.ts`.
- **Inputs/Outputs:** additive optional fields `entryType?: OperationalFactEntryType` (`'original'|'correction'|'reversal'`, default `'original'`) and `correctsFactId?: string | null` (the prior **fact** id being corrected/reversed — for attendance, the prior `child_attendance_events.id`).
- **Dependencies:** the shared `OperationalFactEntryType` from the D2 contract module (Section 6). **[DECISION]** Field named `correctsFactId` (the corrected *fact* id), not `correctsEventId` — the DTO is a fact DTO; mapping to the prior *consumption* event happens in the service. `entryType` mirrors the attendance vocabulary exactly.
- **Consumers:** interpreters, `resolveConsumption`, `consumptionService`.
- **Failure modes:** `entryType ∈ {correction,reversal}` with `correctsFactId` null → the service treats the fact as `original` and records a `context.correction_lineage_missing` reason (never throws; never silently supersedes).

### 5.2 Interpreters gain correction/reversal branches
- **Purpose:** deterministically map a corrected/reversed fact to the *corrected* directive set.
- **Owner:** `attendanceInterpretation.ts`, `scheduleInterpretation.ts`.
- **Behavior [DECISION]:**
  - `entryType === 'reversal'` → **zero positive directives**; return `discardReason`/`noImpact` = `"reversal of prior fact — obligations reconciled by supersession"`. A reversal never produces a new charge; it only causes the prior obligation to be superseded (Section 7).
  - `entryType === 'correction'` → interpret the **corrected values** exactly as an original would (same switch), producing the corrected directive set. The reconciliation step (Section 7) retires prior obligations that the corrected set no longer contains.
  - `entryType === 'original'` (default) → unchanged behavior.
- **Inputs/Outputs:** unchanged signatures `interpret*(fact: OperationalFactDto)`; the branch reads `fact.entryType`.
- **Failure modes:** none new; the branch is a pure switch prefix.

### 5.3 `previewConsumption` computes the supersession delta
- **Purpose:** report, without writing, which prior obligations a correction/reversal would retire — so D12b's preview-first wiring (later) can display it and tests can assert it.
- **Owner:** `consumptionService.ts`.
- **Inputs/Outputs:** for a fact with `entryType ∈ {correction,reversal}` and resolvable `correctsFactId`, the `ConsumptionPreviewResult` gains `supersession: { priorConsumptionEventId: string | null; supersededObligations: { id: string; resolutionKey: string | null; obligationKind: string | null; priorAmountCents: number | null }[] }`. For originals, `supersession` is `null`.
- **Dependencies:** a read of the prior consumption event by `(org_id, source_family, source_entity_id = correctsFactId)` and its obligations.
- **Consumers:** tests now; D12b later. **Writes nothing.**

### 5.4 `draftConsumption` reconciles (reparents/supersedes/voids) prior obligations — atomically via the RPC
- **Purpose:** close the over-bill / orphaned-draft hole.
- **Owner:** `consumptionService.ts` **plans** the reconciliation (TS); the writes execute in the `reconcile_consumption_correction` RPC (Section 5.8) so they are **all-or-nothing** (DP-1). Full algorithm in Section 7.4.
- **Inputs:** the corrected fact + `today` + `actorUserId`.
- **Behavior [DECISION]:** for `entryType='original'`, `draftConsumption` is **unchanged** (existing sequential single-obligation TS path — out of scope). For `entryType ∈ {correction,reversal}` with a resolvable prior event, it builds the pre-resolved plan in TS, then calls the RPC once.
- **Outputs:** `ConsumptionDraftResult` gains `superseded: { obligationIds: string[]; voidedDraftChargeIds: string[]; reparentedObligationIds: string[]; priorConsumptionEventId: string | null }`.
- **Dependencies:** the two new lineage columns + the RPC (Section 12); the in-RPC draft-charge retirement (Section 5.6).
- **Failure modes:** prior event not found (checked in TS preview) → no supersession, record `no_prior_consumption_event`, proceed as the original path. RPC raises a sentinel → whole transaction rolls back (no partial state). Idempotent on replay (Section 7.6).

### 5.5 Pure `event_kind → AttendanceFactType` translation (authored, not wired)
- **Purpose:** satisfy the RFC D12a requirement to "define the `event_kind → AttendanceFactType` translation explicitly." D12b will consume it; Wave 1 only authors + tests it.
- **Owner:** new `web/lib/operationalConsumption/attendanceFactTranslation.ts`.
- **Signature [DECISION]:** `deriveAttendanceFactType(input: { eventKind: AttendanceEventKind; checkOutTime?: string|null; lateThresholdTime?: string|null; hours?: number|null; vacationEligible?: boolean|null; unexpected?: boolean|null }): AttendanceFactType | null`. It is **context-sensitive** (a `check_out` maps to `late_pickup` / `early_pickup` / on-time-null by time), because the 6 `event_kind`s do not map 1:1 to the 15 `AttendanceFactType`s. Returns `null` when the raw kind carries no commercial candidate (e.g. `room_transfer`).
- **Consumers:** none in Wave 1 (explicitly unwired). Unit-tested exhaustively.
- **Failure modes:** malformed times → `null`, never throws.

### 5.6 Draft-charge retirement for superseded obligations — exact behavior (DP-2)
- **Purpose:** avoid the orphaned-draft-charge failure when supersession removes an obligation that had a draft charge.
- **Owner:** the retirement **write happens inside the `reconcile_consumption_correction` RPC** (Section 5.8), for atomicity with the obligation supersession. `childcareChargeService.ts` gains a thin **planning** helper (`buildDraftChargeRetirementIntent`) that the TS planner uses; the DB write is the RPC's guarded `UPDATE`.
- **Exact operation [DECISION]:** `UPDATE charges SET status='void', voided_at=now(), metadata = metadata || jsonb_build_object('retirement', jsonb_build_object('reason','obligation_superseded','actor_user_id', p_actor_user_id, 'superseded_by_consumption_event_id', <new event id>, 'retired_at', now())) WHERE id = <draft_charge_id> AND org_id = p_org_id AND billable_source_type='enrollment_agreement' AND status='draft'`.
- **Why this exact form (verified):** `charges.status` already permits `void`; `voided_at` already exists; the `enforce_childcare_charge_immutability` trigger's guard body runs **only** for `status <> 'draft'`, so a `draft → void` in-place update passes and a `posted → void` in-place update is blocked. The `AND status='draft'` predicate is the guard: a non-draft/posted target updates **0 rows** (safe no-op), never an error. **Never `DELETE`** (preserves the `charges` row + `charge_line_items` cascade + `source_charge_id` lineage). The superseded obligation keeps its `draft_charge_id` link (pointing at the now-void charge) for audit; it is not nulled.
- **No `charges` migration [DECISION]:** reason/actor/superseding-event live in the existing `metadata` jsonb; `voided_at` is a first-class column. Adding `void_reason`/`voided_by`/`superseded_by` columns to the shared `charges` table is a broader, job-vertical-touching change the no-regression rule discourages and the RFC does not require. (Note: `charges` has **no `updated_by` column** — the RPC must not write one.)
- **Consumers:** the RPC's supersession pass.
- **Replay:** retiring an already-`void` charge updates 0 rows (the `status='draft'` predicate) — idempotent.

### 5.7 Simulate route carries correction identity (verify-only)
- **Purpose:** let existing tests/operators exercise correction/reversal facts through the only current entry point.
- **Owner:** `web/app/api/admin/financial/consumption/simulate/route.ts`.
- **Behavior [DECISION]:** ensure the route forwards `entryType` and `correctsFactId` into the constructed `OperationalFactDto`. If the route whitelists DTO fields, extend the whitelist; if it passes the body through, no change. No new endpoint. Still role-gated, still preview|draft only.

### 5.8 The reconciliation RPC — `reconcile_consumption_correction` (DP-1)
- **Purpose:** execute all correction/reversal reconciliation writes in **one transaction** (all-or-nothing). This is the first atomic-RPC on the consumption/financials surface (verified: those paths use sequential client writes today); it mirrors the house pattern exactly (`execute_lead_status_mutation`, `agent_v*_commit_*_apply`).
- **Owner (SQL):** `reconcile_consumption_correction` — `language plpgsql`, **`SECURITY DEFINER`, `SET search_path = public`**, `REVOKE ALL … FROM public; GRANT EXECUTE … TO service_role`, plus a `COMMENT ON FUNCTION` documenting "execute only from service_role." Created in the Wave 1 migration (Section 12).
- **Signature [DECISION]:** `reconcile_consumption_correction(p_org_id uuid, p_actor_user_id uuid, p_plan jsonb) RETURNS jsonb`. Discrete scalars for identity/actor (house style); one `p_plan` jsonb for the genuinely variadic, pre-resolved reconciliation plan (house style uses jsonb only for free-form blobs — `p_context_payload`, `p_config`, `p_intent_json`; the plan qualifies).
- **`p_plan` shape (all amounts/keys/templates pre-resolved in TS — the RPC does no pricing):**
  - `correction_event`: `{ idempotency_key, event_key, source_family, source_entity_type, source_entity_id (=correction fact id), subject_type, subject_id, location_id, occurs_on, effective_on, status, context }`.
  - `prior_fact_id`: the `correctsFactId` (used to locate the prior event under lock).
  - `new_obligations[]`: `{ resolution_key, obligation_kind, charge_template_id, service_id, amount_cents, currency_code, responsibility_key, occurs_on, billable_on, period_start, period_end, review_required, explanation, charge_op }` where `charge_op ∈ {none, create, recalc}` with the pre-resolved charge fields when create/recalc.
  - `retire_charge_ids[]`: draft charge ids to retire (orphan obligations' charges).
- **Authorization model [DECISION]:** service_role-only grant (called from the server after the route's `requireAdminOrOps`); **no in-function `has_org_role`** (house convention); tenant isolation by threading `p_org_id` into every `WHERE`/`INSERT`. As `SECURITY DEFINER` it writes past RLS, exactly like the mutation/agent RPCs.
- **Transaction behavior:** one function call = one transaction. Steps (all inside the body):
  1. `SELECT … FOR UPDATE` the prior consumption event (by `org_id, source_family, source_entity_id = prior_fact_id`) **and** its `resolved_obligations`. If the prior event is gone → `RAISE EXCEPTION 'reconcile_consumption:no_prior_event'`.
  2. Upsert `correction_event` by `(org_id, idempotency_key)` → event id `E1`, set `corrects_event_id = priorEvent.id`.
  3. For each `new_obligations[]`: upsert by `(org_id, resolution_key)`, set `consumption_event_id = E1` (**reparent**, DP-4), set fields; if `amount_cents`/`billable_on` changed set `review_status='stale'`; apply `charge_op` (`create` → INSERT draft charge + link `draft_charge_id`; `recalc` → UPDATE the linked draft charge amount/dates; `none` → no charge).
  4. Supersede orphans: prior obligations whose `resolution_key ∉ new_obligations.resolution_key` → `status='superseded'`, `superseded_by_event_id = E1`, `review_status='stale'`.
  5. Retire `retire_charge_ids[]` via the DP-2 guarded `UPDATE … status='void'` (draft-only predicate).
  6. `priorEvent.status='superseded'`.
- **Locking/concurrency behavior:** the `FOR UPDATE` on the prior event + its obligations serializes concurrent corrections of the same lineage; combined with the `(org_id, resolution_key)` unique index, concurrent branches **converge** on the same obligation rows (DP-4) — no duplicates, deterministic last-committed ownership.
- **Replay behavior:** the `correction_event` idempotency key (DP-3) makes step 2 an in-place update on replay; steps 3–6 are idempotent (reparent to the same `E1`; supersede already-superseded = same values; retire already-`void` = 0 rows).
- **Failure result:** any `RAISE EXCEPTION 'reconcile_consumption:<reason>'` (plain text sentinel, no custom ERRCODE — house style) rolls back the whole transaction. Return on success: `jsonb_build_object('ok', true, 'consumption_event_id', E1, 'reparented_obligation_ids', …, 'superseded_obligation_ids', …, 'retired_charge_ids', …, 'created_charge_ids', …)`.
- **TS wrapper [DECISION]:** new `web/lib/operationalConsumption/reconcileConsumptionCorrectionAtomicCommit.ts` (the `*AtomicCommit.ts` house convention) calling `supabase.rpc('reconcile_consumption_correction', { p_org_id, p_actor_user_id, p_plan })`, destructuring `{ data, error }`, string-matching `reconcile_consumption:` sentinels to typed results. `draftConsumption` calls this wrapper for correction/reversal facts.
- **Migration impact:** the function is created in the same Wave 1 migration as the two lineage columns (Section 12).

---

## Section 6 — Operational Fact Contract (D2)

The contract is a **domain-neutral specification + interface + conformance test**, authored in a new `web/lib/operationalFacts/` module. It is **not** a base class and **not** a shared table (frozen). `child_attendance_events` + `attendanceService` + `attendanceEvents` are the asserted reference conformer, with **no behavior change**.

**[DECISION] No migration for D2.** The contract requires `schema_version` on the **emitted event envelope** (attendance has it: `ATTENDANCE_EVENT_SCHEMA_VERSION`). A per-fact-table `schema_version` column is **recommended for new fact streams** (Wave 4 staff presence) but **not retrofitted** onto `child_attendance_events` in Wave 1 — the RFC says "recommended," and touching the append-only reference migration is the riskier option. The conformance test asserts event-envelope `schema_version`, and flags (warning, not failure) any conforming table lacking a `schema_version` column.

The contract defines, for any Operational Fact stream, these required properties. Each row states the invariant and how the attendance reference satisfies it.

| Property | Contract requirement | Attendance reference (evidence) |
|---|---|---|
| **Identity** | A UUID PK; a fact is uniquely identified. | `child_attendance_events.id` |
| **Subject** | A durable business subject reference (not the fact-row id). | `customer_member_id` (the child) |
| **Organization** | `org_id NOT NULL`, org-scoped RLS. | `org_id` + `..._select_org` / `..._insert_crm` policies |
| **Source** | Actor + source-channel provenance. | `actor_type`, `actor_user_id/person_id`, `source_type`, `source_key` |
| **Effective time** | The business time the fact takes effect (org-local day where relevant). | `service_date` (org-local via `resolveServiceDate`), `event_at` |
| **Recorded time** | Append time, immutable. | `created_at`, `created_by` (no `updated_at`) |
| **Author** | Who recorded it. | `created_by` / `actor_*` |
| **Correction** | `entry_type ∈ {original,correction,reversal}`; a correction/reversal is a **new row** referencing the prior by id; the original is never mutated. | `entry_type` + `corrects_event_id` self-FK; `correctAttendanceEvent` writes a new row |
| **Supersession** | Corrections/reversals supersede by reference; never edit-in-place. | `corrects_event_id`; append-only trigger forbids UPDATE/DELETE |
| **Reversal** | A reversal voids its target and is **terminal** (cannot be corrected/reversed). | Guard: `"Cannot correct or reverse a reversal event"` |
| **Schema version** | The emitted event payload carries a `schema_version`; payload shape is versioned. | `ATTENDANCE_EVENT_SCHEMA_VERSION = 1` in every payload |
| **Correlation** | The emitted event may carry a `correlation_id` grouping related facts. | `attendancePayload` threads `ctx.correlationId` |
| **Causation** | The emitted event may carry a causing reference (optional). | `corrects_event_id` in payload (causal link); free for others |
| **Security** | Server-side writes, role-gated; no client write path. | RLS INSERT `owner/admin/ops`; append-only trigger; service-layer only |
| **Visibility** | Org-scoped SELECT for authorized roles. | `..._select_org` policy |
| **Events emitted** | Every recorded/corrected/reversed fact emits a **distinct** event type via `emitEvent`; the payload carries subject, entry_type, corrects reference, effective time, schema_version. | `attendance_event_recorded|_corrected|_reversed` |
| **Conformance requirements** | The stream must pass the harness (Section 6.2). | Reference conformer |

### 6.1 Deliverables (D2)
- `web/lib/operationalFacts/factContract.ts` (NEW) — exports:
  - `OperationalFactEntryType = 'original' | 'correction' | 'reversal'` (the single shared union; the consumption DTO and attendance vocab both align to it).
  - `interface OperationalFactStreamDescriptor` — declarative descriptor a domain supplies: `{ tableName, subjectColumn, orgColumn, entryTypeColumn, correctsColumn, effectiveTimeColumn, recordedTimeColumn, appendOnly: true, emittedEventTypes: { original; correction; reversal }, eventPayloadRequiredKeys: string[], schemaVersionSource: 'event' | 'column' }`.
  - `interface OperationalFactEventEnvelope` — the required emitted-event shape (`org_id, event_type, entity_type, entity_id, action_type, payload{ schema_version, entry_type, corrects_event_id, subject ref, service/effective date }`).
- `web/lib/operationalFacts/factConformance.ts` (NEW) — `assertFactStreamConforms(descriptor, probes)` returning structured pass/fail per property; asserts append-only (a probe UPDATE must reject), entry-type vocabulary, corrects self-FK + `no_self_reference`, distinct event types, and **consumer-facing event-payload completeness** (the strengthened D2 requirement).
- `web/lib/childcareOperational/attendance/attendanceFactDescriptor.ts` (NEW) — the attendance descriptor instance.

### 6.2 Conformance test (the enforcement, non-optional at freeze)
`web/tests/operationalFacts/attendanceFactConformance.test.ts` (NEW) asserts the attendance descriptor conforms on **both** halves:
- **Storage half:** append-only (UPDATE/DELETE reject), `entry_type` vocab + link-shape CHECKs, `corrects_event_id` self-FK + no-self-ref, org-scoped RLS, no `updated_at`.
- **Consumer-facing half:** each of `recorded|corrected|reversed` emits its distinct event type; payload contains `schema_version`, `entry_type`, `corrects_event_id`, subject (`customer_member_id`), `service_date`/`event_at`, `org_id`.

The harness is reusable: Wave 4 staff-presence must add its descriptor + a one-line conformance test.

---

## Section 7 — Consumption Contract (D12a)

### 7.1 Fact DTO
`OperationalFactDto` gains `entryType?: OperationalFactEntryType` (default `'original'`) and `correctsFactId?: string | null`. All other fields unchanged. The consumption-specific fields it already carries (`attendanceFactType`, `checkOutTime`, `lateThresholdTime`, `hours`, `vacationEligible`, schedule fields) are unchanged — **the DTO already carries them; do not add them.**

**[DECISION] Consumer payload source (ties to D3):** the DTO's consumption fields are populated by the *caller* (today: the simulate route/tests; later: D12b's reactor by re-fetching the authoritative attendance row). Wave 1 does **not** fatten the `workflow_events` payload with billing fields — events communicate lifecycle; authoritative detail lives in the fact store. `attendanceFactTranslation.ts` (Section 5.5) is the pure function the future reactor uses to derive `attendanceFactType`; it is authored and tested but unwired.

### 7.2 Interpreter contract
`interpret*(fact)` unchanged signatures; branch on `fact.entryType` per Section 5.2. Reversal → empty directives + reason. Correction → interpret corrected values. Purity preserved (no IO).

### 7.3 Consumer contract
`previewConsumption` / `draftConsumption` signatures unchanged. Return shapes gain `supersession` (preview) / `superseded` (draft) per Section 5.3–5.4. No new public entry points.

### 7.4 Supersession rules — the deterministic reconciliation algorithm (DP-1, DP-4)
For a fact with `entryType ∈ {correction, reversal}`, `draftConsumption` runs a **TS planning phase** then **one atomic RPC** (Section 5.8). The planning phase is pure/read; the RPC does all writes.

**TS planning (read-only):**
1. **Corrected interpretation** → `newObligations` (each with `resolutionKey` + pre-resolved amount/charge intent). Reversal ⇒ `newObligations = ∅`.
2. **Locate prior consumption event** by `(org_id, source_family, source_entity_id = correctsFactId)`. If none → **do not call the RPC**; route to the normal `original` path, stamp `context.correction_lineage = { corrects_fact_id, resolved: false }`.
3. Build the plan: the correction event fields (idempotency key per DP-3), the `new_obligations[]` (with `charge_op` create/recalc/none), and `retire_charge_ids[]` = the draft charge ids of prior obligations whose `resolution_key` is absent from `newObligations`.

**RPC (atomic — Section 5.8 steps):** under `FOR UPDATE` on the prior event + its obligations:
1. Upsert the **correction's own consumption event** → `E1`, `corrects_event_id = priorEvent.id`, `status = newObligations.length ? 'resolved' : 'no_obligation'`.
2. **Reparent + upsert** each `newObligations` by `(org_id, resolution_key)`: `consumption_event_id ← E1`; `review_status='stale'` when `amount_cents`/`billable_on` changed; apply `charge_op`.
3. **Supersede orphans** (prior obligations whose `resolution_key ∉ newObligations`): `status='superseded'`, `superseded_by_event_id = E1`, `review_status='stale'`; retire their draft charges (DP-2).
4. **Retire the prior event:** `priorEvent.status='superseded'`.

**[DECISION] Lineage anchor:** prior obligations are found via the prior *consumption event* (located by `source_entity_id = correctsFactId`), never by agreement/date scans — exact, and it avoids retiring unrelated obligations. `correctsFactId` is the prior **fact** id, which equals the prior consumption event's `source_entity_id` (verified). **[DECISION] Reparenting (DP-4):** surviving same-key obligations move to `E1` so the live obligation always points at the live (head) event; superseded orphans keep their original `consumption_event_id` and gain `superseded_by_event_id = E1`. Full audit lineage is preserved through `consumption_events.corrects_event_id`.

### 7.5 Idempotency rules (DP-3 — key identifies the *current* fact)
- **Consumption event:** unchanged `(org_id, idempotency_key)` uniqueness. **The correction/reversal event key is anchored on the correction fact's OWN `sourceEntityId`** (its `child_attendance_events.id`) — **not** on `correctsFactId`. Exact form: `cev:attendance:<factType>:<agreement>:<anchorDate>:fact:<sourceEntityId>` (and analogously `cev:schedule:<changeKind>:<agreement>:<occursOn>:fact:<sourceEntityId>`). `correctsFactId` is lineage only (carried in `context` + `corrects_event_id`), **never in the key**. This guarantees: (a) two distinct correction facts targeting the *same* prior fact get **distinct** events (their `sourceEntityId` differ); (b) replay of the *same* correction fact converges (same `sourceEntityId`).
  - **Originals unchanged:** originals keep their existing per-day keys verbatim (`cev:attendance:<factType>:<agreement>:<anchorDate>`, `cev:schedule:<changeKind>:<agreement>:<occursOn>`, generic `cev:<eventKey>:<sourceEntityType>:<sourceEntityId>:<occursOn>`). The `:fact:<sourceEntityId>` suffix applies **only** to `entryType ∈ {correction,reversal}`.
- **Obligation:** unchanged `(org_id, resolution_key)`. Draftable = delegated `tpl:<key>:<occurs_on>:<scope>`; non-draftable = `cons:<kind>:<anchorDate>:<agreement|sourceEntityId>`. Obligation identity is **deliberately** keyed on the business coordinates (agreement/date/kind), not on the fact id — this is what makes competing correction branches converge on one obligation (DP-4).

### 7.6 Replay rules
Re-delivering the same correction/reversal fact: the RPC finds the existing correction event by its fact-anchored idempotency key (DP-3) and updates in place; reparent/supersede/retire are idempotent (reparent to the same `E1`; superseding an already-`superseded` obligation writes the same `superseded_by_event_id`; retiring an already-`void` draft updates 0 rows via the `status='draft'` predicate). **No duplicate events, no duplicate obligations, no double-void.** This is the concrete expression of the RFC D7 "initiating event replays → no duplicate" rule at the consumption layer.

### 7.7 Correction rules (reparent / supersede — the decision matrix)
| Corrected pass vs prior | Mechanism |
|---|---|
| Same `resolution_key`, same amount | upsert reparents to `E1` (no-op amount); `review_status` unchanged |
| Same `resolution_key`, changed amount (e.g. later checkout still late, different fee) | upsert reparents to `E1` + recalc draft charge + `review_status='stale'` |
| `resolution_key` absent (date changed, or fee eliminated by earlier checkout) | supersede prior obligation (7.4) + retire its draft charge to `void` (DP-2) |
| Reversal (voids target) | all prior obligations superseded; their drafts retired; no new obligation |

### 7.8 Preview rules
`previewConsumption` computes steps 1–2 and the step-5 orphan set; **writes nothing**; returns `supersession`. It never voids a charge.

### 7.9 Draft rules
`draftConsumption` (for corrections/reversals) performs all writes through the atomic RPC. It **never posts**, never writes ledger/invoice/payment, never mutates a posted charge, and only retires (`draft → void`, DP-2) the **draft** charges of superseded obligations.

### 7.10 Failure rules
- `entryType ∈ {correction,reversal}` + null `correctsFactId` → treat as original; stamp `context.correction_lineage_missing`; never supersede.
- Prior event not found (TS preview) → proceed as original; stamp `no_prior_consumption_event`. Prior event vanished under lock (race) → RPC raises `reconcile_consumption:no_prior_event`; transaction rolls back; the caller retries or surfaces the sentinel.
- Charge retirement on a posted/non-draft charge → the `status='draft'` predicate updates **0 rows** (safe no-op); a posted charge is never mutated.
- Any interpreter/resolver error in TS planning → the existing `no_charge`/reason path; the RPC is not called, so nothing is written. Any error inside the RPC → the **whole transaction rolls back** (all-or-nothing); **no partial supersession, reparent, retire, or event-retirement is ever committed.**

### 7.11 Correction chains and branching (DP-4)
- **Chains are linear per event and resolved against the *immediate* prior.** A correction-of-a-correction (`C2` corrects `C1`'s fact) sets `C2.correctsFactId = C1`'s fact id; the RPC locates `C1`'s consumption event (`E1`) by `source_entity_id = C1`'s fact id and reconciles against `E1`'s **currently-live** obligations. The RPC never walks the whole chain; history is reconstructable by following `corrects_event_id` backwards (`E2 → E1 → E0`).
- **Reversal of a correction retires the currently-surviving obligation.** A reversal `R` correcting `C1`'s fact → `newObligations = ∅` → the obligation currently owned by `E1` is superseded and its draft retired; `E1` is retired; `E2(=R)` becomes head with no obligation.
- **Branching is permitted at the fact layer but converges at the consumption layer.** The fact layer allows two corrections of the same original (only a *reversal* is terminal — "cannot correct or reverse a reversal"). Two such corrections create **distinct** correction events (DP-3), but because obligation identity is the `(org_id, resolution_key)` **unique** index and the RPC takes `FOR UPDATE` locks on the prior event + obligations, the two reconciliations **serialize** and **converge** on the same obligation rows: no duplicate obligation, no double draft charge; the obligation's `consumption_event_id` ends up owned by the last-committed correction event; each correction idempotently re-supersedes/retires as needed. **No competing-branch divergence, no double-charge.**
- **[DECISION] No branch-merge logic and no chain-scan.** Convergence is a *consequence* of the unique constraint + row locks, not bespoke code. This is the simplest mechanism that fully satisfies "handle competing branches."

---

## Section 8 — Event Contract

- **Produced events (Wave 1):** **none new.** Consumption emits no workflow events today and continues not to (adding consumption event emission is a later, D9-scoped wave). Attendance continues to emit `attendance_event_recorded|_corrected|_reversed` unchanged.
- **Consumed events (Wave 1):** **none.** No reactor is wired (D12b is out of scope). The consumption pipeline is still invoked only via the `/consumption/simulate` service path.
- **Ordering:** N/A at runtime in this wave (no subscriber). The D2 contract *specifies* that a fact stream emits a distinct event per entry type so that a future reactor can order by `occurred_at` and branch on `entry_type` — this is documented, not wired.
- **Delivery guarantees:** N/A (no consumer). The contract records the future expectation (at-least-once; subscribers idempotent on the fact/consumption idempotency key).
- **Versioning:** emitted-event payloads carry `schema_version`; a payload shape change bumps it. Wave 1 changes no attendance payload, so `schema_version` stays `1`.
- **Replay expectations:** documented in the contract (a replayed fact event must, once a reactor exists, converge via the idempotency keys in Section 7.5). Verified in Wave 1 only at the service level (Section 13 replay tests).

---

## Section 9 — Data Ownership

| Concern | Owner (authoritative store) | Mutability |
|---|---|---|
| **Facts** | Domain fact store — attendance = `child_attendance_events` | Immutable, append-only, corrected-by-reference |
| **Events** | `workflow_events` | Append-only communication log; **not** authoritative fact/consequence truth |
| **Consequences (draft)** | `charges` (`status='draft'`, `billable_source_type='enrollment_agreement'`) | Recomputable pre-boundary; a superseded obligation's draft may be voided; posted charges are never touched |
| **Drafts (obligations)** | `resolved_obligations` | Mutable pre-posting; retired via `status='superseded'` + `superseded_by_event_id` |
| **Resolution records** | `consumption_events` | Mutable; retired via `status='superseded'` + `corrects_event_id` |
| **Read models** | None owned/created in Wave 1 | — |
| **Snapshots** | `metric_snapshots` (untouched) | — |

The correction fact stream (attendance) owns the fact; the consumption layer owns the interpretation (`consumption_events`) and the draft consequence preview (`resolved_obligations` → draft `charges`). No ownership boundary moves in Wave 1.

---

## Section 10 — Implementation Dependency Graph (DAG, not a timeline)

```
D2.factContract.ts ──────────────┐
   │                             ├─▶ D2.factConformance.ts ──▶ attendanceFactDescriptor.ts ──▶ D2 conformance test
   │ (OperationalFactEntryType)  │
   ▼                             │
D12a.consumptionTypes.ts (entryType, correctsFactId, new return/row fields)
   │            │                │
   │            ▼                ▼
   │      migration: corrects_event_id + superseded_by_event_id (+ indexes/CHECK)
   │            │
   ▼            ▼
migration also defines ──▶ reconcile_consumption_correction RPC (plpgsql, security definer)
   │                              │
   ▼                              ▼
attendanceInterpretation.ts / scheduleInterpretation.ts (correction/reversal branches)
   │                              │
   ▼                              ▼
resolveConsumption.ts (carry correction identity)   reconcileConsumptionCorrectionAtomicCommit.ts (TS wrapper → supabase.rpc)
   │                              │
   │   childcareChargeService.buildDraftChargeRetirementIntent (plan helper)
   ▼                              ▼
consumptionService.ts (previewConsumption delta [TS/read] + draftConsumption: plan in TS → call the RPC)  ◀── migration columns + RPC
   │
   ▼
simulate/route.ts (forward entryType/correctsFactId)
   │
   ▼
D12a tests (correction / reversal / supersession / two-distinct-corrections / chains / replay / atomicity / regression)

attendanceFactTranslation.ts (pure, unwired) ──▶ its own unit test   [independent leaf]
```
Roots: `factContract.ts` and the migration (columns **+** the `reconcile_consumption_correction` RPC). `attendanceFactTranslation.ts` is an independent leaf (no runtime dependents in Wave 1).

---

## Section 11 — Code Inventory (every file expected to change, and why; no code)

**New — D2**
- `web/lib/operationalFacts/factContract.ts` — the domain-neutral contract types + `OperationalFactEntryType`.
- `web/lib/operationalFacts/factConformance.ts` — reusable conformance harness.
- `web/lib/childcareOperational/attendance/attendanceFactDescriptor.ts` — attendance's descriptor (reference conformer).
- `web/tests/operationalFacts/attendanceFactConformance.test.ts` — asserts attendance conforms (storage + consumer-facing halves).

**New — D12a**
- `web/lib/operationalConsumption/attendanceFactTranslation.ts` — pure `deriveAttendanceFactType` (authored, unwired).
- `web/lib/operationalConsumption/reconcileConsumptionCorrectionAtomicCommit.ts` — TS wrapper calling `supabase.rpc('reconcile_consumption_correction', …)`, `{data,error}` destructure + `reconcile_consumption:` sentinel matching (DP-1, house `*AtomicCommit.ts` convention).
- `supabase/migrations/<ts>_consumption_correction_lineage_and_reconcile_rpc.sql` — two additive nullable columns + indexes + CHECK **and** the `reconcile_consumption_correction` plpgsql function + grants (Section 12).
- `web/tests/operationalConsumption/correctionConsumption.test.ts`, `reversalConsumption.test.ts`, `supersessionReplay.test.ts`, `twoDistinctCorrections.test.ts`, `correctionChains.test.ts`, `reconcileRpcAtomicity.test.ts`, `attendanceFactTranslation.test.ts` — new coverage (Section 13).

**Changed — D12a**
- `web/lib/operationalConsumption/consumptionTypes.ts` — add `entryType`/`correctsFactId` to `OperationalFactDto`; add `corrects_event_id` to `ConsumptionEventRow`/`ConsumptionEventIntent`; add `superseded_by_event_id` to `ResolvedObligationRow`/`ResolvedObligationReviewRow`; add `supersession` (preview) / `superseded` (draft, incl. `reparentedObligationIds`) result fields; add the RPC `p_plan` types. *Why:* mirror the new schema + carry correction identity + type the plan.
- `web/lib/operationalConsumption/attendanceInterpretation.ts` — correction/reversal branch. *Why:* Section 5.2.
- `web/lib/operationalConsumption/scheduleInterpretation.ts` — correction/reversal branch. *Why:* Section 5.2 (schedule replacement already emits proration_credit; add reversal awareness).
- `web/lib/operationalConsumption/resolveConsumption.ts` — thread `entryType`/`correctsFactId` into `ConsumptionEventIntent`; carry the fact-anchored idempotency key (DP-3) and `corrects` lineage in context. *Why:* the event must record what it corrects and key on the current fact.
- `web/lib/operationalConsumption/consumptionService.ts` — **plan** the reconciliation in TS (`previewConsumption` supersession delta [read-only]; `draftConsumption` builds the plan for corrections/reversals and calls the RPC wrapper; `original` path unchanged). *Why:* Section 7.4 — the fix, with writes moved into the RPC for atomicity (DP-1).
- `web/lib/financials/childcareChargeService.ts` — add `buildDraftChargeRetirementIntent` (a **planning** helper: given a draft charge id, produce the retirement intent for the plan). **No** TS write path voids charges (the RPC does). *Why:* keep charge-domain knowledge in its service while the write stays atomic in the RPC (DP-2).
- `web/app/api/admin/financial/consumption/simulate/route.ts` — forward `entryType`/`correctsFactId`. *Why:* exercise corrections through the only current entry point.
- `web/lib/operationalConsumption/obligationReviewService.ts` — **read-only awareness:** surface `status='superseded'` + `superseded_by_event_id` and treat superseded obligations as **not** posting-eligible. *Why:* a superseded obligation must not remain eligible; minimal filter/label change, no new actions.

**Unchanged but asserted (D2 reference):** `child_attendance_events` migration, `attendanceService.ts`, `attendanceEvents.ts`, `attendanceVocabulary.ts` — **must not change**; only asserted by the conformance test. **`charges` schema — no migration** (DP-2 uses existing `void`/`voided_at`/`metadata`).

---

## Section 12 — Database Impact

**One migration:** `supabase/migrations/<ts>_consumption_correction_lineage_and_reconcile_rpc.sql` (choose `<ts>` strictly greater than `20260709120000`, the latest consumption migration; e.g. `20260710120000`). It carries **both** the lineage columns **and** the reconciliation RPC (DP-1).

**Schema (additive, nullable — no data change, no backfill):**
- `ALTER TABLE consumption_events ADD COLUMN corrects_event_id uuid NULL` — self-FK `REFERENCES consumption_events(id) ON DELETE RESTRICT`. **[DECISION]** RESTRICT mirrors the attendance `corrects_event_id` (a corrected event must not be deleted out from under its correction).
- `ALTER TABLE resolved_obligations ADD COLUMN superseded_by_event_id uuid NULL` — `REFERENCES consumption_events(id) ON DELETE SET NULL`. **[DECISION]** SET NULL: losing the pointer must not delete the audit row.
- **No `charges` change (DP-2).** Retirement uses the existing `status='void'` value, existing `voided_at` column, and existing `metadata` jsonb. **Verified:** `charges_status_chk` already permits `void`; the `enforce_childcare_charge_immutability` trigger's guard runs only for `status <> 'draft'`, so a `draft → void` in-place UPDATE passes and a `posted → void` in-place UPDATE is blocked. `charges` has **no `updated_by`** column — do not write one.

**Constraints:**
- `consumption_events_corrects_no_self` CHECK `(corrects_event_id IS NULL OR corrects_event_id <> id)` — mirrors the attendance `no_self_reference` guard.
- **[DECISION]** No CHECK tying `corrects_event_id` to `status` (a corrected event may be `resolved`/`no_obligation` then flip to `superseded`); the RPC owns that transition.

**Indexes (partial, match existing conventions):**
- `idx_consumption_events_corrects` on `(org_id, corrects_event_id) WHERE corrects_event_id IS NOT NULL`.
- `idx_resolved_obligations_superseded_by` on `(superseded_by_event_id) WHERE superseded_by_event_id IS NOT NULL`.

**Function (DP-1):** `CREATE OR REPLACE FUNCTION reconcile_consumption_correction(p_org_id uuid, p_actor_user_id uuid, p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` — body per Section 5.8 (locks, upserts, reparent, supersede, retire, all-or-nothing). Followed by `REVOKE ALL ON FUNCTION reconcile_consumption_correction(uuid,uuid,jsonb) FROM public;` `GRANT EXECUTE … TO service_role;` and `COMMENT ON FUNCTION … IS 'Execute only from service_role. Atomic D12a correction reconciliation.'`. Failure via `RAISE EXCEPTION 'reconcile_consumption:<reason>'` (plain text, no ERRCODE — house style).

**Triggers:** none added. `set_updated_at` already fires on both mutable tables. **Do not** add append-only triggers (these are mutable resolution/consequence tables by design), and **do not** alter `enforce_childcare_charge_immutability` (it already permits draft→void).

**Policies (RLS):** **no change.** The RPC is `SECURITY DEFINER` (writes as definer, like the mutation/agent RPCs) and `service_role`-granted; org isolation is by `p_org_id` threading. The existing `owner/admin/ops` UPDATE policies remain for any direct service writes. No job-vertical table touched.

**Versioning:** columns are nullable and additive; existing rows read as `NULL` (no lineage) = "not a correction" — fully back-compatible. The RPC is `CREATE OR REPLACE` (no dependency on it existing before).

**Migration ordering:** after `20260709120000_draft_obligation_review_slice4.sql`. No dependency on any unshipped migration.

**Rollback strategy:** `DROP FUNCTION reconcile_consumption_correction(uuid,uuid,jsonb)` + `DROP COLUMN` both columns (and their indexes/CHECK) — safe and lossless: additive columns are only populated by the correction path (reachable only via correction/reversal facts on the simulate path in Wave 1), and the function has no callers outside the new wrapper. No data migration to reverse.

---

## Section 13 — Testing Specification

**Unit**
- `attendanceInterpretation`: reversal → empty directives + reason; correction re-interprets corrected times (18:00→late fee; 16:45→discard). Original path unchanged (regression).
- `scheduleInterpretation`: reversal → no impact; correction re-interprets; replacement proration_credit unchanged.
- `attendanceFactTranslation`: every `AttendanceEventKind` → expected `AttendanceFactType | null` across time/hours/vacation permutations; malformed inputs → `null`.
- `resolveConsumption`: carries `entryType`/`correctsFactId` into the event intent + context.

**Integration (through `draftConsumption`/`previewConsumption`, service level — the only Wave 1 entry point)**
- Original fact → obligation + draft charge (existing behavior preserved).
- Preview of a correction returns the `supersession` delta and writes nothing.

**Correction**
- Late-pickup obligation exists; correction reduces lateness → prior obligation `superseded`, `superseded_by_event_id` set, draft charge `status='void'` + `voided_at` set + `metadata.retirement` recorded, `review_status='stale'`, a new correction consumption event exists with `corrects_event_id`, prior event `superseded`.
- Correction that keeps the same `resolution_key` but changes amount → obligation **reparented** to the new event + draft charge recalculated + `review_status='stale'`; **no** spurious supersession.

**Reversal**
- Reversal of a late-pickup → obligation `superseded`, draft charge retired to `void` (not deleted; row + `charge_line_items` preserved), no new obligation; prior event `superseded`.

**Supersession**
- Prior event with 2 obligations; correction reproduces 1 → exactly the absent one is superseded (its draft voided); the reproduced one is reparented + updated.
- Charge retirement never touches a posted charge: seed a `posted` charge, run a reconciliation targeting it → 0 rows updated, charge unchanged (assert `status`/`amount`/`voided_at` intact).

**Two distinct corrections of the same prior fact (DP-3)**
- Create two distinct correction facts (different `sourceEntityId`) both referencing the same prior fact → they create **distinct** correction consumption events (distinct idempotency keys); replay each → each remains idempotent (no third event, no duplicate obligation). Assert the surviving obligation converges to a single row owned by the last-committed event.

**Correction chains (DP-4)**
- original → correction → correction: `E2.corrects_event_id = E1`, `E1.corrects_event_id = E0`; live obligation owned by `E2`; `E0`,`E1` superseded.
- original → correction → reversal: the reversal retires the obligation currently owned by the correction event; that event retired.
- same-key correction followed by a fee-eliminating correction: first reparents; second supersedes + voids the draft.
- replay at each chain step → no duplicates, no double-void.

**Atomicity (DP-1) — no partial state**
- Inject a failure inside the RPC transaction (e.g. a forced `RAISE` after step 3) → assert **none** of the reconciliation writes persisted: no new correction event, no reparent, no supersede, no charge void, prior event still `resolved`. Proves all-or-nothing.

**Idempotency / Replay**
- Submit the same correction fact twice → single correction event (same fact-anchored idempotency key, DP-3), obligations superseded exactly once, draft retired once, no duplicates.
- Submit the same original fact twice → unchanged existing idempotent behavior (regression).

**Regression**
- Full existing `web/tests/operationalConsumption/*` and `web/tests/childcareOperational/attendance/*` suites pass unchanged (originals, schedule slice 2, attendance slice 3, obligation review, simulate/obligations routes, convergence).
- `typecheck:build` green.

**Failure injection**
- `correctsFactId` null on a correction → treated as original, `correction_lineage_missing` stamped, no supersession.
- Prior consumption event missing → `no_prior_consumption_event`, proceed as original.
- Interpreter throws mid-reconciliation → no partial supersession committed without its correction event.

**D2 conformance**
- `attendanceFactConformance.test.ts`: append-only UPDATE/DELETE reject; entry-type + link-shape CHECKs; `corrects_event_id` self-FK + no-self-ref; distinct emitted event types; payload completeness (`schema_version`, `entry_type`, `corrects_event_id`, subject, effective date, org_id).

---

## Section 14 — Acceptance Criteria (objective; "done")

1. `web/lib/operationalFacts/{factContract,factConformance}.ts` exist; the attendance conformance test passes on both storage and consumer-facing halves.
2. `OperationalFactDto` carries `entryType` + `correctsFactId`; `ConsumptionEventRow`/`Intent` carry `corrects_event_id`; obligation row types carry `superseded_by_event_id`.
3. The migration applies cleanly on top of `20260709120000`, adds exactly the two nullable columns + two partial indexes + the no-self-ref CHECK **and** the `reconcile_consumption_correction` function (`SECURITY DEFINER`, `service_role`-granted), changes no RLS, makes **no `charges` change**, and rolls back by `DROP FUNCTION` + `DROP COLUMN` with no data loss.
4. **Atomicity (DP-1):** all correction/reversal reconciliation writes go through `reconcile_consumption_correction`; an injected mid-transaction failure leaves **zero** partial state (a test proves it). No sequential client writes and no compensation exist on the correction path.
5. Submitting a **reversal** fact results in: prior obligation `status='superseded'` with `superseded_by_event_id` set; its **draft** charge retired **in place to `status='void'`** with `voided_at` and `metadata.retirement` set (row **not** deleted; `charge_line_items` intact); `review_status='stale'`; a correction consumption event with `corrects_event_id` keyed on the **correction fact's own `sourceEntityId`** (DP-3); prior event `status='superseded'`; **no** new obligation. **No posted charge is ever mutated** (posted target → 0 rows).
6. Submitting a downward **correction** (removes the fee) produces the same supersession; a same-key amount **correction reparents** the obligation to the new event (its `consumption_event_id` moves), recalculates the draft, marks `stale`, and supersedes nothing (DP-4).
7. **Two distinct corrections** of the same prior fact create **two distinct** consumption events; replaying either is idempotent; the surviving obligation converges to one row (DP-3/DP-4).
8. Replaying any correction/reversal fact produces **no** duplicate events/obligations and **no** double-retire.
9. `previewConsumption` returns the `supersession` delta and writes nothing.
10. `deriveAttendanceFactType` exists, is pure, is exhaustively unit-tested, and is **referenced by no runtime path** (grep proves it unwired).
11. All pre-existing consumption + attendance tests pass unchanged; `typecheck:build` green.
12. `grep` confirms: no new `emitEvent` call in the consumption layer; no reactor; no route other than `simulate` invokes the pipeline; `child_attendance_events` migration and attendance services are byte-unchanged; the only `.rpc(` added under `web/lib/operationalConsumption` is the reconcile wrapper.

---

## Section 15 — Explicit Non-Goals (Cursor must NOT build)

- **No D12b / no reactor / no wiring** from `child_attendance_events` (or any fact write) to `draftConsumption`. The pipeline remains invoked only by `/consumption/simulate`.
- **No Posting**, invoices, AR, payments, statements, ledger, or GL writes; no mutation of any posted charge.
- **No Attendance UI, no Scheduling UI, no Billing UI**, no Focus Panel cards, no queues, no Current Work, no attention rules.
- **No Forecasting**, no new Operational Calculations, no metric packs.
- **No new Business Process**, stage, outcome, or status domain.
- **No new module**; no changes to Work Units, Focus Panels, Surface Builder, Communications, Commands, or AI/BOS.
- **No changes to `child_attendance_events`** (schema, triggers, or services) — it is the frozen reference; only asserted.
- **No universal `operational_facts` table**; no base class; no fattening of `workflow_events` payloads with billing fields.
- **No consumption-layer workflow events** and **no obligation-review actions emitting events** (a later D9 item).
- **No enrollment/registration or schedule pricing changes**; pricing stays delegated to the existing resolvers.
- **No per-fact-table `schema_version` retrofit** onto attendance (recommended for future streams only).
- **No `charges` schema change** (no new columns, no status-vocabulary change, no immutability-trigger change) — retirement reuses the existing `void` status + `voided_at` + `metadata` (DP-2). The only DB function added is `reconcile_consumption_correction`; no other RPC.
- **No change to the `original`-fact path** — only correction/reversal facts route through the reconciliation RPC; originals keep the existing sequential write path.

---

## Section 16 — Implementation Risks

| Risk | Type | Mitigation |
|---|---|---|
| Partial reconciliation state (writes across 3+ tables) | Technical/correctness | **DP-1:** all reconciliation writes execute in one `SECURITY DEFINER` RPC (`reconcile_consumption_correction`) = one transaction, all-or-nothing; a fault-injection test proves zero partial state. No sequential client writes on the correction path. |
| Reconciliation retires the wrong obligations (over-supersede) | Technical/correctness | Lineage anchored on the prior **consumption event** (`source_entity_id = correctsFactId`), not agreement/date scans; supersede only obligations whose `resolution_key` is absent from the corrected pass; "2 obligations, correction reproduces 1" test. |
| Orphaned draft charge on supersession (the original bug) | Technical | Draft retired to `status='void'` **inside the same RPC transaction** as the obligation supersession; test asserts no orphan and the charge row is preserved (not deleted). |
| Retiring/mutating a posted charge | Financial/correctness | **DP-2:** the retirement `UPDATE` carries `AND status='draft'` (posted → 0 rows); the `enforce_childcare_charge_immutability` trigger independently blocks a `posted → void` in-place update; explicit test asserts posted charges are untouched. |
| Non-idempotent replay (double supersede / double retire) | Technical | **DP-3:** the correction event key is anchored on the correction fact's own `sourceEntityId`; reparent/supersede/retire are no-ops on repeat (retire hits 0 rows once `void`); replay + two-distinct-corrections tests. |
| Competing correction branches diverge / double-charge | Technical/correctness | **DP-4:** obligation identity is the `(org_id, resolution_key)` unique index; the RPC's `FOR UPDATE` locks serialize concurrent corrections → they converge on one obligation row; no branch-merge code, no chain scan. |
| Migration touches job vertical or existing RLS/charges | Migration | Columns on childcare-consumption tables only; **no `charges` migration** (reuses existing `void`/`voided_at`/`metadata`); no RLS change (RPC is definer + service_role; existing UPDATE policies suffice); additive-nullable; rollback = `DROP FUNCTION` + `DROP COLUMN`. |
| RPC becomes a second charge-write path (drift from `childcareChargeService`) | Future | The RPC persists **pre-resolved** values only (no pricing); charge-domain knowledge stays in `childcareChargeService` planning helpers; originals keep the existing TS path. Documented as the single correction-path writer. |
| Baseline `web/` test suite is partially red | Operational | Gate on `typecheck:build` + the targeted new/adjacent suites + an isolated-worktree regression diff on `operationalConsumption`/`attendance`, not absolute-green. Solo agent (no parallel git races). |
| Scope creep into D12b | Process | Acceptance criterion 10 (grep proves no reactor, `deriveAttendanceFactType` unwired, only `simulate` invokes the pipeline) is a hard gate. |
| Future risk: the unwired translation drifts from the reactor's needs | Future | `deriveAttendanceFactType` is authored against the D2 event-payload contract and the 15-value `AttendanceFactType`; Wave-2/D12b consumes it as-is or the change is re-specified — never re-decided ad hoc by Cursor. |
| Performance | Performance | One extra indexed point-lookup (prior event by `source_entity_id`) + one indexed obligation scan per correction fact; both covered by existing/added partial indexes; corrections are low-volume relative to originals. |

---

## Appendix — Verified evidence anchors

- Idempotency keys (verbatim): `cev:attendance:<factType>:<agreement|source>:<anchorDate>`, `cev:schedule:<changeKind>:<agreement|source>:<occursOn>`, generic `cev:<eventKey>:<sourceEntityType>:<sourceEntityId>:<occursOn>`; obligation `cons:<kind>:<anchorDate>:<agreement|source>` or delegated `tpl:<key>:<occurs_on>:<scope>`.
- `draftConsumption` write loop iterates only `preview.resolution.obligations` (current pass) — no prior-obligation enumeration exists (verified).
- `resolved_obligations` / `consumption_events` express supersession only as `status='superseded'` with **no** link column (verified) → the two additive columns are the minimal durable, auditable supersession.
- `child_attendance_events` is append-only (mutation-block trigger for all roles), `entry_type ∈ {original,correction,reversal}`, self-FK `corrects_event_id`, CHECKs `entry_link_shape` + `no_self_reference` → the D2 reference conformer.
- `correctAttendanceEvent` writes correction/reversal as a new row; reversal terminal (`"Cannot correct or reverse a reversal event"`).
- Consumption layer emits **no** workflow events (verified); obligation-review actions emit none.
