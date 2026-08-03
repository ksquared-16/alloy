# 04 — Authentication model

> **Mission 2 refresh.** The accepted corpus is reused as input, not re-derived. The accepted artifact
> (mission `msn_2d054741a54698fa4c`, 2026-07-30) is preserved **verbatim** in §10 and remains
> authoritative for its own date; §§0–9 are this pass and supersede it where they disagree.
>
> Inputs, not re-derived: [`01-existing-state-inventory.md`](../../../access-identity-v2/01-existing-state-inventory.md)
> (Mission 2 refresh — C6, G4, C13, census), [`02-canonical-access-identity-model.md`](../../../access-identity-v2/02-canonical-access-identity-model.md)
> (Mission 2 refresh — E1 five rules, M2-3, I-26, D9, D10), and
> [`05-command-enforcement-census.md`](./05-command-enforcement-census.md) (capability catalog).
> `02…:552-553` delegates **D5–D8** to this document; they are re-anchored in §7.

**Mission** `msn_f74ed02c126c88d7ff` v1 · phase *Authentication model* · assignment `asg_955b735bafb437`
**contentHash** `3c36b58117e46b2363ef602b385409e7`
**Worktree** `wt6-vacilando-os-product-def` @ `c667da4e2`
**Date** 2026-08-03
**Method** static, file-grounded. Every current-state claim was opened and read in this pass and cites
`path:line` at `c667da4e2`. Claims reused without re-derivation are marked **[carried]**. No live
authentication flow was executed (§9).

---

## 0. Headline — the authentication gap did not move, and it is now the corpus's largest untouched leg

Three commits landed on access surfaces between acceptance and this pass (`01…:29-33`: `41610954c`,
`555fa056a`, `2ec3d322d`). **None of them touched authentication.** Verified negatives, this pass:

| Probe | Result |
|---|---|
| `supabase/config.toml` | still absent — auth settings remain unversioned hosted state |
| Migrations matching `person_users\|auth_polic\|account_state\|user_status\|invitation` | **0 files** |
| `signUp(` · `signInWithOtp` · `signInWithOAuth` · `mfa.` in `web/` | **0 occurrences each** |
| `showPassword` / `revealPassword` in `web/` | **0 occurrences** |
| `type="password"` in `web/` | **3** — `login/page.tsx:203`, `reset-password/page.tsx:157`, `:175` |
| Login surfaces under `web/app` | **1** — `login/` (no signup, no portal, no parent surface) |
| API route directories matching `*auth*` / `*login*` | **0** |

So §10's headline stands unmodified: **one way to log in, and no authentication product.** What this
pass adds is not a restatement — it is five findings the accepted artifact did not reach, and one
correction of emphasis.

**The correction of emphasis.** §10 §2.6 named the non-revocation defect and stopped at the membership
row. This pass establishes the stronger and more useful fact:

> **A2-1 — Alloy can mint a credential and mail a recovery link. It has no code path that disables
> one.** `auth.admin.deleteUser`, `auth.admin.updateUserById`, and `ban_duration` return **zero**
> occurrences across `web/` (§2.1). Credential creation is a product feature
> (`app/api/admin/users/route.ts:91`); credential *destruction* is not a feature, not an admin script,
> and not a migration. It does not exist.

That reframes deactivation from "a lifecycle state we have not modelled" to "an operation the system
is structurally incapable of performing." Every §5 lifecycle proposal must therefore ship a
credential-level revocation call, not merely a status column.

**Five new findings**, all verified in this pass:

| # | Finding | §|
|---|---|---|
| **A2-1** | No code path disables a credential — creation is a feature, revocation is absent | §2.1 |
| **A2-2** | Non-revocation is now *documented in code* as intended behaviour, not an oversight | §2.2 |
| **A2-3** | Admin-triggered password reset accepts **any** email address, bounded by no membership check, gated on a legacy role literal | §3.1 |
| **A2-4** | Password change requires **no** re-authentication and **no** current-password proof — any session suffices | §3.2 |
| **A2-5** | Request identity may resolve from a JWT-claims fast path whose verification strength depends on unversioned hosted configuration | §3.3 |
| **A2-6** | Two seeded personas per org can hold a credential they cannot use — **admission is not authentication**, and Phase 0 now grows the population | §3.4 |

---

## 1. Re-anchor — the accepted claims at `c667da4e2`

Every load-bearing citation in §10 was re-read. All claims **hold**; four line numbers drifted.

| Claim (§10 ref) | Accepted citation | Verified at `c667da4e2` | Status |
|---|---|---|---|
| Sole sign-in call | `login/page.tsx:74` | `login/page.tsx:74` | ✅ unchanged |
| Raw provider error rendered to user | `:80` | `:80` | ✅ unchanged |
| Post-sign-in redirect | `:88` | **`:89-90`** | ✅ holds, **+1** |
| Password input, login | `:203` | `:203` | ✅ unchanged |
| Confirm-match check | `reset-password:37-40` | **`:38-41`** | ✅ holds, **+1** |
| `length >= 6`, client-side only | `:41-44` | **`:42-45`** | ✅ holds, **+1** |
| `updateUser({ password })` | `:50` | `:50` | ✅ unchanged |
| Password inputs, reset | `:157`, `:175` | `:157`, `:175` | ✅ unchanged |
| Self-service reset | `forgot-password:36` | `forgot-password:36` | ✅ unchanged |
| Admin-triggered reset | `send-password-reset:34` | `send-password-reset:34` | ✅ unchanged |
| Invite call | `admin/users/route.ts:91` | `:91-93` | ✅ unchanged |
| Invite writes `user_roles` only | `:100-104` | **`:102-106`** | ✅ holds, **+2** |
| Middleware `auth.getUser()` | `middleware.ts:102-114` | **`:117`** | ✅ holds, moved |
| Edge gate excludes `/api/*` | `operatorSessionGate.ts:16-22` | `:16-22` | ✅ unchanged |

**Nothing was fixed; the file grew above the fixes.** The drift is incidental (imports and diagnostics
added upstream of each site), which is itself evidence: these files were edited in this window for
reasons unrelated to authentication, and the authentication defects were passed over each time.

---

## 2. The credential lifecycle Alloy can actually perform

### 2.1 A2-1 — two verbs exist, and neither of them is "stop"

Enumerating every Supabase auth-admin call reachable from product code:

| Verb | Call site | Reachable from product? |
|---|---|---|
| **Create** | `auth.admin.inviteUserByEmail` — `app/api/admin/users/route.ts:91` | ✅ yes, Settings → Users & Roles |
| **Recover** | `auth.resetPasswordForEmail` — `app/api/admin/send-password-reset/route.ts:34`, `app/forgot-password/page.tsx:36` | ✅ yes |
| **Re-key** | `auth.updateUser({ password })` — `app/reset-password/page.tsx:50` | ✅ yes |
| **Disable / delete / ban** | — | ❌ **no such call exists** |
| **Mint session out-of-band** | `auth.admin.generateLink` — `playwright/helpers/adminSessionAuth.ts:77`, four `web/scripts/*` fixtures | ⚠️ test/QA only, never user-reachable |

The absence is verified, not assumed: `auth.admin.deleteUser`, `auth.admin.updateUserById`,
`ban_duration`, and `failed_attempt` each return **zero** matches across `web/` (§8 reproduces).
`lockout` returns **exactly one** match, and it is a comment — `remove/route.ts:20`'s note that
self-removal would be a self-lockout (§2.2). **The only time the word appears in the product is where
the code prevents an accidental one.** The only `rate_limit` hits in the repository belong to **form
distribution links**
(`lib/admin/forms/formsAdminDb.ts:497,508`) — an unrelated subsystem. There is no authentication rate
limit, no attempt counter, and no lockout in application code.

> **The asymmetry is the finding.** A product that can create principals but not retire them
> accumulates them monotonically. Every operator who has ever been invited to any org still holds a
> working credential.

### 2.2 A2-2 — non-revocation is now written down as the contract

`app/api/admin/users/[userId]/remove/route.ts:6` documents the handler as:

> `/** POST: remove user from org (delete user_roles row). Requires org admin or settings.users_roles. **Does not delete auth.users.** */`

and the body does exactly that — a scoped delete of the membership row (`:26-30`), nothing else.

This is a meaningful change in kind since §10 §2.6, which reported the behaviour as an implicit
consequence. It is now an **explicit, documented contract**. Two readings, and the model phase must
pick one: either the comment records a deliberate decision that offboarding never touches the
credential (in which case the product owes an operator a *separate* revocation command, which does not
exist), or it records an unexamined limitation that hardened into documentation. Either way, the
sentence in that comment is the whole of Alloy's credential-revocation policy.

Wave 1 did add a guard here — `isSelfAuthorityMutation` blocks self-removal as a self-lockout
(`:20-23`). Note what that establishes: the codebase already reasons about *lockout as a hazard*,
while providing no mechanism to lock anyone out deliberately.

### 2.3 Two independent non-revocations now stack

`02…:271-275` (**M2-3**) establishes the authorization-side twin: `role_definitions.is_active` is
enforced on assignment (`role/route.ts:33-36`) and **ignored by the resolver**, which never joins
`role_definitions` (`resolveAdminAccessCore.ts:89-94`). Deactivating a role does not revoke it.

Composed with §2.1–2.2, an operator attempting to remove someone's access has three levers and none of
them revokes:

| Operator action | What it actually does | What survives |
|---|---|---|
| Remove user from org | deletes one `user_roles` row (`remove/route.ts:26-30`) | the credential, and any live session |
| Deactivate the role | blocks *new* assignments only (`02…:271-272`) | every existing holder's full capability set |
| *(no third lever exists)* | — | — |

**I-26** (`02…:277-278`, role deactivation revokes) and this document's **I-30** (§6) are the same
invariant applied to two different edges. They should be decided together — **D10** (`02…:575-579`)
and **D6** (§7) are one question asked twice.

---

## 3. New findings this pass

### 3.1 A2-3 — the admin reset trigger is unbounded by membership and gated on a legacy literal

`POST /api/admin/send-password-reset` resolves context, then gates:

```ts
if (ctx.role !== "admin") {                       // route.ts:10-12
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
const email = typeof body.email === "string" ? body.email.trim() : "";   // :15
…
await supabase.auth.resetPasswordForEmail(email, { redirectTo });        // :34
```

Three defects in ten lines:

1. **The target is an arbitrary string.** `email` comes straight from the request body (`:15`). There
   is no lookup against `user_roles`, no org-membership check, no verification that the address
   belongs to *any* Alloy principal. An org admin of org A can trigger Alloy-branded password-reset
   mail to a principal of org B, or to an address with no relationship to the product at all. This is
   not account takeover — the recipient receives the link, not the caller — but it is an
   **unauthenticated-recipient mail primitive with cross-tenant reach**, and it is a credential-
   lifecycle command with no tenancy bound.
2. **The gate is the legacy role literal, not a capability.** `ctx.role !== "admin"` reads the raw
   membership string. Per `02…:265-275`, membership rows are read from `user_roles` with no existence
   check against the catalog — so this gate trusts a string the platform never validates. Every
   comparable Settings mutation uses `requireUsersRolesManageAuth`
   (`canManageUsersAndRoles.ts:25`); this one does not. It is a **C11-class divergence**
   (`01…:228-234`) sitting on a credential path.
3. **The enumeration defence is misplaced.** The `try/catch` swallows provider errors specifically to
   avoid leaking success/failure (`:35-37`) — correct, and notably *more* careful than the sign-in
   path, which renders the raw Supabase error verbatim (`login/page.tsx:80`). The same codebase
   defends against enumeration on the admin route and leaks it on the public one.

> **I-28.** A credential-lifecycle command MUST be bounded by the caller's org: its target must
> resolve to a principal with a membership in `access.orgId` before the command executes.

### 3.2 A2-4 — changing a password requires no proof of the current one

`/reset-password` admits on the presence of **any** session, not a recovery session:

```ts
const { data: { session } } = await supabase.auth.getSession();   // :22
if (session) { setStatus("ready"); } else { setStatus("expired"); }   // :24-27
```

then calls `updateUser({ password })` (`:50`) with no `currentPassword` argument — the Supabase call
does not take one, and nothing in the handler compensates.

**Consequence.** An operator who is simply signed in can navigate to `/reset-password` and set a new
password with no re-authentication. Combined with the session posture in §10 §2.4 (lifetime, refresh,
and idle timeout are all Supabase defaults, none expressed in the repository, none per-org), any
session possession — a shared machine, a persisted cookie, an unexpired token on a lost laptop —
escalates to **permanent credential takeover**, because the attacker re-keys the credential and the
legitimate holder's recovery path is the same mailbox they may no longer control.

This is the precise inverse of the §2.1 finding: the system cannot revoke a credential, and it lets a
session holder replace one. Together they mean **possession of a session is effectively permanent
ownership of the account.**

The `length >= 6` check (`:42-45`) sits in the submit handler, so a direct `updateUser` call bypasses
it entirely — carried from §10 §2.3 and re-verified. There is no server-side policy to bypass.

> **I-29.** A password change MUST require step-up: either the current password, or a fresh
> recovery-type session, or a second factor. Session presence alone MUST NOT authorize re-keying.

### 3.3 A2-5 — request identity resolves through a claims fast path whose strength is unversioned

`lib/admin/cachedAuthSession.ts` resolves the caller once per request and prefers a claims read over a
verified user fetch:

```ts
const claimsRes = await supabase.auth.getClaims();          // :22
if (!claimsRes.error && claimsRes.data?.claims) {
  const sub = (claimsRes.data.claims as { sub?: unknown }).sub;
  if (typeof sub === "string" && sub.length > 0) {
    return { userId: sub, user: null, authSource: "claims" };   // :26-27
  }
}
const { data: authData, error: userErr } = await supabase.auth.getUser();   // :30 — fallback only
```

The module documents the behaviour honestly (`:12-15`: *"may resolve via JWT claims without
`getUser()`"*), and the codebase demonstrably knows the distinction — `middleware.ts:29-33` annotates
`getUser()` as the call that *"validates the JWT against the remote Auth server on EVERY matched
request."*

**This is not asserted to be a vulnerability.** Whether `getClaims()` verifies locally depends on the
project's Auth signing-key configuration — asymmetric keys permit local JWKS verification, symmetric
secrets do not. **That configuration is hosted dashboard state and is absent from this repository**
(there is no `supabase/config.toml`, §0). So the identity of every authenticated request is
established by a path whose verification strength **cannot be determined from the repository**.

That is exactly the class of statement an authentication model exists to make. It is recorded as a
must-verify, not a defect:

> **I-31.** The verification mode of the request-identity path MUST be an asserted, tested property of
> the platform, not an inherited default of unversioned hosted configuration. Whichever mode is
> chosen, a test must fail if the project's signing-key posture changes underneath it.

Note also that middleware calls `getUser()` on every matched request (`middleware.ts:117`) while
route-level code prefers claims — two different identity-resolution strengths on the same request, and
`/api/*` is not matched by middleware at all (§10 §2.5, re-verified at `operatorSessionGate.ts:16-22`).

### 3.4 A2-6 — admission is not authentication, and the unusable population now grows per org

`01…:217-226` (**C6**) reports that Phase 0 seeds four system roles into every new org while
`PORTAL_ROLES` remains `{admin, ops}` (`resolveAdminAccessCore.ts:18`). `regional_lead` and
`school_director` can hold a membership, hold capabilities, and **authenticate successfully** — and
then be refused at the portal.

For this document the point is a boundary definition. Alloy conflates three questions at one gate:

| Question | Layer | Where answered today |
|---|---|---|
| Are you who you claim? | **authentication** | `login/page.tsx:74` → Supabase |
| May you enter the operator portal at all? | **admission** | `portalEligible`, derived from a hardcoded two-role set (`resolveAdminAccessCore.ts:18,142`) |
| May you perform this command? | **authorization** | capability keys, per `05…` |

Sign-in succeeds for a `school_director`; admission then fails, and the user is redirected to
`/unauthorized` with no path forward — there is no second surface to land on (`web/app` contains
exactly one login surface and no portal alternative, §0). Because Phase 0 seeds these roles **on org
insert**, the population of credential-holders-who-cannot-land grows automatically with tenancy
(`01…:220-222`).

`01…:364-369` already marks `portalEligible` as explicitly temporary, to be replaced by a
`portal.access` capability under W-13 (`canReadAnalytics.ts:29-30`). This document concurs and adds
the authentication-side requirement:

> **I-32.** Admission MUST be a capability (`portal.access`), evaluated after authentication and
> before surface routing, and a principal refused admission MUST receive a distinct, actionable
> outcome — not a successful sign-in followed by a dead end.

### 3.5 A2-7 — who may mint a credential is decision D9, not a settled fact

Invitation is gated by `requireUsersRolesManageAuth` (`admin/users/route.ts:68`), which passes when
the caller's `roleKeys` include `admin` **or** their capabilities include `settings.users_roles`
(`canManageUsersAndRoles.ts:16-17`). Per `02…:564-573` (**D9**), the default seed grants
`settings.users_roles` to `ops`.

**In any default-seeded org, both seeded portal personas can mint credentials.** The seed's attempt to
make `ops` lesser withholds `admin.users.write` and `admin.roles.write` — keys that are read *nowhere*
in `web/` (`02…:286-288`). The distinction the seed is trying to draw is exactly the distinction
between "manages settings" and "creates principals", and the code cannot currently express it.

The invite handler does one thing well: it validates the requested role against `role_definitions`
with `is_active = true` (`:86-89`), which is the same check the resolver omits (§2.3). Credential
*creation* honours the catalog; capability *resolution* does not.

Otherwise the three §10 §2.2 defects are re-verified unchanged: no person link, no access profile
(`01…:236-245`, **G4** — still the highest-value open defect, still fail-open to unrestricted scope),
and email-only invitation with no mobile path and no create-without-invite.

---

## 4. Identity — the account is a credential for a person

Unchanged in substance from §10 §3.1, now aligned to the Mission 2 model, which states the same rule
more precisely and owns it. `02…:154-165` gives the five rules for edge **E1** (person ↔ user), and
this document adopts them by reference rather than restating a second version:

1. A new principal is created; the person record is **not upgraded**.
2. The link is an explicit, org-scoped, audited row — the only sanctioned join between the graphs.
3. The link is **never inferred**. Matching on email, phone, or name MUST NOT create or imply it.
4. The link confers **no authority** by itself.
5. A person-linked principal MUST NOT be portal-eligible by default.

**Rule 3 binds this deliverable most directly**, because the invitation path is where the hazard
lives: `POST /api/admin/users` invites *by email address* (`:91`), and `persons.email` is a plain
nullable column (`02…:169-172`). The two populations are keyed on the same natural identifier, in the
same org, with nothing preventing a convenience join. Any authentication feature that "finds the
person for this login" is the prohibited join wearing a friendly name.

The account-creation requirement from §10 §3.1 stands and is sharpened: **the invite path must take a
`person_id`, resolved or created deliberately before the credential exists** — never derived from the
invited address. Whether a person ever becomes a principal at all remains **D1** (`02…:557`),
unanswered, and this document does not presume it.

---

## 5. Lifecycle — the state machine, plus the revocation it must actually perform

§10 §3.2's state machine is carried forward unchanged in shape:

```
draft → invitation_pending → active
invitation_pending → invitation_expired → (resend) → invitation_pending
active ⇄ suspended            (reversible, operator-initiated)
active → locked               (system-initiated: failed attempts / risk)
locked → active               (unlock or recovery)
active|suspended|locked → deactivated   (terminal for this org)
```

Three amendments follow from §§2–3, and they are what makes this more than a status column:

**5.1 — Enforcement is per-request, in the resolver.** Carried: a session is valid only when account
state is `active`, checked server-side on *every* authenticated request, not at sign-in. The check
belongs in the admin access resolver beside org/role resolution so UI paths and API routes inherit it.
This is now load-bearing for a second reason: with `/api/*` unmatched by middleware
(`operatorSessionGate.ts:16-22`), the resolver is the only place a state check reaches the API
surface at all.

**5.2 — Each non-`active` state must name its credential-level effect (new).** Because no code path
today disables a credential (§2.1), a status column alone would be documentation, exactly as
`is_active` is for roles (§2.3). The state machine must specify, per transition, what happens to the
credential *and* to already-issued sessions:

| State | Membership effect | Credential effect | Live sessions |
|---|---|---|---|
| `suspended` | capabilities suppressed | credential retained | **must stop resolving** |
| `locked` | capabilities suppressed | credential retained, sign-in refused | **must stop resolving** |
| `deactivated` (this org) | membership retired | retained if other orgs remain | must stop resolving for this org |
| `deactivated` (last org) | — | **credential disabled** — requires a real revocation call | all sessions invalidated |

The last row is the one with no implementation today, in either direction: no `deleteUser`, no ban, no
session invalidation. **It must be built as a command, not inferred from a row deletion.**

**5.3 — Removal must become a transition, not a delete (new).** `remove/route.ts:26-30` deletes the
membership row, which destroys the audit trail of the relationship along with the access. A lifecycle
that ends in a `DELETE` cannot answer "was this person ever an operator here, and who ended it?" —
which is the first question asked after any incident.

---

## 6. Methods, presentation, and the invariants this deliverable adds

### 6.1 Methods — organization-configurable, code-owned

Carried from §10 §3.3 with statuses re-verified this pass. A per-org `auth_policy` record selects from
a **code-owned catalog**: configuration steers, code owns which methods can exist and how each is
verified.

| Method | Status at `c667da4e2` (verified) | Target |
|---|---|---|
| Email + password | Implemented — `login/page.tsx:74` | retain; move policy server-side |
| Passwordless email link | **test-only** — `adminSessionAuth.ts:77` (+4 `web/scripts` fixtures) | promote to product |
| Email OTP | **test-only** — `adminSessionAuth.ts:88` | promote to product |
| SMS OTP | absent (`signInWithOtp` = 0 occurrences) | new; needed for parent/guardian reach |
| Google / Microsoft / Apple | absent (`signInWithOAuth` = 0 occurrences) | new |
| Enterprise SSO / SAML | absent | advanced; later wave (**D8**) |
| MFA policy by role/risk | absent (`mfa.` = 0 occurrences) | new; depends on §5 state and role |
| Session + trusted device | Supabase defaults, unversioned | new; per-org policy |
| Forced reset / recovery | reset only, no force | extend |
| **Step-up for password change** | **absent (§3.2)** | **new — I-29** |
| **Rate limit / lockout** | **absent in application code (§2.1)** | **new — must be asserted, not assumed** |

Policy fields: enabled methods, password rules (min length, complexity, reuse, expiry), MFA
requirement by role, session lifetime and idle timeout, trusted-device window, invitation validity
window and resend limits.

### 6.2 Presentation — the show/hide baseline

Carried unchanged from §10 §3.4 and re-verified: three password inputs
(`login/page.tsx:203`, `reset-password/page.tsx:157`, `:175`), **zero** reveal toggles. Build it once
as a shared password input so the guarantee is structural, and lock it with a test asserting no bare
`type="password"` outside that component. Defaults hidden; toggle is a real button with an accessible
label, keyboard reachable; never auto-reveals; revealed state never persisted or logged.

This remains the cheapest item in the corpus and should not be sequenced behind auth-method work.

### 6.3 Invariants added by this deliverable

Continuing the register in `02…:425-466` (I-1 … I-27):

| # | Invariant | Source |
|---|---|---|
| **I-28** | A credential-lifecycle command MUST be bounded by the caller's org; its target must resolve to a principal with a membership in `access.orgId`. | §3.1 |
| **I-29** | A password change MUST require step-up — current password, a fresh recovery-type session, or a second factor. Session presence alone MUST NOT authorize re-keying. | §3.2 |
| **I-30** | Retiring a principal MUST revoke: capabilities stop resolving, live sessions stop being honoured, and on last-org deactivation the credential is disabled by an explicit call. *(The E1-side twin of I-26.)* | §2.3, §5.2 |
| **I-31** | The verification mode of the request-identity path MUST be an asserted, tested property, not an inherited default of unversioned hosted configuration. | §3.3 |
| **I-32** | Admission MUST be a capability (`portal.access`) evaluated after authentication, and refusal MUST produce a distinct, actionable outcome. | §3.4 |
| **I-33** | Authentication error text MUST NOT surface provider strings verbatim; the sign-in path MUST match the anti-enumeration discipline already applied at `send-password-reset:35-37`. | §1, §3.1 |
| **I-34** | Password policy MUST be enforced server-side. A policy expressed only in a submit handler is advisory and MUST NOT be cited as a control. | §3.2 |

---

## 7. Decisions

`02…:552-553` delegates **D5–D8** to this document. They are re-anchored below, with recommendations
unchanged; §§2–3 strengthen the evidence for D6 in particular.

| # | Question | Recommendation | Status at this pass |
|---|---|---|---|
| **D5** | Does account state live per-org or per-account? | per-`(user, org)`; `locked` is per-credential and short-circuits every org, so an org admin cannot lock a credential they do not own | **open** — unchanged |
| **D6** | Does deactivation revoke the credential? | **yes.** Revocation must be explicit, never a side effect of deleting a role row | **open, and now the sharpest** — §2.1 shows no revocation call exists at all, so "yes" is a build, not a toggle |
| **D7** | MFA scope for the first wave? | operators first, policy-by-role; do not couple to parent/guardian, which depends on SMS OTP (itself new) | **open** — unchanged |
| **D8** | Is SSO/SAML in V2 at all? | specify the policy shape so it is not precluded; do not build it | **open** — unchanged |

**D6 and D10 are one question.** `02…:575-579` asks whether deactivating a *role* revokes; D6 asks
whether deactivating an *account* revokes. Both currently answer "no" through the same mechanism —
a state marked inactive that no resolver consults (§2.3). They should be decided in one sitting, and
**I-26 and I-30 implemented against one enforcement point**, or the platform will acquire a second
inactive-means-nothing flag.

Three decisions are new to this pass.

**D11 — Is the admin password-reset trigger bounded to the caller's org?**
Today it accepts any email address, with no membership check (§3.1). *Recommendation:* **bound it.**
Resolve the target to a principal with a membership in `access.orgId` and 404 otherwise, and move the
gate from the `ctx.role !== "admin"` literal to the capability helper every sibling route uses
(`canManageUsersAndRoles.ts:25`). This is small, independent of D5–D8, and should not wait for the
lifecycle work.

**D12 — What step-up does a password change require?**
Today: none (§3.2). *Recommendation:* require a recovery-type session for the reset flow, and the
current password for an in-session change — and split the two, because `/reset-password` currently
serves both from one unverified session check. Until this is decided, session possession is account
ownership.

**D13 — Which identity-verification mode is the platform's asserted contract?**
Local JWKS verification via `getClaims()`, or remote validation via `getUser()` (§3.3). *Recommendation:*
assert **local verification with asymmetric signing keys** and add a test that fails if the posture
changes — it keeps the performance benefit the fast path was built for while making the guarantee
explicit rather than inherited. This decision is a prerequisite for any statement about session
security in the acceptance rubric.

None of D5–D13 is worker-resolvable; all are recorded rather than assumed, per the mission's
document-authority rule.

---

## 8. Reproduce

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-vacilando-os-product-def   # @ c667da4e2
# `git grep` (not `grep -r`) — tracked files only, so vendored deps do not inflate the counts.

# §0 — no auth configuration is versioned
ls supabase/config.toml                                             # No such file or directory
git grep -lE "person_users|auth_polic|account_state|user_status|invitation" -- supabase/migrations/ | wc -l   # 0

# §0 — the method surface is one method
git grep -n "signUp(\|signInWithOtp\|signInWithOAuth\|mfa\." -- web/ | wc -l                            # 0
ls web/app | grep -iE "login|signup|portal|parent"                                                      # login
find web/app/api -type d -iname "*auth*" -o -type d -iname "*login*" | wc -l                            # 0

# §2.1 — no code path disables a credential
git grep -n "auth\.admin\.deleteUser\|auth\.admin\.updateUserById\|ban_duration\|failed_attempt" -- web/ | wc -l   # 0
git grep -n "lockout" -- web/                                       # 1 — a comment, remove/route.ts:20

# §6.2 — three password inputs, zero reveal toggles
git grep -n 'type="password"' -- web/ | wc -l                       # 3
git grep -n "showPassword\|revealPassword" -- web/ | wc -l          # 0

# §§2.2, 3.1, 3.2, 3.3 — read the four handlers
sed -n '1,40p'   web/app/api/admin/send-password-reset/route.ts
sed -n '1,35p'   web/app/api/admin/users/\[userId\]/remove/route.ts
sed -n '17,55p'  web/app/reset-password/page.tsx
sed -n '12,32p'  web/lib/admin/cachedAuthSession.ts
```

---

## 9. Limits

- **Static and file-grounded.** No authentication flow was executed, no live Supabase project
  inspected, no browser QA performed. Statements about Supabase-side configuration are inferences from
  the absence of `supabase/config.toml`, not readings of dashboard state.
- **A2-5 (§3.3) is deliberately conditional.** Whether `getClaims()` verifies locally depends on hosted
  signing-key configuration this repository does not contain. It is recorded as an unresolved property
  (D13), **not** as a defect, and MUST NOT be cited as a vulnerability without live verification.
- **A2-3's cross-tenant reach (§3.1) is reasoned from the handler, not demonstrated.** The absence of
  any membership lookup between `:15` and `:34` is verified; the resulting delivery behaviour was not
  exercised against a live Auth project.
- **A2-4's takeover chain (§3.2) is a reasoned composition** of a verified admission check
  (`reset-password:22-27`) and an unverified session posture (Supabase defaults). The code facts hold;
  the exploit path is not demonstrated.
- **§10 §2.6's session-survival claim remains undemonstrated**, and is carried with its original
  caveat. A live test should confirm before any of it is cited as a vulnerability.
- **§§4–6 are specification, not design.** No UI, schema, or migration is proposed at implementation
  fidelity; the §5.2 table states required effects, not a schema.
- **Rate limiting was verified absent from application code only.** Supabase may impose its own; that
  was not verified and MUST NOT be assumed.

---

## 10. Accepted artifact — preserved verbatim

> Below is the accepted deliverable from mission `msn_2d054741a54698fa4c` (2026-07-30), reproduced
> **unchanged**. It is authoritative for its own date and is the source of the target model carried
> forward above. Line-number drift since acceptance is tabulated in §1; §§2–3 supersede its §2.6
> emphasis.

---

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

---

## 11. Provenance — Mission 2 pass

- **Verified in** `wt6-vacilando-os-product-def` @ `c667da4e2`, read in this pass:
  `web/app/login/page.tsx`, `web/app/reset-password/page.tsx`, `web/app/forgot-password/page.tsx`,
  `web/app/api/admin/users/route.ts`, `web/app/api/admin/users/[userId]/remove/route.ts`,
  `web/app/api/admin/send-password-reset/route.ts`, `web/lib/admin/cachedAuthSession.ts`,
  `web/lib/admin/canManageUsersAndRoles.ts`, `web/lib/admin/operatorSessionGate.ts`,
  `web/middleware.ts`, `web/playwright/helpers/adminSessionAuth.ts`, `supabase/migrations/`.
- **Corpus inputs reused, not re-derived:** `../../../access-identity-v2/01-existing-state-inventory.md`
  (Mission 2 refresh — C6 §3.3, G4 §3.5, census §4, handoff §8);
  `../../../access-identity-v2/02-canonical-access-identity-model.md`
  (Mission 2 refresh — E1 five rules §3.2, M2-3/I-26 §4.4, D9 §10, D10 §10, invariant register §7);
  `./05-command-enforcement-census.md` (capability catalog).
- **Preserved:** §10 reproduces the accepted artifact verbatim; this QA path is runtime certification
  evidence (`PRODUCT-SOURCE.md`) and no accepted content was deleted.
- **No source, schema, migration, or UI was changed by this phase.**
