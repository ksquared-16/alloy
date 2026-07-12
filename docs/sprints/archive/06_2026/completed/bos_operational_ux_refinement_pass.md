# BOS Operational UX — Work-Unit Queue Parity + Drawer Assist Refinement

**Path:** `docs/sprints/archive/06_2026/completed/bos_operational_ux_refinement_pass.md`  
**Status:** **COMPLETE** — refinement pass + assist routing + communication synthesis + channel-aware drafting  
**Date:** 2026-05-26 (fix passes 2026-05-21)

**Closeout index:** [`bos_assist_routing_communication_drafting_closeout.md`](./bos_assist_routing_communication_drafting_closeout.md)  
**Forward planning:** [`../../future/bos_operational_assist_phase2.md`](../../future/bos_operational_assist_phase2.md) — not implemented.

**Scope:** Operational refinement + workflow alignment — **not** new BOS capability.

---

## Task 1 — Review Assist usefulness audit

| Field | Operator value | Issue | Action |
|-------|----------------|-------|--------|
| **Operational read** | High — judgment headline | None | **Keep** (primary) |
| **Why now** | High — timing context | Often overlaps urgency reason | **Keep**, compact chrome |
| **Do next** | High — sequencing | Sometimes repeats operational read | **Keep** |
| **Likely outcome** | Low–medium today | Adds height; often generic catalog text | **Hide in drawer chrome**; show in panel only when distinct from do-next |
| **What changed** | Medium | Duplicates why-now when urgency_reason matches | **Hide when redundant** |
| **Type / escalation chips** | Medium | Useful at scan | **Keep**, inline in chrome header |
| **Trust lines** | Medium | Useful when stale | **Keep** as single muted footnote |
| **Supporting detail** | High in drawer | Inline body was redundant with collapsed L2 | **Collapsed only** (already L2; removed inline duplicate from handoff card) |
| **Review assist brand + subtitle** | Low in drawer chrome | Consumes vertical space | **Suppress in chrome** |
| **Orchestrator CTA in assist band** | Medium | Competes with workflow CTAs; caused clip | **Move to record header actions** |

**Clipping drivers (fixed):** fixed handoff slot height (`7.25rem`), stacked assist rows + orchestrator card in inquiry right column, missing `min-w-0` on flex children.

---

## Task 7 — Queue sort audit (documentation only)

**Current pipeline (needs-attention / enrollment work-unit):**

- Rows carry `_attention_priority_score` from attention resolver (`buildOpportunityAttentionQueueItems`, `QueueService` enrich).
- Queue definition `sort` arrays (e.g. `updated_at desc`) still apply at fetch layer.
- Recommendation preview attaches `_operational_recommendation_preview` with `urgency_band`, `recommendation_type`, `is_stale` — **not** used for sort today.

**Future sort modes (not implemented):**

| Mode | Signals |
|------|---------|
| Recommended priority | `_attention_priority_score` + recommendation `urgency_band` |
| Oldest waiting | `waiting.since_iso` / attention wait bucket |
| Newest activity | `last_activity_at` / `updated_at` |
| SLA risk | `sla_tier` on primary reason |
| Status | `status_key` |
| Family | `_customer_name` |

**Integration point:** work-unit queue config `sort` in `queueDefinitionSchema` + `QueueService` merge; UI sort dropdown would live on work-unit page queue toolbar when product adds `queue_sort` URL param (not present today).

---

## Shipped changes (summary)

- Drawer Review Assist: compact chrome, no likely outcome in header, collapsed supporting detail only.
- Orchestrator: **Open in Orchestrator** in record header actions; removed lower handoff card from inquiry right column.
- Queue: Message replaces Call/Email; operational read scan line; suppress duplicate attention headline when canonical read present.
- Quick message: `launchAdminV2QuickMessage` + modal seed from queue row.

---

## Fix pass (2026-05-21) — drawer placement, queue parity, config actions

| Task | Change |
|------|--------|
| **Drawer** | Review Assist moved from left Family column to right inquiry summary (`inquiry_summary_review_assist` on `OpportunityInquirySummaryRightColumn`). |
| **Queue read** | Work-unit `page.tsx` path uses `resolveQueueOperationalReadSlot`; suppresses legacy `Needs attention:` when canonical `_operational_recommendation_preview` exists. |
| **Config actions** | `ui.row_preview.actions` supports `message`, `orchestrator`, `update_status` (schema); row buttons via `buildQueueRowPreviewQuickActionsFromConfig` — no hardcoded Message/Orchestrator. |
| **Orchestrator row** | `crm_open_orchestrator` → `buildOpportunityOperationalContext` + `orchestratorHandoffSeedCommand` (same handoff as drawer). |
| **Message row** | `crm_message` → `launchAdminV2QuickMessage` with person payload. |

### Settings / config path

Queue row preview actions are **not** edited in AdminV2 Settings UI today. They live in:

- `web/lib/config/enrollmentPipelineQueueDefinitionV1.ts` → `ui.row_preview.actions`
- Validated by `web/lib/config/queueDefinitionSchema.ts`

### Fix pass 2 (2026-05-21) — provenance, preload, queue readability

| Task | Change |
|------|--------|
| **SLA / timing** | Intake age from `created_at` (was wrongly `updated_at`); urgency lines only claim breach when resolver `sla_tier === breached`. |
| **Catalog copy** | Removed ungrounded “past your window” / behavioral claims; `stale_new_inquiry` uses `intake_age_phrase` + `urgency_reason_line`. |
| **Drawer preload** | `drawer_primary` now attaches `attachOpportunityAttentionSuggestionBundle` (same path as full); review-assist skeleton while primary in flight. |
| **Queue read** | Two-line L0: do-next + muted why; queue `why_line` projects grounded `urgency_reason`; chips only P0 or P1 when breached/high+. |
| **Urgency** | Medium + non-breached defaults to `p2_soon` (quiet chip); `queueUrgencyChipLabel` context-aware. |

**Provenance reference:** `docs/sprints/archive/06_2026/completed/bos_operational_ux_refinement_pass.md` + `operationalTimingCopy.ts`.

### Fix pass 3 (2026-05-21) — action configuration cleanup + BOS assist placement

| Task | Change |
|------|--------|
| **Drawer BOS assist** | Removed **Open in Orchestrator** from drawer header actions. Native **Ask BOS to assist** CTA in Review Assist band (`BosDrawerAssistCta` → `triggerBosDrawerAssistHandoff`). |
| **Queue row actions** | Strictly from `ui.row_preview.actions`; removed registry merge (`opportunityQueueRowActions`) that reintroduced Call/Email. Enrollment default: `["open", "message"]`. |
| **Message** | `crm_message` → Quick Message modal with primary person payload; hidden when no `personId`. |
| **Settings catalog** | `filterSettingsActionCatalogDefinitions` hides `*_placeholder` keys from action-button create dropdown + definition-catalog API. |
| **Orchestrator row** | Removed from queue row preview builder — BOS assist is drawer-native only for now. |

#### Action system audit (Pass 3)

| Surface | Source | Configurable? | Notes |
|---------|--------|---------------|-------|
| Queue row preview buttons | `work_units.queue_definition.ui.row_preview.actions` (static seed + JSON) | **No Settings UI** | Canonical default in `enrollmentPipelineQueueDefinitionV1.ts` |
| Record header / right rail | Supabase `action_definitions` + `action_placements` | Settings → Action buttons | Separate from queue row preview |
| Queue row registry fetch | `GET /api/admin/actions?surface=queue_row` | Placements | Still fetched for registry click handlers; **not merged onto row chips** |
| Drawer BOS assist | Native `BosDrawerAssistCta` | **Not configurable** | Uses existing orchestrator handoff plumbing |

#### Supabase / config persistence (Pass 3)

- **Queue row actions:** static config file + optional per-work-unit `queue_definition` JSON on `work_units` — **Settings does not write row preview actions today**.
- **Action button placements:** Supabase tables; Settings create flow persists via `POST /api/admin/action-placements`.
- **Gap:** tenant-configurable queue row action editor requires new Settings surface writing `queue_definition.ui.row_preview.actions` — out of scope this pass.

---

## Sprint closeout (2026-05-21) — final polish pass

### Fixes shipped

| Area | Change |
|------|--------|
| **Queue operational read** | Column layout, left-aligned do-next + why lines; scan mode drops redundant “Operational read:” label; chips on their own row; no awkward centering/clamp on flex row. |
| **Urgency saturation** | `resolveUrgencyBand`: SLA breach + medium severity → `p1_today` (not `p0_urgent`); drawer chips use same `queueUrgencyChipLabel` thresholds as queue. |
| **Review Assist** | BOS CTA renamed **Continue with BOS**; supporting detail collapsed label **More detail · N signals**; drawer urgency chip gated like queue. |
| **Preload** | Review Assist slot `min-h-[5.5rem]` + taller skeleton to reduce pop-in when primary payload is still loading. |

### SLA / timing provenance (verified)

| Copy | Source | Grounded? |
|------|--------|-----------|
| **Response window exceeded** | `buildGroundedUrgencyReasonLine` when attention resolver `sla_tier === "breached"` | Yes |
| **N days since the inquiry was created** | `intakeAgeDaysFromRow` → `opportunity.created_at` (not `updated_at`) | Yes |
| **First-response window due soon** | `sla_tier === "approaching"` | Yes |
| **Urgency band** | `resolveUrgencyBand` + catalog `default_urgency_band` | Yes — medium non-breach downgrades to `p2_soon` |
| **SLA tier rules** | `opportunity_attention_resolver` + org/work-unit attention config metadata (`opportunity_attention_rules`, work-unit `metadata`) | Resolver-owned; not invented in UI |

Remove any visible copy that cannot be traced through `operationalTimingCopy.ts` + resolver fields.

### Same message per status (known limitation)

Recommendations are keyed by **attention reason code** (catalog), not `status_key` alone. Multiple rows with the same primary reason (e.g. `stale_new_inquiry`) share catalog copy until row-specific signals diverge (SLA tier, intake age, wait bucket). Per-status nuance requires additional catalog entries or richer interpolation — **Phase 3+**, not this sprint.

### Performance / preload

- **Authoritative path:** `drawer_primary` entity GET runs `attachOpportunityAttentionSuggestionBundle` → `_operational_recommendation` + `_operational_attention` on first payload.
- **UI:** Review Assist renders when either field is present; skeleton only when both are absent during primary hydrate.
- **No extra client fetch** for BOS copy on drawer open.

### Phase 3 / 4 — deferred

- AI enrich / draft polish (explicitly out of scope)
- Tenant Settings editor for `ui.row_preview.actions`
- Queue sort modes (documented in Task 7; not implemented)
- Per-status catalog variants beyond attention reason codes

### Manual testing checklist

- [ ] Work-unit queue: operational read left-aligned, two lines, no duplicate “Needs attention” when preview present
- [ ] Urgent chip only on breached/high/critical rows; medium rows quiet
- [ ] Drawer Review Assist: **Work with BOS** in assist band only; no header Orchestrator
- [ ] SLA lines match intake age and breach state on known test records
- [ ] Drawer open: assist appears with primary payload or stable skeleton (no layout jump)

### Closeout recommendation

**Sprint closed 2026-05-26.** See [`bos_assist_routing_communication_drafting_closeout.md`](./bos_assist_routing_communication_drafting_closeout.md). Remaining gaps (queue action Settings UI, sort modes, catalog granularity) are **Phase 2 / messaging** backlog — not blockers for shipped operational assist.

---

## Final quality pass (2026-05-21) — CTA, loading doctrine, explainability

### BOS assist routing (2026-05-21)
- **Root cause:** Handoff seed used operational copy with “follow-up” + “send”; NL parser (`parseTaskAssistCommandIntent`) treated both as `create_reminder` → “When should I remind you?”
- **Fix:** `bosAssistHandoffRouting.ts` maps recommendation → `draft_message` | `schedule_message` | `create_reminder` | `workflow_assist`; passes `taskAssistHandoffIntent` on auto-submit (skips NL misroute)
- **Stale new inquiry / communication** → message draft assist with goal from `recommended_action.label`
- **Follow-up overdue** (draft + reminder actions) → message draft, not reminder-only
- **Reminder-only** when `available_actions` is only `create_reminder`

### BOS assist routing (2026-05-21)
- Styled as native secondary button (`data-bos-assist-button`, hover/active/focus ring)
- Remains inside Review Assist only

### Drawer loading doctrine fixes
| Issue | Fix |
|-------|-----|
| Right column gated on `rightColumnModel` | Renders with skeleton default model immediately |
| Review Assist slot returned `null` before BOS | Slot always reserved (`data-review-assist-slot=skeleton\|ready\|reserved`) |
| `memo` ignored `overviewData` BOS fields | `reviewAssistPayloadEqual` in memo comparator |

**Still deferred:** task preview chips may hydrate after primary if not on entity GET; activity block uses placeholder until full bound.

### Priority / urgency provenance

| UI label | Source | Threshold |
|----------|--------|-----------|
| **Urgent** | `queueUrgencyChipLabel` / `resolveUrgencyBand` | `p0_urgent` — critical severity, `sla_breach` catalog, or high+breached |
| **Today** | same | `p1_today` + (`sla_tier=breached` OR severity high/critical) |
| **Soon / FYI** | hidden in queue L0 | `p2_soon`, `p3_fyi` — no chip |
| **Response window exceeded** | `operationalTimingCopy.buildGroundedUrgencyReasonLine` | resolver `sla_tier === breached` only |
| **priority_score** | `opportunity_attention_resolver` | **Not shown in UI** |

User-facing explanation: `operationalPriorityExplainability.ts` → aria-label on queue/drawer chips; drawer shows muted **Priority · …** line when chip visible.

### Generic read
- Queue L0: **do-next line** + **why line** (grounded `urgency_reason` with intake age when available)
- Same catalog key → similar action line by design; **why line differentiates** per record timing/SLA
- No invented per-status copy without signals

---

## Communication draft synthesis (2026-05-21)

**Doctrine:** recommendation copy is internal operator guidance; outbound message body is synthesized separately.

| Layer | Module |
|-------|--------|
| Objectives | `communicationObjectives.ts` |
| Templates | `communicationDraftSynthesis.ts` |
| Entry | `generateOperationalDraft.ts` |

**Objectives:** `initial_outreach`, `follow_up`, `schedule_tour`, `reengagement`, `missing_information`, `payment_followup`, `enrollment_next_steps`

**Flow:** recommendation → objective → deterministic draft → `taskAssistHandoffBootstrap.synthesized_draft` → propose API → review card

**Mode:** deterministic templates only (AI provider hook reserved in `generateOperationalDraft`)

**Manual QA:** stale inquiry draft must NOT contain “Send a warm first response and confirm…”; should contain site name + family greeting when grounded.

### Channel-aware drafting (2026-05-26)

| Channel | Behavior |
|---------|----------|
| **SMS** | Single-line (or short) body; no email signature block; `draft_body_sms` on proposal |
| **Email** | Paragraphs + operator/site signature; `draft_body_email` on proposal |
| **UI** | `TaskAssistCompactDraftCard` swaps bodies on tab change; propose API accepts `sms_body` |

**Regression tests:** `web/tests/agent/taskAssist/taskAssistChannelDraftBodies.test.tsx`.
