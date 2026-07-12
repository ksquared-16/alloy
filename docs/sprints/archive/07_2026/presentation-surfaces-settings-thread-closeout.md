# Presentation · Surfaces · Settings — Thread Closeout (Canonical Handoff)

**Status:** **Closed** — baseline frozen on `origin/staging`  
**Baseline SHA:** `c99e381f3105b7b433f1ba48206724f9f4ba0443`  
**Close date:** July 2026

This document is the **single canonical handoff** for the next sprint. It supersedes scattered sprint notes where they conflict.

---

## 1. What was completed

### Queue Row Builder + Runtime Vocabulary — **frozen**

- Click-first Surface Composer interaction: canvas → library → place → select → inspector (Section + Placement).
- Variant model, sibling vocabulary, group/sort controls, enrollment starter variants.
- Runtime vocabulary wired through catalog → validator → resolver → compact row.
- **Name display options** (`full_name` | `first_name`) on person/child/family name fields — persisted on field config, applied after resolver.
- **Gender audit:** `child.gender` is registered (`customer_member` / `person_gender`) but **intentionally unavailable** in Queue Row library until a queue row resolver exists.

**Do not reopen** Queue Row Builder architecture except production bugs. Configuration-only changes allowed.

### Presentation Runtime V2 — **complete**

- Workspace Header, Work Unit Header, Workspace Process Summary, Queue Region, Focus Panel host, Right Rail — one runtime tree.
- Surfaces-configurable headers and process cards with builder/runtime parity and coordinated reveal.

**Do not reopen** Workspace / Work Unit / Queue Region presentation shells in this thread's scope.

### Surface Builder convergence — **complete**

- `/settings/surfaces` is the canonical operator IA (Layouts renamed).
- Queue Row Builder, Workspace Header, Work Unit Header, Workspace Process Summary editors share Surfaces configuration shell.
- Nested Focus Panel surface editing (Children / Financial Configuration) landed in builder; live runtime consumption remains a **future** adoption step — not this thread's blocker.

### Settings legacy cleanup — **complete**

- `/settings/fields`, `/settings/entities`, `/settings/users-roles`, `/settings/communications` use Platform Configuration shell.
- Superseded `/legacy-admin/system/*` and `/admin/system/*` aliases redirect to `/settings/*`.
- Retained diagnostic surfaces carry explicit banners (`work-units`, `layouts/effective`, `db-relationships`, `payouts`, `verticals-industries`).

---

## 2. Architecture established

### Surface Composer (canonical interaction model)

> **Queue Row Builder is the canonical implementation of the Surface Composer.**

Future configurable surfaces **extend this interaction model** — do not invent parallel builder paradigms.

```
click surface → open library → place item → select item → inspector (Section + Placement)
```

Shared primitives: `web/lib/adminV2/settings/surfaces/surfaceFieldComposer.ts`

| Consumer | Status |
|----------|--------|
| **Queue Rows** | ✅ Shipped + frozen |
| **Focus Panel** | ⏭ Next consumer — see `focus-panel-composer-handoff.md` |
| **Workspace** | Future |
| **Documents** | Future |
| **Forms** | Future |
| **Cards** | Future |

Doctrine alignment: `docs/platform/operator/experience-builder-v3-universal-surface-composition.md` (Engine B semantics + Engine A seams).

### Platform Configuration

Settings at `/settings` use **Context → Queue → Workspace** where the full shell is landed (Fields, Statuses, Locations, Processes, Surfaces, Commercial). Hybrid surfaces wrap legacy workspace clients inside `SettingsConfigurationSurfaceShell` until dedicated queue/workspace editors land.

Doctrine: `docs/system/configuration-runtime-v1.md`, `docs/platform/modules/configuration-platform.md`

### Presentation Runtime V2

Single composition tree from Workspace through Work Unit to Focus Panel and Right Rail.

Doctrine: `docs/platform/experience/presentation-runtime-v2.md`

---

## 3. What became reusable

| Primitive | Path | Reuse for |
|-----------|------|-----------|
| Surface field composer vocabulary | `surfaceFieldComposer.ts` | Focus Panel Composer (next) |
| Settings configuration shell | `SettingsConfigurationSurfaceShell.tsx` | Remaining hybrid settings pages |
| Diagnostic surface banner | `SettingsDiagnosticSurfaceBanner.tsx` | Intentional legacy/diagnostic routes |
| Queue row composer model | `queueRowComposerModel.ts`, `queueRowComposerCanvasLayout.ts` | Focus Panel placement model (mirror, don't fork) |
| Composition field adapter | `compositionFieldAdapter.ts` | All surface builders |
| Presentation runtime surfaces | `entity_layouts` + surface metadata envelopes | Workspace, WU, FP, Queue Row |

---

## 4. Intentionally deferred (only these)

| Item | Notes |
|------|-------|
| **Placement ranking configuration** | Operator UI hidden in Queue Row builder; underlying catalog/config preserved. Future: Placement settings sprint. |
| **Focus Panel Composer** | Apply Surface Composer interaction to Focus Panel cards/fields. Nested surface drill-in exists; click-first library + Section/Placement inspector is next. See `focus-panel-composer-handoff.md`. |
| **Registry-backed fields unavailable by design** | Fields registered in entity/field registry but **without queue row runtime resolver** stay out of the active Queue Row library and appear as **unavailable** placeholders with reason. Examples: `child.gender` (queue row), future profile fields until resolver lands. Do not expose as active pickables without resolver + validator + runtime wiring. |

**Nothing else is deferred from this thread.** All other items in this sprint scope are **complete**.

---

## 5. Next sprint recommendation

**Focus Panel Composer** — extend Surface Composer to Focus Panel without redesigning nested surface drill-in.

Suggested order:

1. Map Focus Panel anatomy → Section keys (shared `surfaceFieldComposer.ts`).
2. Click-first library + inline tokens on Focus Panel canvas.
3. Inspector parity (Section, Placement, field list) — reuse queue row language.
4. Publish guard + runtime resolver parity for configured fields.
5. Tests: placement, visibility, publish guard, no builder-only runtime values.

**Non-goals:** Queue Row changes, Workspace/WU header changes, placement ranking UI, new builder paradigms.

---

## 6. Verification (baseline `c99e381f3`)

### Staging commits (this thread tail)

| SHA | Message |
|-----|---------|
| `0a4293855` | `feat(surfaces): add queue row name display options` |
| `4157a37a6` | `chore(settings): align legacy field settings with platform configuration` |
| `c99e381f3` | `chore(settings): close out legacy settings route reachability` |

### Tests (closeout verification)

```bash
cd web && npm run test -- \
  tests/presentation/runtime/queueRowRuntimeCloseout.test.ts \
  tests/presentation/runtime/resolveQueueRowVariant.test.ts \
  tests/presentation/formatQueueRowNameDisplay.test.ts \
  tests/presentation/runtime/resolveCompactSlotDisplay.test.ts \
  tests/adminV2/queueRowBuilderLibrary.test.ts \
  tests/adminV2/settingsLegacyFieldAlignment.test.ts \
  tests/adminV2/configurationRuntimeSettingsRollout.test.ts \
  tests/adminV2/configurationRuntimeV1Final.test.ts
```

**Result:** 63/63 passed (July 2026 closeout run).

### Typecheck

```bash
cd web && NODE_OPTIONS='--max-old-space-size=8192' npm run typecheck -- --project tsconfig.build.json
```

**Result:** passed (July 2026 closeout run).

---

## 7. Canonical doc index (read order for next thread)

| Topic | Document |
|-------|----------|
| **This handoff** | `docs/sprints/archive/07_2026/presentation-surfaces-settings-thread-closeout.md` |
| Queue Row Builder freeze + vocabulary | `docs/sprints/archive/07_2026/queue-row-builder-runtime-vocabulary-handoff.md` |
| Focus Panel Composer next | `docs/sprints/archive/07_2026/focus-panel-composer-handoff.md` |
| Presentation Runtime V2 | `docs/platform/experience/presentation-runtime-v2.md` |
| Surface Builder / V3 composition | `docs/platform/operator/experience-builder-v3-universal-surface-composition.md` |
| Platform Configuration | `docs/platform/modules/configuration-platform.md` |
| Configuration Runtime V1 | `docs/system/configuration-runtime-v1.md` |
| Queue row platform (runtime) | `docs/platform/operator/queue-row-platform.md` |

---

## 8. Intentional legacy / diagnostic routes (not bugs)

| Route | Role |
|-------|------|
| `/settings/work-units` | Diagnostic — queue lane config |
| `/settings/layouts/effective` | Diagnostic — effective layout inspector |
| `/legacy-admin/system/db-relationships` | Diagnostic — live row inspector |
| `/legacy-admin/system/payouts` | Diagnostic — vendor payout defaults |
| `/legacy-admin/system/verticals-industries` | Diagnostic — industry catalog |

All superseded configuration paths redirect to `/settings/*`.
