# Documents V1 — D8 Forms and Documents Convergence

Same Director instruction, batch sprint, lane and branch as D7 (`D7-REVIEW-EXPIRATION-RENEWAL.md`). **Local development
only: not pushed, not merged, migration `20261214090000` not applied to any shared environment.**

## D8.1 — canonical relationship audit (inventory at `447113099`'s parent)

| Artifact | Writer | Canonical Document? | Association to its form |
|---|---|---|---|
| Completed / stub form PDF (`generated_form_pdf`) | `lib/forms/pdf/createGeneratedPdfForSubmission.ts` (admin generate, packet approval) | yes — direct `documents.insert` (L184); version and owner (`resolveFormSubmissionDocumentParent`: child → case → household → person, `source legacy_writer`) created by the D2 insert triggers (`documents_before/after_insert_d2`) | `form_submission_documents` role `generated_pdf` (L212) |
| Signed / completed enrollment artifact (`generated_form_pdf`, `metadata.version_role` signed/completed, `metadata.lineage` source/populated/signed sha256) | `lib/forms/pdf/persistSignedEnrollmentArtifact.ts` (fidelity L240, composed L396; public submit) | yes — same path | `form_submission_documents` `generated_pdf` (L272, L434) |
| Drawn signature (`signature_asset`, child) | `app/api/public/forms/[token]/enrollment-signature-asset/route.ts` (L106) | yes — same path | `form_submission_signatures.drawn_asset_document_id` + join row `signature_asset` (`persistFormSubmissionSignatures.ts`, D1b.6 session binding) |
| Participant upload through a form (typed, e.g. `immunization_record`) | `app/api/public/forms/[token]/enrollment-upload/route.ts` (L159) — the one Forms writer that checks the Studio catalog | yes — same path | `documents.metadata` (form_definition_id, version, field_id, packet_session_id); no join row |
| Enrollment packets | `form_packet_*` (sessions, items with `form_submission_id`); per-step PDFs as above; read merge `mergeOpportunityPacketDocuments.ts` | via their submissions' artifacts | via submissions |

Findings:
1. **No duplicate storage.** Every Forms file is one `documents` row in `org_documents`, one immutable version and one
   owner association — the canonical identity. No Forms-only file table exists.
2. **Second association channel.** `form_submission_documents` links an artifact to its submission; the D2 view
   `document_subject_links` exposes it as a derived `form_submission` context. It is not a second identity, and D8 reads it
   (provenance) rather than duplicating it into `document_subjects`.
3. **Version identity by metadata.** A regenerated or signed copy is a NEW document (`metadata.idempotency_key`,
   `version_role`), not a new version. **Kept as is** (decision): a signed artifact is a distinct legal artifact whose
   integrity is the signed bytes; turning it into a version of the completed PDF would let the "current version" of a
   signed record change. Certified Forms behaviour is unchanged.
4. **Integrity lives in metadata** (`lineage.signed_sha256`), checkable against `documents.checksum_sha256`; nothing
   checked it. D8.2 does.
5. **No Forms artifact could satisfy a requirement**; a form UPLOAD of a typed document already counted as a document of
   its type (D6), pending review where the type requires it.
6. Not changed (recorded): the generated/signature writers do not consult the Studio catalog (the seeded types match);
   `upload` intent `generate_form` defaulting on uploads without an intent is unrelated to submissions.

## D8.2 — Forms-produced documents

`web/lib/documents/forms/formArtifactProvenance.ts` — one Documents-owned read over the existing links: form, submission
and status, artifact kind (completed / signed / generated / signature / upload), packet session, **integrity** (verified /
mismatch / unrecorded). The household library carries it on each row (`form_provenance`) and shows "Signed form: X ·
signature integrity verified" or "integrity does not match — not usable as evidence". Permissions, sensitivity
(medical-by-linkage), signature rules and immutable versions are untouched; nothing is copied or newly exposed.

## D8.3 — requirements fulfilled by Forms

`document_requirement_versions.form_evidence = {form_keys: [1–10 active form keys], acceptance: "review" | "submitted"}`
(migration `20261214090000`; NULL = the D6 behaviour). Evidence for the requirement then also includes completed-form
PDFs that are owned by the subject, linked to a **submitted** submission of a named form, and not integrity-mismatched.
`review` (the default): pending until a reviewer accepts the version (D7 authority). `submitted`: counts on
submission — an explicit, versioned organization policy. Never: draft/void submissions, other forms, signatures,
uploads (they count as their own type), mismatches. D7 validity applies with the **requirement's** type policy. The
database validates the field (shape, active forms of the organization, Completed form type accepting the grain) and
the version guard makes it immutable once published (both functions re-declared from their D6 bodies, nothing else
changed).

## D8.4 — experience

Studio → Documents → Requirements: "Also satisfied by completed forms" (the organization's active forms, review vs
on-submission). Focus Panel: readiness counts form evidence like any evidence (pending review → Review), the library
names each artifact's form and integrity, and review/renewal controls are D7's. Processing: a form PDF awaiting review
is a pending-review requirement row whose action opens the record's Documents card. No new Forms-document storage layer.

## D8.5 — local certification

| Evidence | Result |
|---|---|
| `tests/documents/documentsD8FormsEvidence.test.ts` | **12/12** — integrity cases; which artifacts may count; library provenance; review vs submitted; no policy → no Forms evidence; draft submission / other form / tampered signed artifact never count, the verified signed artifact does; D7 validity with the requirement type's policy; form uploads as typed documents; validator mirror; draft persistence and preview refusal of an inactive form |
| Postgres invariants `documents-d8-forms-evidence.sql` | **7/7** (with D7 10/10) via `certification/invariants/run-d7-d8-local.sh`, D2 → D8 in one rolled-back transaction, D8 applied twice; a mutation dropping `form_evidence` from the guard fails invariant 6 |
| TS/SQL validator parity | the D6 parity test now reads the latest validator definition (D8): codes equal |
| Forms regressions | in the batch record |

## Commits

`447113099` slice 1 (provenance) · `be3b3a60b` slice 2 (Forms evidence policy, migration) · `ba7dd429d` slice 3
(Studio editor) · `2e35ef7b0` slice 4 (local certification).

## Status

**Locally certified, not promoted.** Not hosted-certified; migration `20261214090000` not applied to staging.
