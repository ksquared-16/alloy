# CRM opportunity Needs attention — count semantics (Card 2C)

**Tuning / product truth:** Thresholds and policies are **not** edited in Admin Settings → “Attention & SLA Rules” (that UI is planned / inactive). See `docs/execution/admin-settings-config-parity.md`.

All **membership** for opportunity “needs attention” in CRM surfaces uses the same canonical evaluator: `resolveOpportunityAttention` (**resolver v2** — `OPPORTUNITY_ATTENTION_RESOLVER_VERSION`), with config from `resolveOpportunityAttentionConfigFromMetadata` (work unit or department `metadata`) and optional operational facet **`metadata.enrollment_operational`** (validated on admin PATCH via `enrollment_operational` body field).

**Resolver v2 additions (foundation):** multi-reason outputs with per-reason SLA tiers, deterministic **`priority_score`**, **`waiting`** facet, **`overdue_commitment`** (`metadata.commitment_due_at`), and wait-bucket reasons (`waiting_on_*`, `blocked_*`). Queue rows may expose **`_attention_reasons_detail`**, **`_attention_priority_score`**, **`_attention_waiting_bucket`** where enrichment runs.

**Histograms (`attention_reason_counts`):**

- **Semantics (multi-reason):** Each attention reason on an opportunity can increment **its own** histogram bucket. One inquiry with three reasons contributes **three** counts across buckets (not three on one bucket unless codes repeat).
- **Not unique records:** Sum of histogram bins **does not** equal “number of inquiries needing attention” unless every row has exactly one reason. **Do not** label rolled-up totals as “opportunities” without clarification.
- **Product / UX:** Before broader rollout, surfaces that show these counts should **say explicitly** that totals are **reason-level** (operational breadth) or switch copy to **primary-only** aggregation where that matches operator mental models.
- **Primary-only when needed:** Build pairs from `primary_reason` only per row and call `summarizeAttentionReasonCountsPrimaryOnly` (same math as the generic summarizer; name documents intent) — see `web/lib/workspace/attentionReasonCountsSummary.ts`.

**Deep links:** Prefer query param **`attention_reason_code`** (stable); legacy **`attention_reason`** (label) remains supported for one-off filters. When opening the Needs attention **tab** from Admin V2 deep links, combine with **`queue=needs_attention`** on the work-unit URL.

**Department lane buckets (`needs_attention_buckets`):**

- **Preferred / execution-aligned:** Pass **`work_unit_id`** (or rely on auto-resolution of the department’s **`needs_attention`** work unit). Response includes **`bucket_count_scope: "work_unit_needs_attention_list_cap"`** and **`opportunity_needs_attention_semantics`**. Counts are **unique inquiries** whose resolver **`reasons[]`** intersects each bucket’s **`reason_codes`** — aligned with opening the work-unit Needs attention queue and (for **single-code** buckets) applying **`attention_reason_code`**. Same candidate cap + sort path as **`loadOpportunityNeedsAttentionRows`** / **`getWorkUnitQueueItems`** (`NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP`, default **5000**). If **`candidate_window_saturated`** is true, more inquiries could match beyond the fetched window.
- **Legacy org preview:** When no work unit can be resolved, **`bucket_count_scope: "org_preview_cap_500"`** — buckets use **histogram sums** over **`attention_reason_counts`** from **`buildOpportunityAttentionQueueItems`** (reason occurrences, not unique inquiries; **500**-row org window). **Do not** compare those numbers to a work-unit tab.

**Multi-code buckets:** A bucket that lists **multiple** `reason_codes` counts an inquiry **once** if **any** listed reason appears in **`reasons[]`**. Work-unit filtering prefers **`attention_bucket`** (bucket `key`) for bucket-shaped lenses; **`attention_reason_code`** remains useful for single-code drill links.

**Visible buckets** come **only** from **`metadata.opportunity_attention_rules.needs_attention_buckets`** (work unit → department precedence). **Platform code does not ship enrollment lenses as defaults** (`DEFAULT_NEEDS_ATTENTION_BUCKETS` is empty). Childcare enrollment **demo** buckets are seeded via **`ensureEnrollmentPipelineWorkUnitV1.ts`** into **department metadata** (`web/lib/opportunities/enrollmentNeedsAttentionBucketsSeed.ts`). Additional reason codes (e.g. waiting-on, missing quote) are supported by the resolver but have **no tile** until a bucket lists them.

**Settings alignment:** Department **Attention & SLA Rules** configures bucket membership separately from **trigger thresholds** under **`opportunity_attention_rules`** (hours/days/SLA/policy). Counting semantics here are unchanged — thresholds only affect which inquiries qualify for resolver reasons inside the same caps.

**Counts still differ across surfaces** when cohorts or caps differ. No single number is universally “the org total” unless you align scope and cap.

## Surfaces

| Surface | Code path | Resolver? | Cohort | Cap / window | `total` meaning |
| -------- | --------- | --------- | ------ | ------------- | --------------- |
| Standalone attention API | `GET …/work-units/:id/opportunity-attention-queue`, `buildOpportunityAttentionQueueItems` | Yes | Org opportunities (+ admin record access scope); **not** filtered by `work_unit_id` | **500** rows, `updated_at` ascending | Matches in first 500-row window |
| Dept attention preview (**scoped**) | `GET …/departments/:id/opportunity-attention-preview?work_unit_id=…`, `buildWorkUnitScopedNeedsAttentionLaneBuckets` | Yes | `work_unit_id =` target Needs attention unit (+ access scope) | **`NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP` (5000)** candidate fetch | Unique inquiries per bucket; **`total`** = full lane card count |
| Dept attention preview (**legacy**) | `GET …/departments/:id/opportunity-attention-preview` (no resolvable WU) | Yes | Org opportunities (+ scope), not `work_unit_id` filtered | **500** rows | Org preview only; histogram-based bucket sums |
| QueueService summaries (WU cards) | `getWorkUnitQueueSummaries`, `needs_attention` queue | Yes | Opportunities with `work_unit_id =` that work unit (+ scope) | **800** when `includePreviews: false`; **5000** when previews built | Matches in capped candidate fetch |
| Work-unit queue tab / list API | `getWorkUnitQueueItems`, `GET …/queues/:wu/:queueKey`, `needs_attention` | Yes | Same as summaries (per work unit) | **5000** candidate fetch | Matches in capped set; pagination is client `limit`/`offset` over **filtered** list |
| Enrollment workspace signal `enrollment.needs_attention_count` | `useOperationsWorkspaceData` → standalone attention-queue or dept preview | Yes | Same as standalone/preview (**500** window) | **500** | Not comparable to QueueService tab counts |
| Department KPI strip “Needs attention” | `departmentNeedsAttentionSumSafe` over work-unit queue summaries | Yes (via summaries) | Sum of **per–work-unit** QueueService counts (each WU’s own cohort) | **800** per WU in typical card fetch | Bounded sum; unrelated to standalone **500** |
| Lifecycle KPI API | `GET …/opportunity-lifecycle-kpis` | No (funnel aggregates only) | Pipeline-scoped rows | **5000** KPI load cap | Does **not** expose needs-attention totals |

### Response metadata (additive)

- Standalone APIs return **`attention_evaluation`**: resolver version, `row_window_cap`, `raw_candidates_fetched`, `row_window_saturated`, sort, cohort label.
- Queue summaries and queue list payloads may include **`opportunity_needs_attention_semantics`**: `candidate_fetch_cap`, `raw_candidates_fetched`, `candidate_window_saturated`, `fetch_mode` (`summary_cap` vs `list_cap`).
- **`GET …/departments/:id/opportunity-attention-preview`** adds **`bucket_count_scope`** (`work_unit_needs_attention_list_cap` vs `org_preview_cap_500`) so clients label counts honestly.

Use these flags when QA compares numbers: if `*_saturated` is true, **true match count may be higher** than reported.

## Practical parity rule

For apples-to-apples checks, align **cohort + cap**:

- **Work-unit tab vs department KPI row for that unit**: QueueService summaries vs queue items — both work-unit scoped (still check `fetch_mode` / cap saturation).
- **Dept lane buckets vs work-unit tab (scoped path):** With **`bucket_count_scope: work_unit_needs_attention_list_cap`**, both use the **same** `work_unit_id`, resolver, and **5000** candidate cap — bucket totals for single-code drill should match filtered rows modulo pagination.
- **Dept lane (legacy org preview) vs work-unit tab:** Still divergent — **500** org window vs **5000** work-unit window.
- **Workspace attention card vs standalone API:** When still using org-wide standalone builders — **500-row** window; compare only within that cohort.

## Job Needs attention

`getNeedsAttentionSummary` and `jobs.needs_attention_count` operate on **jobs** — out of scope for this note.
