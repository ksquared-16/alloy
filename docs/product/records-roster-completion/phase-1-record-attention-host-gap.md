---
owner: platform
status: BLOCKED — architecture decision required
last_reviewed: 2026-08-14
sprint: records-roster-completion-phase0
base: origin/staging @ a38c1a260
blocks: Records Workspace V1 (Phase 1), workstreams D and I
---

# Records V1 — record-open cannot be honest under the current attention host model

**Verdict: DO NOT ACCEPT Records Workspace V1.** Implementation was stopped before
any Records code was written, at the stop condition the Phase 1 brief defined.

Records is specified as *the durable record-management home*. The post-drawer
attention model is **queue-scoped by construction**: a record is openable only
while an active Work Unit holds it. Those two statements cannot both be true. The
limitation is not a bug, an oversight, or a missing case — it is stated
deliberately in three separate layers, each with a comment explaining why.

Building the Records lists first and leaving the rows to resolve `false` would
reproduce the exact defect Phase 1 asked us to fix
(`/organization/staff?personId=` going nowhere), at workspace scale.

---

## 1. Exact resolver limitation

### Layer 1 — the target type admits only one host

`web/lib/workUnits/operatorFocusTarget.ts:41-47`

```ts
export type OperatorFocusTarget = {
    /** The record whose Focus Panel hosts the subject. */
    host_entity_type: "opportunities";      // ← string literal, not a union
    host_entity_id: string;
    host_work_unit_key: string | null;
};
```

`host_entity_type` is a **string-literal type**. There is no representable
attention target that is not an opportunity. This is a compile-time ceiling, not a
runtime branch that happens to be missing.

### Layer 2 — a person resolves only through a household to an active case

`web/lib/workUnits/operatorFocusTarget.ts:140-183`

```
persons → householdIdForPerson()        // customer_persons ∪ customer_members
        → fetchHouseholdCaseHosts()     // newest opportunity for that customer_id
        → fetchActiveWorkUnitKeys()     // is_active = true only
```

Every hop can legitimately return null, and each null is a designed answer:

| Hop | Null when | Affected |
|---|---|---|
| `householdIdForPerson` | the person is in **no household** | **every staff member** |
| `fetchHouseholdCaseHosts` | the household has **no opportunity** | children of families with no lead/case |
| `fetchActiveWorkUnitKeys` | the opportunity's unit is **inactive** | children whose enrollment case has closed |

`useOperatorRecordFocus.ts:164-168` then requires **both** a host id and a work-unit
key, and returns `false` otherwise.

`RESOLVABLE_ENTITY_TYPES` (`operatorFocusTarget.ts:50-59`) is
`opportunities | customers | households | persons`. **`customer_members` is not
resolvable at all** — a child must be resolved via its `person_id`.

### Layer 3 — a person grain has no Focus Panel subject, by explicit refusal

`web/lib/adminV2/runtime/operationalContext/subjectGrain.ts:33, 47-59`

```ts
export type OperationalSubjectType = "opportunity" | "child";   // closed union

case "person":
case "account":
case "work_item":
    return {
        ok: false,
        reason: `Row Grain "${rowGrain}" has no Focus Panel subject — this surface cannot present it`,
    };
```

Even if layers 1 and 2 were widened, the panel would still refuse a person subject.
The module's own doctrine is that this failure is **a value, never a fallback** —
"a silent `?? "case"` across that seam is exactly how a surface ends up answering a
question it was not asked."

### The platform already says all of this out loud

`web/components/admin/focusPanel/cards/EmploymentCard.tsx:36-41` — *"WHY IT SITS ON
A CASE PANEL: A person has no host Work Unit of its own, so
`resolveOperatorFocusTarget` resolves a Person gesture THROUGH the household to its
case. The case's Focus Panel is therefore the only surface that composes for that
person."*

`web/lib/employment/buildCaseEmploymentProjection.ts:11-19` — *"`resolveOperatorFocusTarget`
types `host_entity_type` as the literal `"opportunities"` … the opportunity payload
is therefore the platform's composition ENVELOPE."*

---

## 2. Affected Staff / Child cases

### Staff — categorically unopenable

`staff.add` writes **`persons` + `employments` only**
(`web/lib/staff/addStaffService.ts`). It writes no `customer_persons` and no
`customer_members` row. Therefore `householdIdForPerson` returns null for every
staff member created the canonical way, and the gesture returns `false`.

A staff member is openable today **only** by coincidence — if they are *also* a
parent or household contact at the centre, whose family has an opportunity, on an
active unit. And when that coincidence holds, the operator does not land on a staff
surface: they land on **that person's family enrollment case**, with the Employment
card as a related-subject projection. For a director asking "show me this teacher",
that is the wrong answer even in the case where it works.

**This is already shipped and already silent.** Roster asks for exactly this gesture
today (`RosterWorkspace.tsx:369-388`, `entity_type: "persons"`, `card_key:
employment`), and `AttendanceWorkspace` offers `onOpenStaff`. For an ordinary staff
member that gesture resolves `false` and the surface withdraws the affordance — the
honest behaviour of a dishonest premise. Records did not create this gap; Records is
the first product that cannot survive it.

### Children — openable only while their case is in an active queue

| Child case | Opens today? |
|---|---|
| In an active Enrollment process, household has an active-unit case | **Yes** |
| Enrolled, enrollment case completed and left the active queue | **No** |
| Household child with no opportunity at all (`scope: "household"` add path) | **No** |
| Household's opportunity exists but its work unit is inactive | **No** |

The Phase 1 brief requires exactly the rows in the "No" band:

> A Child remains visible in Records even when not currently in an active
> Enrollment process, if the canonical household/member record exists.

They can be **listed**. They cannot be **opened**. In a running centre the second
row is the steady-state majority — enrolment finishes, the case leaves the queue,
and the child becomes permanently unopenable while remaining fully enrolled.

Note also `fetchHouseholdCaseHosts` picks the **newest opportunity by `updated_at`**
per household. A sibling's newer lead can therefore redirect an older child's
gesture to a different case.

---

## 3. Current host assumptions (what the model believes)

1. **Every record worth opening is being worked.** Attention is a movement onto a
   *queue surface*; a record outside every queue has no surface.
2. **The opportunity (case) is the universal composition envelope.** Person-owned
   truth reaches the operator only as a related-subject projection onto a case
   panel.
3. **Only cases and children have panel subjects.** `person`, `account` and
   `work_item` grains are explicitly refused.
4. **`null` is information, not an error.** Callers must withdraw the affordance
   rather than invent a destination — correct, and precisely why the gap has been
   invisible.

Assumptions 1 and 2 are what Records contradicts. Records' premise is that a record
is worth opening **because it is durable**, not because it is queued.

---

## 4. Smallest platform-level options

Ordered smallest-first. Each is a product/runtime decision, not an implementation
choice.

### Option A — Records hosts its own panel; the record is the subject *(recommended)*

Give Records a person-grain and member-grain Focus Panel that composes **inside**
Records, rather than navigating to a case.

- Widen `OperationalSubjectType` to include `"person"`, and make
  `resolveSubjectGrain` return a subject for the `person` grain.
- Add a Records composition envelope for a person. Much of it exists:
  `buildPersonDrawerEntityPayloadForViewModel` already assembles a person payload
  *including* `buildPersonEmploymentComposition`.
- `OperationalSubjectRef.type` is already a plain `string` and `OperationalContext`
  is already grain-agnostic at the card boundary — the binding is upstream, not in
  the cards.
- `useOperatorRecordFocus` gains a Records-host branch; the queue branch is untouched.

**Why smallest:** no new store, no queue-engine change, no new drawer. It reuses the
existing card seam and an existing person payload builder. It is honest — Records
becomes a host because Records genuinely is one.

**Cost:** a second composition envelope, and a decision about which cards compose
for a person subject (Employment yes; Current Work no).

### Option B — Widen the resolver only; keep the case as the panel

Add non-opportunity arms to `host_entity_type` while still composing on a case.
**Rejected on inspection:** layer 3 still refuses the person grain, so this widens
the lookup without producing a surface. It would move the null one hop later and
make it harder to see.

### Option C — Make Work Units person-grained

`LifecycleSubjectType` already contains `associate`, `agent`, `customer`, `vendor`,
but the implemented `QueueMembershipGrain` is only `case | child | candidate`.
Implementing a person grain would let staff sit in queues.

**Wrong shape for Records** — the brief is explicit that Records is *not* a business
process. This is the right shape for **Staff Onboarding** later, and should not be
spent here.

### Option D — Ship Records list-only, rows non-navigable

Explicitly rejected by the Phase 1 brief, and correctly: *"Do not silently make
Staff rows non-navigable and call Records complete."*

---

## 5. What is NOT blocked

If the decision is Option A, these Phase 1 workstreams are unaffected and can
proceed the moment it is taken: A (shell), B (Staff section), C (Staff cohorts),
E (Add Staff move), F (`/organization/staff` convergence), G (Children section),
H (Child cohorts), K (health), L (site scope), M (search relationship).

Only **D** (Staff record-open) and **I** (Child record-open) depend on the decision —
but they determine what a Records row *does*, which is the product, so they are not
deferrable to a later phase without shipping the hollow Records the brief forbids.

---

## 6. Decision required

> Does Records become a durable attention host (Option A), or does Records V1 change
> shape so that it does not need to open records?

No workaround was implemented, and none should be.
