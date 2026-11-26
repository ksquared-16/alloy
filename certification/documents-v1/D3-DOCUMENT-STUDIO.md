# Documents V1 — D3 Document Studio: categories, types and governed configuration

Status: **CERTIFIED — promoted, deployed and hosted-certified.** See "Verdict" at the end of this file.

## D3.0 — the configuration contract

The canonical rules are in `docs/platform/governance/configuration-publication-model.md` and
`docs/platform/foundation/configuration-platform-expansion-constitution.md`. Configuration does not share one
lifecycle, and a family adopts versioned publication "only when consumers must be protected from mid-flight draft
edits". D3 therefore has two families, each with its own lifecycle.

| Family | Lifecycle | Why | Precedent |
|---|---|---|---|
| **Document categories** | Org vocabulary, **live on save**. Stable `id` + `UNIQUE(org_id, key)`; the key is frozen after creation; label, description, order and parent are mutable; `active` → `archived` (and back). | Categories only name and group types. No consumer depends on a category's meaning mid-edit. | Operational Assignment Types (`assignmentTypeService.ts`) |
| **Document types** | **Versioned publication.** A stable identity row (`document_types`: `id`, `key`, lifecycle `active`/`archived`, `published_version_id`) plus immutable versions (`document_type_versions`). A version moves **draft → validated → published**; publishing supersedes the previous version. A published or superseded version never changes. Every edit is a new draft revision. | A type carries policy that consumers act on: the default sensitivity (authorization-bearing, applied to new documents by the database), and the review, replacement and validity policy that D5–D7 will enforce. A half-edited policy must never be live. | Form definitions and versions; organization calculations |

**Identity:**
- A type's or category's `id` and `key` never change.
- Renaming changes only the label, as a new version for types and in place for categories.
- `documents.doc_type` keeps storing the type **key**, which is how the existing documents and every existing reader
  stay compatible.

**Lifecycle commands:**
- create a category or type (the first draft);
- edit a draft;
- validate (server-side, recorded on the version);
- publish (compare-and-swap on the current published version);
- archive and re-activate;
- delete only what was never used.
- Every command is server-side, org-scoped, capability-checked and audited before it takes effect (durable `workflow_events`).

**Seeds:**
- Each existing organization receives a starter vocabulary once, as ordinary org-owned rows, and so does every new
  organization (an `orgs` insert trigger).
- An organization may edit or archive any seeded row.
- Nothing falls back to a platform default at runtime, per configuration-integrity Law D1: "a seed default is never
  immutable platform law".

**Authority:**
- Studio writes require `processing.documents.manage` (admin-only by default, and already the Processing documents
  configuration authority). No new configure key is minted: the precedents refuse domain-specific configure keys.
- Reading the configuration requires `documents.read` or `processing.documents.manage`.

## D3.3 — sensitive-document capabilities

`documents.identity.read` and `documents.restricted.read` are minted under the Director's D3 authorization
(2026-10-23), following the W-11/W-12 procedure:
- a catalog row;
- the seed function redefined with both keys in the admin grant list only;
- a backfill to every organization's `admin` role;
- the new-org trigger re-asserted;
- the self-test;
- an `APPROVED_ADDITIONS` entry.

Clearance for `personal_identity` / `restricted` becomes **the key, or the `owner` role**. The owner role holds no
seeded grants, so this preserves today's owner/admin behaviour, and no other role gains access. The Documents service
still enforces it (`assertDocumentAccess` → `actorMayReadSensitivity`).

**Type sensitivity:**
- A type's default sensitivity applies to NEW documents of that type, through the database insert/update trigger.
- It is raise-only: it raises a document's declared class and never lowers one.
- A type revision may not lower its default sensitivity, and the four medical type keys may not be published below
  `medical`.
- Existing documents are never reclassified by a type change.

## D3.4 — validity policy

The policy is stored and validated as declared intent:
- `none`;
- `explicit_date`;
- `duration` (value + unit);
- `periodic_reconfirmation` (interval);
- `event_renewal` (an event key from a fixed supported list);
- plus warning windows (days before) and review-on-renewal.

**Nothing in D3 enforces it.** Studio and the API label it "Declared — enforced from D7". The same applies to the
review-required, replacement and allowed-format policy, which is enforced from D5.

## Compatibility mapping (existing `doc_type` values)

| Stored value | Seeded type key | Category | Default sensitivity | Note |
|---|---|---|---|---|
| `immunization_record`, `physical`, `health_care_plan`, `medication_authorization` | same | health | medical (floor) | Authorization-bearing: the RLS policies, the D2 trigger and the D1b inference read these strings |
| `generated_form_pdf` | same | forms | standard | Medical comes from the medical-form link, not the type |
| `signature_asset` | same | forms | standard | Exact string read by the signing paths |
| `profile_photo` | same | photos | standard | Exact string drives photo resolution |
| `enrollment_document` | same | enrollment | standard | Participant upload fallback |
| `insurance` | same | vendor | standard | Exact string read by the vendor quarantine audit |
| `drivers_license` | same | identity | standard | Stays standard: raising it to `personal_identity` would restrict existing access and is a Director decision |
| NULL / free text | none | — | — | Kept as stored; reported as unregistered |

## D3.5 — Studio UX

Processing → Studio → **Documents** is a new tab: Forms | Packets | **Documents** | Fields | Branding
(`web/app/adminV2/pos/ProcessingDocumentsStudio.tsx`).

- **Type library:** cards with the published version, any open draft, and the sensitivity.
- **Type editor:** name, category, subject types, formats, sensitivity, review, replacement and validity. A revision is
  only offered sensitivity values at or above the published class. The editor shows the server's validation problems and
  the version history, with Save draft, Validate, Publish, Archive/Re-activate and Delete controls.
- **Category library:** nesting, archive and delete.
- **Enforcement labels:** every field says whether it is "Enforced for new documents" or "Declared — enforced from
  D5/D7".
- Every action calls the server routes. A refused write shows the server's code.

## D3.6 — internal API (`/api/admin/documents/configuration/*`, no public API)

| Route | Methods | Authority |
|---|---|---|
| `categories` | GET, POST | read: `documents.read`; write: `processing.documents.manage` |
| `categories/[id]` | PATCH (update/archive/activate), DELETE | `processing.documents.manage` |
| `types` | GET, POST (creates type + first draft) | read / write as above |
| `types/[id]` | GET, PATCH (archive/activate), DELETE | read / write as above |
| `types/[id]/draft` | PUT | `processing.documents.manage` |
| `types/[id]/validate` | POST | `processing.documents.manage` |
| `types/[id]/publish` | POST (compare-and-swap) | `processing.documents.manage` |
| `compatibility` | GET (counts of stored `doc_type` values against types) | `documents.read` |

- Every change is audited before it happens (`document_category_changed`, `document_type_changed`).
- The publish audit names the sensitivity before and after.
- The audit records attempts: an attempt the database then refuses is recorded too.

## D3.7 — certification

**Lineage**

| Item | SHA / request |
|---|---|
| Start | staging = deployed = canonical `7e7019c4` |
| D3 PR #1591 | merged `eef87b1b` (`gar_132ff97ad304d4`) |
| Fix PR #1592 | merged `7741db69` (`gar_1bcb77f6a49065`), after a refused first merge (`scoped_parity_dependency_unsettled`) and a hosted identity census (`gar_75018aec47cde8`) |
| Deployed | `/api/build-info` `7741db69` |

**Automated (repository)**
- Documents suites 315/315 (+1 lock): D3 routes and validator 19, including SQL↔app problem-code parity; Studio UI 5.
- Access suite: 0 new reds, and 3 pre-existing RL-8 reds fixed.
- Consumer and workspace regression: 0 new reds. The 44 and 11 reds are identical on untouched staging.
- Prebuild passes; CI green on #1591 and #1592.

**Isolated environment (`certenv-a134d2e184`)**
- Applies: `gar_7a49a5d0d41932` (20261209090000, 20261209090100) and `gar_f153ca627d120a` (20261209090200), ledgers verified.
- D3 invariants 8/8 (`gar_4e803b9b544a12`).
- D2 invariants 11/11 with D3 applied (`gar_544bb75ede6e36`).

**Staging migration**
- The Supabase integration applied all three migrations on merge.
- Census `gar_412285ddd55b0c`:
  - 5/5 organizations seeded (50 categories, 65 types), every published version valid, medical types medical;
  - keys on the 5 admin roles only (10 grants, 0 other), absent from the ops seed;
  - all 378 documents unchanged (246 medical / 132 standard); every stored `doc_type` registered except NULL.
- Census `gar_d6209e05d36814`: 20261209090200 is the ledger head, and the installed publish function raises 55000, not 40001.

**Hosted — `authz_q1` run `qar_ad7ca37df52f`**
- 7/7 personas verified on fresh sessions.
- Fixtures: vendor `gar_23ebc8184b380a`, QA Shared subjects `gar_656d2854904900`, QA Secondary subjects `gar_ec06af32d5211f`.

| Gate | Result | Build | Evidence |
|---|---|---|---|
| Q1 authorization regression | 90/90 | `7741db69` (also 90/90 on `eef87b1b`) | `q1_hosted_authz_cert_results.qar_ad7ca37df52f.final.json` |
| D1b security regression | 25/25 | `7741db69` (also 25/25 on `eef87b1b`) | `d1b_hosted_security_cert_results.qar_ad7ca37df52f.final.json` |
| D2 foundation regression | 40/40 | `eef87b1b` (the fix touched only `document_type_publish`) | `d2_hosted_foundation_cert_results.qar_ad7ca37df52f.json` |
| D3 Studio workflow | 40/40 | `7741db69` | `d3_hosted_studio_cert_results.qar_ad7ca37df52f.json` |
| Configuration read: readers yes, no-docs 403, other org sees only its own | PASS | | D3 driver |
| Configuration write: reader, ocr and processing-only 403 | PASS | | D3 driver |
| Categories: stable key, nesting, cycle 409, archive-with-child 409, cross-org 404, duplicate key 409 | PASS | | D3 driver |
| Types: draft only, unvalidated publish 409, validate, stale publish 409 `PUBLISH_CONFLICT`, v1, lowering refused, v2 supersedes v1, identity stable, cross-org 404 | PASS | | D3 driver |
| Enforcement: a new document of a restricted type is restricted; reader 403 `SENSITIVE_DOCUMENT`; cleared admin 200; type in use 409; category in use 409 | PASS | | D3 driver; census `gar_3fe29d31612b7a` |
| Compatibility report maps the stored value | PASS | | D3 driver |
| Audit | PASS | | `gar_3fe29d31612b7a`: every change recorded with actor; publish events name sensitivity from → to |
| Teardown | PASS | | the D3 document, type and categories, plus all D2, D1b and Q1 documents, through the audited deletes |

**Defect found and fixed by the hosted run.**
- A stale publish raised SQLSTATE 40001, which the layers in front of the database retry, so the request hung 60 s instead of answering 409.
- Fixed in 20261209090200 (55000), and proven on certenv, staging and the hosted re-run.

**Not hosted: the medical type floor.** Exercising it needs a draft on a seeded medical type, and drafts cannot be
discarded yet, so it would leave residue. It is proven by certenv invariants CASE 3 and the unit tests.

**Cleanup.**
- Fixture resets: QA Shared subjects `gar_b75652f07ed644`, QA Secondary subjects `gar_d5b192d33c5084`, vendor `gar_4e650f00e55e35`.
- Close: `gar_31bc4d9c38a04a`.
- Zero-residue census `gar_dedb0285615d0f` (22:14:52Z): 12/12 zero.
- D3 configuration residue `gar_03ad73bdbd6be4`: 0 tagged categories, types, versions or typed documents. QA Shared's
  starter vocabulary is intact (13 types, 10 categories), with 0 open drafts and 0 non-seeded configuration.
- Binding: `gar_37daf8724a46bc` → ZERO_RESIDUE.

## Not done here (D4/D5 prerequisites)

- **D5 enforcement:** allowed formats, subject types, review-required and replacement policy at filing and upload. Today
  they are declared only.
- **D7:** the validity, expiration and reconfirmation workflows that consume `validity_policy`.
- **Discarding an unpublished draft:** no route exists yet. This is a Studio convenience, and also what a hosted
  medical-floor check needs.
- **Sensitivity of vendor driver's licences:** whether they should default to `personal_identity`. This is a Director
  decision; the type is seeded as standard so existing access is unchanged.
- **Per-type metadata fields:** the existing `document_field_definitions` table is still unused.
- **D4:** the Focus Panel library reading types and categories (out of scope here).
- **Configuration domain registry:** Processing has no entry in the nine-domain registry; Studio → Documents is recorded in
  `docs/platform/modules/documents-and-forms.md` instead.

## Verdict

**DOCUMENTS_V1_D3_COMPLETE_PROMOTED_DEPLOYED_CERTIFIED.**

Every D3 gate passed on the deployed build `7741db69`, which contains D3 merge `eef87b1b` and fix merge `7741db69`. The hosted
run `qar_ad7ca37df52f` is bound ZERO_RESIDUE.
