---
owner: product-platform
status: complete
last_reviewed: 2026-07-17
concept: configuration-runtime-completion
supersedes: []
---

# Configuration Runtime Completion

**Completion date:** 2026-07-17  
**Validation surface:** Programs, Configuration Publication Runtime Consumer #1  
**Scope:** reusable publishable Configuration Runtime; no Operational Calculations or additional domain expansion  
**Final certification:** **CONFIGURATION RUNTIME COMPLETE**

## Executive result

Programs now proves the complete product runtime that future publishable
Configuration domains inherit:

```text
Collection
  → read-first Overview
  → active revision + explicit working draft
  → Configuration Attention + explained readiness
  → intentional editing and publication
  → durable Location assignment posture
  → impact preview
  → cross-revision distribution and retry
  → complete Configuration history
```

The runtime is platform-owned. Programs supplies Program payload fields,
validation/publish actions, ownership language, and impact details. It does not
own Collection, Detail navigation, revision posture, Attention, Assignment,
Distribution, History, command-rail grouping, or Configuration BOS starters.

No schema migration, Location mutation redesign, route migration, reveal-gate
change, Apply behavior, or Operational Calculations work was introduced.

## Frozen Product findings resolved

| Product finding | Runtime realization | Classification |
|---|---|---|
| No read-first Overview | `ConfigPublicationOverview` is the default selected-object section | Platform Runtime |
| Edit mode dominates | `ConfigDetailRuntime` opens Overview; Working Draft is intentional and route-addressable | Platform Runtime |
| Active revision vs draft unclear | Generic publication posture distinguishes active revision, working draft, unpublished changes, and clean published state | Platform Runtime |
| Assignment posture transient | `ConfigAssignmentRuntime` reads durable consumption pointers with Location, consumed revision, drift, and health | Platform Runtime |
| Failures absent from Attention | Runtime model projects failed targets, revision drift, unpublished changes, and missing setup into Attention | Platform Runtime |
| History incomplete | Generic evidence loader and timeline span publications, runs, attempts, assignments, retries, and failures across revisions | Platform Runtime |
| Collection grammar incomplete | Shared rail owns search, lifecycle filters, Add, publication, assignment, readiness, health, and responsive selection | Platform Runtime |
| Generic CRUD / queue shell DNA | Shared Configuration command rail plus Configuration-native BOS starters replace queue/follow-up language | Platform Runtime |
| Responsive uncertified | Authenticated 1440×1000, 1024×768, and 768×900 evidence captured | Certification |

## Runtime reuse matrix

| Capability | Platform owner | Programs adapter contribution | Future domain requirement |
|---|---|---|---|
| Collection | `ConfigCollectionRail` | Object label/icon and derived item evidence | Supply object nouns and view model |
| Detail navigation | `ConfigDetailRuntime` | Program payload sections | Supply summary/editor slots |
| Overview | `ConfigPublicationOverview` | Program definition summary | Supply domain read model |
| Revision posture | `deriveConfigurationRuntimeModel` | Draft checksum against active Program publication | Supply draft-change evidence |
| Attention | generic runtime model + `ConfigAttentionPanel` | Program setup areas | Supply authoritative setup areas |
| Assignment | `ConfigAssignmentRuntime` | Program target selection and impact copy | Supply target labels and assignment action |
| Distribution | `ConfigDistributionRuntime` | Programs retry API action | Register durable adapter/retry |
| History | `ConfigHistoryTimeline` + generic evidence loader | Program-friendly event wording | Map domain revision identity |
| Command rail | `ConfigurationCommandRailActions` | Program action destinations | Supply contextual actions |
| BOS context | Configuration route resolver | None | Inherited from `/organization/*` or `/settings/*` |
| Responsive behavior | shared Collection/Detail geometry | None | Inherited |

A second publishable domain does **not** need new shell, Collection, Detail,
Attention, Assignment, Distribution, History, or BOS components. Its adapter
must expose:

1. stable object identity and domain payload summary;
2. draft status and authoritative unpublished-change evidence;
3. immutable publication identity;
4. setup/readiness evidence;
5. target labels and durable consumption pointers;
6. domain impact language and mutations;
7. revision labels for history.

## Platform additions

- `web/lib/configPublication/runtimeModel.ts`
  - generic revision, assignment, readiness, Attention, and history contracts;
  - no Programs vocabulary.
- `web/lib/configPublication/evidenceService.ts`
  - generic cross-revision publications, runs, targets, attempts, and current
    consumption loader.
- `web/components/adminV2/settings/configurationRuntime/workspace/`
  - Collection, Detail, Overview, Assignment, Distribution, and History
    runtimes.
- `ConfigurationCommandRailActions.tsx`
  - shared Fix now → Do next → Manage → More actions ownership;
  - consumed by Locations and Programs.
- Configuration route-aware BOS starters:
  - Explain this configuration;
  - Review configuration attention;
  - Review unpublished changes.

## Programs adapter changes

- Program snapshot now projects:
  - all publications, not latest only;
  - current durable assignments from `configuration_consumptions`;
  - append-only attempts;
  - all distribution runs in the retained evidence window.
- `programPublicationViewModel.ts` maps Program evidence into generic runtime
  contracts and plain-language history.
- Program-specific UI is limited to:
  - definition summary and draft fields;
  - Program validation/publish mutation;
  - Location selection;
  - Program impact wording;
  - retry API invocation.
- Default page posture is Overview. Publish returns to Overview. Assignment
  confirmation returns to Overview with durable assignment evidence.

## Browser certification

**Route:** `/organization` → `/organization/programs`  
**QA identity:** managed slot 2 architecture identity  
**Method:** authenticated Chromium journey; Programs API intercepted to produce
deterministic draft, publication, partial-failure, retry, and consumption
states. The settled Organization landing used live authenticated runtime data.

Evidence lives in:

`docs/audits/evidence/configuration-runtime-completion/`

| Evidence | Proves |
|---|---|
| `00-organization-landing.png` | Settled Organization catalog and Programs boundary |
| `01-programs-landing.png` | Complete Collection Runtime, Add, search/filter, Configuration BOS |
| `02-program-detail-draft.png` | Intentional edit concern and active-revision separation |
| `03-published-revision.png` | Read-first Overview, clean published state, readiness and Attention |
| `04-location-assignment-selection.png` | Durable current-assignment region separate from pending selection |
| `05-impact-preview.png` | Assignment impact and protected Location ownership |
| `06-partial-failure.png` | Distribution failure posture, target reason, safe retry |
| `07-retry-success.png` | Successful deterministic retry without duplicate successful target |
| `08-history-audit.png` | Publication, assignment, and retry timeline |
| `09-responsive-laptop.png` | 1024×768 responsive collapse and Configuration-native shell |
| `10-responsive-narrow.png` | 768×900 object selector, tabs, Overview, and no page overflow |

Observed:

- Organization and Programs retained canonical `/organization/*` ownership.
- No Apply or Commercial product language appeared.
- Programs API requests had no failures.
- No unexpected Configuration/Programs console errors appeared.
- The Admin shell emitted its existing color-serialization hydration warning;
  it is outside the Configuration Runtime and did not affect the journey.
- One transient Supabase auth refresh fetch error is treated as ambient shell
  infrastructure; authenticated page and API behavior remained valid.

## Validation

- Production TypeScript graph: passed.
- Test/Playwright TypeScript graph: passed.
- Focused Configuration Runtime tests: 18/18 passed.
- Publication, routing, authorization, migration, workspace, and BOS focused
  suite: 44/45 passed. The sole failure is a pre-existing stale source-string
  assertion in `configurationRuntimeLocations.test.ts` expecting
  `setCreatingProgram(true)`; it is unrelated to this change.
- Authenticated Programs Chromium certification: passed.
- `git diff --check`: passed.

## Remaining gaps

No additional Configuration Runtime platform work blocks Consumer #2.

Non-blocking repository/platform follow-ups:

- Repair or retire the stale Locations source-string assertion.
- Resolve the pre-existing Admin shell color serialization hydration warning.
- Live-environment publication/assignment persistence remains covered by the
  underlying service/migration tests; this product journey intentionally used
  deterministic intercepted Programs responses.
- Rich field-by-field draft diff, actor display, rollback, approvals, scheduled
  publication, and branch/restore remain explicitly deferred capabilities.

## Platform boundary

Operational Calculations was not started. No other Configuration domain was
expanded. Locations remains the reference for local operational Configuration;
Programs is now the reference for how a publishable Organization domain extends
that grammar.

## Final certification

**CONFIGURATION RUNTIME COMPLETE**

Programs now qualifies as the reference implementation for future publishable
Configuration domains. Consumer #2 may inherit this runtime without significant
new platform engineering.
