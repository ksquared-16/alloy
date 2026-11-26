# 4 stages vs 8 — and where Enrollment paperwork belongs

**Run:** `erun_eea8a3f04bb664a2` · **Investigation only. Nothing mutated.**

You stopped in the right place. The answer is not a patch-around: one of the two numbers is a view
that silently shows a subset, and the stage you were sent to is genuinely unreachable.

## 1. The discrepancy — **B (track filtering) exposed by D (a missing control)**

There is **one** stage authority and **one** stage set. `lifecycle_builder_v1` holds eight active
stages across two tracks. Nothing disagrees about what exists.

What differs is how two views read it:

| Reader | Function | Result |
|---|---|---|
| Overview count · Journey | `activeStagesForProcess(process)` — active, **no track filter** | **8** ✅ |
| Stages editor left rail | `stagesForTrack(process, activeTrackKey)` — active **and** `track_key === activeTrackKey` | **4** |

`LifecycleActivationBoard.tsx:185` declares `activeTrackKey` defaulting to `ENROLLMENT_TRACK_FAMILY_KEY`.
The identifier appears exactly **three** times in the file: that declaration, the memo that filters
the rail, and a load-path reset that keeps the current track if valid and otherwise falls to
`tracks.tracks[0]` — which is `family_track`, sort_order 0.

**No control anywhere renders a track switcher.** So the rail is permanently pinned to the family
track, and the four child-track stages — including `enrolling` — cannot be selected in the product at
all. "4 configured" is a truthful count of a subset that never says it is one.

So: **not** two competing definitions. One definition, one silently-scoped view, and no way to change
its scope.

| Stage | Owner | Grain | Track | Overview | Journey | Stage editor | Why |
|---|---|---|---|---|---|---|---|
| New Lead | `lifecycle_builder_v1` | family | family_track | ✅ | ✅ | ✅ | default track |
| Tour | " | family | family_track | ✅ | ✅ | ✅ | default track |
| Placement / Decision | " | family | family_track | ✅ | ✅ | ✅ | default track |
| Closed | " | family | family_track | ✅ | ✅ | ✅ | default track |
| Waitlist | " | child | child_track | ✅ | ✅ | ❌ | filtered out; no switcher |
| **Enrolling** | " | child | child_track | ✅ | ✅ | ❌ | **filtered out; no switcher** |
| Enrolled | " | child | child_track | ✅ | ✅ | ❌ | filtered out; no switcher |
| Closed / Withdrawn | " | child | child_track | ✅ | ✅ | ❌ | filtered out; no switcher |

Not A (grain is a stage property, not the filter), not C (single authority), not E (the draft is
current and correct). **B is the model; D is the bug.**

## 2. Start Enrollment already launches the paperwork — this is settled, not open

`startEnrollmentService` says it in its own header: **"B1: STARTING ALSO REALIZES THE PARTICIPANT
OBJECTIVE."** It creates the process instance and then calls `launchParticipantEnrollment`, which
derives the packet from the governing revision's Form requirements, mints the access link and creates
the session. The realization is *additive and never fatal*: a tenant with no Form requirements still
gets a legitimately started journey, and `participantLaunch` returns a named code
(`no_governing_revision`, `no_effective_stage`, `no_form_requirements`) instead of throwing — because
refusing a lifecycle transaction over a Forms precondition would be the wrong authority enforcing it.

**Answer to §5: A, and the platform already decided it.** Not a product question.

The command catalog holds `create_lead`, `confirm_tour`, `send_tour_invitation`, `schedule.create`,
`assignment.*`, `staff.add`, `child.add`, `enrollment.start`, `enrollment.direct`, `employment.*`,
`staff_presence.*`. There is **no** send-forms / send-packet / share-link command, and there should
not be one: it would be a second way to realize participant work alongside the one that already runs.
(`send_tour_invitation` is the nearest shape and is a *communication*, not a work realization.)

So the operator flow you sketched is already true minus one step:

```
configure what Enrollment requires → Start Enrollment → link + session exist automatically
```

There is no "Send enrollment forms" step to build.

## 3. Should a director author five requirement rows?

**No — not as the normal experience, and doctrine already allows the better one.** A friendly surface
compiling an operator's selection into `requirements_v1` keeps BP canonical and adds no authority.
The right operator sentence is *"Enrollment paperwork — 5 forms required · Change paperwork"*, with
the rows available underneath for a director who asks for them.

Nobody should have to know `scope=record` or `timing=stage_exit` to say which paperwork a family
completes.

## 4. Packet → requirements is the missing bridge, and it is legitimate

**No such bridge exists today** — the only relationship in the codebase runs the other way
(`requirementDerivedPacket`: requirements → packet).

Adding one is consistent with the doctrine as written: the director picks *School of Enrichment —
Enrollment Packet*, Alloy compiles its five pinned Form identities into five `kind: form`
requirements, the Packet stays non-authoritative and BP stays authoritative. It removes the genuinely
silly step of hand-rebuilding in BP what was just approved in Studio.

Two things it must not become: the Packet must not start *feeding* requirements at runtime (that
would make it authority), and the compile must be a one-time authoring act the operator can see and
edit afterwards — not a live link.

**Recommended, not implemented.**

## 5. What happens to `StageFormRequirementsEditor`

**Keep it, unchanged, as the advanced surface.** Its placement is correct — BP owns requirements,
requirements live on a stage, and the section it sits in is the stage's Requirements section. It is
not the wrong control; it is a correct control on a stage the product cannot currently open.

The compact paperwork surface from §3/§4 should sit **above** it and compile into the same actions.

## 6. The narrowest next implementation

**Render a track switcher on the stage rail.** One component, no new authority, no schema, no new
action: `activeTrackKey` state and the filter already exist and the setter is already written — the
only missing piece is a control bound to it. That alone makes `enrolling` reachable and unblocks the
certification through the product.

Everything else in §3/§4 is a follow-on slice, and I would do it after the certification publishes
rather than before.

## 7. Nothing certified is invalidated

This is a configuration-surface defect. It touches no evidence:

five executable Forms · Studio Packet `579327c1` · the requirement-derived packet proof (5 forms,
same order, same identities, 3 uploads, 5 signatures, **0** bank-credential asks, zero drift) · entry
intent `enrollment_start` · Participant Runtime · the Financials deferral · the `description`
round-trip repair · the two canonical authoring actions and their 20 controls.

All still stand. The importer is not reopened.

## 8. One correction to my own last handoff

My click-path said "Enrollment process → the Enrolling stage." That step was not reachable, and I did
not verify it in a browser before writing it — the same gap I have flagged twice as still owed.
Source reading told me the editor rendered stages; it did not tell me the rail was pinned to one
track.
