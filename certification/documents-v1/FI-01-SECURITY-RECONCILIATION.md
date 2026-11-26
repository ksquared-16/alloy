# Documents V1: FI-01 security release reconciled into D7/D8

**Status: `FI01_RECONCILED_INTO_D7_D8_LOCAL_NOT_PROMOTED`.** This is local integration only. Nothing has been pushed, released, merged to staging or deployed. The D7/D8 migrations (`20261213090000`, `20261214090000`) are still unapplied to any shared environment.

- Reconciles: the FI-01 security sprint `OPWORK_AA660DC9554D_SPRINT_E3234F16E6CF`, condition c3 ("Security commits reconciled into agent/documents with EN-FI-01 suite green").
- Lands in: the D7/D8 sprint `OPWORK_AA660DC9554D_SPRINT_6389E3AA927A`, run `erun2_df4fe0dfb6235fc5`.

## Merge

- Merge `0de224d03`, made with `--no-ff`. No rebase, and no rewritten commits on either side.
- Parents:
  - `3063412a3`: the D7/D8 batch, checkpoint `ick_4911041798f8`.
  - `24b03991c`: deployed staging, PR #1610. `/api/build-info` reported this SHA on 2026-10-28.
- Merge base: `317eafa5b`. Staging contributed 7 commits and D7/D8 contributed 30.

### Conflicts

There were two conflicts:

| File | Resolution |
|---|---|
| `web/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM.ts` | **Import block only.** Kept the EN-FI-10 `immunizationEvidence` import. FI-01's disclosure-gate imports were already on both sides. The resolved file is the D7/D8 file. All 13 of staging's line changes to it are present, and none of the lines staging removed came back. |
| `web/tests/documents/documentsEnFi01MedicalMetadata.test.ts` (add/add) | Staging's file is a strict superset: D7/D8's 20 tests plus 11 more. It was taken whole, so the suite has **31 tests**. |

Of the 27 files staging changed, 17 overlap D7/D8. Fourteen of the overlapping files merged byte-identical to the D7/D8 side, because B4 `d34f21b80` already carried `406f74db9`. For every staging-side change, `git diff 317eafa5b 24b03991c -- <f> | git apply --check -R --cached` confirms the change is present in the merge. The only file that check could not apply to is the Health card, because its context lines shifted; it was verified line by line instead (see the table above).

## Security ancestry

All six FI-01 security commits, and the deployed merge, are ancestors of `0de224d03` (`git merge-base --is-ancestor`):

| Commit | Protection |
|---|---|
| `406f74db9` | Medical document metadata only for a reader who may read the document. D7/D8 also has it as `d34f21b80`. |
| `465a1e023` | Live suites pass the Health card's document reader. D7/D8 also has it as `1cdb3918d`. |
| `73c6e32a2` | Related-records subject scope, OCR preview scope, the p076 diagnostic gate, and generate-document provenance. |
| `0cfc875cc` | EN-FI-01 database invariants: medical classification, linkage, vocabulary and owner association. |
| `8f7f1dd47` | D1b OCR preview tests pass the scoped access context. |
| `78b56595e` | Security census, authorization contract and the hosted driver. |
| `24b03991c` | The deployed PR #1610 merge. |

## Hosted evidence preserved

These files were copied from the promotion worktree without modification. They are new files, and no historical artifact was overwritten.

| File | sha256 (prefix) | Content |
|---|---|---|
| `en_fi01_hosted_results.baseline.qar_024bbaaae38c.json` | `827847c3ea0f8d82` | Pre-deploy, 43/43 expectations met. The medical source label was **exposed** (`leaked: true`). |
| `en_fi01_hosted_results.certify.qar_024bbaaae38c.json` | `1989b2616d6674d2` | Deployed: 43/43 pass across the 7 registered personas plus anonymous. The label is hidden, and nothing leaked. |
| `en_fi01_hosted_fixture_ids.qar_024bbaaae38c.json` | `4811774ded429d80` | Synthetic fixture UUIDs only. |
| `../qa-shared/documents-zero-residue-census.sql.results.qar_024bbaaae38c.json` | `a02c95899dbfa000` | Census `gar_d6351f9938d579` on `alloy_deployed_primary`, bound to QA run `qar_024bbaaae38c`. All **15/15** checks zero. |

None of these files contains an email address, token, session path or URL. The tracked `documents-zero-residue-census.sql.results.json` keeps its committed D6 historical content (the `qar_af1c638fd52a` era). The post-FI-01 census sits beside it under its run name and does not replace it.

## Local validation

These results are for the merge tree, through the `vac run` broker.

| Check | Result |
|---|---|
| FI-01 suite (`documentsEnFi01MedicalMetadata.test.ts`) | **31/31 passed** |
| `tests/documents` and `tests/health` | 44 files: 41 passed, 3 skipped (`health/live`, which needs a live database). Tests: **647 passed**, 21 skipped. |
| `tests/enrollment` plus the 18 files covering the touched modules (admin packet routes, the adminV2 health read shape, POS processing, runtime producers and first-order, surfaces) | 61 files: 54 passed, 6 skipped (live), 1 failed. Tests: 519 passed, 41 skipped, **1 failed**. |
| The one red: `producerOverlapContract` "G/H — mismatch discards the WHOLE run" | **Pre-existing, not from this merge.** It is a source-text guard looking for `cards: earlyRunUsable` in `composeProvisioningAnswerForRoute.ts`. That file (`6b3215fe5`) and the test (`f6633a069`) are the same blobs at `317eafa5b`, at both parents and at the merge, and the deployed staging carries them too. It is deterministic: it failed again on two reruns alone. |
| `vac run typecheck` | Passed |
| `vac run typecheck:tests` | Passed |
| Prebuild guards (`npm run prebuild`, all six) | Passed |
| Production build | Run once, on the final candidate. The result is recorded in the checkpoint. |

Live suites (`health/live`, `enrollment/live`) were not run against the shared stack in this step.
