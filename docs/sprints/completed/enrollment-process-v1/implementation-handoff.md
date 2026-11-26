---
owner: runtime
status: sprint
last_reviewed: 2026-07-12
supersedes: []
---

# Enrollment Process V1 — Implementation Handoff

Status: **implemented + verified on staging; awaiting live browser Golden Path before freeze.**
Canonical record for Cursor and future threads. Where any other doc disagrees about ownership, the
pair *this doc + [`enrollment-process-runtime.md`](../../../platform/runtime/enrollment-process-runtime.md)* wins.

- **Staging SHA at handoff:** `3764e039a` (`origin/staging`). All Enrollment-V1 work is an ancestor of this SHA.
- **Working branch:** `claude/ecstatic-lamport-580e6c` @ `d102efe3a` — fully merged into staging (0 unpushed commits, clean tree).
- **One commit landed on staging after mine** (`3764e039a alloy-os: introduce surface host`) — unrelated to Enrollment; no interaction.

---

## 1. Thesis

Enrollment is no longer a hardcoded feature. It is the **first *configured* Business Process** on a
**generic Process Engine**. The engine knows only four things — `subject`, `context`, `stage`, `state`.
Everything Enrollment-specific lives in a **Definition folder** and in **operator config** the Process
Builder writes. Adding Billing / Staffing / Compliance is a new Definition + config, **zero engine edits**.

The proof is a passing test: `the SAME engine serves a Billing process with zero engine edits`
(`tests/process/engine/processParticipant.test.ts`).

---

## 2. Architecture — exact ownership

### 2.1 The generic Engine — `lib/process/engine/*` (process-agnostic)

Knows subject/context/stage/state and nothing else. No table names, no grain, no Enrollment constants.

| File | Owns |
|---|---|
| `processParticipant.ts` | `ProcessParticipant<Attr>` shape; `effectiveStage()`, `isOpenInstance()`, `stateIn()`, `hasEffectiveStage()`, `participantMatchesProcess()`, `participantInScope()` |
| `processParticipationContract.ts` | `ProcessParticipationContract = { processKey, subjectType, contextType, inheritsContextStage }` — the **only four fields the engine reads** |
| `processParticipantProjection.ts` | `ProcessParticipantProjection` **port** (interface a Definition implements to feed the engine) |
| `index.ts` | Public barrel |

**Load-bearing rule** (`processParticipant.ts:86`):
```
effectiveStage(p, contract) = p.participantStageKey ?? (contract.inheritsContextStage ? p.contextStageKey : null)
```

### 2.2 The Definition — `lib/process/definitions/enrollment/*` (Enrollment-specific)

| File | Owns |
|---|---|
| `enrollmentContract.ts` | `DEFAULT_ENROLLMENT_PARTICIPATION_CONFIG` (subject=`child`, context=`opportunity`, `inherits_context_stage:true`, `one_per_child_member`, views `[family,child,candidate]`); `ENROLLMENT_PARTICIPATION_CONTRACT` **derived from** the config (config is the source, not hand-written); `EnrollmentAttributes` (contextStatusKey, subjectActive, waitlistRank) |
| `enrollmentProjection.ts` | The projection that reads `process_instances` (+ `opportunities`, `customer_members` joins) and maps rows into engine `ProcessParticipant`s. **All table names live here, never in the engine.** |
| `enrollmentSemantics.ts` | Enrollment predicates over engine primitives: Active Lead / New Lead / Waitlisted classification |
| `resolveEnrollmentParticipation.ts` | The **config→contract seam**: `resolveEnrollmentParticipationConfig(deptMetadata)` reads `participation_v1` from `lifecycle_builder_v1` (falls back to default seed); `resolveEnrollmentParticipationContract(deptMetadata)` returns the 4-field contract the runtime reads |
| `index.ts` | Public barrel |

### 2.3 The config/binding layer — `lib/process/participationConfig.ts`

`ParticipationConfigV1` (persisted, operator-authored) + `parseParticipationConfigV1` (fail-safe coercion)
+ `participationContractFromConfig` (the seam that projects config → the engine's 4-field contract).
View keys / state labels / creation rule stay in this layer; **the engine never sees them.**

### 2.4 The primitive table — `lib/process/processInstances.ts`

`process_instances`: `process_key='enrollment'`, `subject_type='child'`→`customer_members.id`,
`context_type='opportunity'`→`opportunities.id`, `stage_key`, `state`, `close_reason_key`, `metadata`
(pre-materialization draft facts). Unique `(org_id, process_key, subject_id, context_id)`.

### 2.5 Concept → role → table (the axes that never collapse)

| Concept | Role | Table |
|---|---|---|
| **Opportunity / Lead** | **Context** (the acquisition case) | `opportunities` |
| **Household** | The context, operator-facing (family grain) | `opportunities` |
| **Child** | **Subject** (the durable person) | `customer_members` |
| **Process Instance** | **Journey** (one child on one lead) | `process_instances` |
| **Process Stage** | Position in the workflow | `process_instances.stage_key` |
| **Process State** | Journey disposition (waitlisted / enrolling / enrolled / withdrawn / not_enrolling) | `process_instances.state` |
| **Enrollment Agreement** | Durable relationship (post-materialization truth) | `child_enrollment_agreements` |
| **OCM** | **Legacy compatibility only** — never a runtime owner | `opportunity_customer_members` |

**Effective stage = `process_instances.stage_key ?? opportunities.stage_key`** (the coalesce, gated by
`inheritsContextStage`). This is the single membership rule shared by queues and metrics.

---

## 3. Runtime model (canonical chain)

```
Process Builder            /settings/processes → Enrollment → Stages
      ↓                    (operator authors the definition; writes participation_v1)
Participation Definition   participation_v1 on lifecycle_builder_v1  (config layer)
      ↓                    resolveEnrollmentParticipationContract(deptMetadata)
Engine                     ProcessParticipationContract {subject,context,stage-inherit}  (4 fields only)
      ↓
Projection                 enrollmentProjection reads process_instances (+joins) → ProcessParticipant[]
      ↓
Participant                engine ProcessParticipant<EnrollmentAttributes>
      ↓                    effectiveStage = participantStage ?? (inherit ? contextStage : null)
Queue Membership           enrollmentEffectiveStageMembership / childGrainProcessInstanceQueue
      ↓                    (.or(stage_key.eq.X, stage_key.is.null) — null-stage rides context stage)
Work Views                 projectParticipantsToRows + workViewCountSemantics (grain grouping)
      ↓
Queue Rows                 one row per grain unit (family=household, child=PI, candidate=candidate)
      ↓
Focus Panel                Subject Focus = the matching participant; durable > draft > OCM overlay
      ↓
Metrics                    enrollment.active_leads / new_leads / waitlisted (same membership rule)
      ↓
Workspace                  Process Summary + metric drills land in the configured Work Unit runtime
```

Every arrow is code that exists and is tested. The Process Instance **never** becomes operational truth;
on the enrolled outcome it *creates/updates* the durable Agreement, which is the source of truth thereafter.

---

## 4. Subsystem status

Legend: ✅ Implemented · 🟡 Partial · ⏸️ Deferred · ⛔ Blocked · 🗑️ Removed

| Subsystem | Status | Commit(s) | Notes |
|---|---|---|---|
| **Generic Engine** (subject/context/stage/state) | ✅ | `4ef8347fc` | Agnostic; Billing test proves zero-edit extensibility |
| **Enrollment Definition** (contract/projection/semantics) | ✅ | `4ef8347fc` | Table names isolated to the projection |
| **Participation Config V1** (`participation_v1`) | ✅ | `f664db6e3`, `8ae625bad` | Persisted on `lifecycle_builder_v1`; engine reads via `resolveEnrollmentParticipationContract` |
| **Participation — Process Builder UI** | ✅ | `a293f7337`→`f664db6e3`→`8ae625bad` | Compact **read-only** card at top of **Stages** (not a nav item); stage-inheritance **locked ON / Platform managed** |
| **Effective-stage Queue Membership** (PI canonical) | ✅ | `c6ef4729c` | `stage_key ?? context stage`; null-stage children in Lead lane; OCM canonical only if `ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK=1` (default OFF) |
| **Work Views** (participant→grain rows + count semantics) | ✅ | `008bf88e5` | `participantCount` (metric truth) vs `rowCount` (operator-visible) + `countUnit`/`countUnitLabel` |
| **Participant Metrics** | ✅ | `5b240bf99` | `active_leads` (live, not enrolled/withdrawn/not_enrolling, stage-agnostic), `new_leads` (live, undispositioned, effective stage `lead`), `waitlisted`; `lead_count` = **deprecated alias** → `active_leads` |
| **WU Lead-membership single source** | ✅ | `fc26ba18b` | `workUnitLeadMembership.ts` is the ONE definition (queue rows == counts == Lead Count metric) |
| **Process Stage replaces Participation Status** (read surfaces) | ✅ | prior threads | Focus Panel children, queue rows, waitlist, field catalog; `childEnrollmentProcessStageLabel.ts` |
| **"Enrollment Participation" status retired** from `/statuses` | ✅ | prior threads | Operator model = Opportunity Status → Process Stage → Placement Context |
| **Create Lead runtime** (one participant per child, no OCM write) | ✅ | prior (PR #72) | `executeCreateLeadAction` → PI per child; `verifyBosCreateLeadEnrollment.ts` |
| **Materialization** (enrolled → durable facts) | ✅ | prior (PR #72) | Flag `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED`; idempotent |
| **Operational States editor** (in Participation card) | 🗑️ | `8ae625bad` | Removed — stage labels live in **Stages**, not Participation |
| **Editable Available Views** (in Participation card) | 🗑️ | `8ae625bad` | Removed as editable — read-only until Work Views actually consumes it |
| **Stage-inheritance toggle** | 🗑️ | `8ae625bad` | Removed — disabling breaks Create Lead (null effective stage); Platform managed |
| **Standalone Participation workspace + nav section** | 🗑️ | `f664db6e3` | Overbuilt for one control; folded into the Stages card |
| **Form-intake → Process Instance** | ⏸️ | — | Intake still writes OCM, no PI (see §6); next migration |
| **Drop `opportunity_customer_members`** | ⏸️ | — | After intake migrates + fallbacks retire |
| **Live browser Golden Path** | ⛔ (freeze gate) | — | Requires authenticated staging browser — **user-owned** (see §7) |

---

## 5. Verification (this thread)

Full gate, all green on `d102efe3a`:

- **Typecheck:** `tsc -p tsconfig.build.json --noEmit` → exit 0
- **Build:** `next build` → compiled successfully
- **Participation card + nav tests:** 19/19
- **adminV2 regression (stash-diff):** baseline 334 failed == mine 334 failed → **0 net new failures**
- **Golden Path oracle suite:** **39/39** across:
  - `tests/process/engine/processParticipant.test.ts` — effectiveStage inherit ON/OFF; participant stage wins; Billing zero-edit
  - `tests/queues/enrollmentEffectiveStageMembership.test.ts` — `Lyons membership: two null-stage children at Lead → New Leads set = 2; move one → 1 + 1`
  - `tests/queues/childGrainProcessInstanceQueue.test.ts` — one row per PI; siblings independent; `[]` → OCM fallback
  - `tests/metrics/enrollmentParticipantMetrics.test.ts` — `two children at Lead → Active 2 / New 2 / Waitlisted 0` → `move one → Active 2 / New 1 / Waitlisted 1`; `lead_count` deprecated alias; enrolled/withdrawn drop from Active

Reproduce (Node 22 required):
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd web
NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.build.json --noEmit
npx vitest run tests/process tests/queues/enrollmentEffectiveStageMembership.test.ts \
  tests/queues/childGrainProcessInstanceQueue.test.ts tests/metrics/enrollmentParticipantMetrics.test.ts
```
Note: the `web/` suite has a **~334-failure red baseline** unrelated to this work; gate on the
**stash-diff regression delta** (baseline vs working tree), not the absolute count.

---

## 6. Known issues — intentionally unfinished (and why)

1. **Form-intake still creates OCM, no Process Instance** — `lib/forms/intake/applyIntakeChildToOpportunity.ts`.
   Separate capability from admin Create Lead. *Why:* out of V1 scope; the next migration makes intake
   create a PI the way Create Lead does. Until then intake-origin children rely on OCM fallback reads.
2. **OCM table retained** (`opportunity_customer_members`). *Why:* pre-existing records with no PI/agreement
   still need fallback reads (Focus Panel overlays, Work-View readers, `ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK`).
   Removal path: migrate intake → backfill agreements → retire fallbacks → drop table.
3. **Participation card is read-only / documentation-only.** *Why:* V1 has exactly one participation
   decision (stage inheritance) and it must stay ON. Subject/context/creation are locked; Available Views
   isn't consumed yet. No operator decision remains to expose.
4. **"Enrollment (legacy)" stray process** — a data artifact in department metadata JSON, **not code**.
   Code-side prevention shipped (audit SQL + `is_active`/legacy filters + guards). *Why unfinished:* the
   actual data cleanup needs DB access, which is **user-owned** — Claude has none. See memory
   `legacy-data-purge-sprint`.
5. **WU right rail may look empty for configured actions** — a Presentation Runtime V2 stub
   (`RightRailSurface`), **not** a placement/resolver bug. *Why:* owned by the PR-V2 sprint, not Enrollment V1.
6. **Focus Panel borders / queue-row visual variants** — cosmetic, browser-gated. *Why:* need an
   authenticated browser to QA; deferred to live pass, not a correctness blocker.
7. **Workspace Process Summary drill** — metric drills land in the configured Work Unit runtime
   (`ca0cbf8e1`); any residual polish is browser-gated and non-blocking.
8. **Live browser Golden Path not run by Claude.** *Why:* no authenticated staging browser. This is the
   one freeze gate and is user-owned (§7).

---

## 7. Definition of Done — what remains before freeze

Everything below the runtime is ✅ and tested. **One gate remains: the live browser Golden Path**, which
only a human with an authenticated staging session can run. On `3764e039a`:

**Golden Path (Lyons):**
1. **Create a Lead with 2 children** → both children appear in **New Leads**; household is **one** family row.
2. Open the **Focus Panel** → **both children** present as subjects (Subject Focus each).
3. **Move one child to Waitlist** → **New Leads = 1**, that child now in **Waitlist**; still one family row.
4. `/settings/processes` → Enrollment → **Stages** → the **Process participation** card shows Tracks: Child ·
   Context: Household · Creates: one participant per child · a **Platform managed** stage-behavior row — **no
   toggle, no Save**.

If the live numbers match the oracle (Active 2 / New 2→1 / Waitlisted 0→1, one household row), **Enrollment
Process V1 is clear to freeze.** Until then it stays unfrozen.

---

## 8. Flags & environment

| Flag | Default | Effect |
|---|---|---|
| `ALLOY_ENROLLMENT_QUEUE_OCM_FALLBACK` | OFF (PI canonical) | When `1`, OCM-derived rows are canonical for queues (legacy) |
| `ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK` | OFF | When `1`, materialization may read OCM for old data |
| `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | per-env | Gates enrolled-outcome materialization |

Toolchain: **Node 22** (`v22.21.1`). Validation always from `web/`.

---

## 9. Commit ledger (all ancestors of `3764e039a`)

| Commit | Subject |
|---|---|
| `4ef8347fc` | refactor(process-engine): split into agnostic Engine + Enrollment Definition |
| `fc26ba18b` | fix(projection): one canonical Work-Unit lead membership (queue == count) |
| `5b240bf99` | feat(metrics): enrollment participant metrics (active/new/waitlisted) |
| `c6ef4729c` | feat(queues): effective-stage PI membership + OCM fallback flag |
| `008bf88e5` | feat(work-views): explicit participant-vs-row count semantics + count_unit |
| `a293f7337` | fix(process-builder): wire Participation into the real nav (dead-nav fix) |
| `f664db6e3` | refactor(process-builder): Participation is a compact card in Stages, not a nav item |
| `8ae625bad` | refactor(process-builder): lock stage inheritance ON — Participation card read-only in V1 |

---

## 10. Related canonical docs

- [`enrollment-process-runtime.md`](../../../platform/runtime/enrollment-process-runtime.md) — the runtime ownership reference (updated alongside this handoff).
- [`enrollment-placement-doctrine.md`](../../../system/enrollment-placement-doctrine.md) — placement/waitlist doctrine.
- Sprint: `docs/sprints/archive/07_2026/enrollment_alignment_closeout.md`.
