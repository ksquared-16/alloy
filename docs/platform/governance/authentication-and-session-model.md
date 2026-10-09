---
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Authentication and session model

**Status:** Canonical (September 2026). Measured from the repository and from the deployed primary's
catalog on 2026-09-30.

**What this document is for.** Roles and permissions have an owner
([`roles-and-permissions.md`](roles-and-permissions.md)). Tenant isolation has one
([`rls-authority-model-director-gate.md`](rls-authority-model-director-gate.md)). *Signing in* had
none, and its absence was a named blocker on Identity/Access certification. This is that owner.

**The single most important thing on this page.** Alloy owns very little of authentication. Supabase
Auth owns the credential, the token and the email; Alloy owns who may then *enter the portal* and what
they may *do*. Confusing those two produces the most common wrong belief about this system — that
because a user signed in, they are authorized. They are not. Admission and authorization are separate
gates, and a third gate — tenant isolation — is separate again.

---

## The five categories, and why the page is organised this way

Every row below is labelled with exactly one:

| Label | Meaning |
|---|---|
| **ALLOY** | Implemented in this repository. Readable, testable, ours to change. |
| **PROVIDER** | Supabase Auth performs it. Alloy calls it and handles the result. |
| **UNKNOWN_EXTERNAL** | Governed by Supabase project configuration that is **not in this repository**. Not inferable from source. Stated as unknown rather than guessed. |
| **ABSENT** | Not implemented. No partial implementation exists. |
| **PLANNED** | Designed in `platform/planning/**` and not built. Planning material is never current truth. |

The `UNKNOWN_EXTERNAL` category is the reason this document can exist honestly. A page that described
password policy or token lifetime as though the repository proved them would be inventing its most
security-relevant claims. What the repository proves is which *calls* are made; the *settings* behind
them live in a dashboard.

---

## Session establishment and validation

| Concern | Label | Where / what |
|---|---|---|
| Credential check | **PROVIDER** | `supabase.auth.signInWithPassword` — `app/login/page.tsx` |
| Token issuance, refresh, rotation | **PROVIDER** | Supabase Auth; the browser client holds it in a cookie whose name is pinned by `lib/supabase/browserTransport.ts` |
| Session validation per request | **ALLOY** calling **PROVIDER** | `middleware.ts` — `supabase.auth.getClaims()` / `getUser()` |
| Server-side session read | **ALLOY** | `lib/supabaseServer.ts` (`createServerClient`, cookie-bound). One of only four modules using an RLS-bound client, and it reads identity, never product data |
| Sign-out | **ALLOY** calling **PROVIDER** | `supabase.auth.signOut` — profile menu, admin layout, idle hook, legacy admin |
| Password reset request | **ALLOY** calling **PROVIDER** | `supabase.auth.resetPasswordForEmail` — `app/forgot-password/page.tsx` |
| Password update after reset | **ALLOY** calling **PROVIDER** | `supabase.auth.updateUser` — `app/reset-password/page.tsx` |
| Token lifetime / refresh window | **UNKNOWN_EXTERNAL** | A Supabase project setting. Nothing in this repository sets or asserts it |
| Password strength policy | **UNKNOWN_EXTERNAL** | Provider configuration. `app/login` imposes no client-side rule |
| Email templates and sender identity | **UNKNOWN_EXTERNAL** | Provider configuration |
| Auth rate limiting / lockout | **UNKNOWN_EXTERNAL** | Provider configuration. No application-level throttle exists |
| Self-service signup | **UNKNOWN_EXTERNAL** | Whether the project permits public signup is a provider setting. Alloy ships **no signup page** — the only account-creation path in the product is an invite (below) |

> **Why the last row matters more than it looks.** Several risk judgements elsewhere depend on how
> large the `authenticated` population is. If the provider permits public signup, "any authenticated
> user" includes anyone on the internet; if it does not, it means "any invited operator of any
> tenant". Both are real threat models and they are not the same one. **This repository cannot tell
> you which applies.** Treat the wider reading as the safe assumption until the provider setting is
> recorded.

## Idle session timeout

| Concern | Label | Detail |
|---|---|---|
| Idle warning and forced logout | **ALLOY, PARTIAL** | `lib/adminV2/runtime/useIdleSessionLogout.ts` — warns at 25 min, signs out at 30 min |
| Activation | **ALLOY** | Behind `NEXT_PUBLIC_ALLOY_OS_IDLE_LOGOUT=1`, **off by default** |

The mechanism is built and the default is off, so in an unflagged deployment there is **no application
idle timeout** — only whatever the provider's token lifetime imposes, which is `UNKNOWN_EXTERNAL`.
Documenting this as "session timeout: implemented" would be false in every deployment that has not set
the flag.

## Account lifecycle

| Concern | Label | Detail |
|---|---|---|
| Invite an operator | **ALLOY** calling **PROVIDER** | `POST /api/admin/users` → `supabase.auth.admin.inviteUserByEmail`, gated on org admin or `settings.users_roles` |
| Accept an invite | **PROVIDER** | The invite link is a provider flow; Alloy has no accept-invite page |
| Grant / revoke authority | **ALLOY** | `user_roles` rows via `assign_member_role_audited` / `remove_member_role_audited`, transactional with their `mutation_events` record. See [`roles-and-permissions.md`](roles-and-permissions.md) |
| Deactivate the *authority* | **ALLOY** | Membership revocation. Takes effect on the next authority resolution |
| Deactivate the *account* | **ABSENT** | No call to `auth.admin.banUser`, `deleteUser` or `updateUserById` exists anywhere in the tree |

> **Revoking access is not disabling an account, and the difference is operationally visible.** A
> revoked operator's credential still authenticates: they sign in successfully, fail portal admission,
> and land back at `/login`. The session is real; the authority is gone. An operator who believes
> "removed from the org" means "the login stopped working" will read that redirect as a bug. There is
> no product surface that disables a credential.

## Multi-factor authentication

| Concern | Label | Detail |
|---|---|---|
| MFA enrollment or challenge | **ABSENT in Alloy** | No enrollment surface, no challenge step, no factor management |
| Alloy's own declaration | **ALLOY** | `lib/access/accessPresentationContracts.ts` types it `mfaStatus: "unsupported" \| "planned"` — the product says so about itself |
| Reading factor presence | **ALLOY** | `memberIdentityProjection` reports `mfa: "enrolled" \| "none" \| "unknown"`, and carries `mfa_unknown_reason` when the field is absent rather than defaulting to "none" |
| Provider-side MFA | **UNKNOWN_EXTERNAL** | Supabase supports factors; whether any are enrolled on this project is not a repository fact |

The projection's three-valued answer is the correct shape and worth preserving: `unknown` is not
`none`. A surface that rendered an unreadable field as "no MFA" would be asserting a security fact it
did not have.

## Trusted devices

**ABSENT.** Zero occurrences of `trusted_device` / `trustedDevice` in the tree. No table, no column,
no surface. Device trust is not a partially built feature here; it does not exist.

## Customer / parent authentication

**ABSENT, and stated as such in code rather than merely missing.**
`lib/access/linkedPersonIdentity.ts` says it in its own header: this module resolves an authenticated
user to a Person, and *"is not an identity provider, not account lifecycle, and not customer
authentication — that remains unsolved."*

There is no parent login, no family portal session, and no customer credential anywhere in the
product. Everything in `platform/planning/**` describing one is **PLANNED**. This is the single most
likely wrong inference about Alloy's authentication surface, because the data model has families,
children and contacts, and a reader may reasonably assume they can log in. They cannot.

---

## Identity: the user ↔ person bridge

An authenticated user and a canonical Person are **different things joined by an explicit row**:
`user_person_links (user_id, org_id, person_id, status)`, resolved by
`resolveLinkedPersonId` in `lib/access/linkedPersonIdentity.ts`.

**Email is never identity.** There is no email fallback in that resolver and there must never be one.
Email is mutable, is unique by no constraint in this schema, and is shared in practice; a wrong guess
either locks out a real teacher or hands one teacher another person's assignments, and neither
announces itself.

Verified 2026-09-30: every `persons`-by-email lookup in the tree resolves a **submitted or inbound**
address — intake form dedupe, form-approval person matching, inbound email attribution — and never
the session's own address. Measured constraints confirm the bridge's shape: `user_id` and `linked_by`
reference `auth.users`, `person_id` references `persons` with `ON DELETE RESTRICT`, and `status` is
constrained to `active | revoked`.

**Unresolved is not unprivileged.** A failed read returns `personId: null` with `resolved: false`, so
callers deny rather than treating a broken query as "this user is nobody".

**Money-capable access requires a named person (W7-F002, grant time).** A membership change that newly
confers a money-capable capability (`fin.write`, `fin.adjust`, `fin.responsibility`, `fin.subsidy`,
`fin.provider`; `fin.post` retired but judged) on a user with no active link to a named, unarchived Person
is refused by `assert_assignment_delegation_ceiling` (`money_capable_grant_requires_person_link`), and so
is newly allowing one on a role that has unlinked holders. Re-saving an already-allowed grant is not a new
grant, so no holder is stranded and no financial act is refused mid-flight. Money capability is a
capability (`money_capable_capability_keys()`), never a role-name list. Links are made, replaced and
revoked under Users › Account › Linked person (`/api/admin/access/person-links`, POST and PATCH);
replace is atomic, and revoke is refused while the user can still move money.

---

## How the three gates compose

This is the part most worth getting right, because each gate answers a question the others do not.

| Gate | Question | Owner | Where |
|---|---|---|---|
| **Authentication** | Is there a valid session? | Supabase Auth | `middleware.ts` |
| **Admission** | May this principal enter the operator portal? | `portal.access` capability | `requireAdminOrOps` → `loadAdminAccessBundle` |
| **Authorization** | May this principal perform *this operation*? | Route capability assertion | Per-route, declared in `scripts/routeCapabilities.declared.json` |
| **Tenant isolation** | May these *rows* be reached at all? | RLS, plus the server's own org pin | Policies; `ctx.orgId` |

**Admission is not authorization, and the name of the helper hides that.** `requireAdminOrOps` reads
as though it authorizes — it does not. It resolves `portal.access` and *returns* the principal's
permission-key union for the resolved org; asserting a key from that union is the route's job. A route
that calls it and nothing else has established that the caller may be in the building, not that they
may perform the operation.

The invariant is locked, not merely documented:
`tests/access/admissionDoesNotAuthorize.test.ts` fails if any module uses admission *affirmatively* to
grant (`if (portalEligible) return true`), while permitting the negative form that refuses
(`if (!portalEligible) return forbidden`). The polarity distinction is the whole point — a scan that
could not tell them apart would convict eleven correct call sites along with the one real defect.

`requireAdminOrOps` is also not a role check despite its name: `PORTAL_ROLES = ["admin","ops"]` was
removed as an authority literal, and admission is now a grantable, org-scoped capability
(`tests/access/portalAdmissionIsCapability.test.ts`).

---

## What an AI or a new engineer must not conclude

- **Not**: signed in means authorized. Three further gates follow.
- **Not**: `requireAdminOrOps` authorizes the operation. It admits to the portal and hands back the key set.
- **Not**: parents or customers can log in. No such credential exists.
- **Not**: MFA, trusted devices, or account disabling exist. Two are absent entirely; the third is provider-side and unverified here.
- **Not**: there is a session idle timeout. The mechanism exists and ships disabled.
- **Not**: email identifies a Person. Only `user_person_links` does.
- **Not**: revoking membership disables the credential. It does not.
- **Not**: provider settings can be inferred from this repository. Password policy, token lifetime, signup openness, and rate limits are all `UNKNOWN_EXTERNAL`.

## Exact evidence still missing

These are provider-dashboard facts. Each would convert an `UNKNOWN_EXTERNAL` row above into a stated
one, and none can be obtained from this repository:

1. Is public self-service signup enabled? (decides the size of the `authenticated` population)
2. JWT / access-token lifetime and refresh-token rotation policy.
3. Password strength and reuse policy.
4. Auth rate limiting and account-lockout thresholds.
5. Whether any MFA factors are enrolled, and whether MFA is enforced for any role.
6. Email sender identity and template content for invite and recovery.

---

## Related

- [`roles-and-permissions.md`](roles-and-permissions.md) — capability and scope model
- [`rls-authority-model-director-gate.md`](rls-authority-model-director-gate.md) — tenant isolation, Model A measurement and staged plan
- [`../foundation/platform-decisions.md`](../foundation/platform-decisions.md) — § *2026-09 — Route capabilities authorize; RLS isolates tenants; mutation is server-side*
- `platform/planning/access-identity-v2/**` — **PLANNED_ONLY**, never current truth
