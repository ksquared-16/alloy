# Documents V1 — D3 Document Studio: categories, types and governed configuration

Status: **D3.0 contract ratified; implementation in progress.** The verdict is recorded at the end of this file.

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
