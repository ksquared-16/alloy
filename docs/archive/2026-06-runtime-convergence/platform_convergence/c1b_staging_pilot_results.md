# C1b Staging Pilot Results — Opportunity Drawer Overview Body Layout Runtime

**Path:** `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/c1b_staging_pilot_results.md`  
**Date:** 2026-06-07 (updated staging cutover acceleration)  
**Status:** Flicker fix + max-hold merged to staging; **enable Vercel staging flags + redeploy for live pilot**  
**Staging tip:** `0134cc0b` — flicker fix, max-hold timeout (1750ms), queue shadow foundation, effective layout inspector  
**Prior C1b merge:** `a80b793d` (initial overview body pilot @ `5b19e871`)  
**Review:** [`convergence_review_c1b_opportunity_overview_body.md`](./convergence_review_c1b_opportunity_overview_body.md) — APPROVED

---

## Summary

| Layer | Status | Notes |
|-------|--------|-------|
| Merge to `origin/staging` | **PASS** | `0134cc0b` (flicker + max-hold + queue shadow) |
| Automated test suite | **PASS** | 27 layout/C1b tests + compile gate (2026-06-07) |
| Code-level flag defaults | **PASS** | All C1b gates default **off** |
| Live staging flag-off UI | **PENDING** | Requires post-deploy manual QA (§A) |
| Live staging flag-on pilot | **PENDING** | Requires Vercel env + manual QA (§B) |

---

## Merge verification

| Item | Result |
|------|--------|
| Review doc on staging | **PASS** — `convergence_review_c1b_opportunity_overview_body.md` @ `7cf2cfdc` |
| Branch merged | **PASS** — `cursor/c1b-opportunity-drawer-layout-runtime-pilot` → staging |
| Merge commit | `a80b793dbd20784d2a4dce6d01160b424ba5f0a5` |
| Files in merge | 22 files (+1760 / −89 lines); 0 migrations |
| Sensitive paths excluded | **PASS** — no Person/Child/QueueBlock/nav/seed/Admin cutover |

---

## Automated verification (pre/post merge)

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutRuntimeBodyErrorBoundary.test.tsx \
  tests/layout/opportunityDrawerLayoutRuntimeBody.test.tsx \
  tests/adminV2/viewModel/opportunityDrawerVmRuntimeCompileGate.test.ts \
  tests/adminV2/viewModel/vmDrawerRuntime.test.ts \
  tests/layout/layoutRuntimeFlags.test.ts
```

**Result:** 40/40 passed (2026-06-07, merge gate).

Targeted `tsc --noEmit` on C1b paths: **clean**.

---

## Flag defaults (code confirmation)

| Flag | Env var(s) | Default | Verified |
|------|------------|---------|----------|
| Master runtime | `LAYOUT_RUNTIME_ENABLED`, `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED` | **off** | `readFlag(..., false)` in `featureFlag.ts` |
| Opportunity drawer | `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER`, `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER` | **off** | same |
| Body cutover | `isLayoutRuntimeOpportunityDrawerBodyEnabled*` | requires both above | off when either unset |
| Shadow diagnostics | `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_SHADOW_DIAGNOSTICS` | **off** | independent |

**Rollback:** disable `LAYOUT_RUNTIME_ENABLED` + `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED` (and optionally per-entity flags) → VM overview body only. No code deploy required beyond env change + redeploy.

---

## A. Flag-off verification (live staging — PENDING)

**Environment:** Staging deploy of `a80b793d` with **default flags** (no C1b env vars set).

| # | Check | Expected | Result | Notes |
|---|-------|----------|--------|-------|
| A1 | Deploy includes merge commit | `a80b793d` or later | **PENDING** | Confirm Vercel staging deployment SHA |
| A2 | Open Opportunity from work-unit queue | Drawer opens normally | **PENDING** | |
| A3 | Overview tab body | VM `OpportunityDrawerInquiryWorkflowOverview` | **PENDING** | No `data-drawer-layout-runtime-overview` |
| A4 | Header / title / status | Unchanged VM chrome | **PENDING** | |
| A5 | Actions menu / header controls | Unchanged | **PENDING** | |
| A6 | Lifecycle rail | Unchanged VM rail | **PENDING** | |
| A7 | Tab strip | Unchanged VM tabs | **PENDING** | |
| A8 | Queue navigation (prev/next) | Unchanged | **PENDING** | |
| A9 | No layout runtime body visible | No layout sections from `LayoutRuntimeDrawerBodyView` | **PENDING** | |
| A10 | Console / Sentry | No new C1b-related errors | **PENDING** | |

**Tested org:** _TBD — recommend `DEMO_RESET_ORG_ID` / Seed World reference org once deploy confirmed_  
**Tested opportunity IDs:** _TBD_  
**Screenshots:** _TBD — attach AdminV2 opportunity drawer overview (flag-off)_

---

## B. Flag-on pilot verification (live staging — PENDING)

**Enable in Vercel staging env (then redeploy):**

```
# Required — opportunity drawer overview body cutover
LAYOUT_RUNTIME_ENABLED=1
NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=1
LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=1
NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=1
```

**Optional — queue layout shadow telemetry only (no visible row change):**

```
LAYOUT_RUNTIME_OPPORTUNITY_QUEUE=1
NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_QUEUE=1
```

Queue shadow requires master runtime flags above. Console emits `[layout_runtime_shadow:opportunity_queue_row]` when an opportunity lane mounts.

**Max hold:** layout fetch falls back to VM body after **1750ms** (`layout_fetch_timeout`) if the API hangs.

| # | Check | Expected | Result | Notes |
|---|-------|----------|--------|-------|
| B1 | Overview body source | Hold skeleton → `data-drawer-layout-runtime-overview="true"` (no VM flash) | **PENDING** | Flicker fix @ `2816cc40` |
| B2 | Read-only | `data-layout-runtime-readonly="true"`; no inline field editors in layout body | **PENDING** | |
| B3 | Header / tabs / status / actions | VM-owned; visually unchanged | **PENDING** | |
| B4 | Lifecycle rail | VM-owned; unchanged | **PENDING** | |
| B5 | Operator-safe labels | No raw UUIDs, OCM, `inquiry_child`, `customer_member`, or refKeys in UI | **PENDING** | Inspect DOM text + network |
| B6 | Resolve/fetch failure fallback | VM overview body if API 404/422 | **PENDING** | Optional: temp disable API route flag |
| B7 | Render failure fallback | VM overview if layout subtree throws | **PENDING** | Covered by unit test; optional staging inject |
| B8 | Unsupported items | Omitted (fail-closed), not crash | **PENDING** | Future-module widgets absent |
| B9 | Disable flags → redeploy | VM overview restored | **PENDING** | Rollback drill |
| B10 | Console on render error | `[layout_runtime_body:render_error]` diagnostic only; operator sees VM body | **PENDING** | |
| B11 | Effective layout inspector | `/adminV2/settings/layouts/effective` resolves source/key | **PENDING** | Also in drawer C1b debug `<details>` |
| B12 | Fetch timeout fallback | VM body after ~1.75s if API hangs | **PENDING** | `layout_fetch_timeout` in debug panel |

**Tested org:** _TBD_  
**Tested opportunity IDs:** _TBD — use workflow_v1 inquiry opportunities with published/default drawer layout_  
**Screenshots:** _TBD — flag-on overview body + header chrome unchanged_

---

## Defects found

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| — | — | None from automated gate | — |

_Live staging defects to be recorded here after §A/§B manual QA._

---

## Rollback confirmation

| Method | Verified |
|--------|----------|
| Set `LAYOUT_RUNTIME_ENABLED=0` + `NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED=0` | Code path returns VM body — **PASS** (unit tests + flag tests) |
| Set `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=0` alone | Body cutover off while master runtime could remain on for other future gates — **PASS** (flag layering) |
| Redeploy after env change | Standard Vercel rollback — **PENDING** live drill (B9) |

---

## Operator QA procedure (quick reference)

1. Confirm staging deploy SHA ≥ `0134cc0b`.
2. Run §A checklist with flags **unset** (default).
3. Set the four C1b flags in Vercel staging → redeploy.
4. Run §B checklist on 1–2 known inquiry opportunities.
5. Disable flags → redeploy → confirm VM body restored (B9).
6. Update this doc: org UUID, opportunity IDs, pass/fail results, screenshots.

**Suggested pilot surface:** AdminV2 → department work unit → enrollment pipeline queue → open opportunity drawer → Overview tab.

---

## References

- Cutover plan: [`layout_runtime_cutover_plan.md`](./layout_runtime_cutover_plan.md) §7 C1b
- C1a shadow (still default off): merged @ `88210b68`
- Error Boundary: `OpportunityDrawerLayoutRuntimeBodyErrorBoundary.tsx` @ `5b19e871`
