# Documents V1 / D1a — certification record

Status: **PARTIAL.** Gates A and B are not hosted-proven, and Gate C is blocked on fixture provisioning. See "Outstanding" below.
Scope: application-level document access containment only. Database grants, RLS, storage policy
and the canonical schema are Documents V1 / D1b and are **not** certified here. Nothing in this
record states that the Documents domain is secure.

## Lineage

| | SHA |
|---|---|
| Candidate (PR #1518 head) | `0ea1b8c4edb91f7d5a5f3738e8818210d55f1c4b` |
| Merge into `staging` | `7a4de136446180c38c3c54bddb25fd59ff69f7d2` (2026-10-20T20:36:31Z) |
| Deployed at first hosted run | `7a4de136…` (`/api/build-info`, 20:41:38Z) |
| Staging = deployed at closure | `3416e395228738d9f67b525eb38b57a04449248e` (contains `7a4de136`) |

## Hosted HTTP certification — `d1a_hosted_cert.py`

The script ran against the deployed merge with the registered deployed QA session (`alloy_staging_web` → the managed
`qa-slot1-product` identity, organization admin). Results are in `d1a_hosted_cert_results.json`. They hold status codes and
booleans only: no URLs, paths, titles or text. Outcome: 16 of 17 cases pass. The failing case is vendor binding, which had no fixture (Gate C).

Proven on hosted:
- An authorized operator lists documents and is issued a token-bearing signed link.
- Extracted text, the Processing list and entity options all serve a capability holder.
- Unknown and malformed ids return `404 NOT_FOUND`, on both the signed-URL route and the extracted-text route. The decision runs before the read.
- An unauthenticated caller gets `401` on all five D1a read routes.

Audit is proven on the database by `d1a-hosted-audit-census.sql` (request `gar_39a602a48516df`, measured 20:44:50Z). Exactly one
`document_link_issued` row exists after the deploy, with actor and route, written at 20:41:50Z. That is the single link the
hosted run issued.

## Gates required by the Director (2026-10-20)

| Gate | Hosted | Behavioural (real route + real decision, `documentsD1aAuthorization.test.ts`) |
|---|---|---|
| A — actor with `documents.read` succeeds | PROVEN | proven |
| A — portal actor lacking the capability refused | **NOT PROVEN — no principal** | proven (custom portal role projected to `ops`; planted defect caught) |
| A — OCR needs `processing.operate` + `documents.read` | positive only | proven both ways |
| B — restricted operator in-scope success / out-of-scope refusal across list, preview, sign, OCR | **NOT PROVEN — no principal** | proven (planted defect caught) |
| B — cross-organization id refused, nothing disclosed | unknown-id 404 only. The deployed census shows the other two orgs hold zero documents, so no real cross-org id exists | proven |
| C — vendor binding success / refusal | **NOT PROVEN — no fixture** | proven (planted defect caught) |
| Upload 10 MB | **HOSTED_TRANSPORT_LIMITED.** The Vercel ~4.5 MB body limit answers first. | **APP_BOUNDARY_CERTIFIED:** 10 MiB − 1 and 10 MiB accepted; 10 MiB + 1 refused 413 with no object, row or event; a declared length that cannot fit is refused before parsing. Both checks were proven binding by removing each and watching the suite fail. |

## QA provisioning — what was available, and why it stopped

There are no fixtures to clean up, because none were created.

- **Gates A and B.** The sanctioned QA identity actions cannot produce the principals these gates need.
  - `environment.assign_qa_identity_access` grants a single constant role, `admin` (`ASSIGNABLE_ROLE`).
  - The deployed-target registry pins exactly one identity (`qa-slot1-product`).
  - So no governed path provisions a portal principal without `documents.read`, or a department-restricted operator.
  - The only alternative was re-pointing the shared QA identity's own roles or scope. Other lanes certify through that same session, so that is the unsafe mutation the closure instruction says to stop on.
- **Gate C.** There is no admin API to create or delete a vendor.
  - Vendors are created only by the public, unauthenticated vendor-application endpoint.
  - It writes into an env-configured organization (`ALLOY_PUBLIC_ORG_ID`) that cannot be confirmed to be the QA organization.
  - It creates vendor, contact, person and vertical rows that no product route can remove.
  - Cleanup would therefore need uncontrolled database writes, which this lane has no channel for and should not have.

## Outstanding

These obligations must be met before `DOCUMENTS_V1_D1A_COMPLETE_PROMOTED_DEPLOYED_CERTIFIED`:

1. **A governed QA-persona capability on `alloy_staging_web`.** It must sign in as:
   - a portal-admitted role without `documents.read`;
   - a department-restricted operator.

   Both must be owned and removable. Then run Gates A and B through the hosted script.
2. **A governed staging fixture.** It must create, and later remove, two QA vendors in the QA organization, with one bound document. Then run Gate C.
3. **A real cross-organization case.** This needs a document owned by a second organization that the QA operator cannot reach. Today the deployed tenants hold none.

## D1b obligations (unchanged, blocking the Documents domain)

- Authenticated table grants plus org-role RLS let owner/admin/ops/manager read `documents`, including OCR text, and ops+ update rows directly.
- No bucket `file_size_limit` or MIME allowlist exists, and the storage deny-all posture is not defined in a migration.
- 34 stored objects have no document row, including 6 unprefixed `vendors/…` objects.
- Public uploads have no malware scan and no rate limit.
- Profile-photo (avatar) admission policy is unresolved.
- No scope policy exists for subjects without department/site linkage.
- There is no canonical Documents owner in `docs/context/alloy-canonical-owner-map.md`.
