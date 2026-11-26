# Both authoring gaps closed — the repairs themselves are yours

**Run:** `erun_3609528c35a0bf00` · Tenant untouched · Not published · **Browser proof owed**

## 1. Per-child path authoring — built

**Action** on the existing canonical route: `set_work_template_participant_decisions`
`{ process_id, stage_key, template_key, decisions[] }`.

It resolves process → stage → template (404 on each), replaces that template's set intentionally
(row-merging would make removal inexpressible), delegates to the canonical `parseParticipantDecision`
— now exported rather than reimplemented, so there is one definition of what a decision is — refuses
a partial write if any row is unreadable, refuses duplicate keys the parser would silently drop, and
saves through the one draft owner. No second store, no alternate execution path.

**Control:** *"Per-child paths"* in the stage's Operator work section, next to its ways out. Copy says
what it does: *"…move one child at a time onto their own track — so one child can go to Enrolling
while a sibling goes to Waitlist, and the family stays where it is."* It renders **only on a
family-grain stage** and offers **only child-grain destinations** — a path onto a family stage is
precisely what the validator refuses, and offering one would author a known error. The runtime term
`participant_decisions` never appears in operator copy.

### A requirement building it surfaced

A decision must carry **exactly one** `update_child_enrollment_status` target. My first draft omitted
it and the canonical parser correctly returned `null` — which is how I found it. The parser's own
reason: *a participant decision IS the child's path, so it names the state that path lands in, once;*
zero leaves the regression guard nothing to compare against, two makes the decision ambiguous.

So the operator picks **the destination and the resulting status** — the second is not inferable from
the first. Statuses come from the configured vocabulary (Status & State owns them), and where none
are configured the control says so rather than rendering something that cannot produce a valid path.

## 2. Absent command selection — fixed at the shared owner

Three states, now consistent across **both** readers:

| State | Meaning | Selector | Validator |
|---|---|---|---|
| **absent** | no restriction authored | permits | skips |
| **`[]`** | operator deliberately selected none | denies | reports orphans |
| **populated** | only what was named | permits only those | passes |

Absence used to fall through to a migration that returns empty in a tenant with no stage action
catalogs, so *"nobody has chosen yet"* denied everything and the pickers rendered empty with nothing
actually wrong. The guard even contradicted itself — a null **process** was unrestricted while a
process with **no selection** was not.

A legacy process whose stage catalogs *do* name commands still restricts, because that is a real
selection. Nothing is auto-populated and no command is invented.

**Verified on the real process:** `quick_message`, `schedule_tour`, `send_form`, `send_confirmation`,
`reschedule` all went `false → true`.

**Reported separately as instructed:** `send_form` and `send_enrollment_packet` declare
`supportedSubjects: ["opportunity"]` while `enrolling` is child-grain. If they remain unavailable
there, that is the registered subject rule doing its job — **not widened to fill a picker.**

## 3. What I did not do, and why

§2 (six cross-grain repairs), §4 (three Close as Lost statuses), §6 (entry point) and §8 (browser
proof) are **operator actions in the product**. This lane has no session. Both surfaces they need now
exist:

* per-child paths — built this run;
* the outcome/status editor — already existed.

## 4. Certified paperwork — unchanged

Read from the tenant: **5** requirements on `enrolling`, certified order, every one
`form/required/record/stage_exit/blocking`, **no** Direct Payment Authorization, **no** packet id, no
other stage carries requirements, 8 stages (4 family / 4 child), description intact,
`entry_points_v1` still `null`.

Truthfulness boundary unchanged: **configured blocking; transition enforcement does not consume Form
requirements yet.**

## 5. Answers

| | |
|---|---|
| Participant-decision action/control | ✅ built — action + "Per-child paths" control |
| Six cross-grain repairs | **Not performed** — operator action; surface now exists |
| Command-selection fix + selector proof | ✅ fixed; 5/5 capabilities `false → true` on the real process |
| Three status repairs | **Not performed** — operator action; surface already existed |
| Five requirements | ✅ intact |
| Entry point | Not authored — §6 requires zero errors first |
| Final validation count | **9** (3 status + 6 grain) — unchanged; both are now repairable |
| Browser acceptance | **Not performed** — no session |
| Semantic tenant diff | **None from me** |
| **READY TO PUBLISH** | **NO** |

## 6. Your remaining path

1. **Placement / Decision → Operator work → Per-child paths** — add *Move child to Enrolling* and
   *Move child to Waitlist*, each with its resulting child status. Same on **Tour** for its Waitlist
   path. Then remove the six invalid cross-grain transitions/outcome movements they replace.
2. **Lead / Tour / Decision → Close as Lost** — repoint status from `closed` to **`lost`**.
3. **Begin new enrollments in Enrolling.**
4. **Validate** → expect **0**. If not, stop and tell me the remaining codes rather than chasing them.
5. Then Publish is the next authorization.
