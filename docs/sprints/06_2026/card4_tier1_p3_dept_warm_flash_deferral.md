# Card 4 Tier 1 — P3 (Department Warm Flash) Deferral

**Status:** Deferred from Card 4 Tier 1. NOT a faked/invented fix. Documented per the card rule
"do not invent data; if not clean, document the limitation and defer."

## Symptom
On a warm department navigation, `DeptPageLoadingGate` flashes for ≥1 frame even though the
department page cache restored work units / summaries synchronously. Cause:
`deptThroughputPresentation` (which gates `deptOperationalRegionReady`) is `null` on first paint and
is only resolved by a post-paint effect.

## What the cache CAN satisfy (verified)
`DepartmentPageCache` (`lib/workspace/adminV2WorkspaceSessionCache.ts`) stores `workUnits` (with
`key`) and `workUnitSummaries`. The presentation surface is therefore **synchronously determinable**
from cache for:
- **empty** depts → `"empty"` (no work units), and
- **non-pipeline** depts → `"wu_summaries"` (no work unit with `key === "enrollment_pipeline"`; no
  later upgrade applies, since the upgrade path requires `deptExpectsPipelineLanes`).

## What it CANNOT satisfy
- **Pipeline depts** (`enrollment_pipeline` work unit present, non builder-owned): the decision
  `pipeline_lanes` vs `wu_summaries` depends on `deptPipelineExecSurface.lanes`, which is **not
  cached**. Seeding `wu_summaries` here would risk a later upgrade reshape. Do not seed these.

## Why it was deferred from Tier 1 (the real blocker)
`deptThroughputPresentation` is reset to `null` by **three** effects in
`app/adminV2/workspace/dept/[departmentId]/page.tsx`:
- the restore layout-effect (~line 430),
- the bootstrap effect (~line 592),
- the dept-change **passive** effect (~line 1299).

A layout-effect seed alone paints correctly on first frame but is then **clobbered by the passive
reset at ~1299 (which runs after first paint)** → producing a *worse* sequence: content → gate →
content. A correct seed must coordinate all three reset sites to emit the same cache-derived seed
(`"empty"`/`"wu_summaries"`/`null`) instead of `null`. That multi-effect coordination cannot be
runtime-verified here and exceeds the "low-risk, high-confidence" Tier-1 bar.

## Precise plan for the follow-up (small, focused card)
1. Add a pure helper `computeWarmDeptThroughputSeed(workUnits): "empty" | "wu_summaries" | null`
   - `workUnits.length === 0` → `"empty"`
   - `!workUnits.some(w => key === "enrollment_pipeline")` → `"wu_summaries"`
   - else → `null` (pipeline-ambiguous; leave to the existing decision effect)
2. Replace the three `setDeptThroughputPresentation(null)` reset sites (≈430, 592, 1299) with the
   seeded value using the correct work-units source at each site.
3. Confirm via staging that warm non-pipeline/empty dept nav shows no gate frame, and that pipeline
   depts are unchanged (still resolve via the decision/upgrade effect).

## Acceptance impact
Card 4 Tier 1 acceptance #3 is conditional ("…if cache can legitimately satisfy the presentation
state"). The cache can satisfy it for empty/non-pipeline depts, but only the above follow-up
delivers it without a regression. P1 (gate min-height) already reduces the *visual severity* of the
flash by keeping the gate at the shell's footprint.
