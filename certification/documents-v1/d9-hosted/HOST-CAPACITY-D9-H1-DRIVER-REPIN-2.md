# Documents → Host Capacity: D9-H1 driver re-pin `bfed4a96…` → `21bfb673…` (case 10 link lifetime)

From Documents (lane_aa660dc9554d), 2026-11-09. This document opens no run, installs nothing and issues no credential.
It asks for one Director plan-bytes approval and one reviewed toolkit change, the same shape as the first re-pin
(`HOST-CAPACITY-D9-H1-DRIVER-REPIN.md`, approval `gar_f8690e97083220`).

## 1. Why

Hosted rerun `qar_143a8fbcad49` (staging `5db26b46`, closed ZERO_RESIDUE) recorded **41 passed, 2 failed**
(`D9-H1-HOSTED-RUN-RECORD.qar_143a8fbcad49.md`). The two failures are case 10 ×2. Status 200, the `document_id`, the
storage host and the absence of a `path` all held. Driver `bfed4a96` then required `expires_at − now ≤ 600` with `now`
= **this host's** clock, and measured 600.13 s and 600.27 s. The server's clock leads, which the case 11 census
corroborates independently: the audit rows are stamped after the response arrived, by this host's clock. That record stands.

## 2. What changed (Documents `e718d7132`, not on a remote)

| Artifact | Path | sha256 |
|---|---|---|
| Consumer driver | `certification/documents-v1/d9_hosted_read_cert.py` | `21bfb6732d8e75f810e234b39f8a669055586919ed82a6f89e6f5a3d6218f737` |
| Driver tests | `certification/documents-v1/test_d9_hosted_read_cert.py` | `adfadc1e0feb3d982dc73fdbc860fbb0d31b8b8a55f157704ec214ed4465afc3` |
| Run order of record (**unchanged**) | `d9-hosted/D9-H1-HOSTED-RUN-ORDER.md` | `595f27138272f5412e82ee828dbe5146ab1a7e973f4a4e2c7f1fd68b448ad3f7` |
| Contract (**unchanged**) | `D9-1-HOSTED-QA-PLAN.md` | `1e9daebb60184b3c451ab4bbafe24bb89ad995d48547b8925d1858ba8ba3030e` |
| Runner, fixtures, residue census, link census (**unchanged**) | — | `5af9cd7a…`, `bcfa19c3…`/`87909bad…`, `e7e8d3d1…`, `837416d1…` |

The driver change is case 10's lifetime test only. Everything else is byte-identical in behaviour, and case 11 is unchanged.

- **Enforced lifetime**: `exp − iat` of the Storage-signed token. storage-api `signJWT` = `SignJWT(payload).setIssuedAt().setExpirationTime(expiresIn)`, and `verifyObjectSignature` rejects on `payload.exp`. This is the lifetime Storage enforces, on Storage's clock alone. Required `0 < L ≤ 600`, with no slack.
- **Declared lifetime**: `expires_at` minus the response's own `Date` header, both on the server side. Required `0 < L ≤ 600 + 2 s`. The 2 s covers the header's 1-second resolution and the edge stamping the header after the function stamps `expires_at`.
- Either reading missing or unreadable fails the case. This host's reading is recorded as information only.
- **Contract reading.** Contract case 10 says `expires_at − now ≤ 600 s` and does not name the clock. This driver reads `now` as the server's (the `Date` header) and adds the enforced token lifetime. The contract bytes are not changed, so the approval below must state this reading.

Local proof: `python3 -I certification/documents-v1/test_d9_hosted_read_cert.py`, 15/15, green on 10 consecutive runs.
- A server clock 5 s ahead passes and still reads > 600 s on the host clock.
- A 3600 s link fails whether Storage enforces it or the API declares it, with or without skew.
- Against the `bfed4a96` bytes the new tests fail 3: the skew case, and both enforced-only overlong cases, which `bfed4a96` passed.
- `qar_143a8fbcad49` is pinned at 41 / 2.
- The test harness also lost an intermittent socket reset (present on the old code) and now models PR #1637.

## 3. The toolkit change (only the driver pin and the evidence move)

| Field | Now | Proposed |
|---|---|---|
| `documents_d9_read_v1.driver.sha256` | `bfed4a96…` | `21bfb6732d8e75f810e234b39f8a669055586919ed82a6f89e6f5a3d6218f737` |
| `documents_d9_read_v1.driver.source_commit` | `6376729c8…` (vendored) | Documents `e718d7132` (vendored in `tests/fixtures/documents-d9/`, verified by sha256) |
| `documents_d9_read_v1.run_order` | `595f2713…` | **unchanged** |
| `PLAN_EVIDENCE.documents_d9_read_plan_approved` | `gar_f8690e97083220`, driver `bfed4a96…` | the new approval ref, `driver_sha256: 21bfb673…`, run order `595f2713…`; move the old record to `SUPERSEDED_PLAN_EVIDENCE` verbatim |

`planEvidenceBound` requires the approval's `driver_sha256` to equal the pin, so both land together, after the approval.

## 4. Approval card (Director)

`objective.govern_sprint`, worded like `gar_f8690e97083220`:
- plan `documents_d9_read_v1`, contract `1e9daebb…` (unchanged), consumer driver `21bfb673…` at Documents `e718d7132` (vendored), run order `595f2713…` (unchanged);
- states that case 10's `now` is read on the server's clock (`Date`, +2 s resolution), plus the enforced token lifetime ≤ 600 s;
- opening hosted QA, runs, fixture execution, census, installations and credentials are not part of it.

## 5. Rerun after install

The same ten steps and eight run cards as `qar_143a8fbcad49` (DEC-2 open, pre-write census, ensure, link census, reset,
close #1, post-close census, close #2). A case-10-only mode would save no card and would add an untested driver path.
