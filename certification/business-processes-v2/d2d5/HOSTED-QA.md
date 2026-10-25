# BP V2 D2/D5: hosted proof in QA Shared

| | |
|---|---|
| Deployed build | `1e4bc8877060` (PR #1581 squash; `/api/build-info` at 13:49:39Z) |
| QA run | `qar_b2161550fd2b`, plan `bp_v2` (opened `gar_551660575c5658`, closed `gar_d5ac186f5a8850`) → **QUIESCED_RETAINED**, `access_clean: true` |
| Residue census | `gar_001c6d9e918adc` (14:03Z, after the 14:01Z close), **13/13**; bound by `gar_8da40f2f6226a5` |

## 1. QA Shared configuration (`configure.json`)

The template cannot be re-applied to a process that already has stages. So QA Shared received the template's D2/D5 correction through the supported builder paths, exactly as an operator would:
- `stage-runtime-config` on Tour drops the three helpers no capability executes.
- `stage-runtime-config` on Decision adds the per-child paths Begin Enrolling / Waitlist / Not Enrolling, `requires_all_participants_resolved`, and Family Enrolling → `no_movement`.
- `update_process_command_set` selects the per-child capabilities plus every command the stages reference.

Each step returned 200. Validate: **0 errors**. Published **revision 3** (`59ba9904…`). Firefly was not touched.

## 2. Two-child family (`family.json`, product commands only)

- **Lead:** Create Lead at QA North (Ava).
- **Second child:** `child.add` Ben, then joined to the case (`opportunity-customer-members`).
- **Progression:** Lead → Tour → Decision through the stage work's own outcomes (Contact Family `interested`, Conduct Tour `tour_completed`).

## 3. Browser walkthrough (admin; `walk.json`, screenshots)

| Step (existing Current Work surface) | Result |
|---|---|
| Open Support Enrollment Decision | "0 of 2 children decided". Ava and Ben each "No path chosen yet", each with **Begin Enrolling / Waitlist / Not Enrolling**; family outcomes below (`walk-1`) |
| Select **Family Enrolling** → Confirm outcome | `complete-stage-work` **400**. The panel shows *"Support Enrollment Decision" cannot be completed yet — 0 of 2 children decided. Choose a path for each child first.* The work stays open, with no success state (`walk-2`) |
| Ava → **Waitlist** | `participant-decisions` 200, `changed: true`, "1 of 2 children decided". The still-selected family outcome was refused again, truthfully ("1 of 2…") (`walk-3`) |
| Ben → **Begin Enrolling** | 200, "All children have a path". The family outcome was then accepted (200): "Family Enrolling ✓ This work item is complete"; header "Waitlist · Enrolling" (`walk-4`) |
| Work items | Support Enrollment Decision **completed** (family). **Send Enrollment Packet** open for Ben. **Review waitlist position** open for Ava |
| Registration view | **Ben only** (Enrolling · Enrolling) (`view-registration`) |
| Waitlist view | **Ava only** (waitlisted · Waitlist) (`view-waitlist`) |
| Decision view | The family is no longer listed. This is existing Effective Process Position semantics: every participant has left Decision, while the case's `stage_key` stays `decision` (`workViewEffectiveProcessPositionMembership.test.ts`; locally measured `opportunities.stage_key = decision`) |
| Ben's record from Registration | Focus Panel opens on Enrolling, "Send the enrollment packet" (`walk-6`) |

## 4. Quiescence and close

- The two open child work items were completed through the product (`quiescence.json`).
- The run-tagged family and children are retained, and so is QA Shared revision 3 (intended configuration).
- The census is 13/13: pool access, zero sent, org present, and 10 financial checks, with no financial activity in this run.
