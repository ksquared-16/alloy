# Forms intake inbox operationalization (OI-4)

**Status:** Shipped (May 2026)  
**Scope:** Workload visibility, operational row copy, inline quick review, minimal IA cleanup. No runtime changes.

---

## Part 1 — Visibility audit (root causes)

| Issue | Cause | Fix |
|-------|-------|-----|
| Test 1D not visible on **Workload** | `recentlySubmitted` lane had **no workload filter** — only appeared on separate Submissions tab | Added **Recent** workload pill |
| Test 1C buried in wrong sort | `needs_review` panel sorted by `meta` string, not activity time | Sort all submission items by `submitted_at` desc |
| Stale ordering in API | `dbListSubmissions` ordered by `created_at` only | Primary sort `submitted_at` desc, then `created_at` |
| Hub fetch cap | Workload loaded `limit=100` vs submissions hub `200` | Hub now `limit=200` + client re-sort |
| Default filter hid recent | When no review flags, defaulted to **Forms** catalog | Default chain: review → linking → **recent** → waiting → forms |

Test 1C appears under **Review**; Test 1D under **Recent** (newest first).

---

## Part 2 — Operational row copy

New helper: `web/lib/forms/submissionOperationalNarrative.ts`

Each workload/submission row now surfaces:
- **headline** — what happened (e.g. “New family intake created CRM records”, “Existing opportunity matched by guardian email”)
- **detail** — blocker or intake reason
- **operatorAction** — imperative next step

Wired into:
- `intakeWorkspaceFilters.buildIntakeWorkspaceFilterPanel`
- `submissionIntelligencePresentation.operationalSummary`

---

## Part 3 — Inline quick review

New: `SubmissionQuickReviewDrawer` — side drawer from workload + submissions inbox rows.

Supports:
- Operational summary + blockers
- **Confirm record linkage** (admin/ops) without full-page navigation
- Link to full case file for generate document / manual link

Entry points:
- Workload panel **Quick review** button
- Submissions inbox **Quick review** on review/linking/recent lanes

---

## Part 4 — IA consolidation (recommendations + minimal changes)

### Overlap map

| Surface | Role today | Recommendation |
|---------|------------|----------------|
| **Module nav** (Workload / Packets / Sessions / Submissions) | Primary IA | **Keep** — single top-level switch |
| **Workload pills** (Review / Linking / Recent / Waiting / Forms / Packets) | Operational drill-in on Workload tab | **Keep** — this is the resolution workspace |
| **KPI strip** | Aggregate counts + urgency framing | **Keep** — metrics layer; not row-level duplicate |
| **Orientation band** | Headline + primary CTA | **Trimmed** — removed duplicate Submissions/Sessions/Packets links (module nav covers) |
| **Submissions tab** | Full lane grid (4 lanes) | **Keep secondary** — deep inbox / audit view; Workload is default throughput path |

### What merges later (not this pass)

- Consider folding **Submissions tab** into Workload as expandable “All lanes” view when pill model feels sufficient
- Activity timeline on case file + inbox row (review stamps today live in meta only)
- Inline generate document in quick review drawer (admin-only; deferred)

### Minimal changes shipped

- Added **Recent** pill (closes visibility gap)
- Removed redundant orientation quick links
- Quick review drawer (reduces detail-page round trips for confirm linkage)

---

## Validation

- `web/tests/forms/submissionOperationalNarrative.test.ts`
- `web/tests/forms/intakeWorkspaceFilters.test.ts` (recent filter + defaults)
- Existing hub / inbox tests

---

## Related

- [forms_runtime_test_2_submission_review_finalize.md](./forms_runtime_test_2_submission_review_finalize.md)
- [forms-intake-runtime-phase.md](../system/forms-intake-runtime-phase.md)
