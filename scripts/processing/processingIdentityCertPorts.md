# Processing Identity — isolated local certification stack

Use a **separate** Supabase stack so certification never touches the default `54321/54322` instance.

## Port map (all verified free before start)

| Service | Port |
|---------|------|
| DB shadow | 55320 |
| API / Kong | 55321 |
| Postgres | 55322 |
| Studio | 55323 |
| Inbucket (Mailpit) | 55324 |
| SMTP | 55325 |
| POP3 | 55326 |
| Analytics | 55327 |
| Pooler (disabled) | 55329 |
| Edge inspector | 55432 |

## Project ID

```toml
project_id = "alloy-processing-identity-cert"
```

Copy `supabase/config.toml` locally (untracked) with the ports above. The repo does **not** track `supabase/config.toml` by convention.

## Commands

```bash
# From repo root
./scripts/processing/processingIdentityCertStack.sh ports   # verify availability
supabase start                                             # after local config.toml is set
supabase db reset --no-seed                                # full migration replay
npm run cert:processing-identity-local                     # 17-check Postgres cert runner
supabase stop --project-id alloy-processing-identity-cert  # cleanup
```

Set `PROCESSING_LOCAL_CERT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres` for vitest:

```bash
PROCESSING_LOCAL_CERT_ENABLED=true PROCESSING_LOCAL_CERT_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55322/postgres' \
  cd web && npm run test -- tests/processing/processingIdentityLocalPostgres.test.ts
```

## D1 migration note

Supabase CLI 2.75.0 rejects multi-statement D1 files on fresh apply. D1 is split across `20260717120000`–`20260717126000` (one primary statement per file). Semantic content unchanged.

## RLS testing note

Raw `SET ROLE authenticated` against `user_roles` can recurse (`user_roles` policies call `has_org_role`). The cert runner uses **policy predicate simulation** with real `auth.users`, `user_roles`, and `has_org_role` JWT binding on the isolated Postgres instance.
