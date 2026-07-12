# Platform Certification — July 2026

**Status:** Final certification record (July 2026).  
**Certifies:** Alloy has transitioned from platform construction to platform operation.  
**Staging certified at:** `61aefff37a0569e31f3142502cd8d69188b6ef82` (includes stabilization floor `e94811914`).

Companion documents:

- [`platform-manifesto.md`](./platform-manifesto.md) — constitutional engineering doctrine (required reading)
- [`../milestones/platform-stabilization-july-2026.md`](../milestones/platform-stabilization-july-2026.md) — milestone summary for onboarding

---

## Certification scope

This certifies completion of:

| Initiative | Certified |
|------------|-----------|
| Presentation Runtime | ✓ |
| Surface Host | ✓ |
| Focus Panel Runtime | ✓ |
| VM Runtime | ✓ |
| Queue Runtime | ✓ |
| Motion Runtime | ✓ |
| Navigation Runtime | ✓ |
| Business Process Runtime | ✓ |
| Processing Runtime | ✓ |
| Communications Runtime | ✓ |
| Configuration Runtime | ✓ |
| Current Work Runtime | ✓ |
| Platform Simplification (legacy drawer elimination) | ✓ |
| TypeScript runtime improvements | ✓ |
| Workspace orchestration | ✓ |
| Perceived performance foundation | ✓ |

---

## Why this milestone mattered

Alloy spent 2025–H1 2026 proving that a configurable operations platform could run enrollment, communications, processing, and AI-assisted workflows from one workspace. By mid-2026 the proof was complete but the **construction scaffolding remained**: parallel drawer runtimes, route-owned surface swaps, VM kill-switch rollback paths, TypeScript OOM failures, and doctrine that still described migrations as active.

July 2026 stabilization **removed the scaffolding** and **froze the architecture** so engineering could shift from "which runtime owns this?" to "how do we make operators faster?"

---

## What changed

### Architecture

- One Presentation Runtime tree (Workspace → Work Unit → Queue → Focus Panel → Right Rail)
- Surface Host owns focus exchange between operational surfaces
- VM hard cutover for Opportunity, Person, Child — permanent, no kill-switch rollback
- Settings Configuration Runtime owns locations (inline create, search deep links)
- Processing and Communications certified on Operational Workspace Doctrine V3 shells
- Current Work owns stage completion inside Focus Panel

### Navigation & interaction

- Canonical deep links: `?work_view=`, `?locationId=`
- Global Search routes campuses to `/settings/locations?locationId=<id>`
- Queue row → Focus Panel via client URL swap — no route remount
- Unsupported entities fail closed — no legacy drawer fallback

### Developer infrastructure

- TypeScript OOM eliminated (8 GB heap, split production/full graphs, CI both jobs)
- Workspace orchestration for multi-agent dev entry
- Runtime ownership migration map — production owners documented
- Module import verification before deploy

### Perceived performance

- Branded boot shell on first load
- Queue Hold — no false empty during cold load/refetch
- Surface Hold — outgoing surface yields before unmount
- Progressive reveal — coordinated above-fold commit

---

## What was removed

| Removed | PR | Merge SHA | Approx. impact |
|---------|-----|-----------|----------------|
| `AdminEntityDrawerLegacy.tsx` | #148 | `e94811914` | ~20,135 lines deleted |
| VM kill-switch rollback gates | #148 | `e94811914` | Permanent hard cutover |
| Dept compat work-unit page | PRV2 #71 | `12761a7f0` | Single WU route |
| `QueueBlock` / `useWorkUnitQueueRuntime` | PRV2 #71 | `12761a7f0` | Queue in Presentation Runtime |
| Shadow PRV2 presentation adapters | PRV2 #71 | `12761a7f0` | One presentation tree |
| `/legacy-admin` product landing | #148 | `e94811914` | Redirect → `/workspace` |

---

## Runtime ownership (final)

| Domain / concern | Canonical owner | Notes |
|------------------|-----------------|-------|
| Presentation (WS, WU, RR) | Presentation Runtime | `PresentationRuntime` → surface components |
| Navigation / surface swap | Surface Host + Navigation Runtime | Client-held surfaces; URL as projection |
| Motion / transitions | Motion Runtime | Tokens + reveal contracts; used by Presentation/Surface Host |
| Queue lanes / hold | Queue Runtime | `QueueRegion` + `useWorkUnitSurfaceRuntime`; subordinate to Presentation |
| Record focus (Opportunity) | VM Runtime → Focus Panel | `OpportunityDrawerVmRuntime` |
| Record focus (Person) | VM Runtime → Focus Panel | `PersonsDrawerVmRuntime` |
| Record focus (Child) | VM Runtime → Focus Panel | `PersonsDrawerVmRuntime` |
| Locations / campuses | Configuration Runtime | `/settings/locations`; no drawer |
| Documents / forms intake | Processing Runtime | Digital Mailroom workspace |
| Communications | Communications Runtime | Command Center + Activity embed |
| Stage work completion | Current Work Runtime | Focus Panel card; PR #95 |
| Business process landing | Business Process Runtime | `/workspace` tiles → work-unit slugs |
| Drawer reveal infrastructure | `AdminEntityDrawer` (thin router) | VM only; `return null` otherwise — not a product runtime |
| Settings / surfaces / fields | Configuration Runtime | `/settings/*` |

**No duplicate owners** for entity detail, queue lanes, or surface presentation. Intentional layering (VM compose behind Focus Panel; Queue within Presentation) is not duplication.

### Remaining overlap (documented, not duplicate ownership)

| Layer A | Layer B | Relationship |
|---------|---------|--------------|
| VM Runtime | Focus Panel Runtime | VM owns compose/cache/reveal; Focus Panel owns operator surface — sequential, not competing |
| Queue Runtime | Presentation Runtime | Queue Region is a Presentation Runtime component — subordinate ownership |
| Navigation Runtime | Surface Host | Navigation is the URL/focus contract implemented by Surface Host |
| Motion Runtime | Presentation / Surface Host | Shared tokens consumed by surfaces — infrastructure, not a product layer |
| Drawer router | Focus Panel | Router is reveal/open-state infrastructure only — deleted legacy body |

---

## Required PR certification

| PR | Purpose | Merge SHA | Status |
|----|---------|-----------|--------|
| #142 | TypeScript OOM elimination + canonical typecheck | `ca965606c` | **MERGED** |
| #143 | Workspace orchestration | `00cee4183` | **MERGED** |
| #144 | Inline location create (Settings) | `4c5821cce` | **MERGED** |
| #145 | Search → canonical location surface | `305e95c4b` | **MERGED** |
| #148 | Legacy drawer deletion | `e94811914` | **MERGED** |
| #150 | Legacy drawer doctrine closeout | — | **OPEN — superseded by #153** |
| #151 | `vmDrawerRuntime.test.ts` canonical contract | — | **OPEN — merge before closeout** |
| #153 | Runtime stabilization milestone docs | — | **OPEN — this certification** |

**Merge order:** #151 → #153. Close #150 without merge (superseded by #153 file overlap + expanded scope).

---

## Platform statistics

| Metric | Value |
|--------|-------|
| Major runtimes completed | 12 (see certification scope table) |
| Major legacy systems removed | 1 monolithic drawer runtime + compat WU page + kill-switch rollback |
| Legacy drawer deletion | ~20,135 lines deleted, ~297 added (PR #148) |
| TypeScript | OOM eliminated; ~90% local typecheck improvement post-drawer deletion (machine-dependent) |
| Infrastructure PRs merged | #90, #91, #95, #123, #132, #142, #143, #144, #145, #148, #147 |
| Doctrine initiatives completed | Drawer elimination, PRV2, Surface Host, perceived performance, workspace orchestration |
| Staging head | `61aefff37` |

---

## Remaining technical debt (genuine only)

### Critical

| Item | Evidence |
|------|----------|
| `vmDrawerRuntime.test.ts` stale assertion | Fails on staging (1/19); fix in PR #151 |

### Important

| Item | Evidence |
|------|----------|
| `app/legacy-admin/**` client modules | Archived routes; still imported by canonical settings — import-path debt |
| `LocationsHierarchySettingsClient.tsx` | Unmounted; contains `openDrawer({ type: "locations", id: "new" })` dead code |
| Backend query/payload optimization | Dominant perceived latency; listed in roadmap In Progress |
| Action catalog completion | ~84%; waitlist mutator activation open |

### Eventually

| Item | Evidence |
|------|----------|
| `WorkspaceMetricTiles` migration | Deprecated for operational health; adapters still reference |
| `contacts` / `messages` compatibility tables | Documented retirement paths; persons canonical |
| `logDrawerViewModelCutover.ts` shadow telemetry | References kill-switch env var **names** for logging only — gates return `true` |
| Focus Panel card editing substrate | Next experience investment; read-only for most operational data today |

Everything else in the stabilization scope is **complete**.

---

## New engineering philosophy

Read [`platform-manifesto.md`](./platform-manifesto.md). Summary:

1. The platform is stable — extend, do not fork.
2. Delete before duplicating.
3. Operator experience is the priority.
4. Product defines architecture.
5. Compatibility paths are not product.
6. New abstractions must justify themselves.

---

## Next era focus

Scheduling · Attendance · Billing · Payments · Commercial · AI assist · Automation · Operational Intelligence · Partner APIs · Reporting

All atop existing runtimes. No new foundational runtime layer.

---

## Final statement — what platform exists today?

**Alloy is a stable, multi-tenant business operations platform** with twelve finalized operator runtimes. Operators work from `/workspace` through business-process queues into VM-backed Focus Panel record surfaces, or into certified module workspaces (Processing, Communications) and Settings configuration surfaces. Entity detail has **one** supported path: VM Runtime → Focus Panel. Locations live in Settings. Unsupported entities fail closed. Events, workflows, actions, and configuration steer behavior; code owns invariants. TypeScript and workspace tooling support reliable development at scale.

**Platform Stabilization is complete** when PR #151 and PR #153 merge. No further stabilization work remains open.
