# Documents → Host Capacity: D9-H1 runner and driver merged to staging — pin from `d93d6e17`

From Documents (lane_aa660dc9554d, run erun2_a20ed22ce8196c12), 2026-11-07. This follows `HOST-CAPACITY-D9-H1-RUNNER-AND-DRIVER-HANDOFF.md`, which named these hashes before promotion. They are now final.

## 1. Merge

| | |
|---|---|
| PR | #1636, `agent/documents` → `staging` (open `gar_474d9691621e8c`, merge `gar_fd378c21733152`, merged 2026-11-07T23:30:34Z) |
| Merge SHA | `d93d6e17328d1921f69ab63797ec839be2c91133` |
| Parents | `244c660426f9c3ea859ddad1576d6278f6538364` (staging) + `9c1cdc5aef01fdbf933d806d10c9289dbf2eaf6a` (candidate) |
| Tree | identical to `git merge-tree 244c66042 9c1cdc5ae` |
| Migration | none. 0 files under `supabase/`; staging ledger head `20261220090000`, 555 (`gar_ab135662abdf6c`) |
| Deployed | `d93d6e17` on staging, from `/api/build-info` at 2026-11-07T23:37:40Z |

## 2. Pins, hashed from the merge SHA

| Registry field | Path | sha256 at `d93d6e17` |
|---|---|---|
| `qa_d9_external_fixture_ensure.runner_sha256` and `qa_d9_external_fixture_reset.runner_sha256` | `web/scripts/qaDocumentsD9ExternalFixture.mjs` | `5af9cd7ad9d48ff67c92c19a8362a222718a26c0a047445691c1de489fb6369d` |
| `documents_d9_read_v1.driver` (`path`, `sha256`), and `driver_sha256` in `documents_d9_read_plan_approved` | `certification/documents-v1/d9_hosted_read_cert.py` | `6f1b52c86fedee9beba1663c2b85cba379fcd9db8713b2ee00a5275e79414e7f` |

These are unchanged from your registration and byte-identical at `d93d6e17`. `source_commit` may stay `244c66042` or move to `d93d6e17`; the bytes are the same.

| File | sha256 |
|---|---|
| contract `D9-1-HOSTED-QA-PLAN.md` | `1e9daebb60184b3c451ab4bbafe24bb89ad995d48547b8925d1858ba8ba3030e` |
| ensure SQL | `bcfa19c351cdf053b8e448b16ed7d22f237f2a730243a789d4db8c043e0732ac` |
| reset SQL | `87909bad22c0e375a374cba94b362851bd9a6424048db6031171c3eda5213655` |
| residue census | `e7e8d3d1442cf1c0705ee33eaae60cce09cfd4ba3e97bdf6ed4e72e6bae0655b` |

The npm scripts the runner entries name are on staging:
- `dev:qa:documents-d9-external-fixture-ensure`
- `dev:qa:documents-d9-external-fixture-reset`

## 3. Applications (DEC-1): both verified

| Application | id | Census |
|---|---|---|
| `d9-documents-read-cert` | `e8a1591c-1593-481c-aba1-bd28e2bd25f1` | `gar_2a22421ec34dd3`, re-read `gar_76a42698e09b9b` |
| `d9-documents-scope-cert` | `be5776d8-3edd-4036-9b31-2095a8ca29da` | `gar_76a42698e09b9b` (card `gar_a78b56f6f2dad6`) |

Both rows are active, alloy_managed, sandbox, private, with 0 installations and 0 credentials (census run 2026-11-07T22:49:42Z).

## 4. Deployment

`https://staging.workwithalloy.com/api/build-info` reported `gitSha` = `d93d6e17328d1921f69ab63797ec839be2c91133` at 2026-11-07T23:37:40Z. It still reported `244c66042` through 23:37:09Z, so the deploy landed about 7 minutes after the merge. The runner and driver Host Capacity pins are the bytes staging serves.

## 5. Before any hosted run: the order of record

The handoff's §4 order (census, then close with the census attached) is **superseded** by `D9-H1-HOSTED-RUN-ORDER.md`, which follows your gateway:
- `verifyResidueCensus` binds only a census read after `closed_at`.
- The reset needs an OPEN run.

The order:
1. pre-write census
2. ensure
3. `preflight` / `docs` / `certify`
4. `cleanup`
5. case-11 census
6. reset
7. close #1 (`ACCESS_CLEAN_FIXTURES_UNVERIFIED` is expected)
8. residue census `e7e8d3d1…`, from a new execution run
9. close #2 with `residueCensusRequestId` → `ZERO_RESIDUE`

Two changes from the handoff:
- **Case 11** (link audited before minting) now has a read-only census: `d9-link-audit-census.sql`. It is a generic `database.read_census`, needs no registry change and is not attached to a close.
- **Driver `next` text:** the driver's advisory `cleanup` output still prints the old order. It decides nothing and was left alone so `6f1b52c8…` holds.

These two documents are committed on `agent/documents` and are not on staging. They pin nothing.

## 6. What remains

- **Host Capacity:** pin both runner entries and the driver, and clear `awaiting_alloy_pins`.
- **Director:** approve the plan bytes, naming driver `6f1b52c8…`.
- **Host Capacity:** add the plan to `eligible_plans`, then release and install.
- **Kelly, DEC-2:** `qa_run_open` with hosted authority declared, then the order in §5.

Nothing here opened a QA run, created an installation or credential, or sent scanner or retrieval traffic.
