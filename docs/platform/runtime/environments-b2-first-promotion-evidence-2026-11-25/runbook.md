# First-promotion runbook — ecc1d912ca2f → rehearsal on the new project `rehearsalnewprojectr`

Manifest sha256: `425b6c53bd4a2eaccf3f143dfb6d3edab21279850a5d2aa638ad42a3b3c94d54` (confirm code `425b6c53bd4a`)
Replaces main `bbfbec76d7795cc3392b0c61e1c8ce829adaf9d2` on `vslwnntzzgpnmrpjipat`, which is **not touched** and is the rollback target. 7828 commit(s).
The whole chain: 558 migration(s), `20260328120000` … `20261223090000`, in version order, 45 of them destructive by classification (they run on a project that serves nothing).

Every command is the owner's (or the operator session's with the owner present). `$PRODUCTION_DB_URL` is the **new** project as `postgres`, on port **5432** (direct connection or session pooler, never the transaction pooler 6543); `$PRODUCTION_DB_URL_READONLY` is its read-only role. The release tool never sees either. Every write first runs this guard:

```bash
fp_target() { case "$1" in *:6543*) echo "refused: transaction pooler (6543)"; return 1;; esac; case "$1" in *vslwnntzzgpnmrpjipat*) echo "refused: names the previous project"; return 1;; *rehearsalnewprojectr*) return 0;; esac; echo "refused: does not name the new project rehearsalnewprojectr"; return 1; }
fp_target "$PRODUCTION_DB_URL" && fp_target "$PRODUCTION_DB_URL_READONLY"
```

## 4. owner.approval

```bash
node scripts/release/alloy-release.mjs approve --config <release-dir>/release-config.json --manifest <release-dir>/manifest.json --approver <owner> --confirm 425b6c53bd4a --ttl-hours 4
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step owner.approval --status pass --detail '{}'
```

## 5. production.snapshot

The rollback point is the untouched previous project `vslwnntzzgpnmrpjipat`. Record the new project's empty state:

```bash
fp_target "$PRODUCTION_DB_URL" && pg_dump "$PRODUCTION_DB_URL" -Fc --no-owner -f <release-dir>/pre-chain-empty.dump && shasum -a 256 <release-dir>/pre-chain-empty.dump
curl -fsS https://www.workwithalloy.com/api/build-info > <release-dir>/before-build-info.json
node scripts/release/alloy-release.mjs emit-sql ledger-if-present | psql "$PRODUCTION_DB_URL_READONLY" -At -X -q -f - > <release-dir>/before-ledger.txt
node scripts/release/alloy-release.mjs emit-sql fingerprint | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/before-fingerprint.txt
node scripts/release/alloy-release.mjs emit-sql orgs | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/before-orgs.txt
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step production.snapshot --status pass --detail '{"dump_sha256":"<sha256>","rollback_target":"vslwnntzzgpnmrpjipat"}'
```

## 6. schema.expand — the whole chain (briefing §4 items 2–6)

Platform schemas (`auth`, `storage`) are the hosted project's own; never run migrators against it. Re-read the ledger: it must still be empty.

```bash
node scripts/release/alloy-release.mjs emit-sql ledger-if-present | psql "$PRODUCTION_DB_URL_READONLY" -At -X -q -f - > <release-dir>/pre-chain-ledger.txt
node scripts/release/alloy-release.mjs check-ledger --config <release-dir>/release-config.json --manifest <release-dir>/manifest.json --ledger <release-dir>/pre-chain-ledger.txt
fp_target "$PRODUCTION_DB_URL" && node scripts/release/alloy-release.mjs emit-sql ledger-table | psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -X -q -f -
for v in $(node scripts/release/alloy-release.mjs apply-order --manifest <release-dir>/manifest.json); do
  ( set -o pipefail; fp_target "$PRODUCTION_DB_URL" && node scripts/release/alloy-release.mjs emit-apply --manifest <release-dir>/manifest.json --version "$v" | psql "$PRODUCTION_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -X -q -f - ) || { echo "STOPPED at $v"; break; }
  node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step schema.expand --status applied --detail "{\"version\":\"$v\"}" > /dev/null || break
done
```

Any failure: stop. The failing file left nothing (one transaction). Nothing serves from this project yet: hold, then fix forward with a new candidate or delete and recreate the project.

Census (briefing §4 item 6), before any code points here:

```bash
node scripts/release/alloy-release.mjs emit-sql ledger | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/census-ledger.txt
node scripts/release/alloy-release.mjs emit-sql fingerprint | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/census-fingerprint.txt
node scripts/release/alloy-release.mjs emit-sql orgs | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/census-orgs.txt
node scripts/release/alloy-release.mjs emit-sql census | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/census-extras.txt
node scripts/release/alloy-release.mjs check-production --config <release-dir>/release-config.json --manifest <release-dir>/manifest.json --stage schema --ledger <release-dir>/census-ledger.txt --fingerprint <release-dir>/census-fingerprint.txt --orgs <release-dir>/census-orgs.txt --census <release-dir>/census-extras.txt
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step schema.expand --status pass --detail '{}'
```

`--stage schema` compares the fingerprint with staging's from the manifest; take staging's again in the same window (`emit-sql fingerprint` against staging's read-only role) and `diff` it with the manifest's `expected_fingerprint` if staging was observed earlier than the window.

## 7. code.deploy

Only after the platform settings name the new project (briefing step 10; `NEXT_PUBLIC_*` before the build).

```bash
test "$(git ls-remote origin refs/heads/main | cut -f1)" = "bbfbec76d7795cc3392b0c61e1c8ce829adaf9d2"   # main is still what was approved
git push origin ecc1d912ca2f3753c965ffb2888681cd944fcfa5:refs/heads/main   # fast-forward only; never --force
until b=$(curl -fsS https://www.workwithalloy.com/api/build-info) && echo "$b" | grep -q '"gitSha":"ecc1d912ca2f3753c965ffb2888681cd944fcfa5"' && echo "$b" | grep -q '"supabaseProjectRef":"rehearsalnewprojectr"'; do sleep 30; done
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step code.deploy --status pass --detail '{}'
```

## 8. production.verify

```bash
curl -fsS https://www.workwithalloy.com/api/build-info > <release-dir>/after-build-info.json
node scripts/release/alloy-release.mjs emit-sql ledger | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/after-ledger.txt
node scripts/release/alloy-release.mjs emit-sql fingerprint | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/after-fingerprint.txt
node scripts/release/alloy-release.mjs emit-sql orgs | psql "$PRODUCTION_DB_URL_READONLY" -At -X -f - > <release-dir>/after-orgs.txt
node scripts/release/alloy-release.mjs check-production --config <release-dir>/release-config.json --manifest <release-dir>/manifest.json --build-info <release-dir>/after-build-info.json --ledger <release-dir>/after-ledger.txt --fingerprint <release-dir>/after-fingerprint.txt --orgs <release-dir>/after-orgs.txt --stage final
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step production.verify --status pass --detail '{}'
```

On failure — **code.rollback** (granted with this approval): Vercel → Deployments → the production deployment of
`bbfbec76d779` → Instant Rollback. It is wired to `vslwnntzzgpnmrpjipat`, which nothing changed. Wait until build-info serves it on that ref, then `node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step code.rollback --status pass --detail '{}'`. Render goes back the same way (briefing §7).

## 9. schema.contract

Nothing after the deploy: the chain ran in version order at step 6.

```bash
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step schema.contract --status skip --detail '{"reason":"first promotion: destructive files ran in version order at schema.expand","destructive_in_chain":45}'
```

## 10. release.record

```bash
node scripts/release/alloy-release.mjs record --config <release-dir>/release-config.json --audit <release-dir>/audit.jsonl --manifest <release-dir>/manifest.json --approval <release-dir>/approval.json --step release.record --status pass --detail '{}'
node scripts/release/alloy-release.mjs verify-audit <release-dir>/audit.jsonl
```

Commit the release directory (config copy, manifest, staging verification, approval, observations, census, audit) as the release's evidence.

