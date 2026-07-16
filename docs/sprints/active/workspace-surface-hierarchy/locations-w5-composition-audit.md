---
owner: sprint
status: sprint
last_reviewed: 2026-07-16
supersedes: []
---

# Locations W5 Composition Audit

**Sprint:** slot 5 `workspace-surface-hierarchy`  
**Phase:** 1 — Configuration Region Discipline  
**Date:** 2026-07-16  
**Branch:** `agent/cursor/5-workspace-surface-hierarchy` @ `ac1dc29bf` (+ Phase 0)  
**Authority:** `alloy-visual-language.md` (W5) · `configuration-workspace-visual-language.md` · Configuration Runtime shell  
**Rule:** Cards represent objects. Regions organize work. **No W4 stone import.**

---

## Preflight (verified)

| Check | Result |
|-------|--------|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt5-workspace-surface-hierarchy` |
| Slot / port | 5 / 3015 (server stopped at audit time) |
| Branch | `agent/cursor/5-workspace-surface-hierarchy` |
| vs `origin/staging` | 3 commits ahead, 0 behind |
| Working tree | clean before Phase 1 |
| Auth on slot | missing until `alloy-dev-start` + login |

Primary implementation inspected (this worktree, not sibling wt2):

- `web/components/adminV2/settings/locations/LocationsConfigurationPage.tsx`
- Panels under `…/locations/*`
- `ConfigurationModeLayout.tsx` + `configurationRuntime.css`
- `useLocationsConfigurationSettings.ts`
- APIs: `/api/admin/locations`, `/api/admin/location-program-categories`
- Tests: `configurationRuntimeLocations.test.ts`, Playwright `configuration-runtime-locations.spec.ts`

---

## Deliverable 1 — Current A–G map

| Visible unit | Current layer | Correct? | Notes |
|--------------|---------------|----------|-------|
| AdminV2 + Settings ambient | **A** Application Shell | Yes | White forced by `.config-runtime-shell` |
| `ConfigurationContext` (Locations title + subtitle + **Add Location**) | **B** Workspace Frame | Partial | Add Location is workspace-wide (top-right) — should live on nav region |
| `ConfigurationShell` / `.configuration-workspace` | **C** Workspace Canvas | Yes | White canvas intentional |
| Custom 3-col grid inside workspace (not shell `queueColumn`) | **D** layout | Weak | Bypasses CR list-column geometry; search containment at risk |
| Locations `ConfigurationQueue` + search | **D** Region | Mis-modeled chrome | Structurally a region; search input unconstrained (`w-full` in narrow aside) |
| Queue rows (`ConfigurationQueueItem`) | **E** Objects + **G** Selection | Yes | Pine inset selection |
| Object header (name, status, facts, Edit) | **B**/identity region | Yes | Matches Configuration Object Header |
| Tab bar | **B** Frame | Yes | Owned concerns |
| Overview Health eyebrow + two `WorkspaceCard`s | **D** + **E** | Mixed | Eyebrow/region OK; Attention + Setup Progress are legitimate glance **objects** (keep containment) |
| Capacity `WorkspaceCard` + nested bordered tiles | **E** over-carded | Partial | Glance object OK; nested bordered buttons add mosaic noise |
| Operations single `process-config-setup-card` + rows | **D** Region (good pattern) | Yes | Prefer this pattern: one surface, hairline rows |
| Programs list of `LocationProgramDetailPanel` cards | **E** Objects | Partial | Objects OK; **no region header / Add Program** |
| Rooms queue + detail | **D** + **E** | Partial | **No Add Room** control; empty state text only |
| Schedule Patterns outer `process-config-setup-card` wrapping queue+detail | **D as Card** | **Misclassified** | Whole concern wrapped as floating card |
| Closures outer card | **D as Card** | **Misclassified** | Structural region, not an object |
| Quick actions `WorkspaceCard` | **D as Card** | **Misclassified** | Command rail region; should not need card chrome |
| Schedule create weekday chips | **F** Controls | Yes | Pine active treatment present |
| Overview schedule summary via `formatWeekdaySelection` | **E** | OK when data exists | Shows “Not set up yet” when empty — no fabricated Weekdays label |

### Misclassifications (priority)

1. **Regions rendered as cards:** Schedule Patterns, Closures, Quick actions, local `WorkspaceCard` helper used as generic section wrapper.
2. **Missing region-local actions:** Add Program, Add Room absent entirely; Add Location only in context bar.
3. **Controls detached:** Add Location not adjacent to Locations list (Configuration Sidebar doctrine).
4. **Search containment:** Locations list is a custom aside without `min-w-0` / CR list-column overflow rules.

---

## Functionality preservation inventory

Must preserve:

- White W5 canvas / Configuration Runtime shell
- Location search + inactive filter
- Select location → updates main + URL (`locationWorkspaceHref`)
- Deep-link `initialLocationId` / tab / item
- Add Location → `LocationSiteCreatePanel` → POST `/api/admin/locations`
- Edit Location → `LocationSiteDetailPanel` → PATCH
- Tabs: Overview, Programs, Rooms, Schedule, Tours, Placement, Access
- Overview Attention / Setup Progress / Capacity / Operations
- Program edit via `patchProgramCategory`
- Room capacity edit via `patchLocation`
- Add Schedule Pattern → `createSchedulePattern` + refresh selection
- Closures empty + disabled Add Closure (substrate gap — keep honest)
- Quick action shortcuts
- Mobile location `<select>`
- No W4 stone / WorkspaceShell primitives

---

## Deliverable 2 — Intended region model

| Region | Kind | Introduced by | Internal separation | Actions | Containing surface? | Empty vs populated |
|--------|------|---------------|---------------------|---------|---------------------|--------------------|
| **Location navigation** | Region (D) | Queue title + summary | Stacked object rows | **Add Location**, Inactive filter; search inside region | No card; optional hairline vs main | Empty list → empty state in workspace |
| **Selected location identity** | Region (D) | Object name + status + facts | Typography / hairline under header | Edit Location | No card | Always present when selected |
| **Tab frame** | Frame (B) | Underline tabs | — | — | None | — |
| **Overview · Health** | Region (D) | Eyebrow + heading | Spacing between objects | — | No region card | — |
| Attention / Setup Progress | **Objects (E)** | Card chrome OK (glance) | Dividers inside | Resolve / Review setup | Soft contained surfaces | Good empty copy inside object |
| **Overview · Capacity** | Region (D) | Eyebrow + heading | — | — | — | — |
| Capacity summary | **Object (E)** | One glance surface | Quiet nested metrics without extra card grid | Navigate to Rooms | One contained surface | Honest “Not set up yet” |
| **Overview · Operations** | Region (D) | Eyebrow + heading | Hairline rows in **one** surface | Row navigates to tab | One calm surface (not mosaic) | Values from data |
| **Programs** | Region (D) | Region title + **Add Program** | Object stack / spacing | Add Program; edit on object | No outer card | Empty state + Add |
| Program panels | **Objects (E)** | Existing summary cards | — | Edit/save on object | Card OK | — |
| **Rooms** | Region (D) | Queue title + **Add Room*** | Queue ‖ detail | Add Room* | No outer card | Empty copy in queue |
| Room rows / detail | **Objects (E)** | Queue item / detail panel | — | Save on detail | Detail panel containment OK | — |
| **Schedule Patterns** | Region (D) | Region title + **Add Schedule Pattern** | Queue ‖ detail | Add Schedule Pattern | **No outer card** | Empty queue copy |
| Pattern rows / detail / create | **Objects / Controls** | — | — | Create/save | Create panel may use contained surface | — |
| **Closures** | Region (D) | Title + disabled Add | — | Disabled Add Closure | No outer card | Honest empty |
| **Quick actions** | Region (D) / command rail | Heading | Link stack | Local shortcuts only | No card | — |

\*Add Room: see mutation gap below.

---

## Deliverable 3 — Action placement

| Action | Placement |
|--------|-----------|
| Add Location | Locations navigation region (primary). Remove exclusive reliance on context-bar action (no duplicate). |
| Add Program | Programs region header + empty state |
| Add Room | Rooms region header **if** mutation path supports `parent_location_id`; else document gap |
| Add Schedule Pattern | Schedule Patterns region header (already) |
| Edit Location | Identity region (already) |
| Program/Room/Schedule edit | On object (already) |
| Quick actions | Rail region only; not duplicated into Overview |

---

## Shared primitive decision

**Decision:** Add one narrow W5 primitive — `ConfigurationRegion` — to `ConfigurationModeLayout.tsx`.

| Option | Verdict |
|--------|---------|
| No shared change | Rejected — Locations would keep inventing section wrappers |
| Narrow CR extension | **Chosen** — `ConfigurationRegion` (title, description, actions, children; no card chrome; `min-w-0`) |
| New Settings shell | Rejected |

Constraints: domain-agnostic props; no W4 imports; reusable by Commercial/other CR consumers later.

Glance/summary **objects** continue to use existing `process-config-setup-card` / detail card patterns — not via `ConfigurationRegion`.

---

## Mutation path findings

| Action | Existing path | Phase 1 |
|--------|---------------|---------|
| Add Location | POST `/api/admin/locations` | Wire UI to nav region |
| Add Program | POST `/api/admin/location-program-categories` | Wire UI + hook helper |
| Add Schedule Pattern | `createSchedulePattern` client | Keep; ensure region not card-wrapped |
| Add Room | POST `/api/admin/locations` **does not accept/set `parent_location_id`** | **Do not fake.** Document as blocked; no schema/API change without separate approval |

---

## Implementation boundaries

**In scope**

- Locations page composition + `ConfigurationRegion`
- Search containment / nav region geometry
- Action placement (Add Location, Add Program, Schedule)
- Reduce region-as-card wrappers
- Tests for composition contracts
- Optional one-line W5 doc note if durable rule emerges

**Out of scope**

- W4 stone, Analytics, other Settings pages
- New mutation/API for rooms
- Token palette changes
- Runtime / nav / BOS

---

## Validation plan

1. `npm run test -- tests/adminV2/configurationRuntimeLocations.test.ts` (+ any new composition assertions)
2. `npm run typecheck` (after UI changes; serialize if other tsc running)
3. `alloy-dev-start` slot 5 → `http://localhost:3015` authenticated QA:
   - search containment in nav
   - select location / deep link
   - Add Location
   - Add Program
   - Add Schedule Pattern
   - empty vs populated Programs / Rooms / Schedule
   - no fabricated Weekdays on empty schedule summary
   - narrow + normal desktop widths
4. Confirm no `WS_FIELD` / `WorkspaceShell` / stone canvas classes on Locations
5. Screenshot before/after if session available

---

## Proposed composition (summary)

```
A Admin shell
B ConfigurationContext (title/subtitle only)
C White ConfigurationShell canvas
D Location nav region (search + Add Location + rows)
D Identity region + tabs
D Overview regions (Health / Capacity / Operations) with E glance objects where doctrine requires
D Programs / Rooms / Schedule / Closures / Quick actions as regions
E Program/Room/Schedule objects; Attention/Setup/Capacity objects
F Controls on regions/objects
G Pine selection on queues
```

Proceed to implement from this audit unless doctrine contradiction appears (none found: W5 white + Region/Object laws align).
