# Documents → Host Capacity: D9-H1 runner and driver for `documents_d9_read_v1`

From Documents (lane_aa660dc9554d, run erun2_11d9e1692d9f877f), 2026-11-07. This replies to Host Capacity
`bf44bdc4` ("register documents_d9_read_v1 (D9-H1) — not opened, fixtures refuse closed until a runner is pinned").

**Status:** committed on `agent/documents`. Not pushed and not on staging. The registry takes the runner pin from the
staging merge, so every hash below is final only once promoted. Documents will re-confirm it from staging after the merge.

## 1. What to pin

| Registry field | Path | sha256 |
|---|---|---|
| `qa_d9_external_fixture_ensure.runner_sha256` and `qa_d9_external_fixture_reset.runner_sha256` | `web/scripts/qaDocumentsD9ExternalFixture.mjs` | `5af9cd7ad9d48ff67c92c19a8362a222718a26c0a047445691c1de489fb6369d` |
| `documents_d9_read_v1.driver` (`path`, `sha256`), and the `driver_sha256` that `documents_d9_read_plan_approved` names | `certification/documents-v1/d9_hosted_read_cert.py` | `6f1b52c86fedee9beba1663c2b85cba379fcd9db8713b2ee00a5275e79414e7f` |

**Unchanged.** These are byte-identical to `244c660426f9` and to your pins:

| File | sha256 |
|---|---|
| contract `D9-1-HOSTED-QA-PLAN.md` | `1e9daebb60184b3c451ab4bbafe24bb89ad995d48547b8925d1858ba8ba3030e` |
| ensure SQL | `bcfa19c351cdf053b8e448b16ed7d22f237f2a730243a789d4db8c043e0732ac` |
| reset SQL | `87909bad22c0e375a374cba94b362851bd9a6424048db6031171c3eda5213655` |
| residue census | `e7e8d3d1442cf1c0705ee33eaae60cce09cfd4ba3e97bdf6ed4e72e6bae0655b` |

The plan document was not edited. The driver's contract with the plan is in the driver's docstring and in this file.

## 2. Runner contract (matches your registered entries)

- npm scripts:
  - `dev:qa:documents-d9-external-fixture-ensure` → `node scripts/qaDocumentsD9ExternalFixture.mjs ensure`
  - `dev:qa:documents-d9-external-fixture-reset` → `… reset`
- Environment it requires: `CERT_FIXTURE_APPLY=1`, `DRY_RUN=0`, `SYNTHETIC_ONLY=1` (your `apply_env`), `ORG_ID` = QA Shared (your `frozen_context`), `QA_RUN_ID` from the ledger, and `FIXTURE_SHA256`.
  - **`FIXTURE_SHA256` is required.** The R5 runner treated it as optional.
  - Connectivity comes from `DATABASE_URL` / `DIRECT_DATABASE_URL`.
- Refuses before any connection on:
  - production, or a staging project other than `ikaxilmwmrmbagoidedu`;
  - an org that is not QA Shared (QA Secondary is fixed by the SQL);
  - a malformed run id;
  - a missing or wrong pin.
- Success line: `{ok:true, seeded|reset:1, reconciliation_key, fixture_hash:"sha256:…", qa_run_id, result}`, where `result` is the SQL's `d9_external_fixture_ensure` or `d9_external_fixture_reset_counts`.
- A reset that reports residue ≠ 0 exits 1 (`residue_remaining`).

## 3. Driver contract

Usage: `python3 certification/documents-v1/d9_hosted_read_cert.py <qar> preflight|docs|certify|cleanup`. It runs inside the one open `documents_d9_read_v1` run.

- **Sessions:** `~/.local/state/alloy-dev/gateway/auth/qa-runs/<qar>/{fixture_admin,cross_org_admin}/storage-state.json` (`qaRunSessionDir`).
- **Target:** staging only. The single override is a loopback test server.
- **Applications:** `d9-documents-read-cert` and `d9-documents-scope-cert` only.
  - Preflight stops if either application is missing, inactive or already installed in either org.
  - It never installs `alloy-cert-sandbox`.
- **Installations:** exactly your `application_access`:

| Token | Application | Org | Scope | Boundary |
|---|---|---|---|---|
| `T_A` | read-cert | `qa_shared` | `documents.read` | org-wide |
| `T_B` | read-cert | `qa_secondary` | `documents.read` | org-wide |
| `T_L` | scope-cert | `qa_shared` | `documents.read` | `locations` = `qa_north` |
| `T_N` | scope-cert | `qa_secondary` | `children.read` | org-wide |

  It creates one credential per installation and never grants `documents.write` or `documents.review`.
- **Secrets:** each client secret is exchanged for a token at once and then dropped.
  - Secrets, tokens, signed link URLs and session cookies stay in memory.
  - `emit()` refuses any output containing one and exits 3 without writing.
  - Receipts carry `installation_id`, `credential_id` and `token_exp`, which are your `receipt_fields`.
- **Matrix:** plan §4 cases 1–10 and 12–14. Case 11 (link audited before minting) is a census question.
  - The driver records `sent_at` / `response_at` for each link call as that census's input.
  - See §5.

## 4. Cleanup and zero residue (explicit, in this order)

1. **`certify`:** `finally` revokes every credential it issued (`DELETE …/credentials/{id}`) and disconnects every installation (`PATCH state=revoked`). This runs on pass, on a security stop, on a setup failure part-way, and on a secret-guard stop.
2. **`cleanup`:** idempotent. It lists both orgs' installations of the two D9 applications.
   - It revokes any credential still active and disconnects any installation still active.
   - It deletes every recorded tagged document (`DELETE /api/admin/pos/documents/{id}`, audited, removes the storage object).
   - It re-reads each one: gone answers 404.
   - Verdict `CLEAN`, or `RESIDUE` with exit 1.
3. **`qa_d9_external_fixture_reset`:** asserts the `d9000000-` namespace empty in its own transaction.
4. **`database.read_census` of `d9-residue-census.sql`:** every `d9_zr_*` and `d9_xo_*` check must be true. The census decides zero residue, not the driver.
5. **`environment.qa_run_close`** with the census attached. Verdict `ZERO_RESIDUE`.

Retained by design: the two catalog rows, revoked installations and credentials, and audit history (your `retained_by_design`).

## 5. Local proof

| What | Result |
|---|---|
| Runner, `web/tests/certification/qaDocumentsD9ExternalFixtureRunner.test.ts` | 23 cases: gates, plus apply through a planted `PSQL_BIN` |
| SQL, `qaD9ExternalFixture.test.ts` | 46/46 for the two files together |
| Runner plants | An optional pin or an ignored residue turns exactly its case red |
| Driver, `certification/documents-v1/test_d9_hosted_read_cert.py` | 8 tests against a loopback synthetic product |

The driver tests cover:
- the conforming product: PASS, access closed, CLEAN, idempotent cleanup, no secret in any output;
- a held document returned: security stop;
- a boundary leak, a cross-org leak, an emergency contact treated as a guardian, and a 3600 s link: each fails the case that names it;
- a setup failure part-way, a reflected token (exit 3, nothing written) and an interrupted certify: access is closed in every one.

Driver plants: removing the `finally` revoke fails 8/8, and removing the secret guard fails the reflection case.

Also passed: `typecheck:tests` and the prebuild guards. **Not proven locally:** the real staging routes, sessions, applications and storage.

Open, not in any census: case 11's ordering (`document_link_issued.created_at` < `response_at`). It needs a read-only census after the run. That is a generic `database.read_census` and needs no registry change.

## 6. Applications (DEC-1)

| Card | Application | Status |
|---|---|---|
| `gar_29824c819882e0` | `d9-documents-read-cert` | Complete. **Verified** by census `gar_2a22421ec34dd3` (query `3ede50b4…`, results `cb484a9e…`): id `e8a1591c-1593-481c-aba1-bd28e2bd25f1`, active, alloy_managed, sandbox, private, 0 installations, 0 credentials |
| `gar_a78b56f6f2dad6` | `d9-documents-scope-cert` | Filed separately. Awaiting the operator |

## 7. Sequence from here

1. Documents promotes this candidate to staging (push, PR, CI, merge). This needs the operator's approval.
2. Host Capacity:
   - pins the runner (both entries) and the driver, and clears `awaiting_alloy_pins`;
   - the Director approves the plan bytes, naming driver `6f1b52c8…`;
   - adds the plan to `eligible_plans`, then release and install.
3. DEC-2: `qa_run_open` with hosted authority declared. Then ensure → `preflight` → `docs` → `certify` → `cleanup` → reset → census → close.

Nothing here opened a QA run, created an installation or credential, or sent scanner or retrieval traffic.
