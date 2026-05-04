# Roadmap and gaps

## Purpose

Single place for the **working roadmap**, **confirmed gaps**, **verification debt**, and **suggested sprint cards** — not a replacement for the issue tracker.

## Current state — roadmap buckets

Short, bucketed roadmap derived from current product areas — not a commitment calendar. Buckets align with platform surfaces in repo (2026-05-02 baseline); refresh dates as priorities shift.

### CRM go-live

- **Person-first writes:** Implemented server-side via **`normalizeOpportunityWritePayload`** / related helpers; remaining work is **inbound parity** (every lead capture path), **legacy row backfill**, and retiring contact-only assumptions in narrow integrations — not “greenfield” modeling.
- Queue/workspace parity: confirm KPI definitions match operator queues (`QueueService` vs KPI routes).
- Drawer parity: opportunities use **`respondOpportunityEntityGet`** surfaces (not RRS); long-term unification with jobs-style RRS is **roadmap**, not current behavior.

### Configuration / settings

- Finish migrating hardcoded workflow remnants (legacy audits archived — verify with grep when planning).
- Expand structured validation for all JSON config columns that affect operations.
- Admin UI for record layouts and queue definitions — keep schema-versioned.

### Documents / forms / AI

- Clarify documents storage and compliance story; fill `product/documents-and-forms.md` gaps.
- AI: document real agent routes, tool policy, and kill switches.
- Form capture — either document as vertical-specific or build shared primitive.

### Billing / payments

- Stripe webhook ↔ local state mapping doc + tests as source of truth.
- Refunds/credits model check against production usage.

### Scheduling / attendance / staffing

- Confirm whether attendance/staffing is roadmap or out-of-scope short term.
- Timezone correctness audit on org-boundary helpers for multi-timezone orgs.

### Production readiness / security

- RLS review for communications and payment tables (archived checklists moved — re-verify in Supabase).
- Service role usage inventory (`createAdminClient`, server service client).
- Observability: perf overlay exists client-side; server tracing **Needs verification**.

## Source of truth / key files

- This file; operating doctrine: `execution/operating-doctrine.md`.

## Guardrails — roadmap

This roadmap **does not** override principles in `core/system-overview.md`. If roadmap conflicts with architecture, update architecture first. Buckets are high level.

---

## Working notes (person vs contact)

**Policy (as enforced in code):** `persons` are canonical; `customer_persons` is the canonical customer↔person relationship; `contacts` and related FKs (`primary_contact_id`, `to_contact_id`, `owner_contact_id`, etc.) are **legacy/compatibility**. New application logic should prefer **`primary_person_id`** when populated; contact-based messaging/document/vendor integrations remain **explicit exceptions**.

**Inventory + follow-ups:** `docs/audits/person-vs-contact-audit.md`.

**Opportunities: legacy rows:** Some `opportunities` rows may still have **`primary_contact_id`** set without **`primary_person_id`** (historical ingest, GHL sync, or pre-migration data). **Reads** must tolerate this; **writes** normalize toward **`primary_person_id`** where resolvable (`web/lib/opportunityIdentity.ts`). A full backfill/migration of legacy rows is a follow-up project — not blocked on day-to-day operations.

When verified in code or DB, fold conclusions into **`docs/system/entity-model.md`**, **`docs/product/crm-system.md`**, or **`docs/core/glossary.md`** and shorten the matching bullet here.

---

## Confirmed gaps

- **Opportunity vs contact vs person:** Full inventory and sprint notes live in **`docs/audits/person-vs-contact-audit.md`**; remaining work is tightening inbound parity and messaging/document exceptions — not deleting compatibility tables.
- **Event coverage:** Route/mutation inventory and high-risk gaps are tracked in **`docs/audits/event-integrity-audit.md`**; treat that audit as the working list — not “all routes verified clean” until explicitly closed.
- **CRM scoped access (remaining coverage):** Department/site enforcement for lists, drawers, actions, and many **direct mutators** is in place (`getAdminAccessContextCached`, `web/lib/admin/accessScope.ts`); **not every** legacy admin read may be scoped — grep **`getAdminAccessContextCached`** / **`assert*AccessScope`** when adding surfaces.
- **Communications dequeue:** Canonical **enqueue** + **`message_queued`** + thread/message rows are in **`web/`**; **delivery** may still depend on **`INTERNAL_MESSAGES_PROCESS_URL`** / worker not defined under `web/app/api/internal/**` — treat as **Needs verification** per environment.
- **Documents/forms:** Upload + storage path is implemented (see `product/documents-and-forms.md`); **dedicated forms product / AI parsing** — **Not implemented** (or only vertical-specific) in repo scan.
- **AI production surface:** Agent HTTP routes exist under **`web/app/api/admin/agent/**`** with env gates — see `product/ai-system.md`.
- **Stripe webhooks:** End-to-end mapping from webhook handlers to `payments` state **Needs verification** (smoke tests reference a `stripe/webhook` backend URL — may not be this Next app).

## Needs verification (from doc pass)

| Topic | Why |
|-------|-----|
| Share of `opportunities` using `primary_person_id` vs `primary_contact_id` | Migration + backfill state unknown without DB |
| RRS coverage beyond jobs | Other entity types may still be flat selects |
| Attendance / staffing | Thin grep signal; may be vertical or future |
| OpenAPI / public SDK | Not found; APIs are route-handlers only |
| Server-side tracing | Client perf overlay exists; server APM unclear |

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

When priorities shift, verification completes, or a new confirmed gap emerges (incident/postmortem).
