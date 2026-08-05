# 06 — Product IA & principal flows

> **Required output #6.** The Access & Identity workspace: its information architecture, the
> operator flows that run through it, and the migration from today's single screen.
> Specification, not visual design — no mockups, no component decisions.

**Mission** `msn_2d054741a54698fa4c` v1 · phase *Product IA and principal flows* · assignment `asg_56508f92881d3d`
**contentHash** `2c0b0b8fee88469de91e37587a3bb242`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30

---

## 1. Current surface

One screen: `/settings/users-roles` (`web/app/adminV2/settings/users-roles/page.tsx`), two tabs
(Users, Roles), gated on `canManageUsersRoles`. `/settings/user-access` is a legacy redirect to it
(`web/app/adminV2/settings/user-access/page.tsx:7`) — an overlap already resolved, and the only one
found in the settings tree.

What the Users tab can show is bounded by what `GET /api/admin/users` returns:
`user_id`, `email`, `role_keys`, `role`, `created_at` (`web/app/api/admin/users/route.ts:7-18`).
**Of the nine columns the brief asks for — person, type, status, roles, access scope, last login,
MFA, invitation state — four are unavailable and one (person) does not exist as a concept.**
The IA below is therefore blocked on the data model in [`04`](./04-authentication-model.md) §3.1–3.2,
not on design.

## 2. Target IA

```
Access & Identity                    (/settings/access-identity)
├── Overview                         operational state, not a dashboard
├── Users                            credentials, each bound to a person
├── Roles                            reusable access packages
├── Access Policies                  reusable scope rules
├── Authentication                   org auth policy
├── Invitations                      in-flight access grants
└── Audit Log                        who changed access, when, why
```

Seven sections, per the brief. Three notes on why this shape and not another:

- **Users and Roles are separate sections, not tabs.** Today they are tabs because they are one
  screen's worth of data. With scope, lifecycle, and effective-access preview, each is a workspace.
- **Access Policies is the section that makes granularity survivable.** Without reusable scope
  rules, every user edit is hand-authored scope, which is the per-user-grant failure mode `rp1`
  exists to prevent. It is the scope analogue of role templates.
- **Audit Log is a section, not a per-role tab.** The brief asks *"Who changed access, when, and
  why"* across the org. A per-role history is a filtered view of it, not a separate store.

### 2.1 Section contracts

| Section | Answers | Depends on |
|---|---|---|
| **Overview** | Is access healthy right now? | lifecycle states, invitation states, auth policy |
| **Users** | Who can log in, as whom, with what? | person↔user link, lifecycle, scope, effective access |
| **Roles** | What does each access package grant? | permission catalog, templates, inheritance |
| **Access Policies** | What reusable scope rules exist? | scope model |
| **Authentication** | How may people prove identity here? | `auth_policy` ([`04`](./04-authentication-model.md) §3.3) |
| **Invitations** | What access is in flight? | invitation lifecycle |
| **Audit Log** | What changed, by whom, and from what? | append-only audit store |

**Overview must be operational, not decorative.** Active users, pending invitations, expiring
invitations, locked accounts, users with no role, users with org-wide scope, and authentication
health. Every tile is a filter into another section — a tile that is not a link is a metric nobody
acts on.

## 3. Principal flows

The brief names six creation paths. They are one flow with a branch on *which person* and *what
access*, which is the point: separate flows would re-create the separate-identity-models mistake.

### 3.1 Grant access (the one creation flow)

```
1. Who is this?
   ├── existing person  → search, select                    (staff, parent, guardian, contact)
   └── new person       → create person, then continue      (staff hire)
2. What access?
   ├── roles            → one or several
   └── scope            → org / regions / locations / departments / relationship-based
3. How do they get in?
   ├── invite by email
   ├── invite by mobile
   └── create now, send access later                        (draft)
4. Preview effective access                                 ← required, not optional
5. Activate
```

**Step 4 is the load-bearing step.** The brief requires *"Preview effective access before
activation"* and *"Effective access can be explained: 'Kelly can manage Enrollment for Bend and
Redmond because of Center Director.'"* The preview must render the *resolved* set — roles plus
inheritance plus scope plus policies — with provenance per line, and it must be produced by the
same resolver that enforces at runtime. A preview computed by a second code path is a mock, and
the brief rejects *"A mock looks correct but the effective-access matrix disagrees."*

There is no separate "add parent access" flow. A guardian is an existing person, given a portal
role, scoped by relationship. Same five steps.

### 3.2 Change access

Open user → change roles or scope → **preview the diff, not just the result** (what they gain, what
they lose) → save → audit row. Losing access is the dangerous half and today it is invisible: `PUT
/grants` is a destructive full replace (`cap_access_roles-v2-proposal.md:31`).

### 3.3 Lifecycle transitions

Suspend, lock, unlock, deactivate, reactivate, resend invitation, revoke invitation. Each is an
explicit operator action with a reason, one audit row, and — critically — **immediate effect on
live sessions** ([`04`](./04-authentication-model.md) §3.2). An operator who suspends someone
expects them out now, not at token expiry.

### 3.4 Explain access

Given a user and a capability: can they do it, and why. Renders the resolution chain — authentication
state, person relationship, roles, grants, restrictions, scope — as the sentence the brief asks for.
This is the operator-language requirement, and it is also the debugging tool for everything else in
V2.

### 3.5 Author a role

Role catalog → new role, optionally from a template → edit by **meaningful access groups**, not a
permission-key wall → preview what a user with this role could do → save.

The brief's rejection condition is explicit: *"No raw permission-key wall as the default role
editor."* Presets and groups are the default surface; the granular key list is progressive
disclosure, and "Custom" must be a first-class state rather than a snap-to-nearest-preset
(`cap_access_roles-v2-proposal.md:59`).

## 4. States that must be visible

The brief requires empty, inherited, restricted, conflicting, and expired states be *"visually
clear."* Each needs a defined meaning before it can be designed:

| State | Meaning | Where |
|---|---|---|
| **Empty** | No roles, or no scope → no effective access | Users list, user detail, Overview |
| **Inherited** | Granted via a parent role, not editable here | Role editor, effective-access preview |
| **Restricted** | Scope narrower than the role's default | User detail, preview |
| **Conflicting** | Two sources disagree | Preview; needs a resolution rule (§5, D9) |
| **Expired** | Time-boxed access lapsed; invitation expired | Users, Invitations, Overview |

**Empty is the most common and least designed.** Today a user invited via `POST /api/admin/users`
gets a role row and no access profile (G4) — an empty-scope user that the current UI renders
identically to a fully-scoped one.

## 5. Decisions required

**D9 — What is a conflict, and how does it resolve?**
V2 is additive-only (union of role + inheritance + grants), so strictly there are no permission
conflicts — but there are *scope* conflicts (a role defaulting to org-wide, a user restricted to one
location). *Recommendation:* scope intersects (most restrictive wins) while permissions union. State
this explicitly; it is the rule operators will most often need explained, and the alternative
(scope unions) silently widens access.

**D10 — Where does Access & Identity live in navigation?**
Today `/settings/users-roles`. Target `/settings/access-identity` with a redirect, matching the
`user-access` precedent. *Recommendation:* yes — the rename is the cheapest signal that this is one
workspace and not two tabs.

**D11 — Is time-boxed access in the first wave?**
The brief lists *"Temporary access with an expiration date"*. It requires expiry evaluation in the
resolver and a sweep for the Expired state. *Recommendation:* specify now, build after the resolver
lands; it is a scope attribute, not a new concept.

## 6. Limits

- **Specification, not design.** No layouts, components, or visual treatments. "Dense list" and
  "intentional configuration panel" are the brief's words, restated as requirements.
- **No browser QA.** The current-surface description is from source; the running UI was not opened.
  The claim that four requested columns are unavailable is derived from the API's return type
  (`route.ts:7-18`), not from observing the screen.
- **Blocked on the data model.** Sections 2 and 3 cannot be built before
  [`04`](./04-authentication-model.md) §3.1–3.2 (person↔user link, lifecycle) and the effective-access
  resolver of `02-canonical-access-identity-model.md` §10. This document specifies the destination,
  not a buildable slice.
- **Access Policies is the least-specified section.** It is named in the brief with two examples and
  no model; §2.1 treats it as reusable scope rules, which is an interpretation.

## 7. Provenance

- **Verified in** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`:
  `web/app/adminV2/settings/` (section list), `web/app/adminV2/settings/user-access/page.tsx`,
  `web/app/api/admin/users/route.ts`.
- **Inputs:** brief `msn_2d054741a54698fa4c` (IA, lifecycle, creation paths, visible states);
  `cap_access_roles-v2-proposal.md` (§2.1 presets/Custom, §3.3 destructive grant save);
  `02-canonical-access-identity-model.md` (§9 scope, §10 resolution).
- **No source, schema, migration, or UI changed by this phase.**
