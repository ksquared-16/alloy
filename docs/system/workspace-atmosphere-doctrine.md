# Workspace atmosphere doctrine

**Path:** `docs/system/workspace-atmosphere-doctrine.md`  
**Status:** **Locked** — premium pine gradient (June 2026)  
**Scope:** AdminV2 workspace shell — **not** Communications-specific  
**Supplements:** `drawer-operating-model-v1.md`, `workspace-system.md`, `drawer-doctrine.md`

---

## Purpose

When a record drawer, workspace BOS modal, or Action Workspace band opens, the workspace behind it should enter **BOS mode**: a branded Alloy atmosphere that feels **illuminated and focused**, not dimmed like a generic modal overlay.

This is **platform-wide shell chrome**. It applies to entity drawers, Inbox/Tasks BOS modals, and Action Workspace bands through shared CSS tokens — not per-feature styling.

---

## Locked profile: premium pine gradient

| Property | Value |
|----------|--------|
| **Layer opacity** | 70% (`--adminv2-drawer-shell-overlay-opacity: 0.7`) — 30% transparency over workspace |
| **Base** | Pine-white `#f4fbf9` — self-contained field; composited at 70% opacity over workspace |
| **Flat wash** | ~4–7% pine + ~1% slate over base |
| **Radial peak** | ~14% pine / ~3% slate at workspace center |
| **Radial center** | `56% 42%` — behind active drawer + BOS column |
| **Coverage** | Full bleed through BOS rail (`right: 0` on backdrop band); rail column transparent when drawer open so atmosphere shows through |

Minimal and strong variants were evaluated during the June 2026 pass; **premium** is the shipping default.

---

## Design rules

| Rule | Meaning |
|------|---------|
| **Pine-forward** | Bend Pine is the dominant hue (~80% of color weight). |
| **Slate support only** | Midnight Forge provides depth (~20%) — never a modal scrim. |
| **Illumination** | Brighter, pine-tinted field; drawer + BOS panels stay opaque white. |
| **Not modal dim** | No `bg-black/*`, no heavy forge base layers, no backdrop blur scrim. |

---

## CSS tokens

Defined on `html[data-adminv2-workspace-shell="v2"]` in `web/app/adminV2/adminV2.css`:

| Token | Role |
|-------|------|
| `--adminv2-drawer-shell-overlay-background` | Full-bleed focus band (drawer backdrop, loading overlay, Action Workspace scrim) |
| `--adminv2-bos-rail-shell-wash` | Outer BOS rail shell top illumination; inner dock stays `#ffffff` |

TypeScript registry: `web/lib/adminV2/workspace/workspaceAtmosphereDoctrine.ts`.

---

## Surfaces covered

- Entity record drawers (`Drawer.tsx` workspace backdrop band)
- Workspace BOS modals (`AdminV2WorkspaceBosModalShell.tsx`)
- Action Workspace band (`ActionWorkspaceBosShell.tsx`)
- Drawer opening overlay (`OpportunityDrawerOpeningOverlay.tsx`)

**Out of scope:** Communications composer enhance modal (`ComposerBosEnhanceModal` — centered modal uses its own overlay until migrated).

---

## Validation

```bash
cd web && npm run test -- tests/adminV2/drawerShellOverlayDoctrine.test.ts tests/adminV2/workspaceAtmosphereDoctrine.test.ts
```
