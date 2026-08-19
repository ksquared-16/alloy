---
owner: product
status: sprint
last_reviewed: 2026-08-17
sprint: records-roster-completion-phase0
base: origin/staging @ f632c85c0
---

# Firefly Enrollment QA configuration — exact change, awaiting approval

D-103 is merged (PR #458, staging `f632c85c0`). Business Process configuration now maps entry
**intents** to stages, and Start Enrollment derives the participant packet from the resolved stage's
Form requirements.

Firefly's published configuration declares neither, so a Start Enrollment there realizes nothing
today. This is the exact revision change that unblocks live QA.

**Nothing has been applied. Firefly was read only.** This supersedes the earlier proposal in this
file, which assumed the process-global `entry_stage_key` D-103 replaced.

---

## 1. Preconditions verified

| Check | Result |
| --- | --- |
| Enrollment department | `3933ac47-077a-4de8-aaac-8aed48d80413` — the **only** one publishing Enrollment, so D-98 is unambiguous |
| Current published revision | **12** · `0a39c12f-74fa-4131-bf02-328d006d6d0e` · 2026-08-13 |
| **Live draft vs published revision 12** | **byte-identical — zero drift** |
| `entry_points_v1` on the process | ABSENT |
| `enrolling.requirements_v1` | ABSENT |
| Enrollment `process_instances` | 2, both `stage_key = 'waitlist'`, both **unpinned** |

The zero-drift result is what makes this safe: a publish snapshots the department's draft, so
revision 13 will contain exactly the two additions below and nothing else. If the draft had carried
unrelated edits, they would have shipped with the QA change.

## 2. The change — two additions, one publish

Department `3933ac47-…`, `metadata.lifecycle_builder_v1`, process `enrollment`.

### 2a. Process level — entry points

**Before**

```jsonc
{
  "id": "…", "key": "enrollment", "name": "Enrollment",
  "primary_entity": "opportunity", "sort_order": 0, "is_active": true,
  "command_set_v1": { … },
  "manual_status_transition_policy_v1": { … },
  "work_views_v1": [ … ],
  "stages": [ … ]
  // no entry_points_v1
}
```

**After** — one key added, everything else untouched:

```jsonc
  "entry_points_v1": {
    "version": 1,
    "by_intent": {
      "create_lead": "lead",
      "enrollment_start": "enrolling"
    }
  },
```

Both stages exist and are active in revision 12 (`lead` sort 0, `enrolling` sort 6), so publish
validation passes. `create_lead → lead` preserves Create Lead exactly as it behaves today.

### 2b. Stage `enrolling` — one Form requirement

**Before** — the stage carries `action_catalog_v1`, `allow_skipping`, `grain`, `id`, `is_active`,
`key`, `label`, `queue_membership_v1`, `sort_order`, `stage_operating_plan_v1`, `status_rollup_v1`,
`subject_resolution_strategy`, and **no `requirements_v1`**.

**After** — one key added, the other twelve untouched:

```jsonc
  "requirements_v1": {
    "version": 1,
    "requirements": [
      {
        "requirement_id": "enrollment_stage_a_form",
        "kind": "form",
        "form_definition_id": "ee75732b-036d-4b3d-8f33-a87c21b78105",
        "level": "required"
      }
    ]
  }
```

`scope` and `timing` are deliberately omitted. Absent means the owning evaluator's default applies,
and the participant path reads neither — need scope comes from the field's own identity through
`packetFieldPlan`, not from the requirement. They can be authored later without affecting QA.

### 2c. Publish

Expected result: **revision 13**, a new immutable
`business_process_revisions` row for department `3933ac47-…`, and a
`configuration_publications` row with `revision_number: 13`. Revision 12 is untouched and the two
existing journeys, being unpinned, are unaffected either way.

## 3. The Form, and why this one

**`Firefly Enrollment (Stage A certified)` — `ee75732b-036d-4b3d-8f33-a87c21b78105`**, published v1
(`8c37ef5d-6127-4569-a548-03f5cde6bd02`). Approved.

It is the only Firefly form whose fields carry **canonical bindings**, which is what makes the
conversation meaningful rather than a list of unnamed boxes:

| Field | Type | Binding |
| --- | --- | --- |
| `field_2` "Child Dob" | date | `child` / `child_date_of_birth`, with `shared_value_key` |
| `field_3` "Allergies" | text | `customer_member` / `allergies` |
| `disp_ack_3` | boolean | acknowledgement |
| `disp_sig_5` | signature | artifact-specific — correctly excluded from the conversation |

So the first participant turn is a **date question about the child's date of birth** — the shape the
deterministic interpreter handles, and the shape D-101 admits for provider interpretation later.

## 4. The QA journey needs a fresh child

Both existing Firefly children already hold an Enrollment `process_instance` — `waitlist`, context
`d097e1a8-…`, and **unpinned**. Start Enrollment on either resumes that instance and refuses with
`no_governing_revision`, because an unpinned journey has no governing requirements to realize.

QA should **add a new child in Records**, then press Start enrollment. That creates a fresh instance
which pins to revision 13 on the creating insert (D-96), and the launch proceeds.

## 5. Expected QA result

```
Records → Children → Add Child → Start enrollment
  → process_instance created, pinned to revision 13, stage_key NULL,
    metadata.source = "enrollment_start"
  → entry intent enrollment_start → stage "enrolling"
  → 1 Form requirement → derived packet  bp_rev_<revision13>_enrolling, 1 step
  → link minted, session anchored, participant_path returned in the action result
  → open that URL → the packet renders WITH the Enrollment conversation card above it
  → first turn: the child's date of birth
```

A Create Lead in the same tenant continues to resolve `lead`, which requires no Forms, so it projects
no participant packet — the regression proving that is in the certification job.

## 6. Approval needed

Applying section 2 writes to the live tenant: a builder edit plus a publish, which creates an
**immutable** revision. **Not doing it until you say so.**

`participant_conversation_interpretation` stays disabled. The surface will be deterministic-only for
this QA pass, which is the right order — reachability first, then the provider.
