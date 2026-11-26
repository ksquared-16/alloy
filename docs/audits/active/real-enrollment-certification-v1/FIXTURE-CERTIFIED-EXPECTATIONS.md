# Fixture-certified expectations — **NOT a publish package**

> ⚠ **Renamed.** This document was called `FIRST-PUBLISH-PACKAGE.md` and a publish was authorized
> against it. Every number below was produced by `loadCertificationPacket()` reading three fixture
> files and running the pipeline **in-process**. It is a true and reproducible measurement of what
> the pipeline *would* produce. **It is not a measurement of any tenant**, it references no
> organisation, no processing case, no document rows and **no persisted operator decision**.
>
> A real publish package names an org id, a case id, document ids and persisted decision
> identities. Until one does, this is the certified expectation to compare tenant state against —
> nothing more. See [`PUBLISH-STOPPED-DELTA.md`](PUBLISH-STOPPED-DELTA.md).

**Every code-side gate passes. Nothing has been published.**

> This configuration creates no unapproved canonical field and drops no approved participant obligation.

---

## 1. Branch / worktree / base

| | |
|---|---|
| Branch | `agent/claude/4-enrollment-phase2-participant-anchor` |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt4-enrollment-phase2-participant-anchor` |
| Base (staging) | `73d9872c1ae14b121ebc4ca3ef067d361aeded45` |
| Head | `5750bbff9` + test-fixture commit |
| Tree | clean · **not pushed** |

## 2. Packet sources and hashes

| Artifact | File | SHA-256 | Bytes |
|---|---|---|---|
| Family handbook | `school-of-enrichment-family-handbook.pdf` | `feb7ee8018a21a28ffb610fb78ef497e84b1f7b7d93ec22cac022462008abe8a` | 513,916 |
| Oregon CIS | `oregon-certificate-of-immunization-status.pdf` | `cda2af9f85f814cee37b7990a0c99c3808e47283457cf76c83cc0146ee357388` | 455,162 |
| Hosted form capture | `school-of-enrichment-admissions-packet.capture.html` | `10c05372c04c159f128f72f16f4335b7ee97f3e7244711f60ac68e0299dba2ca` | 57,779 |

Hosted form provenance: `https://fs23.formsite.com/Okk63x/bztthqe6gx/index` (captured, never fetched at runtime).

## 3. Accepted canonical bindings — 21

`child.child_first_name` ×2 · `customer_member.dob` ×2 · `person.phone` · `enrollment.start_date` ·
`customer_member.gender` · `guardian.guardian_phone` · `guardian.guardian_email` · `customer.address` ·
`customer_member.allergies` · `customer_member.eating_habits` · `customer_member.special_diet` ·
`customer_member.favorite_foods` · `customer_member.foods_refused` ·
`customer_member.toileting_routine` ×3 · `customer_member.nap_routine` ×2 · `customer_member.temperament`

Every one is an **existing** destination. None is created by this publish.

## 4. Accepted relationships — 5

`physician` (name, phone) · `dentist` (name, phone) · `emergency_contact` (collection)

## 5. Safeguarding proposals — 3

| Kind | From |
|---|---|
| `custody_restriction` | "Are there any custody or visiting arrangements we need to be aware of?" |
| `custody_restriction` | "If yes, please explain arrangements and custody:" |
| `protective_or_restraining_order` | "Is there anyone who has a legal restraining order prohibiting or limiting contact with your child?" |

**These publish as questions, not as restrictions.** No `child_safeguarding_restrictions` row is
written by this publish; a restriction is proposed when a family answers and becomes active only
through `crm.customers.safeguarding.manage`.

## 6. Document / upload requirements — 4 (the blocker this slice cleared)

| Source | Clause | Document type | Label the family sees | Required | Satisfaction identity |
|---|---|---|---|---|---|
| Handbook · Tuition Agreement | "To update information provided in your ACH account, please complete an updated…" | *(none — not invented)* | "To update information provided in your ACH account, please complete a…" | yes | `form-doc-handbook::*::upload_10_tuition_agreement_upload_to_update_information_provided_i` |
| CIS · Page 1 | "Oregon law requires proof of immunization or exemption signed prior to a child's attendance…" | `immunization_record` | **Immunization record** | yes | `form-doc-cis::*::upload_1_page_1_upload_oregon_law_requires_proof_of_imm` |
| CIS · Page 2 | "Medical exemptions and immunity documentation require a letter signed by a licensed physician…" | `immunization_record` | "Medical exemptions and immunity documentation require a letter signed…" | yes | `form-doc-cis::*::upload_2_page_2_upload_medical_exemptions_and_immunity_` |
| CIS · Page 2 | "I have attached the required document from (check one):" | *(none — not invented)* | "I have attached the required document from (check one):" | yes | `form-doc-cis::*::upload_2_page_2_upload_i_have_attached_the_required_doc` |

Two of these live in the **same section** and stay two independent asks. One lives in an
**acknowledgement** section, which keeps its acknowledgement.

## 7. Acknowledgements — 18 · 8. Signatures — 6 · plus 3 static-content and 9 information requirements

Total published requirements: **40** (18 acknowledgement, 9 information, 6 signature, 4 upload, 3 static content).

## 9. Held / excluded — nothing durable is written

| Owner | Count |
|---|---|
| Health foundation (`AWAITING_HEALTH_FOUNDATION` + consent + exemption) | 14 |
| Financials / payments | 6 |
| Owner undecided | 28 |

## 10. Process- and artifact-scoped

Derived by Alloy (no field, no ask): **8** · Form-only responses: **4**

## 11. Generated configuration artifacts

| Form | Sections | Fields | Requirements |
|---|---|---|---|
| `form-doc-handbook` | 40 | 7 | 3 static, 3 acknowledgement, 1 upload |
| `form-doc-cis` | 2 | 88 | 15 acknowledgement, 3 signature, 3 upload, 2 information |
| `form-doc-formsite` | 7 | 81 | 7 information, 3 signature |

Plus one packet composition binding the three, and the Business Process requirement projection
derived from them. **The BP requirement set remains the readiness authority.**

## 12. Every tenant mutation this publish makes

**Writes**
- `form_definitions` — 3 rows (logical identity per org, unique on `(org_id, key)`).
- `form_definition_versions` — 3 rows, `version_number = 1`, `status = published`, `published_at`,
  `schema_json` = the projected FormSchemaV1.
- `processing_cases` / `processing_case_sources` — case status transition and source linkage.
- Discovery decisions — already persisted per-proposal; the publish reads them.

**Explicitly does NOT write**
- `field_definitions` — **zero new fields.**
- `child_safeguarding_restrictions` — zero rows.
- `customer_payment_methods` or any banking value — zero. No routing or account number exists
  anywhere in Alloy.
- `field_values` on any child, person or household — a publish configures; a family's answers fill.
- `documents` — the three sources are already stored; the publish adds none.

## 13. Expected revisions

Every artifact is at **version 1** — this is a first publish, so no prior version is superseded.

## 14. Rollback / forward correction

- **Rollback:** set the three `form_definition_versions` rows to a non-published status. Because
  nothing durable was written — no fields, no restrictions, no values — a rollback strands nothing.
- **Forward correction:** re-run discovery, adjust decisions, publish `version_number = 2`. The
  `configuration_publication_immutable_guard` keeps a published version immutable, so a correction is
  always a new version rather than an edit.
- A family who has already answered keeps their answers: they are `field_values` and form
  submissions keyed independently of the form version.

## 15. Final reconciliation

| | |
|---|---|
| Source artifacts | 3 |
| Logical artifacts | 4 |
| Raw destinations | 182 → **180 normalized** |
| Merged facts | **86** |
| Obligations | **32** (22 acknowledgement, 6 signature, 4 upload) |
| Correlations | 3 |
| False canonical-field proposals | **0** |
| Ownerless concepts | **0** |
| Upload obligations discovered → approved → published | **4 → 4 → 4** |
| Published requirements | 40 |
| Requirement identity collisions | **0** |

## The gates, all passing

`tests/pos/finalCertificationGate.test.ts` — 10 assertions over the real corpus: reconciliation,
zero new fields, zero ownerless, safeguarding/Financials/Health/derived counts, nothing creatable on
a held row, bulk-accept safety, 4/4 uploads, signatures and static content, distinct satisfaction
identities, distinct upload labels, and nothing publishing from an unapproved obligation.

---

**Awaiting your approval. Nothing is published.**
