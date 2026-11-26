---
owner: engineering
status: checkpoint-a-implementation
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
base_sha: 1bfe7d1de1539b9a13f0903dd5d0e87ade71bbf0
---

# Organization Runtime Checkpoint A — Foundation

**Status:** Implemented locally (Checkpoint A).  
**Plan:** `organization-runtime-product-realization-plan-2026-07.md` (accepted).

## 1. Runtime architecture changes

### What was extracted (shared infrastructure)

| Behavior | Owner module | Notes |
|----------|--------------|-------|
| Soft-nav eligibility for `/organization` + `/settings/*` | `configurationContinuity.ts` + `shellNavigation.ts` | Does **not** use Work Unit kernel |
| Immediate navigation acknowledgment | Soft-nav `commitFirst` for config hrefs | Intent marks via `markConfigurationContinuity` |
| Shell persistence | Soft `router.push` keeps `AdminV2Shell` mounted | Settings layout remounts once when entering config from workspace |
| Reload-floor recovery | `adminV2SoftNavReloadFloor.ts` | Canonicalizes settings rewrite paths |
| Selected-object retention | `configurationSelectionRetention.ts` | sessionStorage; URL remains authoritative |
| Prefetch strategy | `prepareConfigurationSoftNavTarget` + Continuity Provider warm | Organization, Locations, Programs shells |
| Mutation invalidation bus | `configurationInvalidation.ts` | Scope-aware; ready for Checkpoint B cache owners |
| Loading vocabulary | `organization` / `configuration` variants | Distinct from work_unit / queue |

### What was deliberately **not** moved

- Runtime Kernel Attention / Focus / Provisioning
- QueueRegion, Work Views, Focus Panel
- Work Unit provisioning-answer entry resources
- Programs product redesign, Commercial migration

### Configuration Continuity layer

```text
AdminV2Shell (persistent across soft nav)
  └─ settings/layout → AdminV2SettingsClientProviders
        └─ ConfigurationContinuityProvider  ← NEW (Checkpoint A)
              · selection retention
              · warm prefetch
              · invalidation subscription
              · organization-configuration-shell marker
              └─ domain pages (Locations, Programs, …)
```

## 2. Runtime ownership diagram

```text
┌─────────────────────────────────────────────────────────────┐
│ Shared shell soft-nav (AdminV2NavLink)                       │
│  eligible: /workspace*  OR  /organization|/settings/*         │
│  kill switch: NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV=0         │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│ Work Unit Runtime         │   │ Configuration Continuity        │
│ (operational)             │   │ (Organization Runtime A)        │
│ Kernel K1–K3              │   │ No kernel                       │
│ Surface Host              │   │ Selection retention             │
│ Provisioning answer       │   │ Prefetch + invalidation bus     │
│ Queue / Focus Panel       │   │ ConfigurationShell composition  │
└───────────────────────────┘   └─────────────────────────────────┘
```

**One continuity mechanism (soft-nav + shell), two product runtimes.** No parallel soft-nav stack.

## 3. Before / after navigation behavior

| Transition | Before (discovery) | After (Checkpoint A) |
|------------|--------------------|----------------------|
| Workspace → Organization (rail) | `window.location.assign` full reload | Soft `router.push` + commit-first ack; AdminV2 shell retained |
| Organization → Locations (config-mode nav) | Hard reload via AdminV2NavLink | Soft nav; Continuity Provider retained |
| Organization → Locations (domain card Link) | Soft (already) | Unchanged; Continuity marks shell_retained |
| Locations ↔ Programs (nav) | Mixed (Programs was Commercial href) | Soft; Programs href = `/organization/programs` |
| Workflows / Forms | Hard | Hard (unchanged) |
| Soft-nav stall | Reload floor (workspace only) | Reload floor also for settings/org rewrite paths |

## 4. Browser measurements

### Structural / automated (this sprint)

| Check | Result | Evidence |
|-------|--------|----------|
| Soft-nav eligibility Organization | Pass | `configurationContinuity.test.ts` |
| Soft-nav eligibility Locations/Programs | Pass | same |
| Soft-nav kill switch | Pass | same + `softNavReloadFloor.test.ts` |
| Programs nav IA | Pass | href `/organization/programs` |
| Reload floor rewrite equivalence | Pass | `/adminV2/settings/organization` ≡ `/organization` |
| Selection retention round-trip | Pass | sessionStorage snapshot test |
| Invalidation bus | Pass | subscriber receives event |

### Live authenticated timings

**Deferred to measurement protocol** (runtime capacity over budget at discovery; auth session missing). Protocol:

1. Admit shared-readonly runtime when capacity allows.
2. `alloy-agent-login 4` + `alloy-dev-start wt4-org-runtime-realization` (port 3014).
3. Capture Performance + Network for Workspace → Organization → Locations → Programs.
4. Assert **no full document navigation** on soft path (`PerformanceNavigationTiming.type !== "reload"` for in-shell hops).
5. Record ack→reveal ms under `[perf:config-continuity]`.

Until live capture, code-evident claim: Organization rail no longer calls `adminV2CommitNavigation` when soft-nav enabled and href is `/organization`.

## 5. Runtime certification checklist

- [x] Soft-nav eligible for `/organization` and `/settings/*`
- [x] Workflows remain hard-nav
- [x] Kill switch forces hard everywhere
- [x] Organization shell marker (`data-organization-shell`)
- [x] Continuity Provider mounted under settings providers
- [x] Selection retention API + Locations wiring
- [x] Prefetch warm for Org / Locations / Programs
- [x] Invalidation bus available
- [x] Programs config-mode href corrected
- [x] Reload floor understands settings rewrites
- [x] Focused unit tests updated/added
- [ ] Live browser filmstrip timings (protocol above — capacity/auth gated)
- [x] Checkpoint B: Locations collection cache ownership + schedule batching — see `organization-runtime-checkpoint-b-2026-07.md`

## 6. Local implementation summary

**Files added**

- `web/lib/configRuntime/configurationContinuity.ts`
- `web/lib/configRuntime/configurationSelectionRetention.ts`
- `web/lib/configRuntime/configurationInvalidation.ts`
- `web/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider.tsx`
- `web/tests/configRuntime/configurationContinuity.test.ts`
- `docs/audits/active/organization-runtime-checkpoint-a-2026-07.md` (this file)

**Files changed**

- `web/lib/adminV2/shellNavigation.ts`
- `web/lib/adminV2/navigation/adminV2SoftNavLinkCommit.ts`
- `web/lib/adminV2/navigation/adminV2SoftNavReloadFloor.ts`
- `web/lib/adminV2/navigation/adminV2RouteLoadingVocabulary.ts`
- `web/lib/adminV2/configurationModeNav.ts`
- `web/app/adminV2/settings/AdminV2SettingsClientProviders.tsx`
- `web/app/adminV2/components/navigation/AdminV2NavLink.tsx`
- `web/components/adminV2/settings/locations/LocationsConfigurationPage.tsx` (retention hooks only)
- Navigation contract tests

**Not changed:** Programs publication UI, Commercial workspace, Assignment/Publication/Distribution contracts.

## 7. Remaining work for Checkpoint B

1. Locations collection cache ownership under Continuity (collapse schedule N+1).
2. History sync for `tab` / `itemId` (back/forward re-sync).
3. Prefetch owned-concern setup on Location hover.
4. Live browser baseline numbers attached to this audit.
5. Optional `/organization/locations` rewrite alias (routing-only).
6. Wire Locations mutations to `publishConfigurationInvalidation("locations", …)`.

## Suggested commit messages

1. `feat(organization): Configuration Continuity soft-nav foundation (Checkpoint A)`
2. `test(organization): certify Configuration Continuity soft-nav and retention`
3. `docs(organization): Checkpoint A runtime foundation record`
