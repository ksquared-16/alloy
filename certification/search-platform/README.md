# Search Platform V2 — certification fixtures

Closes the four Search V2 scenarios that unit tests prove but the shared hosted
tenant cannot: sibling schedule grain, a child in three processes, duplicate-name
disambiguation, and permission-restricted absence.

Everything here runs **only** against the disposable local certification tenant
(`certification/alloy-certify`, org `northwind-early-learning`). Each script
refuses to run if that org is absent, so it cannot be pointed at the shared
hosted tenant by accident. The shared QA tenant is never mutated.

## Status — AUTHORED, NOT YET EXECUTED

⚠️ These fixtures have **not been run**. The local Docker stack could not start on
this host: `supabase start` failed three times with container health-check
timeouts (`realtime`, `storage`, `studio` — a different container each attempt)
while the machine sat at load average 50–78 on 8 CPUs with ~57 MB free RAM. That
is host resource exhaustion, not a defect in these scripts or in the harness.

They are therefore **reviewed but unverified**. Do not record any scenario below
as browser-certified until `alloy-certify verify` has actually run.

## Run

```bash
certification/alloy-certify up                      # join the shared stack + seed
psql "$(certification/alloy-certify db-url)" -v ON_ERROR_STOP=1 \
  -f certification/search-platform/01-search-certification-fixtures.sql \
  -f certification/search-platform/02-search-process-configuration.sql \
  -f certification/search-platform/03-restricted-operator.sql
certification/alloy-certify serve                   # app against the cert tenant
```

Each script ends with a `DO $$` verification block that raises if the scenario it
sets up would not actually be provable — a fixture that silently half-applied is
worse than one that fails.

## What each file provides

| File | Scenario | Key fixture |
|---|---|---|
| `01-search-certification-fixtures.sql` | A, B, C, D data | Smith household (Jane, Joe, Emma), Joe M/W/F + Emma Tue/Thu at child grain, Joe in 3 process instances, three children named "Joe Smith" across three households |
| `02-search-process-configuration.sql` | tenant configurability | Publishes Enrollment / Annual Registration / Subsidy Renewal into `lifecycle_builder_v1` |
| `03-restricted-operator.sql` | permission absence | `qa.restricted@northwind.invalid`, site scope = Riverside only |

## The anti-hardcoding control

Process names exist **only** in `02-…sql`, never in `web/lib/search` — a test
greps the directory to keep it that way. Renaming a `name` value there must
change what Search displays and which query terms promote which process, with no
code change. That is the tenant-configurability proof.

## Credentials

- Operator: `qa.operator@northwind.invalid` · `alloy-local-cert`
- Restricted: `qa.restricted@northwind.invalid` · `alloy-local-cert`

Local-only, non-secret by design — they exist solely on a disposable localhost
stack, in the same class as the seeded operator password the certification
platform already attaches.

## Note on session reuse

`certification/README.md` records that a reused storage-state session is not
accepted by the auth middleware on a cold SSR load. Specs that log in **within
the test** authenticate fully. Search certification specs should follow that.
