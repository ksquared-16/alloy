# 04 — Authentication model

> **Required output #4.** Current-state inventory of how someone proves identity in Alloy, and the
> target model the brief asks for. Closes the single largest gap identified in
> [`00-mission-intake-and-coverage.md`](./00-mission-intake-and-coverage.md) §3.1.

**Mission** `msn_2d054741a54698fa4c` v1 · phase *Authentication model* · assignment `asg_56508f92881d3d`
**contentHash** `2c0b0b8fee88469de91e37587a3bb242`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30
**Method** static, file-grounded. Every current-state claim cites `path:line`. No live auth tested.

---

## 1. Headline

**Alloy has exactly one way to log in, and no authentication product.**

A single email+password form (`web/app/login/page.tsx:74`) calling Supabase
`signInWithPassword`. Every other authentication capability the brief names — passwordless link,
email OTP, SMS OTP, Google, Microsoft, Apple, enterprise SSO/SAML, MFA, trusted-device policy — is
**absent from the application**. Magic-link and OTP calls exist only in Playwright helpers and QA
fixture scripts (`web/playwright/helpers/adminSessionAuth.ts:77-93`,
`web/scripts/captureCommunicationsConvergenceQa.ts:36-41`), never in a user-reachable path.

Three consequences the brief cares about:

- **Nothing is organization-configurable.** There is no `supabase/config.toml` in the repository;
  auth settings are hosted-dashboard state. There is no per-org authentication configuration of any
  kind, so "authentication methods are configurable" cannot be satisfied without new product.
- **The password show/hide baseline is not implemented anywhere.** Three password inputs exist in
  the whole application — `login/page.tsx:203`, `reset-password/page.tsx:157` and `:175` — and none
  has a reveal toggle (zero occurrences of `showPassword`/`revealPassword` in `web/`).
- **Authentication is the only gate at the edge.** Middleware verifies a Supabase user exists and
  nothing else (`web/middleware.ts:102-114`) — no org membership check, no account-state check.

## 2. Current state, leg by leg

### 2.1 Sign-in

`web/app/login/page.tsx:74` — `supabase.auth.signInWithPassword({ email, password })`, then
`router.push("/workspace")` (`:88`). No org selection, no membership verification, no account-state
check at sign-in. Authorization happens later, per-request, in the admin resolver.

**Error handling leaks.** The raw Supabase error string is rendered to the user
(`login/page.tsx:80` → `setError(signInError.message …)`). Supabase distinguishes "Invalid login
credentials" from other conditions; surfacing provider text verbatim is a user-enumeration and
internal-detail exposure risk. There is no lockout, no attempt counter, and no rate limit in
application code — whatever exists is Supabase-side and unconfigured in this repository.

### 2.2 Invitation

`POST /api/admin/users` (`web/app/api/admin/users/route.ts:91`) →
`supabase.auth.admin.inviteUserByEmail(email, { redirectTo: …/login })`, then a single insert into
`user_roles` (`:100-104`).

Three defects visible in that one handler:

1. **No person link.** Nothing associates the invited account with a canonical `persons` row. This
   is the person↔user gap of `01-existing-state-inventory.md` §1, reproduced at the point of user
   creation.
2. **No access profile.** Only `user_roles` is written — confirming **G4**
   (`01-existing-state-inventory.md:24`). The user gets a role but no scope, so scope resolution
   falls to whatever the resolver defaults to.
3. **Email-only.** The brief asks for "invite by email **or mobile number**" and "create without
   invitation and send access later". Neither exists; invitation is inseparable from creation.

### 2.3 Password reset and recovery

- Self-service: `web/app/forgot-password/page.tsx:36` — `resetPasswordForEmail`.
- Admin-triggered: `POST /api/admin/send-password-reset` (`route.ts:34`) — same primitive.
- Completion: `web/app/reset-password/page.tsx:50` — `updateUser({ password })`.

**Password policy is client-side only and is `length >= 6`** (`reset-password/page.tsx:41-44`),
alongside a confirm-match check (`:37-40`). There is no server-side policy, no complexity rule, no
reuse history, no expiry, and no forced-reset mechanism. A direct `updateUser` call bypasses the
length check entirely, because the check lives in the submit handler, not on the server.

### 2.4 Session

Middleware (`web/middleware.ts:81-117`) constructs a Supabase SSR client, calls `auth.getUser()`,
and — for paths where `requiresOperatorSession(pathname)` is true — redirects to `/login` when there
is no user. Session lifetime, refresh behaviour, and trusted-device policy are entirely Supabase
defaults; none is expressed in the repository, and none is per-org.

### 2.5 What the edge does *not* protect

`requiresOperatorSession` returns true only for operator, admin, organization, settings, and legacy
admin UI paths (`web/lib/admin/operatorSessionGate.ts:16-22` →
`canonicalAdminRoutes.ts:213-226`, `:324-330`). **`/api/*` is not matched.** Every API route is
therefore responsible for its own authentication. That is the structural reason the enforcement
census in [`05-command-enforcement-census.md`](./05-command-enforcement-census.md) matters: at the
edge, an API route is unprotected by default.

### 2.6 Account lifecycle

**There is no account lifecycle.** The brief names seven states (Draft, Invitation pending, Active,
Temporarily suspended, Locked, Deactivated, Invitation expired). Alloy stores none of them. A
"user" is a row in `user_roles` plus an `auth.users` record; `GET /api/admin/users`
(`route.ts:20-63`) returns `user_id`, `email`, `role_keys`, `role`, `created_at` and nothing else —
no status, no last-login, no MFA state, no invitation state. Removing access means deleting the
`user_roles` row (`app/api/admin/users/[userId]/remove/route.ts`), which is a grant deletion, not a
lifecycle transition, and leaves the `auth.users` record able to authenticate.

**This is the most consequential finding in this document.** Deactivation today does not stop
sign-in; it removes a role. Combined with §2.4 (middleware checks only that *some* user exists), a
deactivated operator retains a valid session and a valid credential.

## 3. Target model

Four layers, in the order they must be decided. Each is stated so that it can be built
independently and gated separately.

### 3.1 Identity — the account is a credential for a person

A **User** is a login credential bound to exactly one canonical `persons` row. This is the brief's
rule (*"a user account should authenticate a person; it should not become another person
database"*) and it resolves the §2.2(1) gap.

- One link table `person_users(person_id, auth_user_id, org_id)`, unique on `auth_user_id`.
- Account creation **must** resolve or create a person first; the invite path takes a `person_id`.
- No user-held name, contact, or demographic field. Those live on the person.
- Staff, parent, guardian, and contact users are the same object with different person
  relationships, roles, and scopes — not different identity models.

### 3.2 Lifecycle — an explicit, enforced state machine

Add a first-class account state, stored per `(auth_user_id, org_id)`:

```
draft → invitation_pending → active
invitation_pending → invitation_expired → (resend) → invitation_pending
active ⇄ suspended            (reversible, operator-initiated)
active → locked               (system-initiated: failed attempts / risk)
locked → active               (unlock or recovery)
active|suspended|locked → deactivated   (terminal for this org)
```

**Enforcement rule (the point of the whole state machine):** a session is valid only when the
account state is `active`. This must be checked **server-side on every authenticated request**, not
at sign-in — otherwise an already-issued session survives suspension. Concretely, the account-state
check belongs in the admin access resolver alongside the existing org/role resolution, so that both
UI paths and API routes inherit it.

Sign-in must additionally reject non-`active` states with a distinct, non-enumerating message.

### 3.3 Methods — organization-configurable, code-owned

A per-org `auth_policy` record selecting from a **code-owned catalog** of supported methods.
Configuration steers; code owns which methods can exist and how each is verified — Alloy's standing
rule, and the reason this is not a free-form settings blob.

| Method | Status today | Target |
|---|---|---|
| Email + password | Implemented (`login/page.tsx:74`) | Retain; add server-side policy |
| Passwordless email link | Test-only (`adminSessionAuth.ts:77`) | Promote to product |
| Email OTP | Test-only (`adminSessionAuth.ts:88`) | Promote to product |
| SMS OTP | Absent | New; needed for parent/guardian reach |
| Google / Microsoft | Absent | New (Supabase OAuth) |
| Apple | Absent | New; parent experience |
| Enterprise SSO / SAML | Absent | Advanced; later wave |
| MFA policy by role/risk | Absent | New; depends on §3.2 state and role |
| Session + trusted device | Supabase defaults | New; per-org policy |
| Forced reset / recovery | Reset only, no force | Extend |

Policy fields: enabled methods, password rules (min length, complexity, reuse, expiry), MFA
requirement by role, session lifetime and idle timeout, trusted-device window, invitation validity
window and resend limits.

**Password policy must move server-side.** The current `length >= 6` in a submit handler
(`reset-password/page.tsx:41-44`) is advisory; the server accepts anything.

### 3.4 Presentation — the baseline the brief names

Every password field gets a show/hide control. Three call sites today (`login/page.tsx:203`,
`reset-password/page.tsx:157`, `:175`), and any field added later.

Build it once as a shared password input so the guarantee is structural rather than per-screen, and
lock it with a test asserting no bare `type="password"` outside that component. Defaults: hidden;
toggle is a real button with an accessible label and is keyboard reachable; never auto-reveals; the
revealed state is never persisted or logged.

This is small, and the brief calls it *"a straightforward required baseline"* — it should not be
sequenced behind the auth-method work.

## 4. Decisions required

**D5 — Does account state live per-org or per-account?**
Alloy is multi-org; `user_roles` is `(user_id, org_id)`. Suspension is naturally per-org, but
`locked` (failed attempts) is naturally per-credential. *Recommendation:* state is per-`(user,
org)`; `locked` is per-credential and short-circuits every org. This keeps org admins from locking
a credential they do not own.

**D6 — Does deactivation revoke the credential?**
When the last org membership is deactivated, is the `auth.users` record disabled? *Recommendation:*
yes — otherwise a deactivated user holds a valid credential with no membership, which is exactly
today's defect (§2.6). Revocation must be explicit, not a side effect of deleting a role row.

**D7 — MFA scope for the first wave.**
Operators only, or parents too? *Recommendation:* operators first, policy-by-role, because
parent/guardian reach depends on SMS OTP (§3.3) which is itself new. Do not couple them.

**D8 — Is SSO/SAML in V2 at all?**
*Recommendation:* specify the policy shape so it is not precluded, but do not build it. It is the
one method here that materially changes tenancy and provisioning.

## 5. Limits

- **Static and file-grounded.** No authentication flow was executed, no live Supabase project
  inspected, no browser QA performed. Statements about Supabase-side configuration are inferences
  from the absence of `supabase/config.toml`, not readings of dashboard state.
- **§2.6's session-survival claim is reasoned from code, not demonstrated.** Middleware checks only
  user existence (`middleware.ts:110`) and no account-state store exists; a live test should confirm
  before it is cited as a vulnerability.
- **Rate limiting and lockout were not found in application code.** Supabase may impose its own; that
  was not verified.
- **§3 is specification, not design.** No UI, schema, or migration is proposed at implementation
  fidelity here; §3.1's table sketch is illustrative.

## 6. Provenance

- **Verified in** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`:
  `web/middleware.ts`, `web/app/login/page.tsx`, `web/app/reset-password/page.tsx`,
  `web/app/forgot-password/page.tsx`, `web/app/api/admin/users/route.ts`,
  `web/app/api/admin/send-password-reset/route.ts`, `web/lib/admin/operatorSessionGate.ts`,
  `web/lib/admin/canonicalAdminRoutes.ts`.
- **Inputs:** [`01-existing-state-inventory.md`](./01-existing-state-inventory.md) (G4, person↔user),
  [`02-canonical-access-identity-model.md`](./02-canonical-access-identity-model.md) (§3 principals).
- **No source, schema, migration, or UI changed by this phase.**
