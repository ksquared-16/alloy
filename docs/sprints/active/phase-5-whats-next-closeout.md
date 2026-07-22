---
owner: engineering
status: closeout
last_reviewed: 2026-07-22
supersedes: []
---

# Phase 5 — What's Next Configured-Work Runtime: Session Closeout

**Purpose:** hand a brand-new session the exact state at closeout. The configured-work architecture
and capability contracts are **accepted**. What remains is (a) Kelly's authenticated localhost QA of
the final presentation polish, and (b) Slice G (legacy workspace retirement), which is **not started**.

**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` (managed slot 1, port 3011).
**Branch:** `agent/claude/1-alloy-phase-5-product-realization`. **Base:** `origin/staging @ 2b554b4b4`.
**Status:** 35 commits ahead, clean tree, **nothing pushed, nothing merged.** Do not push/merge without Kelly's word.

Frozen inputs (do not reopen): the accepted engineering handoff `phase-5-whats-next-engineering-handoff.md`
and the docs it links.

---

## 1. What shipped this session (all committed local, unpushed)

Accepted slice order was **B → E → F → D → A → G**. B/E/F/D/A are done; the send-form capability and a
final presentation polish were added on Kelly's direction. **G is not started.**

- `345fc53f8` **Slice B** — metadata-driven capability/host resolution (removed name shims).
- `43ebd68b9` **Slice E** — ownership-driven requirement grouping ("Still needed" grouped by owner; internal-id suppression; replaced `inferWorkItemOwner` label regex on the surface path).
- `e93d95981` **Slice F** — command integrity: resolved execution state (`executable|disabled|blocked|hidden|configuration_error`) on every action VM; no enabled no-op buttons.
- `ca3b61703` **Slice D** — generic outcomes + transitions contract (`CurrentWorkResolutionVM`: label/handler/target/effect/confirmation/execution).
- `65e722d8b` → `65096d20f` → `686053fc1` **Slice A** — centered configured-work Focus Card. v1 was REJECTED (reused legacy workspace body); corrected to a purpose-built single-column surface rendered through UniversalCard so the grid's centered elevation applies; then header-dedupe + summary "View details →".
- `125fc3430` **#1 Message** → real communications composer inline (CommunicationsDrawerSection), not the legacy Compose modal.
- `72de7bea5` **QA round** — panel presentation (composer/tour as primary content), tour dev-copy removed, outcome mode, transition **referential-integrity filter** (drops targets not in the process stage inventory → suppresses stale "Move to Qualification").
- `6ff2dbf34` **Generic form-delivery capability** (send-form), v1 on existing comms infra — see §3.
- `1b02a5419` **Final presentation polish** — see §2.

## 2. Final presentation polish (`1b02a5419`) — AWAITING KELLY'S AUTHENTICATED QA

1. **Composer fit** — the communications composer reuses the Activity embed layout contract
   (`.alloy-os-activity-cockpit__comms` → `.alloy-os-activity-workspace__embed` → `activity_embed`):
   compact context header, capability body scrolls internally, Send / Send later / BOS Assist footer
   stays visible; the whole focused card no longer scrolls (`data-has-panel` → fixed-height flex column).
2. **Outcome decision mode** — default work mode shows a subordinate "Record outcome →" affordance
   (not the full outcome collection); entering it swaps the command body for premium full-width radio
   rows (label + configured effect) with "← Back to actions" and one dominant "Confirm outcome".
3. **Local-time doctrine** — activity timestamps were rendering UTC because `resolveLeadActivityPreview`
   called `formatActivityTimestamp` with no timezone. Fixed the shared path: viewer timezone
   (`useAdminViewerTimezone`) threads CurrentWorkCard → buildCurrentWorkActivityPreviewItems →
   resolveLeadActivityPreview → `formatActivityTimestamp({ timeZone })`. Tests cover UTC→local, DST,
   date boundary, no raw UTC.

**Acceptance criteria (Wenc Family, http://localhost:3011):** (1) Message opens within viewport; (2) full
compose fits; (3) Send later / BOS Assist / Send visible; (4) only inner regions scroll; (5) Record
outcome enters a clean dedicated mode; (6) commands don't compete with outcomes; (7) outcome rows look
premium; (8) returning restores commands; (9) recent activity shows correct local time; (10) no reload;
(11) summary card unchanged; (12) Household/Children unchanged.

## 3. Generic form-delivery capability (`6ff2dbf34`)

Answers which-form / who-receives / what-it-relates-to / how-delivered, no entity-type branching.
New: `GET .../delivery-subjects`, `POST .../form-deliver`, `FormDeliverySurface`, interaction host
`form_delivery` on `send_form`. Reuses `executeCommunicationsSend` (records comms + activity + recompose),
`mintExistingRecordFormLinkForAdmin` (subjects in link metadata), `drawer-recipients`. **v1 limitation:**
targeting persisted via comms recipients + link metadata (not dedicated `form_delivery` tables — the "full
schema" option deferred). Link channel fully functional; email/SMS reuse the Message path (not
provider-verifiable in dev).

## 4. Remaining work / known limitations

- **Slice G — legacy workspace retirement: NOT STARTED.** `CurrentWorkWorkspace.tsx` still exists but is no
  longer mounted in the focused path. G retires it after a capability-parity check. Do it only after the
  polish is QA-accepted.
- **Pre-existing test drift:** `tests/adminV2/runtime + actions` = 81 failing tests / 34 files at the
  baseline (staging drift, not this work). `tests/presentation` also has ~7 pre-existing failing files
  (verified via stash — unrelated to these changes). Every slice validated by **delta vs a stashed
  baseline** (zero net-new), never absolute green. Typecheck (`npm run typecheck`) is clean.
- **"Move to Qualification"** is stale published-plan vocabulary; the referential-integrity filter drops it
  when the org's process stage inventory is current. If it persists, the org's `processStages` inventory is
  itself stale → a §9-bis config/plan re-seed (data, not code).
- **§9-bis config** (labels/vocabulary/terminal-enroll) still pending Product/config for final Enrollment QA.
- **QA tooling:** authenticated interaction QA is Kelly's localhost gate. Reproducible agent evidence needs a
  `alloy-agent-verify focused-spec` Playwright script that opens Wenc → What's Next → Message / Record
  outcome (not yet written).

## 5. How to run / QA

- Server: `alloy-dev-start wt1-alloy-phase-5-product-realization` (port 3011; 3-server limit — pause another slot if refused).
- Validate a change by delta: stash, run `npx vitest run tests/adminV2/runtime tests/adminV2/actions` for the baseline, pop, re-run, compare failing-file sets. Never expect absolute green.
- Do **not** push, merge, or begin runtime-performance work without Kelly's authorization.
