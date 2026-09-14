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

---

# S1 — repository execution profile

S1 moved the **execution conventions** behind the same record/profile authority
S0 established. Values are unchanged for Alloy; the generic profile resolves
none of them.

## Moved behind repository authority in S1

| convention | was | now |
|---|---|---|
| first agent port `3011` | `DEFAULT_FIRST_AGENT_PORT` in `managed-slots` | `executionProfileFor(rec).first_agent_port`; **null** without managed slots |
| worktree namespace `alloy-worktrees` | a default argument in six modules | `worktreeParentFor(rec)`; **null** for a profile with no namespace |
| GitHub slug `ksquared-16/alloy` | `DEFAULT_REPOS`, and a default parameter in `promotion-train` | `executionProfileFor(rec).remote_slug` |
| hosted domain `staging.workwithalloy.com` | two literals in `deployed-target-registry` | `executionProfileFor(rec).hosted_host` |
| database target `alloy_deployed_primary` | three `||` fallbacks that silently gave any project Alloy's database | `alloyDatabaseTarget()`, from Alloy's profile |

`3011` was deliberately **not** renamed to a generic default. It is Alloy's
port; a repository with no managed slot range has none.

## Still Alloy-specific, and whose slice

| occurrence | files | slice | why |
|---|---|---|---|
| `ALLOY_RUNTIME_ROOT` | 90 | **S3** | rename with a deprecation alias |
| `ALLOY_SERVER_ENV_SOURCE` and env-source mechanics | 10 | **S2** | host credential plumbing, not project config |
| `/Users/Kelly/Alloy` fallbacks | 7 | **S3** | below the registry since S0; deletable once every host is seeded |
| `alloy_deployed_primary` in operator-only denylists (`executor-authority`, `trusted-host-authz`) | 2 | **keep** | these are *never-auto-approve* names, a safety list every project benefits from — not Alloy configuration |
| `alloy_deployed_primary` in production-apply / ledger-repair target lists | 3 | **S2** | they name an environment, and an environment moves whole |
| `alloy-worktrees` in observation/hygiene default arguments | ~6 | **S2** | read-only observers; converting them needs the record threaded through, which is S2's plumbing |
| `3011–3016` in `policies.mjs` prose and `reconciliation-observe` | 2 | **S2** | documentation text and an observer's scan range |
| `alloy_deployed_primary` in a conversation string | 1 | **cosmetic** | operator prose, not configuration |

Nothing is unassigned.
