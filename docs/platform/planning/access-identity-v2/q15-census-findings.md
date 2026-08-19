# Q15 — what the real-tenant authority census answered

**Executed** 2026-08-19T19:08:36Z by Director on the trusted host.
**Action** `tha_e1d6bbd4b62a79` · **request** `gar_88740692dbf1e5` · **target** `alloy_deployed_primary`
**Artifact** `docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json`
**Query hash** `e958227e9b3e5387…` — the same hash `validateInputs` computed against the committed
artifact before it ran, so the statement executed is the statement in version control.
**Results** `…/q15-authority-census.results.json` — 186 rows across ten questions.

This lane never held a hosted credential. The census reached the database through the governed
trusted-host path; what came back is bounded result rows carrying role keys, capability keys and
counts, and no name, address or contact column — the artifact's data-minimization policy holds in
the output as well as in the SQL.

## The answers

| Question | Rows | Reading |
|---|---:|---|
| `A1` principals who would lose all authority | **0** | the L4 lockout population is empty |
| `A2` redundant legacy values | **0** | no principal carries one |
| `A3` stale legacy values | **0** | the legacy columns name no role at all |
| `A4` legacy-only principals | **0** | `legacy_only_principals: 0`, `legacy_row_without_org: 0` |
| `B1` roles and their memberships | 4 | `admin` 4 · `ops` 2 · `regional_lead` 1 · `school_director` 1 |
| `B2` role × capability coverage | 83 | |
| `B3` non-`admin`/`ops` roles holding capability | 8 | all `director`, **0 memberships each** |
| `B4` `admin`/`ops` orgs lacking a capability | 79 | `admin` 22 · `ops` 57 |
| `C1` roster capability outside `admin`/`ops` | **0** | |
| `D1` scope population | 1 | 8 memberships · 0 without a profile · 4 site-restricted · 2 department-restricted |

## What each one releases

### `W-20`'s removal half is unblocked — `A1 = 0`

The artifact's rule: *"W-20 removal safe iff Q15-A1 returns zero principals."* It is zero, and three
independent questions agree rather than one answering alone. `A2` and `A3` are zero too, which is
the stronger statement: it is not merely that every legacy value is backed by a canonical
membership, it is that **the legacy columns hold no role for anyone**. `A4` closes the org half —
no principal is reachable only through the fallback, and no legacy row lacks an org.

This confirms `W-0`'s `Q2 = 0` on *current* deployed data rather than inheriting it. §5 of the plan
records that W-20 therefore *"collapses from the four-step ritual to a straight deletion plus its
RL-12 lock"* — no remediation migration, because there is no population to remediate.

**Not yet done.** The deletion spans `resolveAdminAccessCore.ts` and the re-implementation in
`resolveAdminPortalOrgCore.ts` (`M2-5`), must give `handle_new_user()` an explicit disposition
(`W-0` found it defined but unattached — *"one migration away from silently restoring the
default-to-`ops` escalation path"*), and extends `RL-12` to cover any authority path reading a
column whose `CHECK` enumerates roles (`M2-8`: `app_users.role` carries a fourth vocabulary
including `vendor_owner`/`vendor_worker`). The census removes the blocker; it does not do the work.

### The `admin/users` GET exception is **not** resolved — and `C1` alone would have said it was

`C1 = 0`, so no principal outside `admin`/`ops` holds `settings.users_roles.read`. By the artifact's
narrow rule — *"admin_users_exception_resolved_iff Q15-C1 returns zero"* — that reads as resolved,
and converting the gate would widen nothing.

`B4` says otherwise. **`ops` lacks `settings.users_roles.read` in 2 orgs**, and `requireAdminOrOps`
admits `ops` today by ROLE. So a pure capability conversion would **narrow**: operators who can read
the roster this morning could not this afternoon. That is `W-8`'s recorded mistake — an unannounced
narrowing — arriving from the opposite direction to the one the exception was watching for.

This is exactly why the artifact refused to accept either question alone: *"Either alone is
insufficient: B3 alone permits a silent narrowing, B4 alone permits a silent widening."* The census
design earned its keep here; a census that had asked only `C1` would have licensed the conversion.

**The remedy is known and has a precedent in this branch.** `20260819120000` granted `ops` →
`reports.read` before `W-13` removed the `portalEligible` leg from analytics, so no principal
admitted by the leg lost access. The same shape applies: grant `ops` → `settings.users_roles.read`
in every org defining `ops`, verify zero uncovered, then convert. **Authoring that migration is in
scope; applying it to the deployed primary is `OD-2` and is not authorized here.**

### `OD-7`'s conversion burndown — the widening is latent, not live

`B3` is not empty: a role `director` holds eight `ops.*.read` capabilities in one org. But every row
reports `memberships_holding_role: 0`. So the set of *principals* a conversion would additionally
admit is **empty today**, while the set of *roles* that would gain is not.

Stated precisely, because the distinction decides the workstream: converting a `requireAdminOrOps`
gate to one of those capabilities admits nobody now and admits everybody who is given `director`
later. A standing grant is authority whether or not anyone currently holds the role, so this is a
**latent widening**, and `OD-7` rule 6 makes it an exception rather than a permitted conversion. It
is not the "empty, therefore equal-admission" case the rule's happy path describes.

`director` is also a fourth role key outside the seeded vocabulary (`admin`, `ops`, `regional_lead`,
`school_director`). Unlike `owner`/`manager` — `W-44`'s never-seeded pair — it is a real
`role_definitions` row created through the product, so `W-16`'s foreign key is satisfied and `W-44`'s
lock is not violated. It is tenant configuration, not a leak.

### `AD-25`'s fourth layer is populated independently — `D1`

8 memberships, **0 without an access profile**, 4 site-restricted, 2 department-restricted. Scope is
not a derivative of role: a third of these memberships carry a restriction the role does not encode.
This is the first real-data confirmation of the layer `W-62` grades and `W-57` presents as a sibling
of capability rather than a field of the role.

## What remains blocked, and on what

Nothing in this section is blocked on evidence any more. `W-20`'s removal and `W-15`'s
`admin/users` conversion are blocked on **work**, and the conversion's migration is additionally
blocked on `OD-2` for the deployed environment.
