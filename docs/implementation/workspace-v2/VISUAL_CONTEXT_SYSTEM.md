# Visual context system (implementation)

**Doctrine:** Visual identity follows **operational context**, not entity type alone — see [overview-layout-doctrine.md](../../../architecture/overview-layout-doctrine.md) (rule 4) and [glossary.md](../../../architecture/glossary.md) (**Visual context**, **Operational context**).

## Code locations

| Area | Path |
|------|------|
| Types | `web/lib/visualContext/types.ts` |
| Resolver | `web/lib/visualContext/contextResolver.ts` |
| Registry (semantic keys → Alloy family) | `web/lib/visualContext/contextRegistry.ts` |
| Token merge / CSS vars | `web/lib/visualContext/contextStyle.ts` |
| Barrel | `web/lib/visualContext/index.ts` |

## Context resolver

`resolveVisualContextKey(input: OperationalVisualContext): VisualContextKey` applies **priority order** (first hit wins):

1. **`visualContextKey`** — explicit operational key (route / hydration).
2. **`laneKey`** — queue lane (e.g. `scheduled_today`, `unassigned`, `needs_attention`) → mapped via `LANE_KEY_TO_VISUAL_CONTEXT`.
3. **`workUnitVisualContextKey`** — from work unit config when wired.
4. **`departmentDefaultVisualContextKey`** — org/department default when wired.
5. **`departmentKey`** — `departments.key` → `DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT` (operational defaults, **not** org branding).
6. **`neutral`** — `NEUTRAL_CONTEXT_KEY`.

`resolveVisualContext` returns a **`ResolvedVisualContext`**: `contextKey`, `alloyFamily`, optional `amberEmphasis` (for Amber lanes).

## Semantic keys & Alloy palette mapping

- **Registry:** `VISUAL_CONTEXT_REGISTRY` maps each **semantic** `VisualContextKey` to an **`AlloyVisualFamily`**: `alloy_blue`, `bend_pine`, `amber`, `midnight_blue`, `neutral`.
- **Lane examples:** `scheduled_today` → `alloy_blue`; `unassigned` → `amber` (standard emphasis); `needs_attention` → `amber` (**strong** emphasis — still Alloy grammar, not “error red”).
- **Department defaults** (e.g. `operations` → `coordination` → `bend_pine`) are **semantic**, not display names of departments.
- **Aliases:** `VISUAL_CONTEXT_KEY_ALIASES` normalizes legacy/stored strings (e.g. `needs_attention_lane` → `needs_attention`).

Confirmed palette tokens live under `web/styles/tokens/colors.ts` (see comments in `types.ts`).

## Layer rules

`VisualContextLayer` = `workspace` | `department` | `work_unit` | `record`.

- **`LAYER_STRENGTH`** in `contextStyle.ts` scales how strongly context tokens apply (workspace light → work_unit stronger → record focused).
- Presentation rule: **context as signal** — headers stay light; **right-edge rail** and section rails carry identity (see `buildContextualPresentationTokens`).

## Placement rules (header, sections, drawer)

- **Shells / workspace chrome:** `operationalWorkspaceShellStyle`, `mergeOperationalVisualTokens` — pass `OperationalVisualStyleInput` = `{ layer, ...OperationalVisualContext }`.
- **Department / work unit pages:** supply `departmentKey`, `laneKey`, and when applicable **`visualContextKey`** so lane `needs_attention` picks up strong Amber.
- **Record / drawer:** same resolver hints so opening a job from **Needs Attention** keeps **consistent** rails with the lane (doctrine: operational visual context inheritance on record surfaces).

## Related

- `web/lib/visualContext/accentFamily.ts` — lane bias tweaks.
- `web/lib/workspace/workUnitKinds.ts` — `WorkUnitKind` (`exception` vs `throughput`); **does not** replace visual resolver; documents semantics only.
