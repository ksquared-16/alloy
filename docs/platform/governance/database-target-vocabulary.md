---
owner: platform
status: canonical
last_reviewed: 2026-10-20
supersedes: []
---

# Database target vocabulary

Written because this exact ambiguity has been reopened more than once. A target
name is an authority boundary, not a label, and the cost of reinterpreting one
is a mutation pointed at the wrong database.

## `alloy_deployed_primary`

**Identity: Alloy's hosted STAGING database. Authority: production-class (operator-only).**

> **Corrected 2026-10-20.** This page used to call the target "the database the
> application serves from". That was an identity claim, and it was wrong. The
> environment identity registry, `environment-identity.mjs` in the installed toolkit,
> measured on 2026-10-18, records the following:
>
> | Field | `alloy_deployed_primary` | Production |
> |---|---|---|
> | Kind | a compatibility alias for `ALLOY_STAGING` | `ALLOY_PRODUCTION` |
> | Supabase project | `ikaxilmwmrmbagoidedu` | `vslwnntzzgpnmrpjipat` |
> | Host | `staging.workwithalloy.com` | `www.workwithalloy.com` |
> | Mutation authority | `OPERATOR_ONLY` | `UNREACHABLE` (no route or credential on this host) |
>
> Staging's own `/api/build-info` reports `supabaseProjectRef: ikaxilmwmrmbagoidedu`.
>
> **Only the identity changed.** Its *authority* stays exactly as described below. The
> registry keeps identity and authority as separate fields on purpose, because
> renaming the target "staging" would have silently widened who may mutate it. The
> rules in this section still hold for any production-class target name. They do
> not license reading `alloy_deployed_primary` as the customer production database.

It is listed in
`BLOCKED_ENVIRONMENTS` (`trusted-host-migrate.mjs`) and in
`OPERATOR_ONLY_ENVIRONMENTS` (`director-authority.mjs`), and both listings are
deliberate and current.

**Do not** reclassify it as staging or certification to let the non-production
migration executor target it. That executor's refusal of production is one of
its most important properties. If a tool cannot reach this database, the answer
is a governed capability with its own authority — not a widened definition of
"staging".

**If Alloy later needs a hosted staging database, introduce a separate explicit
target.** Do not overload or reinterpret this one.

## Who may mutate it

| | |
|---|---|
| `database.apply_migration` | **Never.** Refuses `alloy_deployed_primary` in its own body. Staging, certification and cert only. |
| `database.apply_promoted_migration` | The only owner. Operator-owned, non-delegable, explicit Director approval, one attempt, no arbitrary SQL. |
| `database.read_census` | Read-only. This is how hosted state is measured, and the only thing that can establish parity. |

The two apply actions are separate registrations rather than one action with a
flag, so that an operator reading an approval card can tell them apart and an
approval minted for a staging apply can never be spent on production.

## The rule this encodes

Production classification stays strict. Vacilando gains a governed production
migration capability; production does not become less protected because
automation needs to operate it.
