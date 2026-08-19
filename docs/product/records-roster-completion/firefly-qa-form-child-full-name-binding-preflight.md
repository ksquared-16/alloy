# Preflight — `Child Full Name` canonical binding on the Firefly QA Enrollment Form

**Status: PREPARED, NOT EXECUTED. Blocked on Director authorization before any write to hosted
Firefly configuration.**

## The defect

On the published Firefly QA form ("Firefly Enrollment (Stage A certified)", the single form of the
Enrollment packet, BP revision 13 `998c28eb-b86e-446c-8a29-c3fb1b5b26fe`), the field:

- **field id:** `field_1`
- **label:** `Child Full Name`
- **type:** `text`
- **field_source:** **ABSENT**

carries no canonical binding. Consequences today, all observed live:

- The compiled artifact review classifies it `unresolved_artifact_specific`, so the parent types
  their child's name into paperwork the platform opened *for that child by name* — Alloy addresses
  the parent as "Test Process's enrollment paperwork" in the same viewport as the empty box.
- The value the parent types lands only in that artifact's submission; it never reaches the shared
  namespace and no other artifact can receive it.
- The D-100 confirmation policy already lists `child_full_name` as a confirmation-required child
  identity fact, but the need never materializes because no field carries the key.

Per the Director brief §9, this is a **configuration defect, not a runtime gap** — no runtime
hardcode may compensate for it, and the binding must not be inferred from the label at runtime.

## The intended binding, from repository evidence

**After** (`field_1.field_source`):

```json
{
  "entity_type": "child",
  "field_key": "child_full_name",
  "shared_value_key": "child_full_name"
}
```

**Before**: no `field_source` key on `field_1` at all. Every other property of `field_1` (id,
label, type, required, order) is untouched.

Why `child_full_name` is canonical — four independent sources, none of them the label:

1. **The canonical value provider.** `web/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues.ts`
   emits the child's durable `display_name` under exactly the keys
   `["child_full_name", "customer_member:display_name"]`. A binding to `child_full_name` is what
   makes the platform's own knowledge of the child's name reach the form.
2. **The confirmation policy.** `ENROLLMENT_CONFIRMATION_REQUIRED_KEYS`
   (`web/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy.ts`) lists
   `child_full_name` among the shared-alias spellings of child identity facts, added with the
   explicit rationale that Firefly's forms bind by alias.
3. **The sibling field on the same form.** `field_2` (`Child Dob`) is published as
   `{"entity_type": "child", "field_key": "child_date_of_birth", "shared_value_key": "child_date_of_birth"}` —
   the tenant's authoring pattern is alias-as-field_key with the alias mirrored into
   `shared_value_key`, `entity_type: "child"`. The proposed binding follows it exactly.
4. **The fidelity fixture.** `web/lib/forms/pdf/generation/enrollmentFixture.ts` names the child
   name field `child_full_name` in the canonical enrollment AcroForm fixture.

## What changes semantically (and what must not)

With the binding in place, on a **new** session (D-94 pins running sessions to v1):

- The need `child:<subject>:child_full_name` materializes; the canonical `display_name` prefills
  it; D-100 makes it a **confirm** turn ("I have the child's name as Test Process — is that
  right?") rather than an empty box.
- The compiled review shows the name as a resolved fact with Edit.
- An edit at review writes through `shared_values.child_full_name` with its D-99 confirmation.

Must NOT change — the executing session must diff and prove:

- No other field on the form gains, loses, or changes a `field_source`.
- No section, label, requiredness, type, or order changes anywhere in the schema.
- Running sessions keep rendering v1 unchanged (D-94; the pin is per-session).
- Publish is NOT idempotent and REPLACES the projection (one-way door — see
  `search-focus-panel` memory); the publish RPC reads `v_draft.payload` from the DB, so the draft
  must be byte-verified before publish.

## Execution plan (on authorization, and only then)

1. Fetch the live published v1 `schema_json` from hosted Firefly (operator credentials required —
   no snapshot exists in the repo; the fixtures in `web/tests/lifecycle/*.test.ts` mirror its
   shape but are not the artifact). Store the fetched payload verbatim in this directory as the
   before-record.
2. Produce the after-payload: identical bytes except `field_1` gains the `field_source` above.
3. Diff the two payloads and attach the diff here — it must be exactly one added key.
4. Publish v2 through the governed Forms publish path (never a direct table write).
5. Verify: new enrollment session asks the name as a confirm turn; running-session pin unchanged;
   re-run the enrollment certification suites.

## Stop condition

This document is the §9 stop. **No hosted write happens until the Director authorizes this exact
before/after.**
