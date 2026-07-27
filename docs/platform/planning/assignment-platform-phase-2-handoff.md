---
owner: platform
status: active
last_reviewed: 2026-07-27
supersedes: []
---

# Assignment Platform Phase 2 — Sprint handoff

**Verdict (2026-07-27):** Integration / contract slice **promoted** (avatar persist, summary display-only + zoom, Pattern Save, Workspace bootstrap, ensure-person). Broader Phase 2 operator checklist below is **not fully done** — continue in a new sprint after slot 5 close. Closeout: `docs/audits/active/assignment-integration-contract-qa/CLOSEOUT.md`.

| Field | Value |
|-------|--------|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt5-assignment-platform-phase-2` |
| Branch | `agent/cursor/5-assignment-platform-phase-2` |
| Slot / port | 5 / **3015** (`http://localhost:3015`) |
| Provider | cursor |
| Push / PR | **Authorized 2026-07-27** — merge to `staging`, then `alloy-sprint-finish 5` |
| Handoff date | 2026-07-26 · updated 2026-07-27 |

---

## Integration closeout (2026-07-27)

Landed and documented for this promotion:

1. **Canonical child profile photo** — Surfaces context facts upload/remove; `ensure-person` when `person_id` missing; Work Unit Children summary displays photo only (no upload).
2. **Avatar zoom** — click photo on `IdentityAvatar` opens dialog.
3. **Locations Pattern Save** — header Save; empty hours OK.
4. **Workspace bootstrap** — shared site fetch + stale-seq guard.
5. **Future sprint** — photo projection everywhere: `docs/sprints/archive/future/identity_profile_photo_projection_everywhere.md`.

**Migrations in this branch (apply on staging DB):** foundation, type defaults, `commitment_kind`, proposed consistency trigger (see CLOSEOUT).

---

## Why work stalled (process)

Background multitask subagents repeatedly **hung mid-turn** (zero tool growth for many minutes / overnight). Parent coordination waited on completion pings; silent stalls looked like “still running.”

**Recovery rule for next session:** do **one slice at a time in the foreground chat** (or a single tight agent with a hard stop). Do not batch Gender + Types + Workspace + bulks into one background mission. Prefer `status` pulses only when needed; prefer finishing Slice N before starting N+1.

---

## What landed in code (unproven / partially proven)

### Identity / Gender (Slice 1 — **browser-proven 2026-07-26**)

**Reproduced earlier:** Children Context Facts → Gender edit → select **disabled** with only `Select…` (no Male/Female/etc.).

**Causes (both fixed):**

1. `useOptionSetSelectOptions` left `loading=true` when an in-flight fetch was cancelled (Strict Mode / remount), and Identity select was `disabled={busy \|\| choiceOptionsLoading}`.
2. After PATCH succeeded, UI stayed `—` because `buildChildrenCardEvidence` read gender from mapped drawer rows (profile fields stripped). Now reads raw `_inquiry_children` via `personDrawerGenderDisplayLabel`.

**Fix files:**

- `web/lib/admin/hooks/useOptionSetSelectOptions.ts` — clear loading on cancel / `finally`
- `web/components/admin/focusPanel/identity/IdentityFieldValue.tsx` — disable select only while save `busy`; AlloySelect for gender
- `web/components/workspace/AlloySelect.tsx` — always include empty `Select…` option
- `web/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence.ts` — gender from raw inquiry rows
- `web/lib/adminV2/runtime/focusPanel/focusPanelMutation.ts` — `saveInquiryChild` merge uses `getTruth?.() ?? truth`

**Browser proof (3015):** Wenc → Blake → Gender → Male → Save → UI **Male**; API `gender: male`; cold reload still **Male**. Cert: `docs/audits/active/assignment-phase2-gender-save-cert/`.

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
- **Future (not this sprint):** profile photo projection everywhere — `docs/sprints/archive/future/identity_profile_photo_projection_everywhere.md`. Work Unit Children summary is display + zoom only; Surfaces → context facts owns upload/remove.

---

## Ordered resume checklist (one at a time)

1. ~~**Gender Save** — browser-prove fix on 3015; add focused test if missing; screenshot.~~ **DONE 2026-07-26**
2. ~~**Children summary alignment + inline save UX** — multi-child field columns align; Gender options sync-fallback (instant); `✓ Saved` flash after inline commit.~~ **DONE 2026-07-26** (browser: Blake/Jarek Gender `left` delta **0**; options ready **0ms**; save flash **✓ Saved**)
3. ~~**Rename / hierarchy** — Focus Panel **Assignments** card Visible on enrollment (default + promote Linked→Visible at composition).~~ **DONE 2026-07-26** (Wenc Focus Panel shows Assignments beside Children)
4. **Add Assignment** — every entry point (Focus list, Workspace header, Actions, Roster); create refreshes roster. *(Workspace empty state clarified: needs enrollment agreement at site.)*
5. **Studio Types CRUD** — create type via UI; confirm type appears in create picker (apply migrations if API/schema fails).
   - **2026-07-26:** Studio → Types → Create form works; Save fails with `could not find the table 'public.operational_assignment_types' in the schema cache`. Apply `supabase/migrations/20260725030801_operational_assignment_foundation_v1.sql` then `20260725190000_operational_assignment_type_defaults_v1.sql` to the connected DB, then re-prove.
6. **Bulk commands** — no “Planned”; preview/commit via action runtime.
7. **Program/Room gating** — after Primary Assignment, inquiry fields blocked / derived. *(ChildFocusEdit now passes `hasCommittedPrimaryAssignment`.)*
8. **AlloySelect + BOS-over-Workspace** — remaining raw selects; modal stacking. *(Workspace BOS modal z-index raised above BOS rail.)*
9. **Overview dedupe + Roster** — Overview attention/activity no longer duplicates launch KPIs; roster row opens assignment detail panel.
10. **Full screenshot pack +** `cd web && npm run typecheck` (+ focused tests).
11. ~~Kelly browser acceptance → then push/PR only when authorized.~~ **Promotion authorized 2026-07-27** (integration slice); remaining checklist continues in a new sprint after `alloy-sprint-finish 5`.

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
