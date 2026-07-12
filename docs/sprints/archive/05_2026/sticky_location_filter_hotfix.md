# Sticky Location Filter + Configuration Scope Audit (Hot Fix)

**Path:** `docs/sprints/05_2026/sticky_location_filter_hotfix.md`  
**Status:** **Implemented** (Cards 0, 1, 2, 3, 5 — Card 4 deferred)  
**Date:** 2026-05-21  
**Prior art:** `docs/sprints/05_2026/site_filter_workspace_card.md` (first-pass site filter plumbing)

---

## Sprint goal

Make the AdminV2 **workspace site / location view filter** persist as **operator context** across navigation (dept, work-unit, queue tabs, shell nav) until the user changes or clears it — without rewriting AdminV2 architecture or building location-level configuration overrides.

**Companion (audit only):** Document how today’s configuration model could later support **org defaults + optional site overrides**, and what must stay deferred.

---

## Non-goals

- Full configuration-system sprint or new config engine
- Location-level overrides for layouts, workflows, forms, queues, or required fields
- Second-layer filters (room / age group) — see `site_filter_workspace_card.md`
- Replacing `adminV2CommitNavigation` with soft `router.push` globally
- Site filter on Settings, Workflows, Forms, legacy canvas AdminV2, or `/admin` (non-V2)
- Widening data access beyond `getAdminAccessContextCached` + `resolveQueueRecordScopeConstraints`
- Client-side service-role or privileged writes
- KPI / workspace-root rollup site scoping (unless explicitly added in a follow-up card)

---

## 1. Audit summary — location / site filter

### 1.1 Where state lives today

| Layer | Location | Behavior |
|-------|----------|----------|
| **UI selection** | `web/contexts/WorkspaceSiteFilterContext.tsx` | `selectedSiteId: string \| null` in React state only (`null` = all allowed sites). **Not** persisted to URL or storage. |
| **Bootstrap (allowed sites)** | `GET /api/admin/workspace/site-filter` | Sites from `locations` (`location_type = site`), filtered by `ctx.siteScope` / `allowedSiteLocationIds`. |
| **Provider mount** | `WorkspaceSiteFilterGate` in `AdminV2Shell` | Provider only when pathname is `/adminV2/workspace` or `/adminV2/workspace/**` (alias `/admin/v2/workspace/**`). |
| **API view narrowing** | Query param `workspace_site_id` | `parseWorkspaceSiteIdFromSearchParams` → `resolveQueueRecordScopeConstraints` (permission scope ∩ site subtree). |
| **Client API helper** | `web/lib/adminV2/workspaceSiteFilterClient.ts` | `appendWorkspaceSiteToUrl`, `workspaceViewCacheFingerprint` |
| **Session page cache** | `web/lib/workspace/adminV2WorkspaceSessionCache.ts` | Dept/WU/root snapshots keyed by `orgId`, `principalUserId`, `accessScopeFingerprint` — **does not** store selected view site (only `;view:` in fingerprint when callers pass site into fingerprint). |

### 1.2 Source of truth (today): **mixed, fragile**

- **Authoritative permission scope:** server (`getAdminAccessContextCached`, `accessScope.ts`).
- **Operator view selection:** client React context only.
- **Queue / bootstrap fetches:** `workspace_site_id` on **API URLs** when mounted pages read context — **lost after full navigation** because context resets.
- **Route URLs:** generally **omit** `workspace_site_id` (dept/WU links, sidebar, Overview tab, breadcrumbs, `adminV2CommitNavigation` targets).

### 1.3 Root cause of “sticky” failure

`AdminV2NavLink` and most workspace drill-ins call **`adminV2CommitNavigation`** (`web/lib/adminV2/shellNavigation.ts`), which uses **`window.location.assign`** (full document load) to avoid cancelled App Router transitions during heavy RSC work.

On each load:

1. `WorkspaceSiteFilterProvider` remounts with `selectedSiteId = null`.
2. Header dropdown resets to **All locations**.
3. API calls from pages that *would* append `workspace_site_id` run **unscoped** until the user re-selects.

This is consistent with the optional follow-up already noted in `site_filter_workspace_card.md` (“persist header site selection in `sessionStorage`”) but **URL carry-forward was never added** for path navigation.

### 1.4 Pages: preserve vs lose

| Surface | Provider available? | API uses `workspace_site_id`? | Survives nav today? |
|---------|---------------------|----------------------------------|---------------------|
| `/adminV2/workspace` | Yes | **No** — root page does not use `useWorkspaceSiteFilter` | Loses selection on leave/return |
| `/adminV2/workspace/dept/[id]` | Yes | Yes — bootstrap, summaries | Loses on `adminV2CommitNavigation` / sidebar |
| `…/work-unit/[id]` (+ queue query) | Yes | Yes — bootstrap, queues, KPI fetches, queue list routes | Loses on nav; `?queue=` preserved, **not** site |
| Top nav Overview / Queues tabs | Yes | N/A | Hrefs lack site param |
| Sidebar dept / WU tree | Yes (under workspace shell) | N/A | Hrefs lack site param |
| AI command surface | Yes (under gate) | Passes `workspace_site_id` to task-assist when context set | Loses after reload |
| Record drawer | Yes (workspace layout) | Entity GET generally **not** site-filtered; scope enforced on record access | Drawer open/close OK within same load |
| Settings / Workflows / Forms | Gate off — **no** provider | N/A | N/A (by design) |
| Legacy canvas AdminV2 shell | No site gate | N/A | N/A |

**Note:** User examples like `/adminV2/work-unit/[id]` are aliases of the real route: `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]`.

### 1.5 APIs already accepting `workspace_site_id`

- `GET /api/admin/departments/[departmentId]/operational-bootstrap`
- `GET /api/admin/departments/[departmentId]/work-unit-queue-summaries`
- `GET /api/admin/work-units/[id]/operational-bootstrap`
- `GET /api/admin/work-units/[id]/queues`
- `GET /api/admin/queues/[workUnitId]/[queueKey]`
- `GET /api/admin/ai/task-assist/entity-search`

**Not wired (deferred in prior card):** workspace-root KPI resolvers, legacy opportunity-queue endpoints, most entity GETs.

### 1.6 Access-control implications

- View filter is **subset-only**: `resolveQueueRecordScopeConstraints` intersects permission `locationIds` with the selected site subtree (`expandLocationIdsUnderSites`).
- Restricted users: invalid or non-allowed `workspace_site_id` → `recordScopeImpossible` / empty cohort (existing server behavior).
- Sticky persistence must **re-validate** against `GET /api/admin/workspace/site-filter` on hydrate — never trust storage alone to widen scope.
- Changing user access profile mid-session: `accessScopeFingerprint` changes → sessionStorage keys should miss → safe fallback to “all allowed” or URL param after re-validation.

### 1.7 Tests / contracts today

- `web/tests/admin/resolveQueueRecordScopeConstraints.test.ts` — param parse, URL append, fingerprint, scope intersection, reject disallowed site.
- `web/tests/agent/taskAssist/taskAssistEntitySearchService.test.ts` — task-assist respects `workspaceSiteId`.
- **Gap:** no integration test for provider persistence or navigation href carry-forward.

### 1.8 Architectural risks to avoid

- Treating view filter as **config** or persisting it in org settings tables.
- Bypassing `resolveQueueRecordScopeConstraints` on queue routes.
- Using queue rows as scope truth (queue doctrine unchanged).
- Soft-nav-only fix without addressing full reload — **insufficient** for current shell.
- Stale `sessionStorage` site after access revocation — must clear invalid IDs.
- Split-brain: URL says site A, storage says site B — need a single precedence rule.

### 1.9 Explicitly deferred (this hot fix)

- Workspace **root** KPI / rollup site filtering (unless product demands in Card 4).
- Room / age-group layered filter UX.
- Site filter on non-workspace AdminV2 routes.
- Entity drawer GET site narrowing (record access already scoped; drawer content is entity-authoritative).
- Refactor away from `adminV2CommitNavigation`.

---

## 2. Configuration scope audit (guidance only)

**Question:** Can Alloy eventually support **org-level defaults** + **optional location/site overrides** without a platform rewrite?

### 2.1 Systems that already support scoped patterns

| System | Scope today | Override / layering pattern |
|--------|-------------|------------------------------|
| **Field behavior (opportunity drawer)** | Org `record_drawer_layouts` + `field_definitions` | **Precedence:** `field_placements_v1` → definition policies → presets (`resolveEffectiveFieldBehavior`) — **best template** for future site overrides on a surface. |
| **Status definitions** | Org rows + industry `org_id IS NULL` defaults | Merge by `status_key`; not location-scoped. |
| **Communications bindings** | Org + optional `location_id` on `communication_provider_bindings` | Nullable FK — **org default + site-specific row** already in schema. |
| **Tour availability** | Org rules keyed by `location_id` | Per-site operational config (Settings tours UI filters by `location_id`). |
| **User data visibility** | `user_access_profiles` + `user_site_access` | **Access** scope, not product config — do not conflate with config inheritance. |
| **Department / work unit metadata** | Org-owned rows; JSON `metadata` | Attention buckets, placement priority — **WU/dept** granularity, not site, today. |
| **Queue definitions** | `work_units.queue_definition` | Org/WU level; validated JSON — no site column. |
| **Action placements** | `action_placements` org rows | `entity_type`, `surface`, `slot` — org-global. |
| **Forms / packets** | `form_definitions` org | No site dimension in definitions (launch context may carry opportunity `location_id`). |

### 2.2 Predominantly org-global today

Layouts, field registry, field sections, action placements, workflow definitions, queue definitions, needs-attention bucket metadata (dept/WU), KPI placements, option sets, most Settings four-plane surfaces, enrollment pipeline preset scripts.

### 2.3 Patterns reusable for future inheritance

1. **Effective resolution function** with ordered precedence (layout field behavior).
2. **Nullable scope FK** on operational rows (communications bindings).
3. **Validated JSON subtrees** on entity metadata (`placement_priority_v1`, `opportunity_attention_rules`) — could gain optional `scope: { type: 'site', location_id }` **only with schema/version discipline**.
4. **Industry / org template fallbacks** (status definitions) — analogous to “platform preset → org → site”.

### 2.4 Recommended future precedence model (when pursued)

For a given **config domain** and **surface** (e.g. drawer_overview, outbound SMS binding):

1. **Platform preset** (industry / entity-type defaults, non-tenant-specific)
2. **Org default** (`org_id`, `location_id IS NULL`)
3. **Site override** (`location_id` set, same org) — narrowest wins for that key
4. **Runtime effective merge** in code (never trust UI-only JSON)

**View filter (`workspace_site_id`)** remains **session operator context**, not a config layer.

### 2.5 Traps to avoid for location-level config later

- Storing business invariants only in site-scoped JSON without server enforcement.
- Letting site override **widen** permissions or bypass workflows/events.
- Parallel config stores per site without version/schema validation.
- Encoding childcare-only keys in platform resolution — use vertical presets/seeds.
- Cache keys that ignore site override version → stale effective config in workspace session cache.
- Using queue preview config as SoT for override resolution.

---

## 3. Recommended hot fix design

### 3.1 Strategy: **URL + sessionStorage**, single helper

**Principle:** Persistence must survive **`window.location.assign`**. React context alone is insufficient.

| Mechanism | Role |
|-----------|------|
| **URL query `workspace_site_id`** | Primary carry-forward on navigation and shareable/bookmarkable workspace URLs; matches API param name. |
| **sessionStorage** | Reload continuity when URL omits param (e.g. user lands on `/adminV2/workspace` from bookmark); keyed like existing workspace cache: `orgId` + `principalUserId` + `accessScopeFingerprint`. |
| **React context** | Live UI state; syncs from URL/storage on mount; writes back on change. |

**Hydration precedence (locked):**

1. Valid `workspace_site_id` in current URL (if in bootstrap `sites` list, or matches single-site auto-scope).
2. Else valid value from sessionStorage for current principal/org/fingerprint.
3. Else `null` (all allowed sites).

**On user change (dropdown):**

1. Update context state.
2. Write sessionStorage.
3. **`replaceState` or `assign`** current workspace path with updated query (preserve other params, e.g. `queue=needs_attention`).
4. Do **not** refetch queues solely because of replaceState if already on page — pages already key off `selectedSiteId`; optional light re-bootstrap is acceptable.

**Clearing:** Empty dropdown value → remove param from URL, remove storage key, set context `null`.

### 3.2 Scope boundaries

- **In scope:** All `/adminV2/workspace/**` path navigation and `adminV2CommitNavigation` targets under that prefix; provider hydration; invalid site stripping; tests for helper + hydration.
- **Out of scope:** Settings sidebar, workflows, forms, `/admin` legacy.

### 3.3 Navigation behavior

Add **`appendWorkspaceSiteToPath(path: string, siteId: string | null): string`** next to `appendWorkspaceSiteToUrl` in `workspaceSiteFilterClient.ts` (same param constant).

Wire at centralized choke points:

1. **`adminV2CommitNavigation`** — if target pathname starts with `/adminV2/workspace`, merge current sticky site from storage or parse current `window.location.search` (prefer explicit `opts.siteId` when passed).
2. **`AdminV2NavLink`** — optional: pass through after normalizing href (or rely on 1 if all workspace nav uses commit).
3. **`Sidebar`** workspace/dept/WU hrefs.
4. **`TopNavBar`** Overview + Queues hrefs.
5. **Dept page** — all `WORKSPACE_BASE` / `wuHref` / breadcrumb `href`s before `adminV2CommitNavigation`.
6. **Work-unit page** — breadcrumb/back/`window.location.href` workspace exits (several raw assigns today).

**Preserve existing query keys:** When appending site, use `URLSearchParams` merge (do not drop `queue`, `attention_bucket`, etc.).

### 3.4 Invalid / stale location handling

On bootstrap load after hydration candidate:

- If ID not in `bootstrap.sites` and not single-site implicit → clear context, storage, and strip param from URL (`router.replace` or `history.replaceState`).
- If `site_scope === 'restricted'` and list empty → hide dropdown (existing); force null.
- If access fingerprint changes (layout provides new fingerprint) → storage key miss → OK.

### 3.5 Access safety

- Never add site param to non-workspace API routes unless those routes already call `resolveQueueRecordScopeConstraints`.
- Server remains authoritative; client persistence is UX only.
- Document that deep-linking `?workspace_site_id=` outside allow-list yields empty queues / bootstrap errors — same as manual API call today.

### 3.6 Drawer / record flows

- **No change required** for drawer open path: entity APIs enforce access scope on record id.
- Optional **follow-up:** pass view site into task-assist only (already done when context exists).

### 3.7 Workspace root page

- **Card 4 (optional):** If product wants Overview tile counts site-scoped, add `useWorkspaceSiteFilter` + append param on fetches that should respect view — **confirm with product**; prior card explicitly deferred KPI wiring.

---

## 4. Implementation cards

Execute in order. Each card should be a focused PR-sized change.

### Card 0 — Persistence helpers + tests ✅

**Done:** `web/lib/adminV2/workspaceSiteFilterClient.ts`, `web/tests/adminV2/workspaceSiteFilterClient.test.ts`

**Files:**

- `web/lib/adminV2/workspaceSiteFilterClient.ts` — add `readWorkspaceSiteFromSearchParams`, `appendWorkspaceSiteToPath`, `read/write/clearWorkspaceSiteSession`, `resolveStickyWorkspaceSiteId` (precedence logic).
- `web/tests/adminV2/workspaceSiteFilterClient.test.ts` (new)

**Tasks:**

- Path helper preserves hash and existing search params.
- Session key: `alloy:v1:admV2:ws:viewSite:${orgId}:${userId}:${fingerprint}` (align versioning with `adminV2WorkspaceSessionCache` SCHEM_A_V pattern).
- Unit tests: precedence, merge params, clear, invalid id stripped.

**Acceptance:** Tests green; no UI changes.

---

### Card 1 — Context hydrate + sync ✅

**Done:** `web/contexts/WorkspaceSiteFilterContext.tsx`, `WorkspaceSiteFilterPersistenceScopeBridge.tsx`, `AdminV2WorkspaceClientProviders.tsx`

**Files:**

- `web/contexts/WorkspaceSiteFilterContext.tsx`
- `web/contexts/WorkspaceOrgContext.tsx` (read orgId, fingerprint, principalUserId — already on provider tree under workspace layout)

**Tasks:**

- On mount: bootstrap fetch + `resolveStickyWorkspaceSiteId` from `window.location` + session.
- `setSelectedSiteId`: update state, session, `history.replaceState` on workspace paths (use `usePathname` + `useSearchParams` from `next/navigation` in provider or small child hook).
- Subscribe to `popstate` if needed (low priority for assign-heavy nav).

**Acceptance:**

- Select site on dept page → full reload via sidebar to WU → dropdown still shows site; network requests include `workspace_site_id`.

---

### Card 2 — Navigation choke points ✅

**Done:** `shellNavigation.ts`, `dept/.../page.tsx`, `work-unit/.../page.tsx` (breadcrumbs + `window.location` exits). `adminV2CommitNavigation` covers `AdminV2NavLink`, Sidebar, TopNavBar, AI command surface.

**Files:**

- `web/lib/adminV2/shellNavigation.ts` — `adminV2CommitNavigation(href, opts?)` merges site for workspace targets (read sticky helper).
- `web/app/adminV2/components/navigation/AdminV2NavLink.tsx` (only if commit helper insufficient)
- `web/app/adminV2/components/Sidebar.tsx`
- `web/app/adminV2/components/TopNavBar.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/page.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
- `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` (card links using commit navigation)

**Tasks:**

- Every workspace `href` / assign / commit gets `appendWorkspaceSiteToPath` when sticky site set.
- Breadcrumbs and back links on WU page (raw `window.location.href` sites).

**Acceptance:**

- Manual: dept → WU → Overview tab → dept via sidebar — site param present in URL when filter active.
- `?queue=needs_attention` still works with site param appended.

---

### Card 3 — Invalid site + access fingerprint ✅

**Done:** `resolveStickyWorkspaceSiteId` + `applyValidatedSite` in provider; invalid URL param stripped via `replaceWorkspaceSiteInBrowserUrl`.

**Files:**

- `WorkspaceSiteFilterContext.tsx` (validation after bootstrap)
- Optional: strip param in `WorkspaceSiteFilterGate` child once on mismatch

**Tasks:**

- If hydrated site ∉ allowed list → clear all three layers (context, storage, URL).
- Log dev-only once if needed.

**Acceptance:**

- Tamper URL with foreign site UUID → UI resets to All locations; API not called with bad id (or returns empty safely).

---

### Card 4 (optional) — Workspace root site-scoped fetches ⏭️ **Deferred**

Not required for sticky-filter acceptance: URL param persists on navigation to `/adminV2/workspace`; root KPI/rollup APIs remain org-wide until product requests scoping.

**Files:**

- `web/app/adminV2/workspace/page.tsx`
- Any root rollup API routes identified in grep (only if they should respect view filter)

**Tasks:**

- Product decision: scope root tiles or leave org-wide.
- If yes: mirror dept pattern with `appendWorkspaceSiteToUrl` on relevant fetches.

**Default for hot fix:** **Skip** unless PM confirms — document in PR.

---

### Card 5 — Docs + contract update ✅

**Done:** `docs/system/workspace-system.md`, `site_filter_workspace_card.md`, this file.

**Note:** Location-level **configuration** overrides (org default + site override) were **audit-only** in this sprint — not implemented.

**Files:**

- `docs/sprints/05_2026/site_filter_workspace_card.md` — mark persistence shipped, link this sprint.
- `docs/system/workspace-system.md` — short § “Workspace view site (operator context)”: URL param, storage, not config.
- This file — update status to **implemented** when done.

**Acceptance:** Active docs reflect behavior; operating doctrine unchanged (no new bypass paths).

---

## 5. Acceptance criteria (hot fix)

- [x] Multi-site user selects a site; navigates workspace → dept → WU → queue tab → Overview → back via sidebar; **filter unchanged** until cleared (via URL + session + `adminV2CommitNavigation`).
- [x] Full page reload with `?workspace_site_id=<allowed>` restores filter and scoped queue/bootstrap data.
- [x] Clearing filter removes param from URL and storage; data returns to all allowed sites.
- [x] Restricted user cannot sticky a site outside allow-list (URL tamper resets).
- [x] Settings/workflows navigation does not require site param; returning to workspace restores last sticky site from storage when URL has no param.
- [x] Queue selection doctrine unchanged: row click still opens drawer via entity APIs.
- [x] No new server tables; no config engine.

---

## 6. Verification steps

```bash
cd web && npx tsc --noEmit
cd web && npm run lint
cd web && npm run test -- web/tests/admin/resolveQueueRecordScopeConstraints.test.ts
cd web && npm run test -- web/tests/adminV2/workspaceSiteFilterClient.test.ts
```

**Run 2026-05-21:** `tsc`, targeted tests above — see implementation report in chat.

**Manual (staging or local):**

1. Corp or multi-site test user → select site on dept operational page → confirm bootstrap/summary network calls include `workspace_site_id`.
2. Sidebar navigate to another dept/WU → confirm header + data still scoped.
3. Copy URL with param → hard refresh → still scoped.
4. Clear filter → counts widen to allowed org/sites.
5. Restricted user with 2 sites → cannot use disallowed UUID in query string.

---

## 7. Rollback / risk notes

| Risk | Mitigation |
|------|------------|
| Broken query merge drops `queue` / attention params | Card 0 tests + manual WU needs-attention link |
| Stale storage after role scope change | Fingerprint in storage key; validate on bootstrap |
| Extra assign churn if replaceState on every dropdown change | Only replace when value actually changes |
| Users share URLs with site param | Intended; still permission-bound server-side |

**Rollback:** Revert client persistence + href wiring; server APIs unchanged (param was already supported).

---

## 8. Suggested commit message (implementation pass)

```
fix(adminV2): persist workspace site filter across navigation

Carry workspace_site_id on workspace URLs and sessionStorage so
adminV2CommitNavigation reloads keep operator view context; validate
against site-filter bootstrap.
```

---

## 9. File inventory (likely touch list)

| Area | Paths |
|------|-------|
| Context | `web/contexts/WorkspaceSiteFilterContext.tsx` |
| Client helpers | `web/lib/adminV2/workspaceSiteFilterClient.ts` |
| Server scope | `web/lib/admin/resolveQueueRecordScopeConstraints.ts` (read-only unless bug) |
| Shell nav | `web/lib/adminV2/shellNavigation.ts`, `AdminV2NavLink.tsx`, `Sidebar.tsx`, `TopNavBar.tsx` |
| Pages | `workspace/page.tsx`, `workspace/dept/[departmentId]/page.tsx`, `…/work-unit/[workUnitId]/page.tsx` |
| Shell | `AdminV2Shell.tsx`, `WorkspaceSiteFilterGate.tsx` |
| API bootstrap | `web/app/api/admin/workspace/site-filter/route.ts` |
| Tests | `web/tests/admin/resolveQueueRecordScopeConstraints.test.ts`, new `workspaceSiteFilterClient.test.ts` |
| Docs | `docs/system/workspace-system.md`, `site_filter_workspace_card.md` |

---

## 10. Architecture notes (implementation pass)

- Keep **view filter** separate from **configuration scope** work — do not add `location_id` to layout tables in this sprint.
- Prefer extending **`workspaceSiteFilterClient.ts`** over ad-hoc string concatenation in pages.
- When implementing Card 2, grep for `WORKSPACE_BASE`, `adminV2CommitNavigation`, and `window.location` under `web/app/adminV2/workspace` to catch stragglers.
- AI command surface already forwards `workspace_site_id` when context is populated — sticky fix unlocks that path across reloads.
