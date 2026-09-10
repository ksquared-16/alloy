---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Alloy Developer Platform — ratified V1 architecture

**Thread 4 of the Documentation & APIs program.** This is a specification, not an
implementation. Nothing here is built yet; every document states what V1 **is**,
not what it might be.

## The question this answers

> How does a tenant-controlled or partner-controlled application authenticate to
> Alloy, receive bounded authority inside one tenant, read canonical resources,
> invoke governed capabilities, receive change events, and remain compatible over
> time — without depending on Alloy's internal UI transport or database
> implementation?

## The architectural law

> **The Developer Platform is an installation-scoped external trust and
> compatibility layer over existing Alloy domain authority.**

It adapts to authority that already exists. It does **not** introduce a second
identity system, a second permission universe, a second mutation runtime, a
second event truth, external table CRUD, public queue or ViewModel contracts, or
partner-specific bypasses.

## The finding that shaped V1

Thread 3 concluded Alloy has no external application principal. That is correct.
But Thread 4 found that Alloy **already has a non-human principal type and an
authorization gate built to receive it**:

```ts
export type NonHumanProducerAuthority = {
    producerKey: string;
    allowedSiteLocationIds: readonly string[];
    grantedPermissionKeys: readonly string[];
};
```

`web/lib/childcareOperational/attendance/attendancePermissions.ts:63`, gated by
`assertNonHumanCaptureAllowed` at `:213`.

This type **already separates capability (`grantedPermissionKeys`) from resource
boundary (`allowedSiteLocationIds`)** — precisely the separation a developer
platform needs, and precisely what a naive design gets wrong by minting
`attendance.location_A.write`.

It has exactly one minter today: `kioskDeviceAuthority.ts`, whose header records
that the gate was *deliberately left unreachable* until a trustworthy minter
existed, and that it "does not widen that gate by one inch."

**So V1 does not invent an identity system. The Developer Platform becomes the
second minter of an authority type Alloy already trusts.** That is the difference
between a platform that adapts to domain authority and one that runs alongside it.

## The ratified V1, in one diagram

```text
External Application
        ↓  client_id + client_secret
Token endpoint  →  short-lived access token
        ↓
Application Principal  (resolved server-side, never asserted)
        ↓
Installation  (application × organization)
        ↓
  granted scopes  ∩  resource boundary
        ↓
Public API Runtime   /api/v1/*
        ├── Canonical Resource APIs   (read)
        ├── Governed Command APIs     (write)
        └── Public Events / Webhooks  (deferred to V1.1)
        ↓
PlatformPrincipalAuthority  →  existing domain authority
        ↓
Canonical truth
```

## Documents

| # | Document | Phases |
|---|---|---|
| 01 | [Vocabulary and reconciliation](01-vocabulary-and-reconciliation.md) | A |
| 02 | [Identity, installation, credential](02-identity-installation-credential.md) | B, C, D, E |
| 03 | [Authorization, scopes, boundaries](03-authorization-scopes-boundaries.md) | F, G |
| 04 | [The public surface](04-public-surface.md) | H, I, J, K, L |
| 05 | [Mutation, commands, provenance](05-mutation-commands-provenance.md) | M, N, O |
| 06 | [Request contract](06-request-contract.md) | P, Q, R, S, T |
| 07 | [Implementation sequence](07-implementation-sequence.md) | first slice |

## Slice A — productization and discovery

| Document | Covers |
|---|---|
| [`product/01-implementation-inventory.md`](product/01-implementation-inventory.md) | What of Thread 4 actually exists on staging. **Answer: the specification, and nothing below it.** |
| [`product/02-product-model-ia-journey.md`](product/02-product-model-ia-journey.md) | Product model, IA reconciled to frozen Configuration doctrine, developer journey, Developer Platform vs Integrations boundary |
| [`product/03-surface-contracts.md`](product/03-surface-contracts.md) | Installation collection and runtime, credentials, activity/health contracts |
| [`product/04-api-documentation-architecture.md`](product/04-api-documentation-architecture.md) | Narrative vs generated reference; renderer decision |
| [`product/05-classroom-coach-discovery.md`](product/05-classroom-coach-discovery.md) | Evidence register, capability classification, generic-platform validation, installation concept |
| [`product/06-gaps-and-slice-b.md`](product/06-gaps-and-slice-b.md) | Gap classification and the recommended Slice B ordering |
| [`product/07-slice-b1-trust-foundation.md`](product/07-slice-b1-trust-foundation.md) | **Slice B.1 — implemented.** Security prerequisite reconciliation, threat review, implementation paths, remaining `/api/v1` prerequisites |
| [`product/08-slice-b2-external-boundary.md`](product/08-slice-b2-external-boundary.md) | **Slice B.2 — implemented.** Token exchange, `/api/v1/context`, rate limiting, errors, correlation, API activity, public OpenAPI + drift guard, threat review |
| [`guide/`](guide/README.md) | **The developer documentation starter** — getting started, conventions, attendance example |

## What V1 deliberately excludes

No marketplace. No delegated human OAuth. No SDK. No developer portal. No public
queue, ViewModel or Focus Panel contract. No generic row-policy DSL. No public
webhook delivery in the first slice — the substrate does not exist and polling
via `updated_since` satisfies the reference case.

## Standing prerequisite

**Three Thread 3 P0 defects must be repaired before any credential is issued.**
They are not Developer Platform work and they are not optional: a credential
issued into a system with no audit cannot be investigated, and SEC-0c means a
caller can already choose tenant and table. See
[07-implementation-sequence.md](07-implementation-sequence.md).
