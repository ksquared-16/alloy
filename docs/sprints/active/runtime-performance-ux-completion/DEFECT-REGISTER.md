---
owner: runtime
status: active
last_reviewed: 2026-08-14
supersedes: []
---

# Runtime Performance + UX Completion — defect register

**Status:** Active working register for the Slot 5 sprint. **Evidence, not doctrine.**
Canonical behaviour lives in its owner doc; this file records observed defects, their root
owner, and what proved them.

**Base:** rebased onto `origin/staging` @ `626b83697` (14 Aug, overnight run).
**Program context:** [`docs/runtime/RUNTIME-V1-CERTIFICATION-SPRINT.md`](../../../runtime/RUNTIME-V1-CERTIFICATION-SPRINT.md)
is the prior program's canonical tracker. Its Performance row reads 72%, overall ~66%.

## How to read this

**Classification** uses the mission's root-cause classes:

| | |
|---|---|
| A | network / backend query latency |
| B | API composition latency |
| C | duplicate or waterfall fetching |
| D | React render / state churn |
| E | route / remount / navigation ownership |
| F | Surface ViewModel / reveal coordination |
| G | VM / Focus Panel hydration |
| H | projection refresh / invalidation |
| I | field / input primitive |
| J | motion / presentation |
| K | configuration page architecture |
| L | actual domain logic dependency |

**Evidence discipline.** No entry may carry a timing measured on a loaded host. Where a
number was observed under load it is recorded as *shape only* and marked so. Counted
evidence — requests, call sites, render passes — is not load-sensitive and is used freely.

---

## Closed in this sprint

### R-001 · Platform select primitive unusable outside the operator runtime shell

| Field | Value |
|---|---|
| **Surface** | Any surface outside `AlloyOsRuntimeSplitController` — the whole configuration plane |
| **Interaction** | Rendering `AlloySelect` |
| **Expected** | A platform primitive presents correctly wherever it is imported |
| **Observed** | Every `.alloy-select__*` rule lived in `app/adminV2/components/alloyOsRuntime.css`, imported only by the runtime shell and the `/dev` harnesses. In Settings the trigger styled and the popup did not — no positioning, no surface, no elevation |
| **Root owner** | `components/workspace/AlloySelect.tsx` |
| **Classification** | I |
| **Evidence** | `.alloy-select__list` defined in exactly one stylesheet; that stylesheet imported by one production module, not in the settings tree |
| **Severity** | High — this is *why* call sites reached for raw `<select>` or a local wrapper |
| **Shared vs local** | Shared |
| **Status** | **Closed** `3aa8faac1` — rules moved to `components/workspace/alloySelect.css`, imported by the component. Locked by `tests/workspace/alloySelectPresentationContract.test.ts` |

### R-002 · Browser focus ring inside the primitive built to remove browser chrome

| Field | Value |
|---|---|
| **Surface** | Every `AlloySelect` adopter |
| **Interaction** | Arrowing through an open menu |
| **Expected** | Keyboard position marked in Bend Pine; no browser default styling |
| **Observed** | The component moves real DOM focus onto the active option so screen readers follow, so the browser painted its own focus ring — a hard blue rectangle. `.alloy-select__option--active` had **no rule anywhere in the repo**, so that blue ring was the only indication of keyboard position |
| **Root owner** | `components/workspace/AlloySelect.tsx` + `alloySelect.css` |
| **Classification** | I / J |
| **Evidence** | Browser, before: active option computed `background: rgb(255,255,255)`, visible blue ring in `primitive-keyboard.png`. After: `rgba(0, 162, 131, 0.1)`, ring gone |
| **Severity** | High — directly violates "no random blue / default browser control styling" |
| **Shared vs local** | Shared |
| **Status** | **Closed** `3aa8faac1` |

### R-003 · Warm cache bypassed by the surface it was built for

| Field | Value |
|---|---|
| **Surface** | Focus Panel → Current Work → Send form |
| **Interaction** | Opening the delivery surface |
| **Expected** | A warm hit costs no requests; an open racing an in-flight warm joins it |
| **Observed** | The surface peeked the cache to paint, then re-ran all three fetches unconditionally in a hand-copied duplicate of the cache's own fetch functions. 3 redundant requests per open; 6 requests for 3 resources when racing a warm |
| **Root owner** | `lib/adminV2/runtime/focusPanel/currentWork/formDeliveryWarmCache.ts` |
| **Classification** | C |
| **Evidence** | Request-count matrix across 7 scenarios, `tests/focusPanel/formDeliveryWarmCacheRequests.test.ts` |
| **Severity** | Medium |
| **Shared vs local** | Local, but the *shape* is shared — see R-004 |
| **Status** | **Closed** `1677f3c3c` |

### R-004 · Freshness contract exported and never wired

| Field | Value |
|---|---|
| **Surface** | Send form |
| **Interaction** | Reopening after a delivery |
| **Expected** | A delivery retires the warm entry |
| **Observed** | `invalidateWarmFormDelivery` exported since the cache was written, called from nowhere. Survivable only because the surface refetched every time — so closing R-003 without this would have introduced stale reads |
| **Root owner** | Same cache |
| **Classification** | H |
| **Evidence** | Repo-wide grep: zero call sites |
| **Severity** | Medium — latent until R-003 closed |
| **Shared vs local** | Local |
| **Status** | **Closed** `1677f3c3c` |

---

### R-006 · Two competing shared select primitives

| Field | Value |
|---|---|
| **Surface** | Universal Field System consumers (7 call sites) |
| **Interaction** | Editing any `field_definitions`-backed option set |
| **Expected** | One platform select |
| **Observed** | `SelectFieldControl` was a *shared* wrapper around a **native** `<select>`, so the field system shipped its own input runtime beside `AlloySelect`. `IdentityFieldValue` imported both and chose between them with a hardcoded field-NAME allowlist, so two fields in one form could present two different design systems depending on what they were called |
| **Root owner** | `components/admin/fields/SelectFieldControl.tsx` |
| **Classification** | I |
| **Evidence** | Consumer inventory below; `useAlloySelect` allowlist |
| **Severity** | High |
| **Shared vs local** | Shared — fixing the wrapper converted all 7 consumers at once |
| **Status** | **Closed** `f68a7355a`. The adapter survives and keeps the field-system contract; it owns no value semantics, keyboard model or menu. Allowlist deleted |

**Consumer inventory — behaviours actually used.** No consumer used validation, error, or
help-text props; none exists on the adapter. **No consumer needs read-only** — every one
uses `disabled` only, so read-only stays **deferred** per the standing rule against adding
API surface for theoretical completeness.

| Consumer | value | onChange | options | disabled | placeholder | className | testid | aria-label |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `ConfiguredCreateFormFields` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| `ActionIntakeFieldGroups` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ActionWorkspaceGatherFields` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `IdentityFieldValue` | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `EmergencyContactsSection` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| `CreateLeadHouseholdCardEditFields` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `CreateLeadRequiredChecklistRow` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |

`SelectOptionChoice` and `AlloySelectOption` were already structurally identical, so no
option adaptation was needed. `className` replaced the control's chrome and now lands on the
trigger via `triggerClassName` — the element it always described.

---

### R-008 · "Unsaved changes" appears after read-only navigation

| Field | Value |
|---|---|
| **Surface** | `/organization/processes` → Stages |
| **Interaction** | Selecting stages; no edits |
| **Expected** | A read gesture leaves the surface clean |
| **Observed** | Sampled at three points with non-GET logging: clean at boot (`unsaved false`, Save disabled), **`unsaved true` + Save enabled after four stage selections**, with **zero requests behind it** |
| **Root owner** | `StageEditorV2.tsx` — `isDirty = fieldDirty \|\| operatingPlanDirty \|\| v2Dirty`. `savedV2` rebaselines on stage switch; the two sub-editor flags do not |
| **Classification** | K (UX correctness — not a durable write) |
| **Severity** | Medium — teaches operators to distrust the save indicator |
| **Status** | **Open.** Separated from R-007 deliberately: no server write is involved, and rebaselining the sub-editors is editor work |

### R-009 · `saveActivation` rebuilds the whole bundle from component state

| Field | Value |
|---|---|
| **Surface** | Lifecycle activation board |
| **Expected** | Changing one field persists one field |
| **Observed** | Every writer sends a full `LifecycleActivationV1` built from current state (`status_keys: patch.status_keys ?? statusKeys`, and eight more the same way) |
| **Classification** | H |
| **Severity** | Medium — no longer reachable from a read gesture (R-007 closed), but a legitimate writer firing before values resolve can still persist partial state |
| **Status** | **Open.** Needs the endpoint to accept a partial patch — its own slice |

---

## Input platform — CLOSED at program level (2026-08-14)

Single-select is complete and handed to a parallel lane. Slot 5 remains owner of the
primitive if a migration batch discovers a genuine shared deficiency.

| Item | State |
|---|---|
| One canonical single-select implementation | ✅ `AlloySelect` |
| `SelectFieldControl` delegates | ✅ adapter only — no value semantics, keyboard model or menu |
| Identity field-name allowlist | ✅ removed |
| Typeahead | ✅ native semantics, 21 tests |
| Required / empty semantics | ✅ `allowEmpty` |
| Density | ✅ `density="compact"` |
| Keyboard-active styling | ✅ browser focus ring replaced with Bend Pine marker |
| First owner-based batch | ✅ organization calculations, 13 → 0 |
| Raw-select ratchet | ✅ active, 414 remaining |
| Remaining migration | ✅ classified, **parallelizable** |
| Multi-select | ⏸ separate platform-input gap — NOT AlloySelect work |
| Portal · read-only | ⏸ deferred pending evidence |

---

## Select primitive — limitations still open

Recorded so the mass migration is planned against what the primitive actually does.

| # | Limitation | Status |
|---|---|---|
| L-1 | **No portal.** The menu is absolutely positioned inside its own root. The upward flip handles viewport edges; an ancestor with `overflow: hidden` would still clip. | **Deferred by rule** — no clipping failure reproduced in a supported surface. Build it when one is. |
| L-2 | **Read-only is not distinct from disabled.** | **Deferred by rule** — all 7 adapter consumers use `disabled` only. |
| L-3 | **No canonical multi-select.** Audited: 6 enforced files use native `multiple`, and two bespoke implementations exist (`LocationMultiSelect`, `CommsAudienceMultiSelect`) with **no shared owner**. | **Not a single-select blocker.** Registered as its own platform-input gap. Do NOT add multi-select to `AlloySelect` — the interaction and accessibility semantics differ materially. |
| L-4 | **Typeahead has no visible feedback.** The buffer is invisible; the operator sees only the active option move, exactly like a native select. | Intentional. Revisit only if evidence shows it is insufficient. |

---

## Overnight run — 14 Aug

### R-010 · Workspace → Work Unit navigation was an infinite render loop <span>CLOSED</span>

| Field | Value |
|---|---|
| **Surface** | Workspace → any Work Unit |
| **Interaction** | Every client-side navigation into a Work Unit |
| **Expected** | The Work Unit surface commits |
| **Observed** | React pinned at "Maximum update depth exceeded"; the Work Unit surface **never committed at all**. Open → work unit **3305** errors · work-view switch **1414** · Today's Work row **2217**. Only `WS.SURFACE` present, body 269 chars |
| **Root owner** | `components/presentation/rightRail/BosWorkspaceScopeSync.tsx` |
| **Root cause** | Two concurrent writers of one global state, coupled by a dependency array. During a soft navigation the retained Workspace publishes `work_unit_id: null` and the live Work Unit publishes its id. The effect depended on the whole assistant CONTEXT, which is memoised over `workspaceScope` — so each write changed the context identity, re-ran the other surface's effect, which wrote its scope back |
| **Classification** | D / E |
| **Pre-existing** | **Yes** — reproduced identically on `origin/staging` (3202 vs 3305) by checking staging out into this worktree |
| **Why it survived** | Direct URL load is clean; it reproduces only on a soft navigation, when both surfaces are mounted |
| **Fix** | Depend on `setWorkspaceScope` (a stable `useCallback([])`) instead of the context |
| **After** | **0** loop errors on every gesture; `WU.SURFACE`, `WU.HEADER`, `WU.WORK_VIEW_PILLS`, `WU.QUEUE`, `FP.SURFACE`, `RR.SURFACE` all commit within 3 s where previously none appeared |
| **Status** | **CLOSED** `a73c12a97` |

### R-011 · Warm tour-schedule entry re-fetched <span>CLOSED</span>

R-005's second instance, closed. `peekWarmTourScheduleForQuery` returns the entry only for the
window it covers with nothing excluded; reschedule and paged windows still fetch. Certified by
request counts. **CLOSED** `ae0d9c4e7`.

---

## Open — measured this run, not yet fixed

### D-2 · `queue-row-layout` fetched twice per Work Unit entry

Both requests come from `fetchWorkUnitSurfaceConfigBundle`, but **sequentially**, so the
in-flight coalescing added in `e53cbaed4` cannot collapse them. The warm path caches its result
via `putWorkUnitSurfaceConfigCache`; the runtime config effect appears to fetch without
consulting that cache first. **Class C.** Owner: the runtime config effect. Not guessed at.

### D-3 · `provisioning-answer` ×5 on a work-view switch

`GET /api/admin/work-units/new/provisioning-answer` fires **five** times during one work-view
switch — the documented 4× speculative sibling prewarm plus the real one, now landing *during*
a switch. **Class C.** The historical note says the prewarm bought 46 ms record-switch, so it
must be measured both ways before removal.

### D-4 · `communications/family-workspace` ×2, `metrics/resolve` ×2

Two further repeated paths seen in the same sweep. **Class C**, unowned as yet.

---

## Open

### R-005 · Second instance of the warm-cache bypass

| Field | Value |
|---|---|
| **Surface** | Opportunity → Tours → slot schedule panel |
| **Interaction** | Opening the schedule/reschedule panel |
| **Expected** | One request per resource per load |
| **Observed** | `OpportunityTourSlotSchedulePanel` peeks `tourScheduleWarmCache`, then re-fetches `tours/slots` and `tours/availability-rules` itself — the same endpoints the cache holds |
| **Root owner** | `lib/tours/tourScheduleWarmCache.ts` |
| **Classification** | C |
| **Evidence** | Cache fetches 3 endpoints; the panel re-fetches 2 of them directly |
| **Severity** | Medium |
| **Shared vs local** | Local, same shape as R-003 |
| **Status** | **Open.** Not a straight swap: the panel's slots query carries `exclude_booking_id` in reschedule mode, so the cache key must cover that variant before the fetch can be folded in. Deliberately reported rather than half-fixed |

### R-007 · Selecting a stage to READ it writes to the database

| Field | Value |
|---|---|
| **Surface** | `/organization/processes` → Stages |
| **Interaction** | Clicking a stage in the Stages list |
| **Expected** | Reading configuration does not write |
| **Observed** | `PATCH /api/admin/departments/{id}/lifecycle-activation` fires on every stage selection |
| **Root owner** | `LifecycleActivationBoard.tsx` → `selectStage` → `saveActivation` |
| **Classification** | H / K |
| **Severity** | **Medium** |
| **Shared vs local** | Local to the lifecycle activation board |
| **Status** | **CLOSED** `6cf3ee1ff` — the write is removed from the read path. Locked by `tests/lifecycle/lifecycleActivationWriteBoundaries.test.ts`. Browser-proven: 4 stage selections + 2 panel expansions = **0 durable requests** |

**Causal chain.** `selectStage(stage)` is the stage-list click handler. Its last statement is
`void saveActivation({ stage_key: stage.key, stage_label: stage.label })` — fire-and-forget,
so a failure is silent. `saveActivation` PATCHes the endpoint; the handler writes
`departments.metadata` via `mergeCategoryFDepartmentMetadata` and stamps `updated_at`.

**Is there a server-side write?** **Yes, durable** — `supabase.from("departments").update(...)`.

**Can read/navigation produce durable mutation?** **Yes.** Clicking a stage to look at it
persists `stage_key`, `stage_label` and a fresh `updated_at`.

**Intended or accidental?** The *stage persistence* is deliberate — this is an activation
wizard remembering which stage the operator is on. What is not obviously deliberate is
**how**: `saveActivation` rebuilds the ENTIRE `LifecycleActivationV1` from current component
state on every call (`status_keys: patch.status_keys ?? statusKeys`, and eight more fields
the same way). A stage click therefore rewrites the whole bundle from whatever the client
happens to hold, so a selection made before those values resolve can persist partial state.
**That is the real hazard — not the cursor write.**

**Mitigation already present.** The handler merges into a Category-F sibling key and is
commented "never rewrite publication-owned builder", so it cannot clobber the published
business process. Hence Medium, not High.

**Why the header said "Unsaved changes."** Not this request. The stage draft state marks
dirty on selection independently; the two coincide, which is what made an ordinary read look
like an edit in progress.

**Test coverage.** None. No test asserts that stage selection saves, or bounds what it saves.
`tests/lifecycle/lifecycleStatusStepSaveFix.test.ts` asserts the `selectStage` call shape only.

**Residual debt — the full-bundle contract.** `saveActivation` still rebuilds the entire
bundle from component state, so any *legitimate* writer can still persist unresolved sibling
fields. The navigation trigger is gone, which removes the reachable path, but the contract
hazard remains. Making the endpoint accept a partial patch changes its server handler and is
the editor refactor this slice was bounded away from. **Registered as R-009.**

**Superseded recommendation.** Send a true partial patch, or persist editor position
separately from the activation bundle, so a read gesture cannot carry stale field values.
That changes the endpoint contract and its server handler — the Business Process editor
refactor this investigation was explicitly bounded away from. It needs its own slice.

---

## Reported by Kelly at sprint start — not yet reproduced under measurement

These initiated the sprint. None has been measured yet: the host was at load average 65–118
throughout, and a timing taken there would be worse than no timing. They are listed so the
register is complete, each with the owner that would be measured first.

| # | Surface / interaction | Likely root owner to measure first | Class |
|---|---|---|---|
| R-101 | Click does not visibly acknowledge | Per-control pending state; no shared executing affordance found | D / I |
| R-102 | Work View transitions | `useWorkUnitSurfaceRuntime` · `queueRegionRenderState` | E / F |
| R-103 | Queue → Focus Panel | `FocusPanelSurface` shell commit vs. seed | G |
| R-104 | Focus Panel → card / detail | `buildCardModels` · `COMMIT_CRITICAL_CARD_SPECS` | G |
| R-105 | Child / contact focus changes | Drill-in composers | G |
| R-106 | Field edit activation | `IdentityFieldValue` edit lifecycle | I |
| R-107 | Dropdown open / options reveal | `AlloySelect` (R-001/R-002 closed; open latency unmeasured) | I |
| R-108 | Dropdown colours / fonts / selection | **Root cause identified:** 427 raw `<select>` render the OS popup | I |
| R-109 | Save responsiveness | Per-surface; no shared optimistic seam identified | H |
| R-110 | Card hydration | Focus Panel card lifecycle | G |
| R-111 | Operational workspace navigation | `openWorkspaceModal` — modals, not runtime commits (a known V1 boundary) | E |
| R-112 | `/organization` / Settings navigation | Settings route architecture | K |
| R-113 | Motion / layout jumps | Reveal coordination | J |
| R-114 | Inconsistent controls | Shared input primitives — R-006 | I |

---

## Adoption ledger — raw `<select>` by owner

Enforced product UI only. Legacy admin (77), dev harnesses, tests, and the public
parent-facing surface are exempt and enumerated in
`web/tests/platform/rawSelectAdoptionLedger.test.ts`.

| Owner | Tags | Files |
|---|--:|--:|
| Settings / configuration | 204 | 97 |
| Other operator UI | 63 | 30 |
| Operator record + action surfaces | 47 | 23 |
| Focus Panel / presentation runtime | 31 | 9 |
| Layout builder | 26 | 7 |
| AdminV2 app routes | 25 | 15 |
| Operational modules | 18 | 5 |
| **Total** | **414** | **186** |

Baseline at sprint start was 437 across 190 files. Wave 1 converted `LifecycleStageOutcomeBehaviorEditor` (10 → 0);
Batch 1 converted Settings / organization calculations (13 → 0 across 3 files). **Note the ledger
counts CALL SITES, not affected surfaces** — Wave 3A converted seven surfaces via the shared
adapter and moved the number by zero. The ledger test fails if any enforced file
introduces a raw `<select>`, if a listed file grows, or if a converted file is not lowered.
