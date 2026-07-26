---
owner: platform
status: active
last_reviewed: 2026-07-26
supersedes: []
---

# Assignment Platform Phase 2 — Sprint handoff

**Verdict: not done.** Substantial code is in this branch; **operator browser acceptance is incomplete.** Do not treat this as ship-ready.

| Field | Value |
|-------|--------|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt5-assignment-platform-phase-2` |
| Branch | `agent/cursor/5-assignment-platform-phase-2` |
| Slot / port | 5 / **3015** (`http://localhost:3015`) |
| Provider | cursor |
| Push / PR | **Not authorized** — local commit only until Kelly accepts in browser |
| Handoff date | 2026-07-26 |

---

## Why work stalled (process)

Background multitask subagents repeatedly **hung mid-turn** (zero tool growth for many minutes / overnight). Parent coordination waited on completion pings; silent stalls looked like “still running.”

**Recovery rule for next session:** do **one slice at a time in the foreground chat** (or a single tight agent with a hard stop). Do not batch Gender + Types + Workspace + bulks into one background mission. Prefer `status` pulses only when needed; prefer finishing Slice N before starting N+1.

---

## What landed in code (unproven / partially proven)

### Identity / Gender (Slice 1 — code fix, **not browser-proven**)

**Reproduced earlier:** Children Context Facts → Gender edit → select **disabled** with only `Select…` (no Male/Female/etc.).

**Likely cause:** `useOptionSetSelectOptions` left `loading=true` when an in-flight fetch was cancelled (Strict Mode / remount), and Identity select was `disabled={busy \|\| choiceOptionsLoading}`.

**Fix committed in this handoff:**

- `web/lib/admin/hooks/useOptionSetSelectOptions.ts` — clear loading on cancel / `finally`
- `web/components/admin/focusPanel/identity/IdentityFieldValue.tsx` — disable select only while save `busy`; AlloySelect for gender
- `web/components/workspace/AlloySelect.tsx` — always include empty `Select…` option

**Still required:** live proof on 3015 — Wenc → Blake → Gender → pick → Save → value sticks on reopen. DB already has `person_gender` (female/male/not_specified) for orgs; edit control resolves `child.gender` → `person_gender`.

### Assignment Platform recovery (code from earlier agent; **not fully browser-proven**)

| Area | Code status | Browser status |
|------|-------------|----------------|
| Focus Panel card title **Assignments** | Done (`deriveOpportunityFocusPanelCards`) | Unverified this session |
| Condensed list/detail + timeline-on-list | Done (`AssignmentSummaryDetail`, SchedulingCard copy) | Unverified |
| Workspace **Add Assignment** modal → `assignment.create` | Done (`WorkspaceCreateAssignmentModal`) | Unverified (was no-op before) |
| Studio **Types** CRUD + API | Done (`assignment-types` routes, `AssignmentTypesStudioPanel`) | Unverified; may need migrations on connected DB |
| Roster bulk assign / room / primary / archive | Done (toolbar + actions) | Unverified |
| Program/Room gating when primary exists | Done (`assignmentProgramRoomGating`) | Unverified |
| Shared `AlloySelect` | Done (workspace + gender path) | Partial |
| Overview / Roster polish | Partial | Unverified |
| BOS above Workspace modals | Partial / unclear | Unverified |

### Docs / migrations present

- `assignment-platform-phase-2c-operator-workflow.md`
- `assignment-platform-settings-inventory.md`
- `assignment-platform-phase-2d-remaining.md` (older blockers; still relevant for migrations / Scheduling card layout)
- `supabase/migrations/20260725190000_operational_assignment_type_defaults_v1.sql`
- Playwright/scripts under `web/playwright/tests/assignment-phase2*.ts` and `web/scripts/assignment-phase2*.mjs`
- Prior cert folders: `docs/audits/active/assignment-phase2ca-browser-cert/`, `…/phase2cb-browser-cert/`

---

## Ordered resume checklist (one at a time)

1. **Gender Save** — browser-prove fix on 3015; add focused test if missing; screenshot.
2. **Rename / hierarchy** — confirm Focus Panel **Assignments** card + condensed plural/singular UX.
3. **Add Assignment** — every entry point (Focus list, Workspace header, Actions, Roster); create refreshes roster.
4. **Studio Types CRUD** — create type via UI; confirm type appears in create picker (apply migrations if API/schema fails).
5. **Bulk commands** — no “Planned”; preview/commit via action runtime.
6. **Program/Room gating** — after Primary Assignment, inquiry fields blocked / derived.
7. **AlloySelect + BOS-over-Workspace** — remaining raw selects; modal stacking.
8. **Overview dedupe + Roster** — row → detail; selection toolbar complete.
9. **Full screenshot pack +** `cd web && npm run typecheck` (+ focused tests).
10. Kelly browser acceptance → then push/PR only when authorized.

---

## How to resume quickly

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt5-assignment-platform-phase-2
alloy-root   # must be sanctioned / this worktree
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3015/   # expect 200; else alloy-dev-start for wt5
```

Start at **checklist item 1** only. Prefer North Campus site filter (All locations queue prep can flake).

Dismiss What’s Next overlay (`Return to work surface` / Close) before clicking Blake / Children — it has intercepted Focus Panel clicks.

---

## Validation note

Earlier agent reported focused unit tests + `npm run typecheck` green for the Types/create/gating slice. **Re-run typecheck after pull/resume before claiming done.** Gender path was not typecheck-gated in a final browser-pass session.

---

## Related docs

- Operator workflow: `assignment-platform-phase-2c-operator-workflow.md`
- Settings / Program-Room ownership: `assignment-platform-settings-inventory.md`
- Older remaining blockers: `assignment-platform-phase-2d-remaining.md`
- Planning index: `docs/platform/planning/README.md`
