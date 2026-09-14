---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 03 — Surface contracts: Applications, Installations, Credentials, Activity

What each surface shows, what it lets someone do, and what it must never do.
None of this is implemented (§01); these are the contracts Slice B builds to.

## Installation Collection (the landing)

**Template B, Collection Runtime.** Leads with Attention, not inventory.

| Shows | Per row |
|---|---|
| Provider/application name in operator language | "Classroom Coach" |
| Connection state | Active · Suspended · Degraded · Never used |
| Boundary summary | "Downtown Campus, Riverside" or **"No locations — inactive"** |
| Health | Last successful call, or the current failure class |
| Attention | Credential expiring, auth failing, boundary empty, scopes ungranted |

**Empty state does real work.** It explains Application → Installation →
Credential → `/api/v1` in three lines and offers one action. It is the first
place most operators will meet the model, so it is documentation, not decoration.

## Installation Runtime (the object)

Four owned concerns. Not tabs for their own sake — each is a distinct question.

### Authority
Granted scopes and location boundary. Both **default to empty, and empty denies**.
Changing either is an audited act. Shows the effective intersection in plain
language: *"May record attendance at Downtown Campus."* Never shows the raw
intersection algebra to an operator.

### Credentials
See below.

### Activity
See below.

### Application
Identity facet: name, publisher, ownership mode, environment, `client_id`.
Read-only for `partner_managed`; editable for `tenant_private`.

### Lifecycle actions
**Suspend** — reversible, kills all outstanding tokens immediately (opaque tokens
make this real). **Revoke/uninstall** — terminal; credentials revoked, webhook
subscriptions deleted, **audit rows and `integration_resource_refs` retained**,
references marked `orphaned` rather than deleted, because deleting them destroys
the record of what was synced and makes a reinstall duplicate silently.

## Applications

**No tenant-facing collection in V1** (§02). Application administration is an
Alloy-internal surface. What a tenant sees is the Application facet of its own
installation.

Rationale: an application is not tenant-owned, and a partner-managed application
is not something an operator configures. Surfacing a collection of applications
to every tenant would publish a concept they cannot act on.

## Credentials

The security-critical surface. Thread 4's constraints are binding here and are
**not** relaxed for UI convenience.

| Action | Contract |
|---|---|
| **Issue** | Operator supplies a label. Server generates 256-bit secret. |
| **Reveal** | **Exactly once**, at creation. Never retrievable afterwards, by anyone, through any surface. |
| **Rotate** | Issues a secondary secret with an explicit expiry; both valid until it lapses. The UI must show *both* and the deadline — a rotation whose expiry is invisible is a future outage. |
| **Revoke** | Immediate. Outstanding tokens die with it. |
| **Show** | Label, `client_id`, status, created, `last_used_at`, expiry. **Never the secret, never a prefix of it.** |

**The reveal-once rule needs product support, not just a warning.** The UI must
make it obvious that closing the dialog is irreversible, and offer copy — because
the alternative behaviour operators adopt is storing the secret somewhere worse.

**Prior art to follow, not rebuild:** `org_provider_credential_*` already solves
the never-re-readable problem for outbound credentials — its API layer "deals in
`hasCredential` booleans" so a secret cannot be serialized back. The inbound
credential surface adopts the same posture.

## Activity / Health

**This surface has no data source today** (§01): `logAdminAudit` is a
`console.log` and no audit table exists. It cannot be built before Thread 4
security prerequisite #1.

When built, the minimum useful record is:

```text
timestamp · operation · result · status code
installation · application · request_id
error class (not error detail)
```

### PII rule — binding

> **The activity surface must not display child, guardian or staff personal
> data.** It shows *that* an operation touched a subject, by opaque resource id,
> never who the subject is.

A developer debugging a 403 needs the scope that failed and the `request_id`.
They do not need a child's name, and a surface that shows it turns an integration
log into an unaudited PII disclosure channel readable by anyone holding
`integrations.manage`.

It must answer *"why is my integration not working?"* without database access —
so error **classes** are first-class and specific: `forbidden_scope`,
`forbidden_resource`, `idempotency_conflict`, `rate_limited`. That is the whole
value of the surface.
