# Processing Identity — isolated local certification stack

> ## ⛔ SUPERSEDED — do not follow this playbook
>
> This document told you to allocate a fresh 553xx port range and stand up a **separate** Supabase stack. Together
> with the same pattern elsewhere it drove Docker to **35 containers across 4 stacks**, and its stack
> (`alloy-processing-identity-cert`) left a data volume behind on the machine long after anyone was using it.
>
> **Use the one shared stack instead:**
>
> ```bash
> alloy-stack use      # join the shared 'alloy-cert' stack
> alloy-stack status   # who else is using it
> alloy-stack release  # at sprint end
> ```
>
> The shared stack already replays every migration and carries the synthetic tenant, which is what this playbook
> was reaching for. `supabase start` outside it is blocked by a `PreToolUse` hook.
>
> Kept for historical reference only — see
> [`docs/platform/governance/local-docker-containment.md`](../../docs/platform/governance/local-docker-containment.md).

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
