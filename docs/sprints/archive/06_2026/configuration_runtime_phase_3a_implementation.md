# Configuration Runtime Phase 3A — Implementation Notes

**Branch:** `feat/configuration-runtime-phase-3`  
**Flags:** `NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1` (default off), `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1`

---

## Objective

Make Business Process operational view metadata (`perspectives_v1`) the navigation source of truth for operator runtime — one configuration, one runtime.

---

## Deliverables (3A)

| Part | Status | Notes |
|------|--------|-------|
| 1 — Runtime consumes configured views | **Done** | `deriveRuntimePerspectiveWithOperationalViews`; flag-gated |
| 2 — Work Unit Context pills | **Done** | `applyOperationalViewsToPillSections` on above-fold pill sections |
| 3 — Builder-owned operational view row | **Done** | `buildOperationalViewHeaderSection` when multiple visible views |
| 4 — Preview Runtime | **Done** | `?queue=` deep link from BP editor via `buildOperationalViewPreviewRuntimeHref` |
| 5 — Terminology review | **Done** | [configuration_runtime_phase_3a_terminology_review.md](./configuration_runtime_phase_3a_terminology_review.md) |
| 6 — Screenshots / deviation log | **Done** | See [configuration-runtime-phase-3a/](./configuration-runtime-phase-3a/) |
| 7 — `/settings` auth gate | **Done** | Protected like `/workspace` (see below) |
| 8 — `/settings` app shell | **Done** | AdminV2 shell; no marketing chrome (see below) |

---

## `/settings` auth (security gate)

**Problem:** `/settings` was reachable without login in some paths.

**Fix:** Reused the same operator session gate as `/workspace` — defense in depth at middleware and layout.

| Layer | Module | Behavior |
|-------|--------|----------|
| Shared classifier | `web/lib/admin/operatorSessionGate.ts` | `requiresOperatorSession()` covers `/workspace/*` and `/settings/*` |
| Middleware | `web/middleware.ts` | Unauthenticated → `/login`; `/admin/settings/*` compatibility paths gated before rewrite |
| Layouts | `adminV2/layout.tsx`, `settings/layout.tsx`, `workspace/layout.tsx` | Server-side redirect to `/login` when no session |

**Acceptance:**

- `/settings` and `/settings/*` behave like `/workspace` and `/workspace/*`.
- `/admin/settings/*` redirects to `/settings/*`; final destination remains auth-protected.
- No runtime reveal / queue semantics changed.

**Tests:** `web/tests/lib/admin/settingsRouteAuth.test.ts`, Playwright `settings-app-shell.spec.ts`.

---

## `/settings` app shell (marketing chrome fix)

**Problem:** After Phase 3A auth, `/settings` still showed marketing header/footer. Browser URL `/settings` was not classified as an app-shell route in root `ConditionalSiteLayout`, so marketing chrome wrapped AdminV2 content even when authenticated.

**Fix:** Added `isPublicMarketingChromeSuppressedPath()` in `canonicalAdminRoutes.ts` and wired `ConditionalSiteLayout` to use it. Canonical `/settings` and `/settings/*` now skip marketing chrome the same way `/workspace` does. AdminV2 layout + shell were already correct; only the root marketing wrapper was wrong.

| Layer | Module | Behavior |
|-------|--------|----------|
| Shared classifier | `web/lib/admin/canonicalAdminRoutes.ts` | `isPublicMarketingChromeSuppressedPath()` includes `/settings/*` and `/workspace/*` |
| Root layout | `web/components/ConditionalSiteLayout.tsx` | No `MarketingHeader` / `MarketingFooter` on settings routes |
| Admin shell | `app/adminV2/layout.tsx` + `AdminV2Shell` | Same authenticated chrome as workspace |

**Acceptance:**

- Authenticated `/settings`, `/settings/business-processes`, `/settings/layouts` render AdminV2 shell (`data-adminv2-app-shell="workspace-v2"`).
- Marketing nav (`aria-label="Main"`) and `.marketing-site-chrome` never appear on settings routes.
- `/admin/settings/*` compatibility redirect lands on protected canonical route in AdminV2 shell.

**Tests:** `settingsRouteAuth.test.ts` (marketing suppression), Playwright `settings-app-shell.spec.ts`.

**Screenshots (app shell):**

| File | Route |
|------|-------|
| [settings-app-shell-home.png](./configuration-runtime-phase-3a/settings-app-shell-home.png) | `/settings` |
| [settings-app-shell-business-processes.png](./configuration-runtime-phase-3a/settings-app-shell-business-processes.png) | `/settings/business-processes` |
| [settings-app-shell-layouts.png](./configuration-runtime-phase-3a/settings-app-shell-layouts.png) | `/settings/layouts` |

---

## Screenshots

Captured with `NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1` and `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1`:

| File | Shows |
|------|-------|
| [settings-business-processes-views.png](./configuration-runtime-phase-3a/settings-business-processes-views.png) | BP settings — operational views section |
| [configured-view-card.png](./configuration-runtime-phase-3a/configured-view-card.png) | Configured view card in BP editor |
| [preview-runtime-link.png](./configuration-runtime-phase-3a/preview-runtime-link.png) | Preview runtime link with `?queue=` |
| [runtime-work-unit-context-views.png](./configuration-runtime-phase-3a/runtime-work-unit-context-views.png) | Work Unit Context — configured view pills |
| [runtime-left-nav-views.png](./configuration-runtime-phase-3a/runtime-left-nav-views.png) | Left nav — builder-owned Views row |
| [runtime-active-view-queue.png](./configuration-runtime-phase-3a/runtime-active-view-queue.png) | Active view queue after deep link |

Playwright spec: `web/playwright/tests/configuration-runtime-phase-3a-review.spec.ts`

---

## Key modules

| Module | Role |
|--------|------|
| `configurationRuntimeConvergenceFlag.ts` | Phase 3A gate |
| `resolveStageOperationalViews.ts` | Load `perspectives_v1` from department metadata |
| `mergeOperationalViewMetadata.ts` | Merge label/mission; pill rail transform; preview href |
| `operatorSessionGate.ts` | Shared `/workspace` + `/settings` session classification |

---

## Deviations from Concept A mockups

| Area | Mockup | Phase 3A implementation | Reason |
|------|--------|-------------------------|--------|
| Terminology | “Work View” in some mockups | UI still says “Perspectives” / “Views” | Copy rename deferred per terminology review |
| Work included filters | Editable filter chips | Read-only projection from queue definition | `filters_v1` not in schema yet |
| BOS configuration health | Health card on BP page | Not shown | UX-5 follow-up |
| Left app sidebar | Dedicated views sidebar | Views row in existing Work Unit Context header | Avoid new permanent nav chrome in 3A |
| Preview runtime | Icon-only affordance | Text link “Preview runtime” on view card | Clearer operator affordance |
| Pill rail density | Mockup spacing | Uses existing Alloy OS context bar CSS | Reused runtime shell, not a pixel-perfect mockup pass |

---

## Validation

```bash
cd web && npm run test -- \
  tests/lib/admin/settingsRouteAuth.test.ts \
  tests/lib/admin/canonicalSettingsRoutes.test.ts \
  tests/lib/admin/canonicalAdminRoutes.test.ts \
  tests/adminV2/runtime/operationalViewConvergence.test.ts \
  tests/adminV2/runtime/workspaceShellRegression.test.ts \
  tests/adminV2/configurationRuntimeConceptA.test.ts

cd web && npx playwright test playwright/tests/settings-app-shell.spec.ts
```

**Results (Phase 3A gate):** 25/25 Vitest (auth + convergence + Concept A); Playwright 2/2; Phase 3A source files clean under `tsc --noEmit`.

**Pre-existing `tsc` failures:** unrelated test-file type errors (layout builder, intake, enrollment alias tests, etc.) — not introduced by Phase 3A.

---

## Follow-ups (3B+)

- User-facing “Work View” copy sweep
- BOS configuration health recommendations
- Editable “Show work when…” (`filters_v1`)
- Pixel polish pass vs Concept A mockups
