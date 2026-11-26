---
owner: engineering
status: closeout
last_reviewed: 2026-07-22
supersedes: []
---

# What's Next Configured-Work — Closeout & Handoff to the Runtime & Performance Session

**The configured-work product and capability contracts are ACCEPTED (visual QA, Wenc Family).** This
session was presentation + capability build. The **next session is "Configured Capability Runtime &
Performance"** — it must investigate the runtime issues in §3 with instrumentation, **not** guesses,
and must not begin optimization until the cause is measured.

## 1. State (the required return)

- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (managed slot 1, port 3011).
- **Branch:** `agent/claude/1-alloy-phase-5-product-realization`. **Base:** `origin/staging`.
- **Ahead/Behind:** **37 / 15** (staging advanced to `0ad3e2f93` while this ran — a rebase/merge is needed at promotion; not done here).
- **Tree:** clean. **Server:** running on http://localhost:3011 (HTTP 200). **Push/merge:** **not pushed, not merged.** Do not push/merge without Kelly's word.
- **Final commit:** `f2ed8eb89` (shared hosted-capability compact-host). Full engineering arc (newest→oldest): `f2ed8eb89` compact-host · `1b02a5419` polish (composer/outcome/local-time) · `6ff2dbf34` form-delivery · `72de7bea5` QA-round (panel presentation/tour copy/outcome mode/transition integrity) · `125fc3430` Message-inline composer · `686053fc1` header dedupe + View details · `65096d20f` Slice A correction · `65e722d8b` Slice A · `ca3b61703` Slice D · `e93d95981` Slice F · `43ebd68b9` Slice E · `345fc53f8` Slice B.
- **Authenticated screenshots:** Kelly captured + accepted them (the acceptance gate). No agent-captured evidence — a reproducible `alloy-agent-verify focused-spec` Playwright script (open Wenc → What's Next → each capability) is **not yet written**; it's the fastest way to automate future QA evidence.

## 2. Final accepted product state (files)

- **What's Next summary card** — obligation-first; `SummaryBody` + `View details →` opens the drill-in. `CurrentWorkCard.tsx`.
- **Centered configured-work surface** — `current_work` elevates as a centered Focus Card (`isFocusElevatingCard`) rendered through UniversalCard. `CurrentWorkFocusedSurface.tsx`, `focusPanelCoordinationModel.ts`, `OpportunityFocusPanelModeGrid.tsx`.
- **Compact hosted-capability mode** — capability-active collapses the card to a compact context frame; content-sizes, capped, capability scrolls internally (no nested full-surface scrollbar). `CurrentWorkCard.tsx` (`data-capability-active`), `alloyOsRuntime.css`.
- **Canonical communications composer** — inline via `CommunicationsDrawerSection` reusing the Activity embed contract. `CurrentWorkActionPanel.tsx`.
- **Tour scheduling** — inline `OpportunityTourScheduleActionModal` (slot picker). `CurrentWorkActionPanel.tsx`.
- **Generic form delivery** — `FormDeliverySurface.tsx`; `POST .../form-deliver`, `GET .../delivery-subjects`; interaction host `form_delivery` on `send_form`; reuses `executeCommunicationsSend` + `mintExistingRecordFormLinkForAdmin`.
- **Focused outcome declaration** — dedicated mode; premium radio rows (label + configured effect) + Confirm. `CurrentWorkFocusedSurface.tsx`, resolutions from `buildCurrentWorkResolutions.ts`.
- **Configured transitions** — generic `resolveOutgoingProcessTransitions` with referential-integrity filter (drops targets not in the process stage inventory).
- **Grouped missing information** — ownership grouping (Slice E). `CurrentWorkReadinessSummary.tsx`, `resolveCurrentWorkRequirementOwner.ts`.
- **Local-time formatting** — activity timestamps via canonical `formatActivityTimestamp({ timeZone })`, timezone from `useAdminViewerTimezone`. `resolveLeadActivityPreview.ts`, `buildCurrentWorkActivityPreviewItems.ts`.
- **Recomposition** — capability success dispatches `adminv2:opportunity-updated`; inline VM reload (no reload).

## 3. Unresolved runtime issues — for the next session (INSTRUMENT, don't guess)

Observed through authenticated localhost QA. Record findings from measurement; do not assume a cause.

**3a. Duplicate loading on `workspace → work unit` navigation.** The Focus Panel / What's Next appears
to initialize **twice**. Instrument mount/fetch counts and determine which of these it is (do not guess):
duplicate component mounting · summary + focused surfaces mounting simultaneously · React Strict-Mode
dev double-invoke · multiple runtime consumers · route/layout Suspense boundaries · repeated
server/client fetches · cache-key mismatch.

**3b. Delayed capability opening.** Message / Schedule tour / Send form / Record outcome don't feel
immediate. Current: `click → host waits/mounts → capability initializes → data loads → usable`. Target:
`click → host shell appears immediately → warmed data renders → freshness verifies in background`.
Instrument the click-to-usable timeline per capability.

**3c. Tour latency** — availability/booking checks load only after click (`OpportunityTourSlotSchedulePanel` fetches `/api/admin/tours/slots` + `availability-rules` on open).
**3d. Form-delivery latency** — forms + recipients + related subjects fetch only after the surface opens (`FormDeliverySurface` `useEffect`).
**3e. Communication latency** — recipient/thread context may initialize after the composer opens.

Scope for the next session: prefetch/warm on intent, host-shell-first rendering, dedupe of mounts/fetches, cache-key correctness. **Do not start optimization until the duplicate-load and latency causes are instrumented and measured.**

## 4. Remaining product/eng work (not perf)

- **Slice G — legacy workspace retirement: NOT STARTED.** `CurrentWorkWorkspace.tsx` still exists but is no longer mounted in the focused path; retire after a capability-parity check.
- **Composer footer (legacy comms path):** if the org runs legacy (non-comms-v2) communications, the Send footer sits in the composer's own scroll rather than hard-pinned; pinning needs a composer-internal (`DrawerMessagingComposer`/`MessagingComposerFrame`) change. V2 pins it.
- **Tour loading** uses the existing compact skeleton; swapping in the canonical Alloy loader is a small tour-panel follow-up.
- **§9-bis config** (labels/vocabulary/terminal-enroll; stale published-plan stage vocab like "qualification") — config/data re-seed, Product-gated.

## 5. Tests & validation discipline

- New: `currentWorkReadinessOwnership`, `currentWorkCommandIntegrity`, `currentWorkResolutions`, `currentWorkCenteredHost`, `currentWorkActivityTimezone` (+ updated `currentWorkFocusWorkspace`, `focusPanelCanvasFinalization`, `currentWorkProcessBuilderQa`, `projectCurrentWork`, `resolveCurrentWorkActionSurface`).
- Validate by **delta vs a stashed baseline**, never absolute green: `tests/adminV2/runtime + actions` baseline = **81 failing tests / 34 files** (pre-existing staging drift); `tests/presentation` also has ~7 pre-existing failing files. Every commit this session held the baseline (zero net-new) with `npm run typecheck` clean.

## 6. Next-session starting point

1. Stay in this managed worktree/branch (slot 1, port 3011). Read this doc + `phase-5-whats-next-engineering-handoff.md`. Do not reopen the accepted product/contracts.
2. First work item: **instrument §3a (duplicate load)** and **§3b (click-to-usable latency)** — measure before changing anything.
3. Then warm-on-intent / host-shell-first per §3. Keep enrollment as the fixture; no capability-resolution / form-delivery / tour / outcome / transition contract changes.
4. Do not push, merge, or promote without Kelly's authorization. Rebase onto current `origin/staging` (branch is 15 behind) at promotion time.
