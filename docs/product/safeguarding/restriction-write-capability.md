---
owner: product
status: canonical
last_reviewed: 2026-09-23
supersedes: []
---

# Safeguarding restrictions — the governed write capability

**Internal / operator documentation. Nothing here is partner-facing.**

## What was missing

Alloy could already READ safeguarding restrictions and compute pickup authority from them. It could
not create one. `child_safeguarding_restrictions` had readers only — no HTTP route, no registered
action, no service function — so the published `pickup_authorized` contract was correct and
operationally incomplete at the same time: an operator holding a court order had no way to make
Alloy act on it, and the "restriction overrides a pickup grant" case could not be exercised outside
seeded fixtures.

## The two named intents

The domain is append-and-transition, not CRUD. A change SUPERSEDES the prior row so the state on any
past date stays answerable, and history is never rewritten. So there are two intents and no general
update:

| Intent | Route | Effect |
| --- | --- | --- |
| `ADD_RESTRICTION` | `POST /api/admin/children/{childId}/safeguarding-restrictions` | Records an `active`, `approved` restriction |
| `END_RESTRICTION` | `POST /api/admin/children/{childId}/safeguarding-restrictions/{restrictionId}/end` | Transitions it to `revoked`, retaining the row |

`GET` on the collection lists everything recorded for a child, including `proposed`, `expired` and
`revoked` rows — filtering would hide the difference between "nothing was ever recorded" and
"something was recorded that is not in force", which is the distinction the whole model exists to
preserve.

There is deliberately no `PUT`, `PATCH` or `DELETE`. Editing a protective order's terms in place
would leave no answer to "what was in force last Tuesday". Deleting would erase that the child was
ever protected — the fact a later review most needs.

## Why an operator may create an ACTIVE row when a parent may not

`propose_safeguarding_restriction` exists in the Processing Identity command registry and is
deliberately `executableInV1: false`. A parent typing *"her father isn't allowed to get her"* is an
assertion that deserves a person's attention, never a control that switches itself on. The database
enforces the same boundary independently: `CHECK (status <> 'active' OR review_state = 'approved')`.

An operator with manage authority **is** that person. Their deliberate act is the review, so the row
is written `review_state = 'approved'` with `reviewed_by` and `reviewed_at` set to them. The approval
is RECORDED, not skipped — the CHECK is satisfied because the review genuinely happened.

## Authority

| Capability | Roles | Mirrors |
| --- | --- | --- |
| Author / lift a restriction | `owner`, `admin` | the table's RLS **write** policy |
| Read restrictions | `owner`, `admin`, `ops` | the table's RLS **select** policy |

`manager` is excluded from both, because a child's protective order must not read like ordinary
profile content. `ops` may read but not author: authoring or lifting is an approval.

**Two things about this are easy to get wrong and are load-bearing.**

1. **RLS is not the enforcement on this path.** Admin routes hold a service-role client, which
   bypasses row-level security. `lib/safeguarding/safeguardingAuthority.ts` is the enforcement; the
   policies are the specification it mirrors. If that module stops refusing, nothing else does.

2. **The gate is not the permission key.** `crm.customers.safeguarding.manage` is the right key name
   and is declared in `safeguardingRestriction.ts`, but it is deliberately NOT seeded into
   `permission_definitions` — that catalog is frozen at a measured width by another program whose
   tests forbid a worker appending to it, and seeding it is a Director-owned step in Access &
   Identity. Because `permissionKeys` is resolved FROM that catalog, an unseeded key can never appear
   in it, so gating on the key alone would refuse every caller forever. The gate is therefore
   `user_roles.role` — the same column `has_org_role` reads — which evaluates the real policy for the
   real caller. **When the key is seeded, move the gate to it; until then this is not a weaker check,
   it is the same check.**

## Input contract

Minimum safe canonical input. Anything not listed is not accepted.

| Field | Required | Notes |
| --- | --- | --- |
| `restriction_kind` | yes | `custody_restriction` / `protective_or_restraining_order` / `pickup_or_contact_restriction` |
| `operational_effect` | yes | `may_not_pick_up` / `contact_restricted` / `informational_only` |
| `evidence_basis` | yes | `document` / `parent_declaration` / `operator_entry` |
| `evidence_document_id` | when basis is `document` | Documents owns the artifact; this references it |
| `affected_person_id` | no | Null is legitimate — "there is a custody arrangement" names no one |
| `affected_party_description` | no | When the family named someone with no person record yet |
| `effective_from` / `effective_to` | no | `YYYY-MM-DD` |
| `source_reference` | no | |

`source` is always `operator` on this path and is not caller-supplied. `status` and `review_state`
are not caller-supplied either — they are consequences of the authority that was checked.

**`review_note` is never selected or returned by any function in this module.** It is the free-text
field most likely to carry a third party's account of a family, and no caller needs it.

## Lifecycle and pickup integration

The writer produces exactly the canonical state the EXISTING reader consults. **No pickup logic was
changed.**

```
addChildSafeguardingRestriction  ->  child_safeguarding_restrictions  ->  resolvePickupAuthorization
                                                                     ->  list_external_relationships
```

- `status` is decisive. `isInForce` refuses any row that is not `active`, so revocation takes effect
  immediately regardless of the effective dates left behind.
- A future `effective_from` does not bar today.
- `informational_only` never removes collection authority.
- A restriction naming no person does not bar a specific adult by itself — but it does mean the
  situation is not clear, which is what the resolver's `unknown` state is for.

One divergence worth knowing: the public SQL (`list_external_relationships`) treats
`contact_restricted` as removing pickup, while `resolvePickupAuthorization` blocks only on
`may_not_pick_up` and reports `contact_restricted` as unclear. The public path is the stricter of the
two and fails closed, so this is safe; it was measured, not inherited by accident.

## Provenance

The row is its own audit record, and it is append-and-transition so the trail cannot be overwritten:

| Question | Column |
| --- | --- |
| Which tenant | `org_id` |
| Which child | `customer_member_id` |
| Who recorded it | `created_by`, `created_at` |
| Who approved it | `reviewed_by`, `reviewed_at` |
| **Who lifted it** | `updated_by`, `updated_at` |
| Resulting state | `status`, `effective_from`, `effective_to` |
| Where it came from | `source`, `source_reference`, `evidence_basis`, `evidence_document_id` |

`updated_by` was added by `20261016130000_safeguarding_restriction_end_provenance.sql`. Revoking a
protective order is the moment a barred adult becomes collectable again — the single act a
safeguarding review would ask about first — and until there was a writer there was no actor to
record beside `updated_at`.

`logAdminAudit` emits an operational trace alongside, naming the entity, the actor and the resulting
status **and no restriction terms**.

## What this capability is NOT

- **Not partner-facing.** There is no public scope, no `/api/v1` route, and no OpenAPI path, field or
  schema property for safeguarding. This is asserted by test, not by convention
  (`tests/safeguarding/safeguardingWriteAuthority.test.ts`).
- **Not an approval queue.** Taking a `proposed` restriction (from the packet path) to `active` is a
  separate intent that does not exist yet. `propose_safeguarding_restriction` remains non-executable,
  so nothing currently produces `proposed` rows in the first place.
- **Not case management,** not an incident log, and not a child-welfare ontology.

## Operator surface

The HTTP routes above are the operator authority, mirroring exactly how the sibling pickup-grant
capability is exposed (`POST /api/admin/person-child-relationships/{id}/roles`). A dedicated AdminV2
UI is a larger piece of work than this bounded repair and is the obvious next step; the capability is
governed, auditable and testable without it.
