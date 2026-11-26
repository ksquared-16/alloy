# B2 evidence: the release tool's first-promotion mode, rehearsed non-live (M3, M4, M9)

Slice B2 of the ALY-14 first promotion ([briefing](../environments-p1s-first-promotion-briefing-2026-11-25.md) M3, M4, M9,
§4). The code is `f60f1ae66` (`scripts/release/`); the procedure is
[`production-release-procedure.md`](../../governance/production-release-procedure.md) *First promotion (opt-in mode)*.

**Local only.** Throwaway `supabase/postgres:17.6.1.165` containers with tmpfs data, no host ports, no mounts. The only
network ever attached is an `--internal` one for the GoTrue and Storage migrators, and it is removed before any migration
runs. This is not the shared `alloy-cert` stack, no supabase CLI was used, no fetch was run, and no hosted service was
contacted. The ref `rehearsalnewprojectr` is invented. Teardown left no containers and no networks (`stdout.txt`, last line).

Reproduce: `bash first-promotion-rehearsal.sh <evidence-dir>` from the worktree root (about 3 minutes).

## What ran

| Step | Command (as the runbook prints it) | Result | File |
|---|---|---|---|
| simulated candidate | step-1 merge of this branch into `origin/staging` (`git merge-tree`, pinned identity and date), then P4 `build-candidate.sh` over it and `origin/main` | candidate `ecc1d912ca2f`, 558 files, head `20261223090000` | `stdout.txt` |
| **M9** identify | `release identify` with **no** `--allow-tree-diff` | exit 0, `tree_diff_from_staging: []`, fast-forward | `identify-no-allowance.json` |
| **M4** config copy | `release first-promotion-config --new-ref rehearsalnewprojectr --out release/release-config.json` | production names the new ref, `previous_supabase_project_ref` `vslwnntzzgpnmrpjipat`, `derived_from_sha256` the committed file | `release/release-config.json` |
| plan | `release plan --first-promotion --production-ledger <empty>` | ready: 558 in version order, 45 destructive listed, `contract` empty | `plan-first-promotion.json` |
| prepare | `release prepare --first-promotion --config release/release-config.json …` | manifest written, `mode: first_promotion`, sha256 `425b6c53bd4a…` | `prepare.json`, `release/manifest.json` |
| runbook | `release runbook --manifest … --config …` | the commands the window runs | `runbook.md` |
| owner.approval | `release approve` in environment `rehearsal` (a production approval needs the owner at a terminal; the tests stub the owner the same way) | approval with `schema_contract` in scope, recorded | `approve.json`, `release/approval.json` |
| target guard | the runbook's `fp_target` on five URLs | accepts the new ref on 5432 (direct and session pooler); refuses 6543, the previous project, and staging | `target-guard.txt` |
| schema.expand | `check-ledger` (empty), `emit-sql ledger-table`, then `apply-order` → `emit-apply \| psql -v ON_ERROR_STOP=1 --single-transaction` per file, one `record … applied` each | 558 of 558, 0 failed, 94 s | `check-ledger.json`, `apply.log` |
| census | `check-production --stage schema --census …` | pass: ledger, fingerprint equal to the staging stand-in, `rls_disabled` 0, one org (`_w17_selftest_…`, `retired`), six extensions, bucket `org_documents`, `clock_activation_certification` 1, row counts | `check-schema.json`, `release/census-*.txt` |
| production.verify | `check-production --stage final` with build-info on the new ref | pass | `check-production-final.json` |
| schema.contract, release.record | `record … skip`, `record … pass`, `verify-audit` | chain verifies, 568 entries | `verify-audit.json`, `release/audit.jsonl` |

## Refusals measured (`refusals/`)

| Case | Exit | Failure |
|---|---|---|
| routine `plan` over the empty ledger (no flag) | 1 | `contract_not_last: 20260329210000_…` (normal mode unchanged) |
| `plan --first-promotion` over a 558-version ledger | 1 | `first_promotion_ledger_not_empty` |
| `prepare --first-promotion` with the committed config | 1 | the config names no `previous_supabase_project_ref` |
| `prepare --first-promotion` over a non-empty ledger | 1 | `first_promotion_ledger_not_empty` |
| `check-production` with build-info on the old ref | 1 | wired to `vslwnntzzgpnmrpjipat`, expected `rehearsalnewprojectr` |
| `check-production` with the committed config | 1 | config names other refs than the manifest |

Tests on the same commit: `test-runs.txt` (release-procedure 40/40, settings-checklist 6/6, release-rehearsal 26/26).

## What this does not show

- The real candidate. It is rebuilt at briefing step 2, after the step-1 merge; the SHAs here are simulated.
- Hosted `auth` and `storage`. The new project brings its own; here, GoTrue and Storage migrators stood in for them.
- Staging's real tenancy. The staging stand-in's org listing is Firefly and the two QA fixtures plus the stand-in's own
  retired W-17 org. Hosted staging also lists Alloy Bend (`retired`), which staging verification fails as committed
  (briefing §9).
- Time on the hosted project. The 94 s is a local container.
