# Configuration Runtime — Phase 2A Design Review

**Status:** Visual proof capture for canonical `/settings` routes (June 2026)  
**Scope:** Route migration + Settings shell review — no runtime behavior changes

---

## 1. Purpose

Validate that Configuration Runtime Settings uses **`/settings`** as the canonical URL before Phase 2B persistence work (perspectives metadata save, layout assignment wiring). Capture visual baseline of the current Settings shell for Alloy OS alignment review.

---

## 2. Routes changed

| Before | After | Compatibility |
|--------|-------|---------------|
| `/admin` (settings hub) | `/settings` | `/admin` → redirect `/settings` |
| `/admin/settings/*` | `/settings/*` | redirect to `/settings/*` |
| Product nav hrefs | `/settings/...` | `adminSettingsSubpathHref()` + domain config |

Implementation:

- `web/lib/admin/canonicalAdminRoutes.ts` — `CANONICAL_SETTINGS_BASE`, `normalizeToCanonicalSettingsPath`
- `web/next.config.ts` — rewrites `/settings` → `adminV2/settings`; redirects from `/admin` and `/admin/settings/*`
- `web/lib/adminV2/configurationWorkspaceDomains.ts` — nav tiles use `/settings/...`

**No runtime queue, drawer, or BOS files changed.**

---

## 3. Screenshots

Captured locally via Playwright (`web/playwright/tests/configuration-runtime-phase-2a-review.spec.ts`):

```bash
cd web && npx playwright test playwright/tests/configuration-runtime-phase-2a-review.spec.ts
```

| Screen | File |
|--------|------|
| `/settings` | [settings-hub.png](./configuration-runtime-phase-2a/settings-hub.png) |
| `/settings/business-processes` | [business-processes.png](./configuration-runtime-phase-2a/business-processes.png) |
| `/settings/layouts` | [layouts.png](./configuration-runtime-phase-2a/layouts.png) |
| `/settings/fields` | [fields.png](./configuration-runtime-phase-2a/fields.png) |
| `/settings/statuses` | [statuses.png](./configuration-runtime-phase-2a/statuses.png) |
| `/settings/analytics` | [analytics.png](./configuration-runtime-phase-2a/analytics.png) |
| `/settings/actions` | [actions.png](./configuration-runtime-phase-2a/actions.png) |

---

## 4. Screens reviewed

All seven canonical Configuration surfaces listed above.

---

## 5. What visually aligns with Alloy OS

- **Configuration workspace shell** — midnight sidebar, white canvas, pine accent hero on hub and Business Processes
- **Domain-grouped nav** — Organization / Data Model / Operations / Experience matches Configuration Workspace V1 doctrine
- **Business Processes workbench** — process header, track-grouped stage nav, card-based stage sections
- **Layouts gallery** — Experience Builder entry; assignment copy points to Business Processes
- **Journey guide** — Fields → Statuses → Business Processes → Layouts → Runtime flow chip

---

## 6. What still feels legacy/admin

- **Fields / Statuses surfaces** — partially legacy `/admin/system/*` clients embedded in V2 chrome; await Fields & Statuses sprint polish
- **Analytics builder** — dense builder panels; tab copy improved but visual density remains high
- **Business Processes advanced hub** — collapsed “Advanced configuration” still exposes older guided wizard patterns
- **Breadcrumb** — functional but minimal compared to operational workspace context bars

---

## 7. Design issues to fix before Phase 2B

1. **Unify Fields/Statuses chrome** with Business Processes hero + section card pattern (sprint-owned, but Settings shell should wrap consistently)
2. **Layouts gallery** — promote surface filter (Drawer | Queue) above the fold when queue row authoring becomes primary path
3. **Business Processes** — add Layout assignments section to stage workspace (between Perspectives and Ready Check) using existing `LifecycleStageLayoutAssignmentsCard`
4. **Perspectives section** — Phase 2 UI shell shipped; enable save wiring + remove amber pending banner in Phase 2B
5. **Cross-links** — ensure all in-app Settings links use `/settings/...` (grep cleanup for hardcoded `/admin/settings`)

---

## 8. Runtime behavior confirmation

- No changes to `deriveRuntimePerspective`, queue row renderers, Focus Panel split controller, or BOS rail
- No schema migrations
- Perspectives editor is **local staged state only** with explicit save-pending note

---

## 9. Forbidden builders confirmation

Drift tests assert no routes for:

- `/settings/queue-builder`
- `/settings/focus-panel-builder`

Queue row and Focus Panel presentation remain owned by **Layouts / Experience Builder** per configuration ownership doctrine.

---

## Related

- `docs/system/configuration-runtime-design-alignment.md`
- Phase 2 Perspectives UI: `LifecycleStagePerspectivesEditor.tsx` (shell only)
