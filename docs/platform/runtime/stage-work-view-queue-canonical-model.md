---
title: Stage · Work View · Queue — the canonical operational model
owner: runtime
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# 0.5 — Reconciliation with the Product Office findings (2026-07-16)

**This section supersedes every "open Product decision" this document previously listed.**
G6 and G9 are **CLOSED**. Nothing below §0.5 may be read as reopening them.

This document was written before the Product Office findings and the landed Runtime Constitution.
Its §0–§3 diagnosis of the **two-predicate-system fork** remains accurate and stands. Its framing of
**grain** did not, because it collapsed two constitutionally distinct concepts into one axis and then
correctly discovered that no single enum could carry both.

The authoritative concepts are owned by
[`../operator/canonical-interaction-model.md`](../operator/canonical-interaction-model.md), not by
this document and not by the Runtime:

| Concept | Meaning | Owner |
|---|---|---|
| **Record of Truth** | the authoritative database/domain entity | Records |
| **Record of Attention** | what the operator is currently working on | the lens + the operator's selection |
| **Context Frame** | *why* the record was opened right now — the entry intent | the Work View entered from |

The one universal record surface **carries all three at once** (`canonical-interaction-model.md:85–91`)
and **"preserves workspace, perspective, and queue context while open"**. Runtime may say *Operational
Subject* (= Record of Attention) and *Operational Context* (= Record of Truth + Record of Attention +
Context Frame). These are **naming**, not new abstractions, and must map 1:1. Runtime introduces no
competing vocabulary. The governing Runtime corpus does not mention grain at all — grain is owned by
Stage/process doctrine, and the Runtime only *carries it explicitly*.

**The correction, stated once:**

> **Row Grain and Record of Attention are constitutionally distinct.** Row Grain is the *shape of a
> projected row*, owned by **Stage**. Record of Attention is *what the operator is working on*.
> They are related, not equal. The earlier grain analysis is stale precisely because it required them
> to be one enum.

## 0.5.1 — G6 CLOSED: three vocabularies were never three grains

The three enums are not three dialects of one idea. They are **two different ideas plus a
compatibility artifact**, which is why unifying them into one enum was impossible:

| Enum | What it actually expresses | Correct axis |
|---|---|---|
| `StageGrain` = `family \| child \| person \| account \| work_item` | **Row Grain** — the shape of a projected row | **Row Grain (canonical owner)** |
| `WorkViewGrainBucket` = `family \| child` | count bucketing over Stage-owned grain | Row Grain (derived view; must not re-declare) |
| `QueueMembershipSubjectType` = `case \| child \| candidate` | **record/attention identity + compatibility naming** | **Record of Attention** — *not* Row Grain |

- **Stage owns Row Grain**, using **one canonical Stage-owned vocabulary**. For Enrollment the
  operative row grains are **`family`** and **`child`**. Broader platform grains (`person`, `account`,
  `work_item`) remain owned by Stage/process doctrine.
- **`case` is not a Row Grain.** `case` and `candidate` are **compatibility/attention identifiers**
  that old membership types placed on the grain axis. `case` is the *Record of Truth* identifier for
  the family enrollment case; `candidate` expresses a waitlist **attention** identity. Neither becomes
  a Product grain merely because legacy code stored it in a membership type.
- **`case` ≡ `family` must never remain an ambiguous alias inside one comparison.** The resolution is
  **not** a universal enum: it is a **boundary mapping**. Compatibility names are translated **at the
  membership boundary** into Stage-owned Row Grain, and never compared to grain values directly.
- **Work View does not own durable process position** and **may not silently change Row Grain**. It
  expresses the operator's perspective over Stage-owned membership and **preserves the declared row
  grain** of the stages it scopes.

**Required engineering treatment** — canonical Row Grain owner: **Stage** (`StageGrain`, Enrollment
subset `family | child`). `WorkViewGrainBucket` is a *derived* presentation bucket, not a second
declaration. `QueueMembershipSubjectType` is a **compatibility surface** mapped at the boundary to
(Row Grain, Record-of-Attention identity) — it is not Product grain and must not be compared against
`StageGrain`. No universal enum is created: two concepts keep two vocabularies, joined by an explicit,
documented mapping.

**The authored data already encodes exactly this two-axis model** — Stage carries `grain` *and*
`queue_membership_v1.subject_type` as **separate fields**, and they do not agree because they are not
the same axis:

| Stage | `grain` (**Row Grain**) | `subject_type` (**attention / compat**) | `count_unit` |
|---|---|---|---|
| `lead` · `tour` · `decision` · `closed` | **`family`** | `case` | cases |
| `waitlist` | **`child`** | `candidate` | candidates |
| `enrolling` · `enrolled` · `closed_withdrawn` | **`child`** | `child` | enrollment_tracks |

`case` occurs **only** where `grain = family` ⇒ **`case` is a compatibility name for the `family` Row
Grain**, never a third grain. `candidate` occurs **only** where `grain = child` ⇒ `candidate` is an
**attention identity on a child-grain row**, which is precisely
`canonical-interaction-model.md:102` ("Waitlist → **Child enrollment context**"). The mapping is not a
judgement call; it is already authored.

**Reconciliation with [`../operator/canonical-interaction-model.md`](../operator/canonical-interaction-model.md)
and [`../operator/operational-grain-doctrine.md`](../operator/operational-grain-doctrine.md) (both
canonical) — no competing doctrine is created here.** The Operational Grain Doctrine's §2.1 table
labels its `case | child | candidate` column "Row Grain". Under the vocabulary above that column is the
**subject-type / attention axis**, not Stage-owned Row Grain — the label predates the split. Its
substance is **unchanged and stands**, and it already anticipates the two axes:

- its table separates **Row Grain** from **Subject Entity** (`opportunity_id` · `ocm_id` ·
  `placement_candidate_id`) from **"Focus Panel Opens On"**, recording the latter as
  **"Opportunity (child-scoped)"** and **"Opportunity (candidate-scoped)"** — which *is* the §0.5.2
  resolution: Record of Truth broader than the row, scope preserved;
- **Rule G-4** already requires cross-grain reach to declare an explicit `targetChildId` /
  `targetCandidateId` **visible to the operator** — conditions 1, 2, 5 and 6 of §0.5.2;
- **§2.2** already requires child/candidate rows to carry `caseRef.opportunityId` — the explicit
  Row Grain ⇄ Record of Truth link.
- **Rule G-5** ("the Focus Panel is always case-grain … `context.subject.id` is always an
  `opportunity_id`") is a statement about the **Record of Truth** the panel opens on — not about
  Record of Attention. Read as Record of Attention it would contradict
  `canonical-interaction-model.md:102`; read as Record of Truth (its plain sense, and the sense its own
  table's "Focus Panel Opens On" column uses) the two agree. **Runtime binds `Operational Subject` to
  Record of Attention, and must never bind it to G-5's `context.subject`.** That naming collision is
  the single trap in this area.

## 0.5.2 — G9 CLOSED: a contextual composition, not a grain violation

> **Question (stale):** is opening a family/case Focus Panel from a child-grain row a legitimate hop
> or a grain violation?
> **Answer: legitimate contextual composition.** It was only ever a "violation" under the collapsed
> model where Row Grain and Record of Attention had to be equal.

The canonical interaction model already settles it: the same Record of Truth opened from different
perspectives carries a **different Record of Attention and Context Frame**
(`canonical-interaction-model.md:97–105`) — and **Waitlist is explicitly a child enrollment context**:

| Entry perspective | Record of attention | Context Frame |
|---|---|---|
| Waitlist | **Child enrollment context** | **Waitlist** |

A child-grain queue row may therefore open an operational composition whose **Record of Truth is
broader than the row** (the family/case entity), **provided all ten conditions hold**:

1. Record of Attention remains explicitly the **selected child's enrollment context**.
2. The active child is **visible and unambiguous**.
3. Context Frame remains the **Work View the operator entered from**.
4. **Current Work resolves for that Record of Attention** (Current Work belongs to Record of Attention).
5. Child-scoped actions operate on **the child or child relationship they claim to affect**.
6. Broader family/case truth may provide **context** but may **not erase the selected child scope**.
7. Runtime **never silently switches** Business Process, Work View, Queue, or Context Frame.
8. Record of Attention outside the active Work View ⇒ Runtime reports **`out_of_scope`** — it does
   **not** redirect.
9. No active Work View ⇒ **`no_active_view`**.
10. Membership holds ⇒ **`in_scope`**.

`FocusPanelScopeState` remains exactly **`in_scope` · `no_active_view` · `out_of_scope`**. Attention
changes are **downward-only**. Runtime **may offer** a context switch; it **may never perform one
automatically**.

## 0.5.3 — What this changes below

- **§1.5** ("Subject grain — one per Work View") is **superseded by §0.5.1**. Its constitutional rule
  demanded rows, default subject, counts, and Focus Panel subject all be *the same grain* — that is the
  collapsed model. The binding rule is now: **a Work View declares exactly one Row Grain; its rows and
  counts are that Row Grain; its Record of Attention is that row's attention identity; and the Focus
  Panel's Record of Truth may be broader iff §0.5.2's ten conditions hold.**
- **§3** — G6 and G9 are **closed** (see the amended table).
- **§5** ("Required BEFORE D1") — **satisfied**. No Product decision remains outstanding.
- **§6** — the server-side invariant is **not** grain *equality*. It is: Row Grain is **explicit**, and
  the Row Grain ⇄ Record of Attention ⇄ Record of Truth relationship is **explicit and valid**, or the
  answer is an honest error.

---

# 0 — The finding

The platform has **two independent predicate systems over the same rows**, joined by a heuristic.

| | Work View | Queue lane |
|---|---|---|
| Where | `departments.metadata.lifecycle_builder_v1…work_views_v1` | `work_units.queue_definition` |
| Authored or generated | authored (`persistWorkViewsV1.ts:54`) | **generated — from STAGES** (`lifecycleStageWorkUnitQueueSync.ts:72`) |
| Filter language | `equals · is_any_of · date_between …` (`workViewsConfigV1.ts:18`) | `status · field · date · assignment · exception` (`queueDefinitionSchema.ts:5`) |
| Fields it may filter on | Stage, Campus, Program, Room, Needs Attention | **`{status_key, created_at, updated_at}`** (`QueueService.ts:223`) |

Neither generates the other. Their only link is `compat_queue_key`, bound by
`byLabel ?? byKey ?? lanes[index] ?? lanes[0]` (`workViewsRuntimeConvergence.ts:53`) — a **positional
fallback that binds view #3 to lane #3 with no semantic relation**.

Consequences, all observed:

1. **A Work View can express predicates a lane structurally cannot.** A stage-scoped lens must execute
   through a status-only allowlist. When status collapsed to `{open, closed}`
   (`20260711000100`), stage lanes lost the vocabulary to express themselves →
   `LIFECYCLE_QUEUE_FILTERS_EMPTY` (`lifecycleStageQueueFilters.ts:76`). **This is the empty New Leads
   queue.** It is not a seed bug; it is the model.
2. **Membership is computed three ways**: lane filters in `QueueService`; Work View predicates via
   `computeOperationalProjection`; and a third hand-written predicate in `workUnitLeadMembership.ts:39`,
   whose own header records that they *"diverged because each invented its own predicate."*
3. **A pill and its Work View can disagree by construction** — the pill counts a *lane*
   (`lifecycleWorkUnitShellPills.ts:17` → `loadQueueDefinitionBundle`), the view counts a *predicate*,
   and `compat_queue_key` may have married them by array index.

This is why successive sprints keep rediscovering the same confusion. It is one defect, not many.

---

# 1 — Canonical Product Model

Derived from frozen doctrine and existing code, not invented.

```
Business Process
  └─ defines STAGES            durable process position; declares GRAIN
       ↓
STAGE MEMBERSHIP               process_instances.stage_key
                               written ONLY by outcome execution / intake
       ↓
WORK VIEW (= the LENS)         the operator's navigation tier; PRODUCT CONFIGURATION
                               predicates · sort · layout · default-subject strategy · ONE grain
       ↓
OPERATIONAL PROJECTION         THE ONE EVALUATOR — evaluates the lens exactly once
       ↓
  ├─ QUEUE ROWS                (Operational)
  ├─ DEFAULT SUBJECT           from the same evaluated page (Operational)
  ├─ FOCUS PANEL ELIGIBILITY   (Operational)
  └─ COUNTS / PILL COUNTS      (SETTLEMENT — must never gate commit)
       ↓
FOCUS PANEL                    the committed subject within the active lens
       ↓
OPERATIONAL COMMIT
```

**The Queue is not a tier. It is the execution of a lens.**

## 1.1 Stage — durable process position

Exactly one of the candidates is true: **durable process position**. Evidence:

- `20260711000100`: *"Stage is explicit process state, written by outcome execution — never derived
  from status lists."* Column comment: *"Membership owner for stage cohorts."*
- Engine owns it agnostically: *"Subject · context · stage · state"* (`process/engine/index.ts:2`).
- Runtime owner is `process_instances.stage_key` (`20260713000000`); `opportunities.stage_key` is the
  family/context stage and coalesce fallback.

Everything else is **consequence**:
- Stage is **not status**. Status is durable relationship truth (`open|closed`). Three axes
  "never collapse into one status model" (`enrollment-process-runtime.md:56`).
- Stage is **not queue membership**. Membership is *computed from* stage.
- Stage is **not presentation**.

## 1.2 Work View — product configuration, and the operator's navigation tier

- Doctrine already says so: *"Queue lanes are execution/runtime; stages are lifecycle/governance.
  Neither is the operator's primary navigation tier — **Work Views are**"*
  (`docs/platform/core/business-process-system.md:108`).
- Slug precedence `work_unit_key → work_view → queue_lane_key` (`resolveWorkUnitByRouteSlug.ts:164`)
  makes the view outrank the lane.
- The **Constitution** treats the lens as an attention scope: *"Across lenses — 'show me Waitlist
  instead' — a new set of work must be prepared."*
- The **Kernel** keys preparation by `(scope, target, **lens**, principal, tenant)`.

A Work View therefore owns:

| Belongs in a Work View | Today |
|---|---|
| stage scoping | via predicates ✓ |
| field predicates · match | ✓ (`workViewsConfigV1.ts:41`) |
| sort | ✓ |
| surface / layout assignment | ✓ (`queue_layout_id`, `focus_panel_layout_id`) |
| **default subject strategy** | ✗ missing — required by U-P4 |
| **grain (exactly one)** | ✗ lives on the *stage*, not the view |
| grouping | ✗ (lane-only today) |

## 1.3 Queue — runtime execution, generated

**Runtime.** Not product. It must be **generated from the Work View**. Today it is generated from
**stages** — that is the fork. Both cannot be true; the lane must stop being an authored predicate
system and become the projection's output.

## 1.4 Operational Projection — one evaluator

`operationalProjection.ts` **already declares this doctrine**; `aggregateWorkViewTotals.ts:1`
honours it (*"same base rows + same evaluator ⇒ identical counts"*). Pills do not
(`business-process-system.md:197` admits the conversion is the outstanding follow-up).

Yes — the same projection must produce rows, counts, subject membership, and Focus Panel eligibility.
**But phase differs from source**: the Constitution assigns *"every count, every metric"* to
**Settlement**. One evaluator, one page; counts are emitted from it but **must never gate Operational
Commit**.

## 1.5 Subject grain — one per Work View

The rule **already exists**: *"A flat Work View cannot mix grains — each row type produces a different
queue entry shape"* (`stageGrainV1.ts:128`); Rule G-1 *"A surface cannot be grain-ambiguous"*
(`operational-grain-doctrine.md:52`). Grain is **not presentation**: it is *"a property of the
underlying database row"* (`:42`).

It is unenforced: authoring-time advisory with three bypasses (catch-all, unscoped views, no runtime
guard), while `computeOperationalProjection:267` *actively builds* dual-grain counts
(`primaryGrainKind: family` + `supportingGrainKind: child` — "3 Families · 5 Children" over rows of a
single shape).

> **⚠ SUPERSEDED BY §0.5.1.** The rule below is the *collapsed* model: it required a view's rows,
> default subject, counts, **and Focus Panel subject** to all be one grain. That conflated **Row Grain**
> with **Record of Attention** and is why the "three vocabularies" looked irreconcilable. Retained for
> provenance; **do not implement as written.**

**Constitutional rule to bind (SUPERSEDED — see §0.5.1 for the binding rule):**

> ~~A Work View declares exactly one grain. Its rows, its default subject, its counts, and its Focus
> Panel subject are that grain.~~ A view whose stages disagree on **Row Grain** is invalid
> configuration, and is rejected at author time **and** refused at runtime. *(The Row-Grain-agreement
> half stands; the "Focus Panel subject is that grain" half does not — see §0.5.2.)*

~~Blocking sub-problem: **three vocabularies for one idea**~~ — **CLOSED (§0.5.1): they were never one
idea.** `family|child|person|account|work_item` (`stageGrainV1.ts:8`) is **Row Grain**, owned by Stage.
`family|child` count buckets are a **derived** presentation bucket over it. `case|child|candidate`
(`queueMembershipV1.ts:8`) is a **compatibility surface** carrying record/attention identity — it is
**not** Row Grain. `case` and `family` are therefore not "the same grain under two names": `case` is a
Record-of-Truth identifier on the attention axis. The ad-hoc bridge at `operationalProjection.ts:223`
is exactly the boundary where the mapping must become **explicit and documented** rather than implied.
No universal enum is required, and none is created.

---

# 2 — Current Product Model (as built)

```
Stages ──generates──► Queue lanes ──(status-only allowlist)──► rows ──► pills
   │                       ▲
   │                       │ compat_queue_key: byLabel ?? byKey ?? lanes[index] ?? lanes[0]
   │                       │
   └──────► Work Views ────┘ ──► computeOperationalProjection ──► counts (unused by pills)
                                       │
            workUnitLeadMembership ────┴──► a THIRD predicate
```

---

# 3 — Gap analysis

| # | Mismatch | Why it exists | Runtime depends? | Product depends? | Resolution |
|---|---|---|---|---|---|
| G1 | Lanes generated from **stages**, not Work Views | lanes predate Work Views | yes (rows) | no | **Product changes**: projection evaluates the lens |
| G2 | `OPPORTUNITY_FIELD_ALLOWLIST` = 3 columns | injection guard written pre-stage | yes | no | widen to a typed predicate surface incl. stage, or retire with G1 |
| G3 | `compat_queue_key` positional binding | migration bridge | yes | no | delete with G1 |
| G4 | Membership computed 3× | each invented its own | yes | no | one evaluator; delete the other two |
| G5 | Pills read lanes | acknowledged debt (`:197`) | no | no | **Runtime absorbs** — pills are Settlement |
| G6 | 3 grain vocabularies | organic | yes | ~~yes~~ **CLOSED §0.5.1** | **CLOSED** — not 3 grains: Row Grain (Stage-owned) + Record of Attention + a compatibility surface. Map at the boundary; no universal enum |
| G7 | Dual-grain counts by design | built to paper over G6 | no | yes | counts are **Settlement** and are emitted at the view's one **Row Grain**; a supporting count of another grain is a *derived bucket*, never a second declared grain |
| G8 | Two stage columns + coalesce | PI migration incomplete | yes | no | **Runtime waits** — separate migration |
| G9 | Focus Panel always case-grain (G-5) | deliberate | yes | ~~yes~~ **CLOSED §0.5.2** | **CLOSED** — legitimate contextual composition. Record of Truth may be broader than the row iff the ten conditions in §0.5.2 hold; it was only a "violation" under the collapsed model |

---

# 4 — Runtime implications

**Where K2 begins is already frozen.** Preparation is keyed by
`(scope, target, **lens**, principal, tenant)`.

- K2 consumes the **Work View (lens)** — not Stage, not Queue.
- Stage is an *input to the lens definition*, resolved inside the projection.
- Queue is the projection's *output*, never K2's input.
- U-P3 already states it: *"Queue truth: the **active lens's rows** … from Records via the queue
  evaluator."* U-P4: default subject from *"the same evaluated page."*

So D1's provisioning answer calls **one evaluator, once, for the active lens**, and returns
U-P1…U-P7. Counts are excluded from the answer (Settlement, §1.4).

---

# 5 — Required BEFORE D1 — **SATISFIED (2026-07-16)**

1. ~~**Decide G1**~~ — **DECIDED**: the projection evaluates the lens. The lane stops being an
   authored predicate system. Queue Lanes and Queue Definitions are **not** Product concepts.
2. ~~**Unify the grain vocabulary** (G6) — one enum, one meaning.~~ — **CLOSED, and the premise was
   wrong** (§0.5.1). One enum was never the answer: Row Grain and Record of Attention are distinct
   concepts and keep distinct vocabularies, joined by an explicit boundary mapping.
3. ~~**Answer G9**~~ — **ANSWERED** (§0.5.2): legitimate contextual composition under ten conditions.

**No Product decision remains outstanding.** D1 is unblocked.

# 6 — Required INSIDE D1

- Provisioning answer = lens → projection → rows + default subject + operational composition.
- No lane bundle on the critical path; no counts in the answer.
- **Row Grain is explicit in the answer**, and the **Row Grain ⇄ Record of Attention ⇄ Record of Truth
  relationship is explicit and valid**, or the answer is an honest error. This is **not** grain
  equality: rows carry the view's one Stage-owned Row Grain; the Record of Attention is that row's
  attention identity; the Focus Panel's Record of Truth may be broader iff §0.5.2's conditions hold.

# 7 — Required AFTER D1

- Convert pills to the projection (Settlement).
- Delete lane predicates, `compat_queue_key`, and `workUnitLeadMembership`'s third predicate.
- Retire `opportunities.stage_key` coalesce (G8).

---

# 8 — Is implementation obvious after this?

**Yes.** The canonical model is already latent in the codebase — `operationalProjection.ts` declares
the one-evaluator doctrine, `business-process-system.md:108` already names Work Views the navigation
tier, and the Kernel already keys preparation by lens. Nothing needs inventing. What is required is a
**deletion**: the lane must stop being a second predicate system.

The single decision that unblocks everything is **G1**.

---

# 9 — Participant position owns participant navigation

Three rules, each learned from a defect that shipped.

## 9.1 A participant's destination resolves from the participant's own position

A case's `work_unit_id` answers at **family grain**. A child in that case can sit in a different
stage entirely, so the family answer cannot be right for both siblings — and one of them is sent to a
queue that does not contain them, where nothing composes.

> **Participant-specific navigation resolves from the participant's configured operational position.
> Family/case Work Unit context is a FALLBACK and must never overwrite a known participant Work View.**

Search displayed the child's own stage correctly (`Enrollment — Waitlist`, read from
`process_instances.stage_key`) while committing the family case's `lifecycle_wu_lead`. The label and
the destination were computed at two different grains, and only the family one reached attention.

`fetchStageWorkViewTargets` resolves participant stage → stage-bound Work View. Null is an answer: a
stage with no such view falls back to the case's unit rather than inventing a destination. A household
or a parent owns no stage of its own and keeps its case's canonical context — it must not inherit
whichever child was enumerated first.

## 9.2 Stage binding is by configured identity, never by label

A view holds a stage when its `compat_queue_key` equals `primaryQueueKeyForLifecycleStage(stage)`.
Labels are operator-editable and reorderable; resolving through them means a rename silently moves
where a participant lands, and a tenant that reuses a word resolves the wrong view.

> **Filterless Work Views are process-wide CATCH-ALLS and are not stage-bound lanes.**

`normalizeCatchAllWorkViewCompatBinding` strips `compat_queue_key` from any view without
`filters_v1`, because binding a catch-all to one stage's lane would make "All" report that stage
instead of everything. "Has a stage lane" and "is a catch-all" are therefore mutually exclusive, and a
catch-all can never satisfy a stage-specific lookup — which matters because it is exactly the view a
loose lookup would fall into for *every* stage, making a broken participant-grain resolution look
like it worked.

## 9.3 A Work View is certified by its terminal and its composition

`aria-selected` and the projected `?work_view_id=` both move for a view whose answer is an ERROR
terminal: the pill lights up, the address updates, and nothing composes. A certification asserting
only those two reported a view as passing while its Focus Panel collapsed to zero cells.

> **Operational success requires an operational runtime terminal AND useful composition. Selected pill
> and URL projection alone are not proof.**

A view the tenant's configuration cannot make operational must report its actual terminal and reason
(e.g. `no_truthful_primary_action`) rather than masquerading as a successful navigation — and must be
classified from the runtime's own answer, not a hardcoded list, so repairing the configuration moves
it into the operational set with no test edit.

## 9.4 Deferred

Browser certification of two siblings simultaneously occupying two *distinct operational* stage-bound
Work Views remains deferred: it requires a Business Process configuration supplying two operational
child stages, and the current certification tenant has exactly one (`enrolling`). Stage
`primary_action` must not be changed merely to satisfy a fixture — that would alter what the process
asserts an operator can do. The participant-grain rule above is proven deterministically instead.

# 10. Work View membership — cohorts, not stages

## 10.1 The distinction

A **Process stage** answers *where is this participant in the Process*.
A **Work View** answers *which configured operational cohort does this subject currently belong to*.

They are different questions, and they come apart in ordinary configuration.

> **Work Views are overlapping configured cohorts. A subject may belong to several at once, and stage
> position neither establishes nor limits that membership.**

Live evidence, from the published Firefly configuration:

```
Tours   row_grain_v1: family
        has_active_tour = true  AND  tour_date = next:7:days
        (deliberately NO stage predicate — that kept Waitlist families out)
```

The Kurzman Family sits at stage `waitlist` and is simultaneously in **All** and **Tours**. No
stage→view mapping can express that, and one that tried would have to invent it.

## 10.2 Membership is evaluated, never inferred

```
subject
  → canonical operational row at the correct grain
  → configured Work View evaluation
  → fully-supported membership
  → access
  → operational availability
  → destination
```

Not `stage → one guessed Work View`, and not `family Work Unit → child destination`.

The evaluation reuses the runtime's own machinery — `resolveLensRowGrain`, `lensStageKeys`,
`childMatchesLens`, the shared predicate evaluator, EPP mission resolution. **Any surface offering a
Work View as a destination must consume the same membership truth the view itself uses**, or the two
will disagree about who is in it.

## 10.3 Grain is a membership rule

> **A family-grain lens is not a place a child can be, so it is not a destination to offer.**

The row in a family lens is the case. Offering it for a child would land the operator on a family row
and present it as the child. The consequence is deliberately symmetric: a household does not inherit
its children's lenses, and children do not inherit their household's.

## 10.4 Two guards a destination needs that a count does not

**Fully-supported evaluation.** The predicate evaluator is deliberately fail-open — an unsupported
field or operator passes the row through under AND, because a count would rather over-include than
hide work from an operator. A *destination* cannot inherit that generosity: an unevaluated predicate
is not evidence of membership, and acting on it offers a view that does not contain the subject.
Callers that must prove membership read `recordWorkViewMembership(...).fullySupported`.

**Operational availability.** Membership and enterability are separate facts. A view whose answer
would be `no_truthful_primary_action` on arrival must not be offered as a normal destination, and must
not be silently rerouted to another view. The rule lives once, in
`workViewDestinationOperability.ts`, and the provisioning answer itself calls it — so a destination
cannot be offered that the answer would refuse.

The rule is legitimately **grain-specific**: a family surface claiming operational on identity alone
is not operational, while a child surface must stay enterable where the tenant configures no child
actions at all. Reading them as one rule hides Waitlist from a waitlisted child — the one destination
that is actually true.

## 10.5 Stage alignment ranks; it never establishes

Stage remains a useful signal: it orders destinations and is the fallback host when nothing better
can be proven. It is no longer proof of eligibility. Binding through `compat_queue_key` cannot express
a booking-predicated or catch-all lens, and the runtime authority declines to read that key as
identity — *"a lane binding assigned by array position"*.

> **Ranking may reorder truthful destinations. It may never create one.**

## 10.6 The worked example

| Subject | Grain | Truthful operational memberships |
|---------|-------|----------------------------------|
| Lennon Kurzman | child | **Waitlist** |
| Wrigley Kurzman | child | resolved independently at child grain |
| Kurzman Family | family | **All**, and **Tours** while the booking predicates hold |

Lennon does **not** inherit All or Tours: both are family-grain. The household does **not** inherit
Waitlist: it is child-grain. The two sets are disjoint, and a union in either direction is a
fabrication.
