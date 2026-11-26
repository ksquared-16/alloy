---
owner: product
status: sprint
last_reviewed: 2026-08-19
sprint: enrollment-original-document-vertical
base: origin/staging @ 9d22468e7
---

# Hosted QA enablement — original-document vertical (Vertical A)

**Status: implementation and deterministic certification are COMPLETE on the branch. Live hosted QA
is blocked on two operator-authenticated Forms publishes, packaged here exactly.** The agent session
cannot execute them: service-role secrets exist only inside the toolkit-owned server, and the
toolkit's agent-auth commands (`alloy-agent-login` / stored slot-4 session) are blocked for the
agent by the permission classifier. Any operator-authenticated session — Kelly in the Forms builder,
or a toolkit-authorized agent run — can execute this mechanically.

Both steps use the canonical authoring path (`POST /api/admin/forms/[formId]/versions` →
`POST …/versions/[versionId]/publish`). Nothing mutates a published version in place; running
sessions keep their D-94 pins.

## Step 1 — Child Full Name repair (ALREADY APPROVED)

Per the approved preflight
([firefly-qa-form-child-full-name-binding-preflight.md](firefly-qa-form-child-full-name-binding-preflight.md)),
**re-fetch the published v1 `schema_json` immediately before the write and verify it still matches
the preflight's before-state** (field_1 has NO `field_source`; field_2 bound as stated). Then create
a draft cloned from v1, patch ONLY `field_1`:

```json
{ "entity_type": "child", "field_key": "child_full_name", "shared_value_key": "child_full_name" }
```

…and publish. Diff must show exactly one added key.

## Step 2 — document-vertical QA version (NEW authorization: this replaces the QA schema)

For the original-document journey, publish a further version of the same QA form definition whose
schema is the CONTROLLED certification artifact (matching the in-repo template
`firefly_enrollment_fixture_v1` — the deterministic Firefly Enrollment Application PDF, DOB asked in
three places), with the `fidelity_v1` mapping. The BP requirement references the DEFINITION, so
revision 13 is untouched; new Start-Enrollment sessions pin this version and get the document
journey.

This intentionally supersedes the OCR'd schema for NEW sessions. The OCR v1/v2 stay in version
history; if the crude OCR artifact should remain the active QA target instead, stop here and say so
— the alternative is a separate definition plus a BP revision 14 requirement change, a bigger
authorization.

`schema_json`:

```json
{
  "schema_version": 1,
  "title": "Firefly Enrollment Application",
  "sections": [{ "id": "main", "field_ids": ["f_name", "f_dob", "f_dob_medical", "f_dob_pickup", "f_allergies", "f_ack", "f_sig"] }],
  "fields": [
    { "id": "f_name", "type": "text", "label": "Child Full Name", "required": true,
      "field_source": { "entity_type": "child", "field_key": "child_full_name", "shared_value_key": "child_full_name" } },
    { "id": "f_dob", "type": "date", "label": "Child Dob", "required": true,
      "field_source": { "entity_type": "child", "field_key": "child_date_of_birth", "shared_value_key": "child_date_of_birth" } },
    { "id": "f_dob_medical", "type": "date", "label": "Child Dob (medical release)", "required": true,
      "field_source": { "entity_type": "child", "field_key": "child_date_of_birth", "shared_value_key": "child_date_of_birth" } },
    { "id": "f_dob_pickup", "type": "date", "label": "Child Dob (pickup authorization)", "required": true,
      "field_source": { "entity_type": "child", "field_key": "child_date_of_birth", "shared_value_key": "child_date_of_birth" } },
    { "id": "f_allergies", "type": "text", "label": "Allergies",
      "field_source": { "entity_type": "customer_member", "field_key": "allergies" } },
    { "id": "f_ack", "type": "boolean", "label": "I acknowledge the information above is accurate.", "required": true },
    { "id": "f_sig", "type": "signature", "label": "Parent Signature", "required": true,
      "signature": { "require_acknowledgment": true, "require_typed_name": true } }
  ]
}
```

`pdf_mapping_json` (the sha is the pinned identity of the deterministic template — recompute with
`sha256Hex(await buildEnrollmentAcroFormFixture())` if the template module ever changes):

```json
{
  "engine": "fidelity_v1",
  "template_key": "firefly_enrollment_fixture_v1",
  "source_sha256": "c0ab407d077f341dd960118b41a93141033bd4555f7da8be2ab41aedeefaeff1",
  "acro_fields": {
    "child_full_name": { "field_id": "f_name" },
    "child_dob": { "field_id": "f_dob" },
    "child_dob_medical": { "field_id": "f_dob_medical" },
    "child_dob_pickup": { "field_id": "f_dob_pickup" },
    "allergies": { "field_id": "f_allergies" }
  },
  "signature_placements": [
    { "field_id": "f_sig", "page": 0, "x": 210, "y": 150, "width": 200, "height": 28 }
  ]
}
```

API sequence (operator session, Firefly org):

1. `GET /api/admin/forms` → the QA form definition id ("Firefly Enrollment (Stage A certified)").
2. `POST /api/admin/forms/{formId}/versions` with `{ "schema_json": …, "pdf_mapping_json": … }` → draft id.
3. `POST /api/admin/forms/{formId}/versions/{versionId}/publish`.

## Step 3 — manual QA script

1. Start Enrollment on a fresh child (operator surface) → participant link.
2. Open the link: deterministic conversation (confirm name, confirm/collect DOB once, allergies).
3. Crossing: "I filled out <child>'s enrollment paperwork" → **the actual Firefly Enrollment
   Application renders, visibly populated — DOB in all three places.**
4. "Check the details" below the document → Edit DOB → the document regenerates; all three
   occurrences show the new value; the conversation does NOT re-ask.
5. Acknowledge → sign → "Sign and finish" → "You're all set. <child>'s enrollment paperwork has
   been submitted."
6. Operator: the child's record carries "Firefly Enrollment Application (signed)" — the flattened,
   sha-lineaged completed copy (documents row, `metadata.version_role: "signed"`).
