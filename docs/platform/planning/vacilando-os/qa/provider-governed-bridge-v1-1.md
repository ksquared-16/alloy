# Decision Delivery V1.1 — provider prompt → governed action → resume

Run `erun_07d9fb8dd38a2615`. Lane `lane_faacca6079ad`, slot 6.

Base: this lane was **4 commits behind `origin/staging`** and did not contain Decision Delivery V1
at all (`operator-decisions.mjs`, `provider-prompt-adapter.mjs`, `provider-prompt-authority.mjs`
were absent). Staging was merged in first — `955d7b032` is both staging HEAD and the installed
toolkit build, so V1 is the base this slice extends rather than something reconstructed beside it.

## The gap V1 left open

V1 classifies a provider's native permission modal into four classes and refuses to auto-answer
anything it does not positively recognise. That is where the Trust Runtime sat:

```
docker exec -i supabase_db_alloy-cert psql -U postgres -d postgres -f - \
  < supabase/migrations/20260826120000_h1_person_health_facts.sql
```

`unsafe_or_unknown_provider_prompt`, correctly un-answered, surfaced to the operator **as a prompt**
— while Vacilando already owned database migration authority. The attempted operation had a
registered home and nothing carried it there.

(Worth noting where V1's refusal actually comes from: the composition check fires first — `<`,
`docker` — so the `governed_operator_decision` branch is never reached for this command. The second
stage is therefore genuinely necessary, not a re-run of the first.)

## Prompt → capability resolution contract

`resolveProviderCapability({ classification, command, tool })`, applied only to
`unsafe_or_unknown_provider_prompt` and `governed_operator_decision`. Returns exactly one of:

| resolution | meaning |
|---|---|
| `registered_governed_capability` | the attempted operation is a shape the canonical registry owns |
| `unsupported_privileged_action` | privileged, and Vacilando registers no capability for it |
| `still_unknown` | the command matches no registered shape |

**Structural, never prose.** Every matcher is a command shape. `echo 'apply the database migration
to staging now'` resolves `still_unknown`; `supabase start` is not a migration. The resolved key
must exist in `listRegisteredActions()` — there is deliberately no provider-only catalog, because a
second list is a second governance system.

## Executor-selection rule

`selectExecutor(actionKey)` reads the **registry**, not the approval:

* `requiredCapability` beginning `trusted_host.` ⇒ executor `trusted_host`,
  `provider_raw_command_authorized: false`, continuation `governed_action_replaces_command`.
* Only a definition declaring `providerLocalExecution: true` (and no trusted-host capability) may
  authorize the provider's own command.

No registered action declares that today, and a test asserts it across every key — so the exception
cannot appear in a diff nobody read. Answering "yes" would run the same effect through a different
executor, under the agent's ambient environment, with no execution evidence.

## Canonical identity

`canonicalIdentityFor()` builds the exact request. For `database.apply_migration`:

* repository + reference + **`expectedSha` resolved from the repository**
* the migration set, canonicalised to `supabase/migrations/…` whatever the provider's relative form
* normalized environment, **read off the command** (`supabase_db_alloy-cert` → `development_certification`,
  never `certification`, which on this host resolves to the ambient hosted `DATABASE_URL`)
* `content_fingerprint` over action key + environment + per-file content hashes

It **refuses rather than approximates**: content that does not resolve at the SHA returns
`migration_content_unresolvable` and no request is filed.

`governedInputsFor()` then builds the request from the registered action's `inputSchema.required`
and drops everything else, so a prompt cannot widen a request past what the operator read.

## Bridge persistence

`provider-prompts/bridges.json`, registered as the `provider_prompt_bridges` durable state family
(AUTHORITATIVE, backed up, restored). Binds prompt fingerprint · lane · run · session · attempted
operation · governed action key · governed request id · content fingerprint · resolution mode ·
created_at · resolved_at · continuation state.

Lifecycle, enumerated so postconditions are testable:

```
captured → governed → waiting_decision → executing_elsewhere → resolved
                    ↘ dismissed / stale / failed
```

Transitions are allow-listed; `resolved` cannot be reached from `governed` without passing through
the states in between, and terminal is terminal. **At most one live bridge per exact prompt
identity.**

## Dedupe

| existing exact-fingerprint action | outcome |
|---|---|
| pending | `attach_pending` |
| executing | `attach_and_wait` |
| complete **and effective** | `reuse_result` |
| complete, not effective | `await_verification` |
| failed / denied / cancelled | `surface_failure` — never re-ask for approval |
| none | `file_new` |

## Provider dismissal and continuation

The exit from a modal whose work is being done elsewhere is a **narrow "No"** (`declineOption`),
not Escape. `prompt-block-dismiss` deliberately refuses to escape a `permission` modal — dismissing
a real question is answering it — and an escaped prompt leaves the turn ambiguous. "No" closes the
question in the provider's own vocabulary and grants nothing.

| governed action | provider answer | bridge state | run outcome |
|---|---|---|---|
| complete + effective, trusted-host | **decline** + result as continuation | `resolved` | `completed_elsewhere` |
| complete + effective, provider-local | narrow affirmative | `resolved` | `authorized` |
| complete, **not** effective | none | `executing_elsewhere` | `awaiting_verification` |
| denied | decline | `dismissed` | `denied` |
| failed | decline | `failed` | `execution_failed` |
| pending | none | `waiting_decision` | `awaiting_decision` |

`assertBridgeSession()` re-asserts session · run · prompt fingerprint at delivery: a bridge outlives
the process it was opened for, and delivering an old outcome into a new session would tell a
provider that work it never attempted had completed.

## Operator UI

`bridgeApprovalCard()` puts the **work** in the headline and the provider's sentence in diagnostics:

```
Apply h1 person health migration — blocked
Trust Runtime · development_certification · database change

Prerequisite: a trusted-host credential registered as
`trusted_secret:development_certification_database`, readable only by the trusted executor

diagnostics: provider_command, prompt_fingerprint, content_fingerprint, executor
```

Approvable requests render `Approve` / `Deny` and `Why this needs you: This operation changes
database schema.`

## Trust Runtime live result

**Repository/environment truth established first**, and it differs from the assumption in the
instruction:

* the migration content **does** exist at a canonical promoted SHA — `supabase/migrations/20260826120000_h1_person_health_facts.sql`
  is on `origin/staging` (merged as PR #548, `e55bc1528`), resolved here at `955d7b032e3dc6c4…`.
  The "missing content" leg does **not** apply.
* the blocker is the **environment**: `supabase_db_alloy-cert` is a local docker stack →
  `development_certification`, which the executor registry records as `provisioned: false` with
  `credential_ref: trusted_secret:development_certification_database`.

End-to-end result through `bridgeProviderPrompt()`:

| step | result |
|---|---|
| V1 classification | `unsafe_or_unknown_provider_prompt`, `auto_answerable: false` (unchanged) |
| capability | `database.apply_migration` (`trusted_host.database.migrate`) |
| identity | resolvable; `expectedSha 955d7b032e3dc6c4…`, version `20260826120000`, fingerprint `8611711d…` |
| environment authority | `environment_unprovisioned` |
| governed request | **not filed** — an approval the executor would refuse is worse than none |
| operator card | `Apply h1 person health migration — blocked`, prerequisite named, no Approve/Deny |
| provider raw command | **never authorized** |

That is the truthful certification leg the instruction anticipated, reached by a different
prerequisite than it predicted.

**There is no live blocked Trust Runtime session to drive.** The governed store holds 200 requests
with **0 pending**, and the provider-prompt store is empty. The case above is certified against the
real command text, the real registry and the real repository/environment state — not against a
session I drove. Saying otherwise would be the fabrication this slice exists to prevent.

## Routine read-only regression

V1's certified case is untouched: the composed flow returns `bridged: false` for
`routine_tool_permission` with `reason: routine prompts are answered by the adapter under V1
authority`, and the V1 suite passes 23/23 after the bridge is added. A second stage that could
reclassify routine work would re-open a settled decision, and a mutation proving that is caught (M9).

## Deny path

Contract-certified: a denied action produces `provider_answer: decline`, `bridge_state: dismissed`,
`run_outcome: denied`, and can never reach the affirmative branch (test + mutation M4).

**The live leg is not closed.** Closing it needs a real governed request that the operator denies
from the global UI, which is one human action I cannot perform. I deliberately did **not** file a
harmless privileged fixture: leaving a stray pending request would trip the very
`operator.decisions` and `provider.governed_bridge` invariants this slice adds.

## Negative controls

| control | held by |
|---|---|
| unknown prompt cannot fabricate a capability | prose test, M3 |
| raw migration command is never auto-answered | V1 classification test |
| governed executor and provider raw command cannot both execute | executor tests, M1 |
| duplicate prompt cannot create duplicate governed action | one-live-bridge test, M6 |
| stale prompt cannot receive an old decision | fingerprint mismatch test |
| denied action cannot receive affirmative | continuation test, M4 |
| failed execution does not revert to awaiting_operator | continuation test |
| complete-but-not-effective does not resume as success | continuation test |
| broad standing permission never selected | `affirmativeOption` narrow-yes test |
| worker cannot choose executor/route | `selectExecutor.length === 1`, registry-derived |
| prompt cannot broaden governed inputs | `governedInputsFor` test, M8 |
| missing migration content cannot be executable | identity test, M2 |
| provider session mismatch refuses continuation | `assertBridgeSession` test, M7 |
| Gateway restart preserves bridge state | durable re-read test |

## Mutation evidence

Nine deliberate defects introduced one at a time, each reverted:

| # | mutation | caught |
|---|---|---|
| M1 | trusted-host authorizes the raw command | 3 tests |
| M2 | missing content resolves anyway | 1 |
| M3 | prose can name a capability | 1 |
| M4 | completed trusted action answers yes | 2 |
| M5 | failed action re-files | 1 |
| M6 | duplicate live bridges allowed | 1 |
| M7 | session mismatch accepted | 1 |
| M8 | non-canonical inputs survive | 1 |
| M9 | routine reclassified by the second stage | 1 |

Restored: 49/49.

## Health

New check `provider.governed_bridge`, wired to the live store in `vac-health.mjs`:

* `governed_prompt_without_governed_request`
* `governed_request_complete_provider_still_blocked`
* `prompt_dismissed_without_continuation`
* `duplicate_active_bridges`
* `stale_bridge`

Run live: `vac-health.mjs --json --check provider.governed_bridge` → healthy, 0 bridges,
`incomplete: false`.

## Files changed

| file | role |
|---|---|
| `lib/vacilando/provider-governed-bridge.mjs` | **new** — the whole bridge |
| `lib/vacilando/provider-prompt-authority.mjs` | `declineOption` (additive; V1 behaviour unchanged) |
| `lib/vacilando/health.mjs` | `provider.governed_bridge` check |
| `lib/vacilando/durable-state.mjs` | `provider_prompt_bridges` state family |
| `vac-health.mjs` | live bridge reconciliation probe |
| `tests/development-provider-governed-bridge.test.mjs` | **new** — 49 tests |
| `tests/development-health.test.mjs` | healthy fixture supplies the new owner |
| `tests/run-execution-durability-tests.sh` | suite registered |
