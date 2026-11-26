---
title: CONFIGAUTH_SELFTEST_SCOPE_DEFECT
status: sprint
owner: access & identity
raised_by: Access & Identity V2 — configuration sensitivity migration reconciliation
---

# A self-test that reported a loss that never happened

`20260914183000_configuration_sensitivity_authority` refused a governed apply from inside its own
PL/pgSQL:

```
CONFIGAUTH SELF-TEST: 2 ops role(s) lost a manage key they already exercised through Config Layout Assist
```

The migration was right to refuse rather than proceed on an assumption it could not verify. Its
claim, however, was false in every particular.

## What the deployed primary actually says

Census `gar_d16c35b73af56a` (2026-09-14T20:36:59Z, `alloy_deployed_primary`):

| org | missing keys | classification | audit events naming a manage key | admin in same org |
|---|---|---|---|---|
| `7803388d…` `alloy-bend` | all three | `NEVER_GRANTED` | 0 | holds all three |
| `93667019…` `demo-childcare-co` | all three | `NEVER_GRANTED` | 0 | holds all three |

Not one grant row exists, in any state — not `allowed = false`, not revoked, not audited. Nothing
was lost, nothing was "already exercised", and the migration grants ops nothing, so it could not
have been the cause either way.

Census `gar_d558bf7dc2a558` adds the context that settles it:

| org | created | ops principals | ops grants |
|---|---|---|---|
| `alloy-bend` | 2026-01-27 | 0 | 26 |
| `demo-childcare-co-c144769f` | 2026-04-22 | 2 | 7 |
| `_w17_selftest_0bbaad43` | 2026-09-12 | 0 | **58** |

**The only org that satisfies the assertion is a leftover self-test org** — a throwaway tenant a
W-17 migration created and did not clean up. Every real tenant fails it, because both predate the
default package that grants ops those keys and neither was ever backfilled.

## Root cause

The guard asserts DEFAULT-PACKAGE COMPLETENESS FOR EXISTING ORGS. That is a real invariant with a
real owner — `20260910183000_access_v2_default_role_package_completeness` — and it is not this
migration's business. Conflating the two turned a seeding gap in tenants created in January and
April into a refusal to apply an unrelated authority migration.

The wording compounded it: "lost … already exercised" describes a revocation-after-use, which is the
one state the predicate cannot detect. A reader acting on that message would go looking for a
regression that never occurred.

## Decision

**Option 3 — the assertion is inconsistent with the approved model** — with one deliberate
qualification: the migration file is **not edited**.

It is already applied and ledger-recorded on the deployed primary (`20260914183000` and
`20260914184000` both `registered ~ present`, ledger head `20260915091000`, 437 rows), and editing a
promoted, applied migration would put the recorded artifact and the file permanently out of step for
a guard that has already run. Embedded guards are one-shot by nature.

The durable fix is therefore a repo lock — `web/tests/access/migrationSelfTestScope.test.ts` — which
holds the rule as the tree grows: *a migration may not assert that a role holds a capability unless
that same migration grants it.* The one existing offender is recorded there as a shrink-only
exception that must remain genuinely over-asserting, so the entry cannot rot into a lie.

**No re-apply is required.** The apply that failed was attempting to re-apply an already-applied
migration; its effects are fully present (three sensitive keys catalogued, no admin role short of
the six, ops holding none of the sensitive three).

## What was deliberately NOT done

**The two ops roles were not granted the manage keys.** That would widen live production authority —
`demo-childcare-co` has two real ops principals — on the strength of a defective assertion, and a
one-off grant is exactly what this reconciliation was told not to produce. It is a default-package
completeness question for the migration that owns it, and it is recorded below rather than absorbed.

## Open items for the owning threads

- `OPS_DEFAULT_PACKAGE_INCOMPLETE_ON_LEGACY_ORGS` — `alloy-bend` (26 grants, no ops principal) and
  `demo-childcare-co` (7 grants, two ops principals) sit far below the current ops package of 58.
  Completing them is a policy decision about widening authority in a live tenant, not a cleanup.
- `SELFTEST_ORG_LEAKED_INTO_PRODUCTION` — `_w17_selftest_0bbaad43` is a migration's throwaway tenant
  left behind on the deployed primary since 2026-09-12. Self-tests that provision an org must delete
  it; `20260915091000` does.
