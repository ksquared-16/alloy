# Roadmap and gaps

## Purpose

Single place for **phase timeline**, **completion vs in-progress tracking**, **shipped-feature rows**, **velocity highlights** (observed delivery windows), **active fix/cleanup items**, **confirmed gaps**, and **verification debt** — not a replacement for the issue tracker.

**Product maturity framing:** See **`docs/core/system-overview.md`** (“Product maturity”) — Alloy is **operationally usable for focused pilots**, not yet positioned as **generally customer-ready** without the checklist below.

---

## Timeline (phases)

Phases are **planning buckets**. Dates are narrative, not contractual.

### Current phase (late May 2026 — end-of-week snapshot)

- **Shipped / stable foundations:** Communications V1 core paths; roles + department/site scope enforcement on opted-in routes; fix-sprint alignment (identity, events, access, resolver vs queue boundaries); enrollment **Needs Attention** buckets + pipeline UX as documented in **`docs/product/crm-system.md`** / **`docs/system/workspace-system.md`**.
- **Partially implemented:** **Forms engine V1** (definitions, versions, submissions, public links, packet APIs — **`docs/product/documents-and-forms.md`**); **waitlist** pipeline status + queues + placement **preview** ( **`docs/product/crm-system.md`** waitlist section).

### Next phase (near term)

- Finish **enrollment/forms + waitlist** product behaviors (replace placeholders, E2E operator flows).
- **Tour scheduling** product depth beyond raw **`schedules`** APIs.
- **Settings / configuration UI** breadth (not everything operators need is exposed or parity-checked — see **`docs/execution/admin-settings-config-parity.md`** if loaded).
- **Required vs optional field** behavior for forms and drawer payloads — **needs verification** per surface.
- **Editable record UX** + **action button cleanup**.

### Following phase

- **Messaging hardening** + integration/setup polish (bindings, worker ops, vertical templates).
- **Reporting V1** (beyond existing workspace KPI strips / lifecycle KPI routes — **not** a full BI product today).

### Later buckets

- Billing / payments maturity (`product/billing-and-financials.md` — webhook truth **needs verification**).
- Subsidy workflows; document AI — **planned**, not mature.
- Scheduling expansion, attendance, labor optimization, broader AI agents (`product/ai-system.md`).

---

## Recently completed (recent engineering — code-grounded)

Capabilities below exist in **`web/` / `supabase/`**; “complete” means **foundation shipped**, not **all product UX finished**.

- **Communications V1** — canonical enqueue, worker dequeue, webhooks, drawer/modal, bindings ( **`product/communications.md`** ).
- **Roles / permissions / CRM scope** — grant union + access profiles + API enforcement pattern (`roles-and-permissions.md`, `accessScope.ts`).
- **Queue vs record boundary** — documented and reinforced in **`record-system.md`** / **`workspace-system.md`**; QueueService previews vs entity GET.
- **Forms engine foundation** — migrations + admin/public routes + Forms hub (`documents-and-forms.md`).
- **Enrollment workspace** — pipeline queue definitions, optional Needs Attention buckets metadata, resolver reason codes (`crm-system.md`, `workspace-system.md`).
- **Waitlist lane + placement preview** — status keys, queues, placement presets — **without** full waitlist action UX (placeholder action still in migrations).

---

## Features in progress (explicit)

| Area | State | Notes |
|------|--------|--------|
| **Enrollment / forms** | **Partially implemented** | Engine + routes + UI hub exist; packet-led enrollment **completion** and operator hardening ongoing |
| **Waitlist** | **Partially implemented** | Lanes + preview from **2026-04-30** migrations; **prioritization foundations started 2026-05-08**; **`add_to_waitlist_placeholder`** still not a real mutator |

---

## Far enough along — customer readiness checklist

Before treating Alloy as **broadly customer-ready**, expect progress on:

1. **Enrollment/forms** — finished operator + family flows using packets where intended; required-field semantics validated.
2. **Waitlist** — real transitions/actions replacing placeholders; placement rules validated with ops.
3. **Tour scheduling** — dedicated UX/workflows on top of **`schedules`** primitives.
4. **Settings / configuration** — critical knobs exposed in UI with parity to APIs (**needs verification** per surface).
5. **Editable records** — drawer/edit consistency with layouts and permissions.
6. **Action buttons** — consistent routing, permissions, and event coverage.
7. **Messaging** — integration setup hardening (envs, bindings, templates, monitoring).
8. **Reporting** — defined report set beyond ad hoc KPI strips.

---

## Recommended next sprint sequence (evaluate against actual bandwidth)

Order is **default sequencing** — swap when dependencies demand.

1. **Finish enrollment/forms + waitlist** — close placeholders, E2E tests, operator sign-off.
2. **Tour scheduling** — product UX on **`schedules`** / booking surfaces.
3. **Settings / configuration UI pass** — expose and validate parity (`record_layouts`, queue defs, forms metadata, comms bindings already partial).
4. **Editable records / record UX cleanup** — aligns with Active fix items (fields vs layouts).
5. **Action button cleanup** — `executeAdminAction` registry, duplicates, permission gates.
6. **Messaging hardening + integration setup** — worker reliability, binding UX, template QA (**not** claiming full self-serve).
7. **Reporting V1** — scope KPI/report endpoints vs export; avoid overstating BI maturity.

**Standing engineering hygiene** (parallel-friendly): emitEvent coverage audit, person-first inbound parity, Stripe webhook mapping verification — see **Additional sprint cards** below.

---

## Feature list — dates at a glance

Use this block for **velocity / stakeholder summaries**. Dates are **repo anchors** (migration filenames, documented sprint starts) unless you replace them with **release tags** from git.

| Feature | Start | Shipped / current status |
|---------|--------|---------------------------|
| **Communications V1** (core messaging) | 2026-04-30 | **Shipped** 2026-05-05 |
| **Roles & permissions V1** (access + API enforcement) | 2026-05-04 | **Shipped** 2026-05-05 *(approx.; access-scope migration `20260504103000`; settings gate `20260505120100`)* |
| **Enrollment pipeline + waitlist lanes** (status keys, queue defs, KPI hooks) | 2026-04-30 | **Foundation in repo** from **2026-04-30** migrations; **product completion** → TBD |
| **Needs Attention** (resolver + configurable buckets; enrollment UX) | 2026-04-30 | **Partially shipped** — landed with Apr–May 2026 enrollment workspace migrations + follow-up cards; polish → TBD |
| **Forms engine V1** (schema + admin/public APIs + hub) | 2026-05-06 | **Partially shipped** — foundation **2026-05-06**; follow-ons through **2026-05-10** (e.g. packets `20260510120000`); **enrollment/forms done** → TBD |
| **Waitlist** (lanes → prioritization product) | **Lanes/preview:** 2026-04-30 migrations; **prioritization foundations work started:** **2026-05-08** | **In progress** — placeholder action remains; **Shipped** → TBD |
| **Forms Platform** (strategy program) | 2026-05-05 | **Not a ship milestone** — see `docs/strategy/forms-platform.md` |
| **Communications phase 2** | TBD | **Not started** (planned) |
| **Roles phase 2** | TBD | **Not started** (planned) |

**Convention:** **Shipped** = capability usable as documented in topic files. **TBD** = still open or needs release tagging. Update this table when merges land.

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
- **Shipped (product-complete):** TBD *(enrollment/intake operator flows still in flight)*

#### Capabilities

- Tables: **`form_definitions`**, **`form_definition_versions`**, **`form_public_links`**, **`form_submissions`**, linkage tables per migrations
- **Admin:** **`/api/admin/forms/**`**, **`/adminV2/forms`**
- **Public:** **`/api/public/forms/[token]/**`**
- **Packets:** packet session / packet link routes under **`web/app/api/admin/forms/`**

#### Notes

- **Enrollment/intake completion** — **in progress**
- **Required vs optional fields** — **needs verification** per published schema

### Feature: Waitlist (enrollment CRM) — partially implemented

- **Start (lanes / status in repo):** 2026-04-30 *(enrollment pipeline migrations such as **`20260430232500_enrollment_pipeline_statuses_and_queue_buckets_v1.sql`**)*  
- **Prioritization foundations (active engineering):** **started 2026-05-08** *(calendar anchor for waitlist prioritization / foundations work — align with merge history when publishing)*  
- **Shipped (complete UX):** TBD *( **`add_to_waitlist_placeholder`** still a stub)*

#### Capabilities

- **`waitlisted`** status and queue lanes; KPI/view-model references; placement **preview** fields (`scoped_waitlist_position`) — preview-only semantics

#### Notes

- **`add_to_waitlist_placeholder`** admin action — **not implemented** (placeholder copy in migration)
- **Needs verification:** org-specific promotion workflows and notifications

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

- **Forms:** **`documents-and-forms.md`** — engine **partially implemented**; strategy in **`docs/strategy/forms-platform.md`**.
- **AI:** **`product/ai-system.md`** — narrow admin routes; broader agents **later**.

### Billing / payments

- Stripe webhook mapping — **needs verification** per deployment.

### Scheduling / attendance / staffing

- **`schedules`** primitives exist; tour product + attendance — **roadmap / later**.

### Production readiness / security

- RLS review; service role inventory; server tracing — **needs verification**.

---

## Confirmed gaps

- **Opportunity vs contact vs person:** `docs/audits/person-vs-contact-audit.md`.
- **Event coverage:** `docs/audits/event-integrity-audit.md`.
- **CRM scoped access:** Not every route uses **`getAdminAccessContextCached`** — grep when adding surfaces.
- **Forms product completion:** Engine exists; **enrollment E2E + required-field story** — **partially implemented** (`documents-and-forms.md`).
- **Waitlist actions:** Placeholder mutator — **not implemented** (`crm-system.md`).
- **Tour scheduling product:** Beyond **`schedules`** CRUD — **not implemented** as dedicated UX.
- **Reporting V1:** KPI strips / dept routes exist; **full reporting** — **not implemented**.
- **AI surface:** `web/app/api/admin/agent/**` — env-gated; **not** broad autonomous agents.
- **Stripe webhooks:** May be **backend** URL — verify (`billing-and-financials.md`).

---

## Needs verification (from doc pass)

| Topic | Why |
|-------|-----|
| Share of `opportunities` using `primary_person_id` vs `primary_contact_id` | DB-dependent |
| RRS coverage beyond jobs | Flat selects may remain |
| Forms enrollment E2E + required/optional field behavior | Routes exist; completion in flight |
| Waitlist transitions beyond status + previews | Placeholder action |
| Attendance / staffing | Later / thin signal |
| OpenAPI / public SDK | Route handlers only |
| Server-side tracing | Client overlay only evidenced |
| Worker URL + cron for message dequeue | Ops confirmation |
| KPI vs queue numbers | Operator parity |

---

## Additional sprint cards

1. **emitEvent coverage audit** — Classify mutators; fix high-risk gaps (`event-integrity-audit.md`).
2. **Person-first inbound parity** — Lead capture paths.
3. **Queue vs entity parity** — Document preview-only fields per queue type.
4. **Stripe webhooks → payment state** — Map actual handler deployment.
5. **Documents storage** — RLS/retention facts.
6. **AI routes & flags** — Concrete paths in `ai-system.md`.
7. **RRS expansion** — If/when entities move off flat selects.

---

## When this doc must be updated

When shipped vs partial status changes, checklist items close, sequencing shifts, verification completes, **Feature list — dates at a glance** needs new anchors, or **Velocity / Delivery Highlights** durations should reflect measured merge/release windows (especially waitlist **2026-05-08** onward).
