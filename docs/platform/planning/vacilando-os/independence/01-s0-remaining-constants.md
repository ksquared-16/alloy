---
owner: platform
status: sprint
last_reviewed: 2026-09-14
---

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

---

# S2 — project environment authority

S2 moved the layer where Vacilando touches the outside world: credentials,
production databases, and the scope an observer scans. Values are unchanged for
Alloy; a project without an environment resolves **nothing**.

## Moved behind repository authority in S2

| concept | was | now |
|---|---|---|
| server env file | `ALLOY_SERVER_ENV_SOURCE`, then a guess chain ending in `/Users/Kelly/Alloy` | `environmentSourceFor(rec)` / `projectEnvSource(id)`; **null** for a project with no server |
| production-apply targets | `PRODUCTION_APPLY_TARGETS = ["alloy_deployed_primary"]` | `productionApplyTargets()` over `deployedDatabaseTargets()` |
| ledger-repair targets | the same literal, written a second time | `ledgerRepairTargets()`, the same set — the two can no longer drift |
| observer worktree scope | `~/Code/alloy-worktrees` as a default argument in six observers | `projectScope(id).worktree_parent`; **null** for an unregistered project |
| slot port range | `PORTS = [3011 … 3016]` frozen in `reconciliation-observe` | `slotPortsFor(rec)`, from `first_agent_port` + `managed_slot_count` |
| migrations directory | `supabase/migrations` in the promotion train | `execution.migrations_relpath` |
| local database stack | `alloy-cert` in the process classifier | `execution.local_stack_name` |
| policy board prose | `3011–3016` and `~/Code/alloy-worktrees` written as text | rendered from `projectScope` |

`projectScope(id)` answers all five runtime questions — project, environment,
database, deployment target, observation scope — in one place, off the existing
record. No new subsystem, no second profile map.

### `ALLOY_SERVER_ENV_SOURCE` was demoted, not renamed

Renaming it to something generic while it kept Alloy semantics would have
preserved the whole defect behind a tidier label. Instead: only the
Alloy-specific `resolveTrustedServerEnvSource` reads it, it is marked
`@deprecated-input`, and **its removal is assigned to S3** with the rest of the
`ALLOY_`-prefixed runtime variables. New code calls `projectEnvSource`.

### Fail-closed is deliberate

An unseeded registry yields **no** production targets and every apply refuses. A
literal floor there would reintroduce exactly what this slice removed. The
consequence is that an isolated test fixture must now register the project it is
applying for, which `production-apply-executor` does explicitly.

## Deliberately NOT moved

| occurrence | why |
|---|---|
| `alloy_deployed_primary` in `trusted-host-authz` / `executor-authority` denylists | **safety policy, not configuration** — never-auto-approve names every project benefits from. Genericising them because the value contains Alloy's name would weaken authorization to tidy a string. |
| `alloy_deployed_primary` in a conversation string | operator prose |

## Still Alloy-specific, and whose slice

| occurrence | files | slice | why |
|---|---|---|---|
| `ALLOY_RUNTIME_ROOT` | 90 | **S3** | rename with a deprecation alias |
| `ALLOY_SERVER_ENV_SOURCE` as a deprecated host override | 1 runtime reader | **S3** | demoted in S2; deleted with the other `ALLOY_` variables |
| `/Users/Kelly/Alloy` and `~/Alloy` fallbacks | 7 | **S3** | below the registry since S0; deletable once every host is seeded |
| `ALLOY_WORKTREE_ROOT`, `ALLOY_MAX_AGENTS`, `ALLOY_FIRST_AGENT_PORT` in shell (`read-core.sh`, `git-durability.sh`, `common.sh`) | ~6 | **S3** | the shell layer reads env vars, not the JS registry; it moves with the `ALLOY_` rename |
| `supabase/migrations` in acceptance, review and capability regexes | ~12 | **S3** | repository LAYOUT assertions, not environment authority; they move with the layout conventions |
| `alloy-worktrees` in `provider-prompt-authority`, `validate-caps.sh`, `vacilando-secret-preflight`, `vac-health`, `vac-maintenance`, `vac-reconcile`, `vac-worktree-retire`, `workspace-facts`, `identity`, `execution-node`, `control-plane-resilience`, `browser-auth` | ~12 | **S3** | CLI entry points and host-fact collectors, which S3 rethreads when the runtime root moves |

Nothing is unassigned.

---

# S3 — runtime root independence

S3 began by asking what `ALLOY_RUNTIME_ROOT` actually means. The answer decided
the slice: across **104 executable resolutions, every one** falls back to
`~/.local/state/alloy-dev` — a directory under the operator's home. It has never
meant "the Alloy checkout". It means **"where Vacilando keeps its own
control-plane state"**, which is Vacilando's concept wearing Alloy's name.

A rename would therefore have been wrong twice: it preserves the real defect,
and it renames a thing whose problem was never its name.

## The root concepts, told apart

| concept | what it is | authority |
|---|---|---|
| **state root** | where Vacilando keeps control-plane state. Not a repository. | `runtime-roots.stateRoot()` |
| **gateway state root** | `<state>/gateway`. A distinct concept, not a suffix. | `runtime-roots.gatewayStateRoot()` |
| **repository root** | where a registered project's repository lives | repository registry |
| **execution checkout** | the worktree a lane runs in | lane, then its repository |
| **runtime source root** | the Vacilando source *this process* executes from | `import.meta.url`, never cwd |
| **installed toolkit root** | the immutable installed copy serving the Gateway | distribution, not semantics |

## The defect this closes, which had already cost an outage

One variable carried **two incompatible meanings**: 40 executable sites treat it
as the state root, 20 as the Gateway root one level deeper. Which is correct
depends on how the host happens to set it:

| setting | the 40 | the 20 |
|---|---|---|
| unset | **wrong** | ok |
| set to the parent (`alloy-dev`) | **wrong** | **wrong** |
| set to the child (`alloy-dev/gateway`) — *this host* | ok | ok |

The tree is correct in exactly one of three configurations, and the documented
default is not that one.

`trusted-host-merge` was bitten and defended itself with a private probe:
reading the wrong depth named a store file that did not exist, `existsSync` was
false, and the parity gate evaluated against **zero census records for every
merge, permanently**. PR #848 was denied by it while a completed census sat in
the store 42 minutes old. One file solving this privately is exactly what kept
it invisible to the other fifty-nine. The probe is now the owner's.

## Compatibility, and how it ends

`VACILANDO_STATE_ROOT` is the canonical input. `ALLOY_RUNTIME_ROOT` remains as a
deprecated host override, read in **one place** — `runtime-roots.stateRoot()` —
and never as authority. 82 files still read it directly; each is
compatibility-only, each resolves the same default the owner does, and all 82
are **enumerated** in `development-runtime-roots` case 4, which fails when a new
one appears. The list only shrinks.

**Deletion criteria** (all three, assigned to **S5**):
1. every host exports `VACILANDO_STATE_ROOT` or accepts the default, by census;
2. no `scripts/local-dev` shell entry point exports `ALLOY_RUNTIME_ROOT` to a child;
3. the enumerated reader list is down to `runtime-roots.mjs` alone.

## Person-specific paths removed

`/Users/Kelly/Alloy` is gone from executable generic runtime — the canonical-root
candidate list *and* its final `return` (which now fails closed), three
trusted-host shell scripts that reach a production database, and the migrate
object-store candidates (where it was listed and then filtered back out by
literal, two statements of one wrong assumption). Registered repository roots
replace it.

`INSTRUCTED_PATH_PREFIXES` was four literals under another operator's home
**inside a security authority**, with no consumers. On any host but that one the
positive trust list covered nothing, which reads as covering everything. It is
derived now, and on this host resolves both `prj_alloy` and `prj_vacilando`.

## Deferred, deliberately

| debt | why not now |
|---|---|
| the `alloy-dev` directory name | **branding/distribution**, not semantics. No decision depends on the spelling. |
| the `~/.local/share/alloy/toolkit` install path | same; toolkit distribution is explicitly out of scope |
| 82 compatibility readers | routed slice by slice; the ratchet stops new ones |
| `ALLOY_CANONICAL_ROOT` / `ALLOY_REPO` inputs | still honoured above the registry; they name a real thing and are not person-specific |

## Not claimed

`CANONICAL_REPOSITORY_EXECUTION_ROOT_DRIFT` is **untouched**. S3 clarifies which
root is which; it implements no automatic owner for execution-checkout
convergence, so the drift defect stands.
