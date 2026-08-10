---
owner: platform
status: sprint
last_reviewed: 2026-08-10
supersedes: []
---

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
**Date** 2026-08-03 · **reopened and extended 2026-08-06** (§0 reopen block, §3.6, §3.7, §6.3 note,
§6.4, §7 `AD-22`/`AD-23`, §8 reopen block, §12) in `wt6-director-experience-dx5-5-continuation` @ `107a6217d`
**Method** static, file-grounded. Every current-state claim was opened and read in this pass and cites
`path:line` at `c667da4e2`. Claims reused without re-derivation are marked **[carried]**. No live
authentication flow was executed (§9).

> **Reopen (2026-08-06), on operator guidance.** Two directives, the same two that reopened
> `02-canonical-access-identity-model.md` at `107a6217d`: *the role hierarchy is still too deep — reduce
> to four layers*, and *simplify the role editor without changing the access architecture*.
>
> - **Directive 1 is answered here, on the authentication side.** `02…§1.3` restated the authority chain
>   as **four layers, two branches** (`L1` principal → `L2` membership → `L3` assignment → `L4` resolved
>   set). This pass locates authentication against that chain and finds that the chain is *not* four
>   layers at runtime: `portalEligible` is a **fifth layer** — a role-literal admission predicate that
>   sits between `L3` and `L4`, belongs to neither branch, and, at two gates, **satisfies a capability
>   check on its own**. §3.6.
> - **Directive 2 is bounded, not executed**, exactly as `02…§4.6` bounded it. This document does not own
>   an operator surface either. §6.4 states what any Access surface owes the *authentication* model —
>   `R6`–`R9`, continuing the register `02…§4.6` owns — and §3.7 records what the surface does today. The
>   redesign belongs to [`06-product-ia-and-flows.md`](./06-product-ia-and-flows.md).
>
> **No section, invariant, finding, decision or table is renumbered, reworded, or reinterpreted by the
> reopen.** §§0–11 keep their numbers and their citations; everything new is an appended subsection, a
> marked block, or a new row. §10 is untouched. Reopen claims are cited at `107a6217d`.

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

*Tally note (reopen).* The sentence above reads *"five new findings"* and the table lists **six**; §3.5
adds a seventh. The register is **A2-1 … A2-7**, which is how `01…:874` and `03…:2540` already cite it.
The count word is wrong, not the register — no finding is renumbered. The reopen adds **A2-8** and
**A2-9** (§3.6, §3.7), bringing it to **A2-1 … A2-9**.

### 0.1 Reopen block (2026-08-06) — the negatives hold, and one thing did change

Every §0 negative was re-run at `107a6217d` in `wt6-director-experience-dx5-5-continuation`
**[re-verified]**:

| Probe | At `c667da4e2` | At `107a6217d` |
|---|---|---|
| `supabase/config.toml` | absent | **absent** |
| `signUp(` · `signInWithOtp` · `signInWithOAuth` · `mfa.` in `web/` | 0 | **0** |
| `auth.admin.deleteUser` · `auth.admin.updateUserById` · `ban_duration` in `web/` | 0 | **0** |
| `showPassword` / `revealPassword` in `web/` | 0 | **0** |
| `type="password"` in `web/` | 3 | **3** — `login/page.tsx:206`, `reset-password/page.tsx:157`, `:175` |

Only one file drifted, and only by three lines: `login/page.tsx` (`signInWithPassword` `:74`→**`:77`**,
raw-error render `:80`→**`:83`**, redirect `:89-90`→**`:92-93`**, password input `:203`→**`:206`**). Every
other citation in §§1–7 is unchanged at `107a6217d`. **A2-1 through A2-7 all still hold.**

**What changed is the surface, not the substrate.** There is now an **Access → Security** chapter
(`web/components/adminV2/settings/access/AccessSecurityPage.tsx`, 72 lines) **[verified]** that names the
authentication product: Password *Available*; Google, Microsoft and SSO *Planned*; Sign-in Policies,
Sessions and Audit Log *Planned*. So §0's headline needs one word added, and it is not a retraction:

> **One way to log in, a chapter that names the authentication product, and still no authentication
> product behind it.** The Security chapter is *honest* — every absent method is labelled `Planned`, and
> the Audit Log card states outright that *"no events are fabricated for display"* (`:67`). But its
> catalog is a **hard-coded literal list of `<li>` elements**, not a projection of any per-org record.
> §6.1 asks for a code-owned catalog steered by an `auth_policy`; what exists is the catalog with no
> policy and no steering. See §3.7 and `R8` (§6.4).

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

### 3.6 A2-8 — `portalEligible` is the fifth layer, and it is also a capability bypass *(reopen, 2026-08-06)*

**This is the authentication side of the operator's "reduce to four layers" directive**, and it is the
one place in the corpus where authentication and the authority chain touch.

`02…§1.3` restates the chain as four layers and two branches: **L1** principal → **L2** membership →
**L3** assignment (`role_definitions` ∥ `user_access_profiles`) → **L4** resolved set (permission keys ∥
scope dimensions). Authentication's position in that chain is simple and worth stating once, because the
rest of this section depends on it:

> **Authentication establishes `L1` and nothing else.** It answers *are you who you claim* and produces
> an `auth.users.id`. It confers no membership, no assignment and no capability — which is E1 rule 4
> (*the link confers no authority by itself*, §4) stated from the credential end. Everything after `L1` is
> the authority chain's business, and authentication MUST NOT add a layer to it.

**At runtime, something does.** `portalEligible` is computed as a role-literal predicate —

```ts
const PORTAL_ROLES = new Set(["admin", "ops"]);                       // resolveAdminAccessCore.ts:18
…
const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r));     // :142, and again at :233
```

— and a second, independent definition of the same set exists at `resolveAdminPortalOrgCore.ts:7`, read
at `:98` **[verified]**. (That duplication is already `M2-5`/`I-22`'s subject; this section does not
re-derive it.) Seven modules consume the predicate decisively **[verified]**:

| Read site | What it does with the predicate |
|---|---|
| `adminRouteGate.ts:43` | denies with 403 when false — **admission** |
| `getAdminContext.ts:38` | denies when false — admission |
| `getAdminOrgContextLight.ts:51` | denies when false — admission |
| `entityLabelsServer.ts:21` | denies when false — admission |
| `getAdminAccessContext.ts:72` | gates the shell-context cache write |
| **`canReadAnalytics.ts:32`** | **`if (subject.portalEligible) return true;` — grants** |
| **`canManageUsersAndRoles.ts:58`** | **`if (!portalEligible && !canManageUsersAndRoles(access))` → the predicate alone passes — grants** |

The first four are admission: a filter on entry, which is defensible and is what `A2-6` (§3.4) already
described. The fifth gates a cache write and decides no authority. **The last two are not admission. They
are authority.** At those two gates the predicate is
*sufficient* — a principal holding the `admin` or `ops` string passes without the platform reading a
single permission key.

That is what makes it a layer rather than a filter, and it is a layer the schema does not have:

| | `L3` assignment | `L4` resolved set | `portalEligible` |
|---|---|---|---|
| Stored where? | `role_definitions` / `user_access_profiles` | `role_permission_grants` → keys | **nowhere — a literal in application code** |
| Org-scoped? | yes | yes | **no** — the set is global |
| In the catalog? | yes | yes | **no** — `PORTAL_ROLES` is not read from `role_definitions` |
| Which branch? | capability ∥ scope | capability ∥ scope | **neither** |

> **A2-8.** `portalEligible` is a **fifth layer**: authority that sits between `L3` and `L4`, is stored in
> no table, is scoped to no org, belongs to neither branch, and at two gates **satisfies a capability
> check on its own**. `02…§1.3`'s *"the chain is four layers deep; it MUST NOT be specified, drawn, or
> implemented as five"* is currently false of the implementation — and the fifth layer's entry point is
> the authentication path, which is why this document owns the finding.

**This corrects §3.5's account of who may mint a credential.** §3.5 cites the inner predicate
(`canManageUsersAndRoles.ts:16-17` — `admin` literal **or** `settings.users_roles`) as the invite gate.
The inner predicate is not the gate. The route wrapper is:

```ts
const { portalEligible, ...access } = b;                                  // :57
if (!portalEligible && !canManageUsersAndRoles(access)) { …403… }         // :58
```

`portalEligible` is true for `ops`. So **`ops` passes with or without the grant, and D9's question — does
the default seed grant `settings.users_roles` to `ops`? — does not decide the outcome on this path.** It
is decided one layer earlier, by a hard-coded string.

`requireUsersRolesManageAuth` guards **eight routes** **[verified]**: `admin/users` (invite),
`users/[userId]/role`, `users/[userId]/remove`, `users/[userId]/access-scope`,
`settings/users-roles/members`, `rbac/grants`, `rbac/roles`, `rbac/roles/[role_key]`. Every one of them
is reachable by the `ops` literal alone — including the two that write the org's **role catalog and
permission grants**. The seed's attempt to make `ops` lesser by withholding `admin.users.write` and
`admin.roles.write` (§3.5) is not merely defeated by those keys being unread; it is defeated *before*
they would be read.

**Direction matters.** `I-27` forbids one branch reading the other's output. This is the same category
error pointed a third way: a **role literal short-circuiting the capability branch it is supposed to feed**.
The four-layer restatement in `02…§1.3` is a specification fix; this is the implementation half, and the
instrument that closes it already exists in the plan — **`W-13`**, which replaces the `portalEligible`
leg with a `portal.access` capability. `canReadAnalytics.ts:29-30` says so in a comment **[verified]**.

> **`I-32`ᴮ is the four-layer instrument on the authentication side.** Making admission a capability is
> not a rename: it moves admission from a fifth layer into `L4`, where the chain already has a place for
> it. Two things must both happen or the layer survives the rename — see **`AD-22`** (§7).

> **`I-35`ᴮ (new).** An admission predicate MUST NOT satisfy a capability gate. Admission MAY deny entry;
> it MUST NOT, on its own, authorize a command. Every gate MUST read a permission key.

### 3.7 A2-9 — the Access surface is org-scoped; the credential commands under it are not *(reopen, 2026-08-06)*

**This is the authentication side of the operator's "simplify the role editor" directive.** `02…§4.6`
bounded that directive for role administration; the credential commands in the same workspace are this
document's, and they are bounded here and in §6.4.

The Access workspace has four chapters — `users`, `roles`, `scopes`, `security`
(`accessChapterRoutes.ts:10`) **[verified]**. Two of them carry authentication:

**Access → Users holds all three credential commands** (`AccessUsersConfigurationPage.tsx`, 770 lines)
**[verified]**: invite (`:205`, `POST /api/admin/users`), send password reset (`:278`,
`POST /api/admin/send-password-reset`), and remove (`:299`, `POST /api/admin/users/[userId]/remove`),
the last behind a two-step confirm (`:465-469`).

> **The org bound is a property of the selection model, not of the command.** The reset control can only
> send the email of a user the operator selected from the org's list — but `A2-3` (§3.1) establishes that
> the endpoint accepts **any** string (`send-password-reset/route.ts:15`), with no membership lookup
> before `:34`. The surface is org-scoped; the command is not. **A simplification of this surface cannot
> fix that, and a simplification that makes the surface look tighter will make it look fixed.** Two other
> call sites already post to the same endpoint from `legacy-admin` (`AccessControlClient.tsx`,
> `UsersClient.tsx`) **[verified]** — three callers, one unbounded command. `W-38`/`I-28`ᴮ is the fix, and
> it belongs to the API, not the chapter.

**What the surface gets right, and must keep getting right.** Removal reports itself as removal —
*"…removed from this organization."* (`:304`) **[verified]**. It does not say *revoked*, *deactivated*, or
*disabled*, and given §2.1 (no code path disables a credential) and §2.3 (three levers, none revokes),
that restraint is the surface telling the truth about the model. It is also the single easiest thing for
a simplification to break: collapsing "remove from organization" into a tidier "Remove access" or
"Deactivate" is a **wording** change that would make the product claim a capability it does not have.
That is `R6` (§6.4).

**Access → Security is a catalog with no policy behind it.** `AccessSecurityPage.tsx` **[verified]**
declares Password *Available*, Google / Microsoft / SSO *Planned*, and Sign-in Policies, Sessions and
Audit Log *Planned*, under a chapter described as *"Authentication methods, account security, and access
auditing"* (`accessChapterRoutes.ts:27-29`). Three observations, in descending order of comfort:

1. **It is honest, and deliberately so.** Every absent method is labelled `Planned`; the Audit Log card
   states *"No events are fabricated for display"* (`:67`). Measured against the rest of this document,
   that is the correct posture and should be preserved by name.
2. **The catalog is a hard-coded list of `<li>` elements** (`:19-44`), not a projection of a per-org
   record. §6.1 specifies a code-owned catalog *steered by* an `auth_policy`; what exists is the catalog
   with nothing steering it. Each `Available`/`Planned` badge is hand-maintained and will drift from the
   code the first time a method lands — and the drift will be invisible, because nothing derives one from
   the other. That is `R8` (§6.4) and `AD-23` (§7).
3. **`Password — Available` is org-wide language for a setting that is not per-org.** There is no
   `supabase/config.toml` and no `auth_policy` (§0), so the badge describes the platform, not the
   organization, on a chapter scoped to one. Meanwhile the chapter promising *"account security"* sits
   above three password inputs that still have **zero** reveal toggles (§0.1, §6.2) — the cheapest item in
   the corpus, now with a surface that advertises it.

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
| **I-28**ᴮ | A credential-lifecycle command MUST be bounded by the caller's org; its target must resolve to a principal with a membership in `access.orgId`. | §3.1 |
| **I-29**ᴮ | A password change MUST require step-up — current password, a fresh recovery-type session, or a second factor. Session presence alone MUST NOT authorize re-keying. | §3.2 |
| **I-30**ᴮ | Retiring a principal MUST revoke: capabilities stop resolving, live sessions stop being honoured, and on last-org deactivation the credential is disabled by an explicit call. *(The E1-side twin of I-26.)* | §2.3, §5.2 |
| **I-31**ᴮ | The verification mode of the request-identity path MUST be an asserted, tested property, not an inherited default of unversioned hosted configuration. | §3.3 |
| **I-32**ᴮ | Admission MUST be a capability (`portal.access`) evaluated after authentication, and refusal MUST produce a distinct, actionable outcome. | §3.4 |
| **I-33**ᴮ | Authentication error text MUST NOT surface provider strings verbatim; the sign-in path MUST match the anti-enumeration discipline already applied at `send-password-reset:35-37`. | §1, §3.1 |
| **I-34**ᴮ | Password policy MUST be enforced server-side. A policy expressed only in a submit handler is advisory and MUST NOT be cited as a control. | §3.2 |
| **I-35**ᴮ **[reopen]** | An admission predicate MUST NOT satisfy a capability gate. Admission MAY deny entry; it MUST NOT, on its own, authorize a command. Every gate MUST read a permission key. | §3.6 |

#### The ᴮ superscript, and the collision it marks *(reopen, 2026-08-06)*

**Nothing above is renumbered or reworded.** The superscript is a disambiguating mark, added because this
document is the one that *originates* the `ᴮ` side of an already-tracked corpus defect and was the only
document still printing the numbers bare.

When §6.3 was written, `02…` ended at `I-27`. `02…` Part II subsequently added its own **`I-28` … `I-31`**
(`02…:472-475`), so seven numbers now denote two invariants each. The corpus records this as **`X-1`**
(`03…:2821`, **open**) and resolves it in citation by superscript — `ᴬ` for `02…` Part II, `ᴮ` for this
document — throughout `01…§18` and `03…§23.4`/`§25`. `03…:2620-2630` maps each side to a different
workstream, and `03…:2633` notes that *"each colliding pair lands in a different wave, so a lock written
against a bare `I-29` would be run in the wrong one."* This pass makes the mark local, so the register and
its citations agree.

> **The reopen extends the collision by one, and the extension is new.** `02…`'s own reopen at `107a6217d`
> added **`I-32` — "a role-administration surface adds and removes no model structure"** (`02…§4.6`).
> `X-1` is scoped in `03…:2821` to *"`I-28`…`I-31`"*; it is now **`I-28`…`I-32`**. Two live citations of a
> bare `I-32` — `03…:997` (quoting the admission wording) and `03…:2628` (*"`I-32` admission is a
> capability → `W-13`"*) — both mean **`I-32`ᴮ**, this document's, and both now read ambiguously.
> **`03-implementation-qa-sequence.md` should widen `X-1` and superscript those two lines.** That file is
> outside this assignment's scope and was not modified. `I-35`ᴮ is chosen above `02…`'s current ceiling
> and does not collide today, but it will if `02…` continues its own sequence — which is the argument for
> resolving `X-1` rather than living with it.

### 6.4 What an access surface owes the authentication model *(reopen, 2026-08-06)*

`02…§4.6` states what a role-administration surface must preserve — `R1`–`R5` and `I-32`ᴬ — and stops
there, correctly, because `02…` does not own a surface. **Neither does this document.** What follows is
the same construction for the credential half: obligations any Access surface must satisfy, so that
*simplify the editor* and *do not change the access architecture* can be checked against the model rather
than judged by eye. **No surface is designed here.** The redesign belongs to
[`06-product-ia-and-flows.md`](./06-product-ia-and-flows.md).

These continue the register `02…§4.6` owns; `02…` holds `R1`–`R5`, this document appends `R6`–`R9`. Each
is a projection of a rule already stated above — **none is new policy.**

| # | An Access surface… | Because | Rule |
|---|---|---|---|
| **R6** | **MUST NOT** describe removing a membership, or changing a role, as revoking, deactivating, disabling or ending access — while §2.1 holds, the surface's honest wording (`:304`) is load-bearing | no code path disables a credential; three levers, none revokes | §2.1, §2.3, `I-30`ᴮ |
| **R7** | **MUST NOT** rely on its selection model for the org bound of a credential command; the bound MUST hold when the endpoint is called directly | the surface is org-scoped, `send-password-reset` is not | §3.1, §3.7, `I-28`ᴮ |
| **R8** | **MUST NOT** present an authentication method, policy or state as organization-level unless a per-org record backs it; `Available`/`Planned` MUST derive from the catalog, not from hand-maintained markup | §6.1's catalog exists with nothing steering it | §3.7, §6.1, `AD-23` |
| **R9** | **MUST NOT** expose a per-user security control whose gate is admission rather than a capability | admission is not authority | §3.6, `I-35`ᴮ, `I-32`ᴮ |

> **`R9` is the constraint violated today, and — as with `02…§4.6`'s `R3` — by the API rather than by the
> UI.** Access → Users' three credential commands sit behind `requireUsersRolesManageAuth`, which passes
> on the `portalEligible` literal alone (§3.6). A surface built on those endpoints **cannot** satisfy `R9`
> however it is drawn. *"Simplify the editor"* and *"do not change the access architecture"* are therefore
> jointly satisfiable on the credential half only if **`W-13`** (admission becomes `portal.access`) and
> **`W-38`** (the credential-mail primitive is bounded) land before, or with, any redesign of the Users or
> Security chapters — the exact shape of the argument `02…§4.6` makes for `W-17` and the Roles chapter.

**Escalated, not answered.** The operator directive that prompted this section is a directive to a
**surface**, and no surface is owned here. What `04` can do is bound the credential half: that is `R6`–`R9`,
`I-35`ᴮ, and the sequencing constraint above. **No UI code, route, component, or test was changed by this
pass.**

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

### 7.1 Two decisions from the reopen — and why they are not `D14` and `D15` *(reopen, 2026-08-06)*

**The `D`-series is closed to this document.** `D14` is already occupied by `01…§19` (*abuse control*)
**[verified]**, and `D11`ᴮ–`D13`ᴮ — all owned by this document — are the three live collisions `02…§26.1`
tabulates. `02…§26.2` proposes retiring the series into `AD-n` (`D11`ᴮ→`AD-15`, `D12`ᴮ→`AD-16`,
`D13`ᴮ→`AD-17`, `D-IA1…4`→`AD-18…21`), and `03…` **already cites the `AD-n` form** in its workstream
headers (`W-24` *needs `AD-11`*, `W-38` *needs `AD-15`*, `W-27` *needs `AD-16`*, `W-34` *needs `AD-17`*)
**[verified]**. `02…§30`'s `X-7` records that *"no downstream artifact binds to a colliding decision
number — a window, not yet a debt."* **Minting a fresh `D14`/`D15` from here would close that window and
add a fourth and fifth collision.**

So the two reopen decisions are minted at **`AD-22`** and **`AD-23`**. `AD-n` runs to `AD-21` in the
corpus **[verified]**, so these are free *under both schemes*: they collide with nothing today, and they
collide with nothing if `02…§26.2` is ratified. Neither is worker-resolvable.

**`AD-22` — Does admission collapse into `L4`, and does any role literal remain sufficient for a
capability gate?**
Two questions that must be answered together, because answering only the first leaves the fifth layer
intact under a new name (§3.6). *Recommendation:* **yes, and no.** `W-13` must do both — introduce
`portal.access` **and** delete the `portalEligible` short-circuits at `canReadAnalytics.ts:32` and
`canManageUsersAndRoles.ts:58`. Renaming the predicate while leaving it *sufficient* at those two gates
would satisfy the letter of `I-32`ᴮ and none of `I-35`ᴮ, and the chain would still be five layers deep at
runtime while every document in the corpus said four. **This is the decision the operator's "four layers"
directive actually turns on.** It is a scope question for `W-13`, which today is written as an admission
change only.

**`AD-23` — Does the Security chapter's method catalog become derived before more methods are listed?**
Access → Security hand-maintains `Available`/`Planned` badges with no per-org record behind them (§3.7).
*Recommendation:* **freeze the literal list** at its current four methods until §6.1's `auth_policy` and
code-owned catalog land, then derive the badges from it. Adding a method to the markup is a five-minute
change that makes the product assert an organization-level capability the platform does not have; the
chapter is honest today and this keeps it honest by construction rather than by diligence. Independent of
`AD-22` and of `D5`–`D8`.

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

### 8.1 Reopen block (2026-08-06)

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt6-director-experience-dx5-5-continuation   # @ 107a6217d

# §0.1 — every negative re-run; all still zero, all still absent
ls supabase/config.toml                                                         # No such file or directory
git grep -c "signUp(\|signInWithOtp\|signInWithOAuth\|mfa\." -- web/             # no matching files
git grep -n "auth\.admin\.deleteUser\|auth\.admin\.updateUserById\|ban_duration" -- web/ | wc -l   # 0
git grep -n "showPassword\|revealPassword" -- web/ | wc -l                       # 0
git grep -n 'type="password"' -- web/                                            # 3 — login:206, reset:157, :175

# §0.1 — the only drift: login/page.tsx moved +3
git grep -n "signInWithPassword" -- web/app/login/page.tsx                       # :77  (was :74)
sed -n '75,95p' web/app/login/page.tsx                                           # raw error :83; redirect :92-93

# §3.6 — the fifth layer: two definitions, seven read sites, two of them grants
git grep -n "PORTAL_ROLES" -- web/lib          # resolveAdminAccessCore.ts:18,30,142,233; resolveAdminPortalOrgCore.ts:7,98
git grep -n "portalEligible" -- web/lib         # 7 read sites across 6 modules
sed -n '29,35p' web/lib/admin/canReadAnalytics.ts          # :32 — `if (subject.portalEligible) return true;`
sed -n '52,62p' web/lib/admin/canManageUsersAndRoles.ts    # :57-58 — the predicate alone passes
git grep -ln "requireUsersRolesManageAuth" -- web/app                            # 8 routes

# §3.7 — the surface: credential commands, and the catalog with no policy
git grep -n "ACCESS_WORKSPACE_CHAPTERS" web/lib/access/accessChapterRoutes.ts    # :10 — users, roles, scopes, security
git grep -n "send-password-reset\|/remove\|/api/admin/users" -- web/components/adminV2/settings/access/AccessUsersConfigurationPage.tsx
git grep -ln "send-password-reset" -- web/                                       # 3 callers, 2 of them legacy-admin
cat web/components/adminV2/settings/access/AccessSecurityPage.tsx                # 72 lines; the <li> catalog at :19-44

# §6.3, §7.1 — the numbering facts the reopen depends on
git grep -n "X-1" docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md   # :2821 — scoped I-28…I-31
git grep -n "I-32" docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md  # :997, :2628 — both bare, both mean I-32ᴮ
git grep -o "AD-[0-9]\+" -- docs/platform/planning | sort -u -V | tail -1        # AD-21 — so AD-22/AD-23 are free
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

---

## 12. Reopen (2026-08-06) — what it answered, what it bounded, and what it did not touch

### 12.1 The two directives

| Directive | Disposition | Where |
|---|---|---|
| *Role hierarchy is still too deep — reduce to four layers* | **Answered on the authentication side.** The chain is four layers in the schema (`02…§1.3`) and **five at runtime**: `portalEligible` is a fifth layer that, at two gates, satisfies a capability check on its own. The instrument that removes it is `W-13`, and `AD-22` is the scope question `W-13` must answer to actually remove it | §3.6, `I-35`ᴮ, `AD-22` |
| *Simplify the role editor without changing the access architecture* | **Bounded, not executed** — the same disposition `02…§4.6` reached, for the same reason: no surface is owned here. `R6`–`R9` state what an Access surface owes the authentication model; §3.7 records what it does today | §3.7, §6.4, `AD-23` |

**Neither directive was discharged as a product change, and no editor was simplified.** The redesign
belongs to [`06-product-ia-and-flows.md`](./06-product-ia-and-flows.md).

### 12.2 What the reopen added

`A2-8`, `A2-9` (§3.6, §3.7) · `I-35`ᴮ (§6.3) · `R6`–`R9` (§6.4) · `AD-22`, `AD-23` (§7.1) · the ᴮ
superscript on `I-28`ᴮ–`I-34`ᴮ · re-verification of every §0 negative at `107a6217d` (§0.1) · one
correction to §3.5's account of the invite gate (§3.6) · two tally notes (§0, §6.3).

**Nothing was renumbered, reworded, or reinterpreted.** Every existing section, finding, invariant,
decision and table keeps its number and its wording; §10 is untouched.

### 12.3 Limits specific to the reopen

These are **in addition to** §9, which stands unchanged.

- **Still static, still no live authentication.** No flow executed, no Supabase project inspected, no
  browser opened. `A2-8`'s gate behaviour is read from source, not exercised against a running app.
- **§3.6's eight-route claim is a call-graph reading, not a runtime trace.** `requireUsersRolesManageAuth`
  was verified to admit on `portalEligible` alone (`:57-58`) and its eight importers were enumerated
  (`git grep -ln`). Whether each route has a *second*, inner gate that would independently deny an `ops`
  caller **was not checked route-by-route** — only `admin/users`'s inner predicate was read (§3.5). The
  claim *"reachable by the `ops` literal alone"* is therefore established **at the shared wrapper** and
  should be confirmed per route before it is cited as an exploit rather than a gate defect.
- **§3.7 constrains a surface it did not review.** The reopen read the chapter definition, the Security
  chapter in full (72 lines), and the credential-command call sites in the Users chapter — **not** the
  Users chapter's 770-line component tree, and not the Roles chapter at all. `R6`–`R9` are stated as
  obligations on **any** surface; only `R9` is asserted as violated today, and on API evidence
  (`canManageUsersAndRoles.ts:57-58`) rather than UI evidence. **Whether the current chapters satisfy
  `R6`, `R7` or `R8` was not determined** and must not be inferred from §3.7.
- **`AD-22`/`AD-23` are minted against a numbering scheme that is proposed, not ratified** (`02…§26.2`).
  They are free under both schemes (§7.1), so the mint is safe either way — but if `02…§26.2` is rejected
  in favour of some third scheme, they travel with it.
- **The `I-32` collision is reported, not fixed.** `03…` needs to widen `X-1` and superscript `:997` and
  `:2628`. That file is outside this assignment's scope and **was not modified** (§6.3).
- **Two cited corpus files have uncommitted working-tree changes**, so citations into them are against the
  **working tree**, not against `107a6217d`: `01-existing-state-inventory.md` (+275 lines) and
  `05-command-enforcement-census.md` (+282 lines) **[verified via `git diff --stat`]**. Every `01…:n`
  citation added by the reopen — `:874`, `:1201`, `:1286`, `:1355` in §6.3 and §12.4 — is a working-tree
  line number and **will drift when that work is committed**. Citations into `02…` and `03…` are against
  `107a6217d`, which is clean for both files.

### 12.4 Provenance — reopen pass

- **Read at `107a6217d` in `wt6-director-experience-dx5-5-continuation`:**
  `web/lib/admin/resolveAdminAccessCore.ts`, `web/lib/admin/resolveAdminPortalOrgCore.ts`,
  `web/lib/admin/canReadAnalytics.ts`, `web/lib/admin/canManageUsersAndRoles.ts`,
  `web/lib/admin/adminRouteGate.ts`, `web/lib/admin/getAdminAccessContext.ts`,
  `web/lib/access/accessChapterRoutes.ts`,
  `web/components/adminV2/settings/access/AccessSecurityPage.tsx` (in full),
  `web/components/adminV2/settings/access/AccessUsersConfigurationPage.tsx` (credential-command call
  sites only), `web/app/login/page.tsx`, `web/app/reset-password/page.tsx`,
  `web/app/api/admin/send-password-reset/route.ts`, `web/app/api/admin/users/route.ts`,
  `web/app/api/admin/users/[userId]/remove/route.ts`, `web/middleware.ts`,
  `web/lib/admin/operatorSessionGate.ts`, `web/lib/admin/cachedAuthSession.ts`.
- **Corpus inputs reused, not re-derived:**
  `../../../access-identity-v2/02-canonical-access-identity-model.md` (§1.3's four-layer restatement and
  `M2-16`; §4.6's `R1`–`R5` and `I-32`ᴬ; §26's decision-collision analysis — all read, none re-derived),
  `../../../access-identity-v2/01-existing-state-inventory.md` (§18 and §30 — the ᴬ/ᴮ convention and the
  `D13` collision), `../../../access-identity-v2/03-implementation-qa-sequence.md` (`W-13`, `W-17`,
  `W-38`, the `X-1` scope line, the `AD-n` citations).
- **No file outside this document was modified.** No source, schema, migration, UI, test or sibling
  corpus document was changed by the reopen.
