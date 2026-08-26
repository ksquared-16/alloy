# BP builder convergence — what shipped, what I found, what I could not do

**Run:** `erun_9fb11d33eb357fcd` · Tenant untouched · **Browser acceptance NOT performed**

## 0. The honest headline first

§1, §6, §7 and §8 all require a signed-in browser against the certification tenant. This lane has
proven four times it cannot obtain a session — manual login only, the rotated credential is not held
here, and a credential-free mint was refused by the sandbox. **So this run is not complete as
specified, and I am not reporting a screenshot, a reproduction of your selector failure, or a
browser-authored packet selection.** Everything below is what I could establish without one, plus a
precise account of what remains.

## 1. Stage navigation — All view shipped

The rail now offers **All · Family Track · Child Track**, All first. All lists the process in
canonical order and reads **“8 stages in the whole process”**; the tracks read “4 stages in Family
Track” / “4 stages in Child Track”. Rail and Overview reconcile on screen instead of contradicting
each other.

Switching writes nothing (the handler is asserted to contain no `fetch` and no `action`), selection
moves with the filter, and a refresh no longer pushes an operator viewing All back into the first
track. Track labels come from configuration.

**Not browser-proven.** Verified against the live draft's real payload: two tracks, Overview 8,
Family 4 = lead/tour/decision/closed, Child 4 = waitlist/**enrolling**/enrolled/closed_withdrawn.

## 2. Visual language — my drift, corrected

Both controls I added used `bg-alloy-midnight`, a dark/navy fill. `configurationRuntime.css` states
the doctrine outright: *“selected state uses Alloy pine — never blue/slate admin”*. Selected track is
now pine; buttons use the existing `config-primary-btn` / `config-secondary-btn`. No literal colors,
no BP-specific palette.

## 3. Paperwork, said the way a director says it

Primary surface is now:

```
Enrollment paperwork
5 forms required
Oregon Certificate of Immunization Status · Oregon Nonmedical Exemption · +3 more
[ Change paperwork ]
```

Choosing a **Studio Packet** compiles its ordered Forms into canonical `kind: form` requirements
**once**; choosing a single Form authors one. `StageFormRequirementsEditor` is demoted to
**“Advanced · individual requirements.”**

**The invariant, asserted structurally rather than promised.** The compile's risk is not that it
fails — it is that it succeeds and quietly becomes a subscription. So: compiled rows carry exactly
seven keys and **no packet identifier**, and the card is asserted to contain no `packet_id`. There is
nothing for a later Studio edit to reach through, and `requirementDerivedPacket` still derives runtime
execution from BP.

**A cost I chose deliberately, and you may overrule.** The packet's *name* is not shown after
choosing it, because BP does not store it — storing it is the live link the doctrine forbids, and a
stale label would lie about what a family is actually asked for. So the stage shows the forms it will
require. If you want provenance visible, that is a contract change (a metadata field on the
requirement), and it should be your call, not mine.

**Compile proven against the certified packet's real five items:** same five, certified order,
accepted by the canonical action with no row dropped, stable identities on recompile, duplicates
collapsed.

## 4. 🛑 Ways out — the target grammar does not exist

I read the live `enrolling` stage rather than assuming. Its real configuration:

| | |
|---|---|
| purpose | *“Complete enrollment paperwork after the family decides to enroll.”* |
| outcomes | `packet_sent` “Packet sent” (completes work) · `packet_pending` “Packet still pending” |
| outgoing transitions | **`[]` — none configured** |
| work template | **“Send Enrollment Packet”** — primary, required, `execution_mode: direct_action`, `primary_action: send_form`, due +1 day |
| attention rules | `[]` · outcome rule `packet_attention` fires on `packet_pending` |

So **Enroll / Move to Waitlist / Close-Lost do not exist** on this stage. There are no transitions at
all. I have not invented them.

Also worth correcting myself: I previously said no send-forms concept existed. It exists — as a stage
**work template** (`send_enrollment_packet`) whose action is the registered `send_form` capability. I
had only grepped the command spine. The operator work concept you were reaching for is already here,
and “Enrollment paperwork” belongs beside it.

## 5. Completion vs approval — both exist, the gate does not

* **Complete** is modelled: a requirement is `satisfied` on Forms-owned evidence
  (`form_submissions.status = 'submitted'`). Statuses are `satisfied | outstanding | unrealized |
  unsupported`. Five satisfied of five = paperwork complete.
* **Approval is separately modelled** — `PacketReviewRollupV1.review.status`:
  `needs_review | approved | rejected | needs_correction`, with `reviewed_at` and
  `reviewed_by_user_id`. It lives at **packet-session review** grain, not requirement grain.

**The narrow gap, and I am stopping at it:** `StageCompletionOutcomeV1` has no availability condition
— only `outcome_key`, `label`, `work_template_key`, `successful`/`completes_work` — and
`StageOutgoingTransitionV1.available` is a static boolean, not a computed one. **Nothing today can
make an outcome available only once paperwork is complete and approved.** Expressing “Enroll —
available when enrollment paperwork is complete and approved” requires a new conditional-availability
concept. I have not built one.

## 6. Command / action selectors — diagnosed, not reproduced

I cannot reproduce your click without a browser. What the data says:

* The selector is fed `stageRecord.action_catalog_v1` — and **no stage in this tenant has one**. All
  eight are absent.
* The org *does* have `action_definitions` and **60 `action_placements`**, so the registry is not
  empty.
* `send_form` and `send_enrollment_packet` are registered but declare
  `supportedSubjects: ["opportunity"]`, while `enrolling` is **child** grain. Options are filtered on
  a `supported` flag.

**Most likely: B — missing configured actions**, specifically an absent per-stage `action_catalog_v1`,
possibly compounded by subject/grain filtering that would leave a child-grain stage with no supported
options. Distinguishing “the list is empty” from “selection does not persist” needs the browser, and
I will not classify it further than the evidence carries.

## 7. Certification configuration — not performed

I did not author the five requirements: §7 requires doing it *through the new surface*, which needs
the browser. The compile is proven to produce exactly those five; the authoring click is yours.

Entry intent remains `enrollment_start → enrolling`. Nothing published.

## 8. Remaining blockers to Publish

1. **An operator session** — the single blocker for authoring, publishing, and every browser proof.
2. **Your call on §4/§5**: the Ways-out grammar in the prompt does not exist, and conditional outcome
   availability is a genuine gap. Neither blocks publishing the five requirements and the entry point.

## 9. Certification evidence — unchanged

Five executable Forms · Studio Packet `579327c1` · derived-packet proof (5 forms, same order, same
identities, 3 uploads, 5 signatures, **0** bank-credential asks, zero drift) · entry intent ·
Participant Runtime · Financials deferral · the `description` repair · the two canonical actions.

Tenant untouched: draft `fa0b9c36` · `draft_revision` 1 · revisions **0** · instances **0** ·
`entry_points_v1` null · `requirements_v1` absent on all 8 stages.
