# Database target vocabulary

Written because this exact ambiguity has been reopened more than once. A target
name is an authority boundary, not a label, and the cost of reinterpreting one
is a mutation pointed at the wrong database.

## `alloy_deployed_primary`

**A production-class deployed database target.**

It is the database the application serves from. It is listed in
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
