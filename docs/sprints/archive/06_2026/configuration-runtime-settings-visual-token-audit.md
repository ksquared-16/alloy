# Configuration Mode — `/settings` Visual Token Audit

**Date:** June 2026  
**Scope:** `web/app/adminV2/settings/**`, `web/components/adminV2/settings/**`, `configurationRuntime.css`, settings shell providers, Configuration Mode sidebar nav.

---

## Alloy Design System (target)

| Role | Token | Usage |
|------|-------|--------|
| Canvas | `bg-white` | Page shell, workspace panels, list columns |
| Cards | `bg-white` + `border-alloy-stone/40` or `border-alloy-forge/12` | Setup cards, editors, forms |
| Active / selected | **Bend Pine** `alloy-pine`, `rgba(0, 162, 131, 0.08)` | Nav items, queue selection, chips, primary buttons |
| Primary text | `text-alloy-midnight` | Headings, labels |
| Secondary text | `text-alloy-forge/70` | Descriptions, metadata |
| Borders | `border-alloy-stone/40`, `border-alloy-forge/12` | Cards, inputs, dividers |
| Focus | `outline` / `accent-color: alloy-pine` | Inputs, checkboxes, radios |
| CSS variables | `--cr-pine`, `--cr-stone-border`, `--cr-midnight` | Shared in `configurationRuntime.css` |

Shared classes: `config-runtime-*`, `process-config-*` (see `web/app/adminV2/settings/configurationRuntime.css`).

---

## Legacy Admin tokens (removed June 2026)

### `alloy-blue` — **24 files, 0 remaining in settings scope**

Previously used for: layout editor selection, inspector panels, links, active chips, primary CTAs, track nav.

**Replacement:** `alloy-pine` (all variants: text, bg, border, hover).

| Component area | Files affected |
|----------------|----------------|
| Layout Experience Builder | `OpportunityDrawerLayout*`, `LayoutBuilder*`, `LayoutSectionFieldsPanel`, `LayoutGalleryClient` |
| Layouts shell | `LayoutsSettingsPageShell`, `EffectiveLayoutInspectorClient` |
| Lifecycle (settings) | `LifecycleTrackNav` |
| Locations | `LocationsHierarchySettingsClient`, `LocationSiteConfigurationWorkspace` |
| Actions | (links only in placements — hex borders also fixed) |
| Analytics / KPIs | `platformBuilderUi.tsx`, `KpiPlacementsSettingsClient` |
| Security / SLA | `users-roles`, `attention-sla-rules`, `status-transition-rules` |

### Raw legacy hex palette — **removed**

| Legacy | Meaning | Alloy replacement |
|--------|---------|-------------------|
| `#31394d` | Admin heading | `text-alloy-midnight` |
| `#59678b` | Admin secondary | `text-alloy-forge/70` |
| `#e6e8ec` | Admin border | `border-alloy-stone/40` |
| `#eef0f4`, `#F4F6F9` | Gray panel tint | `bg-alloy-stone/10` or `bg-white` |
| `#FAFBFC`, `#F4F7FB`, `#F6F8FC` | Cool gray canvas | `bg-white` |
| `#EEF2F8` | Experience Builder studio shell | `bg-white` |

**Primary offender:** `StatusSettingsInventoryPanel.tsx` (full legacy admin card stack).

### `admin-border` — **replaced**

Used in attention SLA, guardrails, runtime metadata panels, workflow editors.

**Replacement:** `border-alloy-forge/12`

### `sky-*` (blue debug chrome) — **replaced**

| File | Change |
|------|--------|
| `AdminAccessScopeDebugPanel.tsx` | `sky-*` → `amber-*` (debug-only surface) |
| `ActionButtonLibraryPanel.tsx` | `sky-*` badge → `alloy-pine/8` |

### `slate-*` / `gray-*` / `text-blue` / `bg-blue`

**None found** in settings component tree (false positives: CSS `translate-x` utilities).

---

## Alloy tokens in active use (correct)

### CSS layer — `configurationRuntime.css`

- `--cr-pine` (Bend Pine `#00a283`)
- `--cr-stone-border`, `--cr-midnight`
- Pine selected states: `.process-config-nav-item--active`, `.config-runtime-nav-card--active`, `.process-config-work-view-list-card--active`
- White canvas on shell, list columns, workspace panels (post-audit)

### Processes / Configuration Runtime (already compliant)

- `BusinessProcessConfigurationNav`, `BusinessProcessProcessSelectorStrip`
- `WorkViewProcessEditorCard`, `ConfigurationRuntimeUniversalCard`
- `ConfigurationRuntimePrimitives` (hero, tiles, lens rows)
- `LifecycleStageWorkspace`, operating plan queue/workspace

### Shell

- `AdminV2SettingsClientProviders` — white canvas, stone breadcrumb border
- `SidebarConfigurationModeNav` — pine inset active bar via `.adminv2-sidebar-config-link--active` (`#00a283`)

### Shared layout editor tokens

- `lib/layout/layoutEditorWidgetStyle.ts` — widget chrome migrated from `alloy-blue` → `alloy-pine`

---

## Components still using transitional patterns (non-legacy, acceptable)

These use Alloy tokens but not yet the shared `config-runtime-*` class system:

- Analytics builder panels (`platformBuilderUi.tsx`) — inline Tailwind, now pine
- KPI placements, users/roles tables — inline Tailwind
- Attention SLA rules — `border-alloy-forge/12` forms (not yet `config-runtime-input`)
- Experience Builder canvas — white preview frames; editor chrome is layout-tool specific

**Not in scope:** `/admin/*` drawer runtime, marketing pages, legacy-admin routes.

---

## Verification

Drift test: `web/tests/adminV2/configurationModeVisualTokens.test.ts`

```bash
cd web && npm run test -- tests/adminV2/configurationModeVisualTokens.test.ts tests/adminV2/configurationModeDoctrine.test.ts
```

Manual grep (expect empty):

```bash
rg 'alloy-blue|#31394d|#59678b|#e6e8ec|text-blue|bg-blue|slate-' app/adminV2/settings components/adminV2/settings
```

---

## Migration summary

| Category | Before | After |
|----------|--------|-------|
| Files with `alloy-blue` in settings | 24 | 0 |
| Files with legacy hex borders/text | 12 | 0 |
| Files with `admin-border` | 8 | 0 (→ `alloy-forge/12`) |
| Settings shell canvas | tinted / `#EEF2F8` | white |
| Active selection color | mixed blue/pine | **Bend Pine only** |
