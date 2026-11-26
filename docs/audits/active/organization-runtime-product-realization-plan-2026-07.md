---
owner: engineering
status: accepted
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
base_sha: 1bfe7d1de1539b9a13f0903dd5d0e87ade71bbf0
---

# Alloy Organization Runtime & Product Realization Plan

**Role:** Engineering Director discovery (documentation only; no product-code changes).  
**Worktree:** `wt4-org-runtime-realization` · **Branch:** `agent/cursor/4-org-runtime-realization`  
**Base:** `origin/staging` @ `1bfe7d1de` · Ahead/Behind: `0/0`

---

## 1. Executive summary

Organization already has a **Configuration Runtime** (Locations is the frozen visual/product reference) and Workspace already has a **Work Unit / Alloy Runtime Kernel** (immediate navigation, stable shell, commit/settlement, retention). These are **two different runtimes**. The realization task is not to mount `WorkUnitSurface` under `/organization`. It is to extend the **ten operational runtime laws** and interaction continuity into Configuration surfaces, while completing Programs product composition against the Locations doctrine — without reopening assignment, publication, distribution, or Program identity contracts.

**Primary performance finding (code-evident):** left-rail **Organization** uses hard `window.location.assign` because soft-nav eligibility excludes settings/organization (`web/lib/adminV2/shellNavigation.ts:54–61`). Workspace continuity does not apply today on that click.

**Primary product finding:** Programs shares Configuration Detail/Overview chrome with Locations (`docs/audits/active/programs-runtime-composition-alignment-2026-07.md`) but still differs in collection hierarchy (no landing mode), Commercial chapter dual-home (`/settings/commercial`), form/grid density in Offerings/Pricing, and route namespace split (`/organization/programs` vs `/settings/locations`).

**Recommended inheritance strategy:** **shared primitives + law inheritance**, not direct Work Unit kernel mounting in Checkpoint A. Introduce an Organization/Configuration continuity layer (soft-nav eligibility, retained shell, progressive hydration, prefetch) that reuses Configuration Runtime composition and copies Workspace *patterns* (acknowledge → retain → warm → settle). Kernel Attention/Focus modeling for Configuration is a later optional phase after continuity is proven.

**Recommended first implementation checkpoint:** **Checkpoint A — Organization Runtime Foundation** (soft-nav into `/organization`, stable settings shell across config domains, landing progressive paint, IA link fixes).

---

## 2. Current runtime architecture (Workspace / Work Unit)

### 2.1 What shipped

Canonical closeout: `docs/sprints/completed/work-unit-runtime-simplification-closeout.md`.  
Governing laws: `docs/platform/runtime/operational-runtime-doctrine.md` (ten immutable laws).  
Live stack is the **Alloy Runtime Kernel (K1–K4)** + Presentation Runtime V2 — not the deleted `useWorkUnitSurfaceRuntime` still named in some doctrine indexes.

| Layer | Owner | Key files |
|-------|-------|-----------|
| Provider shell | Workspace layout | `web/app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx` |
| Kernel | K1 Attention → K2 Provisioning → K3 Focus | `web/lib/runtime/kernel/RuntimeKernelContext.tsx`, `attention.ts`, `provisioning.ts`, `focus.ts` |
| Surface Host | Retained Workspace + committed Work Unit | `web/lib/experience/surfaceHost/SurfaceHostContext.tsx` |
| Presentation | Pure model → UI | `WorkUnitSurface.tsx`, `QueueRegion.tsx`, `FocusPanelSurface.tsx` |
| Committed runtime | Focus → surface model | `web/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts` |
| Settlement | Post-commit KPI/rail fill | `useWorkUnitSettlement.ts` |
| Routes | Rewrite `/workspace` → `adminV2/workspace` | `web/next.config.ts:205–209` |

### 2.2 Capabilities that are genuinely generic

- Immediate interaction acknowledgment (K1 &lt;50ms marks; optimistic row selection).
- Stable chrome + yield choreography (Surface Host hold/yield).
- Continuous navigation within soft-nav-eligible paths (shell stays mounted).
- Predictive warm / prefetch (`prefetchWorkUnitProvisioning`, `prepareOperationalDestination`).
- Commit vs Settlement split (geometry first; values later).
- Reveal/hold/known-empty doctrine (`queueRegionRenderState`, performance doctrine).
- Session retention patterns (org + principal keyed caches).
- Perceived performance instrumentation (`web/lib/perf/perceivedPerf.ts`).

### 2.3 Capabilities that remain Work-specific

- `workUnitEntryResource` / provisioning-answer payload (work views, queue rows, default operational subject).
- Opportunity Focus Panel / `useRecordWorkRuntime`.
- Queue row grain and Work View pill switching.
- Operational Mode default-subject auto-open.

**Implication for Organization:** reuse **laws + shell continuity + prefetch/retention patterns**. Do not treat Work Unit entry resources or `QueueRegion` opportunity rows as drop-in Organization UI.

### 2.4 Explicit doctrine gap (already named)

Operational Runtime Doctrine Law binding:

> Configuration surfaces are a later extension… the same laws will apply when a `SettingsSurfaceViewModel` is adopted.  
> — `docs/platform/runtime/operational-runtime-doctrine.md:75`

Settings/Organization runtime was out of scope for Runtime Simplification (`work-unit-runtime-simplification-closeout.md:35`).

---

## 3. Organization architecture

### 3.1 Route reality

There is **no** `web/app/organization/**` tree. Canonical browser URLs rewrite into settings:

| Browser URL | Mechanism | App file |
|-------------|-----------|----------|
| `/organization` | rewrite | `web/app/adminV2/settings/organization/page.tsx` |
| `/organization/programs` | rewrite | `…/organization/programs/page.tsx` |
| `/settings` | redirect → `/organization` | `web/next.config.ts:87` |
| `/settings/:path*` | rewrite → `adminV2/settings/:path*` | `web/next.config.ts:201` |

Citations: `web/next.config.ts:83–99`, `195–201`; constants in `web/lib/admin/canonicalAdminRoutes.ts:29–54`.

### 3.2 Landing

- Server page: `force-dynamic`, `getAdminContextCached`, parallel `orgs` + site `locations` (`organization/page.tsx:8–58`).
- UI: `OrganizationConfigurationPage` — ConfigurationContext + domain cards from static registry `organizationConfigurationDomains()` (`OrganizationConfigurationPage.tsx`; `web/lib/configRuntime/organizationRuntime.ts`).
- Frozen product contract: `docs/system/organization-configuration-runtime-v2.md`.

### 3.3 Primary navigation

- Left rail footer **Organization** → `/organization` (`Sidebar.tsx` via `CANONICAL_ADMIN_CONFIG_LANDING`).
- `AdminV2NavLink` → `commitAdminV2NavLinkNavigation` → **hard nav** when not soft-eligible (`adminV2SoftNavLinkCommit.ts:33–36`; `shellNavigation.ts:54–61`).
- Config-mode sidebar groups: Locations/Access/Communications under Organization chapter (`configurationModeNav.ts:46–74`).
- **IA drift:** config-mode “Programs” still points to `/settings/commercial` (`configurationModeNav.ts:143–149`) while landing card and canonical routes use `/organization/programs`.

### 3.4 Mount / remount behavior

| Transition | Soft? | Effect |
|------------|-------|--------|
| Workspace ↔ Work Unit | Yes (default) | Shell retained |
| Workspace → Organization (rail) | **No** | Full document reload |
| Org → Locations via domain `Link` | App Router soft | Settings shell typically retained |
| Org → Locations via config-mode `AdminV2NavLink` | **Hard** | Full remount again |

Settings loading fallback: structure-neutral pulse (`web/app/adminV2/settings/loading.tsx`) — not Organization-shaped.

### 3.5 Perceived-performance weaknesses (code)

1. Hard nav into Organization (P0).
2. Stacked `force-dynamic` + middleware auth + dual layouts + entity labels + org/locations SSR (P1).
3. Generic settings loading chrome (P1).
4. Dual soft vs hard paths to the same destinations depending on Link vs AdminV2NavLink (P2).
5. Planned `/organization/locations` not implemented (`configuration-platform.md:301`).

---

## 4. Locations architecture

### 4.1 Canonical route (live)

**`/settings/locations`** — not `/organization/locations` (planned only; `configuration-platform.md:301`).

Single client workspace page: `LocationsConfigurationPage` with query contract:

```text
/settings/locations
/settings/locations?locationId=&tab=&itemId=
```

(`web/app/adminV2/settings/locations/page.tsx:7–17`; href builders `locationWorkspaceModel.ts:91–109`)

### 4.2 Owned concerns (all live)

From `LOCATION_WORKSPACE_TABS` (`locationWorkspaceModel.ts:5–13`):

| Tab | Surface |
|-----|---------|
| Overview | `LocationOverviewSurface` |
| Programs | `LocationProgramDetailPanel` (local offerings; Add → `/organization/programs`) |
| Rooms | Room create/detail panels |
| Schedule | Schedule pattern master/detail |
| Tours | `LocationToursPanel` (keep-alive) |
| Placement | `LocationPlacementPanel` (keep-alive; org-scoped ranking) |
| Access | `LocationAccessPanel` |

Identity edit is intentional (“Edit location”), not a tab.

### 4.3 Composition doctrine

Locations is the **Configuration Runtime V1 reference**: Context → Queue → Workspace, read-first / intentional edit, command rail, collection landing before selection (`docs/system/configuration-runtime-v1.md`; `configuration-workspace-platform-doctrine.md`).

Architecture:

```text
NO locationId → LocationsLanding (org collection health)
locationId    → [LocationsObjectSelector | ConfigDetailRuntime + tab body]
```

### 4.4 Data / performance notes

- Hook `useLocationsConfigurationSettings`: hierarchy locations + program categories + **per-site schedule fan-out** (N+1).
- No React Query; plain fetch + useState.
- Tours/Placement keep-alive to avoid remount cost.
- Bug: Programs Availability deep-links use `section=programs` but Locations reads `tab` (`ProgramDomainSections.tsx:188` vs `locations/page.tsx:14`).

---

## 5. Programs / Commercial architecture

### 5.1 Canonical Programs

| Item | Value |
|------|-------|
| URL | `/organization/programs` |
| Page | `web/app/adminV2/settings/organization/programs/page.tsx` |
| Workspace | `ProgramsPublicationWorkspace` |
| Loader | `GET /api/admin/configuration/programs` (full snapshot) |
| Sections | overview, offerings, pricing, availability, policies, relationships, publication, assignment, history (`programConfigurationSections.ts`) |

Accepted platform capabilities (do not reopen): assignment, immutable publication, distribution, history, Location consumption — `web/lib/configPublication/*`, Programs publication adapter.

### 5.2 Remaining Commercial authority

`/settings/commercial` still mounts `CommercialConfigWorkspace` with chapters:

Programs & tuition · Catalog · Policies · Accounting · Simulator · Funding (`CommercialConfigWorkspace.tsx:90–97`).

Canonical Programs **embeds** tuition/catalog/policies panels from Commercial (`ProgramDomainSections.tsx` imports). Commercial remains a parallel authoring home — the main IA debt.

Config-mode nav still labels Commercial as “Programs” → `/settings/commercial` (`configurationModeNav.ts:143–149`).

### 5.3 Why Programs still feels unlike Locations (structural)

Certified chrome alignment is real (`programs-runtime-composition-alignment-2026-07.md`). Residual gaps:

| Dimension | Locations | Programs |
|-----------|-----------|----------|
| Page hierarchy | Collection landing → detail | Always rail + detail; auto-selects first |
| Shell | Selector only when selected | Always `ConfigCollectionRail` |
| Object identity | Operating place (site) | Publishable catalog + lifecycle |
| Read vs edit | Strict view→edit on owned concerns | Overview read-first; Definition form; Offerings/Pricing still Commercial-dense |
| Overview content | Capacity / rooms / hours operating picture | Catalog + publication readiness |
| Extra concerns | — | Publication / Assignments / History (correct for publishable domains) |
| Route parent | `/settings/locations` | `/organization/programs` |
| Sibling workspace | — | `/settings/commercial` still live |

**Do not blindly clone Locations.** Programs must keep lifecycle tabs and Organization publisher semantics; it should gain Locations-quality **collection landing**, **read-first owned concerns**, and **Commercial chapter retirement** into Program/workspace relationships.

### 5.4 Target Programs composition (text wireframe)

```text
┌─ ConfigurationContext: Programs ─────────────────────────────┐
│ Organization › Programs          [Add Program]               │
└──────────────────────────────────────────────────────────────┘

MODE A — no programId (collection landing; NEW parity with Locations)
┌──────────────────────────────────────────────────────────────┐
│ Scope bar · N Programs · published count · attention         │
│ Needs Attention list                                         │
│ Program collection list (name · category · lifecycle)        │
└──────────────────────────────────────────────────────────────┘

MODE B — programId selected
┌─ Rail (320) ──────────┬─ Detail ─────────────────────────────┐
│ ConfigCollectionRail  │ ConfigObjectHeader (identity+status) │
│ draft/published/attn  │ Overview | Offerings | Pricing | …   │
│                       │ Pub | Assignments | History            │
│                       │                                       │
│                       │ Overview: glance + readiness +        │
│                       │   capabilities (read-first)           │
│                       │ Edit Program → Definition overlay     │
│                       │ Offerings: master/detail child objects│
│                       │ Pricing: Tuition as owned concern UI  │
└───────────────────────┴───────────────────────────────────────┘

Workspace relationships (not page-level Commercial chapters):
  Tuition / Catalog / Policies → Program tabs or deep links
  Accounting / Simulator / Funding → Organization Business chapter
  until each has its own domain home
```

---

## 6. Performance baseline

### 6.1 Live browser timings

**Not collected in this discovery session.** Runtime Intent/Admission refused coherent actuation:

- Sprint initially had no manifest posture; corrected to `shared-read-only` / `shared` for this worktree.
- Observed capacity: **3 active runtimes / max 2 (over budget)**.
- Admission decision while evaluating: `refused-invalid-posture` / capacity pressure; agent auth session missing (`alloy-sprint-start` reported `auth=missing`).
- Policy: no direct Docker/Supabase start; prefer existing shared runtime via Intent → Actuation only.

**Measurement protocol (Checkpoint A entry gate):**

1. Admit shared-readonly against an existing healthy namespace (or free capacity).
2. `alloy-agent-login 4` + `alloy-dev-start wt4-org-runtime-realization` (port **3014**).
3. Authenticated Playwright or DevTools Performance + Network for:

| Metric | How |
|--------|-----|
| Rail click → first Organization paint | Performance mark / filmstrip |
| Organization shell usable | Domain cards interactive |
| Org → Locations (card Link vs config nav) | Compare soft vs hard |
| Locations collection / selected restore | Network waterfall |
| Location tab switches | Remount vs keep-alive |
| Programs route transition | Snapshot fetch timing |
| Duplicate API calls | Network filter |
| Blank / remount / CLS | Layout shift + React profiler |

Reuse existing marks where present: `web/lib/perf/perceivedPerf.ts`, `markWorkUnitNavigationStart`, settings loading testid `settings-route-loading`.

### 6.2 Code-evident baseline (high confidence)

| Observation | Evidence | Impact |
|-------------|----------|--------|
| Workspace → Organization is full reload | `shellNavigation.ts:54–61`; `adminV2SoftNavLinkCommit.ts` | Blank/boot shell; providers remount |
| Soft nav only for operator workspace paths | same | Config domains excluded by design today |
| Settings loading is generic pulse | `settings/loading.tsx`; `settingsRouteLoadingChromeStable.test.tsx` | Not Organization-shaped reservation |
| Locations cold path scales with site count | schedule `Promise.all` per site in `useLocationsConfigurationSettings` | Linear API fan-out |
| Programs one-shot snapshot | `ProgramsPublicationWorkspace` GET `/api/admin/configuration/programs` | Good lifecycle coherence; cold cost on entry |
| Dual nav semantics to same href | domain `Link` soft vs `AdminV2NavLink` hard | Inconsistent feel |
| Deep-link bug Locations `section` vs `tab` | `ProgramDomainSections.tsx:188` | Wrong tab on arrival |

Subjective “feels slow” is **explained** by hard-nav + force-dynamic stack + Locations N+1; live ms remain to be recorded at Checkpoint A.

---

## 7. Reusable runtime contract

### 7.1 Runtime invariants (must hold for Organization)

Derived from Operational Runtime Laws, adapted to Configuration (not queues):

1. **Immediate navigation acknowledgment** — click feedback &lt; interaction budget; never silent wait.
2. **Stable Organization chrome** — AdminV2 shell + Configuration context geometry do not reshape after first commit.
3. **Continuous Configuration navigation** — `/organization` ↔ domain workspaces do not full-reload when soft-safe.
4. **One reveal of final structure** — reserve landing/domain geometry; fill values; no skeleton→structure morph.
5. **Retained selection** — selected Location/Program survives concern switches and warm return.
6. **Predictive warm** — hover/intent prefetches likely next domain/collection/detail.
7. **Mutation without shell rebuild** — saves patch local state; no `router.refresh()` as primary save UX.
8. **Permission-aware nav** — same auth gates; no orphan routes.
9. **Browser history correctness** — back/forward restores selection params (`locationId`/`tab`/`programId`/`section`).
10. **Honest empty vs loading** — never present cold load as “no Programs/Locations”.

### 7.2 Reusable primitives (exist today)

| Primitive | Source |
|-----------|--------|
| ConfigurationShell / Context / Empty | `ConfigurationModeLayout` |
| ConfigDetailRuntime, ObjectHeader, Overview, CollectionRail | `configurationRuntime/workspace/*` |
| Domain cards / registry | `ConfigDomainCard`, `organizationRuntime.ts` |
| Command rail actions | `ConfigurationCommandRailActions` |
| Soft-nav machinery (extend eligibility) | `shellNavigation.ts`, `AdminV2NavLink` |
| Session/cache keying patterns | workspace session caches (adapt, don’t fork blindly) |
| Perf marks | `perceivedPerf.ts` |

### 7.3 Work-specific (do not import as Organization UI)

Provisioning-answer Work Unit payload, QueueRegion opportunity rows, Work View pills, opportunity Focus Panel, Operational Mode default subject.

### 7.4 Organization-specific additions

- Publisher/consumer landing (`OrganizationConfigurationPage`).
- Publishable-domain lifecycle tabs (Publication / Assignments / History).
- Configuration Assignment / Distribution / History runtimes (already shared; keep).
- Domain registry health honesty (“Not assessed” until evidence).
- Eventual `/organization/<domain>` route convergence.

### 7.5 Extraction decision

| Option | Verdict |
|--------|---------|
| Direct reuse of Work Unit kernel under `/organization` | **Reject for Checkpoint A** — entry resources Work-bound; high blast radius |
| Shared primitives + law inheritance | **Accept** — extend soft-nav, retention, prefetch, progressive paint on Configuration Runtime |
| Generalized “workspace runtime package” | **Defer** — extract only after Org + Locations continuity proven (avoid premature package) |
| `SettingsSurfaceViewModel` / Route VM | **Checkpoint A–B target** — doctrine already names this (`operational-runtime-doctrine.md:75`) |

---

## 8. Product composition gaps

1. Missing Programs **collection landing** (Locations Mode A).
2. `/settings/commercial` remains full chaptered home while Programs is canonical.
3. Config-mode nav Programs → Commercial (IA drift).
4. Offerings/Pricing still Commercial form/grid density inside Program object.
5. Locations URL not under `/organization/locations` (planned).
6. `section` vs `tab` deep-link bug.
7. Hard-nav isolation from Workspace soft continuity.
8. Dual Program identity still visible in Commercial boot (`location_program_categories` create-all-sites path) — do not reopen Org Program identity; retire parallel authoring UX.

---

## 9. Proposed target architecture

```text
AdminV2 Shell (persistent across soft config nav)
  └─ Configuration Continuity Layer (NEW)
        · soft-nav eligibility for /organization and /settings/*
        · retained providers / selection maps
        · prefetch registry per domain
        · progressive commit for landing + collection
        · SettingsSurfaceViewModel (server first-paint) over time
        │
        ├─ /organization          Organization Landing (V2.2 cards)
        ├─ /organization/locations  (alias → Locations workspace)
        ├─ /settings/locations      Locations Collection→Detail Runtime
        ├─ /organization/programs   Programs Collection→Detail + lifecycle
        └─ remaining /settings/*    inherit continuity; migrate IA gradually
```

Work Unit Kernel remains the **operational** runtime. Configuration Continuity inherits its **laws**, not its queue grain.

---

## 10. Checkpoint realization plan

### Checkpoint A — Organization Runtime Foundation

**Goal:** Organization click feels continuous; landing progressive; legacy `/settings` contained.

- Extend soft-nav eligibility for `/organization` and `/settings/*` (with reload-floor watchdog retained).
- Unify AdminV2NavLink vs Link remount behavior for config destinations.
- Stable settings shell across Org ↔ domain transitions.
- Organization-shaped loading reservation (optional) or eliminate blank via soft nav.
- Fix Programs nav href → `/organization/programs`.
- Record live browser baseline (protocol §6.1).

**Exit:** Rail → Organization soft path; no full reload; domain cards usable; baseline numbers attached to this audit.

### Checkpoint B — Locations Runtime Inheritance

- Collection cache / retention across concern switches.
- Selected Location restoration + history sync (`tab`/`itemId` effects).
- Prefetch on rail hover; collapse schedule N+1.
- Progressive detail hydration for Tours/Access/Placement.
- Optional rewrite `/organization/locations` → current page (routing-only).

### Checkpoint C — Nested Location Concerns

- Certify Overview / Programs / Rooms / Schedule / Tours / Placement / Access under shared nested runtime.
- Fix `section`→`tab` deep links from Programs.
- Mutation invalidation without full hierarchy reload (already partially optimistic).

### Checkpoint D — Programs Product Completion

- Add collection landing mode (no auto-select required).
- Read-first Offerings/Pricing composition; keep Definition as intentional edit.
- Preserve Publication / Assignments / History.
- Wire Tuition/Catalog/Policies as Program-owned concerns; link Accounting/Simulator/Funding deliberately.
- Runtime inheritance from A–C.

### Checkpoint E — Commercial Migration

- Retire `/settings/commercial` as Programs home (redirect or chapter split).
- Vocabulary cleanup; deep-link redirects; nav migration.
- No loss of Catalog/Policies/Accounting/Simulator/Funding capability.

### Checkpoint F — Organization Expansion Pattern

- Onboarding contract for remaining domains (Access, Communications, Data Model, Processes, Surfaces, Automation, Operational Intelligence).
- Certification criteria: laws §7.1 + Locations visual grammar + domain-correct nouns.
- Sequence by registry readiness, not by rewriting everything at once.

---

## 11. Files likely involved per checkpoint

### A — Foundation

- `web/lib/adminV2/shellNavigation.ts`
- `web/lib/adminV2/navigation/adminV2SoftNavLinkCommit.ts`
- `web/app/adminV2/components/Sidebar.tsx`
- `web/lib/adminV2/configurationModeNav.ts`
- `web/app/adminV2/settings/loading.tsx`
- `web/app/adminV2/settings/AdminV2SettingsClientProviders.tsx`
- `web/app/adminV2/settings/organization/page.tsx`
- `web/components/adminV2/settings/organization/OrganizationConfigurationPage.tsx`
- `web/next.config.ts` (only if soft-nav/URL needs)
- Tests: `web/tests/admin/adminV2NavigationContracts.test.ts`, `operationalNavigationContract.test.ts`, `canonicalSettingsRoutes.test.ts`

### B–C — Locations

- `LocationsConfigurationPage.tsx`, `useLocationsConfigurationSettings.ts`
- `locationWorkspaceModel.ts`, `LocationsLanding.tsx`, `LocationsObjectSelector.tsx`
- Concern panels under `components/adminV2/settings/locations/`
- `ProgramDomainSections.tsx` (deep-link fix)
- APIs: `app/api/admin/locations`, `schedule-patterns`, tours, members

### D–E — Programs / Commercial

- `ProgramsPublicationWorkspace.tsx`, `ProgramOverviewSurface.tsx`, `ProgramDomainSections.tsx`
- `programConfigurationSections.ts`, publication view models/services
- `CommercialConfigWorkspace.tsx`, `TuitionGridWorkspace.tsx`, `CommercialHubShell.tsx`
- `web/next.config.ts` redirects; `canonicalAdminRoutes.ts`
- Docs: `commercial-configuration.md`, Organization V2 (extend, don’t reopen freezes)

### F — Expansion

- `organizationRuntime.ts` registry
- Per-domain settings pages under `adminV2/settings/*`
- `docs/platform/foundation/configuration-platform-expansion-constitution.md`

---

## 12. Risks and migration concerns

| Risk | Mitigation |
|------|------------|
| Soft-nav into settings regresses recovery | Keep hard-nav kill switch + reload-floor watchdog |
| Kernel mounting under Org creates dual runtimes | Defer kernel; Continuity Layer first |
| Commercial retirement loses pricing paths | Embed/map chapters before redirect |
| Locations feature-freeze violated | Runtime-only + bugfix + planned route alias; no new Location product patterns |
| Reopening Program identity / assignment | Explicitly forbidden; D–E are composition/IA only |
| Capacity/runtime admission blocked | Measure after shared runtime attach; don’t invent stacks |
| Doctrine filename drift (`useWorkUnitSurfaceRuntime`) | Follow kernel + committed runtime in code |

---

## 13. Test and browser-evidence strategy

**Unit / contract**

- Soft-nav eligibility includes Organization/settings after A.
- Canonical hrefs: Programs nav → `/organization/programs`; Locations `tab` deep links.
- Programs collection landing mode (no forced selection).
- Existing Programs publication / assignment / distribution tests remain green (no contract churn).

**Focused Vitest**

- Navigation contracts (`adminV2NavigationContracts`, `operationalNavigationContract`).
- Organization routing tests (`organizationConfigurationRuntime`, `organizationProgramsRouting`).
- Locations configuration tests (`configurationRuntimeLocations`).

**Browser / Playwright**

- Extend patterns from `web/playwright/tests/configuration-publication-programs.spec.ts`.
- Add Org continuity scenario: Workspace → Organization → Locations → tab → Programs → back.
- Capture network: assert no full document navigation on soft path; assert schedule batching after B.

**Typecheck**

- `cd web && npm run typecheck` before any promotion; `typecheck:tests` when tests change.

---

## 14. Recommended first implementation checkpoint

**Checkpoint A — Organization Runtime Foundation.**

Rationale: every later Locations/Programs continuity win is capped by hard-nav remount into Organization. Soft-nav + shell retention + IA href fix + live baseline is the smallest change that makes `/organization` feel like the same Alloy OS as `/workspace`, without touching Program contracts or Locations freeze scope.

**Out of scope for A:** Operational Calculations, Configuration Runtime certification sprint, Commercial full retirement, Locations product redesign, Work Unit kernel port.

---

## Documentation inventory (constraints)

| Doc | Use |
|-----|-----|
| `docs/platform/runtime/operational-runtime-doctrine.md` | Laws to inherit |
| `docs/sprints/completed/work-unit-runtime-simplification-closeout.md` | What shipped; Settings deferred |
| `docs/system/adminv2-runtime-performance-doctrine.md` | Reveal/hold (note stale hook names) |
| `docs/system/configuration-runtime-v1.md` | Frozen config shell; Locations reference |
| `docs/system/organization-configuration-runtime-v2.md` | Landing + publisher model |
| `docs/platform/operator/configuration-workspace-platform-doctrine.md` | Collection→object grammar |
| `docs/platform/modules/configuration-platform.md` | Route convergence plan |
| `docs/audits/active/programs-runtime-composition-alignment-2026-07.md` | Programs chrome certified |
| `docs/sprints/completed/locations-config-runtime/*` | Locations evidence |
| `docs/sprints/completed/configuration-publication-runtime-v1-closeout.md` | Publication closeout |

---

## Sprint verification (bootstrap)

| Field | Value |
|-------|-------|
| Slot | 4 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt4-org-runtime-realization` |
| Branch | `agent/cursor/4-org-runtime-realization` |
| Base staging SHA | `1bfe7d1de1539b9a13f0903dd5d0e87ade71bbf0` |
| Ahead/Behind | 0 / 0 |
| Port | 3014 |
| Runtime posture | Server stopped; shared-read-only intent desired; live browser baseline deferred (admission/capacity/auth) |
| Working tree | Clean except this planning document |

**Commit policy:** documentation-only commit only after Kelly accepts this plan. No push / PR / merge.

---

*End of plan.*
