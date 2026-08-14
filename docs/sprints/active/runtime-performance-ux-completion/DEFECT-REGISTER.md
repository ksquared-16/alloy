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

**Base:** `origin/staging` @ `b4bc5d682`.
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

### R-006 · Two competing shared select primitives

| Field | Value |
|---|---|
| **Surface** | Universal Field System consumers |
| **Interaction** | Editing any `field_definitions`-backed option set |
| **Expected** | One platform select |
| **Observed** | `components/admin/fields/SelectFieldControl.tsx` is a *shared* wrapper around a **native** `<select>` with 8 consumers. `IdentityFieldValue.tsx` imports both primitives and chooses between them with a hardcoded `fieldRef` substring allowlist (`.gender`, `assignment`, `program`, `location`, `room`, `schedule`) — so two fields in the same form get two different design systems depending on their name |
| **Root owner** | `SelectFieldControl.tsx` |
| **Classification** | I |
| **Evidence** | `IdentityFieldValue.tsx` `useAlloySelect` branch |
| **Severity** | High — highest leverage remaining: converting the wrapper to delegate retires 8 call sites at once and deletes the allowlist |
| **Shared vs local** | Shared |
| **Status** | **Open** — recommended first item of Wave 3 |

### R-007 · Configuration surface attempts a write on ordinary interaction

| Field | Value |
|---|---|
| **Surface** | `/organization/processes` → Stages |
| **Interaction** | Selecting a stage and expanding "Operator work" |
| **Expected** | Reading configuration does not write |
| **Observed** | A `PATCH .../lifecycle-activation` fired during read-only navigation, and the header moved to "Unsaved changes" with Save enabled. Blocked by the probe's write guard, so nothing persisted |
| **Root owner** | Unknown — not traced |
| **Classification** | H / K |
| **Evidence** | Blocked request logged during the Wave 1 browser probe |
| **Severity** | **Needs triage** — correctness-adjacent, not performance |
| **Shared vs local** | Unknown |
| **Status** | **Open, untriaged.** Recorded because it was observed, not because it was investigated |

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
| Settings / configuration | 217 | 100 |
| Other operator UI | 63 | 30 |
| Operator record + action surfaces | 47 | 23 |
| Focus Panel / presentation runtime | 31 | 9 |
| Layout builder | 26 | 7 |
| AdminV2 app routes | 25 | 15 |
| Operational modules | 18 | 5 |
| **Total** | **427** | **189** |

Baseline at sprint start was 437 across 190 files. The Wave 1 proving slice converted
`LifecycleStageOutcomeBehaviorEditor` (10 → 0). The ledger test fails if any enforced file
introduces a raw `<select>`, if a listed file grows, or if a converted file is not lowered.
