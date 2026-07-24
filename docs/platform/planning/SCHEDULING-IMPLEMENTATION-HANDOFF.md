---
owner: platform
status: proposed
last_reviewed: 2026-07-22
supersedes: []
---

# Scheduling — implementation handoff (resume-ready)

**Purpose:** a clean engineering handoff so the next session resumes **without rediscovery**. It records where the work lives, what is built + browser-verified, the frozen product decisions, the exact OCM integration blocker (with hypotheses + recommended path), and every remaining task. No product redesign — this is engineering state only.

**Governing product docs (frozen, do not reopen):** [`SCHEDULING-IMPLEMENTATION-READINESS.md`](./SCHEDULING-IMPLEMENTATION-READINESS.md) · [`SCHEDULING-IMPLEMENTATION-VALIDATION.md`](./SCHEDULING-IMPLEMENTATION-VALIDATION.md) · [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) · [`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md) · [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md).

---

## 0. Where the work lives — resume instantly

| Field | Value |
|---|---|
| Managed slot | **5** |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt5-scheduling-impl` |
| Branch | `agent/claude/5-scheduling-impl` |
| Base | `origin/staging` (discovery already promoted there @ `2b554b4b4`) |
| Commits | **12 ahead of staging, LOCAL ONLY — not pushed/merged** |
| Dev server | `alloy-dev-start wt5-scheduling-impl` → **http://localhost:3015** (auth via slot session) |
| Browser verify | `alloy-agent-verify 5 route <path>` **or** Playwright with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3015 PLAYWRIGHT_STORAGE_STATE=/Users/Kelly/.local/state/alloy-dev/auth/slot5/storage-state.json` |
| Real test subject | **Firefly Early Learning** tenant → **Kurzman Family** lead (New Leads) → children **Lennon** (2y3m) & **Wrigley** (4mo), both **pre-enrolled** |

**Reach the surface in the app:** Home → **New Leads** (`/workspace/work-unit/new-leads`) → click **Kurzman Family** → the Focus Panel shows the **Scheduling** card (close the BOS panel if it overlays). Click a child → the **Scheduling work surface** opens.

**Re-verify harness (committed):** `web/playwright/tests/scheduling-place-a-child.spec.ts` and `web/playwright/tests/explore-real-app.spec.ts` drive the authenticated Kurzman flow and screenshot to `scratchpad/explore/`.

---

## 1. What is built + committed (with file paths)

**Backend decision loop (unit-tested — `web/tests/scheduling/*`, 32 tests):**
- Canonical projection read model — `web/lib/scheduling/projection/` (`schedulingProjectionTypes.ts`, `buildSchedulingProjection.ts`). Subject-scoped, lifecycle bucketing, pure-stitch + thin-I/O over existing services.
- Identity/Work derivation — `web/lib/scheduling/work/deriveSchedulingWork.ts`.
- Deterministic option generator — `web/lib/scheduling/options/generatePlacementOptions.ts` (injects a hypothetical child, re-runs `buildScheduleExpectations` = preview-is-execution; classifies Recommended/Eligible/Blocked).
- `schedule.create` command + commit adapter — `web/lib/scheduling/commit.ts`, `web/lib/scheduling/commands/scheduleCreateInputs.ts`, `web/lib/adminV2/actions/definitions/scheduleCreateAction.ts` (registered in `actionRegistry.ts`).
- Interim `BillingScheduleProjection` mapper — `web/lib/scheduling/billing/billingScheduleProjection.ts` (read-shaping over the commercial pipeline).
- Unplaced detector — `web/lib/scheduling/problems/detectUnplaced.ts` *(built early; superseded by the child-first entry — see §3; NOT used by the card).*

**API — `web/app/api/admin/scheduling/route.ts`:**
- `GET ?view=sites` · `?view=overview` (unplaced + site patterns incl. `scheduleTypeKey`) · `?view=options` · `?view=projection` · `?view=billing` (commercial preview → `BillingScheduleProjection`; graceful "unconfigured").
- `POST`: enrolled child → `schedule.create` (operational commit); pre-enrolled child → **propose path** (`proposeSchedule`) — **blocked, see §4**.

**Focus Panel Scheduling card (registered + composer-addable):**
- Card key + specs — `web/lib/adminV2/runtime/focusPanel/focusPanelCardModel.ts` (key `"scheduling"`), `system5CardArchetypes.ts` (archetype `collection`), `system5OperationalSurfaceSpec.ts` (footprint/icon/action), `focusPanelCardCatalog.ts` (catalog entry "Scheduling"), model in `deriveOpportunityFocusPanelCards.ts` (`buildSchedulingCardModel`).
- Component — `web/components/admin/focusPanel/cards/SchedulingCard.tsx` (renderer branch in `FocusPanelCardRenderer.tsx`). Card = per-child "what is true" list; clicking a child opens the **work surface** (`ScheduleWorkSurface`) with the flow: Weekly Pattern → editable Days → Site → Recommended Room (alternatives collapsed) → Effective Start/End/Open-ended → Financial Preview → Save. Neutral styling; no "Place".
- **It is only visible once added to Firefly's published Focus Panel layout via the composer (Settings → Layouts) and republished** — already done by Kelly this session (`entity_layouts` focus-panel-summary includes `scheduling`). The runtime reads the PUBLISHED doc, not the draft.

**The `/dev/scheduling-workspace` route** (`web/app/dev/scheduling-workspace/`) is an earlier standalone harness — superseded by the Focus Panel card, kept only as an API smoke surface. Not the product surface.

---

## 2. Verified in the browser (real Kurzman, slot-5 auth)

- Scheduling card renders on the Kurzman Focus Panel as a **2-child "what is true" list** (Lennon, Wrigley); **no inline form**; clicking a child **opens the work surface** — `MY_SCHED_CARD=1`, `CHILD_OPENERS=2`, `WORK_SURFACE=1`.
- Work surface: **7 editable day pills**, pattern initializes days, **Recommended room** shown with alternatives behind "Change room →" (option generator ran live over Firefly's real rooms — Pre-K *Recommended*), effective **Start/End/Open-ended**, **no "Place" wording**, **neutral styling**, **0 page errors**.
- Financial preview renders **inside** the builder after Effective Dates (shows honest **"Pending"** — Firefly's commercial config resolved no rate for the scope).
- Flow order confirmed: Pattern → Days → Site → Room → Effective Dates → Recurring Tuition → Save.
- **NOT yet verified:** an actual saved schedule reflected back — blocked by §4 for lead-stage children.

Evidence screenshots (this session): `…/scratchpad/explore/50-card.png`, `61-work-surface.png`, `70-financial-preview.png`.

---

## 3. Frozen product decisions from this session (do not reopen)

1. **Entry is the child.** Open a child → schedule them. **No "needs-placement" detector/queue gate.** (The `detectUnplaced` module exists but is not the entry point.)
2. **Proposed vs Operational schedules.** A child may have a **proposed** schedule as early as Lead/Registration (planning · forecasting · Billing preview · operator prep) — **not** operationally active (no occupancy/ratios/rosters/attendance). Only an **enrolled** child's schedule **materializes** into operational placements. **Enrollment is the materialization boundary; Scheduling never drives enrollment.**
3. **Scheduling card = "what is true"; the work surface = "let's work"** — the Household/Children/Billing expand pattern, not an inline form.

---

## 4. THE OCM INTEGRATION ISSUE (exact — for the next session)

**Symptom.** Saving a schedule for a pre-enrolled Kurzman child returns *"Couldn't link this child to an enrollment record."* The propose path (`proposeSchedule` in `route.ts`) can't find a writable record.

**What is understood (confirmed this session):**
- A "proposed schedule" persists as the **desired schedule on the `opportunity_customer_member` (OCM)**: `schedule_type` · `program_room_cohort_key` (the room; the handoff treats it as the room location id) · `start_date`. `applyChildEnrollmentMaterialization` already **consumes these on enrollment** → operational `child_placements` + `schedule_assignments`. So the store is correct and the materialization path already exists.
- The card carries identifiers from `buildChildrenCardEvidence` — for Kurzman: `id ≈ 05cf9138…`, `person_id ≈ 9cee6c6f…`. **None of these resolve to an OCM row** by `id`, `customer_member_id`, or `person_id`. The raw `_inquiry_children` block's `ocm_id` also did not resolve.
- **Root cause (hypothesis, high confidence):** **lead-stage inquiry children have NO OCM row yet** (`ocm_id` is null at "New Leads"). The OCM is created later in the pipeline. The card's ids are inquiry/person ids, not OCM ids.
- **The existing pattern to copy:** `web/lib/admin/drawer/inquiryChildFieldEdit.ts` — when editing a lead child's desired fields, it **ensures an OCM first (creates one, returns its id — see the `{ ocmId }` POST helper ~L170-182), then PATCHes** `/api/admin/opportunity-customer-members/[id]`. `resolveOcmId(row)` (~L229) returns `row.ocm_id` when present. So the editor already solves exactly this "no OCM yet" case.

**Recommended implementation path (next session):**
1. Give `proposeSchedule` an **ensure-OCM** step: if no OCM resolves for the child, create one for `(opportunity_id, person_id/customer_member_id, site_location_id)` — reuse/port the ensure logic from `inquiryChildFieldEdit.ts` (or its server-side equivalent under `lib/admin/…`/`lib/opportunities/…`). The opportunity id is on the Focus Panel subject/context.
2. Then set the OCM desired fields (`schedule_type`, `program_room_cohort_key = room_location_id`, `start_date`) — the code for this is already written in `proposeSchedule`.
3. Return `{ ok, proposed:true, message:"Proposed schedule saved — becomes operational at enrollment." }` (already wired; card shows it).
4. Verify: open Lennon Kurzman → build a schedule → Save → confirmation → re-open → the proposed schedule shows on the card; check the OCM row got the desired fields.

**Alternatives considered (do NOT silently pick — confirm with Kelly if reused):** (a) reuse the client-side `inquiryChildFieldEdit` helpers directly from the card (client → the OCM PATCH/POST routes) instead of the scheduling POST — simpler, but splits the write path; (b) a dedicated proposed-schedule store — rejected, contradicts §3 (the OCM desired fields are the store).

**Also confirm (small):** the room mapping — the builder picks a `locations` unit id for the room; `program_room_cohort_key` is treated as the room location id by the handoff (`enrollmentAgreementHandoff.ts` → `roomLocationId: ocm.program_room_cohort_key`). Verify this holds for Firefly (whether cohort keys ever differ from location ids).

---

## 5. Remaining work — ordered for the next session

The next session should complete these, in roughly this order:

1. **Scheduling focus surface** — the work surface currently expands **in the card's grid cell**, not a full **center-drawer takeover with scrim** like Household/Children (`BillingPreviewCard` comment: *"centered Focus Card with depth scrim… NOT an inline overlay"*). Replicate that exact takeover (the `useReportPerspective`/coordination "focused" perspective + the scrim/center layout the panel applies). Files: `SchedulingCard.tsx`, and how the grid centers a focused card (`FocusPanelCardGrid` / coordination model).
2. **Site context resolution** — the builder loads sites and defaults to the first. Resolve the child's **actual site** from context (the Kurzman lead is North Campus) instead of defaulting; ideally hide the site picker when the context site is unambiguous.
3. **Weekly pattern polish** — patterns are a starting template (done). Polish: label the template clearly as a template, keep the day pills as the source of truth, and handle **custom day sets that don't match any pattern** (today the commit uses `schedule_pattern_id`; a custom-day schedule may need a matching/ad-hoc pattern — decide: pick the pattern whose weekdays match, or support custom weekdays on the assignment). See `scheduling-projection-contract.md` (weekdays are the atom).
4. **Time selection** — arrive/depart times are **null in V1** (no slice-1 schema source — see `scheduling-projection-contract.md` §1 note). Add default daily hours + optional per-day time overrides in the builder + a store (a times column/metadata). This is the documented "per-assignment times" Small extension.
5. **Recommendation engine refinement** — the option generator currently ranks by headroom (lowest resulting occupancy) with all rooms "0 scheduled after placement" on empty baselines. Refine: continuity/cohort weighting (calc #10), the org objective, and surfacing *why* the recommendation (one plain line) per `scheduling-product-spec.md` §3–4.
6. **Configurable open-ended schedules** — the builder has Start + optional End + an Open-ended checkbox (done). Make open-ended the explicit, well-labeled default and ensure the commit/propose writes `end_date: null` cleanly and the card renders "open-ended" (per `schedule-lifecycle-and-object.md` §3).
7. **Proposed Schedule persistence (ensure-OCM)** — **§4**. The single blocker to a working Save for lead-stage children.
8. **Final browser verification** — full loop on real Kurzman: open child → build → Save → confirmation → card reflects the proposed schedule; then an enrolled child → operational commit → reflected in card/roster/occupancy. Use the committed Playwright harness.

**Smaller items also discovered:**
- The financial preview shows "Pending" for Firefly because the commercial config resolves no rate for the (program × schedule_type) scope — confirm whether Firefly has `commercial_tuition_rates` for these programs, or this stays "Pending" until configured (honest either way).
- The billing `program_category_id` for pre-enrolled kids resolves via the OCM — will start resolving once §4 ensures the OCM.
- HMR caveat: **adding a new component/module mid-session can leave a stale Turbopack build** (a "module factory not available" symptom) — if a card silently stops rendering, **restart the dev server** (`kill <next pid>` then `alloy-dev-start wt5-scheduling-impl`) for a clean compile. Editing existing files hot-reloads fine.

---

## 6. How to run + verify (copy/paste)

```bash
# Dev server (already running this session; restart if needed)
alloy-dev-start wt5-scheduling-impl        # → http://localhost:3015  (auth via slot session)

# Tests + typecheck (from the worktree's web/)
cd /Users/Kelly/Code/alloy-worktrees/wt5-scheduling-impl/web
./node_modules/.bin/vitest run tests/scheduling/     # 32 tests, all green
npm run typecheck                                    # clean; SLOW (~3-5 min) — give it an 8-min timeout, it is NOT stuck

# Authenticated browser verification on real Kurzman
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3015 \
PLAYWRIGHT_STORAGE_STATE=/Users/Kelly/.local/state/alloy-dev/auth/slot5/storage-state.json \
  npx playwright test playwright/tests/scheduling-place-a-child.spec.ts --project=chromium
```

**Do NOT** run bare `npm run dev` (loads no trusted env → broken login). **Do NOT** push/merge/rebase.

---

## 7. Key file map (fast index)

| Concern | Path |
|---|---|
| Projection read model | `web/lib/scheduling/projection/*` |
| Option generator | `web/lib/scheduling/options/generatePlacementOptions.ts` |
| Create command + commit | `web/lib/scheduling/{commit.ts,commands/scheduleCreateInputs.ts}`, `web/lib/adminV2/actions/definitions/scheduleCreateAction.ts` |
| Billing mapper | `web/lib/scheduling/billing/billingScheduleProjection.ts` |
| Scheduling API (all views + propose) | `web/app/api/admin/scheduling/route.ts` |
| Focus Panel card (component + surface + builder) | `web/components/admin/focusPanel/cards/SchedulingCard.tsx` |
| Card registration | `focusPanelCardModel.ts` · `system5CardArchetypes.ts` · `system5OperationalSurfaceSpec.ts` · `focusPanelCardCatalog.ts` · `deriveOpportunityFocusPanelCards.ts` · `FocusPanelCardRenderer.tsx` (all under `web/lib/adminV2/runtime/focusPanel/` + `web/components/admin/focusPanel/`) |
| **OCM ensure-then-patch pattern (for §4)** | `web/lib/admin/drawer/inquiryChildFieldEdit.ts`; OCM PATCH route `web/app/api/admin/opportunity-customer-members/[id]/route.ts` |
| Materialization (proposed → operational at enrollment) | `web/lib/childcareOperational/materializeChildEnrollment.ts`, `enrollmentAgreementHandoff.ts` |
| Verification harnesses | `web/playwright/tests/{scheduling-place-a-child,explore-real-app}.spec.ts` |

---

*End of handoff. The next session can start at §5 item 1 (or item 7 for the highest-value unblock) with zero rediscovery.*
