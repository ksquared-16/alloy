# Sprint: Canonical Enrollment Operating Model Seed (2026-05)

## Audit summary (pre-implementation)

| Area | Finding |
|------|---------|
| **Opportunity statuses (enrollment orgs)** | Seeded in DB migrations (e.g. `20260430232500_enrollment_pipeline_statuses_and_queue_buckets_v1.sql`): `new_inquiry`, `contact_attempted`, `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted`, `enrolling`, `waitlisted`, `enrolled`, `lost`. |
| **Queue definitions** | `work_units.queue_definition` v1 — enrollment pipeline WU updated in `20260430234000_enrollment_pipeline_queue_definition_grouped_buckets.sql` (grouped **Tour Completed / Follow-up** slice). |
| **Queue pills** | Rendered from `queue_definition.ui.sections` + `queues` — no second engine. |
| **Resolver reason codes** | `web/lib/opportunities/attentionPlatformCatalog.ts` + `opportunityAttentionResolver` — platform-owned codes only. |
| **Visible Needs Attention lenses** | **Not** platform-global defaults — **`metadata.opportunity_attention_rules.needs_attention_buckets`** on department (or work unit). Childcare demo: **`enrollmentNeedsAttentionBucketsSeed.ts`** applied by **`ensureEnrollmentPipelineWorkUnitV1.ts`** when the department omits that key. |
| **Architecture conflict?** | **None.** Pipeline = execution slices on one work unit; Needs Attention = `needs_attention` queue + resolver overlay + configurable buckets. |

## Childcare enrollment seeded lenses (config, not code defaults)

Defined in **`web/lib/opportunities/enrollmentNeedsAttentionBucketsSeed.ts`** and written to **`departments.metadata.opportunity_attention_rules.needs_attention_buckets`** by **`ensureEnrollmentPipelineWorkUnitV1.ts`** (only if `needs_attention_buckets` is not already present on the department).

| Lens | Resolver code(s) |
|------|------------------|
| Follow-up overdue | `follow_up_date_passed` |
| High-value stale > 2 days | `high_value_stale` |
| Quote follow-up overdue | `stale_quote_followup` |
| Tour date passed — follow up | `tour_date_passed` |

Additional codes (**waiting on staff/family**, **missing quote**, etc.) remain resolver-supported; add buckets in Settings or metadata to surface them as tiles.

## Implementation delivered

1. **`web/lib/config/enrollmentPipelineQueueDefinitionV1.ts`** — Single validated source for canonical **Enrollment Pipeline** pills (aligned with grouped-buckets migration): New Inquiry → Lost, plus internal `pipeline_total` and exception lane `needs_attention`.
2. **`web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts`** — Applies shared **`queue_definition`**; validates org **status_definitions**; **seeds department Needs Attention buckets** from **`enrollmentNeedsAttentionBucketsSeed.ts`** when absent.
3. **`web/lib/opportunities/needsAttentionBuckets.ts`** — **`DEFAULT_NEEDS_ATTENTION_BUCKETS`** is **empty**; buckets resolve **only** from metadata when `needs_attention_buckets` is present.
4. **`web/lib/opportunities/opportunityAttentionConfig.ts`** — Operator-facing default **reason labels** (resolver copy).
5. **Docs:** `docs/product/crm-system.md`, `docs/system/workspace-system.md`, `docs/system/configuration-system.md`.

## Overlap / conflict notes

- **Pipeline stages vs attention:** A record can be in **Enrolling** (execution slice) and still appear under **Needs Attention** — lenses are non-exclusive.
- **Empty bucket config:** Resolver still evaluates **`needs_attention`**; department/workspace **tiles** stay empty until buckets are configured.

## Tests

- `npx tsc --noEmit`
- `npx vitest run tests/opportunities/needsAttentionBuckets.test.ts tests/opportunities/operationalAttentionExplain.test.ts`

## Remaining gaps

- **Legacy bootstrap:** `CHILDCARE_VERTICAL_BOOTSTRAP_V1` still provisions older demo work unit keys (`pipeline_overview`, …) — intentional compatibility until a dedicated migration retires them.
- **Future lenses:** Document-only until resolver + data exist.
