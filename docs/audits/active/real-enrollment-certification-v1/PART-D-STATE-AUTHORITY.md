# Part D — the two Pathb states, and why no child can reach Enrolling

**Recorded:** 2026-09-16, lane `lane_2cea84351d90`, published revision **33**, current branch.

## 1. State authority table

| Concept | Authoritative owner | Pathb value | Meaning | Correct? |
|---|---|---|---|---|
| Enrollment disposition | `outcome_status_key` on the opportunity child member | `enrolling` | The operator's **decision** about this child | Legitimate axis |
| Business Process stage membership | `process_instances.stage_key` | **null** | Where the child is **worked** | Missing |
| Family/case stage | case work unit | `lead` (`lifecycle_wu_lead`) | Where the family case is | Correct |
| Child chip + rail placement | `resolveChildProcessStageLabel` / `…StageKey` | `Enrolling`, via disposition | **Presentation-only compatibility bridge** | Correct-as-designed |
| Records enrollment state | `childEnrollmentState` (agreements + PI state) | — | A third, separate vocabulary | Separate axis |
| Child operational context | `buildSubjectContexts` | no work unit, no work view | Unreachable | Blocked by the null stage |

`childEnrollmentProcessStageLabel.ts` says it outright: the resolution chain is *stage_key → disposition
mapping → family stage*, it is **"presentation-only: it never mutates"**, and the disposition mapping is
**"a compatibility bridge until every surface reads `stage_key` directly"**. `DISPOSITION_TO_STAGE_KEY`
maps `enrolling → enrolling`.

So the chip and the rail are telling the truth about the **disposition** axis. There is no stage
membership behind them. That is also why `queue_membership_v1` for Enrolling
(`included_disposition_keys: ["qualified"]`) does not contain Pathb, and why his Enrollment context
resolves with neither a work unit nor a work view.

**PATHB STATE: STALE_QA_DATA.** A disposition set without the journey entry the current design
produces. Not a legitimate Enrolling specimen, and not something to patch into one.

## 2. The intended entry into Enrolling — and why it is closed

The route is configured and correct on paper. Decision-stage work declares outcome
**`family_enrolling` ("Family Enrolling")**, whose rule `family_enrolling_move` targets
`no_movement` for the family plus **`enter_child_enrollment`** at child grain. No stage is named
there on purpose — the child entry stage comes from the tenant's own
`entry_points_v1.by_intent.enrollment_start`, which on revision 33 is **`"enrolling"`**. Start
Enrollment and a family decision therefore land on one stage by construction.

Driving it in the browser on the disposable QA family, the platform refused:

> **This Work View can't be shown until its configuration is fixed.**
> *stage "decision" offers no reachable primary action — the answer will not claim operational on identity alone*

**ENTRY INTO ENROLLING THROUGH PRODUCT: FAIL.** Not a data problem — Decision cannot be worked.

## 3. The gap is systemic, not one stage

| stage | grain | `candidate_actions` | work templates |
|---|---|---:|---|
| lead | family | 1 | `contact_family`* |
| tour | family | **0** | `work_1`, `work_2`, `work_3`* |
| decision | family | **0** | `review_child_paths` |
| waitlist | child | 1 | `review_waitlist_position`*, `offer_spot` |
| **enrolling** | **child** | **0** | **`send_enrollment_packet`\***, `confirm_start_date` |
| enrolled | child | 0 | — |

The work is fully authored everywhere. The **action bindings are missing on four of six stages**.
Enrolling already declares `send_enrollment_packet` as its **primary, required** work with a 1-day
due policy — the Current Work Kelly wants exists in configuration; nothing can start it.

## 4. The change that would open Enrolling

Working example, from `waitlist`:

```json
{ "action_key": "stage_work.start", "recommendation": "ready", "work_template_key": "offer_spot" }
```

So the minimal, authorized Enrolling delta is exactly one key —
`processes[enrollment].stages[enrolling].action_catalog_v1.candidate_actions`:

```json
[ { "action_key": "enrollment.start",
    "recommendation": "ready",
    "work_template_key": "send_enrollment_packet",
    "override_label": "Send enrollment paperwork" } ]
```

`enrollment.start` takes the durable child as its subject and the Enrolling stage is child-grain, so
the subject axes already agree. No new launcher, no packet picker: `enrollment.start` resolves the
published configuration, the entry point and the required packet itself.

**It was NOT published.** Two reasons, both about being able to tell whether it worked:

1. Sections 9–11 require browser proof from a real Enrolling child. No child can reach Enrolling
   while Decision offers no reachable action, so the revision's effect could not be observed.
2. Making it observable requires ALSO binding a Decision action — a delta this slice explicitly
   forbids riding along ("no unrelated delta").

Publishing an unobservable revision to a live process to enable an action that still cannot deliver
is not finishing the slice; it moves the unverified part into production configuration.

## 5. Delivery is still absent, and has a precedent to copy

`sendTourInvitationAction` is the canonical Communications shape, and it is **not** "the action sends
an SMS". It runs `prepare` → the operator confirms in Communications compose → `mark_sent` records
activation, with the public origin resolved from the one canonical authority rather than the request.
The Enrollment equivalent is a real build of that same shape and does not belong inside
`startEnrollmentService`, which correctly reports a launch and says in its own contract that
*"the journey started and there is nothing to send yet"* is a legitimate outcome.

## 6. What Part D needs, in order

1. A Decision-stage action binding, so `family_enrolling` becomes reachable and a child can enter Enrolling.
2. The Enrolling binding above.
3. An `enrollment.send_paperwork` action on the tour-invitation pattern, so the operator verb is *Send*.
4. Then the browser proof, then the rewrite.

Part D was not rewritten: with no reachable Decision action and no deliverable Send, the guide would
describe a flow no operator can perform.
