# Roadmap and gaps

## Purpose

Single place for **phase timeline**, **completion vs in-progress tracking**, **shipped-feature rows**, **velocity highlights** (observed delivery windows), **active fix/cleanup items**, **confirmed gaps**, and **verification debt** — not a replacement for the issue tracker.

> **Canonical roadmap:** [`docs/platform/foundation/product-roadmap.md`](../platform/foundation/product-roadmap.md) · **Capabilities:** [`docs/platform/foundation/platform-capabilities.md`](../platform/foundation/platform-capabilities.md)

**Product maturity framing:** See **`docs/platform/foundation/system-overview.md`** (“Platform maturity”) and **`docs/platform/foundation/platform-capabilities.md`**. Alloy has **passed the “prove foundational architecture” phase**. The program is now **operational completion + product hardening**; **AI groundwork is present** (assistive, narrow, human-in-the-loop) but **deeper agent expansion is intentionally paused**. **Focused pilots** remain appropriate; **general customer readiness** still depends on the checklist below.

---

## Timeline (phases)

Phases are **planning buckets**. Dates are narrative, not contractual.

### Current phase (May 31 2026 — month-end closeout)

**Theme:** **Operational completion + product hardening; AI groundwork present, deeper agents paused.**

- **Primary execution focus (June):** Lifecycle runtime/configuration alignment, **`move_to_waitlist`** mutator + canonical action cutover, enrollment/forms Phase 2 remainder (DCP, UX hardening), tour Band B+, messaging reliability, reporting — **not** autonomous agents or broad perf sprints.
- **Shipped / stable foundations (May 25–31 delta):** **Child lifecycle + work-unit convergence** (`enrollment_pipeline` v2, case vs child grain); **waitlist** pilot readiness + ranking validation + priority fact truth; **Tour Phase 2 Band A**; **Forms MVP productization**; **Global Search V1**; **person/location drawer convergence**; **lifecycle action alignment** (~84% — entry/enrollment actions, BOS header attention); **completion guardrails** (contextual validation); **person drawer layout runtime v1** (`20260531140000`).
- **Shipped / stable foundations (carry-forward):** Communications V1; roles + department/site scope; resolver vs queue boundaries; enrollment **Needs Attention** + pipeline UX; **Tour Scheduling V1**; **Enrollment Packet E2E Phase 1**; **Settings + Record UX Parity V1** (May 18); **AdminV2 performance closeout** (May 20–24); **Enrollment Packet Phase 2 review MVP** (P2-1–P2-4, ~May 21).
- **BOS groundwork shipped (maintain, do not expand as default sprint work):** needs-attention + enrich draft; Orchestrator + Task Assist V1.1; Workflow Assist V1 (narrow); Config/Layout Assist **foundation** (proposals + partial apply); **BOS UX coherence partial** (`OperationalProposalCardFrame`, execution receipts); **operational assist closeout** (deterministic assist routing, communication draft synthesis, channel-aware SMS/email review, Review Assist + drawer stability) — **`docs/product/bos-foundation.md`**, **`docs/sprints/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`**. **Forward planning only:** **`docs/sprints/future/bos_operational_assist_phase2.md`**.
- **Waitlist placement priority V1** — **opt-in** engine shipped; promotion mutator still open.
- **Partially implemented (near-term product):** Enrollment Packet Phase 2 (**P2-1–P2-4 shipped ~2026-05-21**; DCP, P2-5 BOS insight, UX hardening in **`later-phase/`**); waitlist **`move_to_waitlist`** / **`add_to_waitlist_placeholder`** replacement; Reporting V1.
- **Settings + Record UX Parity (May 2026 — complete):** Four-plane Settings control plane V1 — field policy UI + PATCH enforcement (opportunity/job enforceable subset), opportunity workflow v1 layout sections, org action placement editor, layout integrity panel, UX contract pass — **`docs/sprints/05_2026/settings_record_ux_parity_sprint.md`** §12–§13, **`docs/system/configuration-system.md`**. **Deferred:** Record Experience Builder, full `record_actions` migration, ops drawer mutate, `condition_config` editors, person/location field modal parity (linked-record inline PATCH **shipped** — **`linked_record_field_editing_v1.md`**).
- **Child lifecycle + work-unit convergence (May 2026 — closed):** Grain-aware `enrollment_pipeline` v2, candidate-grain waitlist + child-grain enrollment runtime, read-only case rollups, WU filter UX, strict-mode readiness tooling — **`docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`**. **Deferred follow-ons:** Settings Config Management (domain/NA presentation CRUD); strict-mode activation; server-side queue search; waitlist forecasting/capacity — see closeout § future sprints and **`waitlist_orchestration_phase2_architecture.md`**.
- **Waitlist priority fact truth (May 2026 — closed):** Child site/cohort on OCM, record-sourced V2 household facts, employee person UI, candidate repair, forms intake mapping, strict-mode **checklist documented** — **`docs/sprints/05_2026/waitlist_priority_fact_truth_child_scope.md`**. **`shadow_mode: false` not enabled**; site-scoped program catalog deferred.
- **Waitlist demo readiness (May 2026 — closed):** `waitlist_demo_v1` cleanup/reseed, person drawer doctrine, Settings locations hierarchy, demo walkthrough QA — **`docs/sprints/05_2026/waitlist_demo_readiness_final_pass.md`**. **Waitlist ranking validation + position controls (May 2026 — closed):** runtime position on V2 candidate rows, exact manual position, `qa:waitlist:ranking` / `qa:waitlist:shadow-mode` — **`docs/sprints/05_2026/waitlist_ranking_validation_position_controls.md`**.

### Paused / deprioritized (explicit)

**Do not schedule as primary roadmap execution unless product re-opens the lane:**

- **Autonomous agent catalog** — enrollment agent, subsidy ops agent, director assistant, monitoring agents, autonomous comms agent (**not implemented**; **later**).
- **Config/Layout Assist expansion** — full apply catalog, broad NL config (**partial** today; **freeze** new scope until operational checklist advances).
- **Workflow Assist template expansion** — beyond maintenance/bugfix (**partial** today).
- **New specialist agents** or Orchestrator capability growth beyond fixes and pilot hardening.

**Allowed without reopening the lane:** bugfixes, security/policy gates, staging parity, docs, and **assistive-only** hardening (item 10 below) when tied to pilots already using shipped surfaces.

### Next phase (near term — operational)

1. **Enrollment Packet Phase 2** / enrollment-forms completion — **`docs/sprints/05_2026/later-phase/enrollment_packet_phase_2.md`**.
2. **Waitlist completion** — activate **`move_to_waitlist`** (canonical catalog seeded **`20260602160000`**); retire **`add_to_waitlist_placeholder`**; pilot sign-off with ranking validation scripts.
3. **Tour scheduling Phase 2 Band B+** — **`docs/sprints/05_2026/later-phase/tour_scheduling_phase_2.md`** (Band A **complete** — **`completed/tour_scheduling_phase2_band_a_closeout.md`**).
4. **Settings / configuration control plane** — **V1 shipped** (May 18): four-plane Fields / Field grouping / Layouts (opportunity workflow v1) / Actions (org placements); remaining: Record Experience Builder, job/schedule layout editors, structured condition builders, forms field-policy parity.
5. **Required vs optional field behavior** — **shipped** for opportunity/job enforceable fields (Settings + server + drawer); expand enforceable subset + **forms** parity still open.
6. **Editable record UX** + **action button cleanup** — drawer policy UX, placement editor, linked-record inline PATCH **shipped**; full `record_actions` retirement and ops mutate **deferred**.
7. **Messaging hardening** — bindings, worker/cron, scheduled-send ops, deliverability.
8. **Reporting V1** — scoped reports beyond KPI strips.

### Following phase (after operational core)

- **Settings Config Management (enrollment WU presentation)** — Admin CRUD for domain labels, pill order, hide/show, Needs Attention bucket presentation — extend `queue_definition` + `opportunity_attention_rules` (**spec:** child-lifecycle closeout Card 15).
- **Child lifecycle strict-mode activation** — Flip runtime gates after OCM/backfill QA (readiness tooling shipped; activation deferred).
- **Server-side work-unit queue search/filters** — Replace client-only preview filtering when scale requires.
- **Waitlist orchestration continuation** — Phase 2 pilot → production; forecasting/capacity engine — **`docs/sprints/05_2026/waitlist_orchestration_phase2_architecture.md`**.
- **AI production hardening (assistive only)** — org **`ai_policy`**, RBAC, env gates, operator training for **existing** Orchestrator / Task Assist / attention enrich; **no** new agent personas.
- **Communications phase 2** (guided setup, notifications bell).
- **Placement priority V1.1** — workflow events, drawer mirror (sprint § Phase 2).
- **Config/Layout Assist** apply completion — only when settings/field parity reduces risk.

### Later buckets

- Billing / payments maturity (`product/billing-and-financials.md` — webhook truth **needs verification**).
- Subsidy workflows; document extraction AI — **planned**.
- Attendance, labor; **autonomous agents** — **roadmap only**.

---

## Recently completed (recent engineering — code-grounded)

Capabilities below exist in **`web/` / `supabase/`**; “complete” means **foundation shipped**, not **all product UX finished**.

- **Communications V1** — canonical enqueue, worker dequeue, webhooks, drawer/modal, bindings ( **`product/communications.md`** ).
- **Roles / permissions / CRM scope** — grant union + access profiles + API enforcement pattern (`roles-and-permissions.md`, `accessScope.ts`).
- **Queue vs record boundary** — documented and reinforced in **`record-system.md`** / **`workspace-system.md`**; QueueService previews vs entity GET.
- **Forms engine foundation** — migrations + admin/public routes + Forms hub (`documents-and-forms.md`).
- **Enrollment Packet E2E Phase 1** — **wall clock ~2026-05-07 → 2026-05-13** — sprint docs above.
- **Enrollment workspace** — pipeline queue definitions, Needs Attention buckets metadata, resolver reason codes.
- **Tour Scheduling V1** + **Phase 2 Band A (comms/reminders)** — **2026-05-11 → 2026-05-12** (V1); Band A **May 2026** — [`completed/tour_scheduling_phase2_band_a_closeout.md`](../sprints/05_2026/completed/tour_scheduling_phase2_band_a_closeout.md).
- **Waitlist placement priority V1** — **`placement_priority_v1`** metadata, presets registry, **`/adminV2/settings/placement-priority`** (Waitlist Ranking Policy settings V2 — **`docs/sprints/05_2026/waitlist_ranking_policy_settings_v2.md`**), queue **`_placement_priority`** + optional reorder (**opt-in**, off by default) — engineering **~2026-05-08 → 2026-05-16** (sprint closed); **`add_to_waitlist_placeholder`** still **not implemented**.
- **AI — needs attention + enrichment** — deterministic **`_attention_suggestion`** / **`_operational_summary`**; gated **`enrich-attention-suggestion`** (stub + OpenAI-compatible); permission **`ai.enrichment.use`** — migration **`20260520100000`**; **~2026-05-15 → 2026-05-16**.
- **AI — Orchestrator + Task Assist** — command bar, propose/apply comms, proposals API, scheduled sends (**`20260522140000`** claim-due), operational tasks — migrations **`20260521103000`**, **`20260522180000`** (staging `task_assist_draft` policy); **~2026-05-17 → 2026-05-23**.
- **AI — Workflow Assist V1** — propose/apply/explain, read cards, draft enrichment review — **`workflow_assist_draft`** staging policy **`20260523170000`**; **~2026-05-20 → 2026-05-23**.
- **Config / Layout Assist foundation** — **`config_layout_assist_proposals`**, field/section policy columns **`20260523120000`**, propose + lifecycle APIs — migration **`20260523140000`**; full apply catalog **partial**.
- **Record + Orchestrator hardening (May 2026)** — Inquiry children drawer **horizontal row grid**; `EntityDrawerSection` **`contentLayout: "block"`** for custom bodies; command-surface **SSR/hydration** fix (session restore after mount); **`setWorkspaceScope`** loop guard; drawer hooks ordered before early return (`opportunityDrawerPreviewSubtitle`). See **`completed/settings_control_plane_closeout.md`** (follow-on shipped), **`linked_record_field_editing_v1.md`**, **`agent_interaction_layer_v1.md`**.
- **Settings + Record UX Parity V1** — **2026-05-18** — four-plane control plane, field policy UI + PATCH enforcement (opportunity/job), layout integrity, action placement editor — sprint **`settings_record_ux_parity_sprint.md`** §12–§13.
- **AdminV2 performance closeout** — **~2026-05-20 → 2026-05-24** — reveal doctrine + route gates (`routeShellPipeline`, `adminV2PrimarySurfaceGate`); generic drawer pipeline; WU operational bootstrap + session cache; sticky workspace site filter; drawer queue prev/next + adjacent prefetch; **route-owned WU queue selection** (`workUnitQueueSelection.ts`, `focus_queue` on bootstrap); WU queue pill prefetch + partial count hydration. Sprint **`docs/sprints/05_2026/completed/adminv2_performance_closeout.md`** — broad speed sprint **paused**; follow-ons scoped only.
- **Child lifecycle + work-unit convergence** — **~2026-05-27 → May 2026 closeout** — `queue_definition` v2 domains/grains, OCM lifecycle doctrine, candidate waitlist runtime, child-grain enrollment lanes, client-side WU record filters, header/pill polish — **`docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`**.
- **Tour Scheduling Phase 2 Band A** — **May 2026** — booking lifecycle comms, reminders via `communication_scheduled_sends`, quiet hours, add-to-calendar links, queue/drawer staging polish — **`docs/sprints/05_2026/completed/tour_scheduling_phase2_band_a_closeout.md`**. **Band B+ deferred** (calendar sync, public hardening, settings UI).
- **Enrollment Packet Phase 2 — review MVP slice (P2-1–P2-4)** — **~2026-05-21** — `GET …/packet-sessions/[id]/review-rollup` (`buildPacketReviewRollupV1`); packet session review console (`PacketReviewRollupView`, `/adminV2/forms/packets/[packetSessionId]`); opportunity drawer review modal hardening; document provenance + **`submitted_record`** synthetic rows for non-PDF steps. **Not shipped:** DCP, P2-5 deterministic BOS insight, UX hardening cards — **`forms_documents_phase_2_packet_review_mvp.md`**, **`enrollment_packet_phase_2.md`**.
- **BOS UX coherence (partial)** — **~2026-05-20 → 2026-05-22** — shared **`OperationalProposalCardFrame`** on Task/Workflow/Config Assist cards; execution receipts + routing/governance copy; full sprint cards (active operational context, attention hierarchy) **partially implemented** — **`bos_ux_coherence_sprint.md`**.
- **BOS operational assist (routing + communication drafting)** — **~2026-05-21 → 2026-05-26** — deterministic handoff routing, synthesized customer-facing drafts (separate from recommendation copy), SMS/email channel bodies in review card, Review Assist placement + drawer reveal doctrine, native Work with BOS CTA — **`docs/sprints/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`**.
- **Child lifecycle + work-unit convergence** — **~2026-05-27 → 2026-06-01** (migrations **`20260601100000`–`20260601150000`**, **`20260602100000`**) — `enrollment_pipeline` v2 domains/grains, OCM lifecycle SoT, candidate waitlist + child enrollment runtime, client-side WU filters — **`docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`**.
- **Waitlist priority fact truth + demo readiness + ranking controls** — **~2026-05-28 → 2026-05-29** — OCM site/cohort, record-sourced V2 facts, demo reseed, runtime position display + manual adjustment — sprints in **`docs/sprints/05_2026/completed/`**.
- **Tour Scheduling Phase 2 Band A** — **~2026-05-27** — booking lifecycle comms/reminders via **`communication_scheduled_sends`** (`20260527150000`) — **`docs/sprints/05_2026/completed/tour_scheduling_phase2_band_a_closeout.md`**.
- **Forms MVP productization** — **~2026-05-28** — operational intent templates, simplified form setup, share/embed UX — **`docs/sprints/05_2026/completed/forms_mvp_productization.md`**.
- **Global Search V1** — **May 2026** — **`GET /api/admin/global-search`**, AdminV2 header search — **`docs/sprints/05_2026/completed/global_search_v1_closeout.md`**.
- **Person / location drawer convergence** — **~2026-05-29 → 2026-05-30** — shared record primitives, location metadata fields, household copy — **`docs/sprints/05_2026/completed/record_person_location_convergence_audit.md`** (closeout).
- **Person drawer layout runtime v1** — **~2026-05-31** — migration **`20260531140000`**, Settings read-only visibility — **`docs/sprints/05_2026/person_drawer_runtime_layout_migration.md`**.
- **Lifecycle action alignment (partial closeout)** — **~2026-05-31** — canonical action catalog stubs (`20260602160000`), Phase 1A entry actions, tour/enrollment alignment migrations, BOS drawer header attention — **`docs/sprints/05_2026/completed/lifecycle_closeout.md`** (~84%; **`move_to_waitlist`**, `mark_won` cutover, BOS wiring deferred).
- **Completion guardrails (contextual validation)** — **~2026-05-30** — structured validation on lifecycle execute paths — **`docs/sprints/05_2026/required_fields_completion_guardrails_audit.md`**.

---

## Features in progress (explicit)

| Area | State | Notes |
|------|--------|--------|
| **Enrollment / forms** | **Partially implemented** | **Phase 1 shipped**; **Phase 2 review MVP (P2-1–P2-4) shipped ~2026-05-21**; DCP, P2-5 BOS insight, UX hardening, comms presets still open |
| **Waitlist** | **Partially implemented** | V2 candidate rows + ranking validation **shipped**; **`move_to_waitlist`** stub in catalog — **`add_to_waitlist_placeholder`** still active until cutover |
| **Lifecycle actions (canonical catalog)** | **Partially implemented** | Phase 1A/1B + tour/enrollment alignment **~2026-05-31**; **`move_to_waitlist`**, `mark_won` deprecation, BOS invoke **open** |
| **AI (assistive groundwork)** | **Partially implemented** | Narrow surfaces **shipped**; **execution paused** for expansion — see **Paused / deprioritized** |
| **Config / Layout Assist** | **Partially implemented** | Foundation only; **deprioritized** until operational items 1–8 advance |

---

## Far enough along — customer readiness checklist

Before treating Alloy as **broadly customer-ready**, expect progress on:

1. **Enrollment/forms** — **Phase 1 done**; **Phase 2** complete for pilot scope; required-field semantics validated.
2. **Waitlist** — real promotion mutator; placement priority pilot sign-off (**V1** engine **opt-in**).
3. **Tour scheduling** — **V1 + Band A comms/reminders shipped**; **Band B+** (calendar, public hardening) per sprint doc.
4. **Settings / configuration** — UI parity to APIs (human settings paths — not agent-driven config).
5. **Editable records** — drawer/edit consistency with layouts and field policies.
6. **Action buttons** — consistent routing, permissions, event coverage.
7. **Messaging** — bindings, worker/cron, scheduled-send ops, monitoring.
8. **Reporting** — defined report set beyond KPI strips.
9. **AI (assistive pilots only)** — org **`ai_policy`**, RBAC, env gates for **existing** surfaces; operators understand **no autonomous execution** — **not** a blocker for general readiness if pilots do not require AI.

---

## Recommended next sprint sequence (authoritative ordering)

**Default execution order** — swap only when a hard dependency demands it. **Items 1–9 are operational product work; item 10 is assistive AI only; item 11 is explicitly later.**

1. **Enrollment Packet Phase 2** / enrollment-forms completion — **`docs/sprints/05_2026/later-phase/enrollment_packet_phase_2.md`**.
2. **Waitlist completion** — activate **`move_to_waitlist`**; retire **`add_to_waitlist_placeholder`**; validate placement + promotion with ops.
3. **Tour Scheduling Phase 2 Band B+** — calendar sync, public hardening, analytics — **`docs/sprints/05_2026/later-phase/tour_scheduling_phase_2.md`** (Band A closeout: **`completed/tour_scheduling_phase2_band_a_closeout.md`**).
4. **Settings / configuration UI parity** — **V1 shipped** (May 18); remaining: Record Experience Builder, job/schedule layout editors, forms field-policy parity, comms bindings self-serve.
5. **Required vs optional field behavior** — forms, drawers, layouts; **`requirement_policy`** (**needs verification** per surface).
6. **Editable record UX** — drawer editability vs layouts and permissions.
7. **Action button cleanup** — `executeAdminAction` registry, duplicates, permission gates.
8. **Messaging hardening / integration setup** — worker, cron, bindings, scheduled sends, monitoring.
9. **Reporting V1** — scoped reports/exports; not full BI.
10. **AI production hardening (assistive only)** — policy/RBAC/env for **existing** surfaces; pilot training — **no** new agent personas or Config/Layout Assist expansion unless product re-opens pause. **BOS operational assist foundation shipped** — maintain; optional bounded improvements per **`docs/sprints/future/bos_operational_assist_phase2.md`** only after messaging (item 8).
11. **Autonomous agents** — **later, not now** (enrollment, subsidy, director, monitoring personas).

**Standing engineering hygiene** (parallel-friendly): emitEvent coverage, person-first inbound parity, Stripe webhook mapping — **Additional sprint cards** below.

---

## Feature list — dates at a glance

Use this block for **velocity / stakeholder summaries**. Dates are **repo anchors** (migration filenames, documented sprint starts) unless you replace them with **release tags** from git.

| Feature | Start | Foundation / shipped | Product complete | Status |
|---------|--------|----------------------|------------------|--------|
| **Communications V1** | 2026-04-30 | 2026-05-05 | — | **Implemented** (core) |
| **Roles & permissions V1** | 2026-05-04 | 2026-05-05 | — | **Implemented** |
| **Enrollment pipeline + waitlist lanes** | 2026-04-30 | 2026-04-30 | v2 domains May 2026 | **Partially implemented** (grain + v2 closeout) |
| **Needs Attention** | 2026-04-30 | Apr–May 2026 | TBD | **Partially implemented** |
| **Forms engine V1** | 2026-05-06 | 2026-05-10 | TBD | **Partially implemented** |
| **Enrollment Packet E2E Phase 1** | 2026-05-07 | 2026-05-13 | — | **Implemented** |
| **Settings + Record UX Parity V1** | 2026-05-18 | 2026-05-18 | builder/deferred TBD | **Implemented** (V1) |
| **Enrollment Packet Phase 2 — review MVP** | ~2026-05-21 | ~2026-05-21 | DCP + P2-5+ TBD | **Partially implemented** |
| **AdminV2 performance closeout** | ~2026-05-19 | ~2026-05-24 | follow-ons scoped | **Implemented** (engineering) |
| **BOS UX coherence (partial)** | ~2026-05-20 | ~2026-05-22 | full sprint TBD | **Partially implemented** |
| **BOS operational assist (routing + comms drafting)** | ~2026-05-21 | ~2026-05-26 | Phase 2 planning only | **Implemented** (foundation) |
| **Child lifecycle + WU convergence** | ~2026-05-27 | ~2026-06-01 (`20260601130000` v2) | strict-mode activation TBD | **Implemented** (foundation) |
| **Waitlist ranking + position controls** | ~2026-05-28 | ~2026-05-29 | mutator TBD | **Partially implemented** |
| **Waitlist priority fact truth (child scope)** | ~2026-05-28 | ~2026-05-28 (`20260528120000`) | shadow_mode prod TBD | **Implemented** (pilot) |
| **Forms MVP productization** | ~2026-05-28 | ~2026-05-28 | intelligence/FD backlog TBD | **Implemented** (MVP) |
| **Global Search V1** | ~2026-05-29 | May 2026 | Phase 2 TBD | **Implemented** |
| **Person drawer layout runtime v1** | ~2026-05-30 | ~2026-05-31 (`20260531140000`) | builder TBD | **Partially implemented** |
| **Lifecycle action alignment** | ~2026-05-31 | ~2026-05-31 (`20260602160000`+) | full matrix TBD | **Partially implemented** (~84%) |
| **Completion guardrails (contextual)** | ~2026-05-30 | ~2026-05-30 | Settings surfacing TBD | **Partially implemented** |
| **Person / location drawer convergence** | ~2026-05-29 | ~2026-05-30 | Phase 2 governance TBD | **Implemented** (sprint closeout) |
| **Waitlist placement priority V1** | 2026-05-08 | ~2026-05-16 | mutator + V1.1 TBD | **Partially implemented** |
| **Tour Scheduling V1** | 2026-05-11 | 2026-05-12 | — | **Implemented** (V1) |
| **Tour Scheduling Phase 2 Band A** | 2026-05-27 | May 2026 | Band B+ TBD | **Implemented** (comms/reminders) |
| **AI — needs attention + enrich draft** | ~2026-05-15 | ~2026-05-16 (`20260520100000`) | — | **Implemented** (narrow) |
| **AI — Orchestrator + Task Assist V1.1** | ~2026-05-17 | ~2026-05-23 (`20260521103000`, `20260522140000`, `20260522180000`) | — | **Implemented** (narrow; human-in-loop) |
| **AI — Workflow Assist V1** | ~2026-05-20 | ~2026-05-23 (`20260523170000` policy) | — | **Partially implemented** |
| **Config / Layout Assist V1** | ~2026-05-23 | 2026-05-23 (`20260523140000`) | TBD | **Partially implemented** |
| **Scheduled comms sends (Task Assist)** | 2026-05-22 | 2026-05-22 (`20260522140000`) | — | **Implemented** (with worker ops **needs verification**) |
| **Communications phase 2** | TBD | — | TBD | **Planned** |
| **Roles phase 2** | TBD | — | TBD | **Planned** |
| **Reporting V1** | TBD | KPI strips exist | TBD | **Planned** |
| **Autonomous agent catalog** (enrollment, subsidy, comms, director, monitoring) | TBD | — | TBD | **Planned** — **paused** (not in current execution) |
| **AI agent expansion** (new specialists, Config/Layout Assist catalog, Workflow Assist templates) | — | — | — | **Paused** — maintain shipped groundwork only |

**Convention:** **Shipped** = capability usable as documented in topic files. **TBD** = still open or needs release tagging. Update this table when merges land.

---

## BOS / assistive roadmap (current vs future)

**Program status (May 2026):** **Deeper BOS capability expansion is paused.** Shipped surfaces remain **assistive groundwork** — narrow, env- and policy-gated, **human-in-the-loop**. **Do not overstate maturity.** **Near-future assistive expansion** runs **after** operational items 1–9 in **Recommended next sprint sequence** unless a pilot explicitly requires hardening (item 10). **Autonomous agents are later, not now.** Registry, routes, and permission matrix: **`docs/product/bos-foundation.md`** (implementation inventory + `web/lib/bos/`).

### 1. BOS assistive layer

| Capability | Today | Future (planned) |
|------------|--------|------------------|
| Needs-attention deterministic drafts + **Enhance draft** | **Implemented** (stub/OpenAI enrich route; copy-only preview) | Deeper personalization; org-tuned templates |
| Operational summary / queue previews | **Implemented** (derived payloads; deterministic queue order) | Cross-entity insights; director dashboards |
| Communication drafting (Task Assist) | **Implemented** (deterministic synthesis + channel-specific SMS/email bodies; propose → approve → **`executeCommunicationsSend`**) | Bounded AI wording provider; org tone; thread history — **`bos_operational_assist_phase2.md`** § A |
| Waitlist / placement recommendations | **Partially implemented** (deterministic placement priority; **no** LLM ranking) | AI-suggested promotion rationale (**needs product design**) |
| Document / intake extraction | **Not implemented** | Extraction assist on uploads (forms **P2-5+** / strategy) |
| Packet review assist (deterministic) | **Not implemented** (P2-5 planned; rollup read model **shipped**) | Read-only BOS summary on rollup input |
| Config command hints | **Partially implemented** (Orchestrator → Config/Layout Assist propose) | Broader natural-language config with audited apply |

### 2. Workflow AI

| Capability | Today | Future (planned) |
|------------|--------|------------------|
| Workflow read / explain | **Implemented** (Workflow Assist Explain v1; enrollment summaries) | Richer cross-workflow analytics |
| Workflow propose + apply (disabled templates) | **Partially implemented** (admin-gated; deterministic default) | More templates; guarded LLM branch suggestions |
| AI-assisted routing / branching | **Not implemented** | Suggested branches with human approval |
| AI-generated follow-ups | **Partially implemented** (Task Assist reminders/tasks — **not** workflow auto-writes) | Workflow-owned follow-up recipes |
| AI scheduling assistance | **Not implemented** (tours: rule/API booking + Band A comms — no AI slot suggestions) | Calendar-aware suggestions |

### 3. Agent layer (product personas)

| Agent persona | Today | Future (planned) |
|---------------|--------|------------------|
| **Orchestrator** (command bar) | **Implemented** — routes only; **no** side effects; **partial** UX coherence (proposal frame, receipts) | **Paused** — richer planning until operational core advances |
| **Task Assist** (comms, schedule, tasks) | **Implemented** (V1.1) | **Paused** — entity expansion; maintain + harden only |
| **Workflow Assist** | **Partially implemented** (V1) | **Paused** — new templates; maintenance only |
| **Config / Layout Assist** | **Partially implemented** (proposals + partial apply) | **Paused** — full apply catalog after settings/field parity |
| **Enrollment agent** | **Not implemented** | **Later** — autonomous catalog |
| **Subsidy ops agent** | **Not implemented** | **Later** |
| **Communications agent** (autonomous) | **Not implemented** (Task Assist = narrow assistive comms) | **Later** |
| **Director assistant** | **Not implemented** | **Later** |
| **Monitoring agents** | **Not implemented** | **Later** |

**Groundwork completed (not “full AI platform”):** org **`metadata.ai_policy`**, permission keys (**`ai.enrichment.use`**, **`config_assist.*`**), proposal/audit tables (**`task_assist_proposals`**, **`config_layout_assist_proposals`**, agent v0–v2 DEFINER RPCs), Orchestrator routing, telemetry hooks, staging policy migrations.

---

## Velocity / Delivery Highlights

**What this is:** Approximate **elapsed engineering windows** tied to **real artifacts** (migrations, route families, doc anchors above) — **not** forward-looking SLAs, headcount models, or marketing claims.

**What this is for:** A **traceable narrative** you can pair with git/release history: external diligence, customer proof points, hiring loops, and documenting **observed** throughput (including AI-assisted execution). Replace durations with **measured cycle time** from your tracker when you want investor-grade precision.

| Capability | Timeline *(observed / approximate)* |
|------------|-------------------------------------|
| **Roles + scoped department / site access** | **~1 day** — tight migration-led window (`20260504103000` + immediate enforcement wiring; refine with merge timestamps). |
| **Waitlist prioritization foundations** | **Started 2026-05-08** — **~2–4 days** estimated span for foundations *(placement preview, presets, lane semantics — full product still open; see Waitlist feature row)*. |
| **Forms engine V1 foundations** | **~4 days** — migration span **2026-05-06 → 2026-05-10** (foundation + follow-ons incl. packets `20260510120000`; wall-clock team time **not** identical). |
| **Communications V1 core** | **~1 sprint** — calendar anchors **2026-04-30 → 2026-05-05** (enqueue, worker, webhooks, drawer/modal, bindings). |
| **Needs Attention operational overlays** | **Incremental Apr–May 2026** — resolver + bucket metadata + workspace UX; multiple merges (e.g. enrollment pipeline + right-rail migrations **2026-04-30** onward). |
| **Tour Scheduling V1 (Phase 1)** | **2026-05-11 → 2026-05-12** — ~2 calendar days wall clock (migration-anchored **`20260511143000`**, **`20260512140000`**); align with git if drift. |
| **Enrollment Packet E2E Phase 1** | **2026-05-07 (Thu) → 2026-05-13** — enrollment engineering / polish window (parallel-friendly with other work; align with merge history). |
| **Waitlist placement priority V1** | **2026-05-08 → ~2026-05-16** — sprint closed; opt-in metadata + settings + queue projection. |
| **AI agents (attention + Orchestrator + Task Assist + Workflow Assist)** | **~2026-05-15 → 2026-05-23** — dense commit window; align per-route with migrations above. |
| **Child lifecycle + WU convergence** | **~2026-05-27 → 2026-06-01** — dense migration window (`202606011*`–`20260602100000`). |
| **Waitlist ranking + position controls** | **~2026-05-28 → 2026-05-29** — runtime position + QA scripts. |
| **Lifecycle action alignment (partial)** | **~2026-05-31** — canonical catalog + Phase 1A/1B + tour/enrollment migrations same day. |
| **Forms MVP productization** | **~2026-05-28** — Cards 0–6 closeout. |
| **Global Search V1** | **May 2026** — header search + scoped API. |
| **Person drawer layout runtime v1** | **~2026-05-31** — migration **`20260531140000`**. |
| **Config / Layout Assist foundation** | **~2026-05-23** — proposals table + field policy migration same week. |
| **Settings + Record UX Parity V1** | **2026-05-18** — single-day closeout sprint (Cards 0–9 + post-closeout). |
| **AdminV2 performance closeout** | **~2026-05-19 → 2026-05-24** — dense commit window; reveal gates, WU bootstrap, drawer pipeline, queue selection fix on **2026-05-24**. |
| **Enrollment Packet Phase 2 review MVP (P2-1–P2-4)** | **~2026-05-21** — rollup API + review console + drawer modal + provenance in one slice. |
| **BOS UX coherence (partial)** | **~2026-05-20 → 2026-05-22** — shared proposal frame + execution receipts; full sprint still open. |
| **BOS operational assist closeout** | **~2026-05-21 → 2026-05-26** — routing + synthesis + channel-aware drafts + drawer assist. |

**Guardrail:** If a row above disagrees with **git history**, **git wins** — update this table in the same pass as release notes.

---

## Feature tracking (detail)

Shipped features list **capabilities that exist in repo** at a high level. **Notes** capture explicit limitations.

### Feature: Communications V1 — core messaging (shipped)

- **Start:** 2026-04-30
- **Shipped:** 2026-05-05

#### Capabilities

- SMS + email **outbound** via canonical **`communication_threads`** / **`communication_messages`**, **`enqueueCanonicalOutboundMessage`**, **`message_queued`** event
- **Inbound SMS** on Python **backend** (canonical persistence, person-first)
- **Dispatcher:** **`POST /internal/messages/process`** (`backend/`) drains legacy **`public.messages`** and canonical **`communication_messages`**; cron (e.g. Render) + Next wake via **`INTERNAL_MESSAGES_PROCESS_URL`**
- **Webhooks (Next):** **`/api/webhooks/twilio/sms-status`**, **`/api/webhooks/resend`**
- **Threads** (entity-scoped, person-first alignment in drawer surfaces), **drawer + Quick Message modal**, **read/unread** admin APIs
- **Provider bindings** — admin settings + **`/api/admin/communications/bindings`** (`communication_provider_bindings`)

#### Notes

- **No global inbox** — entity-scoped UX only
- **No notification system** in V1 — header indicator removed; unread endpoints may remain for a future bell
- **No tenant self-serve** comms onboarding (SPF/DKIM wizard, BYO-number product) — admin-managed bindings + ops setup

### Feature: Communications — phase 2 (planned)

- **Start:** TBD
- **Shipped:** TBD

#### Capabilities (planned)

- Provider setup UI (guided); BYO number; email SPF/DKIM assisted flows; routing rules; notification system (header bell); thread ownership semantics

#### Notes

- **Not implemented** until scheduled; update when scope locks.

### Feature: Roles & permissions V1 — access + enforcement (shipped)

- **Start:** 2026-05-04 *(first-class scope tables — `supabase/migrations/20260504103000_user_access_scope_tables_v1.sql`)*
- **Shipped:** 2026-05-05 *(settings/users_roles permission gate — `20260505120100_settings_users_roles_permission.sql`; bundle with ongoing route wiring — refine from git tag if needed)*

#### Capabilities

- **Role model:** **`user_roles`** ↔ **`role_definitions.role_key`**
- **Capability union:** **`role_permission_grants`** → runtime **`permissionKeys`**
- **Scope model:** **`user_access_profiles`**, **`user_department_access`**, **`user_site_access`**
- **API enforcement:** **`getAdminAccessContextCached`** + **`accessScope.ts`** on opted-in routes

#### Notes

- **`PORTAL_ROLES`** (**`admin`** / **`ops`**) gates shell access only.
- **Not every** legacy admin read may be scoped — grep **`getAdminAccessContextCached`** when touching routes.
- **Dates:** migration anchors above; replace with **release/changelog** dates when publishing externally.

### Feature: Roles & permissions — phase 2 (planned)

- **Start:** TBD | **Shipped:** TBD — expanded permissions, action-level gates, multi-role, custom roles UI depth

### Feature: Forms engine V1 — foundation (partially implemented)

- **Start:** 2026-05-06 (schema landing — migration **`20260506100000_forms_engine_v1_foundation.sql`**)
- **Incremental milestones:** 2026-05-07 — 2026-05-10 *(follow-on migrations, e.g. submissions/metadata **`20260509134500`**, packets **`20260510120000_forms_packet_foundation.sql`** — not exhaustive)*
- **Enrollment Packet E2E Phase 1:** **Shipped** — **wall clock 2026-05-07 (Thu) → 2026-05-13** — see **`docs/product/documents-and-forms.md`**, **`docs/sprints/05_2026/enrollment_journey_packet_operations_v1.md`** (status banner).
- **Shipped (entire forms product “complete”):** TBD *(Phase 2 + vertical polish — **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**)*

#### Capabilities

- Tables: **`form_definitions`**, **`form_definition_versions`**, **`form_public_links`**, **`form_submissions`**, linkage tables per migrations
- **Admin:** **`/api/admin/forms/**`**, **`/adminV2/forms`**
- **Public:** **`/api/public/forms/[token]/**`**
- **Packets:** packet session / packet link routes; **CRM-anchored** packet launch, review, mapped PDF generation on approval, opportunity Documents merge

#### Notes

- **Enrollment Packet Phase 2** — **partially implemented**: **P2-1–P2-4 review MVP shipped ~2026-05-21**. **Still open:** DCP, P2-5 BOS insight, UX hardening cards — **`docs/sprints/05_2026/later-phase/enrollment_packet_phase_2.md`**, **`forms_documents_phase_2_packet_review_mvp.md`**
- **Required vs optional fields** — **needs verification** per published schema

### Feature: Waitlist (enrollment CRM) — partially implemented

- **Start (lanes / status in repo):** 2026-04-30  
- **Placement priority V1 shipped:** **~2026-05-08 → 2026-05-16** — **`placement_priority_v1`** on **`work_units.metadata`**, settings **`/adminV2/settings/placement-priority`**, queue **`_placement_priority`** + optional reorder (**opt-in**, off by default) — sprint **`priority_placement_orchestration_may_2026.md`**
- **Shipped (complete UX):** TBD *( **`add_to_waitlist_placeholder`** still a stub)*

#### Capabilities

- **`waitlisted`** status and queue lanes; KPI/view-model references
- **Placement priority V1** — preset-driven evaluation, lane-scoped positions, operator settings (not global waitlist truth across all pages)

#### Notes

- **`add_to_waitlist_placeholder`** admin action — **not implemented**
- **Needs verification:** org pilots with **`enabled: true`**; promotion workflows and notifications beyond preview ordering

### Feature: Enrollment workspace — pipeline + Needs Attention (partially shipped)

- **Start:** 2026-04-30 *(pipeline statuses/queues — **`20260430232500`**, **`20260430234000`**, related seeds)*  
- **Shipped (foundation):** **2026-04-30 — 2026-05** *(incremental; attention/right-rail cards — e.g. **`20260430241000_right_rail_workspace_v1.sql`**; resolver/bucket UX evolved in follow-up PRs)*  
- **Shipped (complete):** TBD *(operator parity, KPI alignment — see **Needs verification** table)*

#### Capabilities

- Enrollment **`work_units.queue_definition`** alignment with **`enrollmentPipelineQueueDefinitionV1`**; **`needs_attention`** overlay + optional **`needs_attention_buckets`** metadata; department pipeline rows — see **`docs/product/crm-system.md`**, **`docs/system/workspace-system.md`**.

#### Notes

- Overlaps **waitlist lanes**; keep **Waitlist** row separate for product tracking until placeholder actions retire.

### Feature: Forms Platform — program vision (strategy)

- **Start:** 2026-05-05
- **Shipped:** TBD

#### Capabilities (directional only)

- **`docs/product/documents-and-forms.md`** (long-term vision section) — intake/compliance/AI posture; **not** equal to current engine scope

#### Notes

- Strategy **≠** shipped product; keep **`documents-and-forms.md`** as **as-built** reference.

---

## Active fix / cleanup items

Tracked UX/product alignment work; close when verified in code or deferred with an issue link.

- Confirm **notification icon** stays absent from messages header in V1 (remove leftovers if any).
- **Drawer sections:** verify config-driven resolution from **`record_drawer_layouts`** / templates.
- **Tuition / pricing** section mismatch vs pricing helpers.
- **Section order:** tuition before “sources” (or equivalent) per layouts.
- **“Needs attention”** logic — operator-aligned rules (resolver + buckets).
- **Editable fields + config pass** — drawer editability vs **`record_layouts`** intent (**ties to roadmap checklist**).

---

## Working notes (person vs contact)

**Policy (as enforced in code):** `persons` are canonical; `customer_persons` is the canonical customer↔person relationship; `contacts` and related FKs are **legacy/compatibility**. New application logic should prefer **`primary_person_id`** when populated; contact-based messaging/document/vendor integrations remain **explicit exceptions**.

**Inventory + follow-ups:** `docs/audits/person-vs-contact-audit.md`.

**Opportunities: legacy rows:** Some `opportunities` rows may still have **`primary_contact_id`** set without **`primary_person_id`**. **Reads** must tolerate this; **writes** normalize toward **`primary_person_id`** where resolvable (`web/lib/opportunityIdentity.ts`). Full backfill is a follow-up project.

When verified in code or DB, fold conclusions into **`docs/platform/core/entity-model.md`**, **`docs/platform/governance/glossary.md`**, or supplemental **`docs/product/crm-system.md`** (vertical only) and shorten the matching bullet here.

---

## Working roadmap buckets (detail)

### CRM go-live

- Person-first writes via **`normalizeOpportunityWritePayload`**; inbound parity + backfill remain.
- KPI vs queue preview parity — **needs verification**.
- Opportunities use **`respondOpportunityEntityGet`** (not RRS for jobs parity).

### Configuration / settings

- Hardcoded workflow remnants — grep when planning.
- JSON validation for config columns.
- Record layouts + queue definitions — schema-versioned; **settings/record UX parity sprint shipped May 2026** (integrity panel, field policies subset, drawer errors) — **full** builder/migration still open (**`docs/system/configuration-system.md`**, sprint §12).

### Documents / forms / AI

- **Forms:** **`documents-and-forms.md`** — engine **partially implemented**; **Enrollment Packet E2E Phase 1 shipped**; Phase 2 sprint doc.
- **BOS:** **`product/bos-foundation.md`** — registry + envelopes shipped (Phases 1–3); assistive groundwork **narrow**; **expansion paused**; autonomous catalog **later** (see **BOS / assistive roadmap**, **Paused / deprioritized**).

### Billing / payments

- Stripe webhook mapping — **needs verification** per deployment.

### Scheduling / attendance / staffing

- **`schedules`** remains **job-attached** service scheduling (see **`entity-model.md`**).
- **Tour Scheduling V1** uses **`tour_bookings`** (not `schedules` rows) — **shipped** **2026-05-11 → 2026-05-12** (Phase 1); **Phase 2 Band A comms/reminders shipped May 2026** — [`completed/tour_scheduling_phase2_band_a_closeout.md`](../sprints/05_2026/completed/tour_scheduling_phase2_band_a_closeout.md). **Band B+** (calendar sync, public hardening, analytics) remains **roadmap**.

### Production readiness / security

- RLS review; service role inventory; server tracing — **needs verification**.

---

## Confirmed gaps

- **Opportunity vs contact vs person:** `docs/audits/person-vs-contact-audit.md`.
- **Event coverage:** `docs/audits/event-integrity-audit.md`.
- **CRM scoped access:** Not every route uses **`getAdminAccessContextCached`** — grep when adding surfaces.
- **Forms product completion:** Engine + **Forms MVP productization shipped ~2026-05-28**; **Enrollment Packet E2E Phase 1** **2026-05-07 → 2026-05-13**; **Phase 2 review MVP ~2026-05-21**; DCP + P2-5+ in **`later-phase/`** (`documents-and-forms.md`).
- **Waitlist actions:** **`move_to_waitlist`** in canonical catalog (**inactive** until activated); **`add_to_waitlist_placeholder`** still until cutover; placement priority V1 — **shipped opt-in** (`crm-system.md`).
- **Tour Scheduling:** **V1 + Band A comms/reminders shipped**; **Band B+ deferred** — [`later-phase/tour_scheduling_phase_2.md`](../sprints/05_2026/later-phase/tour_scheduling_phase_2.md).
- **Reporting V1:** KPI strips exist; **full reporting** — **not implemented**.
- **BOS:** Assistive groundwork **partially shipped**; **deeper capability expansion paused** — see **`bos-foundation.md`**; **no** autonomous enrollment/subsidy/monitoring agents in execution.
- **Config/Layout Assist:** Foundation only; apply catalog expansion **paused**.
- **Stripe webhooks:** May be **backend** URL — verify (`billing-and-financials.md`).

---

## Needs verification (from doc pass)

| Topic | Why |
|-------|-----|
| Share of `opportunities` using `primary_person_id` vs `primary_contact_id` | DB-dependent |
| RRS coverage beyond jobs | Flat selects may remain |
| Forms enrollment **Phase 1 E2E** shipped **2026-05-07 → 2026-05-13**; **Phase 2 review MVP (P2-1–P2-4) shipped ~2026-05-21**; **required/optional field** behavior still needs verification per surface | DCP + forms field-policy parity |
| AdminV2 performance closeout production monitoring | Dev perf marks exist; dashboards **needs verification** |
| WU queue selection from dept lanes | Route-owned `?queue=` + `focus_queue` shipped **2026-05-24**; pilot QA on all enrollment lanes |
| Waitlist **`shadow_mode: false`** in prod | Pilot checklist documented; **needs verification** before general enable |
| Lifecycle **`move_to_waitlist`** activation | Catalog seeded inactive **`20260602160000`**; cutover from **`add_to_waitlist_placeholder`** **needs verification** |
| Person drawer layout runtime v1 | Migration **`20260531140000`**; Settings visibility read-only — full builder **deferred** |
| WU strict-mode activation | Readiness tooling shipped; **`strict_mode` flip deferred** — child-lifecycle closeout |
| Child lifecycle backfill | Migration **`20260601150000`** — prod QA **needs verification** per org |
| Waitlist transitions beyond status + previews | Placeholder action |
| Attendance / staffing | Later / thin signal |
| OpenAPI / public SDK | Route handlers only |
| Server-side tracing | Client overlay only evidenced |
| Worker URL + cron for message dequeue | Ops confirmation |
| KPI vs queue numbers | Operator parity |
| AI org policy + env gates per pilot org | Staging migrations exist; production parity **needs verification** |
| Scheduled-send `process-due` cron | Ops confirmation (`INTERNAL_CRON_TOKEN`) |
| Placement priority enabled in prod work units | Opt-in; most tenants default off |

---

## Additional sprint cards

1. **emitEvent coverage audit** — Classify mutators; fix high-risk gaps (`event-integrity-audit.md`).
2. **Person-first inbound parity** — Lead capture paths.
3. **Queue vs entity parity** — Document preview-only fields per queue type.
4. **Stripe webhooks → payment state** — Map actual handler deployment.
5. **Documents storage** — RLS/retention facts.
6. **BOS routes & flags** — Org `ai_policy`, RBAC, env matrix in **`bos-foundation.md`** § Implementation inventory; registry in `web/lib/bos/bosCapabilityRegistry.ts`; pilot checklist per org.
7. **Config/Layout Assist apply catalog** — **Paused** until operational core advances; resume with settings/field parity.
8. **RRS expansion** — If/when entities move off flat selects.

---

## When this doc must be updated

When shipped vs partial status changes, checklist items close, sequencing shifts, verification completes, **Feature list — dates at a glance** needs new anchors, or **Velocity / Delivery Highlights** durations should reflect measured merge/release windows (especially waitlist **2026-05-08** onward).
