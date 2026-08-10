---
owner: product
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Enrollment Realization Specification

> ⚠️ **VOCABULARY CORRECTED — read first.** This document's stage-by-stage walk used **deprecated/granular stage keys**
> (`new_lead`, `contacting`, `tour_scheduled`, `offered_spot`, `future_start`) and **invented terms** ("Enrollment
> Offer", "Extend Offer", "Assign Room", "Assign Schedule", "Enroll Child", a Documents/Medical/Placement/Funding
> checklist) that are **not** the current configured operator-facing labels. The authoritative configured vocabulary,
> the stage set Firefly had configured AT THE TIME (New Lead · Tour · Placement / Decision · Closed ·
> Waitlist · Enrolling · Enrolled · Closed / Withdrawn — an example, never canonical: stages are configured per process
> and per tenant, and the two Closed stages have since been removed), and every gap are derived in
> [phase-5-enrollment-vocabulary-derivation.md](phase-5-enrollment-vocabulary-derivation.md). The corrected mockups are
> [phase-5-enrollment-realization-mockups.html](phase-5-enrollment-realization-mockups.html). **The composition
> conclusions below stand; the stage words and colors were wrong — use the derivation for language.**

**Mission:** `alloy-phase-5-product-realization` (slot 1) · **Baseline:** `origin/staging @ 2129149e9`
**Stance:** Product Office, freezing the real Enrollment experience — the product Alloy intends to ship, optimized for
what Alloy should be in five years, not for today's easiest implementation. Grounded in the actual stage operating
plans (`web/lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts`). Companion artifact: full-journey Focus Panel
mockups. No code.

**The operator:** a **Center Director** who works enrollment all day — many families, many children, many parents —
moving leads to tours to offers to enrolled children. The whole day must feel like **one continuous operational
experience**, never a set of disconnected screens.

**The spine (the fact that governs everything):** Enrollment is **family-grain until the decision, child-grain after
it.** New Lead → Contacting → Tour Scheduled → Tour Complete → Decision are the *household's* journey — all children
ride the family case together. At **Decision**, the case **splits**: each child gets its own track — Offer → Enrolling
→ Ready to Enroll → Enrolled — and can sit at a different point than a sibling. Operator Work, Household, and Children
compose differently on each side of that split. Everything below turns on it.

---

## Deliverable 1 — The Entire Enrollment Journey

Every stage, mapped to its real stage key, with the seven required facets. The **Rivera household** is the running
example. Grain is called out because it determines who owns what.

### Stage 1 · New Lead — `new_lead` *(family grain)*
- **Operator Work owns:** the single obligation *"Review this new inquiry — is it real, and who is it?"* One work item
  (`review_new_inquiry`), same-day due. This is the operator's orientation, not yet outreach.
- **Household contributes:** the raw inquiry identity — who submitted, phone/email, how they found the center. Read-only
  reference; the operator confirms it's a real family.
- **Children contributes:** the child(ren) named on the inquiry, as inquiry rows (age, desired start). Not yet
  individual tracks — they ride the family case.
- **Commands:** *Contact Family* (jump straight to outreach), *Schedule Tour* (if they're already hot).
- **Outcomes:** `ready_to_contact` (→ Contacting).
- **After completion:** the case moves to **Contacting**; the review item settles.
- **Immediately sees next:** the first contact obligation, now primary. No blank beat between "reviewed" and "what now."

### Stage 2 · Contacting — `contacting` *(family grain)*
- **Operator Work owns:** *"Reach the Rivera family."* Up to three attempt obligations (`contact_attempt_1/2/3`), the
  active one primary, each a real attempt with a declared result. This is the loop the director lives in.
- **Household contributes:** the phone/email to reach, and *ownership of fixing a bad number* — a `bad_number` outcome
  hands the operator to Household to correct contact info.
- **Children contributes:** context only (which child the family is asking about) — no child work yet.
- **Commands:** *Contact Family* (the primary — a call/text/email through the one Command Runtime), *Schedule Tour*,
  *Send Form* (helpful).
- **Outcomes:** `reached_family` (→ next), `left_voicemail`, `sent_text`, `no_answer`, `bad_number` (→ Household
  attention), `not_interested` (→ closed).
- **After completion:** *Reached* advances the case toward the tour; *Left voicemail / no answer* **holds the stage** and
  the card says so calmly ("Attempt 1 of 3 — try again tomorrow"); three no-answers or seven quiet days raise attention.
- **Immediately sees next:** either the tour-scheduling obligation (on Reached) or the next attempt, dated — never a
  dead "left message" with no next move.

### Stage 3 · Tour Scheduled — `tour_scheduled` *(family grain)*
- **Operator Work owns:** *"The tour is on the calendar — keep it alive."* This stage has **no active work template** by
  design — confirmation and reminders are automated comms. Operator Work's job is **awareness**, not busywork: it shows
  the booked tour as context and offers the moves if plans change.
- **Household contributes:** the family being toured; the contact for confirmation.
- **Children contributes:** the child(ren) who'll attend.
- **Commands:** *Confirm Tour* (registered), *Reschedule*, *Cancel Tour*.
- **Outcomes:** `tour_confirmed` (settles), `reschedule` (holds), `cancelled` (→ attention, follow-up).
- **After completion:** a confirmed tour settles; a cancel raises a follow-up obligation (the Cancel-Tour pattern —
  config-driven, not code).
- **Immediately sees next:** if nothing needs doing, the **calm waiting state** — "Tour Tue 10:00, confirmed; nothing to
  do until then." The card names the wait; it doesn't fake work.

### Stage 4 · Tour Complete — `tour_completed` *(family grain)*
- **Operator Work owns:** *"Record what happened on the tour."* One `record_tour_outcome_work` obligation, `outcome_led`
  — the operator **reports the tour result**; the system decides the move.
- **Household contributes:** unchanged reference.
- **Children contributes:** unchanged reference (still one family case).
- **Commands:** *Record Tour Outcome* (the outcome declaration itself), *Quick message* (helpful follow-up).
- **Outcomes:** `tour_completed` (→ Decision), `no_show` (→ follow-up attention), `not_interested` (→ closed).
- **After completion:** *Tour completed* moves the case to **Decision** and collapses case status to `open`; the item
  settles with its outcome.
- **Immediately sees next:** the decision obligation — "help the Riveras choose a path for each child."

### Stage 5 · Decision — `decision_pending` *(family grain → splits to child)*
- **Operator Work owns:** *"Land the enrollment decision — per child."* One `follow_up_decision` obligation. **This is
  the pivot:** its outcome is declared **per child**, and declaring it **fans the family into child tracks.**
- **Household contributes:** the shared decision-makers (both parents), and the single point where the operator confirms
  the family is committing.
- **Children contributes:** **now becomes load-bearing.** Each child's desired disposition is chosen here; the Children
  card is where the per-child path (enrolling / waitlist / declined) becomes real.
- **Commands:** *Contact Family* / *Send Form* (helpful); the decision is an outcome declaration per child.
- **Outcomes (per child):** `enrolling` (→ Enrolling track), `waitlist` (→ Waitlist), `declined` (→ Withdrawn).
- **After completion:** each child gets an individual enrollment status and moves to its own stage. **The family case
  gives way to child tracks.** From here, Operator Work shows **child-named work.**
- **Immediately sees next:** the first child-grain obligation — e.g. "Send enrollment packet — Mia" — with the child
  named in the work.

### Stage 6 · Enrollment Offer — `offered_spot` *(child grain; via Waitlist)*
- **Operator Work owns:** *"Confirm the family's response to the spot we offered [Child]."* One `confirm_offer_response`
  obligation, per child. (Reached when a spot opens for a waitlisted child.)
- **Household contributes:** the contact to confirm with; billing/funding owner (referenced, not owned here).
- **Children contributes:** **the named child** whose spot this is, and their disposition (`waitlisted` → offered).
- **Commands:** *Extend Offer* (present the spot), *Confirm Tour*/*Quick message* (helpful).
- **Outcomes:** `accepted` (→ Enrolling), `declined`, `no_response` (→ attention).
- **After completion:** *Accepted* moves the child to **Enrolling** and sets disposition `enrolling`.
- **Immediately sees next:** the enrolling checklist for that child.

### Stage 7 · Enrollment In Progress — `enrolling` / `enrollment` *(child grain)*
- **Operator Work owns:** *"Finish enrollment for [Child]."* **One obligation per enrolling child**, whose body is a
  **readiness checklist** of everything required to enroll — Documents, Medical, Placement (room), Schedule, Funding.
  Each checklist row shows its state and either a **command** to satisfy it or a **hand-off** to the card that owns the
  artifact. This is where "many required things" is organized as *one obligation with a satisfiable checklist*, not a
  pile of loose tasks.
- **Household contributes:** funding/billing responsibility and the signing parent (referenced; billing detail lives in
  the Billing card).
- **Children contributes:** the named child, their medical/immunization facts (a checklist row hands off to Children),
  and per-child emergency contacts.
- **Commands:** *Send Enrollment Packet*, *Review Documents*, *Assign Room*, *Assign Schedule* (each discharges a
  checklist row).
- **Outcomes:** `enrollment_complete` (→ Ready/Enrolled), `packet_pending` (→ attention), `family_withdrew`.
- **After completion:** each satisfied row ticks; when the checklist is whole, readiness flips to **ready** and the
  primary command becomes *Enroll [Child]*. Required work overdue raises attention.
- **Immediately sees next:** the next unmet checklist row, or — when all are met — the single *Enroll* command.

### Stage 8 · Ready to Enroll — `future_start` *(child grain)*
- **Operator Work owns:** *"Everything's in place for [Child] — confirm the start."* One `pre_start_checklist`
  obligation and the final **Enroll Child** command. Readiness is green; this is the last confirming act.
- **Household contributes:** start-date confirmation with the family.
- **Children contributes:** the named child, now fully prepared (room, schedule, docs all satisfied).
- **Commands:** *Enroll Child* (the final command).
- **Outcomes:** `enrolled` (→ Enrolled), `start_delayed` (holds, re-dates).
- **After completion:** the child's disposition becomes `enrolled`; the track moves to **Enrolled**.
- **Immediately sees next:** for this child, nothing — and that's correct. The card recomposes to the household's *other*
  open work (another child, another obligation) or to the calm complete state.

### Stage 9 · Enrolled — `enrolled` *(child grain; terminal)*
- **Operator Work owns:** **nothing active.** For an enrolled child there is no obligation. Operator Work is **replaced
  by a settled, celebratory-but-quiet complete state**: "Enrolled — started Sep 3." It records the win; it does not
  invent post-enrollment busywork (that belongs to Attendance/Billing, downstream domains).
- **Household contributes:** unchanged — the ongoing family of record.
- **Children contributes:** the child, now with an `enrolled` disposition, moves from "prospective" to "enrolled" in the
  roster.
- **Commands:** none in the enrollment process (Attendance/Billing own what comes next).
- **Outcomes:** `acknowledged` (no-op).
- **After completion:** terminal for enrollment.
- **Immediately sees next:** the director's attention returns to the household's remaining prospective children, or to
  the **next family** in the queue — the continuous day resumes.

---

## Deliverable 2 — Enrollment Focus Panel Mockups

Delivered as the companion artifact: **New Lead · Contacting · Tour Scheduled · Tour Complete · Enrollment Offer ·
Enrollment In Progress · Ready to Enroll · Enrolled**, plus the multi-child household (D3) and a command-flow strip
(D4). Every mockup uses the existing Focus Panel two-column layout with Household and Children **unchanged**; only the
Operator Work card evolves.

---

## Deliverable 3 — Multi-Child Enrollment (the load-bearing case)

**Household:** the Riveras. Three children, three points on the journey:
- **Aisha** — already **Enrolled** (child track terminal).
- **Ben** — **Tour next week** (a fresh inquiry for the younger sibling — pre-split, family-grain tour).
- **Chloe** — **Enrolling, paperwork incomplete** (child track, mid-checklist).

**How the three surfaces compose without duplication:**

- **Household (unchanged)** owns the **shared family**, exactly once: the parents (Maria & Luis Rivera), the primary
  contact, the address, the funding responsibility. It is named once and referenced by every child's work. **No child
  detail lives here.**
- **Children (unchanged)** owns the **three children as people**, exactly once each: Aisha (enrolled), Ben (prospective,
  touring), Chloe (enrolling). Names, ages, dispositions, per-child medical and emergency contacts. It is the roster and
  the source of child identity. **No work lives here** — dispositions are shown, not worked.
- **Operator Work (evolves)** owns the **verbs across all three children**, each obligation **naming its child**:
  - *Ben:* "Confirm the tour — **Ben**" (family-grain work, but the item names which child it concerns).
  - *Chloe:* "Finish enrollment — **Chloe**" with her checklist (docs ✓, medical ✓, room ⚠ needs assigning, schedule ⚠,
    funding →Billing).
  - *Aisha:* **no work item** — she's enrolled; she appears only in Children's roster, not in Operator Work.
  - Priority: Chloe's overdue paperwork is primary (most urgent); Ben's tour is secondary; Aisha is absent from work.

**The non-duplication contract:**
- The **parents** appear once (Household) — never re-listed under each child.
- Each **child** appears once as a person (Children) — Operator Work *names* them in work but never re-lists them as a
  roster.
- **Work** appears once (Operator Work) — Children shows *status*, never a task.
- A child with no work (Aisha) is **absent from Operator Work** entirely — presence in the work card means "has an
  obligation," which is information.

This is the whole thesis: **Household = the shared family (nouns, shared). Children = the individual children (nouns,
per-child). Operator Work = the work (verbs), naming whichever child each obligation concerns.** Three owners, zero
overlap, one continuous surface.

---

## Deliverable 4 — Commands

The real enrollment command vocabulary, with where each appears, how it launches, how it returns, and what changes.
Maturity is marked so Engineering sees the build order (this does not change the frozen experience):
**[live]** wired today · **[config]** an authored `action_ref` awaiting a registered handler · **[backlog]** a
capability the operational tail still needs.

| Command | Appears | Launches | Returns | Operator Work changes | Maturity |
|---|---|---|---|---|---|
| **Contact Family** | Contacting/New Lead primary action + header band | inline; may open a compose surface | integrated send → objective `sent`; config maps to `left_message` (no re-declare) | attempt settles; if reached, advances; else next attempt dated | [live] (Contact Family slice) |
| **Schedule Tour** | header band + helpful action | opens the existing tour modal (referenced input surface) | booking result returns as one intent | tour context appears; case moves toward Tour Scheduled | [config] |
| **Confirm Tour** | Tour Scheduled primary | inline | confirm result | tour settles as confirmed | [live] (`confirmTourAction`) |
| **Record Tour Outcome** | Tour Complete primary | inline outcome picker | operator declares an Outcome (not a technical result) | item settles; case → Decision | [live] (outcome declaration) |
| **Send Enrollment Packet** | Enrolling primary / Decision helpful | inline; compose/send | send result → `packet_sent` | packet checklist row ticks | [config] |
| **Review Documents** | Enrolling checklist row | opens Documents surface (referenced) | reviewed/approved result | documents row → satisfied | [backlog] |
| **Extend Offer** | Enrollment Offer primary | inline | offer sent | offer item awaits `accepted` | [backlog] |
| **Assign Room** | Enrolling checklist row | inline picker (room/capacity) | placement durable fact | placement row → satisfied; readiness recalculates | [backlog] |
| **Assign Schedule** | Enrolling checklist row | inline picker (days/hours) | schedule durable fact | schedule row → satisfied | [backlog] |
| **Enroll Child** | Ready to Enroll primary (only when readiness green) | inline confirm | `enrollment_complete` outcome | child → Enrolled; work recomposes to next child/family | [backlog] |

**The command law (frozen):** commands appear in exactly two places — the **workspace header control band** (the full
set for the surface) and the **work item's primary action** (the single most relevant one). Both route through the
**one Command Runtime**, so a command means the same thing wherever launched. A command that needs rich input may borrow
an existing referenced surface (tour modal, documents), but its **result always returns through the recomposition
contract** — booking and progress are never two separate operator acts.

---

## Deliverable 5 — Product Critique (challenging my own work)

Honest pressure, not reassurance.

- **What still feels awkward?** The **Tour Scheduled** stage has no work — correct, but a director scanning a queue of
  "no-work" tours may feel the system went quiet on active families. The calm waiting state must state the *next
  automated beat* ("reminder sends Mon; tour Tue") or it reads as neglect, not calm.
- **Where is the operator still thinking too hard?** At **Decision**, declaring a *per-child* outcome from a
  *family-grain* obligation is the single hardest conceptual moment — the operator holds "one conversation, three
  children, three paths" in their head. The card must make the per-child decision explicit (a row per child at the split)
  or the director will mentally track which sibling goes where. **This is the sharpest product risk in the journey.**
- **Where are we duplicating information?** Risk point: the **Enrolling checklist** (docs/medical/funding) overlaps the
  Documents card and Billing card. If Operator Work *renders* document contents or billing amounts, it duplicates. The
  rule holds only if Operator Work shows **state + a hand-off**, never the artifact itself. Easy to violate under
  implementation pressure.
- **Where is Household doing work Operator Work should own?** Today, correcting a bad phone number happens *in* Household
  while the obligation lives in Operator Work. That's correct ownership (Household owns the fact) — but the operator must
  round-trip. The hand-off must be tight (one click there, auto-return) or Household will feel like it's "doing the work."
- **Where is Operator Work trying to own something that belongs elsewhere?** The **Enrolling checklist** tempts Operator
  Work to own placement (rooms) and scheduling — genuinely new concepts with no home card today. Product decision taken:
  Operator Work owns the *obligation and the command*, and the **durable fact** (placement/schedule) is materialized by
  the vertical, surfaced where it belongs (a future Placement/Schedule surface), referenced back as a checklist state.
  Operator Work must not become the room-management screen.
- **What would confuse a first-time director?** The **family→child split**. Before Decision they see "the Rivera family";
  after, they see "Mia," "Noah," "Chloe" as separate work. If the split is silent, the director wonders why "one family"
  became "three things." The Frame must **narrate the split** at Decision ("From here you're enrolling each child
  individually").
- **If demonstrated to a childcare director tomorrow, what would they ask?**
  1. "If I left three voicemails, when does it stop nagging me and tell me to move on?" (attention/close policy)
  2. "Can two of my children tour on different days?" (per-child vs. family tour — the model says tour is family-grain;
     the answer is a fresh inquiry per child, which we must state.)
  3. "Where do I put that the family gets subsidy funding?" (funding ownership — Billing card; the checklist references
     it.)
  4. "What happens to the other two kids when I enroll one?" (the recomposition answer — the card moves to the next
     child's work.)
  5. "Can I see everything I owe this family today in one place?" (the multi-child Operator Work *is* that place — good.)

None of these break the composition. Two of them (the Decision per-child moment, and narrating the split) are **product
presentation decisions this spec now makes explicit**, not new architecture.

---

## Deliverable 6 — Freeze Recommendation

### READY TO IMPLEMENT

The composition is correct and complete enough that Engineering can build the enrollment experience **without making
further product decisions.** Every stage has one owner per concept; the family→child split is specified; multi-child
composition is defined with a non-duplication contract; commands have a frozen appearance/launch/return law; and the
awkward moments surfaced in the critique are resolved *as product decisions here* (narrate the split; per-child rows at
Decision; state-plus-handoff in the checklist; name the automated next beat in the calm state). The remaining variance
is **implementation sequencing and capability build-out**, which the mission explicitly authorizes Engineering to phase
across slices.

**Two conditions are stated, not deferred — they are frozen product requirements, not open questions:**
1. **The family→child split must be narrated** in the Frame at Decision, and Decision must present a **per-child outcome
   row**. (Product decision, made. Engineering realizes it.)
2. **The Enrolling checklist is state-plus-handoff only** — Operator Work never renders the document, the billing amount,
   or a room-management UI. (Product decision, made. It is the guardrail against duplication.)

**Engineering implementation slices** (phase-able; build order, not product order):
1. Recomposition contract + carry-subject-at-grain (R1) — prerequisite for all child-named work. *(Reconciliation G1/G2.)*
2. Reconcile the **dual stage vocabulary** — the config carries both an older (`lead/decision/enrollment`) and a newer
   (`new_lead/contacting/decision_pending/offered_spot/future_start`) stage set, and a dangling `qualification`
   reference (`contacting` line 611). Converge to one authored journey. *(Engineering reconciliation — not a product
   decision; the experience above is vocabulary-agnostic.)*
3. Child-named work items across a household; the multi-child Operator Work.
4. Decision per-child outcome rows + Frame narration of the split.
5. The Enrolling checklist obligation (state + command + hand-off), de-hardcode `sent_text` → authored contact mapping.
6. Build the operational-tail capabilities (*Review Documents, Extend Offer, Assign Room, Assign Schedule, Enroll
   Child*) as registered actions producing durable facts — the largest, latest slice.

Chosen READY because a childcare director could be walked through this experience end-to-end and every "what happens
next" has a defined, single-owner answer — not because the mockups look good. What remains is building, in slices,
an experience whose shape is now frozen.

No implementation begun. This specification is the Product Office's freeze for Enrollment.
