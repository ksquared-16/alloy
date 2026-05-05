# Roadmap and gaps

## Purpose

Single place for **phase timeline**, **shipped-feature tracking**, **active fix/cleanup items**, **confirmed gaps**, and **verification debt** — not a replacement for the issue tracker.

## Timeline (phases)

Phases are **planning buckets** aligned to current product direction (as of **2026-05**). Dates are narrative, not contractual.

### Current phase (May 2026)

- Communications V1
- Roles & permissions V1
- Fix sprint (alignment + performance)

### Next phase (May–June 2026)

- **CRM completion:**
  - Forms (inquiry + intake)
  - Tour scheduling
  - Document upload (non-AI) — upload exists; “completion” = product hardening + reporting surfaces as planned
  - Reporting V1

### Following phase

- Billing / payments (see `product/billing-and-financials.md` for as-built vs verified)
- Subsidy workflows
- Document AI (extraction + mapping) — **planned**; not production-complete in repo audit

### Later phase

- Scheduling expansion
- Attendance
- Labor optimization
- AI agents (broader than current admin agent HTTP routes — see `product/ai-system.md`)

---

## Feature tracking

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

- Provider setup UI (guided)
- BYO number
- Email config (SPF/DKIM) assisted flows
- Routing rules
- Notification system (header bell)
- Thread ownership semantics

#### Notes

- Not implemented until scheduled in engineering; update this block when scope locks.

### Feature: Roles & permissions V1 — access + enforcement (shipped)

- **Start:** TBD
- **Shipped:** TBD

#### Capabilities

- **Role model:** **`user_roles`** ↔ **`role_definitions.role_key`**
- **Capability union:** **`role_permission_grants`** → runtime **`permissionKeys`** (`resolveAdminAccessCore.ts`)
- **Scope model:** **`user_access_profiles`**, **`user_department_access`**, **`user_site_access`** (sites = **`locations`** with **`location_type = 'site'`**)
- **API enforcement:** **`getAdminAccessContextCached`** + **`web/lib/admin/accessScope.ts`** on scoped CRM/admin routes (deny-by-default)
- **Department + site filtering** on lists and mutations that opt in

#### Notes

- **Portal shell** uses a **small fixed** role-key gate (**`admin`** / **`ops`**) for `portalEligible` — not the same as per-route permission checks.
- **Not every** legacy admin read may be scoped — grep **`getAdminAccessContextCached`** when touching routes.
- **Ship date:** V1 behavior is **as-built in repo**; pin **`Start` / `Shipped`** to merge or release tags when documenting historically.

### Feature: Roles & permissions — phase 2 (planned)

- **Start:** TBD
- **Shipped:** TBD

#### Capabilities (planned)

- Expanded permission catalog usage across routes
- Action-level permissions
- Multi-role support per user/org
- Custom roles UI depth (beyond current RBAC admin)

#### Notes

- Track detailed requirements in the issue tracker when prioritized.

---

## Active fix / cleanup items

Tracked UX/product alignment work (from **2026-05** review); close here when verified in code or deferred with an issue link.

- Confirm **notification icon** stays absent from messages header in V1 (remove leftovers if any).
- **Drawer sections:** verify all sections that should be config-driven resolve from **`record_drawer_layouts`** / templates (no orphaned hardcoded blocks).
- **Tuition / pricing** section mismatch vs source of truth — reconcile drawer/data with pricing helpers.
- **Section order:** tuition before “sources” (or equivalent) per layouts.
- **“Needs attention”** logic — align queue/KPI rules with operator expectations.
- **Editable fields + config pass** — audit which drawer fields are editable vs read-only and align with record layout intent.

---

## Working notes (person vs contact)

**Policy (as enforced in code):** `persons` are canonical; `customer_persons` is the canonical customer↔person relationship; `contacts` and related FKs are **legacy/compatibility**. New application logic should prefer **`primary_person_id`** when populated; contact-based messaging/document/vendor integrations remain **explicit exceptions**.

**Inventory + follow-ups:** `docs/audits/person-vs-contact-audit.md`.

**Opportunities: legacy rows:** Some `opportunities` rows may still have **`primary_contact_id`** set without **`primary_person_id`**. **Reads** must tolerate this; **writes** normalize toward **`primary_person_id`** where resolvable (`web/lib/opportunityIdentity.ts`). Full backfill is a follow-up project.

When verified in code or DB, fold conclusions into **`docs/system/entity-model.md`**, **`docs/product/crm-system.md`**, or **`docs/core/glossary.md`** and shorten the matching bullet here.

---

## Working roadmap buckets (detail)

Short buckets for deeper planning — **supplement** feature tracking and timeline above; refresh when priorities shift.

### CRM go-live

- **Person-first writes:** Implemented server-side via **`normalizeOpportunityWritePayload`**; remaining work is **inbound parity**, **legacy row backfill**, retiring contact-only assumptions in narrow integrations.
- Queue/workspace parity: confirm KPI definitions match operator queues (`QueueService` vs KPI routes).
- Drawer parity: opportunities use **`respondOpportunityEntityGet`** surfaces (not RRS); long-term RRS unification is **planned**, not current.

### Configuration / settings

- Finish migrating hardcoded workflow remnants (verify with grep when planning).
- Expand structured validation for JSON config columns that affect operations.
- Admin UI for record layouts and queue definitions — keep schema-versioned.

### Documents / forms / AI

- Storage path: `product/documents-and-forms.md` — unified **forms engine** **not implemented** as a single primitive.
- AI: `product/ai-system.md` — agent HTTP routes + env gates; broader “agents” product is **later phase**.

### Billing / payments

- Stripe webhook ↔ local state: **needs verification** per deployment (may be backend service, not Next).
- Refunds/credits model check against production usage.

### Scheduling / attendance / staffing

- Beyond **`schedules`** + booking/admin flows: attendance/staff/labor — **later phase** / vertical-specific.

### Production readiness / security

- RLS review for communications and payment tables.
- Service role usage inventory.
- Server tracing — **needs verification**.

---

## Confirmed gaps

- **Opportunity vs contact vs person:** Full inventory in **`docs/audits/person-vs-contact-audit.md`**.
- **Event coverage:** **`docs/audits/event-integrity-audit.md`** — treat as working list until closed.
- **CRM scoped access (remaining routes):** Not every legacy admin read may use **`getAdminAccessContextCached`** — grep when adding surfaces.
- **Documents/forms:** Dedicated shared form builder / intake engine — **not implemented** (or vertical-only); see `product/documents-and-forms.md`.
- **AI production surface:** **`web/app/api/admin/agent/**`** with env gates — see `product/ai-system.md`.
- **Stripe webhooks:** Handler may live on **backend** URL, not `web/app/api/**` — verify per deployment (`product/billing-and-financials.md`).

## Needs verification (from doc pass)

| Topic | Why |
|-------|-----|
| Share of `opportunities` using `primary_person_id` vs `primary_contact_id` | Migration + backfill state unknown without DB |
| RRS coverage beyond jobs | Other entity types may still be flat selects |
| Attendance / staffing | Thin grep signal; later phase |
| OpenAPI / public SDK | Not found; APIs are route-handlers only |
| Server-side tracing | Client perf overlay exists; server APM unclear |
| Per-environment worker URL + cron for message dequeue | Documented pattern exists; ops confirmation |

## Guardrails — gaps

Do not remove a gap row until verified in code or DB; replace with a short **as-built** note in the relevant topic document.

---

## Recommended sprint cards

1. **emitEvent coverage audit** — Classify admin/public mutators as event-driven vs legacy; fix high-risk domains first.
2. **Person-first leads + opportunities** — Trace inbound routes and `primary_contact_id` / `primary_person_id` usage; define “done” for contact dependency.
3. **Queue vs entity parity** — Per queue type, document preview-only fields vs required entity GET / RRS.
4. **Stripe webhooks → payment state** — One diagram + code pointers aligned with `product/billing-and-financials.md`.
5. **Documents pipeline** — Storage, RLS, retention; update `product/documents-and-forms.md` with as-built facts only.
6. **AI routes & flags** — Replace verification debt in `product/ai-system.md` with concrete paths and constraints.
7. **RRS expansion** — Next entity types after jobs to move off flat selects, if any.

## When this doc must be updated

When a **shipped** feature’s scope changes, timeline shifts, a **fix/cleanup** item completes, verification completes, or a new confirmed gap emerges (incident/postmortem).
