# Roadmap and gaps

## Purpose

Single place for **phase timeline**, **completion vs in-progress tracking**, **shipped-feature rows**, **velocity highlights** (observed delivery windows), **active fix/cleanup items**, **confirmed gaps**, and **verification debt** — not a replacement for the issue tracker.

**Product maturity framing:** See **`docs/core/system-overview.md`** (“Product maturity”). Alloy has **passed the “prove foundational architecture” phase** — CRM, workspace, communications, access control, forms, and the event/workflow spine are **real in code**. The program is now in **operational completion + AI orchestration readiness**: finish operator loops, harden UX and integrations, then layer assistive AI and narrow agents on stable primitives. **Focused pilots** remain appropriate; **general customer readiness** still depends on the checklist below.

---

## Timeline (phases)

Phases are **planning buckets**. Dates are narrative, not contractual.

### Current phase (late May 2026 — end-of-week snapshot)

**Theme:** **Operational completion + AI readiness** — not greenfield platform proof.

- **Shipped / stable foundations (carry-forward):** Communications V1; roles + department/site scope; resolver vs queue boundaries; enrollment **Needs Attention** + pipeline UX; **Tour Scheduling V1**; **Enrollment Packet E2E Phase 1** (see prior sprint docs).
- **Newly shipped since prior doc pass (code-grounded):**
  - **AI assistive layer (narrow):** deterministic needs-attention suggestions + **Enhance draft** (`POST /api/admin/ai/enrich-attention-suggestion`); operational summary attach + drawer strip — **`docs/product/ai-system.md`**.
  - **Orchestrator + Task Assist V1 / V1.1:** bottom command bar, entity search, SMS/email draft propose/apply, **`task_assist_proposals`**, **`communication_scheduled_sends`** + **`process-due`**, **`operational_tasks`** — human approval required; **no autonomous execution**.
  - **Workflow Assist V1 (narrow):** workflow read cards, deterministic propose/apply (disabled templates), Explain v1, optional draft enrichment review — **`workflow-assist`** routes; **no LLM** on default apply path.
  - **Waitlist placement priority V1:** configurable **`placement_priority_v1`** on work units, settings UI, queue **`_placement_priority`** previews and optional reorder — **opt-in**; sprint closed **`docs/sprints/05_2026/priority_placement_orchestration_may_2026.md`**.
  - **Configuration / Layout Assist (foundation):** **`config_layout_assist_proposals`** table, **`ConfigurationProposalV1`** contract, Orchestrator route + propose path; apply catalog **partial** — sprint **`docs/sprints/05_2026/configuration_layout_assist_v1.md`**.
- **Partially implemented:** **Enrollment Packet Phase 2**; **waitlist promotion** (`add_to_waitlist_placeholder` stub); **Config/Layout Assist** full apply surface; **Reporting V1**; **broad autonomous agents**.

### Next phase (near term)

- **Enrollment Packet Phase 2** — **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**.
- **Waitlist** — replace placeholder mutator; validate placement + promotion with ops pilots.
- **Tour scheduling Phase 2** — **`docs/sprints/05_2026/tour_scheduling_phase_2.md`**.
- **Config/Layout Assist** — complete reviewed apply paths for high-value layout/field operations.
- **Settings / configuration UI** parity — **`docs/execution/admin-settings-config-parity.md`** when loaded.
- **Field policy / required semantics** — **`field_definitions.requirement_policy`** landed **`20260523120000`**; cross-surface behavior **needs verification**.
- **Editable record UX** + **action button cleanup** + **messaging integration hardening**.

### Following phase

- **Reporting V1** (beyond KPI strips / lifecycle routes).
- **Communications phase 2** (guided setup, notifications bell, routing depth).
- **Placement priority V1.1** — workflow events, drawer mirror, persistence strategy (sprint § Phase 2).

### Later buckets

- Billing / payments maturity (`product/billing-and-financials.md` — webhook truth **needs verification**).
- Subsidy workflows; document extraction AI — **planned**.
- Attendance, labor, full **autonomous agent** catalog (enrollment agent, subsidy ops agent, director assistant, monitoring agents) — **roadmap only** until routed through existing APIs with policy gates.

---

## Recently completed (recent engineering — code-grounded)

Capabilities below exist in **`web/` / `supabase/`**; “complete” means **foundation shipped**, not **all product UX finished**.

- **Communications V1** — canonical enqueue, worker dequeue, webhooks, drawer/modal, bindings ( **`product/communications.md`** ).
- **Roles / permissions / CRM scope** — grant union + access profiles + API enforcement pattern (`roles-and-permissions.md`, `accessScope.ts`).
- **Queue vs record boundary** — documented and reinforced in **`record-system.md`** / **`workspace-system.md`**; QueueService previews vs entity GET.
- **Forms engine foundation** — migrations + admin/public routes + Forms hub (`documents-and-forms.md`).
- **Enrollment Packet E2E Phase 1** — **wall clock ~2026-05-07 → 2026-05-13** — sprint docs above.
- **Enrollment workspace** — pipeline queue definitions, Needs Attention buckets metadata, resolver reason codes.
- **Tour Scheduling V1** — **2026-05-11 → 2026-05-12**; migrations **`20260511143000`**, **`20260512140000`**.
- **Waitlist placement priority V1** — **`placement_priority_v1`** metadata, presets registry, **`/adminV2/settings/placement-priority`**, queue **`_placement_priority`** + optional reorder (**opt-in**, off by default) — engineering **~2026-05-08 → 2026-05-16** (sprint closed); **`add_to_waitlist_placeholder`** still **not implemented**.
- **AI — needs attention + enrichment** — deterministic **`_attention_suggestion`** / **`_operational_summary`**; gated **`enrich-attention-suggestion`** (stub + OpenAI-compatible); permission **`ai.enrichment.use`** — migration **`20260520100000`**; **~2026-05-15 → 2026-05-16**.
- **AI — Orchestrator + Task Assist** — command bar, propose/apply comms, proposals API, scheduled sends (**`20260522140000`** claim-due), operational tasks — migrations **`20260521103000`**, **`20260522180000`** (staging `task_assist_draft` policy); **~2026-05-17 → 2026-05-23**.
- **AI — Workflow Assist V1** — propose/apply/explain, read cards, draft enrichment review — **`workflow_assist_draft`** staging policy **`20260523170000`**; **~2026-05-20 → 2026-05-23**.
- **Config / Layout Assist foundation** — **`config_layout_assist_proposals`**, field/section policy columns **`20260523120000`**, propose + lifecycle APIs — migration **`20260523140000`**; full apply catalog **partial**.

---

## Features in progress (explicit)

| Area | State | Notes |
|------|--------|--------|
| **Enrollment / forms** | **Partially implemented** | **Phase 1 shipped**; **Phase 2** (proposals, field review, comms presets) open |
| **Waitlist** | **Partially implemented** | Lanes + **placement priority V1** shipped (**opt-in**); **`add_to_waitlist_placeholder`** still stub |
| **AI agents** | **Partially implemented** | Orchestrator + Task Assist + Workflow Assist + attention enrich **shipped narrow**; Config/Layout Assist **foundation**; **no** broad autonomous agents |
| **Config / Layout Assist** | **Partially implemented** | Proposals + propose route; apply catalog incomplete — sprint **`configuration_layout_assist_v1.md`** |

---

## Far enough along — customer readiness checklist

Before treating Alloy as **broadly customer-ready**, expect progress on:

1. **Enrollment/forms** — **Phase 1 done**; **Phase 2**; **`requirement_policy`** / required-field semantics validated on drawer + forms + public surfaces.
2. **Waitlist** — real promotion mutator; placement priority pilot sign-off (**V1** engine exists; **opt-in**).
3. **Tour scheduling** — **V1 done**; **Phase 2** depth per sprint doc.
4. **AI (production posture)** — org **`ai_policy`**, RBAC, env gates documented per org; operators trained that agents are **assistive** (propose → approve → canonical APIs), not autonomous.
5. **Settings / configuration** — UI parity to APIs; Config/Layout Assist apply paths for safe layout edits.
6. **Editable records** — drawer/edit consistency with layouts and field policies.
7. **Action buttons** — consistent routing, permissions, event coverage.
8. **Messaging** — bindings, worker/cron, scheduled-send ops, monitoring.
9. **Reporting** — defined report set beyond KPI strips.

---

## Recommended next sprint sequence (evaluate against actual bandwidth)

Order is **default sequencing** — swap when dependencies demand.

1. **Enrollment Packet Phase 2 + waitlist mutator** — Phase 2 doc; replace **`add_to_waitlist_placeholder`**; validate placement priority with ops.
2. **Config/Layout Assist apply completion** — close high-value, low-risk apply operations from approved proposals.
3. **Tour scheduling Phase 2** — reminders, public polish per **`tour_scheduling_phase_2.md`**.
4. **AI production hardening** — org policy templates, permission grants, kill switches, operator training materials; expand Workflow Assist templates only behind propose/apply gates.
5. **Settings / configuration UI parity** — layouts, queues, forms, comms bindings.
6. **Editable records + action button cleanup** — field policy alignment, `executeAdminAction` consistency.
7. **Messaging hardening** — scheduled-send cron verification, binding QA, deliverability playbooks.
8. **Reporting V1** — scoped exports/reports; do not claim full BI.

**Standing engineering hygiene** (parallel-friendly): emitEvent coverage, person-first inbound parity, Stripe webhook mapping — **Additional sprint cards** below.

---

## Feature list — dates at a glance

Use this block for **velocity / stakeholder summaries**. Dates are **repo anchors** (migration filenames, documented sprint starts) unless you replace them with **release tags** from git.

| Feature | Start | Foundation / shipped | Product complete | Status |
|---------|--------|----------------------|------------------|--------|
| **Communications V1** | 2026-04-30 | 2026-05-05 | — | **Implemented** (core) |
| **Roles & permissions V1** | 2026-05-04 | 2026-05-05 | — | **Implemented** |
| **Enrollment pipeline + waitlist lanes** | 2026-04-30 | 2026-04-30 | TBD | **Partially implemented** |
| **Needs Attention** | 2026-04-30 | Apr–May 2026 | TBD | **Partially implemented** |
| **Forms engine V1** | 2026-05-06 | 2026-05-10 | TBD | **Partially implemented** |
| **Enrollment Packet E2E Phase 1** | 2026-05-07 | 2026-05-13 | — | **Implemented** |
| **Waitlist placement priority V1** | 2026-05-08 | ~2026-05-16 | TBD (mutator + V1.1) | **Partially implemented** |
| **Tour Scheduling V1** | 2026-05-11 | 2026-05-12 | Phase 2 TBD | **Implemented** (V1) |
| **AI — needs attention + enrich draft** | ~2026-05-15 | ~2026-05-16 (`20260520100000`) | — | **Implemented** (narrow) |
| **AI — Orchestrator + Task Assist V1.1** | ~2026-05-17 | ~2026-05-23 (`20260521103000`, `20260522140000`, `20260522180000`) | — | **Implemented** (narrow; human-in-loop) |
| **AI — Workflow Assist V1** | ~2026-05-20 | ~2026-05-23 (`20260523170000` policy) | — | **Partially implemented** |
| **Config / Layout Assist V1** | ~2026-05-23 | 2026-05-23 (`20260523140000`) | TBD | **Partially implemented** |
| **Scheduled comms sends (Task Assist)** | 2026-05-22 | 2026-05-22 (`20260522140000`) | — | **Implemented** (with worker ops **needs verification**) |
| **Communications phase 2** | TBD | — | TBD | **Planned** |
| **Roles phase 2** | TBD | — | TBD | **Planned** |
| **Reporting V1** | TBD | KPI strips exist | TBD | **Planned** |
| **Autonomous agent catalog** (enrollment, subsidy, comms, director, monitoring) | TBD | — | TBD | **Planned** (roadmap only) |

**Convention:** **Shipped** = capability usable as documented in topic files. **TBD** = still open or needs release tagging. Update this table when merges land.

---

## AI / agent roadmap (current vs future)

Alloy is **approaching an AI-native operational platform phase** — assistive layers on top of **records, workflows, permissions, and canonical APIs**. **Do not overstate maturity:** today’s agents are **narrow, env- and policy-gated, and human-in-the-loop**. Full detail: **`docs/product/ai-system.md`**.

### 1. AI assistive layer

| Capability | Today | Future (planned) |
|------------|--------|------------------|
| Needs-attention deterministic drafts + **Enhance draft** | **Implemented** (stub/OpenAI enrich route; copy-only preview) | Deeper personalization; org-tuned templates |
| Operational summary / queue previews | **Implemented** (derived payloads; deterministic queue order) | Cross-entity insights; director dashboards |
| Communication drafting (Task Assist) | **Implemented** (propose → approve → **`executeCommunicationsSend`**) | Bulk, multi-recipient, vertical tone packs |
| Waitlist / placement recommendations | **Partially implemented** (deterministic placement priority; **no** LLM ranking) | AI-suggested promotion rationale (**needs product design**) |
| Document / intake extraction | **Not implemented** | Extraction assist on uploads (forms Phase 2+ / strategy) |
| Config command hints | **Partially implemented** (Orchestrator → Config/Layout Assist propose) | Broader natural-language config with audited apply |

### 2. Workflow AI

| Capability | Today | Future (planned) |
|------------|--------|------------------|
| Workflow read / explain | **Implemented** (Workflow Assist Explain v1; enrollment summaries) | Richer cross-workflow analytics |
| Workflow propose + apply (disabled templates) | **Partially implemented** (admin-gated; deterministic default) | More templates; guarded LLM branch suggestions |
| AI-assisted routing / branching | **Not implemented** | Suggested branches with human approval |
| AI-generated follow-ups | **Partially implemented** (Task Assist reminders/tasks — **not** workflow auto-writes) | Workflow-owned follow-up recipes |
| AI scheduling assistance | **Not implemented** (tour scheduling is rule/API-based V1) | Calendar-aware suggestions |

### 3. Agent layer (product personas)

| Agent persona | Today | Future (planned) |
|---------------|--------|------------------|
| **Orchestrator** (command bar) | **Implemented** — routes only; **no** side effects | Richer multi-turn planning (still no auto-execute) |
| **Task Assist** (comms, schedule, tasks) | **Implemented** (V1.1) | Expanded entity types beyond opportunities-first paths |
| **Workflow Assist** | **Partially implemented** (V1) | Oversight agents, failed-run triage automation |
| **Config / Layout Assist** | **Partially implemented** (proposals + partial apply) | Full layout/field/queue apply catalog |
| **Enrollment agent** | **Not implemented** | End-to-end enrollment coordination (**roadmap**) |
| **Subsidy ops agent** | **Not implemented** | **Roadmap** |
| **Communications agent** | **Partially implemented** (Task Assist covers narrow comms) | Autonomous thread management — **not** shipped |
| **Director assistant** | **Not implemented** | Cross-department operational briefings |
| **Monitoring agents** | **Not implemented** | Proactive anomaly detection |

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
| **Config / Layout Assist foundation** | **~2026-05-23** — proposals table + field policy migration same week. |

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

- **Enrollment Packet Phase 2** — **planned** (not shipped): field-level data change proposals, richer templates/reminders, non-PDF submission surfacing, AI assist — **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**
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

- **`docs/strategy/forms-platform.md`** — long-range intake/compliance/AI posture; **not** equal to current engine scope

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

When verified in code or DB, fold conclusions into **`docs/system/entity-model.md`**, **`docs/product/crm-system.md`**, or **`docs/core/glossary.md`** and shorten the matching bullet here.

---

## Working roadmap buckets (detail)

### CRM go-live

- Person-first writes via **`normalizeOpportunityWritePayload`**; inbound parity + backfill remain.
- KPI vs queue preview parity — **needs verification**.
- Opportunities use **`respondOpportunityEntityGet`** (not RRS for jobs parity).

### Configuration / settings

- Hardcoded workflow remnants — grep when planning.
- JSON validation for config columns.
- Record layouts + queue definitions — schema-versioned; **full settings parity** — **partially implemented** ( **`admin-settings-config-parity.md`** supplementary).

### Documents / forms / AI

- **Forms:** **`documents-and-forms.md`** — engine **partially implemented**; **Enrollment Packet E2E Phase 1 shipped**; Phase 2 sprint doc.
- **AI:** **`product/ai-system.md`** — Orchestrator, Task Assist, Workflow Assist, attention enrich, Config/Layout Assist foundation **shipped narrow**; **autonomous multi-agent catalog** remains **roadmap** (see **AI / agent roadmap** above).

### Billing / payments

- Stripe webhook mapping — **needs verification** per deployment.

### Scheduling / attendance / staffing

- **`schedules`** remains **job-attached** service scheduling (see **`entity-model.md`**).
- **Tour Scheduling V1** uses **`tour_bookings`** (not `schedules` rows) — **shipped** **2026-05-11 → 2026-05-12** (Phase 1); attendance, labor, and **Tour Phase 2** (calendars, comms, analytics) remain **roadmap**.

### Production readiness / security

- RLS review; service role inventory; server tracing — **needs verification**.

---

## Confirmed gaps

- **Opportunity vs contact vs person:** `docs/audits/person-vs-contact-audit.md`.
- **Event coverage:** `docs/audits/event-integrity-audit.md`.
- **CRM scoped access:** Not every route uses **`getAdminAccessContextCached`** — grep when adding surfaces.
- **Forms product completion:** Engine exists; **Enrollment Packet E2E Phase 1** **shipped** **2026-05-07 → 2026-05-13**; **required-field semantics + Phase 2** — still open (`documents-and-forms.md`, **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**).
- **Waitlist actions:** Placeholder mutator — **not implemented**; placement priority V1 — **shipped opt-in** (`crm-system.md`, placement sprint).
- **Tour Scheduling V1:** **shipped**; **Phase 2** open.
- **Reporting V1:** KPI strips exist; **full reporting** — **not implemented**.
- **AI:** Assistive agents **partially shipped** — see **`ai-system.md`** and **AI / agent roadmap**; **no** autonomous enrollment/subsidy/monitoring agents.
- **Config/Layout Assist:** Proposals + partial apply — **not** full settings replacement UI.
- **Stripe webhooks:** May be **backend** URL — verify (`billing-and-financials.md`).

---

## Needs verification (from doc pass)

| Topic | Why |
|-------|-----|
| Share of `opportunities` using `primary_person_id` vs `primary_contact_id` | DB-dependent |
| RRS coverage beyond jobs | Flat selects may remain |
| Forms enrollment **Phase 1 E2E** shipped **2026-05-07 → 2026-05-13**; **required/optional field** behavior still needs verification per surface | Phase 2 + field semantics |
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
6. **AI routes & flags** — Org `ai_policy`, RBAC, env matrix in `ai-system.md`; pilot checklist per org.
7. **Config/Layout Assist apply catalog** — Close approved operations; audit DEFINER/agent RPC parity.
8. **RRS expansion** — If/when entities move off flat selects.

---

## When this doc must be updated

When shipped vs partial status changes, checklist items close, sequencing shifts, verification completes, **Feature list — dates at a glance** needs new anchors, or **Velocity / Delivery Highlights** durations should reflect measured merge/release windows (especially waitlist **2026-05-08** onward).
