---
owner: platform
status: sprint
last_reviewed: 2026-08-19
supersedes: []
---

# OD-2 — the staging promotion, and exactly where it stopped

**PR** [#475](https://github.com/ksquared-16/alloy/pull/475) · branch `agent/claude/1-access-identity-v2`
**Staging head at reconciliation** `cb5ff22d2`
**Status:** reconciled, cleaned, validated — **ready for the operator to merge.** This lane does not
merge it.

## Reconciliation

Merged `origin/staging` — 102 commits — into the branch. Git found **one** overlapping file,
`20260817170000_communication_ingress_routes.sql`, and it is byte-identical: this branch had taken it
from staging verbatim for cert-ledger parity.

The real conflicts were semantic, and two of the three would have shipped silently:

1. **Five undeclared handlers.** Staging added routes the W-14 census had never seen, so the census
   gate failed on an otherwise clean merge. Three participant token routes took the settled `none`
   classification their fourteen siblings already carry; two Communications handlers were enumerated
   as `inherited`. The ratchet ceiling was **not** raised — 712 pending less 19 inherited is 693.
2. **The W14-F1 disclosure defect, in a new file.** Staging's `TourInternalRecipientsMultiSelect`
   carried `label: row.email?.trim() || row.label` — the exact expression W14-F1 removed from the
   sibling picker. It surfaced only as a *type* error, because the option type no longer has the
   field. Had staging's version kept it, the organisation's address book would have gone back on
   screen for every portal-admitted operator, in a file no lock was watching. The lock's subject is
   now every consumer of the roster projection, discovered rather than enumerated.
3. **A structural parameter that no longer matched Supabase's builder.** `claimActionLink` required
   `Promise` where `maybeSingle()` returns a thenable `PostgrestBuilder`; three action-link routes
   failed on it. `PromiseLike` is what the function actually needs.

Nothing newer on staging was discarded to make this branch apply.

## Migration plan — the final promotion set

Staging's migration head is `20260817170000`. Every version below sorts **above** it, so they append
rather than interleave: no `--include-all`, no collision, no reordering.

**Ten A&I migrations, in dependency order. Nothing else.**

| # | Migration | Purpose | cert-applied | Direct proof |
|---:|---|---|---|---|
| 1 | `20260818170000_w13_collapse_portal_eligible_fifth_layer_grants` | grants `admin`/`ops` the capabilities the role literal conferred implicitly | yes | grant rows verified; **precedes** W-13's code |
| 2 | `20260818180000_w61_role_key_fk_restrict_no_cascade` | two CASCADE FKs collapse to one RESTRICT | yes | constraint state replayed and asserted |
| 3 | `20260818190000_w16_user_roles_role_foreign_key` | `user_roles.role` → `role_definitions`, ON DELETE RESTRICT | yes | FK present; preflight matches on `(org_id, role_key)` only |
| 4 | `20260818200000_w28_replace_role_permission_grants_rpc` | atomic grant replacement, `SECURITY DEFINER`, `service_role` only | yes | `pg_proc` verified; serialization proven by a second caller blocking |
| 5 | `20260818210000_w58_save_role_definition_and_grants` | composes #4 so one submit is one transaction | yes | rollback of the grants half proven to roll the label back |
| 6 | `20260818220000_s3_action_link_token_hash` | adds `token_hash`; dual-read window opens | yes | hash column populated and matched |
| 7 | `20260818230000_s3_action_link_token_drop_plaintext` | drops the plaintext token column | yes | column absent; no plaintext at rest |
| 8 | `20260818240000_w60_m20_drop_catalog_compatibility_views` | retires the two compatibility views | yes | views absent; catalog reads unaffected |
| 9 | `20260819120000_w13_i35b_analytics_read_preservation` | grants `ops` → `reports.read` | yes | fails closed on uncovered orgs; **precedes** the `canReadAnalytics` change |
| 10 | `20260819140000_od8_ops_users_roles_read_preservation` | grants `ops` → `settings.users_roles.read` | yes | fails closed on coverage AND on any `ops` holding the manage key; both guards proven by reverting; **precedes** the `admin/users` conversion |

Every one is **absent from staging and required by the promoted code**, and every one is already
applied to `alloy-cert`. None is superseded, none is an equivalent of a migration landed under
another version, and none is a duplicate semantic migration.

### The grant → convert orders

Three migrations are preservation grants whose dependent code is in the same PR. Applying the code
without them narrows real operators' access — `W-8` is this initiative's own record of that mistake:

- **#1** grants `admin`/`ops` their capabilities **before** `W-13` stops honouring `portalEligible`;
- **#9** grants `ops → reports.read` **before** `canReadAnalytics` drops the admission leg;
- **#10** grants `ops → settings.users_roles.read` **before** `admin/users` GET converts. `Q15-B4`
  measured the exposure on the deployed tenant: `ops` lacked the key in **2** organizations.

Their numeric order is their dependency order, so applying the set in version order is correct.

## Removed from this promotion

### Four Communications migrations — removed

`20260818120000`, `20260818123000`, `20260818140000`, `20260818160000` were carried here for
certification-ledger parity, not because the Access code needs them. Verified before removal rather
than assumed:

- no A&I migration references `communication_provider_bindings` or
  `communication_ingress_eligibility_observations`;
- no promoted application code references either table;
- the one test that names the eligibility table came **from staging**, stubs the table in memory, and
  passes on staging today — where these migrations do not exist.

Their contents were not modified and nothing was recreated under Access. They belong to the
Communications initiative's own promotion path. **They remain applied to `alloy-cert`**, so that
ledger still holds four versions with no file in pushed history; that orphan is the Communications
lane's to close, and removing them here does not make it worse than it was before this branch
carried them.

### `20260819130000_w20_drop_unattached_handle_new_user` — deferred

**Nothing in the promoted runtime depends on it.** It drops an unattached trigger function; no
application code references `handle_new_user`, no promoted behaviour changes with or without it, and
no test asserts its absence. It has been applied to no database and was exercised only inside a
rolled-back transaction.

The rule in the promotion instruction is the one being followed: *do not promote an unexercised
migration when no promoted behavior depends on it.* It is hygiene — it prevents someone
re-attaching a trigger that would restore the default-to-`ops` escalation path — and hygiene with no
runtime exercise does not belong in a promotion whose whole discipline is proven order. It returns
in its own change, applied and verified, once there is a database to exercise it against.

`W-20`'s **enforced** half is unaffected: the legacy fallback is deleted from both resolvers in code,
and `RL-12` locks it there. The disposition of the dormant function is a separate, additive item.

## Where this lane stops

| Step | State |
|---|---|
| Reconcile with staging | done |
| Remove non-required migrations | done — four Communications, one deferred |
| Validation on the cleaned branch | done — tests, prebuild, CI |
| PR ready to merge | done — #475 |
| **Merge to staging** | **the operator's, by instruction** |
| Apply the ten migrations to staging | next, after the merge |
| Staging runtime + browser certification | after the schema is applied |

The local certification in this branch is against `alloy-cert` and is **not** staging certification;
it is not offered as one.

## Immediately after the merge

1. Apply the ten migrations in version order through the sanctioned migration channel. They append
   above staging's head, so no `--include-all` is needed.
2. After each: ledger verify, then the direct invariant the table above names. Stop on the first
   ambiguous result rather than continuing.
3. Exercise the dependent runtime — in particular `admin/users` GET as an `ops` principal, which is
   the one gate whose preservation grant (#10) and conversion land together.
4. Certify the integrated staging environment: authentication/membership, roles/capabilities, scope
   independence, the Access product, route/API authority, and the security invariants.
5. Run the canonical Access browser suite against staging with the seeded non-interactive operator.
