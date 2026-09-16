# POST-DEPLOYMENT QA — UPSTREAM SLICE 5: PROVISIONING / PROJECTION CONVERGENCE

Run `erun_bbfd12d1acfa73e2` · base `13f581bc2` · repair `49c2c3ebc`
Deployed SHA under investigation: `ec8cdaa605da374d1bbec9e389b233f13c76709f`
**Not merged, promoted or deployed.** S8-2 untouched. Cards and renderers untouched.

## CONVERGENCE VERDICT: `PARTIALLY_SHARED`

The instruction's hypothesis was that one boundary explains all three symptoms. **It is half true, and
the half that is false matters**, so it is reported rather than rounded up to `SHARED_ROOT_CAUSE`.

| | Attendance (B) | Health (C) | Household / Children (A) |
|---|---|---|---|
| Commit frame | **HAS** the child | **HAS** the child | **LACKS** family identity |
| Settled frame | **LOSES** the child | **LOSES** the child | **HAS** family identity |
| Direction of loss | commit → settlement | commit → settlement | **opposite** |
| Same defect? | **identical — same line** | **identical — same line** | different |

**B and C are one defect, not two.** Both are gated on the single expression
`context.participantScope?.customerMemberId`, and neither `buildAttendanceCardVM` nor
`buildHealthSafetyCardVM` can return null — so that expression being falsy is the *only* route to
`unavailable` for either card. One repair fixes both.

**A is not that defect, and the stated hypothesis is false for it.** Nothing is "not preserved into
settlement" for Household/Children: the commit frame never held the family identity in the first
place. Settlement is where those facts finally arrive. Calling A part of the same root cause would
have pointed the next repair at the wrong end of the pipeline.

**The shared boundary, stated exactly:** *the two frames build different `OperationalContext` values
and neither forwards what the other knows about child-grain identity.* Both routes call the same
producers, which is the design; the contexts disagree about the subject, which is not.

The drawer route's own comment claims the opposite — "Running them in BOTH frames is what makes
settlement a change of TRANSPORT rather than of AUTHORITY" — and
`composeOpportunityDrawerViewModel` says "One context, both consumers." On the child-grain path both
statements were untrue in effect.

---

## TRACK B + C — ATTENDANCE AND HEALTH · **REPAIRED**

### The producers

| | Commit (~13.5 s) | Settlement (~20.1 s) |
|---|---|---|
| producer | `projectFocusPanelCardProducers` | **the same function** |
| invoked from | `composeProvisioningAnswerForRoute.ts:127` | `app/api/admin/view-models/drawer/opportunity/[id]/route.ts:127` |
| context builder | `buildCommitCriticalOperationalContext` | `buildOperationalContext` |
| composed for | the **CHILD** | the **FAMILY opportunity** |

### The exact READY → UNAVAILABLE cause

```ts
const customerMemberId = context.participantScope?.customerMemberId ?? null;   // :117
…
customerMemberId ? buildAttendanceCardVM(…) : Promise.resolve(null)            // :172-180
…
attendance.value ? { state: "ready", data: attendance.value } : unavailable()  // :213-219
```

Neither VM builder ever resolves null. **Therefore `unavailable` ⇔ `participantScope.customerMemberId`
was falsy.** There is no other path.

* **Commit** states it: `participantScopeFromChildSubjectTruth(subjectIdentityTruth)` reads
  `child.customer_member_id` + `child.process_instance_id`, written only by the child-grain composer.
* **Settlement** must re-discover it. The family record carries no `child.*` keys, so the fallback
  matched `attention_subject_id` — a **`process_instances.id`** — against candidates built from
  `truth._inquiry_children`, which are intake metadata keyed by inquiry-child `id` and a best-effort
  `customer_member_id`. **Different id spaces**, so `not_found` for *every* child.
* The client overlay then repaired `participantScope` but **not** `operationalProjection.cards`,
  leaving a child-scoped context beside a scope-less projection — which is why the card rendered
  `unavailable` rather than `provisioning`.

**The control that proves the mechanism:** Financials stayed `ready` through the same transition. It
is gated on `customer.id` (household grain), which survives in family truth. Only the two
`customerMemberId`-gated producers flipped. That differential is exactly what this cause predicts and
nothing else does.

### The authoritative semantic contract

`unavailable` means **no subject to read for** — the contract's own words name the *subject*, never
the data:

> "`unavailable` and `error` are different facts: **no subject to read for** is ordinary, a failed read
> is not" — `focusPanelOperationalProjectionContract.ts`

> "Absent is ordinary — **a family row with no scoped child** has no attendance to show" — the
> producer's own gloss

And the `ready`-with-explanation shape already exists and is already canonical:
`AttendanceCardVM.unavailableReason` / `HealthSafetyCardVM.unavailableReason`, carried on a
`{state:"ready"}` result — which is precisely what the commit frame produced at 13,551 ms.

**So the settled `unavailable` was a correct verdict about a broken input, not a correct verdict about
the child.** The producer was truthful; it genuinely had no subject.

### The repair

`web/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity.ts` (new) —
one indexed lookup:

```ts
.from("process_instances")
.select("id, subject_type, subject_id, context_id")
.eq("id", participationId)
.eq("org_id", orgId)
.eq("context_id", opportunityId)
```

`process_instances.subject_id` **is** the participation's `customer_member_id` — the child-grain queue
reads exactly that column for exactly that purpose, so no second definition of "which child" is
introduced.

* **`composeOpportunityDrawerViewModel`** resolves it and passes `resolvedParticipant`.
* **`buildOperationalContext`** prefers it over the candidate scan, and never over `childSubjectScope`
  (a frame told its subject directly needs no resolution). Presentation (name, photo) is still
  borrowed from a matching candidate; identity comes from the resolver.

**Why a read, and why this one.** The settled composition holds no participation rows, and the only
in-truth candidate set is intake metadata whose `customer_member_id` is frequently absent. The
alternative — trusting a client-supplied member id — would **delete an authorization boundary**: any
caller could name another family's child and receive their health data. Resolving instead of trusting
keeps the refusal the route already promised: the row must be this org's and must hang off *this*
opportunity. One primary-key lookup, on the **settlement** path (not commit), only when a participation
is named.

**A guard that would have failed silently, caught before it shipped.** The first draft tested
`subject_type !== "customer_member"`. The canonical value is **`"child"`** — read from
`enrollmentContextResolver`, which filters `process_instances` on exactly that. The wrong literal
would have rejected every real row and reproduced the very silent absence this repair closes.

### Against the nine repair conditions

| Condition | How it is met |
|---|---|
| 1 canonical authority preserved | member read from `process_instances.subject_id`, the column the child-grain queue already treats as authoritative |
| 2 existing producer/projection ownership | no new owner; the resolver feeds the existing context builder, which feeds the existing producers |
| 3 no card patched around upstream loss | **zero** card or renderer changes |
| 4 no queue rows as authoritative detail | queue/intake metadata is used only for *presentation*; identity never comes from it |
| 5 no new fetch unless unavoidable | one lookup, justified above; the only alternative removes an authorization boundary |
| 6 no cache/runtime/readiness systems | asserted by test (`useState`/`useEffect`/`Cache`/`setTimeout`/`localStorage` all absent; exactly one `.from(`) |
| 7 org/site/subject grain preserved | scoped by `org_id` **and** `context_id`; a foreign participation resolves to null |
| 8 latest-subject-wins | the id travels on the same request that names the subject; no cached scope |
| 9 no false commit-readiness claims | commit admission untouched; this repairs settlement only |

---

## TRACK A — HOUSEHOLD / CHILDREN · **NOT REPAIRED, AND DELIBERATELY SO**

### The authority map

| Fact | Authoritative owner | Available pre-provisioning | In the producer (child lens) | Forwarded today | Consumed at commit | Settlement-only by design? |
|---|---|---|---|---|---|---|
| `customer.id` (household account) | `opportunities.customer_id` | yes | **yes** — via `childComposition.family.customerId` | **yes** | yes (Financials) | no |
| `child.customer_member_id` | `process_instances.subject_id` | yes | yes | yes | yes | no |
| `person.primary_contact_name` | `persons` (via `opportunities.primary_person_id`) | id only | **id only, no name** | no | no | **effectively yes** |
| `_inquiry_children` (canonical roster) | `enrichOpportunityRowsWithChildrenForCompactQueue` (reads `customer_members`) | no | **no** | no | no | **effectively yes** |

### The loss point

On a child lens the family-enrichment page is built by filtering `baseRows`:

```ts
const byId = new Map(((baseRows ?? []) as …).filter((o) => familyIds.includes(String(o.id)))…);
if (!familyPage.length) return [];
```

and the file's own comment records that **`baseRows` is empty there** ("a child lens pages
participations, so `baseRows` is empty and `enriched` with it… measured `baseRowsLen: 0`"). So
`enriched` is `[]`, `familyEnrichedForChild` is null, `chosenEnrichedRow` is `{}`, both identity facts
are null, `hasSubjectIdentityTruth` is false — and `household`, `children` **and** `readiness_kpi` all
fail commit admission. That is exactly the 20,113 ms measurement, and it defeats the stated intent two
hundred lines above ("enrich the FAMILY opportunity(s) so commit-critical Household / Children cards
can know person + sibling roster").

### Why the obvious fix was rejected — three measurements, not opinions

`OPP_SELECT` already reads `metadata` and `primary_person_id` for the family opportunity, and the
normalizer discards all but `stage_key`/`customer_id`. That looked like a free forwarding fix. It is
not:

1. **Canonical `_inquiry_children` is a READ, not a column.** It is produced by
   `enrichOpportunityRowsWithChildrenForCompactQueue`, which queries `customer_members`. Raw
   `metadata.inquiry_children` is only the weakest fallback in the family-grain chain.
2. **Measured:** `buildChildrenCardModel` over a hand-shaped `_inquiry_children` row returns
   **"No children linked"** — `applyCanonicalChildrenCollectionPolicy` rejects a non-canonical row. So
   forwarding the thin shape would admit a card that *falsely reports no children*.
3. **Measured:** `buildHouseholdCardModel` with children-only truth renders **"Primary contact on
   file"** with Primary Contact / Secondary / Phone / Email all null — asserting a contact that is not
   known. That is a false commit-readiness claim (**condition 9**), and the contact *name* cannot be
   forwarded because `OPP_SELECT` carries only `primary_person_id`.

**Answer to Track A question 7: NO** — these facts cannot be obtained without another fetch. The
minimal correct repair is one bounded `opportunities.in("id", familyIds)` read inside the *existing*
concurrent `enrichedPromise`, which would then feed enrichment machinery that is already wired and
currently receives an empty page.

**Not implemented here**, and this is a recommendation rather than a refusal: the instruction prefers
forwarding over refetching and says "do not force every card commit-critical", and the cost lands on
the **commit** path — whose dominant expense is already server response time — to move three
reference-tier cards earlier. That trade is a master-thread decision. The loss point, the exact
repair, and its price are all stated above so it can be taken in one step.

---

## P0-6 — EXPECTED FIRST-CARD COMPOSITION (child lens, after this candidate)

| Card | Classification | Basis |
|---|---|---|
| **Business Process** | `MEANINGFUL_AT_COMMIT` | Repair Slice 4 — admitted on `businessProcess.stageKey` |
| **Current Work** | `MEANINGFUL_AT_COMMIT` | `stageWorkRuntime != null \|\| nextActionLabel != null` (superseded in presentation by Business Process) |
| **Attendance** | `MOUNTED_SELF_LOADING` | mountable on `child.customer_member_id`; content is its own read |
| **Health & Safety** | `MOUNTED_SELF_LOADING` | identical binding |
| **Financials** | `MOUNTED_SELF_LOADING` | mountable on `customer.id`, which the child lens forwards |
| **Household** | `SETTLEMENT_ONLY_BY_DESIGN` *(on a child lens, pending the Track A decision)* | contact name needs a person read |
| **Children** | `SETTLEMENT_ONLY_BY_DESIGN` *(same)* | canonical roster needs a `customer_members` read |
| **Readiness KPI** | `SETTLEMENT_ONLY_BY_DESIGN` *(same)* | shares Household's identity basis |

On a **family** lens Household / Children / Readiness remain `MEANINGFUL_AT_COMMIT` — their specs and
predicates are correct and were not touched. The classification above is child-lens-specific, which is
the distinction the earlier P0-6 note was missing.

**What this candidate changes for the settled frame:** Attendance and Health now settle `ready` with
their own explanation for a scoped child, instead of `unavailable`. That closes the LESS INFORMATIVE
transition measured in Slice 5 — **pending deployed verification, which this slice does not claim.**

---

## GATES

| Gate | Result |
|---|---|
| Phase-convergence suite (new) | **14/14 pass** |
| Planted defect (remove the resolved-participant arm) | **5 fail, including THE GATE** |
| Prior repairs + producer/readiness contracts | **153/153 pass**, 11 files |
| `vac run typecheck` | **rc=0** |
| Requests added | **1**, settlement path only, justified above |
| Bytes added | one row, three columns |
| Cards / renderers changed | **none** |

Fixture note: the first settled-context fixture threw on `subjectVm.activity.communicationsPreviewVm`.
It was made production-shaped **by enumerating every `subjectVm.*` the builder reads**, not by patching
until green — a fixture that cannot reach the code under test is the green-by-absence this programme
keeps finding.

## P1-1 — CERTIFICATION IMPLICATIONS

1. **Harnesses must exercise real admission/composition.** (Repair Slice 4 proof.)
2. **Harnesses must exercise real producer PHASE TRANSITIONS.** This defect lived entirely in the
   difference between two contexts feeding one producer; no single-phase test could see it.
3. **Source-presence greps cannot certify behaviour.**
4. **Fixtures must be production-shaped**, and shape must be *enumerated from the consumer*.
5. **Harness instrumentation itself needs planted-defect validation.**
6. **New:** a locked test can describe the exact deployed symptom and still not catch it.
   `cardEmptyStateSemantics.test.ts` names this degradation — "a state that explained itself… settled
   into a bare absence" — and passed throughout, because Repair Slice 3 fixed the *renderer* while the
   identical degradation returned from upstream. **A defect class needs a test at every layer that can
   produce it**, not at the layer where it was first seen.

## LEDGER

| Finding | Status |
|---|---|
| P0-1 Workspace loader | CLOSED — deployed-verified |
| P0-5 Work View acknowledgement | CLOSED — deployed-verified |
| P0-2 Business Process commit admission | Repaired (Slice 4) — deployed verification owed |
| P0-3 / P0-4 presentation contract | CLOSED — deployed-verified |
| **Attendance / Health settle `unavailable`** | **REPAIRED — deployed verification owed** |
| P0-6 Focus Panel settlement | Contract now stated per lens; depends on the two owed verifications + the Track A decision |
| Household / Children / Readiness on a child lens | **OPEN — loss point proven, repair specified, NOT implemented (needs one read; master-thread call)** |
| S8-2 | BENEFICIAL / KEEP — untouched |
| Current Work line on the commit BP card | OPEN — pinned by Repair Slice 4, unattributed |

### Remaining blockers

1. **Deployed verification** of the two repairs now standing locally (P0-2 admission, and this one).
2. **The Track A decision:** accept one bounded read on the commit path, or accept Household /
   Children / Readiness as settlement-only on a child lens. Either is coherent; the evidence for both
   is above.

### `READY_FOR_SECOND_AND_FINAL_STAGING_PROMOTION`

**Yes for promotion; no for "final".** The candidate carries two repairs whose only remaining question
is deployed behaviour, and both are cheap to verify in one cold walkthrough. But naming this promotion
*final* would presume the Track A decision and the two verifications have already gone well. Promote to
measure; keep the programme open until the measurements are in.

**Required deployed measurements for this candidate**, on a **child-grain** Work Unit (Waitlist):

1. Cold entry, sample Attendance and Health at first cards and at settle. **Required: neither becomes
   `data-*-empty="unavailable"` for a scoped child**; a child with no enrolment must keep its
   explanatory `ready` state across the transition.
2. Business Process present and stating its stage at first-card time (Repair Slice 4's owed check).
3. Confirm Financials is unchanged — it is the control for this mechanism.
4. Record whether Household / Children still arrive only at settlement. They will, until Track A is
   decided; that is expected, not a regression.
