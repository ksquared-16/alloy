# Request to the Vacilando toolkit owner: a governed QA-principal REST/storage probe

**From:** Documents (`lane_aa660dc9554d`), D1b.7, 2026-10-23.
**Toolkit measured:** `eacd98ccf4d6`. It has no action of this kind. `governed-action --list` shows only the QA run, session
and identity actions.

## Why

The Director's D1b resume, step 2, requires real authenticated QA-principal HTTP requests that prove four things:
- direct document-table SELECT, UPDATE, INSERT and DELETE are refused;
- OCR text cannot be read directly;
- storage list and download are refused for anonymous and authenticated callers;

and it says "do not extract keys". Every PostgREST (`/rest/v1`) and Storage (`/storage/v1`) request to the hosted project carries the
project's anon key in `apikey`. The worker must not obtain that key, so only the trusted host can make these requests.

The database half is already proven, by other means:
- **Isolated certification:** `database.run_rollback_invariant_test` (`gar_b433265b66036c`) made 48 of 48 real `anon`/`authenticated`
  statements on certenv, and every one was refused.
- **Deployed primary:** censuses `gar_deef786d8a0773` and `gar_a8d2f05b1d9b4b` show no client privilege on the six tables, a private
  bucket, and 0 client storage policies.

What is missing is the hosted, end-to-end HTTP proof.

## Smallest shape

`environment.qa_principal_probe { qaRunId, probePlan }`

- `probePlan` is a **registered, frozen** plan key, for example `documents_d1b_direct_access`. It is never a caller-supplied request.
- The trusted host reads each persona's access token from the run's own `qa-runs/<qar>/<persona>/storage-state.json`, and
  the target's anon key from its trusted environment. The target is only `alloy_staging_web` / `ikaxilmwmrmbagoidedu`.
- It returns, per request: persona, method, path template, HTTP status, error code (`42501`, `PGRST*`) and row count. It never
  returns a body, a token or a key.
- It refuses a run that is not OPEN, a persona outside the plan, and any other target.

## Plan `documents_d1b_direct_access`

| Persona | Request | Expected |
|---|---|---|
| anon (no JWT), doc_reader, scoped_ops, fixture_admin, cross_org_admin | `GET /rest/v1/<t>?select=id&limit=1` for t ∈ documents, document_versions, document_field_values, document_field_definitions, form_submission_documents, form_submission_signatures | 401/403, `42501` |
| same | `GET /rest/v1/documents?select=extracted_text&limit=1` | 401/403, `42501` |
| doc_reader, fixture_admin | `PATCH /rest/v1/documents?id=eq.<run fixture>`, `POST /rest/v1/documents`, `DELETE /rest/v1/documents?id=eq.<run fixture>` | 401/403, `42501` |
| anon, doc_reader, fixture_admin | `POST /storage/v1/object/list/org_documents {prefix: <QA Shared org>/}` | `[]` |
| anon, doc_reader, fixture_admin | `GET /storage/v1/object/org_documents/<run fixture object>` | 400/404 |
| cross_org_admin | both storage requests above, on a QA Shared object | `[]` / 400/404 |

Fixture ids and objects come from the run's product-API uploads, which the trusted host finds by the run tag `qa-authz-<qar>`.
They never come from the caller.

## Acceptance

The registry is valid and the capability is installed and running. An open `authz_q1` run executes the plan and reports every
request, and the Documents D1b.7 report cites the result.
