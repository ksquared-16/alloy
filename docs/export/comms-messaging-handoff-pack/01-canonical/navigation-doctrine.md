# Navigation doctrine

**Path:** `docs/system/navigation-doctrine.md`  
**Status:** **Canonical** (June 2026 freeze). How operators move through Alloy today.  
**Supersedes:** Department-first navigation as **primary** operator mental model (department remains a **scope/ACL** concept).

---

## Operator hierarchy (canonical)

```
Organization
  └── Lifecycle          ← primary landing grouping (/workspace tiles, sidebar)
        └── Work Unit    ← execution domain with queues (/workspace/work-unit/:slug)
              └── Record ← drawer detail (URL segment :recordId)
```

**Not canonical for daily ops:** Organization → Department → Lifecycle → Work Unit → Record.

**Department** still exists in data (`departments`, ACL, metadata, attention rules) but is **not** the primary navigation spine. Operators start at **lifecycle**, not department tiles.

---

## Left navigation (sidebar)

**Component:** `web/app/adminV2/components/Sidebar.tsx`  
**Shell:** `AdminV2Shell.tsx` — sidebar stays **mounted** across workspace routes.

| Section | Behavior |
|---------|----------|
| **Home** | `/workspace` — lifecycle landing |
| **Lifecycle groups** | Expandable; each lifecycle shows configured work queues as child links |
| **Prefetch** | Heavy routes use `prefetch={false}`; hover prewarm on work-unit hrefs (`warmOperatorWorkUnitEntryFromHref`) |
| **Site filter** | Sticky workspace site scopes queue/bootstrap fetches (session + URL) |

Lifecycle nav is loaded from **`loadOperatorLifecycleLandingCards`** — same catalog as workspace landing tiles.

---

## Workspace landing (`/workspace`)

**Component:** `WorkspaceRootShell`, `WorkspaceRootLifecycleGrid`  
**Content:** Lifecycle command tiles (premium cards), KPI strip, optional actions rail (forms link only — **no legacy-admin prefetch**).

Operators pick a **lifecycle** tile → navigate to default or configured work-unit entry href (typically `/workspace/work-unit/:slug`).

Department grid / dept-first tiles are **removed** from operator landing.

---

## Work-unit entry

| Path | Host |
|------|------|
| `/workspace/work-unit/:slug` | `WorkUnitSlugRouteHost` + slug-resolved bootstrap |
| Sidebar / lifecycle tile | Same slug routes after navigation transition |

**Cold load:** `WorkUnitWorkspaceColdShell` until **atomic** critical bundle ready (Pass 3).  
**Warm load:** Session cache, bootstrap inflight reuse, lifecycle switch snapshots.

Internal uuid route (`…/dept/…/work-unit/…`) remains for compat/tests — not product nav target.

---

## Drawer navigation

- Open from queue row → drawer frame immediate; VM warm on intent/click
- URL gains `/:recordId` without remounting work-unit page
- Linked navigation (person ↔ opportunity): hold prior drawer body until next VM ready
- Queue prev/next scoped to active lane selection (`workUnitQueueSelection.ts`)

See **`drawer-doctrine.md`**.

---

## Admin landing (`/admin`)

**Not** operator home. Settings, configuration, forms authoring, workflows, system surfaces.

Settings hub routes under `/admin/settings/*` (lifecycle builder, fields, layouts, actions, statuses, …).  
Product nav must use **`adminProductHref`**, **`adminSettingsSubpathHref`** — never `/adminV2/settings/…` in hrefs.

---

## Settings ownership

| Surface | URL pattern |
|---------|-------------|
| Settings landing | `/admin` |
| Lifecycle hub | `/admin/settings/lifecycle` |
| Fields | `/admin/settings/fields` |
| Layouts | `/admin/settings/layouts` |
| Action buttons | `/admin/settings/actions` |
| Workflows (automations) | `/admin/workflows` |
| Forms | `/admin/forms` |

Filesystem may still live under `app/adminV2/settings/**`; browser URL is canonical `/admin/…`.

---

## Tasks, inbox, BOS

| Surface | Location |
|---------|----------|
| **Tasks** | Canonical module under `/admin/tasks` (when enabled in nav) |
| **Inbox** | Warm-loaded after idle; communications threads — not on critical WU path |
| **BOS / AI command bar** | Bottom command surface in `AdminV2Shell`; orchestrator routes to Task/Workflow/Config assist |
| **AI activity** | `/admin/ai-activity`; recent strip deferred until primary surface ready |

BOS is **human-in-the-loop** — proposals and drafts, not autonomous execution. See **`product/bos-foundation.md`**.

---

## Global record search

Header search opens records in drawer on canonical hosts without leaving workspace context (`GlobalRecordSearchOpenListener`).

---

## Transitional / removed from primary UX

| Pattern | Status |
|---------|--------|
| Department-first landing grid | **Removed** from `/workspace` |
| Dept tile → dept page as daily entry | **Deprecated** for enrollment ops; lifecycle → WU preferred |
| `/adminV2/…` bookmarks | Redirect to `/admin/…` |
| Legacy-admin links on workspace root rail | **Disabled prefetch**; not canonical ops path |

---

## Related docs

- **`routing-doctrine.md`** — URL contracts
- **`workspace-system.md`** — queues, work units, lifecycle execution
- **`platform-performance-doctrine.md`** — shell mount and deferral
- **`glossary.md`** — lifecycle vs department vs work unit terms

---

## When this doc must be updated

Primary nav structure changes, new operator entry surfaces, or lifecycle catalog ownership changes.
