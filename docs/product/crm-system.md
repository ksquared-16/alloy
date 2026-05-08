# CRM system

## Purpose

Cover **opportunities**, pipeline status, CRM-adjacent admin behavior, and **scheduling** as it shows up today (tours, enrollment lanes, and `schedules` tied to CRM/booking)—with correct identity anchors (**persons** / **customer_persons**). **Communications** in the lead loop are documented in **`docs/product/communications.md`**.

## Current state

- **Table:** `opportunities` with org scoping, `customer_id`, `work_unit_id`, status keys, person/contact fields depending on migration age.
- **Admin:** `GET/PATCH /api/admin/opportunities/[id]`, entity drawer type `opportunities`, status definitions include **`opportunities`** and related types (`web/lib/admin/statusDefinitionsAdminEntityTypes.ts`).
- **Queues:** `QueueService` supports opportunity preview lists with field/sort allowlists and work-unit scoping tests (`web/tests/queues/QueueServiceOpportunityScoping.test.ts`).
- **Opportunity identity (writes):** All server paths that `insert` / `update` `opportunities` must run **`normalizeOpportunityWritePayload`** (`web/lib/opportunityIdentity.ts`) on the payload when identity keys may appear; metadata-only patches no-op. **`primary_person_id`** is canonical when present; **`primary_contact_id`** is legacy fallback only — resolution fills `primary_person_id` from `contacts.person_id` when possible. Python/sync use **`enrich_opportunity_payload_person_first`** before PostgREST writes.
- **Child facts vs metadata:** Enrollment opportunities do **not** rely on **`metadata`** for child names or DOB. **Household children** live in **`customer_members`** (`relationship = 'child'`, `is_active = true`), joined **`opportunities.customer_id` → `customer_members.customer_id`**. Queue **CRM compact** lanes use **`QueueService`** to emit **`_crm_compact_children`** and **`metadata.program_label`** for the Program column per child. See **`docs/system/workspace-system.md`** (CRM compact doctrine) and **`docs/system/entity-model.md`**.

## How it works

- Operators work opportunities inside **workspace queues** and open **AdminEntityDrawer** for full detail (entity GET with optional `surface`).
- Lifecycle presentation helpers: **`web/lib/admin/opportunityLifecyclePresentation.ts`**.
- KPI / department endpoints (e.g. opportunity lifecycle KPIs) read work unit `queue_definition`.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Admin opportunity API | `web/app/api/admin/opportunities/[id]/route.ts` |
| Queue opportunity handling | `web/lib/queues/QueueService.ts` |
| Status definitions | `web/lib/admin/statusDefinitionsResolve.ts` |
| Opportunity identity normalization | `web/lib/opportunityIdentity.ts` (`normalizeOpportunityWritePayload`, `insertOpportunityWithPersonFirst`) |

## Guardrails

- Prefer linking people via **`persons` + `customer_persons`**; **`contacts`** are **legacy/compatibility only** (drawer, messaging, workflows, documents, vendor/GHL paths).
- When an opportunity or job row has both identity FKs, **`primary_person_id` wins** for new CRM logic **when populated**; keep **`primary_contact_id`** for compatibility until messaging/workflows no longer require it.
- **Queue previews** are not authoritative for opportunity financials or document state — use entity GET.
- **CRM compact child column:** Preview child lines come from **`customer_members`** enrichment; do not reintroduce **`metadata.child_name`** (or similar) as the primary source for new work.

## Enrollment operational attention (Needs attention)

**Model:** Platform owns canonical **reason codes**, resolver (`resolveOpportunityAttention`), default severity/SLA, and safe **metadata schema** for tuning. **Buckets** (`needs_attention_buckets` / types) are **configurable groupings** of those codes — they do not define trigger math. **Criteria** (when a code fires) use supported knobs only — hours thresholds, stale day windows, wait SLA hours, policies, etc. — documented per code in Settings copy (`web/lib/opportunities/attentionReasonCriteriaCatalog.ts`) and merged via **`resolveOpportunityAttentionConfigFromMetadata`**. No arbitrary expressions.

**Configurable buckets (`needs_attention_buckets`)**

- **`key`** — Stable bucket id for URLs/copy.
- **`label`**, **`description`**, **`order`**, **`enabled`**
- **`priority`** (optional) — Lower runs first in department/workspace bucket lists; when omitted, **`order`** is used for sorting (see `compareNeedsAttentionBuckets` in `web/lib/opportunities/needsAttentionBuckets.ts`).
- **`icon`** (optional) — Lucide token string (**kebab-case**, e.g. `alert-circle`), resolved in AdminV2 via **`WorkspaceOperIcon`** — no queue-key switches in UI.
- **`reason_codes`** — Non-empty list of resolver reason codes belonging to the bucket.

**Precedence:** work unit `metadata` → department `metadata`, **only when** `opportunity_attention_rules.needs_attention_buckets` is defined on that layer (including an explicit **`[]`**). If the key is **omitted**, **no** lenses are shown — there are **no** childcare/enrollment platform fallbacks in code (`DEFAULT_NEEDS_ATTENTION_BUCKETS` is empty).

**Childcare enrollment demo:** **`CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED`** (`web/lib/opportunities/enrollmentNeedsAttentionBucketsSeed.ts`) defines four lenses; **`web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts`** writes them to **`departments.metadata.opportunity_attention_rules.needs_attention_buckets`** when that key is **not** already present (department-level, precedence-friendly). **`waiting_on_staff`**, **`waiting_on_family`**, **`missing_quote_after_execution`**, etc. remain **supported resolver reasons**; tenants add buckets in metadata or Settings when they want matching tiles.

| Lens (childcare seed / typical labels) | Canonical reason code(s) |
|----------------------|--------------------------|
| Follow-up overdue | `follow_up_date_passed` |
| High-value stale > 2 days | `high_value_stale` |
| Quote follow-up overdue | `stale_quote_followup` |
| Tour date passed — follow up | `tour_date_passed` |

**Execution vs overlay:** The **Enrollment Pipeline** work unit holds **lifecycle queue pills** (`work_units.queue_definition` — canonical shape in `web/lib/config/enrollmentPipelineQueueDefinitionV1.ts` and DB seeds). **Needs Attention** is the **`needs_attention` queue** and resolver overlay on the **same** opportunities — not a separate lifecycle pipeline or alternate work-unit engine.

**Department execution lane (pipeline rows):** On **`/adminV2/workspace/dept/:id`**, when a work unit exposes **`ui.layout === pipeline_with_attention`** and a **`ui.sections`** entry with **`key === pipeline`**, the left paired panel lists **one compact row per `queue_keys` entry** (labels/icons from matching **`queues[]`** entries, including optional **`icon`**). Counts use **`GET /api/admin/work-units/:id/queues?summary_mode=all`**. This is still the **same** queue-definition engine — not a second pipeline.

**Surfaces**

- **Department:** Needs Attention lane renders buckets **only from configured `needs_attention_buckets`** (otherwise a calm empty state). When the department has a **`needs_attention`** work unit, `GET …/opportunity-attention-preview?work_unit_id=…` returns **`bucket_count_scope: work_unit_needs_attention_list_cap`** — counts are **unique inquiries per bucket** inside the same capped candidate window **`loadOpportunityNeedsAttentionRows`** uses for the execution queue (see execution semantics doc). Resolver membership is unchanged when buckets are empty; only lens tiles are absent.
- **Work unit:** Needs Attention supports **`attention_bucket`** (bucket `key`) alongside **`queue=needs_attention`** for bucket-scoped lists; single-code drills may still use **`attention_reason_code`**. **All** pipeline queues apply the same subtle attention accent when resolver **`needs_attention`** is true on the row (not only inside the Needs Attention tab).
- **Drawer:** A compact **operational attention** strip (`OperationalAttentionHeaderStrip`) reads **`_operational_attention`** from entity GET and sits in the **record header** (below inquiry/status summary, above overview tabs) — not as a large Overview card.

Do **not** recompute attention membership or scores in React — consume resolver fields on rows and entity payloads only.

## Known gaps / risks

- **Needs verification:** KPI definitions vs what operators see in lanes (queue summaries vs department KPI routes).

---

## Communications (operational loop)

Canonical documentation: **`docs/product/communications.md`** (threads, enqueue, worker delivery, webhooks, bindings, legacy parallel paths).

---

## Scheduling (CRM/tour focus; jobs/attendance/staff later)

### Purpose

**Today:** `schedules` lifecycle for CRM/tour/booking-adjacent flows (admin, action links, workspace “today” lanes). **Later scope:** richer jobs/attendance/staff scheduling if/when product expands beyond current coverage.

### Current state

- **`schedules`** table with org scope; status definitions treat `schedules` as an admin entity type.
- Admin routes include **`web/app/api/admin/schedules/[id]/assign/route.ts`**, **`cancel/route.ts`**, **`reschedule/route.ts`** — typically check allowed status keys via **`assertAllowedStatusKey`** patterns.
- **Action links:** `consume-reschedule` and related routes update schedule rows consistent with workflow expectations (see comments in `web/app/api/action-links/consume-reschedule/route.ts`).
- **Workspace:** Department hooks fetch “today” schedules via **`/api/admin/schedules`** (`useDepartmentQueueData.ts`).
- **Not implemented (beyond `schedules` + booking/admin flows):** Dedicated attendance, punch clock, or multi-team **staff scheduling platform** — **Needs verification** for vertical-specific extensions.

### How it works

1. Schedule created/updated through booking or admin flows.
2. Status transitions validated against org definitions.
3. Customer/vendor interactions may consume **action links** → **events** → **workflow** updates.

### Source of truth / key files

| Concern | Location |
|---------|-----------|
| Schedule admin APIs | `web/app/api/admin/schedules/**` |
| Schedule overview labels | `web/lib/admin/scheduleOverviewLabels.ts`, `web/lib/admin/scheduleRecordSnapshot.ts` |
| Status rules | `web/lib/admin/statusTransitionRules.ts` |
| Department data hook | `web/hooks/useDepartmentQueueData.ts` |

### Guardrails

- **Do not** change schedule times without working through validated APIs (timezone + org local day bounds matter — see `web/lib/admin/orgLocalDayBounds.ts`, `timezoneContract`).
- **Do not** bypass workflows where reschedule reasons or notifications are workflow-owned.

### Known gaps / risks

- **Needs verification:** Complete cross-vertical scheduling UX (field services vs childcare).
- **Needs verification:** Labor compliance / attendance feature depth.

---

## When this doc must be updated

Pipeline or CRM table changes; opportunity status/role semantics; schedule states, workforce features, or calendar integration changes. Communications channels/enqueue — **`docs/product/communications.md`**.
