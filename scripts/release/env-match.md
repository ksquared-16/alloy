# Environment match check (PU2)

Run from the repository root with Node 20 or newer. This is a read-only comparison of configured variables,
not a deployment, promotion approval or check of values in a running build. Nothing is written by the checker.
Output contains names and comparison statuses only: never values, hashes, tokens or raw API errors.

## Owner's terminal

Supply `VERCEL_TOKEN` and `RENDER_API_KEY` through hidden prompts, never command arguments or a file.
For the Mac's default zsh, run these lines in your own terminal (the quoted prompts contain no token):

```zsh
set +x
read -rs 'VERCEL_TOKEN?Vercel token: '
printf '\n'
read -rs 'RENDER_API_KEY?Render API key: '
printf '\n'
export VERCEL_TOKEN RENDER_API_KEY
node scripts/release/env-match.mjs --vercel-project PROJECT_ID --vercel-team TEAM_ID --render-production PRODUCTION_SERVICE_ID --render-staging STAGING_SERVICE_ID --staging-branch staging
unset VERCEL_TOKEN RENDER_API_KEY
```

Replace the four uppercase ID placeholders with non-secret dashboard IDs:

- Vercel project: the web app project's **Settings → General → Project ID**.
- Vercel team: the owning team's **Settings → General → Team ID**. Omit `--vercel-team` for a personal project.
- Render: open each backend service in the dashboard; its URL contains its `srv-…` service ID.
  Use the production and staging services respectively, not deployment IDs. Identical service IDs are refused.

The tokens need read access to these resources. No credentials were used to develop or test this script.
In bash, use `read -rs -p 'Vercel token: ' VERCEL_TOKEN` and the equivalent for `RENDER_API_KEY`.

## Offline review

```sh
node scripts/release/env-match.mjs --offline scripts/release/tests/fixtures/env-match-production.json scripts/release/tests/fixtures/env-match-staging.json
```

Sample output (exit 0):

```text
Environment match: PASS (0 unexpected findings).
vercel:
  production outside allowlist: none
  required production missing: none
  staging-only expected: COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST
  staging-only unexpected: none
render:
  production outside allowlist: none
  required production missing: none
  staging-only expected: none
  staging-only unexpected: none
```

Each file is `{ "vercel": ["NAME"], "render": ["NAME"] }`. Synthetic test fixtures may also contain
`{ "key": "NAME", "value": "synthetic-only" }` entries to exercise flag hashing. Never export live values
to fixtures. A names-only list cannot prove flag equality: if a compared flag is present on both sides without
readable values, the result is `unavailable (comparison incomplete)` and exit 1. Both absent is fine.
Readable flag hashes are compared in memory and reported as `equal` or `differs`; hashes are never printed.

## Policy and limits

`env-match-policy.mjs` reads the existing
[P1S checklist](../../docs/platform/runtime/environments-p1s-settings-checklist-2026-11-25.md) directly.
No separate ENV1 list exists in this checkout, so the 25-key Vercel allowlist is derived as its 22 R/C keys
after excluding `CRON_SECRET` (D4), plus the three explicitly requested flags. Render uses all 11 R/C keys.
Only R keys are unconditionally required (10 Vercel, 4 Render); C keys remain conditional on enabled capabilities.
Only class S is exempted as expected staging-only. Debug/test/unknown keys are not silently exempted.

This is the narrow PU2 allowlist: other F/O keys, including the checklist's always-set drawer-strip pair,
are reported outside it for review. It does not replace the wider checklist's D6 feature-flag copying or capability
checks. The three compared flags are `NEXT_PUBLIC_COMMS_V2_COMPLIANCE`, `AGENT_V1_RECORD_LAYOUT_ENABLED`,
and `AI_ENRICHMENT_USE_PERMISSION_REQUIRED`. Changing the scope requires changing this small policy, not copying lists.

The readable expected-value-difference table in the policy covers Supabase settings, environment identity,
site/backend URLs, provider accounts, webhook/signing secrets and cron tokens. Their values are not compared.
All non-flag keys are presence-only, including conditional model/sender settings; this check does not validate
secret correctness, cross-platform equality, live/test mode, or production destinations.

- [Vercel project env endpoint](https://vercel.com/docs/rest-api/projects/retrieve-the-environment-variables-of-a-project-by-id-or-name):
  GET `/v10/projects/{id}/env`; filter records to Production and Preview, apply matching `staging` branch overrides
  over general Preview variables, ignore other branches and Development. Duplicate scopes fail closed.
  Only the three allowlisted encrypted flags use the
  [individual decrypted-value endpoint](https://vercel.com/docs/rest-api/projects/retrieve-the-decrypted-value-of-an-environment-variable-of-a-project-by-id).
  Plain or explicitly decrypted strings can be hashed. Sensitive, masked, inaccessible or still-encrypted values
  are never hashed as if plaintext: names still work and comparison is marked unavailable (exit 1).
  No bulk decryption or value export is performed. Project variables are the scope; custom environments and
  deployment/system variables are not a runtime inventory.
- [Render service env endpoint](https://api-docs.render.com/reference/get-env-vars-for-service):
  GET `/v1/services/{id}/env-vars`, following cursors in pages of 100. It returns direct service variables only,
  **not linked environment-group variables**. The live report states this limit; PASS is for direct variables only.
  If groups supply required keys, this can report them missing; review groups separately before relying on the result.
- Both endpoints can return values in response bodies. The script discards non-flag values, stores only flag hashes
  in its comparison records, never persists responses, and suppresses all raw errors. Requests time out after 30 seconds
  and reject redirects. API/configuration failures return exit 1 with a static error message.

## Checks

```sh
node --test scripts/release/tests/env-match.test.mjs
npm run -s test:release-procedure
npm run -s test:settings-checklist
```

All new tests use synthetic fixtures and injected fetch responses; none make network calls.
