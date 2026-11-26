# Second Surface Proof — Inventory (measured, not designed)

**Status:** INVENTORY COMPLETE. **Date:** 2026-07-30. **Owner doc:** `RUNTIME-V1-CERTIFICATION-SPRINT.md` (SURF-3).
**Supersedes the premise of:** `SECOND-SURFACE-CERTIFICATION-DESIGN.md` (2026-07-28), which proposed a
**dev-fixture-gated** Child proving slice. The requirement is now a real production surface, and — more
importantly — the inventory found that the second surface is **already configured in production**.

> **The headline. The second surface is not hypothetical and does not need selecting.** The certified tenant
> already publishes two child-grain operator destinations, the Runtime already resolves their Row Grain as
> `child`, and the architecture does not carry them. One adjacent destination is already **dead in the
> operator's hands**.

---

## 1. What the certified tenant actually offers an operator (measured in the browser)

Firefly Early Learning · org `93667019` · dept "Enrollment" `3933ac47` · authed, dev server on `:3013`.
Harness: `web/scripts/tmp-probeNavDestinations.mjs` (nav hrefs read from the rendered sidebar, not from code).

The sidebar renders **five** work-unit destinations — all of them Work Views (lenses) on one work unit:

| Destination (real href) | Nav description | Row Grain the Runtime resolved | What the operator sees |
|---|---|:--:|---|
| `/workspace/work-unit/new-leads` | "Brand new leads entering the fu…" | `family` | **works** — 7 rows, 4 cards, subject resolved |
| `/workspace/work-unit/active-pipeline` | "Leads that have actively …" | **refused** | ⚠️ **DEAD — an error alert and nothing else** |
| `/workspace/work-unit/registration` | "**Children** in the enrollment p…" | **`child`** | honest empty — "No records in this view" |
| `/workspace/work-unit/waitlist` | "**Children** that want to start but…" | **`child`** | honest empty — "No records in this view" |
| `/workspace/work-unit/tours` | "Tours in the next 7 days" | `family` | honest empty |

### 1a. `active-pipeline` is a live, operator-visible dead destination

Measured as the **initial** answer for that route (one answer total on that load — not a sibling prewarm):

```
=== /workspace/work-unit/active-pipeline
  INITIAL answer: terminal=error code=grain_ambiguous
  message: Work View "Active Pipeline": lens spans 2 Row Grains (family, child)
           — a surface cannot be grain-ambiguous
  DOM: queueRows=0 cards=0 subject=-
  ALERT: Work View "Active Pipeline": lens spans 2 Row Grains (family, child) …
```

The same refusal also appears on `new-leads` — but there it is the **sibling prewarm** of Active Pipeline,
invisible to the operator, whose own surface commits normally from the server seed. Both facts are stated
because conflating them would either hide a real defect or invent one.

Cause: the tenant's Active Pipeline lens spans stages of two declared grains, and `resolveLensRowGrain`
(`workUnitProvisioningAnswer.ts:360-380`) enforces law G-1, "a surface cannot be grain-ambiguous". Firefly's
Enrollment process declares **4 of 6 stages as `grain: child`** — `decision`, `waitlist`, `enrolling`,
`enrolled` — and `lead`/`tour` as `family`.

**This is the second surface pressing on the architecture, and it reached operators before we reached it.**

## 2. Subject · mission · navigation · providers · cards · commands · composition · tenant config · failure states

### Subject — **the Child**, and it is already the tenant's own answer
- `StageGrain = "family" | "child" | "person" | "account" | "work_item"` (`lib/lifecycle/stageGrainV1.ts:8`);
  the provisioning answer's `RowGrain` **is** `StageGrain` (`workUnitProvisioningAnswer.ts:109`).
- Firefly declares `child` on four stages, and its work units carry
  `queue_membership_v1.subject_type` = `child` (×3) / `candidate` (×1) — measured live, since the repo's seed
  dumps carry no `work_units` rows (`web/scripts/tmp-probeChildGrainWorkUnits.mjs`).
- Frozen contract already exists: `LifecycleSubjectRef{subject_type, subject_id, case_anchor}` and
  `QueueRowSubjectPresentation{display_name, date_of_birth, age_label…}` (`lib/workUnits/lifecycleSubjectContracts.ts:27-70`).

### Operator mission — **frozen product, not something to invent**
`docs/platform/planning/scheduling-focus-panel-composition.md` (discovery *closed*, decisions *frozen*):

```
Focus Panel · subject = Ethan · Work mode
  ① IDENTITY   Scheduling Summary — durable truth only; no calcs, no commands
  ② WORK       Needs Attention / Current Work — only if there is work
  (context)    Enrollment · Attendance · Billing — read-only
  ③ COMMANDS   launch from Work/Detail actions → Command Surface
```
Its laws coincide with Runtime doctrine independently: identity carries no judgment ("not *Healthy* /
*Conflict* — those are work"), which is the same law as "the runtime never substitutes an unresolved state
with a business conclusion"; and **a healthy child shows no work card at all** — a real honest-empty
requirement. `children-scheduling-boundary.md` fixes the peer-card split (configurable Children card vs
platform-owned Scheduling card, composed "by navigation, not embedding").

### Navigation — exists for the queue, absent for the child
Lifecycle cards and their work-view children are **DB-derived** (`lib/admin/buildOperatorLifecycleLanding.ts`),
so a child-grain lens needs **no code change to appear in nav** — Registration and Waitlist already do.
But the child has **no destination of its own**: no child route, `child` is not an `AdminDrawerEntityType`,
and a child opens only as a `persons` drawer keyed by the magic string
`PERSON_DRAWER_CHILD_OPEN_SOURCE = "opportunity_inquiry_child"` (`lib/admin/drawer/personDrawerOpenSeed.ts:14`),
with an explicit `goBackToLead` return path (`contexts/AdminDrawerContext.tsx:87-88`).
And a **child-grain queue row still opens the case**: `buildChildGrainQueueRowContext.ts:486-491` emits
`drawer_open: { entity_type: "opportunities", entity_id: caseId, active_subject }`.

### Providers — one registry, one entry, zero registered
`CARD_CAPABILITY_PROVIDERS = { milestones: [] }` (`focusPanelCardProviders.ts:27-33`) is the entire provider
concept; unavailability forces `hidden` and **overrides authored visibility**
(`deriveFocusPanelSummaryCompositionInputs.ts:88-95`). What exists for a child is *data machinery*, not
providers: child drawer VM (production, hard-cutover-on), `focusPanel/children/` evidence stack (production,
but case-grain), `buildSchedulingProjectionForChild` / `loadSchedulingProjectionForChild`, `placement.room_fit`
(registered). `MilestoneFact.scope` already admits `"child"` (`milestonesCardBlueprint.ts:28`).

### Cards — **zero child-grain cards exist, in any form**
All 23 keys are annotated `@grain case`, and `focusPanelCardModel.ts:79-81` claims child-grain cards "are
defined separately" — **nothing exists behind that claim.** `FOCUS_PANEL_CARD_KEYS` is the only card-key union
in the repo. The `children` card is a *case-grain roster* (`:101` "read-only; child facts are case-grain
display"), not a child-subject card.

### Commands — **already real for a child subject**
15+ capabilities declare `supportedSubjects` including `child`: `assignment.set_primary` / `create` /
`change_room` / `archive` / `promote_proposed` / `delete_proposed` (all executable, registered_action,
production), `add_parent_guardian`, `add_emergency_contact`, `open_record`, `ask_bos`, plus OCM-subject
`enroll_child` / `waitlist_child` / `withdraw_child`. `SchedulingCard.tsx` already posts payloads with
`subject_type: "child"` (`:254, :765, :919`) — but reaches them **through the opportunity subject** (`:336`).
Constraint: `PlatformActionGrain` is a closed union `"opportunity" | "opportunity_customer_member"`
(`platformActionCatalog.ts:13-15`) — no `child`/`person` member.

### Composition — one default doc, for every surface
`publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC` (`OpportunityFocusPanelModeGrid.tsx:141`) — a bare `??`, no
policy layer, published overrides wholesale. The default is a module singleton built from **one** authored
array naming the enrollment cards (`composition/focusPanelSummaryDefaultComposition.ts:63-107`, "one surface
authority"). **A second surface with nothing published renders the Enrollment composition** — it neither
crashes nor comes up empty.

### Tenant configuration — no key for a new surface
One row in `entity_layouts`, addressed by three literals:
`entity_type="opportunities"`, `surface="drawer"`, `layout_key="focus_panel_summary"`
(`focusPanelLayoutDocModel.ts:37-39`). The table's CHECK constraint allows **only** `drawer|queue`
(`20260603120000_entity_layouts_v2.sql:61`). Scope is org-global; the per-BP/WorkView/stage/status
applicability axis exists but no tenant authors it.

### Failure states — a good set, one honest gap
Twelve `fail(...)` codes; `subject_unavailable` refuses to substitute; `terminal:"empty"` is authoritative and
still carries lens set + presentation + settlement. **But every error terminal renders one code-agnostic
surface** — no renderer reads `code` (`workUnitSurfaceModelFromSnapshot.ts:121-148`), so `grain_ambiguous` and
`subject_unavailable` differ only by message string. That is precisely why Active Pipeline reads as a dead
destination rather than as a configuration problem.

## 3. The blocker that makes the child lenses permanently empty

The provisioning answer reads exactly four tables, and its **only record source is `opportunities`**:

```
workUnitProvisioningAnswer.ts  .from("work_units")
workUnitProvisioningAnswer.ts  .from("opportunities")   ← the ONLY row source
workUnitProvisioningAnswer.ts  .from("departments")
workUnitProvisioningAnswer.ts  .from("work_units")
```

> **Line numbers removed (2026-07-30).** These originally read `:411 / :442 / :459 / :461`, correct at the
> commit this was written against. The Active Pipeline repair added ~65 lines to the same file and shifted
> them (`.from("opportunities")` is now `:508`). Cite the symbol, not the line.

So Row Grain is **declared, validated, and refused-if-ambiguous — but never honoured at the data source.** A
`child`-grain lens can only ever be empty. The repo says so itself:
`buildPartialQueueRowContext.ts:468` `const subjectType: LifecycleSubjectType = "case";` with
`:579` "declared lane grain — row_subject may still be case until phase 6".

> **CORRECTION — this section's candidate list was wrong, and the omission was total.**
> `SECOND-SURFACE-INVENTORY.md` reasoned toward `customer_members` as the likely child row source. The
> canonical source is **`process_instances`** (`process_key='enrollment'`, `subject_type='child'`), whose own
> migration comment says it "replaces opportunity_customer_members" — and a production read path for it
> **already exists** (`QueueService` → `ocmEnrollmentTrackQueueBuilder` →
> `queryEnrollmentProcessInstanceTrackRows`, with the OCM fallback flag defaulting off).
>
> The trap worth naming: "18 `customer_members` rows exist, 0 `opportunity_customer_members` rows exist" is a
> fact about row counts that says nothing about which table is authoritative. **The zero was a deleted
> writer, not absent children.** Firefly in fact holds **11 child process instances**.
>
> Full map, with the risks it carries into implementation: **`GRAIN-AUTHORITY-MAP.md`**.

## 4. Classification of every repeated requirement

Per the sprint's five classes. **Nothing is extracted here** — this records what the second real consumer
proves, so extraction happens only where it does.

| # | Requirement the second surface needs | Class | Proven by a second consumer? |
|---|---|---|---|
| R1 | Row source resolved from the lens's Row Grain (not `opportunities` unconditionally) | **provider** | YES — Registration/Waitlist resolve `child` and can never have rows |
| R2 | `subjectGrain` + subject type carried on the ProvisioningAnswer and parameterized in the producer (SC-1) | **reusable Runtime** | YES — `grain:"case"` / `type:"opportunity"` literals (`focusPanelWorkModeModelFromProvisioningAnswer.ts:60,61,142`) |
| R3 | A per-surface/per-grain **default composition** (today one enrollment singleton serves all) | **surface** | YES — a child surface would render enrollment cards |
| R4 | Card keys + commit-critical specs selectable by grain (flat array, no selector) | **card** | YES — a child spec would also be evaluated on the case panel |
| R5 | Child identity truth production (name · DOB · enrollment status · room · schedule · family link) | **provider** | YES — `SubjectIdentityTruth` is opaque by type, but its only producer is opportunity-shaped |
| R6 | Parent-case linkage on the subject ref (`caseRef` exists on `QueueRowSubjectRef`, not on `OperationalSubjectRef`) | **reusable Runtime** | YES — child cards have nowhere to read the family link |
| R7 | Grain-agnostic prewarm (`prefetchRecord` early-returns unless `entityType === "opportunity"`) | **reusable Runtime** | YES — no prewarm at all for a child row |
| R8 | A stage-work slice for a non-opportunity subject (`focusPanelStageWork: OpportunityStageWorkSlice`) | **provider** | YES — no `resolveChildStageWorkSlice` exists |
| R9 | `entity_layouts` addressing for a non-`opportunities` surface (CHECK allows only `drawer\|queue`) | **surface** | YES — a child published doc has no key |
| R10 | Error surfaces that distinguish *configuration invalid* from *subject missing* | **reusable Runtime** | YES — Active Pipeline reads as dead, not as misconfigured |
| R11 | Whether a lens may span grains at all, and what a tenant sees when it does | **product** | **owner intent** — see §5 |
| R12 | `PlatformActionGrain` admitting `child` (capability registry already does; the action catalog does not) | **card/product** | partial — commands exist, the grain union does not admit them |

## 5. The constraint that stops implementation here

**The certified tenant has no child operational data at all.** Measured (`tmp-probeChildRowsExist.mjs`):

| table | rows |
|---|--:|
| `opportunity_customer_members` (the child-grain lifecycle subject) | **0** |
| `child_placements` | **0** |
| `schedule_assignments` | **0** |
| `child_enrollment_agreements` | **0** |
| `placement_candidates` | **0** |
| `customer_members` (children as household members) | 18 |
| `opportunities` | 7 — **all in stage `lead`** |

So Registration and Waitlist are **honestly** empty: rows=0 is the truth, not a defect.
And the frozen Child mission — scheduling/placement — has **nothing to certify against** on Firefly.
The sprint's certification list (multiple participating cards · subject switching · deferred behaviour ·
commands · published/default composition) cannot be satisfied there without **creating child operational
data**, which contradicts the standing law "build the real app UI, never `/dev` harnesses or seeded fake
data."

That is a tenant/data question and a product-doctrine question, not a bounded implementation choice — so it
is recorded and raised rather than resolved unilaterally.

## 6. Evidence artefacts (retained)

- `web/scripts/tmp-probeChildGrainWorkUnits.mjs` — live work-unit + stage-grain declaration census.
- `web/scripts/tmp-probeChildRowsExist.mjs` — whether child-grain subjects exist at all.
- `web/scripts/tmp-probeNavDestinations.mjs` — what an operator sees at each rendered nav destination.
- `web/scripts/tmp-probeChildGrainSurfaces.mjs` — per-answer lens/grain/terminal capture. Its **first
  version was wrong** and is superseded in place: it read `answers[0]`, which on `new-leads` is a sibling
  prewarm, and so attributed `grain_ambiguous` to the wrong request. The corrected version distinguishes the
  initial answer from prewarms; both readings are reported in §1a.
