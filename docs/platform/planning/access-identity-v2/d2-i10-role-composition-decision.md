---
owner: platform
status: sprint
last_reviewed: 2026-08-21
supersedes: []
---

# D2 / I-10 — one role per organization, or several?

**Status:** decision requested, not implemented. No D2/I-10 code was written for this document.
**Audience:** operator decision, stated in operator terms. The engineering consequences follow from it.

---

## The decision

> **Should an Alloy user have one role per organization, or multiple composable roles?**

**Director recommendation: multiple composable roles — but make the product SAY so, rather than
adding a capability nobody can see.**

The recommendation is narrower than it sounds, and the reason matters: **the platform already
implements multi-role.** This is not a choice about what to build. It is a choice about whether to
finish something half-built, or to remove it.

---

## What the current data and code already imply

This is the part that should decide the conversation, because it is not a matter of preference.

**1. The database is already multi-role, deliberately.**
`user_roles` had its primary key changed from `(user_id)` to `(user_id, org_id, role)` in
`20260505120000_user_roles_composite_primary_key.sql`. A row per role is the schema's design, and
the migration says it exists specifically to allow "ops + regional_lead".

**2. Effective access is already the UNION of every role held.**
`resolveAdminAccessCore.ts` builds `roleKeys` as a de-duplicated set of every row for the pair and
fetches permissions with `.in("role_key", roleKeys)`. A user holding two roles today gets the union
of both. That is live behaviour on staging and production, not a proposal.

**3. Only the WRITE path is single-role.**
`PATCH /api/admin/users/[userId]/role` replaces all rows with one. Its own docstring admits it:
*"Multi-role personas (e.g. ops + regional_lead) must be re-added via seed or a future additive
API."*

**4. The product has already been defending users against that write path.**
Two independent guards exist because the mismatch caused real damage:
- **W-54 / `I-34`ᴬ (server):** the replacement is *refused* when it would delete a role the request
  did not carry. Callers that cannot render the whole membership are refused outright.
- **M2-17 (client):** the Access surface itemizes exactly which other roles a save would remove and
  requires a deliberate acknowledgement first.

**So the honest reading is: Alloy is a multi-role platform with a single-role editor, and it has
already paid twice for the gap.** Choosing "one role" would not be simplification — it would mean
deleting a capability the schema, the resolver, and two safety mechanisms were built around, and
migrating away any user who currently holds two roles.

---

## Option A — one role per organization

### Operator experience
The Role field on a user is a single dropdown. Changing it is unambiguous: pick the new role, save.
No warnings, no acknowledgement checkbox, nothing to explain. This is genuinely the simpler screen.

To express "front-desk *and* regional lead", an operator asks for a new role that combines both.
Over time the role catalog grows one role per combination actually needed.

### Effective access
Unchanged in mechanism — the union of one role is that role. Simpler to explain: *"they can do
what their role allows."*

### Scope
No change. Scope is stored per `(user_id, org_id)` — see below — so it was never per-role anyway.

### Audit / explainability
**Best of the two.** "Why can this person do X?" has exactly one answer, always. The Overview card's
*"because of {role}"* attribution never has to name two sources.

### Migration / backward compatibility
**This is where the option gets expensive.** It is a *removal*, and removals of authority need
evidence:
- Every existing `(user, org)` with more than one role must be found and resolved — each one is an
  operator conversation, because collapsing two roles into one either grants capability the person
  did not have or removes capability they did.
- The composite primary key would be reverted or constrained, undoing a deliberate migration.
- W-54's refusal and M2-17's acknowledgement become dead code and should be removed, or they will
  keep warning about a state that can no longer exist.
- **Nobody currently knows how many multi-role memberships exist in production.** That census is a
  precondition for choosing this option, not a follow-up.

---

## Option B — multiple composable roles *(recommended)*

### Operator experience
The user's Role & Access tab lists the roles held, with **Add role** and a remove control on each.
Assignment becomes additive: adding a second role never silently removes the first, so the
acknowledgement checkbox and the "saving removes 2 other roles" warning both disappear — not
because the risk was hidden, but because the operation that created it is gone.

An operator composes "Front desk + Regional lead" from the roles that already exist, instead of
asking for a fourteenth combined role.

### Effective access
**Union, never intersection.** This is non-negotiable in the design: intersection would make adding
a role *reduce* access, and role assignment would stop being compositional. The Overview card
already attributes each capability area to *every* contributing role — that code was written for
this case and is currently only exercisable by seed data.

### Scope
**Unchanged, and this is important.** Scope is stored per person:
`user_access_profiles` upserts on `(user_id, org_id)`, and `user_department_access` /
`user_site_access` are keyed the same way. Roles do not carry scope, so N roles do **not** produce
N scopes. "What they may do" composes; "where they may do it" stays a single answer per person.

This is why the role editor states the separation and links to the user rather than owning a scope
control — the constraint the tranche just shipped is exactly the one that makes multi-role safe.

### Audit / explainability
**The real cost of this option, and it is manageable.** "Why can this person do X?" may have more
than one answer, and the product must give all of them rather than the first. Two things follow:
- Attribution must name **every** contributing role (already implemented).
- Revocation becomes non-obvious: removing one role may not remove a capability, because another
  role still grants it. The surface must be able to say *"still granted, because of {other role}"*
  or an operator will remove a role and reasonably believe access is gone. **This is the one piece
  of genuinely new product thinking this option requires.**

### Migration / backward compatibility
**Additive and cheap.** No schema change — the composite key is already in place. No data
migration; existing single-role memberships are simply memberships with one row. No behaviour
change for any user who holds one role, which is the overwhelming majority.

---

## Recommendation, stated plainly

**Option B.** Three reasons, in order of weight:

1. **The alternative is a removal, and it is the more expensive one.** Option A requires a
   production census, per-user operator decisions, a schema reversion, and the deletion of two
   safety mechanisms. Option B requires no migration at all.
2. **The gap between "the platform does this" and "the product admits it" is itself the defect.**
   Two guards exist solely to protect users from an editor that cannot represent the model
   underneath it. Closing the gap deletes the need for both.
3. **Scope stays singular**, so the usual objection to multi-role — combinatorial explosion of
   "which role applies where" — does not arise in Alloy's model.

**What I would ask the operator to accept along with it:** revocation must explain itself. If
removing a role leaves a capability standing because another role grants it, the product says so at
the moment of removal. Without that, Option B ships a screen that can mislead an administrator about
whether they have actually taken access away.

---

## Exact workstreams unlocked

| Workstream | Today | Under Option B | Under Option A |
|---|---|---|---|
| **W-17 — multi-role write path** (`I-10`, closes C7) | Blocked on this decision | **Unblocked; becomes the primary work.** Add/remove individual `(principal, org, role)` rows; union semantics; Tier B fixture + Tier C persist/remove coverage | Cancelled |
| **W-13 — portal admission as a capability** (`I-16`, closes C6) | Ships behaviour-preserving without D2; needs D2 for the rest | Unblocked — decides whether `regional_lead` / `school_director` also receive `portal.access` | Same question, answered per combined role |
| **W-54 / `I-34`ᴬ refusal** | Live guard | Retired once writes are additive — there is no destructive replacement left to refuse | Retained permanently |
| **M2-17 acknowledgement (client)** | Live guard | Retired with W-17 | Retained permanently |
| **New: revocation explainability** | Does not exist | **Required by this recommendation** — "still granted, because of {other role}" | Not needed |
| **New: multi-role production census** | Does not exist | Not required | **Required before Option A can be chosen** |
| **W-18 — delegation ceiling** (`I-11`, needs D3) | Independent | Unaffected — subset rule is computed over the caller's effective capability set, which is already a union | Unaffected |

`F5` in the plan's fixture matrix (`ops` + `regional_lead`, union semantics, dept `restricted`)
already describes the Option B test case. It is written and currently unreachable through the
product.

---

## What this document deliberately does not do

It does not implement D2 or I-10, does not change the write path, and does not alter the role
editor. The tranche just certified keeps M2-17's acknowledgement in front of the replacement write
precisely so that this decision stays open and safe to make either way.
