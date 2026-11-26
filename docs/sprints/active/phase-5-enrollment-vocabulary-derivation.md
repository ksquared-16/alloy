---
owner: product
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Enrollment Vocabulary Derivation (correction of record)

**Why this document exists:** the first enrollment mockups
([phase-5-enrollment-realization-mockups.html](phase-5-enrollment-realization-mockups.html)) failed a Product Office
review on two counts: (1) they used **deprecated/granular stage vocabulary and invented terms** ("Enrollment Offer",
"Extend Offer", "Assign Room", "Assign Schedule", "Enroll Child", a "Documents/Medical/Placement/Funding" checklist)
that are **not** the current configured operator-facing labels; and (2) they used **mockup-specific greens** instead of
the canonical Alloy color tokens. This document derives the *actual* configured vocabulary from source before any
rebuild. **No operator-facing noun or verb below is authored by the mockup** — each traces to configuration, and where
configuration is silent it is marked a **GAP**, never filled with invented childcare terms.

**Authoritative sources inspected:** `web/lib/businessProcessTemplates/enrollmentProcessTemplate.ts`,
`web/lib/lifecycle/defaultEnrollmentStageOperatingPlans.ts`, `web/lib/lifecycle/lifecycleProcessTypes.ts`,
`web/lib/lifecycle/businessProcessUiLabels.ts`, `web/lib/admin/actions/actionDefinitionRegistry.ts`,
`web/lib/adminV2/actions/actionRegistry.ts`, `web/lib/lifecycle/lifecycleProgressionRequirementsCatalog.ts`,
`web/lib/adminV2/runtime/focusPanel/.../buildReadinessCardEvidence.ts`,
`web/lib/lifecycle/enrollmentProcessStatusVocabulary.ts`,
`web/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults.ts`,
`web/lib/lifecycle/defaultEnrollmentBusinessProcessV1Stages.ts` (`@deprecated`).

**Structural finding that reframes everything:** there is **not one** enrollment stage vocabulary — there are **three**:
1. **Canonical / live** — the 8 stages the template actually seeds (`enrollmentProcessTemplate.ts` `ENROLLMENT_STAGE_SPECS`). **Use this.**
2. **Deprecated V1 / granular** — `new_lead`, `contacting`, `tour_scheduled`, `offered_spot`, `future_start`… in `defaultEnrollmentBusinessProcessV1Stages.ts`, header `@deprecated`. **The first mockups wrongly used this.**
3. **Progression-doctrine** — `LIFECYCLE_STAGE_LABELS` (`lead`→"Lead", `qualification`, `enrollment`…), a third label set used for readiness. Source of the "Required information" factors, but its stage labels conflict with (1).

The granular operating plans in `defaultEnrollmentStageOperatingPlans.ts` (`new_lead`, `contacting`, `offered_spot`,
etc.) **exist but are never instantiated** by `buildEnrollmentTemplateStageRecords()` — they are reachable only if a
tenant already persisted those keys. For a template-faithful product, they are **non-live**.

---

## Deliverable 1 — Configured Enrollment Stages (canonical)

Source: `enrollmentProcessTemplate.ts:25-38, 65-71`. Process label: **"Enrollment Process"**
(`businessProcessUiLabels.ts:175` `ENROLLMENT_PROCESS_DISPLAY_NAME`); short title **"Enrollment"**
(`lifecycleProcessTypes.ts:20`). Two tracks, split at the family→child boundary.

| Grain | Track | stage_key | **Configured label (verbatim)** |
|---|---|---|---|
| family | Family Track | `lead` | **"New Lead"** |
| family | Family Track | `tour` | **"Tour"** |
| family | Family Track | `decision` | **"Placement / Decision"** |
| family | Family Track | `closed` | **"Closed"** |
| child | Child Track | `waitlist` | **"Waitlist"** |
| child | Child Track | `enrolling` | **"Enrolling"** |
| child | Child Track | `enrolled` | **"Enrolled"** |
| child | Child Track | `closed_withdrawn` | **"Closed / Withdrawn"** |

Track labels: **"Family Track"**, **"Child Track"** (`enrollmentProcessTemplate.ts:65,71`). The split at `decision`
offers per-child paths labeled **"Waitlist"**, **"Enrolling"**, **"Closed / Withdrawn"**, **"No action — keep with
family"** (`enrollmentProcessTemplate.ts:81-90`).

> Note: **"Placement / Decision"** is the *only* place "Placement" is a configured operator label — as half of a stage
> name. "Assign Placement", "Placement pending", and "Placement" as a checklist item are **not** configured (the
> required-info word is **"Classroom"** — see D5).

---

## Deliverable 2 — Configured Work Templates by stage

Source: `defaultEnrollmentStageOperatingPlans.ts`. Only stages with configured work are listed; `closed`, `enrolled`,
`closed_withdrawn` have **no work templates** (empty by design; outcome "Acknowledged" only).

| Stage | Work template label (verbatim) | template_key · mode · primary | Source |
|---|---|---|---|
| New Lead | **"Contact Family"** | `contact_family` · direct_action · primary | `:50-52` |
| Tour | **"Conduct Tour"** | `conduct_tour` · outcome_led · primary | `:181-183` |
| Placement / Decision | **"Support Enrollment Decision"** | `support_enrollment_decision` · outcome_led · primary | `:311-313` |
| Waitlist | **"Review waitlist position"** | `review_waitlist_position` · (not required) | `:433-434` |
| Waitlist | **"Offer spot"** | `offer_spot` · (not required) | `:440-441` |
| Enrolling | **"Send Enrollment Packet"** | `send_enrollment_packet` · direct_action · primary | `:388-389, 397` |

> "Offer spot" is the **only** configured "offer" language, and it is a *work template inside Waitlist*, not a stage.
> There is no "Enrollment Offer" stage and no "Extend Offer" command.

---

## Deliverable 3 — Configured Commands / Actions by stage

Source: the `action_ref`s in the operating plans, resolved against `actionDefinitionRegistry.ts` /
`canonicalActionRegistry.ts`. **Only 3 actions have real executable handlers** (`actionRegistry.ts:22`):
`update_status`, `create_lead`, `confirm_tour`. The rest are **catalog metadata** config may reference. The
operator-visible label is the plan's `override_label` when present, else the catalog label, else a humanized fallback.

| Stage | Operator-visible command label | `action_ref` | Label source | Handler |
|---|---|---|---|---|
| New Lead | **"Contact Family"** | `quick_message` (override) | plan override `:71` (catalog label would be **"Message"** `actionDefinitionRegistry.ts:35`) | composer (metadata) |
| New Lead | **"Schedule tour"** | `schedule_tour` | catalog `actionDefinitionRegistry.ts:127` | workflow form |
| New Lead | **"Send form"** | `send_form` | catalog `:145` | workflow |
| Tour | **"Schedule tour"**, **"Message"** | `schedule_tour`, `quick_message` | catalog | metadata |
| Tour | *"Send Confirmation"*, *"Send Reminder"*, *"Reschedule"* | `send_confirmation`, `send_reminder`, `reschedule` | **NO configured label — humanized fallback** | **GAP** |
| Placement / Decision | **"Message"**, **"Send form"** | `quick_message`, `send_form` | catalog | metadata |
| Enrolling | **"Send Enrollment Packet"** | `send_form` (override) | plan override `:397` | workflow |

Other catalog actions available for enrollment config (labels verbatim, `actionDefinitionRegistry.ts` /
`canonicalActionRegistry.ts`): **"Create lead"**, **"Add child"**, **"Add sibling"**, **"Change Enrollment Status"**,
**"Send enrollment packet"**, **"Waitlist Child"**, **"Enroll Child"**, **"Close Lead"**, **"Mark lost"**,
**"Mark won / enrolled"**, **"Ask BOS"**. Note **"Enroll Child"** exists only as catalog metadata
(`actionDefinitionRegistry.ts:105`) / intent `enroll_subject`→**"Enroll"** — it is **not wired into the canonical
`enrolling` operating plan** (whose only work is "Send Enrollment Packet"). Using "Enroll Child" as a live enrolling
command was an invention → **GAP**.

---

## Deliverable 4 — Configured Outcomes by stage

Source: `defaultEnrollmentStageOperatingPlans.ts` `outcomes[]`. Labels verbatim.

| Stage | Configured outcome labels |
|---|---|
| New Lead | **"Reached Family"**, **"Left Message"**, **"Needs Follow-up"**, **"Interested"**, **"Not Interested"** (`:85-91`) |
| Tour | **"Tour Scheduled"**, **"Tour Completed"**, **"No Show"**, **"Needs Follow-up"**, **"Family Declined"**, **"No Availability"** (`:207-219`) |
| Placement / Decision | **"Family Enrolling"**, **"Needs Time"**, **"Wants Waitlist"**, **"Declined"** (`:332-347`) |
| Waitlist | **"Spot offered"**, **"Candidate paused"**, **"No response to offer"** (`:447-451`) |
| Enrolling | **"Packet sent"**, **"Packet still pending"** (`:400-403`) |
| Closed / Enrolled / Closed·Withdrawn | **"Acknowledged"** (no-op) |

Durable status vocabulary (from the S4 collapse, `enrollmentProcessStatusVocabulary.ts:42-57`): family **"Open"**,
**"Closed"**; child **"Waitlisted"**, **"Enrolling"**, **"Enrolled"**, **"Withdrawn"**, **"Not Enrolling"**.

---

## Deliverable 5 — Configured Required Information / Readiness by stage

**Two distinct, unlinked sources.**

**(a) "Required information" — progression requirements** (`lifecycleProgressionRequirementsCatalog.ts:124-184`). Card
title **"Required information"**, question **"What must be completed?"** (`businessProcessUiLabels.ts:113-114`). Factor
labels verbatim, keyed to *progression-doctrine* stage keys:

| Progression stage | Required | Recommended |
|---|---|---|
| lead | **"Person"** | **"Child"** |
| qualification | **"Child"**, **"Program"** | **"Desired Schedule"**, **"Desired Start Date"** |
| tour | **"Child"**, **"Program"**, **"Tour Date and Time"** | **"Tour Outcome"** |
| waitlist | **"Child"**, **"Program"**, **"Desired Schedule"**, **"Desired Start Date"** | — |
| enrollment | **"Child"**, **"Classroom"**, **"Schedule"**, **"Enrollment Start Date"** | **"Enrollment Packet Reviewed"** |
| enrolled | **"Enrollment Date"**, **"Classroom"**, **"Schedule"**, **"Start Date"** | — |

**(b) Readiness card factors** (`buildReadinessCardEvidence.ts:96-157`) — **hardcoded, not config-driven**:
**"Primary contact"**, **"Children added"**, **"Program selected"**, **"Schedule selected"**, **"Desired start"**,
plus a dynamic sixth = `attention.primaryReason`. These are code constants; use them as the *readiness card's* labels,
but they are **not** enrollment-specific configuration.

> The room/schedule/start requirements for enrolling are **"Classroom"**, **"Schedule"**, **"Enrollment Start Date"**,
> **"Enrollment Packet Reviewed"** — nothing else. "Room", "Placement (item)", "Documents", "Medical", "Funding",
> "Tuition", "Deposit" **do not exist** as configured required-info or work items (see D7).

---

## Deliverable 6 — Source of every proposed operator-facing label

Every label the revised mockups may show, and its single source. Nothing else is permitted.

| Label | Source kind | Where |
|---|---|---|
| "Enrollment Process" / "Enrollment" | Business Process name | `businessProcessUiLabels.ts:175` / `lifecycleProcessTypes.ts:20` |
| "New Lead", "Tour", "Placement / Decision", "Closed", "Waitlist", "Enrolling", "Enrolled", "Closed / Withdrawn" | configured **stage** label | `enrollmentProcessTemplate.ts:25-38` |
| "Family Track", "Child Track" | configured track label | `enrollmentProcessTemplate.ts:65,71` |
| "Contact Family", "Conduct Tour", "Support Enrollment Decision", "Review waitlist position", "Offer spot", "Send Enrollment Packet" | configured **work template** label | `defaultEnrollmentStageOperatingPlans.ts` (D2) |
| "Schedule tour", "Send form", "Message" | configured **command/action** label | `actionDefinitionRegistry.ts` (D3) |
| "Reached Family", "Tour Completed", "Family Enrolling", "Spot offered", "Packet sent"… | configured **outcome** label | `defaultEnrollmentStageOperatingPlans.ts` (D4) |
| "Required information" / "What must be completed?" | configured card label | `businessProcessUiLabels.ts:113-114` |
| "Person", "Child", "Program", "Classroom", "Schedule", "Enrollment Start Date", "Enrollment Packet Reviewed", "Tour Date and Time" | configured **required-information** factor | `lifecycleProgressionRequirementsCatalog.ts` (D5a) |
| "Primary contact", "Children added", "Program selected", "Schedule selected", "Desired start" | **readiness card** factor (code constant) | `buildReadinessCardEvidence.ts` (D5b) |
| "Open", "Waitlisted", "Enrolling", "Enrolled", "Withdrawn" | durable **status** label | `enrollmentProcessStatusVocabulary.ts` |
| Rivera, Maria, Luis, Sofia, Diego, ages, dates, phone | **fixture record truth** | mockup fixture (allowed — records may be fixtures) |
| "Reach the family…", "which path?", "nothing to do until then" | **generated explanatory copy** | mockup prose, clearly non-vocabulary |

Any word not in a "configured" row above is either fixture record truth or explanatory copy — and no **noun or verb of
the process** appears as explanatory copy.

---

## Deliverable 7 — Configuration GAPS (marked, never filled)

Where the configured system does not supply enough language or behavior. These are surfaced as gaps for
configuration/engineering — the mockup must **not** invent terms to cover them.

1. **No configured "Documents", "Medical", "Funding", "Tuition", "Deposit"** items anywhere in enrollment config. The
   only enrolling-completion facts are "Classroom", "Schedule", "Enrollment Start Date", "Enrollment Packet Reviewed".
   *(The first mockups invented a five-row Documents/Medical/Placement/Schedule/Funding checklist — retracted.)*
2. **The `enrolling` stage has one work template only** — "Send Enrollment Packet". There is no configured per-item
   paperwork work. Enrolling readiness lives in the separate "Required information" card, not as Operator Work items.
3. **"Enroll Child" / "Enroll" is catalog-only**, not wired into the canonical enrolling plan. There is no configured
   terminal "Enroll" command in `enrolling`; the configured completion is the outcome **"Packet sent"**. Whether a
   distinct "Enroll" command should exist is a **product/config decision**, not a mockup invention.
4. **`send_confirmation`, `send_reminder`, `reschedule` have no configured labels** (humanized fallbacks only) and
   `reschedule` mismatches the catalog key `reschedule_tour`. Treat as **not configured**; the mockup shows only
   labeled commands.
5. **Dangling `qualification`**: removed from the canonical template, but the `contacting` (granular) plan still
   transitions to `stage_key: "qualification"` (`defaultEnrollmentStageOperatingPlans.ts:611`), a stage with no
   operating plan. A live reference-integrity gap. (Moot for the example 8-stage template, which has no `contacting`.)
6. **Dual stage vocabularies**: canonical (8) vs deprecated granular (~13) vs progression-doctrine (6). The
   "Required information" factors are keyed to the *progression* keys (`enrollment`, `qualification`), which don't
   1:1 match the canonical template keys (`enrolling`, no `qualification`). Reconciling these is an engineering/config
   task; the mockup uses canonical stage labels and maps required-info by the nearest configured stage.
7. **Label conflicts for one concept**: `lead` is "New Lead" (template) vs "Lead" (progression doctrine); no
   "Placement / Decision" counterpart in the doctrine. The mockup uses the **template** labels as canonical for stages.

---

## Correction applied

- The earlier journey walk in [phase-5-enrollment-realization-specification.md](phase-5-enrollment-realization-specification.md)
  and the first mockups used the **deprecated granular stages** and **invented terms**. This derivation supersedes their
  vocabulary. The **composition** conclusions of the Operator Work spec (ownership, recomposition, family→child split,
  non-duplication) stand; only the **words** and **colors** were wrong.
- Revised mockups: [phase-5-enrollment-realization-mockups.html](phase-5-enrollment-realization-mockups.html) —
  configured vocabulary, canonical Alloy colors, explicit per-label derivation.

No implementation begun. No code written.
