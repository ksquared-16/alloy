---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 02 — Identity, installation, credential (Phases B, C, D, E)

## B. The four primitives — ratified

V1 uses four primitives with these canonical names. Alternatives considered:
*Integration Application*, *API Client*, *Service Principal*, *Partner
Application*.

| Primitive | Is | Is not |
|---|---|---|
| **Developer Application** | A stable identity for a piece of software. Owned by a publisher. Exists independently of any tenant. | Not a tenant object. Not a credential. |
| **Installation** | One application's presence **inside exactly one organization**, carrying granted scopes and a resource boundary. | Not an identity. Not shared across orgs. |
| **Credential** | Authentication material bound to **one installation**. | Not an identity. Not portable between installations. |
| **Application Principal** | The authenticated runtime identity Alloy **derives** per request. Never asserted by the caller. | Not a stored row. Not a user. |

**Rejected: "API Client"** — it names the transport, not the actor, and it gives
no word for the tenant binding, which is the part that carries authority.
**Rejected: "Service Principal"** — it collides with the Azure/AD meaning most
partners already hold, which implies directory membership Alloy does not have.

**One set of primitives serves every ownership mode.** Tenant-private and
partner-managed applications differ only by `ownership_mode` and
`distribution_mode` — not by having separate tables or separate auth paths. A
second mechanism for "our own apps" is how a platform acquires a bypass.

Ownership modes for V1: `tenant_private`, `alloy_managed`, `partner_managed`.
`public_marketplace` is reserved and **not built**.

## The decisive prior art

Alloy already has a non-human principal type:

```ts
// web/lib/childcareOperational/attendance/attendancePermissions.ts:63
export type NonHumanProducerAuthority = {
    producerKey: string;
    allowedSiteLocationIds: readonly string[];
    grantedPermissionKeys: readonly string[];
};
```

Its gate, `assertNonHumanCaptureAllowed` (`:213`), denies on three independent
axes — unregistered producer, missing permission, site out of scope — and returns
coarse reasons so a probe cannot distinguish "unknown" from "revoked".

**Decision: the Application Principal resolves into this shape, generalized.**
The Developer Platform becomes the *second* minter alongside
`kioskDeviceAuthority.ts`. The type is promoted out of the attendance module to
`web/lib/platform/principal/` as `PlatformPrincipalAuthority`, with
`allowedSiteLocationIds` generalized to a resource boundary (§03) and attendance
keeping a narrow adapter so its gate is unchanged.

**Why this and not a new model:** the architectural law forbids a second identity
system. More concretely, `kioskDeviceAuthority`'s header records that the gate
was left deliberately unreachable until a trustworthy minter existed. Minting
into that same gate means the Developer Platform inherits an authorization seam
that was designed, reviewed and defended — instead of standing up a parallel one
that must earn that trust from zero.

## C. Installation and tenant binding — ratified

| Question | V1 answer |
|---|---|
| Who may install? | A member holding the new capability **`integrations.manage`**. Installing grants machine authority, so it is gated at least as strongly as granting a role. |
| Is installation explicit? | **Yes.** Never implied by credential creation. |
| One application → many installations? | **Yes**, at most one per organization. |
| One installation → many orgs? | **No.** Fail closed. |
| Credentials installation-specific? | **Yes.** |
| One credential across orgs? | **Never.** |
| How is `org_id` resolved? | Credential → installation → `org_id`. **Read from the row.** |
| How are scopes granted? | At install time and amendable after; always a subset of what the application requests. |
| Resource restrictions? | Granted on the installation (§03). |
| Suspension | `status = suspended` → every token fails immediately. |
| Revocation / uninstall | Installation revoked; credentials revoked; webhook subscriptions deleted. |
| What survives | **Audit rows and resource references survive.** References are marked orphaned, never deleted — deleting them destroys the record of what was synced and makes a reinstall silently duplicate. |

### The tenancy law

> **No external request may obtain tenant authority from a caller-selected
> `org_id`.**

The trust layer resolves the tenant from the credential. A request body or query
`org_id` is not consulted; if one is present and contradicts the installation, the
request is **rejected**, not silently ignored.

This is not a theoretical guard. Thread 3 proved (SEC-0c) that
`POST /api/admin/workflows/[id]/run` passes a body-supplied `org_id` into an
engine that resolves payload-org-first, letting a caller choose both tenant and
table. The kiosk path gets this right for the same reason and says so: *"a kiosk
request cannot name the tenant it wants to be."* The public platform inherits the
kiosk's posture, not the workflow route's.

## D. Machine authentication — ratified

**Decision: OAuth 2.0 client credentials grant, exchanging `client_id` +
`client_secret` for a short-lived, server-validated opaque access token.**

```text
POST /api/public/v1/oauth/token
  grant_type=client_credentials, client_id, client_secret
        ↓
  access_token (opaque, 15 min), token_type=Bearer, expires_in, scope
        ↓
Authorization: Bearer <token>   on every Public API request
```

### Why not a long-lived API key (option A)

A long-lived key is replayed on **every** request — into every proxy log, every
partner's error tracker, every support ticket paste. Its compromise window equals
its lifetime. The client-credentials shape keeps the long-lived secret in one
place (the token endpoint), where it can be rate-limited and monitored hard,
while the credential actually carried on the wire expires in minutes.

### Why not signed JWT client assertion (option C)

It is stronger — no shared secret ever transmitted — and it is the **V2 upgrade
path for high-assurance partners**. It is wrong for V1 because it requires every
partner to manage a keypair, and V1's population is one contracted partner plus
operator-built tenant apps. The model must not preclude it: the token endpoint
accepts a `grant_type` and additional grants are additive.

### Token format: opaque, not JWT — and this is the load-bearing decision

A self-contained JWT carries its scopes frozen at mint time, so revoking it needs
a denylist — which is a database lookup on every request. **If a lookup is
happening anyway, an opaque token gets instant revocation for the same cost.**

Alloy has a specific reason to care. Thread 3 found
`invalidateAdminShellContextCache` has **zero production call sites** and a 120
second TTL, so authority changes already take up to two minutes to bite
internally. Issuing self-contained external tokens would export that staleness to
partners and make it worse — a revoked installation would keep working for the
token's full life. Opaque tokens make "suspend the installation" mean *now*.

### Credential lifecycle — specified

| Concern | Decision |
|---|---|
| Issuance | On an existing installation, by a member holding `integrations.manage`. |
| Client identity | `client_id`, non-secret, stable, safe to log. |
| Secret generation | 256 bits from a CSPRNG. |
| Storage | **SHA-256 hash**, used as an equality selector on a unique index. |
| Why not bcrypt/argon2 | Those exist to slow brute force against *low-entropy human* secrets. A 256-bit random secret is not brute-forcible; a slow KDF on the hot token path would buy nothing and cost latency. This is the reasoning `kioskDeviceAuthority` already applies, and the same absence of a per-byte comparison removes the timing channel. |
| Display-once | Yes. The plaintext secret is returned exactly once, at creation, and is unrecoverable. |
| Secret expiry | Optional `expires_at`; absent means non-expiring. |
| Token expiry | **15 minutes.** |
| Rotation | **Two active secrets per credential** (primary + secondary), the outgoing one bounded by an explicit `expires_at`. |
| Why overlap, when kiosk refuses it | `kioskCredentialRotation.ts` omits overlap deliberately, and states the condition under which it would be justified: *"a fleet that cannot be reconfigured at once — and none of that exists yet."* For external partners that fleet demonstrably exists; a partner cannot redeploy in the same instant Alloy rotates. The precedent's own reasoning licenses the deviation, and the bound (an explicit expiry, not an open window) is what keeps it from becoming "two permanently valid secrets". |
| Revocation | Immediate; outstanding access tokens die with it. |
| Last-used tracking | `last_used_at` on the credential, plus `last_seen_ip_hash`. |
| Compromise response | Revoke credential → all its tokens invalid within one request. Suspending the installation is the wider blast-radius control. |
| Naming | Operator-supplied label per credential, so "which key is this" is answerable. |
| Environment separation | `environment` on the application: `sandbox` \| `production`. A sandbox credential can never resolve a production installation. |
| Audit events | `credential.created`, `.rotated`, `.revoked`, `.used_first_time`, `installation.created`, `.scopes_changed`, `.suspended`, `.revoked`. All durable (§06). |

### Kiosk credentials are not reused

Evaluated as Phase D requires. **They do not satisfy the general contract**, and
the mismatch is structural rather than incidental: a kiosk credential is bound to
**one site** and carries a fixed producer identity for a physical appliance in a
lobby. It has no notion of an application, an installation, a scope grant, or a
token exchange, and its rotation deliberately has no overlap window.

What is reused is the part that generalizes: the hashed-lookup shape, the coarse
refusal vocabulary, the org-from-the-row law, and above all the
`NonHumanProducerAuthority` gate it mints into.

## E. Delegated human actor — ratified

**V1 is application-only.** `delegated_actor_id` is always `null`. No delegated
OAuth, no user consent screen, no authorization-code grant.

**But it is modeled from day one.** Every request context and every audit row
carries these five fields independently, because retrofitting an actor dimension
into an audit trail after the fact makes the pre-existing rows permanently
ambiguous:

```text
application_id      installation_id     delegated_actor_id (nullable)
origin              provenance
```

V1 reference case:

```text
application = attendance_partner
installation = Firefly / Attendance Partner
delegated_actor = null
origin = api
provenance = integration_api
```

Future, unlocked without schema change:

```text
application = tenant_mobile_app
installation = Firefly / Mobile App
delegated_actor = user_x
origin = api
provenance = tenant_mobile_app
```

**Law: a delegated actor may only ever narrow authority, never widen it.** The
effective authority of a delegated request is the intersection of the
installation's grant and the human's own — never the union. Building it the other
way is how an application becomes a privilege-escalation path for its users.
