# Sprint: Canonical Enrollment Operating Model Seed (2026-05)

## Audit summary (pre-implementation)

| Area | Finding |
|------|---------|
| **Opportunity statuses (enrollment orgs)** | Seeded in DB migrations (e.g. `20260430232500_enrollment_pipeline_statuses_and_queue_buckets_v1.sql`): `new_inquiry`, `contact_attempted`, `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted`, `enrolling`, `waitlisted`, `enrolled`, `lost`. |
| **Queue definitions** | `work_units.queue_definition` v1 — enrollment pipeline WU updated in `20260430234000_enrollment_pipeline_queue_definition_grouped_buckets.sql` (grouped **Tour Completed / Follow-up** slice). |
| **Queue pills** | Rendered from `queue_definition.ui.sections` + `queues` — no second engine. |
| **Resolver reason codes** | `web/lib/opportunities/attentionPlatformCatalog.ts` + `opportunityAttentionResolver` — platform-owned codes only. |
| **Architecture conflict?** | **None.** Pipeline = execution slices on one work unit; Needs Attention = `needs_attention` queue + resolver overlay + configurable buckets. |

## Supported vs future operational lenses

| Lens | Resolver code(s) | Shipped in platform defaults? |
|------|-------------------|-------------------------------|
| Follow-up overdue | `follow_up_date_passed` | Yes (`DEFAULT_NEEDS_ATTENTION_BUCKETS`) |
| High-value stale | `high_value_stale` | Yes |
| Quote follow-up overdue | `stale_quote_followup` | Yes |
| Tour follow-up overdue | `follow_up_date_passed` | Yes (same code as follow-up overdue — intentional dual entry point; see `needsAttentionBuckets.ts`) |
| Tour date passed | `tour_date_passed` | Yes |
| Missing quote | `missing_quote_after_execution` | Yes |
| Waiting on staff | `waiting_on_staff` | Yes |
| Waiting on family | `waiting_on_family` | Yes |

**Future only (no resolver / data yet — do not seed):**

| Theme | Examples |
|-------|----------|
| Documents / forms | Enrollment incomplete, missing packet, immunization, subsidy forms |
| Tour scheduling UX | No-show lens, reschedule needed, never scheduled |
| AI / events | Parent stopped responding, conversion risk, escalation, predicted loss |

## Implementation delivered

1. **`web/lib/config/enrollmentPipelineQueueDefinitionV1.ts`** — Single validated source for canonical **Enrollment Pipeline** pills (aligned with grouped-buckets migration): New Inquiry → Lost, plus internal `pipeline_total` and exception lane `needs_attention`.
2. **`web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts`** — Uses the shared definition; validates org **status_definitions** against `CANONICAL_ENROLLMENT_PIPELINE_STATUS_KEYS`.
3. **`web/lib/opportunities/needsAttentionBuckets.ts`** — Expanded **`DEFAULT_NEEDS_ATTENTION_BUCKETS`** to eight enrollment lenses (canonical codes only).
4. **`web/lib/opportunities/opportunityAttentionConfig.ts`** — Operator-facing default **reason labels** (e.g. “Quote follow-up overdue”, “Missing quote”).
5. **Docs:** `docs/product/crm-system.md`, `docs/system/workspace-system.md`, `docs/system/configuration-system.md`.

## Overlap / conflict notes

- **Pipeline stages vs attention:** A record can be in **Enrolling** (execution slice) and still appear under **Needs Attention** — lenses are non-exclusive.
- **Duplicate reason in two buckets:** `follow_up_date_passed` is listed under both **Follow-up overdue** and **Tour follow-up overdue** so operators get two labeled entry points without new resolver logic.

## Tests

- `npx tsc --noEmit`
- `npx vitest run tests/opportunities/needsAttentionBuckets.test.ts tests/opportunities/operationalAttentionExplain.test.ts`

## Remaining gaps

- **Legacy bootstrap:** `CHILDCARE_VERTICAL_BOOTSTRAP_V1` still provisions older demo work unit keys (`pipeline_overview`, …) — intentional compatibility until a dedicated migration retires them.
- **Future lenses:** Document-only until resolver + data exist (see table above).
