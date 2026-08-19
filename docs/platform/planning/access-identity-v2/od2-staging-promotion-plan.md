---
owner: platform
status: sprint
last_reviewed: 2026-08-19
supersedes: []
---

# OD-2 — the staging promotion, and exactly where it stopped

**PR** [#475](https://github.com/ksquared-16/alloy/pull/475) · branch `agent/claude/1-access-identity-v2` at `834ea9a01`
**Staging head at reconciliation** `cb5ff22d2`
**Status:** reconciled, validated, **all CI green, NOT MERGED.** The merge was refused by the execution
environment's permission classifier, not by a branch protection and not by CI.

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

## Migration plan

Staging's migration head is `20260817170000`. Every version this branch adds sorts **above** it, so
they append rather than interleave: no `--include-all`, no collision, no reordering.

| Migration | Program | On staging | alloy-cert |
|---|---|---|---|
| `20260818120000_communication_binding_intake_role` | Comms | absent | applied |
| `20260818123000_email_ingress_eligibility_observations` | Comms | absent | applied |
| `20260818140000_communications_binding_ingress_privilege_repair` | Comms | absent | applied |
| `20260818160000_ingress_eligibility_evaluation_mode` | Comms | absent | applied |
| `20260818170000_w13_collapse_portal_eligible_fifth_layer_grants` | **A&I** | absent | applied |
| `20260818180000_w61_role_key_fk_restrict_no_cascade` | **A&I** | absent | applied |
| `20260818190000_w16_user_roles_role_foreign_key` | **A&I** | absent | applied |
| `20260818200000_w28_replace_role_permission_grants_rpc` | **A&I** | absent | applied |
| `20260818210000_w58_save_role_definition_and_grants` | **A&I** | absent | applied |
| `20260818220000_s3_action_link_token_hash` | **A&I** | absent | applied |
| `20260818230000_s3_action_link_token_drop_plaintext` | **A&I** | absent | applied |
| `20260818240000_w60_m20_drop_catalog_compatibility_views` | **A&I** | absent | applied |
| `20260819120000_w13_i35b_analytics_read_preservation` | **A&I** | absent | applied |
| `20260819130000_w20_drop_unattached_handle_new_user` | **A&I** | absent | **NOT applied anywhere** |
| `20260819140000_od8_ops_users_roles_read_preservation` | **A&I** | absent | applied |

None is *superseded*, none is an *equivalent landed under another version*, and none is a duplicate
semantic migration — the classification the promotion instruction asks for resolves to two buckets
only: **absent from staging and required**, and one **absent and never applied anywhere**.

### The grant → convert orders that must not be broken

Two migrations are preservation grants whose dependent code is in the same PR. Applying the code
without them narrows real operators' access, which is `W-8`'s recorded mistake:

- **`20260818170000`** grants `admin`/`ops` their capabilities **before** `W-13` stops honouring the
  `portalEligible` role literal;
- **`20260819140000`** grants `ops → settings.users_roles.read` **before** `admin/users` GET converts
  to the capability gate. `Q15-B4` measured the exposure: `ops` lacked the key in 2 deployed
  organizations. The migration fails closed while any org defining `ops` is uncovered.

`20260819120000` is the same shape for analytics and already sits in order.

### `20260819130000` — apply last, or not at all this pass

It drops the unattached `handle_new_user()`. It has been applied to **no** database; it was proven
only inside a rolled-back transaction. It aborts if the function is attached in the environment being
migrated, so it is safe to attempt — but it is the one migration with no runtime exercise behind it,
and nothing in the promoted code depends on it.

### The four Communications migrations

Carried into this branch earlier for cert-ledger reconciliation: self-contained DDL, applied to
`alloy-cert` by the Communications lane, present in no pushed history. **They are not required by the
promoted code.** They are flagged rather than promoted silently — if Communications should own their
promotion, they can be stripped from this PR without affecting any A&I migration, because every A&I
version sorts above all four.

## Where this stopped, and why

The merge, and therefore everything downstream of it, is outside this lane:

| Step | State |
|---|---|
| Reconcile with staging | done |
| Validation on the reconciled branch | done — 778/778, prebuild, **all CI green** |
| PR opened | done — #475 |
| **Merge to staging** | **blocked — permission classifier refused the action** |
| Apply migrations to staging | unreachable: depends on the merge, and this lane holds no deployed credential |
| Staging runtime certification | unreachable |
| Staging browser certification | unreachable |

There is no sanctioned Director path for the remaining steps either. The trusted-host action registry
holds exactly one action, `database.read_census` — read-only. There is no registered action for
applying migrations to a deployed environment, and no promotion script in the toolkit. So the
governed-action channel that answered `Q15` and `Q18` cannot carry this.

**Nothing was worked around.** The local certification in this branch is against `alloy-cert` and is
not staging certification; it is not offered as one.
