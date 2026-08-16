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

## Command → Destination runtime (new certification category)

Matrix built from what Firefly actually renders on the What's Next card of the family subject
`d097e1a8-…`, not from assumed command names.

| Class | Command | Available on Firefly? |
|---|---|---|
| Communications | **Message** | Yes — certified below |
| Forms | **Send form** | Yes — not yet exercised |
| Tours | **Tour ▾** (menu) | Yes — not yet exercised |
| Placement / Assignment | — | **No representative rendered** |
| Stage / Work / Outcome | — | **No representative rendered.** "Current work · Review waitlist position" is text, not a command |

### R-014 · A command destination commits in place with no way back

| Field | Value |
|---|---|
| **Surface** | Focus Panel → What's Next → **Message** |
| **Expected** | Cancelling/closing the destination returns to the same place |
| **Observed** | The composer replaces the command set in place. `Message` and `Send form` launchers both disappear, body text shrinks 1883 → 1635, and **no dismiss control exists in the card**. All 18 buttons enumerated after open: New, Email, SMS, Kelly Kurzman, Add, Add another email, CC/BCC, Bold, Italic, Underline, Bulleted list, Insert link, Insert, Emoji, Attach, Templates, Send, Send later — **no Close, Cancel, Back or ✕** |
| **Classification** | J / E |
| **Severity** | High — the operator's only escape is browser navigation or re-selecting the row |
| **Status** | **CLOSED** `5efa5db64` — and the PARALLEL OWNER classification was **wrong**, see below |

**The reclassification.** R-014 was filed against Message and assumed Communications-owned. It is not.
Message, Send form and every Tour ▾ item resolve to **one** slot — `activePanelAction` in
`CurrentWorkCard` — and **one** replace point, `hasPanel` in `CurrentWorkFocusedSurface`, which fully
unmounts the launcher row. The surface then suppressed its own reason/close topbar in exactly that
state, so opening any command left the operator with no return control **and** no close control.

`closeActionPanel` — the setter that clears the destination *without* collapsing the card — had
existed since the panel slot was written and was reachable from **no UI control**; every visible exit
was bound to `closeWorkspace`, which costs the whole Focus Panel. Outcome mode already had the right
grammar ("← Back to actions"); the commands never inherited it.

Note the reference cards already had it too — Children and Household both publish
`data-identity-disclosure-back` ("← Back to panel"), and Escape restores them exactly. The platform
had the grammar. Only the command destinations were missing it, which is why fixing the shared host
once was the whole job. **No Communications internals were touched, so no Slot 3 collision.**

**Certified after the fix** (Firefly, family `d097e1a8-…`, StrictMode off, writes blocked):

| Command | Destination commits | Back control | Launchers restored | Card survived | Context kept | Requests |
|---|---|---|---|---|---|---|
| Message | yes | yes | 3 of 3 | yes | row + URL | 0 dup |
| Send form | yes | yes | 3 of 3 | yes | row + URL | 0 dup |
| Tour ▾ → Send Tour Invitation | menu +121 ms, panel +117 ms | yes | 3 of 3 | yes | row + URL | 3 req, 0 dup |

0 render loops on every gesture. The only console errors were the probe's own aborted
`POST /api/admin/actions/execute` — no invitation, form or message was actually sent.

**What IS certified on this transition**, with StrictMode disabled so the counts are production-shaped:

- **Immediate acknowledgement:** composer present at **+56 ms**, needing **zero** requests.
- **Context already present:** recipient resolves to *Kelly Kurzman* on open — no wait for enrichment.
- **Context preserved:** subject, selected row `d097e1a8-…` and URL all unchanged.
- **Duplicate-free:** 3 requests, 0 duplicates. Under StrictMode this read as 5 requests / 2 duplicates
  (`participant-decisions` and `family-close`) — both artifacts, per M-1. No fix was made.
- **Content shrinks before replacement** (1883 → 1635) — the destination replaces rather than adds,
  which is the "content disappearing" pattern; recorded with R-014 since they share a cause.


### R-015 · One Escape collapsed three layers at once <span>CLOSED</span>

| Field | Value |
|---|---|
| **Surface** | Focus Panel → any reference card → inline field edit → select menu |
| **Interaction** | Pressing Escape with a menu open |
| **Expected** | Escape dismisses the innermost open layer only |
| **Observed** | With an `AlloySelect` menu, an inline field editor and the expanded Children card all open, **one** Escape closed all three: `menu 1→0, editing 2→0, cardExpanded true→false`. The operator who opens a dropdown and changes their mind loses the whole card and re-navigates |
| **Classification** | E / I / J |
| **Severity** | Medium — no data loss, but it punishes an ordinary change of mind |
| **Shared vs local** | Shared — three owners, all shared |
| **Status** | **CLOSED** `3fa2cdabb` |

**Three causes, three owners.**

1. `OpportunityFocusPanelModeGrid` registers its Escape handler in the **capture** phase on `window`
   and calls `stopImmediatePropagation`. Capture was chosen deliberately — to beat the record
   drawer's ESC-to-close, an *outer* layer — but capture on `window` is the earliest listener in the
   document, so it also beat every *inner* layer. It now yields when one is open.
2. `IdentityFieldValue` published no "editing" marker, and handled Escape on the text/date inputs
   only — so a **select-backed** editor (the child's Program field) had no Escape handler at all.
   It now publishes `data-identity-editing` and cancels on Escape for every field kind.
3. `AlloySelect` moved DOM focus **into** the list and never gave it back, so closing the menu
   dropped focus to `<body>`. That loses the keyboard operator's place outright — Tab restarts from
   the top of the document — and it also defeated the focus-scoped test in (1).

**Why the yield is a predicate, not another listener.** Ordering cannot be relied on: React attaches
to the app root, a *descendant* of `document`, so a bubbling Escape reaches the editor's React
handler **before** `AlloySelect`'s document-level listener. The outer layer therefore asks whether an
inner one is open (`lib/adminV2/runtime/focusPanel/escapeLayerOwnership.ts`) rather than waiting to be
told. One owner for the selector list, so a new transient primitive registers in one place.

**After**, same gesture: `#1` menu closes, focus returns to the trigger, edit and card intact ·
`#2` edit cancels, card intact · `#3` card collapses. Locked by
`tests/focusPanel/escapeLayerOwnership.test.ts` and the 5 behavioural focus tests in
`tests/workspace/alloySelectFocusRestore.test.tsx`.

### M-1 · METHODOLOGY — most on-mount ×2 duplicates are React StrictMode, not product defects

`reactStrictMode` is unset in `next.config.ts`, so Next defaults it **on**, and StrictMode
double-invokes effects **in development only**. Measured on `/organization/processes` by
toggling it:

| StrictMode | Requests | Duplicates |
|---|--:|--:|
| on (default dev) | 37 | **8** |
| off | 30 | **1** |

**Seven of eight "duplicates" do not exist in production.** Any on-mount ×2 must be re-checked
with StrictMode disabled before it is treated as a defect. This does not retract the fixes
already made — those were ×22, or caused by an unstable dependency that re-fires on every queue
re-resolution rather than only on mount, and all reached 1 rather than 2.

**The toggle is now `ALLOY_DEV_STRICT_MODE=0`** (`4cdcca746`), set on the measuring server only.
Unset leaves the key absent from `next.config.ts`, so Next's own default (on) applies and the
committed configuration is unchanged — the "restore it afterwards" step, whose only failure mode was
shipping StrictMode disabled, is gone. Re-verified against this control: **36 requests, 1 duplicate
path**, and that one is the known-legitimate different-intent `lifecycle-catalog` pair.

### R-012 · Inbox re-fetches comms datasets on every open, and the count GROWS

| Field | Value |
|---|---|
| **Surface** | Workspace → Inbox modal |
| **Observed** | First open: 27 requests, `communications/templates` ×3, `templates?status=active` ×3, `announcements` ×3. **Reopen: ×4 each** |
| **Classification** | C |
| **Severity** | Medium — growth across opens is a leak, not StrictMode doubling (which is a flat ×2) |
| **Status** | **Open — PARALLEL OWNER.** Communications is Slot 3's active sprint; not touched |

### R-013 · Attendance has no launcher on this tenant

| Field | Value |
|---|---|
| **Surface** | Workspace shell |
| **Observed** | No sidebar entry matching Attendance; sidebar exposes Workspace, Inbox, Processing, Work Items only |
| **Status** | **BLOCKED — surface not reachable on Firefly.** Not a runtime defect; the workspace cannot be certified until the module is enabled for this tenant |

### R-010 · Household `address_line2` read-back — reassigned

Runtime behaviour is isolated and correct: Children round-trips the identical surface, editor and
save path (edit → PATCH 200 → converge → persist through reload → revert). `address_line2` persists
to `field_values`, but identity truth is built from `person.primary_address_line2` /
`person.address_line2` truth keys that are not sourced from it. **DATA MODEL OWNER** — where person
addresses live is a data-model decision, not a runtime fix.


### R-010 · Waitlist child-grain Focus Panel renders no cards — CONFIGURATION, not runtime

| Field | Value |
|---|---|
| **Surface** | Work Unit → Waitlist work view (`new_work_view_4`) → Focus Panel |
| **Interaction** | Selecting either real Firefly waitlist child |
| **Expected** | A child subject at a child-grain stage opens a useful Focus Panel |
| **Observed** | `cards=0`, `cells=1`, `not-applicable=1`; header renders correctly ("Lennon Kurzman · Waitlist · Tour Scheduled · North Campus") |
| **Root owner** | **Tenant configuration**, not the runtime |
| **Classification** | K |
| **Severity** | High (operator-facing) but **not a Slot 5 fix** |
| **Status** | **Open — CORRECTNESS/CONFIG OWNER** |

**The runtime is correct.** The provisioning answer for `new_work_view_4` resolves
`rowGrain: "child"`, `subjectGrain: {grain: "child", subjectType: "child"}`,
`terminal: "operational"`, and 2 real rows — *Wrigley Kurzman* (`9ab36f48-…`) and
*Lennon Kurzman* (`93722453-…`) — each carrying full row context. Grain resolution,
subject identity and terminal are all right.

**The configuration is empty.** `GET /api/admin/entity-layouts/focus-panel-summary?workViewId=new_work_view_4&stageKey=waitlist`
returns a published doc (version 131) with:

```
surface:  "drawer"        ← drawer-era document
groups:   []              ← EMPTY
blocks:   []              ← EMPTY
nested:   ["children_surface", "household_surface"]
```

There is no card content to render, so the panel renders the one nested "Child" cell, which
resolves not-applicable. This is the runtime faithfully presenting an unauthored composition.

**Contrast — the family path is authored and works.** The All view (`new_work_view_6`,
`rowGrain: family`, `subjectGrain: case/opportunity`, row `d097e1a8-…` "Kurzman Family")
renders 4 cards, 4 cells, `holding=0`, `na=0`.

**Why Slot 5 is not fixing it.** Authoring a Focus Panel composition is tenant configuration,
and publishing replaces the projection — a one-way door. Inventing a Waitlist-specific parallel
composition in the runtime is explicitly forbidden and would hide the real gap.

**Recommended:** author the child-grain Waitlist composition through canonical Surfaces. Note the
existing doc is `surface: "drawer"`, so this is also deletion/convergence debt.

### R-011 · Sibling work-view prewarm fetches answers for views that are empty

| Field | Value |
|---|---|
| **Surface** | Work Unit entry (any view) |
| **Expected** | Speculative prewarm buys a faster view switch |
| **Observed** | Sitting on Waitlist, the page fetched provisioning answers for **New, Tours, Registration, Active Pipeline and All** — 5 sibling answers. **Four returned `terminal: "empty"` with zero rows**; only All had a row |
| **Root owner** | `useCommittedWorkUnitSurfaceRuntime` sibling prewarm (idle-gated) |
| **Classification** | C |
| **Severity** | Medium |
| **Status** | **Open** — the prewarm is idle-scheduled so it does not compete with first paint, but on this tenant it warms mostly-empty views. Needs a with/without switch-latency comparison on a quiet host before changing the policy; that is the D-3 experiment and it is timing-dependent |


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

## Certified clean — 15 Aug, StrictMode off, writes blocked

Recorded so these are not re-audited. Counted evidence only (requests, duplicates, render passes,
presence/absence); the millisecond figures are **dev-build shape**, admissible as "did the click
acknowledge at all", never as product latency.

### Focus Panel card movement — clean

| Gesture | Ack | Requests | Dup | False empty | Panel height | Context |
|---|--:|--:|--:|:--:|---|---|
| Children expand | 42 ms | 1 | 0 | no | 854 px constant | row + URL kept |
| Children return | 34 ms | 2 | 0 | no | 854 px constant | kept |
| Child drill-in (Lennon) | 31 ms | 1 | 0 | no | 854 px constant | kept |
| Child return | 19 ms | 1 | 0 | no | 854 px constant | kept |
| Household expand | 100 ms | 1 | 0 | no | 854 px constant | kept |
| Household return | 20 ms | 2 | 0 | no | 854 px constant | kept |

**No layout jump anywhere** — the expanded and collapsed cells measure identically (household 327 px,
children 386 px), so elevation changes content without moving the grid. Both cards return via
`← Back to panel` **and** Escape, and Escape restores the prior state exactly.

### Field edit + dropdown — closes R-106 / R-107

`Edit Program` on the child surface, the representative capability transition available on this
tenant (see the Assignment row below):

- **Control visible at 10 ms, 0 requests** — the edit reveal costs nothing.
- **Options visible at 111 ms, 0 requests** — and it is `AlloySelect`, not a raw `<select>`
  (`alloyTriggers 1 / rawSelects 0`), with the configured option set resolved: Infant, Toddler,
  Preschool, Pre-K, Kindergarten, School Age. R-108's OS-popup root cause is absent here.
- Cell height constant at 386 px through the whole edit lifecycle.

### Processing and Work Items — deeper interaction, clean

Beyond the already-certified launch. Every gesture acknowledged in **5–43 ms** with **0 duplicate
requests, 0 render loops, 0 console errors**, and the dialog height was constant at 922 px throughout —
no remount, no blank swap, no layout jump.

| | Gestures certified |
|---|---|
| Work Items | open · section Queue ↔ Overview · row (Conduct Tour) · close · warm reopen · close |
| Processing | open · section Queue ↔ Overview · lane Incoming ↔ Completed · row (create_lead) · close |

Section and lane switches mostly cost **0 requests** (Work Items Overview 11 ms/0 req; Processing
lanes 5–6 ms/0 req) — selection commits against already-resolved data rather than refetching.

**Two first-pass readings were probe artifacts and are retracted, not findings:** "0 rows on this
tenant" (rows render as buttons, not `<tr>`, so the selector matched nothing) and a Processing
"false-empty" (did not reproduce; zero empty-state phrases matched on re-run).

**Work Items row → detail:** clicking a specific work row lands on the generic Queue browser
(folders/views/sources) rather than that work item. Return is available (`Close`, Escape), so this is
not an R-014 dead end — but whether a row should resolve to its own work item is a **product
decision**, recorded rather than changed.

### Assignment / Placement — still no command on this tenant

The brief expected Assignment under the Children card. It is not there. The child surface exposes
identity fields only — First name, Last name, Date of birth, Gender, **Program**, Allergies, Medical
Notes, Special Instructions — with no assignment/placement capability among any of its controls.
Placement is expressed as the editable **Program** field, so that field's edit path was certified
above as the representative transition. The register's original "no representative rendered" stands.
**CONFIG OWNER**, unchanged.

### Organization / Settings movement — RETRACTED and re-measured

**The first reading was wrong and is withdrawn.** It reported the main region blanking on 4 of 5
pages "including on a warm revisit", from a probe that sampled at 200 ms and flagged any main region
under 200 characters. Re-measured at 60 ms sampling with the loading fallback identified by its own
`data-testid`, separating a cold first visit from a warm revisit:

| Pass | Fallback samples | Main region | Shell |
|---|--:|---|---|
| Cold — surfaces | 17 | 2748 → **21** → 800 | kept |
| Cold — access | 1 | 800 → **19** → 691 | kept |
| Cold — processes | 0 | 691 → 196 → 651 | kept |
| Cold — data-model | 0 | 651 → 1018 (no dip) | kept |
| **Warm — all four** | **0** | direct swap, no dip below the destination's own size | kept |

**Warm navigation never blanks.** The trace shows the prior page held at full size until the URL
changes and the destination's content is present in the same step. The navigation shell survived
every move, cold and warm.

**The cold blank is `app/adminV2/settings/loading.tsx`** — a Next segment `loading.tsx` that applies
to every settings subpage lacking its own. It renders a deliberately structure-neutral reserve (a
title bar and three pulse bars, no text), which is why the *text* length collapses to ~20 characters
while the region is visually reserved, not empty. Its own comment records why it is structure-neutral:
painting the hub's tile grid there morphed page structure on entry, which the doctrine forbids.

**This is doctrine-conformant, not a defect.** `docs/system/adminv2-runtime-performance-doctrine.md`
forbids "clearing valid current data before replacement data is ready" and "section-owned above-fold
skeletons replacing composed content" — both scoped to **warm** navigation, which is exactly where
this shows a clean direct swap. Its cold rule is the opposite: a reserve *only* when there is nothing
valid to hold ("skeleton only when `loading && !hasRows`"). A cold cross-route move has no valid
content for the destination, so a neutral reserve is the specified behaviour. **No fix made, because
there is no defect to fix.**

**What is structurally true and remains open:** there is **no navigation pending affordance anywhere
in the settings tree** — `useLinkStatus`, `useTransition` and `isPending` appear zero times under
`components/adminV2` and `app/adminV2/settings`. Between the click and the route commit nothing at
all changes. The *window* is dominated by Turbopack compile in dev (URL change at 443–4008 ms), so
whether it is perceptible in production is unmeasured, and adding a progress affordance on dev
evidence would be adding decorative waiting against the doctrine. **ENVIRONMENT BLOCKER** — it is one
production measurement, not an investigation.

One further observation, not attributable on a dev build: `/organization/processes` settles its
content in three visible steps (263 → 196 → 651) on warm as well as cold navigation — the
"shell-first, body-later assembly" shape. Dev cannot separate lazy-chunk compilation from product
waves, so this is recorded, not diagnosed.

`/organization/locations` **is** linked (from the Organization hub, conditional on locations
existing); the earlier "no link" note was an artifact of probing after navigating away from the hub.

### Journey A — continuous walk, workspace to save

Walked as an operator would, one session, no direct URLs after entry:
`/workspace` → Work Unit (All) → Work View Waitlist → back to All → queue row → Focus Panel →
Children card → back → Send form → back → Children → Edit Program → dropdown.

| Step | Ack | Requests | Verdict |
|---|--:|--:|---|
| workspace → work-unit | — | 39 | cold dev entry; 3 loaders, dup subject to M-1 |
| work-view → Waitlist | 112 ms | 4 | clean (0 cards — the known unauthored Waitlist composition) |
| work-view → All | 198 ms | 3 | clean, 4 cards restored |
| queue row → Focus Panel | — | 8 | clean |
| Children expand | 51 ms | 2 | clean |
| ← Back to panel | 49 ms | 3 | clean |
| Send form | 92 ms | 4 | clean; dup subject to M-1 |
| ← Back to actions | 51 ms | 4 | clean; dup subject to M-1 |
| Children expand (2nd) | 68 ms | 2 | clean |
| Edit Program | 15 ms | 0 | clean |
| dropdown open | 107 ms | 0 | clean, focus lands on the option |

**The Focus Panel boundary measured 854 px at every single sample across the whole journey** — no
layout jump anywhere in the walk. **0 render loops.** No dead click, no blank surface, no stale
content, no broken return context. The duplicate flags are **not** defects: this run was on the
default server with StrictMode **on**, so M-1 applies, and the same transitions read 0 duplicates
when measured with StrictMode off.

**Save — partially certified, and it is not "ambiguous".** Two findings, neither a defect:

1. The child's Program field has **no Save button by design.** `autoCommitOnPick` is scoped to
   `placement_select` and any `fieldRef` containing `program`, so picking an option commits it and
   the only inline control is Cancel. Documented in the component.
2. Re-selecting the **same** value issued **no network write at all** — the no-op is correctly
   skipped. So the save *path* did not actually run, and this does not certify a real save.

A save acknowledgement affordance does exist and **is wired**: `IdentityFieldGrid` tracks
`justSavedFieldRef` on a timer and passes `savedFlash` per field, which `IdentityFieldValue` renders.
Unlike `closeActionPanel` (R-014) this one is reachable.

**Not certified:** that the flash actually paints on a real save. Proving it requires a genuine
durable write to Firefly child data — and Firefly is the enrollment certification tenant another slot
is actively using, so changing a child's placement was not something to do unilaterally.
**Needs Kelly's authorization, or a disposable subject.** It is the single remaining gap in Journey A.

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
