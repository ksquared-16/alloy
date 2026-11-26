# §8 — Do the 32 obligations survive publication? **No. STOP.**

Measured, not read: the packet's three artifacts were run through the real chain —
`buildFormDraftFromStructure` → `draftFormToFormSchemaV1` → `enumerateRequirementsFromForm` — and the
result compared against what discovery found.

## What discovery found vs what publication would produce

| | Discovered in the packet | Projected as requirements |
|---|---|---|
| Acknowledgements | 22 | 18 |
| Signatures | 6 | 6 ✓ |
| **Uploads / document evidence** | **4** | **0** 🛑 |
| Static content | — | 3 |
| Information (section-grain) | — | 9 |

## Finding 1 — every document requirement disappears 🛑

**All four upload obligations project to zero `upload` requirements.**

The projection emits a `file_ref` control only when a *section* carries `disposition: "upload"`
(`draftFormToFormSchemaV1`). The packet's document requirements were discovered as **prose clauses**
— "Completed immunization records must be provided on or before the first day of care", "Medical
exemptions and immunity documentation require a letter signed by a licensed physician" — so no
section disposition is ever `upload`, no `file_ref` field is emitted, and
`fieldRequirementType` therefore has nothing to type as `upload`.

Publishing today would produce a packet that **never asks the family for the immunization record**,
while the review screen shows four document requirements found. The requirement is visible in
configuration and absent from execution.

This also erases Slice 7's document-type work: three of the four uploads now carry a canonical
`target_document_classification`, and nothing downstream consumes it.

## Finding 2 — acknowledgement identity collapses ⚠

18 acknowledgement requirements carry **16 distinct labels**, and three of them are literally
`"I acknowledge the above"`. The `RequirementRef` keeps them distinct as *records*
(`{form_definition_id, section_id, field_id}`), so nothing is silently merged — but a parent sees
three identical obligations and cannot tell which agreement each belongs to. The clause text does
survive as adjacent `text_block` static content, so the evidence is present; the *label* is what is
lost.

## Finding 3 — four AcroForm checkboxes become acknowledgements ⚠

`fieldRequirementType` maps `boolean → acknowledgement`. On the Oregon CIS that types
`Var History`, `Module`, `Provider` and similar exemption checkboxes as acknowledgements. They are
not acknowledgements; they are exemption selections. Semantically wrong, and it inflates the
acknowledgement count.

## What IS preserved

Signatures project exactly (6 → 6), with `initials` distinguished from `signature` by
`signature.mode`. Static content projects as `static_content`. Responsibility differs correctly by
type: acknowledgements and signatures require **every guardian**, information and uploads require
**one**. So the requirement *model* distinguishes these kinds properly — the defect is upstream, in
what reaches it.

## Verdict

The distinctions among acknowledgements, signatures and static content are preserved. **Uploads are
not.** Per the instruction I am reporting this rather than redesigning it: the fix belongs to whoever
owns the requirement projection, and this slice's boundary forbids changing requirements.

**The narrowest fix**, for whoever takes it: a clause-level `upload_requirement` concept must emit a
`file_ref` field the way a section-level `upload` disposition already does — the projection is
section-shaped, and the packet's document requirements are clause-shaped. One seam, not a redesign.

**This blocks the first certification publish.** A packet that shows four document requirements and
asks for none of them is exactly the "implying unsupported durable behaviour" the publish gate exists
to prevent.
