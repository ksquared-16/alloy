# AdminV2 Persistent Shell + Header/Nav UX Audit

**Path:** `docs/sprints/05_2026/adminv2_persistent_shell_header_nav_audit.md`  
**Status:** Cards 1–4 + safe Card 5 (href) **implemented** (2026-05-22). Header/sidebar **refinement pass** implemented (2026-05-21): larger header controls, avatar-only profile menu, department-first sidebar with collapsible work units. Card 5c deferred.  
**Date:** 2026-05-22  
**Related:** [`sticky_location_filter_hotfix.md`](./sticky_location_filter_hotfix.md), [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md), [`adminv2_platform_navigation_performance_sprint.md`](./adminv2_platform_navigation_performance_sprint.md)

---

## Executive summary

AdminV2 **already has a single app shell** (`app/adminV2/layout.tsx` → `AdminV2Shell` → `Sidebar` + `TopNavBar` + page `children`). The chrome does **not** feel persistent because **most hierarchy navigation uses full document reloads** (`adminV2CommitNavigation` → `window.location.assign`), which remounts the entire client tree, re-runs nested RSC layout work, and refetches shell-local data (site filter bootstrap, sidebar tree on expand).

Sticky `workspace_site_id` is **not** the cause of shell reset; it survives reload via URL + sessionStorage. Header/sidebar “reload feel” is primarily **navigation class + remount + loading affordances**, not a missing layout boundary.

**Lowest-risk path to “premium app shell”:**

1. **UX-only header/sidebar IA** (layout, typography, profile menu, site filter position) — no navigation mechanism change.
2. **Shell state persistence** (sidebar collapsed, nav tree cache) — survives hard reloads where possible.
3. **Incremental soft-nav expansion** only where contract tests + prefetch prove safe — **not** a global rewrite away from `location.assign`.

---

## 1. Audit answers

### 1.1 Why does the header visually reset on navigation?

| Factor | What happens |
|--------|----------------|
| **Full document reload** | `AdminV2NavLink` and dept oper cards call `adminV2CommitNavigation` → `window.location.assign`. Entire React app remounts; header is not preserved in DOM. |
| **TopNav remount** | `TopNavBar` is client stateful (modals, polling). Reload closes modals and restarts effects. |
| **Site filter bootstrap** | `WorkspaceSiteFilterProvider` refetches `GET /api/admin/workspace/site-filter` after reload; dropdown may briefly empty until bootstrap returns (selection restores from URL/session). |
| **TopNav `Suspense`** | Shell wraps `TopNavBar` in `Suspense` with a 48px “Loading…” bar fallback — can flash on transitions that suspend. |
| **Nested workspace layout** | `app/adminV2/workspace/layout.tsx` is `force-dynamic` and re-runs auth/org/tz/labels bundle on **every** workspace route server render (hard or soft). Soft nav still pays this cost. |
| **Not a separate header instance** | Same `TopNavBar` component tree in layout; perceived reset is **repaint + remount**, not duplicate headers. |

Visual stability ≠ DOM persistence today. Operators see the same midnight header **reappear**, not stay fixed like a native app chrome layer.

### 1.2 Hard reloads vs client-side transitions

| Mechanism | Surfaces | Nav class |
|-----------|----------|-----------|
| `adminV2CommitNavigation` → `location.assign` | Sidebar (`AdminV2NavLink`), header tabs (Overview, Queue, AI log), dept pipeline/attention/WU cards, config-assist review links, most breadcrumbs via same link pattern | **Hard** |
| `runAdminV2NavigationTransition` → `router.push` | Workspace root dept tiles (`WorkspaceRootDepartmentGrid`) | **Soft** (orchestrated) |
| `router.push` (direct) | Work-unit queue row navigate actions, registry actions, some drawer paths | **Soft** |
| `window.location.href` | Work-unit block actions (`back_department`, `wu_workspace_root`, etc.) | **Hard** (bypasses sticky helper unless href built with `appendWorkspaceSiteToPath`) |
| Next `loading.tsx` | `dept/.../loading.tsx`, `work-unit/.../loading.tsx` — shows cold/skeleton **under** shell on soft nav | **Transition UI** |

**Binding doctrine:** [`adminv2_performance_phase1_navigation_and_interaction_contracts.md`](./adminv2_performance_phase1_navigation_and_interaction_contracts.md) — hard nav is intentional P0 reliability tradeoff.

**Coverage estimate (workspace hierarchy):** ~70% operator clicks that change dept/WU are **hard**; root → dept is **soft** only from department tiles, not sidebar.

### 1.3 Where should the persistent shell boundary live?

**Already correct boundary:**

```text
app/adminV2/layout.tsx          ← RSC, font, AdminV2Shell wrapper (all /adminV2/*)
  AdminV2Shell (client)         ← Sidebar + TopNav + content column + AI bar
    WorkspaceSiteFilterGate     ← workspace routes only
    {children}                  ← route segment
      app/adminV2/workspace/layout.tsx  ← auth bundle + WorkspaceOrgProvider (workspace only)
```

**Do not add a parallel shell.** Improvements should strengthen **this** boundary:

- Keep **chrome** in `AdminV2Shell` (header, sidebar, AI command surface).
- Keep **operational truth** in page segments + APIs (unchanged queue doctrine).
- Optional: lift **sidebar nav tree cache** to shell-level context so expand does not refetch.
- Optional: `sessionStorage` for `sidebarCollapsed` (today `useState(true)` resets every reload).

**Do not move shell into `workspace/layout` only** — settings/workflows/forms also use the same shell today.

### 1.4 Shell-level vs page-level

| Shell-level (stable chrome) | Page-level (swaps on route) |
|-----------------------------|-----------------------------|
| `AdminV2Shell`, `Sidebar`, `TopNavBar` | `workspace/page.tsx`, `dept/.../page.tsx`, `work-unit/.../page.tsx` |
| `WorkspaceSiteFilterGate` + provider | `WorkspaceChrome`, breadcrumbs, oper regions |
| `AICommandSurfaceShell`, `RecentAiActionsStrip` | Route `loading.tsx` skeletons |
| `AdminV2NavigationTransitionRibbon` | Drawer (`AdminEntityDrawer` via workspace providers) |
| `GlobalAssistantProvider` | Settings/forms inner layouts |

### 1.5 Lowest-risk fix for fixed header/sidebar feel

**Tier A — Safe now (UX + persistence, no nav doctrine change)**

- Recompose header: logo + search left; right cluster = site filter + profile menu; remove Overview/Queue/AI log tabs from header (relocate or drop per product).
- Profile dropdown: Settings link, Sign out (move off header button).
- Sidebar IA: `Home` icon (`Home` lucide) first; consistent ordering collapsed vs expanded; Settings/Automations placement aligned.
- Persist `sidebarCollapsed` in `sessionStorage`.
- Cache dept/WU tree in shell context or sessionStorage; **do not refetch on every expand** (`Sidebar.tsx` lines 53–82 only fetch when `!collapsed`).

**Tier B — Medium risk (feel, still incremental)**

- Extend **orchestrated soft nav** (`runAdminV2NavigationTransition`) to **sidebar** dept/WU links after bootstrap prefetch + contract test updates.
- Ensure all soft `href`s use `appendWorkspaceSiteToPath` (gap: `WorkspaceRootDepartmentGrid` tile `href` today may omit param; API prefetch passes `selectedSiteId` but URL can lag).
- Reduce TopNav `Suspense` flash (ensure TopNav does not suspend, or use static shell header skeleton matching final chrome).

**Tier C — Deferred / high risk**

- Global replacement of `adminV2CommitNavigation` with `router.push` — revives cancelled RSC transitions (documented P0 regression).
- Merging workspace RSC layout into parent to skip auth bundle — large blast radius.
- Full App Router `loading.tsx` removal on dept/WU without oper-region gates — skeleton churn returns.

### 1.6 Files involved

| Area | Paths |
|------|--------|
| Layout boundary | `web/app/adminV2/layout.tsx`, `web/app/adminV2/workspace/layout.tsx`, `web/app/adminV2/settings/layout.tsx` |
| Shell | `web/app/adminV2/components/AdminV2Shell.tsx` |
| Header | `web/app/adminV2/components/TopNavBar.tsx` |
| Sidebar | `web/app/adminV2/components/Sidebar.tsx` |
| Nav links | `web/app/adminV2/components/navigation/AdminV2NavLink.tsx` |
| Hard nav | `web/lib/adminV2/shellNavigation.ts` |
| Soft transition | `web/lib/adminV2/navigation/adminV2NavigationTransition.ts`, `web/components/admin/workspace/AdminV2NavigationTransitionRibbon.tsx` |
| Site sticky | `web/lib/adminV2/workspaceSiteFilterClient.ts`, `web/contexts/WorkspaceSiteFilterContext.tsx` |
| Root soft nav | `web/components/admin/workspace/WorkspaceRootDepartmentGrid.tsx` |
| Dept hard nav | `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` (`DeptOperConsoleQueueRow`) |
| Route loaders | `web/app/adminV2/workspace/dept/[departmentId]/loading.tsx`, `.../work-unit/.../loading.tsx` |
| Contracts | `web/tests/admin/adminV2NavigationContracts.test.ts`, `web/tests/lib/adminV2/adminV2NavigationTransition.test.ts` |
| CSS | `web/app/adminV2/adminV2.css`, `web/app/adminV2/components/workspace/workspace.css` |

### 1.7 Safe to implement now

- Header layout/typography and removal of perspective tabs from header (product-approved list).
- Site filter moved to top-right (still `WorkspaceSiteFilterStrip`, relocated in `TopNavBar`).
- Profile dropdown + sign-out relocation (no profile route required for dropdown; see §1.9).
- Sidebar Home icon + consistent nav order (collapsed/expanded).
- Sidebar tree cache + collapsed persistence.
- Append `workspace_site_id` to `WorkspaceRootDepartmentGrid` tile hrefs (small sticky hardening).

### 1.8 Defer

- Profile **page** (`/adminV2/profile` or similar) — **no route exists today**; dropdown can link to Settings or placeholder until scoped.
- Global hard → soft nav migration.
- Search implementation (placeholder can remain).
- Relocating Messages / Tasks / AI log — product decision if they leave header entirely (suggest sidebar or command surface, not this sprint’s minimum).
- Workspace root KPI site scoping (Card 4 from sticky sprint).
- Legacy canvas AdminV2 shell (non-workspace routes in `AdminV2Shell` second branch).

### 1.9 Profile route audit

| Item | Finding |
|------|---------|
| AdminV2 profile page | **None** under `web/app/adminV2/**` |
| User email in shell | Available via `AdminAuthProvider` / workspace layout (`userEmail` prop) — can drive profile menu label |
| Sign out | `TopNavBar` → Supabase `signOut` + `router.push("/login")` |
| Settings | `/adminV2/settings` exists; suitable dropdown item |
| “Data access profile” | Settings → Users & Roles only — not an operator profile page |

**Proposal:** Card 2 ships dropdown with **Settings**, **Sign out**, and **Profile** disabled or “Coming soon” until a minimal profile route is approved.

### 1.10 Risks to sticky `workspace_site_id` from nav changes

| Change | Risk | Mitigation |
|--------|------|------------|
| More `router.push` without path helper | Lose param on soft nav | Always `appendWorkspaceSiteToPath(href, stickyId)` before push |
| Remove `adminV2CommitNavigation` | Sticky still OK if URL built correctly | Do not remove until soft nav proven; commit helper already merges sticky site |
| Sidebar soft nav | Same as above | Reuse `readStickyWorkspaceSiteIdForNavigation` in transition `href` |
| Header relocate site filter | Low — context unchanged | Keep provider in `WorkspaceSiteFilterGate` |
| Full reload (remaining hard nav) | Sticky OK today | URL + sessionStorage hydrate on mount |

---

## 2. Sidebar IA issue (Automations jump)

**Collapsed rail** (`Sidebar.tsx` ~128–190):

1. Top: Workspace (`LayoutGrid`) + contextual dept/WU icons  
2. **Bottom (`mt-auto`):** Automations, Settings  

**Expanded panel** (~192–293):

1. Workspace  
2. **Automations** (immediately under Workspace)  
3. Departments tree  
4. **Bottom:** Settings only  

Automations **jumps** from bottom-right (collapsed) to second row (expanded). Fix: use **one ordered nav model** for both modes — e.g. Home → Automations → Departments (tree) → Settings, with collapsed rail showing the same vertical order (icons only, scroll middle section for dept context).

---

## 3. Proposed sprint plan (implementation-ready cards)

**Non-goals:** Full redesign; new config engine; global soft-nav rewrite; childcare-specific nav; queue/entity doctrine changes.

### Card 0 — Shell persistence audit / findings ✅

**Done in this doc.** Lock decisions:

- Shell boundary = `adminV2/layout` + `AdminV2Shell`.
- Reset cause = hard reload + remount + shell refetch, not missing layout.
- Nav doctrine unchanged unless Card 5 explicitly migrates a surface + updates contract tests.

**Acceptance:** Team agrees Tier A vs B scope before Card 1 starts.

---

### Card 1 — Header IA cleanup

**Scope:**

- Increase header type scale (e.g. `h-12` → `h-14` or tokenized `--adminv2-header-height`).
- Layout grid: `[logo][search flex][right cluster]`.
- Remove header nav: Overview, Queue, AI log (`TopNavBar.tsx`).
- Search stays left-adjacent to logo (placeholder OK).
- Relocate **site filter** to right cluster (left of profile) — extract `WorkspaceSiteFilterStrip` placement only.

**Files:** `TopNavBar.tsx`, `adminV2.css` (header tokens), optional small `AdminV2Header.tsx` extract.

**Acceptance:** Visual match wireframe direction; no new routes; sticky site still works.

---

### Card 2 — Profile dropdown / sign-out relocation

**Scope:**

- Add `AdminV2ProfileMenu` (client): avatar/initials, email sublabel, items: Profile (stub), Settings (`/adminV2/settings`), Sign out.
- Remove standalone Sign out button from header.
- Reuse existing sign-out logic from `TopNavBar`.

**Files:** new `AdminV2ProfileMenu.tsx`, `TopNavBar.tsx`, read email from `useAdminAuth` or existing context.

**Deferred:** `/adminV2/profile` page (sub-card or follow-up).

**Acceptance:** Sign out works; Settings navigates (hard nav via `AdminV2NavLink` OK); keyboard/a11y for menu.

---

### Card 3 — Sidebar icon / order / stability cleanup

**Scope:**

- Replace `LayoutGrid` with `Home` for workspace root link; label “Home” when expanded.
- Unified nav order collapsed + expanded (Home, Automations, dept tree, Settings).
- Fix Automations position jump (same slot in both modes).
- Persist `sidebarCollapsed` in `sessionStorage` keyed by principal/org if available.

**Files:** `Sidebar.tsx`, `AdminV2Shell.tsx` (read initial collapsed from storage).

**Acceptance:** Expand/collapse does not reorder Automations vs Settings; Home is first item.

---

### Card 4 — Expanded hierarchy behavior

**Scope:**

- Fetch `/api/admin/departments` + `/api/admin/work-units` once per session (or TTL cache in shell context).
- On expand: render from cache; background refresh optional.
- Show stable skeleton only on **first** load, not every expand.
- Optionally prefetch tree when shell mounts (idle), not only when `collapsed === false`.

**Files:** `Sidebar.tsx`, new `web/lib/adminV2/navigation/workspaceNavTreeCache.ts` (optional), shell-level provider if needed.

**Acceptance:** Second expand does not flash “Unavailable” or empty list; tree order stable.

---

### Card 5 — Navigation transition / reduce shell reload feel

**Scope (phased, contract-driven):**

- **5a (low):** Audit all `window.location.href` on work-unit page → use `appendWorkspaceSiteToPath` + prefer `adminV2CommitNavigation` for consistency.
- **5b (medium):** Add `appendWorkspaceSiteToPath` to `WorkspaceRootDepartmentGrid` hrefs.
- **5c (optional, gated):** Migrate **sidebar** dept/WU links to `runAdminV2NavigationTransition` + `router.push` with bootstrap prefetch — **only** if manual QA + `adminV2NavigationContracts` updated and no cancelled-transition regressions.

**Do not** remove `adminV2CommitNavigation` globally in this card.

**Files:** `Sidebar.tsx`, `WorkspaceRootDepartmentGrid.tsx`, `shellNavigation.ts`, `adminV2NavigationContracts.test.ts`, dept/WU pages as needed.

**Acceptance:** Contract tests green; staging QA checklist for sidebar + dept cards; sticky `workspace_site_id` on all migrated paths.

---

### Card 6 — Docs / tests / verification

**Scope:**

- Update `adminv2_performance_phase1_navigation_and_interaction_contracts.md` if Card 5c ships.
- Short § in `docs/system/workspace-system.md` on shell vs page chrome.
- Tests: sidebar order snapshot or string contracts; profile menu render; nav tree cache behavior; sticky param on grid hrefs.

**Verification:**

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/adminV2NavigationContracts.test.ts
cd web && npm run build
```

**Manual:**

1. Hard nav sidebar dept → WU: header chrome repaints but layout stable; site filter persists.  
2. Soft nav root tile → dept: transition ribbon; less “full app blink” than sidebar.  
3. Expand/collapse sidebar: Automations does not jump; tree does not empty-reload.  
4. Profile menu sign-out → login.

---

## 4. Rollback / risk notes

| Risk | Note |
|------|------|
| Soft-nav regression (dead clicks) | Card 5c is optional; keep hard nav default for sidebar until proven |
| Messages/Tasks access | Removing header tabs may hide entry points — confirm relocation before Card 1 |
| RSC layout latency on soft nav | Still runs workspace layout bundle; Tier B improves feel, not server cost |
| Contract drift | Any nav class change must update `adminV2NavigationContracts.test.ts` same PR |

---

## 5. Suggested sequencing

1. **Card 0** (this audit) — review  
2. **Cards 1–3** — parallelizable UX  
3. **Card 4** — sidebar stability  
4. **Card 5a–5b** — sticky + href hygiene  
5. **Card 5c** — only if product accepts soft sidebar risk  
6. **Card 6** — closeout  

**Estimated impact:** Cards 1–4 deliver most of “premium shell” **perception** without fighting the hard-nav doctrine. Card 5c is the only card that materially changes navigation physics.
