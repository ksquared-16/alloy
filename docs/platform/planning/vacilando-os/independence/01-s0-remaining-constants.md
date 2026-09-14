# S0 — what was moved, and what was deliberately left

S0 moved **repository identity and branch/promotion policy** behind the existing
repository record and profile. Everything else is enumerated here and assigned to
a later slice, so no Alloy constant is left unowned.

## Moved behind project authority in S0

| constant | was | now |
|---|---|---|
| `ALLOWED_TARGET_BRANCHES` | literal `["staging"]` in `trusted-host-merge` | `promotionPolicyFor(rec).promotion_branch` |
| `BLOCKED_TARGET_BRANCHES` | literal `["main","master","production","prod"]` | `promotionPolicyFor(rec).protected_branches` |
| `PROMOTED_REF` | literal `"origin/staging"` in `repository-execution-authority` | `promotionPolicyFor(rec).promoted_ref` |
| canonical root | guessed: 2 env vars → `~/Alloy` → `/Users/Kelly/Alloy` → cwd | the registry answers first; the guesses remain below it |
| project identity | none | `prj_alloy`, carried on the repository record |

Values are unchanged for Alloy. The generic profile now inherits **none** of
them, which is the whole point of the slice.

## Remaining, with owners

| class | files | slice | why not S0 |
|---|---|---|---|
| `ALLOY_RUNTIME_ROOT` | 90 | **S3** | a rename with a deprecation alias; mechanical, and large enough to drown S0's evidence |
| `supabase` | 27 | **S1/S2** | the database provider belongs to the project's `database` block, which needs the environments block first |
| `alloy_deployed_primary` | 17 | **S1** | an environment target; belongs with the environments block |
| `alloy-worktrees` | 16 | **S1** | worktree parent; the record already holds it, the readers do not yet |
| ports `3011+` | 10 | **S1** | slot/port policy; the profile says `fixed_ports: true` but not which ports |
| `ALLOY_SERVER_ENV_SOURCE` | 10 | **S2** | credential source path; belongs with environments |
| `/Users/Kelly/Alloy` | 7 | **S3** | now below the registry; deletable once every host has a seeded record |
| `ksquared-16/alloy` | 2 | **S1** | the slug is on the record already; two readers still hardcode it |
| `staging.workwithalloy` | 1 | **S1** | environment base URL |

Nothing is unassigned.

## Why these were not folded into S0

S0's evidence is that Alloy's values did not change while their owner did. That
is only legible in a small diff. The environments block (S1) is the next
ownership-complete unit: target, base URL, credential source and slug move
together or not at all, because a half-moved environment has two authorities —
exactly the state S0 exists to end.
