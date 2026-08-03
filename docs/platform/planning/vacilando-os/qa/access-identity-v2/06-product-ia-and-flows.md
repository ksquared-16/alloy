# 06 — Product IA & principal flows

> **Mission 2 refresh.** The accepted corpus is reused as input, not re-derived. The accepted artifact
> (mission `msn_2d054741a54698fa4c`, 2026-07-30) is preserved **verbatim** in §12 and remains
> authoritative for its own date; §§0–11 are this pass and supersede it where they disagree.
>
> Inputs, not re-derived: [`01-existing-state-inventory.md`](../../../access-identity-v2/01-existing-state-inventory.md)
> (Mission 2 refresh — G4, C6, C7, C11, §5 enforced-vs-configured),
> [`02-canonical-access-identity-model.md`](../../../access-identity-v2/02-canonical-access-identity-model.md)
> (Mission 2 refresh — E1's five rules, §15 resolution stages, §15.3 composition, M2-10, M2-11, M2-12,
> D9, D10), [`04-authentication-model.md`](./04-authentication-model.md) (§5 lifecycle state machine and
> its credential effects, §6.1 method catalog, §6.2 show/hide baseline), and
> [`05-command-enforcement-census.md`](./05-command-enforcement-census.md) (capability catalog, surface
> catalog, the one surface gate).
>
> **This document specifies information architecture and operator flows. It is not visual design** — no
> layouts, components, or visual treatments are decided here.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Product IA and principal flows* · assignment `asg_606a6b2c86d967`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `7df17b9b3`
**Date** 2026-08-03
**Method** static, file-grounded. Every current-state claim was opened and read in this pass and cites
`path:line` at `7df17b9b3`. Claims reused without re-derivation are marked **[carried]**; claims read in
this pass are marked **[verified]**. **No browser QA was performed** (§10).

---

## 0. Headline — the workspace got built, and it now states four things the model cannot support

The accepted artifact specified a seven-section **Access & Identity** workspace against a product that
had *"one screen, two tabs"* (§12 §1). That is no longer the current state. Between acceptance and this
pass, the Access workspace was built: a domain landing, four chapters, a member collection rail, a
five-tab per-user workspace, a five-tab per-role workspace, and an invite sequence rail
(`AccessWorkspaceSurface.tsx:80-121`, `AccessUsersConfigurationPage.tsx:325-331`,
`AccessRolesConfigurationPage.tsx:1-7`) **[verified]**.

**So the gap this deliverable addresses has changed shape.** It is no longer *"there is no IA."* It is:

> **The built IA is broadly right, and it makes four assertions the data model underneath it cannot
> support.** Every operator looking at Access → Users today is told, in plain product language, that
> every member is **Active**, signs in with **Password**, and has **All locations · All departments** —
> three statements the system never computed, and one of which is the fail-open default of a row that
> was never created.

That is a different and more urgent finding than the accepted artifact's, because a missing screen is a
known absence while a confident wrong screen is not. It is also *narrower*: the surface is largely
built, and the remaining work is to make it read what it currently asserts.

Four measured facts, each reproducible in §9:

| Measure | Value | Where |
|---|---|---|
| Access workspace chapters built, of the seven sections specified | **4** (users, roles, scopes, security) | `accessChapterRoutes.ts:10` |
| Places the Users chapter renders `Active` as a **literal**, not from data | **4** | `AccessUsersConfigurationPage.tsx:405,439,526,629` |
| Lifecycle fields the members route **already fetches and discards** | **≥5** (`invited_at`, `confirmed_at`, `last_sign_in_at`, `banned_until`, `factors`) | `members/route.ts:109-118` |
| Operator lifecycle actions available on a user | **1** — *Remove from organization* | `AccessUsersConfigurationPage.tsx:466-472` |

The third row is the one that changes the plan. The accepted artifact concluded that the brief's
requested columns *"are unavailable"* and that the IA was therefore *"blocked on the data model"*
(§12 §1). **For invitation state, last sign-in, and lock state, that is no longer true.** The route
already calls `supabase.auth.admin.getUserById` and reads two fields off the result
(`members/route.ts:109-118`) **[verified]**; the installed SDK's `User` type carries `invited_at`,
`confirmed_at`, `email_confirmed_at`, `last_sign_in_at`, `banned_until`, and `factors`
(`@supabase/auth-js/dist/module/lib/types.d.ts:348,353-356,362,364`) **[verified]**. Those columns are a
destructuring away. The genuinely blocked ones are *person*, *multi-role*, *scope-as-policy*, and
*effective access* — four, not five, and each blocked for a different reason (§4.2).

---

## 1. Re-anchor — the accepted artifact against `7df17b9b3`

| §12 claim | Status | This pass |
|---|---|---|
| *"One screen: `/settings/users-roles`, two tabs (Users, Roles)"* | **superseded** | A four-chapter workspace with a domain landing and two per-entity workspaces (§2) **[verified]** |
| *"`/settings/user-access` is a legacy redirect… the only overlap found"* | **partly superseded** | Still a redirect (`user-access/page.tsx:7`), but a **second** live rendering route now exists (§4.8) **[verified]** |
| *"Four of the nine requested columns are unavailable"* | **superseded** | Three of them are already fetched and discarded (§0, §4.2) **[verified]** |
| *"person does not exist as a concept"* | **carried, sharpened** | The directory names people from `user_metadata.full_name`, never from `persons` (`members/route.ts:112-117`); the invite modal says person-linking is *"planned"* (`:710-713`) **[verified]** |
| *"Users and Roles are separate sections, not tabs"* | **adopted in product** | Built as sibling chapters, each with its own collection rail and selected workspace **[verified]** |
| *"Overview must be operational, not decorative"* | **open, and now concrete** | The landing exists with `summaryCards: []` (`accessLandingModel.ts:11`) — a chooser, not an overview (§4.9) **[verified]** |
| *"Audit Log is a section, not a per-role tab"* | **superseded by a better shape** | Built as one Security card plus per-user and per-role History tabs — three views, all Planned (§3.3) **[verified]** |
| **D9** *what is a conflict, how does it resolve* | **answered by the corpus** | `02…§15.3` settles it normatively: five conjuncts, intersection, no precedence, scope never widened by admission. Closed as an IA decision (§8) **[carried]** |
| **D10** *where does Access live in navigation* | **closed by implementation, differently and better** | Not `/settings/access-identity`; the product made Access an **Organization domain** at `/organization/access`, with `users-roles` aliased to it (`canonicalAdminRoutes.ts:100-101`) **[verified]** |
| **D11** *is time-boxed access in the first wave* | **open, untouched** | Nothing in the built surface expresses expiry (§6) **[verified]** |

---

## 2. The Access workspace as built

### 2.1 Routes

| Route | Behaviour at `7df17b9b3` | Evidence |
|---|---|---|
| `/organization/access` | **Canonical.** Renders the landing with no `?section`, the workspace with one | `organization/access/page.tsx:15,26-41` |
| `/settings/users-roles` | **Renders the identical workspace** — byte-equivalent page body, not a redirect | `settings/users-roles/page.tsx:15-41` |
| `/settings/user-access` | Legacy redirect → `/settings/users-roles` | `settings/user-access/page.tsx:7` |
| link generation | `adminSettingsSubpathHref("users-roles")` resolves to `/organization/access` | `canonicalAdminRoutes.ts:100-101,430-435` |

Both rendering routes gate identically: `getAdminAccessContextCached()`, redirect to `/unauthorized` if
`!access.ok`, then pass `canManageUsersAndRoles(access)` down as `canManage`
(`users-roles/page.tsx:16-19,37`) **[verified]**.

### 2.2 Chapters

`ACCESS_WORKSPACE_CHAPTERS = ["users", "roles", "scopes", "security"]` (`accessChapterRoutes.ts:10`),
each with an operator-language label and description (`:12-30`), selected by `?section=`, tabbed at
`AccessWorkspaceSurface.tsx:88-89` **[verified]**.

| Chapter | What it is today | Built / Planned |
|---|---|---|
| **Users** | Member rail + 5-tab selected workspace (Overview, Roles, Access, Security, History) | Built, except Effective Access and History |
| **Roles** | Role catalog rail + 5-tab workspace (Overview, Permissions, Users, Experience Access, History) | Built, except Experience Access and History |
| **Access Scopes** | A **launch point** to Locations and Departments — *"not a duplicate editor"* (`AccessScopesPage.tsx:3-5,44-46`) | Built as a reference |
| **Security** | Four cards: Authentication, Sign-in Policies, Sessions, Audit Log | **One row available**, everything else Planned (`AccessSecurityPage.tsx:21-69`) |

### 2.3 The one thing the workspace gate does that the rest of the product does not

`AccessWorkspaceSurface.tsx:94-102` refuses to render **any** chapter when `canManage` is false, and
says why in operator language, naming both the role and the permission. That is the only place in the
132-page admin tree where a capability decides what a surface shows (`05…§3.3`) **[carried]** — the
accepted census recorded the users-roles page as passing capability as a *display prop*; it is now a
render gate. **This is the pattern §7's IA-R7 generalizes.** It does not replace server-side
enforcement, which correctly lives on the mutation routes (`canManageUsersAndRoles.ts:25-40`)
**[carried]**.

---

## 3. Seven specified sections against four built chapters

The accepted artifact specified Overview · Users · Roles · Access Policies · Authentication ·
Invitations · Audit Log. **This pass does not restate that list. It reconciles it**, because three of
the seven resolve better inside the built shape than beside it.

| Specified section | Resolution | Why |
|---|---|---|
| **Overview** | **Keep as the landing** — but it must earn its content (§4.9) | The landing exists and is the right place; `summaryCards: []` is the gap |
| **Users** | Built | — |
| **Roles** | Built | — |
| **Access Policies** | **This is the Access Scopes chapter, and it is the one section still genuinely unmodelled** (§3.1) | Built as a launch point to two catalogs; reusable scope *rules* do not exist in any layer |
| **Authentication** | **Folded into Security — correct** | Org auth policy, sessions, and audit are one operator concern: *how are accounts protected* |
| **Invitations** | **Not a section. A lifecycle state filter on Users** (§3.2) | — |
| **Audit Log** | **Not a section. One store, three views** (§3.3) | — |

### 3.1 Access Policies is the Access Scopes chapter, and it is empty of policy

The built chapter is honest about what it is: *"Locations and departments are used to assign where a
person may operate. They are owned by their own product surfaces — this is an assignment-context
reference, not a duplicate editor"* (`AccessScopesPage.tsx:44-46`) **[verified]**. That is a correct
ownership statement and the right anti-duplication instinct.

It is also not what the brief asked for. The brief's *Access Policies* is a **reusable scope rule** —
authored once, attached to many memberships. What exists is per-user hand-authored scope: the Access tab
writes `department_ids` / `site_location_ids` straight onto one membership
(`AccessUsersConfigurationPage.tsx:251-259`) **[verified]**. That is the per-user-grant failure mode the
accepted artifact named, now confirmed as the only mechanism the product has.

**The chapter is the right home for the concept and currently contains none of it.** This remains the
least-specified area of the corpus — `02…` models scope dimensions (`§5`) but not scope *policies* —
and it is recorded as **D-IA3** (§8) rather than invented here.

### 3.2 Invitations is a state, not a place

An invited user already appears in the member directory the moment `POST /api/admin/users` returns
(`AccessUsersConfigurationPage.tsx:211-213` selects the new member immediately) **[verified]**. Giving
invitations their own section would put the same human in two places and re-create, at the IA layer, the
split-identity mistake `02…§3` exists to prevent.

With the lifecycle states of `04…§5` present, *"what access is in flight"* is
`state ∈ {draft, invitation_pending, invitation_expired}` — a saved filter on Users, reachable from an
Overview tile. **The section becomes unnecessary exactly when the state becomes real.**

### 3.3 Audit is one store with three views

The product has already chosen this shape, and chosen it correctly: an org-wide **Audit Log** card under
Security (`AccessSecurityPage.tsx:64-69`), a per-user **History** tab
(`AccessUsersConfigurationPage.tsx:656-661`), and a per-role **History** tab
(`AccessRolesConfigurationPage.tsx:540-542`) **[verified]**. All three are Planned. All three must read
one append-only store; the two History tabs are filters on it.

The accepted artifact's *"Audit Log is a section, not a per-role tab"* was arguing against a *separate
store* per entity. On that it stands. On placement, the built shape is better and is adopted here.

---

## 4. Findings this pass

Numbered `IA-n` so they do not collide with the accepted `C`/`G`/`M2` registers.

### 4.1 IA-1 — account status is asserted, not read

`Active` is a string literal in four places in the Users chapter: the rail row status
(`AccessUsersConfigurationPage.tsx:405`), the selected-user header badge (`:439`), the Overview *Status*
value (`:526`), and the Security *Account* value (`:629`) **[verified]**. No status is fetched: the
member row type has no status field at all (`:29-39`), and the members route never selects one
(`members/route.ts:129-139`) **[verified]**.

**A user who was invited an hour ago and has never signed in renders as `Active`, in four places, in the
product's own voice.** So does a user whose credential is banned in the auth provider, because
`banned_until` is fetched and dropped (§4.2).

The comparison that makes this a defect rather than a shortcut is internal: **the Roles chapter reads its
status from data** — `{selected.is_active === false ? "Inactive" : "Active"}`
(`AccessRolesConfigurationPage.tsx:368`, rail at `:336`) **[verified]**. Same workspace, same authors,
same sprint. Roles read; Users assert.

The same pattern covers authentication method: *"Password sign-in"* in the header (`:444`) and
*"Authentication — Password"* on the Security tab (`:633`) are literals **[verified]**, correct today
only because password is the single implemented method (`04…§6.1`) **[carried]** — and silently wrong on
the day a second one ships.

### 4.2 IA-2 — the lifecycle data is already fetched, then discarded

`members/route.ts:109-118` calls `supabase.auth.admin.getUserById(user_id)` and keeps `email` and
`user_metadata.full_name`. The `User` object it discards carries `invited_at`, `confirmed_at`,
`email_confirmed_at`, `last_sign_in_at`, `banned_until`, and `factors`
(`@supabase/auth-js/dist/module/lib/types.d.ts:348,353-356,362,364`) **[verified]**.

Against the nine columns the brief asks for:

| Column | Availability at `7df17b9b3` | Blocked by |
|---|---|---|
| Person | **Absent** | E1 does not exist (`02…§3.1`) **[carried]** |
| Type (operator / portal / service) | **Derivable** — `PORTAL_ROLES` membership (`resolveAdminAccessCore.ts:18`) **[carried]** | Nothing; not projected |
| Status | **Partly available now** — `banned_until`, `confirmed_at` distinguish 3 of 7 states | The other 4 need the `04…§5` state column |
| Roles (plural) | **Available** — `role_keys[]` is returned and then reduced to `primary_role` (`members/route.ts:133-134`) | UI states *"One role is supported per user today"* (`AccessUsersConfigurationPage.tsx:556-557`); schema supports multi (C7) **[carried]** |
| Access scope | **Present but ambiguous** (§4.3) | G4 **[carried]** |
| Last login | **Available now** — `last_sign_in_at`, discarded | Nothing |
| MFA | **Available now** — `factors`, discarded | Nothing to enrol with (`04…§6.1`) **[carried]** |
| Invitation state | **Available now** — `invited_at` vs `confirmed_at`, discarded | Nothing |
| Effective access | **Absent** | §4.4 |

**Three columns are a destructuring away; three more need one decision each; three are genuinely
blocked.** This supersedes §12 §1's blanket *"blocked on the data model"* and is the reason §7 can state
buildable requirements rather than a destination.

> **This finding must not be read as "just ship the columns."** Rendering `last_sign_in_at` is trivial;
> rendering *Status* requires deciding what a status means, which is `04…`'s D5/D6 and `02…`'s D10. The
> point is that the **evidence** exists — so the remaining work is decision work, not plumbing.

### 4.3 IA-3 — "All locations · All departments" cannot be distinguished from "no row was ever created"

The members route defaults a missing access profile to unrestricted on both dimensions —
`prof?.department_scope ?? "all"` (`members/route.ts:124-125`) **[verified]** — and the UI renders that
as the confident summary *"All locations · All departments"* on every rail row and in the selected header
(`AccessUsersConfigurationPage.tsx:52-72,400-401,443`) **[verified]**.

G4 says every membership the product creates has **no** profile row: `POST /api/admin/users` inserts into
`user_roles` only (`users/route.ts:102-106`) **[carried, re-verified this pass]**. So **every user the
product has ever invited displays as deliberately org-wide.** The invite modal states this as intended
behaviour — *"Location and department access are set after invitation from the Access tab"*
(`AccessUsersConfigurationPage.tsx:746-747`) **[verified]** — which makes the fail-open a documented step.

This is also a **fourth independent projection of scope**, joining the three `02…` records: the enforcing
resolver (`resolveAdminAccessCore.ts:145-161`, M2-12), the operator preview
(`:209`, C11 / M2-11), and now the directory list. Three of the four resolve absence to `all`; the model
requires absence to deny (I-19, I-30) **[carried]**.

**The operator-visible consequence is the accepted artifact's "Empty" state, verified as unrepresentable:
there is no rendering that distinguishes *scoped to everything* from *never scoped*.**

### 4.4 IA-4 — effective access is a placeholder, and the one preview that exists disagrees with runtime

The Overview *Effective Access* card renders *"Computed effective access will appear here when
available"* (`AccessUsersConfigurationPage.tsx:531-541`), and the role-side twin, *Experience Access*,
renders *"Derived from permission grants. Planned projection"*
(`AccessRolesConfigurationPage.tsx:536`) **[verified]**.

Meanwhile a preview resolver **does** exist and is wired to the access-scope route
(`resolveAdminAccessCore.ts:209`; `users/[userId]/access-scope/route.ts:48,180`) **[carried]** — and
`02…§18 M2-11` shows it normalizes role keys differently from the enforcing path, so it can display
capabilities the runtime denies **[carried]**.

**Both halves of the brief's rejection condition are therefore live at once:** the operator-facing
effective-access surface is a stub, and the non-stub preview underneath is a second code path that can
disagree with enforcement. The brief's *"A mock looks correct but the effective-access matrix
disagrees"* is not a hypothetical here; it is the current architecture with the display switched off.

The requirement is unchanged from the accepted artifact and now has an enforcement anchor: the preview
**must** be the resolver of `02…§15.1`, in the same normalized form (I-28), rendering the same five
conjuncts of `§15.3` with provenance per line. A second implementation is the defect, not the fallback.

### 4.5 IA-5 — the invite modal is the specified flow, with the load-bearing steps marked Planned

The modal renders a five-step sequence rail: **Person · Role · Access · Sign-in · Review**
(`AccessUsersConfigurationPage.tsx:687-707`) **[verified]**. That is, near-exactly, the accepted
artifact's §3.1 five-step *Grant access* flow — the specification was adopted as the product's own
narrative.

Two of the five carry `state: "planned"` or a planned banner:

| Step | Rendered state | Reality |
|---|---|---|
| **Person** | `available` | *"Linking an existing Person record is planned. Today, invite by email creates sign-in access for that address"* (`:710-713`) |
| **Role** | `available` | Real — one role from `activeRoles` (`:725-740`) |
| **Access** | **`planned`** (`:690`) | Deferred to after invitation (`:746-747`) — this is G4 (§4.3) |
| **Sign-in** | `available` | Fixed text *"Email invitation"* (`:749-751`); no choice offered |
| **Review** | `available` | No review pane exists in the modal body |

**The Person step is labelled available and is not.** Inviting by email address, with no `person_id`, is
precisely the join `02…§3.2` rule 3 forbids and `04…§4` calls *"the prohibited join wearing a friendly
name"* **[carried]**. The step rail tells the operator a person was identified; the request carries an
email string (`:202-206`) **[verified]**.

**And the specified step 4 is missing entirely.** The accepted artifact's *"Preview effective access —
required, not optional"* has no step in the rail. *Review* is not its substitute: nothing is computed to
review.

### 4.6 IA-6 — one lifecycle action exists, it is a delete, and it reports success inside a window where it has not taken effect

The *More* menu on a selected user contains exactly one action: **Remove from organization**
(`AccessUsersConfigurationPage.tsx:466-472`), with a confirm step and the copy *"They will lose access to
this organization"* (`:475-478`) **[verified]**. There is no suspend, lock, unlock, deactivate,
reactivate, resend, or revoke anywhere in the access API or component surface — a search for those verbs
returns only *role* deactivation (`rbac/roles/[role_key]/route.ts:46`) **[verified, §9]**.

Three carried findings compose on this one button:

1. **It deletes the membership row** (`users/[userId]/remove/route.ts:26-30`), so the relationship's
   history is destroyed along with its access — `04…§5.3` **[carried]**.
2. **It does not revoke anything else.** No session invalidation, no credential call; nothing in the
   product performs one — `04…§2.1` **[carried]**.
3. **The operator is told it worked while it has not.** The route returns `{ ok: true }`, and the removed
   principal's next request is served from a per-process authority cache that no authority write
   invalidates — up to **120 seconds**, in each warm process — `02…§18 M2-10` **[carried]**.

**"They will lose access to this organization" is the product making a promise the runtime does not keep,
in the one flow where the operator is most likely to be acting on an incident.** The IA consequence is
stated as a requirement in §7 (IA-R5): a lifecycle transition must not report success until revocation is
effective, and the copy must not promise more than the transition performs.

A fourth, smaller instance of the same seam is visible one function away: after a role save the client
calls `router.refresh()` with the comment *"Re-run settings layout server props so `AdminAuthProvider`
roleKeys match fresh `user_roles`"* (`AccessUsersConfigurationPage.tsx:236-237`) **[verified]** — a
client-side workaround for stale resolved authority, in the same file whose Remove button has no
equivalent.

### 4.7 IA-7 — the product states a one-role model the schema does not have

*"This user receives the permissions of their assigned role. One role is supported per user today"*
(`AccessUsersConfigurationPage.tsx:555-557`), rendered as a single `<select>` (`:561-572`) **[verified]**.
The API returns `role_keys[]` and reduces it to one for the picker
(`members/route.ts:133-134`; `users/route.ts:10-16`) **[verified]**, and `PATCH /role` replaces all roles
with one (`users/route.ts:13-15`) **[verified]**.

C7 records that schema and resolver support multi-role membership with **no write path** **[carried]**.
So a member holding two roles — reachable through the writers `02…§4.2` shows are unconstrained — is
displayed as holding one, and **saving anything on that user silently drops the other**. The UI sentence
is accurate about the product and inaccurate about the system, which is the C7 gap surfacing as an IA
problem.

### 4.8 IA-8 — one workspace, two live rendering routes

`/organization/access` and `/settings/users-roles` render the same component tree from effectively
identical page bodies (`organization/access/page.tsx:16-42` vs `settings/users-roles/page.tsx:15-41`)
**[verified]**. The second is not a redirect, unlike the `user-access` precedent that resolved the
previous overlap (`user-access/page.tsx:7`) **[verified]**.

This is contained rather than harmful today — link generation aliases `users-roles` → `access`
(`canonicalAdminRoutes.ts:100-101`), so the product does not generate the duplicate URL. But two
independently editable copies of a gate are two places for the gate to drift, and the corpus's own
comparable case (M2-15, `02…§16`) is a divergence that began exactly this way. **Reduce it to a redirect,
matching the precedent the same tree already set.**

### 4.9 IA-9 — the Overview exists and is a chooser

`buildAccessLandingModel()` returns four tiles and `summaryCards: []`, commented *"No conceptual KPI
cards"* (`accessLandingModel.ts:4,11`) **[verified]**. Its purpose line is well-judged — *"Choose who can
sign in, what they may do, where they may operate, and how accounts are protected"* (`:9`) — and it is a
navigation surface, not an operational one.

The accepted artifact's requirement stands and is now precise about why the tiles are empty: **every
metric it named is a state the system does not yet compute.** Active users, pending invitations, expiring
invitations, locked accounts, users with no role, users with org-wide scope — the first four need §4.2's
lifecycle states, the fifth is computable today, the sixth is unanswerable while §4.3's ambiguity stands.

**The empty `summaryCards` array is therefore the correct current state, and the honest one.** It should
be filled by IA-R1/IA-R2 landing, not before. Each tile must be a filter into a chapter — a count nobody
can act on is the decoration the accepted artifact rejected.

### 4.10 IA-10 — the "Planned" discipline is this surface's best property, and one place breaks it

The workspace marks unbuilt capability explicitly and refuses to fake data: *"A verified access audit log
… is planned. **No events are fabricated for display**"* (`AccessSecurityPage.tsx:64-69`), the same
sentence on the user's History tab (`AccessUsersConfigurationPage.tsx:656-661`) and the role's
(`AccessRolesConfigurationPage.tsx:540-542`), plus **14** `data-capability="planned"` markers across the
three chapter components — Users 6, Roles 2, Security 6 **[verified, §9]**.

**This is a genuinely good pattern** — machine-checkable, honest to the operator, and exactly what the
brief's *"A UI checkbox is added without enforcement evidence"* rejection condition asks for. §7 adopts
it as a requirement (IA-R6) rather than treating it as incidental.

The one place it breaks is §4.1: `Active`, `Password sign-in`, and `All locations · All departments` are
unmarked assertions of state the system did not compute. **The fix is to bring three strings under a
discipline the file already applies everywhere else.**

---

## 5. Principal flows

Normative. `MUST` / `MUST NOT` / `SHOULD` per RFC 2119, matching `02…` and `04…`. Each flow is stated
against the built surface, with the step that does not exist today marked.

### 5.1 Grant access — the one creation flow

The brief names six creation paths (staff hire, existing person, parent, guardian, contact, service).
They are **one** flow branching on *which person* and *what access*. Separate flows re-create the
separate-identity-models mistake `02…§3` exists to prevent. The built rail already has the right shape
(§4.5); this is what each step must actually do.

```
1. Who is this?          → resolve or create a person; the request carries person_id
   ├── existing person   → search the person graph, select
   └── new person        → create deliberately, then continue
2. What access?
   ├── roles             → one or several                       (C7: plural today is display-only)
   └── scope             → policy or explicit dimensions        (D-IA3: policies unmodelled)
3. How do they get in?   → a method from the org's auth_policy  (04…§6.1)
   ├── email invitation  ├── SMS invitation  └── create as draft, send later
4. Preview effective access                                     ← MISSING; required
5. Activate
```

- Step 1 **MUST** carry a `person_id` resolved before the credential exists, and **MUST NOT** derive the
  link from the invited address (`02…§3.2` rule 3) **[carried]**. Until E1 exists, the Person step
  **MUST** be marked Planned rather than `available` (§4.5).
- Step 2 **MUST** write an access profile in the same transaction as the membership. Deferring scope to
  *"after invitation"* is G4, and it is currently product copy (§4.3).
- Step 3 **MUST** offer only methods the org's policy enables and the platform implements; a method row
  that is not implemented **MUST** render as Planned (`04…§6.1`) **[carried]**.
- **Step 4 MUST exist, and MUST be produced by the enforcing resolver** (`02…§15.1`), rendering the five
  conjuncts of `§15.3` with provenance per line — *"Kelly can manage Enrollment for Bend and Redmond
  because of Center Director"*. A second resolver is the defect (§4.4).
- Step 5 **MUST** be a single atomic authority write (I-31) **[carried]**.

There is no separate "add parent access" flow. A guardian is an existing person given a portal role,
scoped by relationship — the same five steps.

### 5.2 Change access

Open user → change roles or scope → **preview the diff, not the result** → save → audit row.

The diff is the load-bearing half and is entirely absent today: the Roles tab's save replaces every role
with one (§4.7), and the Access tab's save replaces the scope arrays wholesale
(`AccessUsersConfigurationPage.tsx:251-259`) **[verified]**. **What the user loses is invisible in the
flow that causes the loss.** The preview **MUST** show gained and lost capability and scope separately,
computed by the same resolver as §5.1 step 4.

### 5.3 Lifecycle transitions

Suspend · lock · unlock · deactivate · reactivate · resend invitation · revoke invitation. **None exists**
(§4.6). Each **MUST** be an explicit operator command carrying a reason, producing one audit row, and
each **MUST** name its credential-level effect and its effect on live sessions per `04…§5.2`
**[carried]**.

Two IA obligations follow, and they are the ones a specification can settle now:

- **A transition MUST NOT report success before it is effective.** Today Remove reports success inside a
  120-second window in which the principal still resolves as authorized (M2-10) **[carried]**. Whatever
  D11-revocation-latency decides (`02…§20`), the *product* rule is that the confirmation follows the
  effect, not the write.
- **Removal MUST become a transition, not a delete** (`04…§5.3`) **[carried]** — so that History, which
  the workspace already has a tab for, can answer *"was this person ever an operator here, and who ended
  it?"*

### 5.4 Explain access

Given a user and a capability: **can they do it, and why** — rendered as the resolution chain
(authentication → membership → admission → capability → scope), one line per conjunct, each naming its
source row.

This is the operator-language requirement and the debugging tool for everything else in V2. It is the
same computation as §5.1 step 4 with a capability argument bound, and it **MUST** share its
implementation. Where a conjunct fails, the flow **MUST** name which one — the difference between *"not
a member"*, *"not admitted"*, *"lacks the capability"*, and *"out of scope"* is the entire content of the
answer, and `02…§15.3` defines all four.

### 5.5 Author a role

Role catalog → New Role, optionally from a template → edit by **meaningful access groups** → **preview
what a holder could do** → save.

Mostly built: the catalog rail, create (`AccessRolesConfigurationPage.tsx:184,270`), rename/activate
(`:209`), and a nine-row grid keyed by operator language with raw `permission_key` strings deliberately
absent from primary UI text (`:6,462`) **[verified]**. The brief's *"no raw permission-key wall"*
rejection condition is **not** triggered.

Three gaps remain, and one of them is not a UI gap:

- **The preview step is Planned** — *Experience Access* renders *"Derived from permission grants. Planned
  projection"* (`:536`) **[verified]**. Same requirement as §5.1 step 4.
- **Templates and an explicit "Custom" state do not exist.** The grid derives a level per row from the
  granted keys (`levelFromGrantedKeys`, `:157`) **[verified]**; a grant set that does not correspond to a
  level has no first-class representation.
- **Nine of the grid's rows govern eleven keys that no code reads** (`05…§2.1`) **[carried]**. **An
  operator authoring a role today is choosing settings that, for four of nine rows, change nothing at
  runtime.** No IA change fixes this: the role editor is well-built and the vocabulary underneath it is
  substantially inert. It is recorded here because *authoring a role* is the flow in which the operator
  is most confidently misled, and because §7's IA-R8 is the only requirement in this document that a
  surface change cannot satisfy.

---

## 6. States that must be visible

The brief requires empty, inherited, restricted, conflicting, and expired states be *"visually clear."*
Each is given a meaning, a home, and — new this pass — whether it is representable at all today.

| State | Meaning | Home | Representable at `7df17b9b3`? |
|---|---|---|---|
| **Empty** | No roles, or no scope ⇒ no effective access | Users list, user Overview, landing | **No** — renders identically to org-wide (§4.3) |
| **Inherited** | Granted via a parent role; not editable here | Role Permissions tab, effective-access preview | **No** — no inheritance concept exists |
| **Restricted** | Scope narrower than the role's default | User Access tab, preview | **Partly** — `restricted` is a stored value (`members/route.ts:124-125`), but "narrower than default" needs a default |
| **Conflicting** | Two sources disagree | Preview | **N/A** — resolved: scope intersects, capability unions (`02…§15.3`) **[carried]** |
| **Expired** | Time-boxed access lapsed; invitation expired | Users, landing | **No** — no expiry attribute anywhere (**D-IA4**) |
| **Planned** *(added)* | The capability is not built | Everywhere | **Yes** — `data-capability="planned"`, ten placeholders (§4.10) |

**Empty remains the most common and least designed**, exactly as the accepted artifact said — and this
pass upgrades it from a design gap to a verified impossibility: the members route cannot emit the
distinction, so no rendering can show it.

---

## 7. Requirements this deliverable adds

Testable, and each traceable to a finding. These extend the invariant registers of `02…§7` (I-1…I-31)
and `04…§6.3` (I-28…I-34) at the **product surface** layer, so they are numbered `IA-R n` rather than
continuing an `I-` series that two documents already extend independently (§8, D-IA0).

| # | Requirement | From | Check |
|---|---|---|---|
| **IA-R1** | No access surface may render an account state, authentication method, or scope summary that was not read from data. A value the system did not compute **MUST** render as Planned or Unknown. | IA-1, IA-10 | Static: assert no literal `Active` / `Password` in a status position in `components/adminV2/settings/access/**` |
| **IA-R2** | The member projection **MUST** carry invitation state, last sign-in, lock state, and MFA-factor presence, or state per field why it cannot. | IA-2 | Contract test on `GET /api/admin/settings/users-roles/members` |
| **IA-R3** | Absent scope **MUST** be distinguishable from org-wide scope at every layer that renders it. No projection may default a missing access profile to `all` (I-19, I-30). | IA-3 | Fixture: member with no profile row renders "No access configured", never "All locations" |
| **IA-R4** | Effective access — user-side and role-side — **MUST** be produced by the enforcing resolver, in the same normalized form (I-28), and **MUST NOT** have a second implementation. | IA-4 | Property test: preview and enforcement return identical sets for the same fixture, including whitespace/case variants (`02…§19`) |
| **IA-R5** | A lifecycle transition **MUST NOT** report success before it is effective, and its confirmation copy **MUST NOT** promise more than the transition performs. | IA-6 | Integration: revoke, then assert denial on the next request in a second process (`02…§19`, I-29) |
| **IA-R6** | Unbuilt capability **MUST** be marked, never simulated. No surface may fabricate events, counts, or states for display. | IA-10 | Static: every placeholder carries `data-capability="planned"`; extend to status positions |
| **IA-R7** | A surface that presents a capability **MUST** gate on it, from the same declaration that gates the command. | §2.3, `05…§7.7` | Static: each access chapter declares its capability; nav filters from the same declaration |
| **IA-R8** | No inert capability may be presented to an operator as a control. A grid row whose keys have no enforcement site **MUST NOT** render as a setting. | §5.5, `05…§7.5` | Build-time: every catalog key resolves to ≥1 enforcement site |
| **IA-R9** | The invite flow **MUST** create the access profile in the same transaction as the membership. Scope **MUST NOT** be deferred to a later step. | IA-5, G4 | Integration: `POST /api/admin/users` writes `user_access_profiles`; assert no membership exists without one |
| **IA-R10** | Every password field in the product **MUST** offer a show/hide control, from one shared component. | `04…§6.2` **[carried]** | Static: no bare `type="password"` outside that component |

**IA-R1, IA-R3, and IA-R6 are the cheapest items in this document and the highest-value**: they remove
false statements from the operator's screen without waiting on a decision, a migration, or the resolver
work. IA-R10 is carried unchanged from `04…` and remains the cheapest item in the corpus.

---

## 8. Decisions

**D-IA0 — the corpus's decision numbers have collided, and this document declines to make it worse.**
At `7df17b9b3` plus the uncommitted working tree, **D9** denotes both *"Is `ops` a user-and-role
administrator?"* (`02…§10`) and *"Who may mint a credential"* (`04…§3.5`); **D11** denotes both
*"maximum acceptable revocation latency"* (`02…§20`) and *"is the admin password-reset trigger bounded to
the caller's org"* (`04…§7`); **D12** likewise denotes two different questions. The accepted `06` added a
third reading of D9–D11 (§12 §5). This pass therefore namespaces its own decisions `D-IA n` and records
the collision as a corpus-hygiene item for the Director: **one register, one authority, before D-numbers
are cited in an acceptance rubric** — [`07-director-acceptance-rubric.md`](./07-director-acceptance-rubric.md)
binds criteria to them.

Two accepted decisions are **closed** by this pass:

- **§12 D9** *(what is a conflict, how does it resolve)* — **closed by the corpus.** `02…§15.3` settles
  it normatively: capability unions, scope intersects, no conjunct may widen another. The accepted
  recommendation and the model agree; no product decision remains.
- **§12 D10** *(where Access lives)* — **closed by implementation**, differently from the recommendation
  and better: Access is an Organization domain at `/organization/access` (§2.1). The residue is IA-8, a
  duplicate route, which is a cleanup rather than a decision.

Two remain open, and two are new.

**D-IA1 — Does the Users chapter show *account status* or *membership status*?**
`04…` D5 asks where account state lives (per-org or per-account) and is open. The IA consequence is
immediate and cannot be deferred behind it: a user suspended in one org and active in another needs one
badge in this org's directory. *Recommendation:* **show membership status as the primary badge, with
credential-level state (`locked`, credential disabled) as a distinct secondary marker** — because an org
admin can act on the first and, per D5's own recommendation, must not be able to act on the second. This
is the IA half of D5 and should be decided in the same sitting.

**D-IA2 — Does the directory show a person, or an account?**
Today it shows `user_metadata.full_name`, falling back to email (`members/route.ts:112-117`;
`AccessUsersConfigurationPage.tsx:46-50`) **[verified]** — an account, named by whatever the credential
happened to carry. The brief asks for a person column; `02…` D1 (*does a person ever become a
principal*) is open and this document does not presume it. *Recommendation:* **show the account as
primary and the linked person as an explicit, nullable secondary attribute** — never a name matched from
the person graph. Rule 3 forbids inference, and a directory that silently resolves a person by email is
the prohibited join at its most tempting (§4.5).

**D-IA3 — Is a reusable access policy in V2, and what is it?**
The Access Scopes chapter is the home for it and contains none (§3.1). *Recommendation:* **specify it
now, build it after the resolver.** A policy is a named, org-scoped set of scope dimensions attachable to
many memberships; a membership resolves to policy ∪ explicit dimensions, then intersects per `§15.3`. It
is not a new authority concept — which is precisely why it can be specified before it is built, and why
without it every user edit is hand-authored scope.

**D-IA4 — Is time-boxed access in the first wave?**
Unchanged from §12 D11 and untouched by the built surface. It requires an expiry attribute, evaluation in
the resolver, and a sweep to produce the Expired state. *Recommendation:* **specify now, build after the
resolver lands** — it is a scope attribute, not a new concept, and the Expired state has no home until
the lifecycle states of IA-R2 exist.

None of D-IA1 – D-IA4 is worker-resolvable; all are recorded rather than assumed, per the mission's
document-authority rule.

---

## 9. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ 7df17b9b3
cd web

# §2.1 — three routes, two of which render (the third redirects)
sed -n '15,41p' app/adminV2/settings/users-roles/page.tsx
sed -n '16,42p' app/adminV2/settings/organization/access/page.tsx
sed -n '1,8p'   app/adminV2/settings/user-access/page.tsx
# …and the alias that makes /organization/access the generated URL
grep -n -A2 '"users-roles"' lib/admin/canonicalAdminRoutes.ts

# §2.2 — four chapters
grep -n 'ACCESS_WORKSPACE_CHAPTERS = ' lib/access/accessChapterRoutes.ts

# §4.1 — "Active" as a literal, four positions; and Roles reading it from data
grep -n '>\s*Active\s*<\|Active$\|Password sign-in' components/adminV2/settings/access/AccessUsersConfigurationPage.tsx
grep -n 'is_active === false' components/adminV2/settings/access/AccessRolesConfigurationPage.tsx

# §4.2 — the auth user is fetched, two fields are kept
sed -n '106,121p' app/api/admin/settings/users-roles/members/route.ts
grep -n 'invited_at\|confirmed_at\|last_sign_in_at\|banned_until\|factors?:' \
  node_modules/@supabase/auth-js/dist/module/lib/types.d.ts

# §4.3 — absent profile defaults to "all", in the list projection
sed -n '123,127p' app/api/admin/settings/users-roles/members/route.ts
# …and the invite path that never creates the profile (G4)
grep -n 'user_access_profiles\|user_roles' app/api/admin/users/route.ts

# §4.5 — the five-step rail, two steps planned
sed -n '686,752p' components/adminV2/settings/access/AccessUsersConfigurationPage.tsx

# §4.6 — one lifecycle action exists; the verbs do not
grep -rn 'suspend\|deactivate\|reactivate\|invitation_pending\|resendInvite\|revokeInvit' \
  app/api/admin/users app/api/admin/rbac components/adminV2/settings/access
#   → only rbac/roles/[role_key]/route.ts:46 (role deactivation). No user lifecycle verb.

# §4.9 — the landing has no summary cards
grep -n 'summaryCards' lib/configRuntime/accessLandingModel.ts

# §4.10 — the Planned discipline
grep -rn 'data-capability="planned"' components/adminV2/settings/access | wc -l   # 14
```

---

## 10. Limits — read before citing

- **Specification, not design.** No layouts, components, or visual treatments are decided here. Where
  built structure is described (rails, tabs, cards) it is *reported as current state*, not prescribed.
- **No browser QA.** Nothing in this document was observed running. Every claim about what an operator
  sees is derived from the component source at `7df17b9b3` — including the four `Active` literals, which
  are read from JSX, not from a screen. A render path that overrides them at runtime would not be visible
  to this method. `alloy-dev-start` was not run and no dev server was started by this phase.
- **Two inputs are cited from an uncommitted working tree.**
  `docs/platform/planning/access-identity-v2/01-existing-state-inventory.md` and `02-…-model.md` carry
  uncommitted Mission 2 changes at the time of writing (`git status`: both modified). Line citations into
  `02…` Part II in particular will not resolve against `7df17b9b3` until those changes are committed.
- **The SDK field list is the installed dependency, not the wire.** `invited_at`, `banned_until`,
  `factors` and the rest are read from `@supabase/auth-js`'s `User` type in `web/node_modules`. That the
  hosted project **populates** each of them for a given user was not verified — no auth admin call was
  issued. IA-R2 should be read as *"these fields are the mechanism"*, not *"these values are present."*
- **Inertness, enforcement counts, and the surface census are carried, not re-measured.** §5.5's "eleven
  inert keys" and §2.3's "one gated surface of 132" come from `05…` and inherit its limits — file-level
  counting, occurrence-based inertness, and no route executed.
- **`legacy-admin` was not examined.** Its 64 pages are outside this workspace and may present access
  concepts this document does not know about.
- **Scope policies are specified, not modelled.** D-IA3 gives a shape; `02…` has no policy object, and
  nothing here should be read as an approved model for one.
- **No source, schema, migration, or UI was changed by this phase.** This is a documentation deliverable.

---

## 11. Provenance — Mission 2 pass

- **Verified in** `wt6-vacilando-os-product-def` @ `7df17b9b3` (branch `hotfix/vacilando-ui-freshness-flash`;
  see §10 on the two uncommitted inputs). Files opened and read this pass:
  `web/app/adminV2/settings/users-roles/page.tsx`,
  `web/app/adminV2/settings/organization/access/page.tsx`,
  `web/app/adminV2/settings/user-access/page.tsx`,
  `web/app/api/admin/users/route.ts`,
  `web/app/api/admin/settings/users-roles/members/route.ts`,
  `web/lib/access/accessChapterRoutes.ts`,
  `web/lib/configRuntime/accessLandingModel.ts`,
  `web/lib/admin/canonicalAdminRoutes.ts`,
  `web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx`,
  `web/components/adminV2/settings/access/{AccessWorkspaceSurface,AccessUsersConfigurationPage,AccessRolesConfigurationPage,AccessScopesPage,AccessSecurityPage}.tsx`,
  `web/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts`.
- **Corpus inputs, reused not re-derived:** `01-existing-state-inventory.md` (G4, C6, C7, C11, §5),
  `02-canonical-access-identity-model.md` (§3 E1 rules, §15 resolution stages and composition, §18
  M2-10/M2-11/M2-12, §10 and §20 decisions), `04-authentication-model.md` (§4 identity, §5 lifecycle and
  credential effects, §6.1 methods, §6.2 presentation), `05-command-enforcement-census.md` (§2 capability
  catalog, §3 surface catalog, §7 V2 implications, §8 rejection conditions).
- **Brief inputs:** seven-section workspace, seven-state lifecycle, six creation paths, nine directory
  columns, five visible states, and the rejection conditions — all via `00-mission-intake-and-coverage.md`
  §1 and §3.1.
- **No source, schema, migration, or UI changed by this phase.**

---

## 12. Accepted artifact — preserved verbatim

> *Preserved from the `msn_2d054741a54698fa4c` delivery (`c8120d550`, 2026-07-30). Not re-derived.
> Authoritative for its own date; superseded by §§0–11 where they disagree — principally §1 (current
> surface) and §2 (target IA), both of which describe a product state that no longer exists.*

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
