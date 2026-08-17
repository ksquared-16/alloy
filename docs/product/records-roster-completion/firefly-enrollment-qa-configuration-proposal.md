---
owner: product
status: sprint
last_reviewed: 2026-08-17
sprint: records-roster-completion-phase0
base: origin/staging @ ded3026d7
---

# Firefly Enrollment QA configuration — proposal, awaiting approval

B1 is merged (PR #456, staging `ded3026d7`). Start Enrollment now derives the participant packet and
session from the governing revision's Form requirements — but Firefly's Enrollment configuration
declares **no entry stage** and **no Form requirements**, so today a Start Enrollment there realizes
nothing and says so.

This is the smallest canonical change that makes participant QA possible. **Nothing has been applied.
Firefly was read only.**

---

## 1. What Firefly holds today

| Fact | Value |
| --- | --- |
| Enrollment department | `3933ac47-077a-4de8-aaac-8aed48d80413` ("Enrollment") — the **only** one publishing Enrollment, so D-98 is unambiguous |
| Latest published revision | 12 · `0a39c12f-74fa-4131-bf02-328d006d6d0e` · 2026-08-13 |
| `entry_stage_key` | absent (the field did not exist when 12 was published) |
| `requirements_v1` | **absent on every Enrollment stage** — `lead`, `tour`, `decision`, `waitlist`, `enrolling`, `enrolled` |
| Legacy requirements in live department metadata | all **field** rules — `child:first_name`, `person:email`, `opportunity:tour_date`, `child:classroom`. Not one `form` requirement |
| Enrollment `process_instances` | **2**, both `stage_key = 'waitlist'`, both **unpinned** |
| Children in Records | 2 — Lennon and Wrigley Kurzman, same household `0658832a-…` |
| `form_packet_sessions` | 0 rows, all orgs |

**Blast radius of declaring an entry stage: zero.** It changes the effective stage only for journeys
with `stage_key = NULL`, and Firefly has none.

## 2. The Form to require

**`Firefly Enrollment (Stage A certified)` — `ee75732b-036d-4b3d-8f33-a87c21b78105`**, published v1
(`8c37ef5d-6127-4569-a548-03f5cde6bd02`).

It is the only candidate whose fields carry **canonical bindings**, which is what makes the
conversation meaningful rather than a list of unnamed boxes:

| Field | Type | Binding |
| --- | --- | --- |
| `field_2` "Child Dob" | date | `entity_type: child`, `field_key: child_date_of_birth`, `shared_value_key: child_date_of_birth` |
| `field_3` "Allergies" | text | `entity_type: customer_member`, `field_key: allergies` |
| `disp_ack_3` | boolean | acknowledgement |
| `disp_sig_5` | signature | artifact-specific — correctly excluded from the conversation |
| `field_1`, `field_6` | text | unbound ("Needs destination configuration") |

So the participant runtime gets a **date turn on `child_date_of_birth`** — the exact shape the
deterministic interpreter handles and the shape D-101 admits for provider interpretation later.

Rejected candidates, for the record: the `Cert Enrollment *` fixtures have clean field ids but **no
canonical bindings**, so every need would be unbound; the `Proving Journey Form *` set runs to 39–112
fields, which is not a harmless QA surface; `Enrollment Record 8.25 (discovery)` has **no published
version** and cannot be a packet step at all; and the lead-capture forms are intake surfaces that
should stay intake surfaces.

Harmless: it is a certification artifact, not a live parent-facing production form, and it creates no
Opportunity or lead — a packet-mode link is not an intake link.

## 3. The proposed change — one publish

On department `3933ac47-…`, process `enrollment`:

```jsonc
{
  "key": "enrollment",
  "entry_stage_key": "enrolling",          // ← new
  "stages": [
    // …unchanged…
    {
      "key": "enrolling",
      "requirements_v1": {                 // ← new
        "version": 1,
        "requirements": [
          {
            "requirement_id": "enrollment_stage_a_form",
            "kind": "form",
            "form_definition_id": "ee75732b-036d-4b3d-8f33-a87c21b78105",
            "level": "required",
            "scope": "each_child",
            "timing": "stage_progress"
          }
        ]
      }
    }
  ]
}
```

Then **publish**, producing revision 13. Nothing else changes: no other stage gains requirements, no
transition moves, no packet definition is authored (the platform derives one, keyed
`bp_rev_<revision13>_enrolling`).

### Why `enrolling`, and the one judgement in here

`enrolling`'s own operating plan says "Complete enrollment paperwork after the family decides to
enroll" — it is the stage whose purpose is participant paperwork, which is what a Start Enrollment
from a durable Child record is.

**The honest tension:** `entry_stage_key` is per-process, and Create Lead creates the same process. A
Create-Lead journey also starts with `stage_key = NULL` and would therefore also project `enrolling`
requirements until an operator moves it — which is wrong for a lead that has not decided. Today that
costs nothing in Firefly (no NULL-stage instances exist), but it is a real modelling seam and it is
yours to rule on. The alternatives:

- **`entry_stage_key: "lead"`** — true to the process's beginning, but then a Records-originated child
  effectively sits at the top of the acquisition funnel, and the QA requirement would have to hang off
  `lead`, where a participant packet does not belong.
- **Per-origin entry** — a second declaration ("where a journey started from Records begins"). More
  faithful, materially larger, and not needed to unblock QA.

I recommend `enrolling` now and treating per-origin entry as a separate question if a NULL-stage
Create Lead journey ever needs to project.

## 4. The QA journey needs a fresh child

Both existing Firefly children already have an Enrollment `process_instance` — `waitlist`, context
`d097e1a8-…`, and **unpinned**. Start Enrollment on either would resume that instance and refuse with
`no_governing_revision`, because an unpinned journey has no governing requirements to realize.

So QA should **add a new child in Records** and press Start Enrollment on them: that creates a fresh
instance, which pins to revision 13 on the creating insert (D-96), and the launch proceeds.

## 5. Expected QA result once applied

```
Records → Children → Add Child → Start enrollment
  → process_instance created, pinned to revision 13, stage_key NULL
  → effective stage = "enrolling" (declared entry)
  → 1 Form requirement → derived packet bp_rev_<13>_enrolling, 1 step
  → link minted, session anchored, participant_path returned
  → open the URL → the packet renders WITH the Enrollment conversation card above it
  → first turn: the child's date of birth
```

The AI feature stays deferred. This surface is deterministic-only until reachability is demonstrated,
and Firefly's `ai_policy.allowed_features` is unchanged.

## 6. Approval needed

Applying section 3 means writing to the live tenant — a builder edit plus a publish, which creates an
immutable revision. **Not doing it until you say so**, and I would like the `enrolling`-vs-`lead`
call in section 3 confirmed rather than assumed.
