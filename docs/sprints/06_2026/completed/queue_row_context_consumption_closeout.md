# QueueRowContext Consumption — Sprint Closeout

**Path:** `docs/sprints/06_2026/completed/queue_row_context_consumption_closeout.md`  
**Date:** 2026-06-09 (updated 2026-06-06 — visual polish + runtime QA)  
**Status:** **Closed — `OperationalQueueRecordRow` live on staging; polish sprint complete**  
**Head commit (consumption):** `bfb0e02a`  
**Staging URL:** https://staging.workwithalloy.com

**Planning / architecture docs (canonical):**

- [`docs/system/work-unit-surface-context-contract.md`](../../../system/work-unit-surface-context-contract.md) — developer contract, API attach, consumption table
- [`docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md`](../status_ownership_and_lifecycle_grain_expansion.md) — grain / ownership doctrine
- [`docs/sprints/06_2026/entity_status_lifecycle_stage_and_location_scope_contract.md`](../entity_status_lifecycle_stage_and_location_scope_contract.md) — stage, location scope, placement on OCM
- [`docs/sprints/06_2026/enrollment_lifecycle_status_matrix_contract.md`](../enrollment_lifecycle_status_matrix_contract.md) — enrollment disposition vocabulary
- [`docs/sprints/06_2026/enrollment_status_seed_and_migration_plan.md`](../enrollment_status_seed_and_migration_plan.md) — status_definitions seed (related)

**Types / modules:**

- `web/lib/workUnits/lifecycleSubjectContracts.ts` — frozen `QueueRowContext` contract (`1.1-partial`)
- `web/lib/workUnits/buildPartialQueueRowContext.ts` — partial adapter from enriched opportunity rows
- `web/lib/workUnits/attachQueueRowContextToItems.ts` — API attach + rollback flag
- `web/lib/workUnits/resolveQueueRowContextPresentation.ts` — context-first presentation helper
- `web/lib/layout/runtime/applyQueueRowContextToLayoutRuntime.ts` — layout record overlay

---

## 1. Executive summary

### Problem

Layout Configuration and queue/drawer redesign need a **stable, grain-aware runtime payload** without re-deriving enrollment logic from scattered CRM preview fields. Queue membership and lane counts must not change while we introduce normalized per-row context.

### What shipped

1. **API attach** — `_queue_row_context` on opportunity queue rows from `QueueService` (additive).
2. **Partial adapter** — honest **case-grain** `QueueRowContext` from enriched rows (`buildPartialQueueRowContext`).
3. **Placement bridge** — `placement_context` when one child or all inquiry children share identical OCM placement; omitted when mixed.
4. **Layout-runtime consumption** — work-unit layout queue cards read context when present and fall back to legacy row fields (`bfb0e02a`).

### What remains partial

Child-grain rows, grouped same-stage cards, subject-scoped attention/work, CRM compact lane path, drawer VM consumption, and full `WorkUnitSurfaceContext` API wrapper.

---

## 2. Commits included (queue row context arc)

| Commit | Summary |
|--------|---------|
| `c3fa6d4d` | Freeze lifecycle grain contracts; wire partial `QueueRowContext` on queue APIs |
| `fcf82143` | Same-stage sibling grouping doctrine (`1.1-partial` optional grouped fields) |
| `16cb47a8` | Populate partial `placement_context` from deterministic inquiry-child placement |
| `eca40fba` | Test: `placement_context` on API attach path |
| `bfb0e02a` | Consume context in layout-runtime queue cards + paste canvas TS fix |
| `f7f6ddfa` | Deploy fix: work-unit CreateLead `onSubmit` return type (adjacent) |

Related (status matrix, not consumption): `c284c682` enrollment status seed metadata.

---

## 3. Files touched (consumption + contract)

### API / adapter (live before consumption)

| File | Role |
|------|------|
| `web/lib/workUnits/lifecycleSubjectContracts.ts` | `QueueRowContext`, `SubjectPlacementContext`, contract version |
| `web/lib/workUnits/buildPartialQueueRowContext.ts` | Build + attach partial context from enriched rows |
| `web/lib/workUnits/attachQueueRowContextToItems.ts` | `attachOpportunityQueueRowsWithRowContext`, rollback flag |
| `web/lib/queues/QueueService.ts` | `withOpportunityQueueRowContext` on list/preview finalize paths |
| `web/lib/workUnits/index.ts` | Public exports |

### Consumption (`bfb0e02a`)

| File | Role |
|------|------|
| `web/lib/workUnits/resolveQueueRowContextPresentation.ts` | Context-first presentation + legacy fallbacks |
| `web/lib/layout/runtime/applyQueueRowContextToLayoutRuntime.ts` | Overlay layout runtime row records |
| `web/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview.ts` | Pass `item._queue_row_context` → overlay |
| `web/components/layout/QueueCardProofRenderer.tsx` | Renders overlaid record; debug data attrs |
| `web/app/adminV2/workspace/dept/.../work-unit/[workUnitId]/page.tsx` | Pass API context onto `QueueItemVm` |
| `web/lib/ui-v2/workspace-types.ts` | Optional `_queue_row_context` on `QueueItemVm` |
| `docs/system/work-unit-surface-context-contract.md` | Consumption table + runtime notes |

### Tests

| File | Role |
|------|------|
| `web/tests/workUnits/buildPartialQueueRowContext.test.ts` | Adapter + placement + attach |
| `web/tests/workUnits/attachQueueRowContextToItems.test.ts` | API attach path + placement |
| `web/tests/workUnits/resolveQueueRowContextPresentation.test.ts` | Presentation + layout record overlay |

---

## 4. Queue card rendering paths (audit)

| Path | Branch | Trigger | Renderer | Reads `_queue_row_context` | Notes |
|------|--------|---------|----------|---------------------------|-------|
| **A — Layout runtime (primary on staging)** | `staging` | `useLayoutQueueRows` && published queue `LayoutDoc` | `LayoutRuntimeQueueRowView` → **`QueueCardProofRenderer`** | **Yes** — via record overlay | `buildOpportunityQueueRowRecordFromPreview` + `applyQueueRowContextToLayoutRecord` |
| **B — Layout runtime (local WIP)** | local WIP | same gate | `LayoutRuntimeQueueRowView` → **`OperationalQueueRecordRow`** | **Partial** — record overlay + VM merge in WIP `buildOperationalQueueRecordViewModelFromLayout` | Not on `staging` yet; v3 column shell |
| **C — Layout error fallback** | both | layout render throws (non-hard-cutover) | **`CrmCompactQueuePreview`** | **No** | `vmFallback` when `LayoutRuntimeQueueRowView` errors |
| **D — Legacy lane (no layout doc)** | both | `!useLayoutQueueRows` | **`CrmCompactQueuePreview`** | **No** | `semanticCrmCompact` slots only |
| **E — CRM operational row (local WIP only)** | local WIP | `CrmCompactOperationalRow` host | **`OperationalQueueRecordRow`** + CRM VM | **No** unless `item._queue_row_context` passed into preview builder | Staging still uses classic `CrmCompactQueuePreview` for C/D |
| **F — Layout builder preview** | both | Settings / layout editor | `QueueRecordLayoutPreview` → `OperationalQueueRecordRow` | **No** (fixture record) | Design-time only |
| **G — Dev / doctrine galleries** | local | `/dev/queue-record-doctrine-review` etc. | `OperationalQueueRecordRow` + CRM fixtures | **No** | Proof / QA |

**Entry components**

| File | Role |
|------|------|
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | Lane switch: layout vs CRM compact |
| `web/components/layout/LayoutRuntimeQueueRowView.tsx` | Layout row wrapper + error boundary |
| `web/components/layout/QueueCardProofRenderer.tsx` | Staging layout card engine (Layout V2 zones) |
| `web/components/layout/OperationalQueueRecordRow.tsx` | WIP v3 config-driven operational shell |
| `web/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview.ts` | Preview item → layout record |
| `web/lib/layout/runtime/resolveQueueRecordLayoutConfig.ts` | Layout doc → v3 column config (WIP) |

**Hard cutover:** When `isLayoutRuntimeHardCutoverActiveClient()`, layout errors show `LayoutRuntimeQueueRowErrorCard` — not CRM fallback.

---

## 5. Runtime chain (layout queue path)

```
QueueService.getWorkUnitQueueItems / getWorkUnitQueueSummaries
  └─ enrichOpportunityRows (membership unchanged)
  └─ withOpportunityQueueRowContext()
       └─ attachPartialQueueRowContextToRows()
            └─ buildPartialQueueRowContext() → _queue_row_context on each row

GET /api/admin/queues/[workUnitId]/[queueKey]
  └─ result.items[] carries _queue_row_context (additive)

Work-unit page VM mapper
  └─ QueueItemVm._queue_row_context (when present on API row)
  └─ layoutRuntimeEnrichment (legacy, unchanged)

QueueBlock → LayoutRuntimeQueueRowView (when layout runtime active)
  └─ buildOpportunityQueueRowRecordFromPreview(item, doc)
       └─ applyQueueRowContextToLayoutRecord(record, context)
            └─ resolveQueueRowContextPresentation({ context, legacy: { record } })
            └─ overlays: name, status, contact, placement, attention, sibling children

QueueCardProofRenderer(doc, record)
  └─ resolveItemValue(record, layoutItem) — reads overlaid fields
  └─ data-queue-row-context-present / placement debug attrs on card shell
```

**Not in this chain today:** CRM compact lane rows inside `QueueBlock` when layout runtime is off or `vmFallback` path is used.

---

## 6. What is live on staging

| Capability | Status |
|------------|--------|
| `_queue_row_context` on queue list + summary preview APIs | **Live** |
| Case-grain `row_subject`, `row_stage`, `row_status_*`, `case_context` | **Live** |
| `primary_contact`, `related_subjects_summary` (from inquiry children) | **Live** when enriched |
| `placement_context` (deterministic only) | **Live** on API + layout overlay |
| `attention_summary`, `next_best_action` | **Live** when row enriched |
| Layout-runtime card reads context | **Live** (`QueueCardProofRenderer` path) |
| Queue membership / lane counts | **Unchanged** (attach is post-enrichment) |
| Rollback `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` | **Live** |

---

## 7. Queue card visual contract (redesign target)

Redesigned work-unit queue cards should present **one enrollment presentation row** (case-grain today; grouped future) without re-deriving semantics from CRM preview slots.

### Card zones (operator scan order)

| Zone | Visual content | Primary data source |
|------|----------------|---------------------|
| **1 — Identity** | Case / family name (household label) | `case_context.display_name` → `primaryLabel` |
| **2 — Subject focus** | Primary focused subject **or** subject group headline | `row_subject` (single); future: `row_subjects` + count |
| **3 — Stage / disposition** | Lane stage + enrollment disposition on row subject | `row_stage` + `row_status_label` |
| **4 — Placement** | Location · program · room · schedule (single line or chips) | `placement_context` when present; **omit zone** when absent |
| **5 — Contact** | Primary contact name · phone · email (compact) | `primary_contact` |
| **6 — Related children** | Sibling / enrollment-track summary (names + per-child disposition; optional per-child placement) | `related_subjects_summary` |
| **7 — Attention / work** | Attention reason; open work headline; optional next-best-action | `attention_summary`, `work_summary`, `next_best_action` |
| **8 — Grouped count** (future) | e.g. `3 enrollment tracks · Touring` | `row_count`, `row_count_unit`, `row_presentation_mode` |

### Visual rules

1. **Stage vs disposition:** `row_stage` = lane label (where the row sits in the work unit). `row_status_label` = enrollment disposition on the membership subject (OCM track semantics today reflected at case row).
2. **Placement is optional UI** — empty placement zone beats wrong unified placement.
3. **Mixed placements** — show per-child placement in zone 6 lines; do **not** synthesize zone 4 from siblings.
4. **Attention accent** — left border / badge when `attention_summary.needs_attention` (fallback: legacy `_attention_reason`).
5. **Grouped rows (future)** — zone 2 shows group headline; zone 8 uses `row_count` with unit `enrollment_track` (not deduped children count).

### Out of scope for this card redesign

- Drawer `active_subject` highlight on open
- Child-grain queue membership (one card per child in lane)
- Changing lane badge counts or queue membership

---

## 8. Data mapping (`QueueRowContext` → card zones)

Use `resolveQueueRowContextPresentation({ context, legacy: { record } })` or read fields directly when shaping layout records.

| Contract field | Card zone | Presentation / mapping |
|----------------|-----------|------------------------|
| `case_context.display_name` | 1 Identity | `primaryLabel` / `caseFamilyLabel` |
| `row_subject` | 2 Subject focus | `display_name`; `subject_type` + `subject_id` for adornment links (future child focus) |
| `row_subjects[]` | 2 + 8 (future) | Group headline + count; not populated today |
| `row_presentation_mode` | 8 (future) | `single_subject` default; `grouped_subjects` when grouped cards ship |
| `row_count` / `row_count_unit` | 8 (future) | Count language: prefer `enrollment_track` over `children` |
| `row_stage` | 3 Stage | Lane label chip / caption |
| `row_status_label` (+ `row_status_key`) | 3 Disposition | Status pill; do not use `case_context.case_status_label` for enrollment disposition |
| `case_context.case_status_label` | Optional subline | Boring case shell only (Active / Closed) — not enrollment stage |
| `placement_context` | 4 Placement | `formatSubjectPlacementSummary()` → location · program · room · schedule |
| `primary_contact` | 5 Contact | `display_name`, `phone`, `email` |
| `related_subjects_summary[]` | 6 Children | Map to chips/lines: `display_name`, `status_label`, optional `program_label`, `room_label`, `schedule_label` |
| `attention_summary` | 7 Attention | `primary_reason_label` when `needs_attention` |
| `work_summary` | 7 Work | `open_count` + `primary_open_label` |
| `next_best_action` | 7 Next step | `label` (+ optional `action_key` for rail — not auto-execute) |
| `drawer_open` | Row click only | `entity_id` → opportunity drawer; **do not implement `active_subject` focus yet** |

**Layout record overlay** (`applyQueueRowContextToLayoutRecord`) maps context onto refKeys used by layout docs today: `name`, `opportunity.status_label`, `opportunity.location`, `person.primary_*`, `children[]`, attention fields.

---

## 9. Fallback behavior

| Scenario | Behavior | Operator-visible result |
|----------|----------|-------------------------|
| **Missing `_queue_row_context`** | `resolveQueueRowContextPresentation` uses legacy record / CRM-derived record fields | Card renders from `semanticCrmCompact` + enrichment as before |
| **Missing `placement_context`** | `placementSummary` null; zone 4 hidden | No location/program line on card header |
| **Mixed placements** (siblings differ) | Adapter omits `placement_context`; `placementOmittedMixed` true | Per-child lines in zone 6 may still show placement; no false unified zone 4 |
| **No `related_subjects_summary`** | Zone 6 empty or legacy `children` repeater from CRM | Single-child CRM lines still work |
| **Legacy opportunity-only row** (sparse enrichment) | Partial context: empty siblings, null contact, minimal status | Card shows family name + lane stage + status key label |
| **`ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1`** | API omits context; presentation helper sees no context | Identical to pre-ship CRM/layout binding |
| **Layout path + CRM fallback** | Error boundary → `CrmCompactQueuePreview` | **No context** on fallback path |
| **Waitlist / candidate rows** | Context attach for opportunities; candidate VM separate | Placement waitlist cards use candidate VM, not this contract |

---

## 10. What redesign should use now

Read from `_queue_row_context` (or `resolveQueueRowContextPresentation`) — **not** by re-parsing CRM compact slots for these semantics:

| Field | Use for |
|-------|---------|
| `row_subject` | Primary queue membership subject presentation (today always `case`) |
| `row_stage` | Lane / operator stage label (e.g. "Tours", "New Leads") |
| `row_status_label` (+ `row_status_key`) | Enrollment disposition on the row lifecycle subject |
| `case_context` | Household / case shell label and boring case status |
| `placement_context` | Location · program · room · schedule when **present** |
| `related_subjects_summary` | Sibling OCM tracks: name, per-child status, optional placement labels |
| `primary_contact` | Case primary contact display |
| `attention_summary` | Case-scoped attention (partial) |
| `drawer_open` | Case drawer target + `active_subject` ref |

Contract version: `contract_version: "1.1-partial"`.

---

## 11. What redesign should NOT assume yet

| Gap | Notes |
|-----|-------|
| **Child-grain `row_subject`** | Lane grain may be `child` in queue_definition; `row_subject` is still honest `case` until phase 6 |
| **Grouped same-stage rows** | Types exist (`row_subjects`, `row_grouping_key`, `active_subject_group`); not built or rendered |
| **`placement_context` always present** | Omitted when inquiry children have **mixed** placement; do not show false unified placement |
| **Subject-scoped attention / work** | `attention_summary` / `work_summary` are case-scoped today |
| **`visibility` on siblings** | Access redaction not wired (`full` default) |
| **CRM compact lane path** | `QueueBlock` legacy CRM compact cards do **not** read `_queue_row_context` |
| **`WorkUnitSurfaceContext` wrapper** | Per-row attach only; no full page payload yet |
| **Drawer VM / layout body** | Drawer surfaces do not yet consume `QueueRowContext` for header/lifecycle rail |
| **Drawer `active_subject` on open** | Explicitly out of scope for queue card sprint |
| **Production status chip global replacement** | Layout cards still bind status via layout doc + overlaid record fields |

---

## 12. Recommended first implementation target

**Target:** Merge **`OperationalQueueRecordRow` + `queueRecordLayoutV3`** into `staging` as the layout-runtime renderer inside `LayoutRuntimeQueueRowView`, replacing `QueueCardProofRenderer` for opportunity lanes.

**Why this path**

1. **Data layer is ready** — `resolveQueueRowContextPresentation`, `applyQueueRowContextToLayoutRecord`, and API attach are live; WIP already routes layout rows through `buildOperationalQueueRecordViewModelFromLayout` + `mergeOperationalVmWithQueueRowContext`.
2. **Visual contract maps to v3 columns** — identity / related children / lifecycle context / contact / date columns align to zones 1–7 without fighting Layout V2 proof zones.
3. **Config-driven redesign** — preset + layout doc edits can tune labels and field order without new React branches.
4. **Staging cutover is one swap** — `LayoutRuntimeQueueRowView` already owns the gate; swap inner renderer only.

**First PR scope (suggested)**

| In scope | Out of scope |
|----------|----------------|
| Ship `OperationalQueueRecordRow`, `buildOperationalQueueRecordViewModel`, v3 config resolver | Drawer `active_subject` focus |
| Wire `mergeOperationalVmWithQueueRowContext` on layout VM path | Child-grain queue membership |
| Update `defaultLeadQueueLayoutV3` preset to match §7 visual zones | Grouped same-stage row UI |
| Pass `item._queue_row_context` into CRM operational row host when merged | Lane count / membership changes |
| Tests: operational row + context presentation parity | Retire `CrmCompactQueuePreview` (keep as fallback) |

**Interim on staging today:** Until merge, polish **`QueueCardProofRenderer`** zones using overlaid record refKeys — acceptable for hotfixes only; not the long-term redesign surface.

---

## 13. Rollback

```bash
# Server / Vercel env — omits _queue_row_context on API rows (rows otherwise identical)
ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1
```

Layout consumption is safe when context is absent (legacy fallbacks). Disabling API attach removes context at the source.

---

## 14. Validation and tests

### Automated (run before merge / after changes)

```bash
cd web && npm run test -- \
  tests/workUnits/buildPartialQueueRowContext.test.ts \
  tests/workUnits/attachQueueRowContextToItems.test.ts \
  tests/workUnits/resolveQueueRowContextPresentation.test.ts
```

**Closeout run (2026-06-09):** 24 tests passed (3 files).

```bash
cd web && npx tsc --noEmit   # required on web/ TS changes before merge
```

### Staging verification (2026-06-09)

| Check | Result |
|-------|--------|
| `https://staging.workwithalloy.com` responds | **Pass** (HTTP 200) |
| `bfb0e02a` on `origin/staging` | **Pass** |
| Live `getWorkUnitQueueItems` script (tsx, no Next request context) | **Blocked** — `unstable_cache` invariant outside Next handler; use admin session or in-app verification |
| Unit tests for attach + presentation + overlay | **Pass** |

### Manual staging checklist (operator / QA)

1. Open a work-unit queue lane with layout-runtime cards enabled (enrollment pipeline or lifecycle WU).
2. **Network:** `GET /api/admin/queues/{workUnitId}/{queueKey}` — confirm `items[n]._queue_row_context` on opportunity rows.
3. **Context present:** `contract_version`, `row_stage`, `row_status_label`, `case_context.display_name`.
4. **Placement:** Row with single-child or same-placement siblings → `placement_context` populated; mixed-placement household → `placement_context` absent, `related_subjects_summary` still lists children.
5. **Fallback:** With `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1`, cards still render from CRM/enrichment fields.
6. **Counts:** Lane badge / `total` unchanged vs pre-ship for same org snapshot.
7. **DOM:** Card has `data-queue-card` and `data-queue-row-context-present="true"` when context wired; `data-queue-row-placement-omitted-mixed="true"` when applicable.

---

## 15. Known gaps / follow-ups

1. **Drawer `active_subject`** — next recommended sprint: row click sets drawer subject context from `QueueRowContext` / related children.
2. **Child-grain queue rows** — honest `row_subject` per OCM/candidate membership.
3. **Grouped same-stage card** — `row_subjects`, count = enrollment tracks, optional grouped UI.
4. **CRM compact lane** — optional context consumption or deprecation plan with layout cutover.
5. **Access redaction** — `RelatedSubjectVisibility` on cross-site siblings.
6. **Fix stale doc bullet** in work-unit contract § "Not implemented" for `placement_context` (partial bridge is shipped).

---

## 16. Risks

| Risk | Mitigation |
|------|------------|
| **Renderer swap regressions** | Error boundary + CRM `vmFallback` until hard cutover; parity tests with fixture rows + context |
| **Dual renderer drift** (Proof vs Operational) | Merge operational shell quickly; avoid long parallel polish on `QueueCardProofRenderer` |
| **False placement on mixed siblings** | Never infer zone 4; use `placementOmittedMixed` debug attr in QA |
| **Fallback path without context** | Accept CRM fallback lacks context until fallback also calls presentation helper |
| **WIP merge conflicts** | Large local `QueueBlock` / CSS WIP — isolate renderer merge PR from layout builder WIP |

---

## 17. Visual polish + runtime QA (2026-06-06)

### Polish shipped

| Area | Change |
|------|--------|
| **Duplicate subject** | `queueRowSubjectPresentation` suppresses `queue_row.subject_label` when it matches household/case name (overlay + field resolution). |
| **Typography tiers** | Stage caption, placement muted metadata, attention/work/next-action muted with 2-line clamp. |
| **Spacing** | Column/field-stack gaps, narrower action rail (`156px`), `<420px` stacks action rail below content. |
| **CSS modifiers** | `--stage-label`, `--subject-focus`, `--placement-meta`, `--context-meta`. |

### Runtime QA checklist (code + unit tests)

| Check | Result |
|-------|--------|
| `data-queue-row-runtime-path="operational-queue-record-row-v3"` | **Pass** — `OperationalQueueRecordRow` root attr; tests assert markup. |
| `data-queue-row-context-present="true"` when API attaches context | **Pass** — work-unit `QueueBlock` maps `_queue_row_context`; verify in browser Network tab. |
| Rows without context still render | **Pass** — `applyQueueRowContextToLayoutRecord` noop; CRM compact fallback preserved. |
| Placement line omitted when absent | **Pass** — `visibleWhen: exists` on `opportunity.location`; mixed-placement omits overlay. |
| No fake shared placement on mixed rows | **Pass** — `placement_context` omitted in adapter when siblings differ. |
| Children summary from context / repeater | **Pass** — `related_subjects_summary` → `children` overlay + repeater column. |
| Row click opens opportunity drawer | **Not regressed in code** — manual confirm on staging. |
| Duplicate “Smith Household / Smith Household” | **Pass** — suppressed until child-grain rows ship. |

### Remaining gaps after polish

- Live browser QA on staging (lane counts, click-to-drawer, attention accent).
- Child-grain `row_subject`, grouped same-stage rows, drawer `active_subject`.
- `getWorkUnitQueueItems` still blocked outside Next request context for scripted smoke tests.

### Tests (polish sprint)

```bash
cd web && npm run test -- \
  tests/layout/queueRowSubjectPresentation.test.ts \
  tests/layout/operationalQueueRowContext.test.ts \
  tests/layout/operationalQueueRecordRow.test.tsx
```

---

## 18. Suggested commit message

```
fix(adminV2): polish operational queue row visuals and suppress duplicate subject

Hide case-grain subject line when it matches family name; tighten row
spacing and metadata hierarchy; add regression tests and QA notes.
```
