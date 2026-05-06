# CRM opportunity Needs attention — count semantics (Card 2C)

**Tuning / product truth:** Thresholds and policies are **not** edited in Admin Settings → “Attention & SLA Rules” (that UI is planned / inactive). See `docs/execution/admin-settings-config-parity.md`.

All **membership** for opportunity “needs attention” in CRM surfaces uses the same canonical evaluator: `resolveOpportunityAttention` (resolver v1), with config from `resolveOpportunityAttentionConfigFromMetadata` (work unit or department `metadata`).

**Counts still differ across surfaces** because each path applies a different **row cohort** and **fetch cap** before the resolver runs. No single number is universally “the org total” unless you run an uncapped query scoped to the cohort you care about.

## Surfaces

| Surface | Code path | Resolver? | Cohort | Cap / window | `total` meaning |
| -------- | --------- | --------- | ------ | ------------- | --------------- |
| Standalone attention API | `GET …/work-units/:id/opportunity-attention-queue`, `buildOpportunityAttentionQueueItems` | Yes | Org opportunities (+ admin record access scope); **not** filtered by `work_unit_id` | **500** rows, `updated_at` ascending | Matches in first 500-row window |
| Dept attention preview | `GET …/departments/:id/opportunity-attention-preview`, same builder | Yes | Same as standalone (org + access scope) | **500** rows | Same; config from department `metadata` |
| QueueService summaries (WU cards) | `getWorkUnitQueueSummaries`, `needs_attention` queue | Yes | Opportunities with `work_unit_id =` that work unit (+ scope) | **800** when `includePreviews: false`; **5000** when previews built | Matches in capped candidate fetch |
| Work-unit queue tab / list API | `getWorkUnitQueueItems`, `GET …/queues/:wu/:queueKey`, `needs_attention` | Yes | Same as summaries (per work unit) | **5000** candidate fetch | Matches in capped set; pagination is client `limit`/`offset` over **filtered** list |
| Enrollment workspace signal `enrollment.needs_attention_count` | `useOperationsWorkspaceData` → standalone attention-queue or dept preview | Yes | Same as standalone/preview (**500** window) | **500** | Not comparable to QueueService tab counts |
| Department KPI strip “Needs attention” | `departmentNeedsAttentionSumSafe` over work-unit queue summaries | Yes (via summaries) | Sum of **per–work-unit** QueueService counts (each WU’s own cohort) | **800** per WU in typical card fetch | Bounded sum; unrelated to standalone **500** |
| Lifecycle KPI API | `GET …/opportunity-lifecycle-kpis` | No (funnel aggregates only) | Pipeline-scoped rows | **5000** KPI load cap | Does **not** expose needs-attention totals |

### Response metadata (additive)

- Standalone APIs return **`attention_evaluation`**: resolver version, `row_window_cap`, `raw_candidates_fetched`, `row_window_saturated`, sort, cohort label.
- Queue summaries and queue list payloads may include **`opportunity_needs_attention_semantics`**: `candidate_fetch_cap`, `raw_candidates_fetched`, `candidate_window_saturated`, `fetch_mode` (`summary_cap` vs `list_cap`).

Use these flags when QA compares numbers: if `*_saturated` is true, **true match count may be higher** than reported.

## Practical parity rule

For apples-to-apples checks, align **cohort + cap**:

- **Work-unit tab vs department KPI row for that unit**: QueueService summaries vs queue items — both work-unit scoped (still check `fetch_mode` / cap saturation).
- **Workspace attention card vs standalone API**: Normally both use the **500-row** standalone path — should be close unless access scope or sort window differs.
- **Workspace attention vs work-unit queue tab**: Expect **systematic divergence** — different cohort (`org` slice vs `work_unit_id`), different caps (**500** vs **5000**).

## Job Needs attention

`getNeedsAttentionSummary` and `jobs.needs_attention_count` operate on **jobs** — out of scope for this note.
