---
owner: platform
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Platform Stabilization — July 2026

**Status:** Canonical milestone record (July 2026).  
**Audience:** New engineers, product, and agents onboarding to Alloy.  
**Scope:** Describes **what platform exists today** — not the journey to get here.

---

## Why this milestone mattered

Through June–July 2026, Alloy completed a coordinated stabilization effort across operator runtime, presentation, configuration surfaces, and developer infrastructure. The goal was not new product scope — it was to **finish foundational runtimes**, **delete duplicate legacy paths**, and **establish a stable operating model** so future work improves experience, performance, automation, and intelligence rather than re-litigating architecture.

Before this milestone, Alloy carried parallel drawer runtimes, route-owned surface swaps, transitional VM cutover flags, and TypeScript tooling that OOM'd on the monolithic graph. After it, operators work one platform with canonical surfaces; engineers typecheck and develop against a known contract.

---

## What platform exists today

Alloy's operator plane is built on **nine foundational runtimes**:

| Runtime | Role |
|---------|------|
| **Presentation Runtime** | One presentation tree: Workspace, Work Unit, Queue Region, Focus Panel host, Right Rail |
| **Surface Host** | Client-held operational surfaces that exchange focus without route teardown |
| **Focus Panel Runtime** | Canonical record execution surface (VM-backed cards, Current Work, embedded workspaces) |
| **VM Runtime** | Entity view-model compose, cache, reveal for Opportunity, Person, Child |
| **Business Process Runtime** | Landing → stage queues → record focus on work-unit routes |
| **Processing Runtime** | Digital Mailroom operational workspace (reference module shell) |
| **Communications Runtime** | Command Center + Activity embed + identity platform |
| **Configuration Runtime** | Settings `/settings/*` control plane (fields, surfaces, locations, processes) |
| **Current Work Runtime** | Config-driven stage work completion inside Focus Panel |

**There is no legacy entity drawer runtime.** `AdminEntityDrawerLegacy` was deleted. Unsupported historical entities **fail closed** (`AdminEntityDrawer` returns `null`). Rollback is **deployment/Git-based**, not permanent dual-runtime code.

Canonical operator experiences:

- **VM Runtime + Focus Panel** — Opportunity, Person, Child on work-unit routes
- **Settings** — Locations (`/settings/locations`), surfaces, fields, business processes
- **Processing** — Digital Mailroom workspace
- **Communications** — Command Center workspace + Focus Panel Activity embed
- **Explicit operating surfaces** — Work Items, Billing, Scheduling (as modules ship)

---

## Major architectural decisions

1. **Focus Panel is the operator surface.** Drawer infrastructure is reveal/open-state only — not a competing product layer.
2. **One Presentation Runtime tree.** Workspace and Work Unit are collapsed/expanded states of one process — not separate page products.
3. **Surface Host owns focus exchange.** Outgoing surfaces yield; incoming surfaces establish before outgoing unmounts (NAV-1 decision A).
4. **Queues are previews.** Authoritative record truth comes from entity GET / VM compose — never queue JSON alone.
5. **Canonical deep links replace drawer opens.** Campus search → `/settings/locations?locationId=<id>`; location create inline in Settings — no legacy location drawer.
6. **Kill-switch VM cutover retired.** Hard cutover gates return permanent `true`; env rollback switches removed.
7. **TypeScript operating model canonicalized.** Production graph (`tsconfig.build.json`) + full graph (`tsconfig.json`) with 8 GB heap; CI runs both.
8. **Workspace orchestration.** `npm run dev` and related scripts coordinate web + dependencies from repo root patterns (PR #143).

---

## Runtime ownership (current)

| Concern | Owner |
|---------|--------|
| Work-unit page / queue | `WorkUnitSurface` + `QueueRegion` + `useWorkUnitSurfaceRuntime` |
| Record focus | `FocusPanelSurface` + entity VM runtimes |
| Drawer router | `AdminEntityDrawer.tsx` — VM entities only; `return null` otherwise |
| Surface swap | `SurfaceHost` + `PresentationRuntime` |
| Settings locations | `LocationsConfigurationPage` + inline `LocationSiteCreatePanel` |
| Global search navigation | `globalRecordSearchLocationNavigation` → canonical settings routes |
| Reveal / hold | `adminv2-runtime-performance-doctrine.md` — Queue Hold, Surface Hold, coordinated reveal |

Detail: [`../governance/runtime-ownership-migration-map.md`](../governance/runtime-ownership-migration-map.md)

---

## What was deleted

| Removed | Impact |
|---------|--------|
| `AdminEntityDrawerLegacy.tsx` (~19,713 LOC) | Eliminated duplicate entity drawer runtime; major typecheck graph reduction |
| Dept UUID work-unit compat page | Single canonical `/workspace/work-unit/:slug` path |
| `QueueBlock` / `useWorkUnitQueueRuntime` | Queue ownership consolidated in Presentation Runtime |
| VM kill-switch env vars | No runtime rollback to legacy drawer |
| `/legacy-admin` as product landing | Redirects to `/workspace`; shared client modules remain as import debt only |
| Shadow presentation adapters | PRV2 retirement removed parallel render paths |

---

## Performance improvements

| Area | Outcome |
|------|---------|
| TypeScript OOM | Eliminated via `node --max-old-space-size=8192` + split production/full graphs |
| Canonical typecheck | `npm run typecheck` (build graph) required pre-merge; `typecheck:tests` for test graph |
| CI | `.github/workflows/web-typecheck.yml` — Production graph + Full graph jobs |
| Legacy drawer deletion | Removed ~1.3 MB monolith from production typecheck graph |
| Perceived performance | Branded boot shell; Queue Hold; Surface Hold; no blank loading surfaces between holds |

Doctrine: [`../governance/typescript-performance.md`](../governance/typescript-performance.md)

---

## Developer experience improvements

- **Workspace orchestration** (PR #143) — consistent dev entry from repo
- **Module import verification** — `npm run verify:module-imports` catches missing `@/lib/**` before deploy
- **Runtime ownership map** — contributors target production owners, not deleted compat paths
- **Protected infrastructure tests** — drawer/queue reveal determinism suite locked in `adminv2-runtime-performance-doctrine.md`
- **Documentation rebaseline** — `docs/platform/**` as canonical; sprints/audits as historical

---

## Operator experience improvements

- **Branded boot shell** — first-load continuity (Perceived Performance sprint, PR #91)
- **Work View continuity** — deep links `?work_view=` preserve queue context
- **Canonical location experience** — Settings Configuration Mode; search routes to settings, not drawer
- **Current Work** — config-driven Focus Panel work owner (PR #95)
- **Processing + Communications** — certified Operational Workspace Doctrine V3 shells
- **Progressive reveal** — coordinated above-fold commit; no partial skeleton sections

Authenticated staging verification checklist: `../../sprints/archive/07_2026/platform-simplification-staging-qa-checklist.md` (historical: `../../sprints/archive/07_2026/platform-simplification-staging-qa-checklist.md`)

---

## Key merge references

| Initiative | PR / commit | SHA (staging ancestry) |
|------------|-------------|------------------------|
| Presentation Runtime V2 retirement | #71 | `12761a7f0` |
| Presentation surfaces thread closeout | — | `c99e381f3` |
| Surface Host | — | `3764e039a` / `e66c3de51` |
| Perceived performance / boot shell | #91 | `1fea282de` |
| Current Work | #95 | `06202d599` |
| Processing public runtime | #123 | `0e7845a3e` |
| Communications identity platform | #132 | `6e1f8e44d` |
| Communications workspace UX | #147 | `05441969a` |
| TypeScript canonical typecheck | #90 | `a5b8f66d8` |
| Workspace orchestration | #143 | `00cee4183` |
| Platform simplification P1 (inline location) | #144 | `4c5821cce` |
| Platform simplification P2 (search → settings) | #145 | `305e95c4b` |
| Legacy drawer elimination | #148 | `e94811914` |

**Staging head at certification:** `61aefff37a0569e31f3142502cd8d69188b6ef82`

---

## Platform maturity

The architecture is **stable**. Future work primarily improves:

- **Experience** — card editing substrate, Experience Builder adoption, module UX polish
- **Performance** — backend query/payload optimization, warm-cache expansion
- **Automation** — workflow coverage, action catalog completion
- **Operator intelligence** — BOS assist depth, operational intelligence surfaces
- **Domain productization** — Scheduling, Attendance, Billing, Payments, Commercial (surfaces atop existing truth-flow backend)

Future work should **not** introduce additional foundational runtimes or restore legacy drawer paths.

---

## Remaining platform priorities (not this milestone)

These are **product expansion** lanes — not runtime stabilization:

| Priority | Notes |
|----------|-------|
| Scheduling / Attendance surfaces | Backend truth-flow built; operator productization remains |
| Billing / Payments maturity | Stripe + consumption runtime; GA surfaces TBD |
| Commercial platform | Catalog primitive shipped; posting/ledger productization |
| AI / operational intelligence | BOS assist maintained; autonomous agents paused |
| Partner APIs | Internal API platform foundation complete; external expansion |
| Action catalog completion | ~84% aligned; waitlist mutator activation |
| Legacy-admin client module relocation | Import-path debt; routes archived |

---

## Related canonical docs

| Topic | Doc |
|-------|-----|
| Architecture | [`../foundation/architecture.md`](../foundation/architecture.md) |
| System overview | [`../foundation/system-overview.md`](../foundation/system-overview.md) |
| Platform capabilities | [`../foundation/platform-capabilities.md`](../foundation/platform-capabilities.md) |
| Drawer infrastructure | [`../operator/drawer-system.md`](../operator/drawer-system.md) |
| Navigation | [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) |
| Operational UX | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| Release history | [`../foundation/release-history.md`](../foundation/release-history.md) |
| Platform manifesto | [`../foundation/platform-manifesto.md`](../foundation/platform-manifesto.md) |
| Platform certification | [`./certification-july-2026.md`](./certification-july-2026.md) |
| TypeScript operating model | [`../governance/typescript-performance.md`](../governance/typescript-performance.md) |
