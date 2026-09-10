---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 03 — Authorization, scopes, resource boundaries (Phases F, G)

## The effective-authority law

```text
Authenticated Installation
        ∩  Granted External Scope
        ∩  Installation Resource Boundary
        ∩  Mapped Alloy Permission / Capability
        ∩  Domain Authorization and Invariants
        =  Effective Authority
```

Every term is a **narrowing**. No term can widen another. In particular:

> **An external scope is necessary but never sufficient.** Holding
> `attendance.write` does not bypass eligibility, service-day rules, immutability
> triggers or any other domain invariant. Domain authority runs unchanged and has
> the final word.

This is what makes the platform a *layer over* domain authority rather than a
second path around it.

## F. External scopes — ratified

**Decision: scopes are resource/action oriented, drawn from a small
platform-owned catalog, and mapped to internal permission keys.**

Rejected alternatives:

- **Capability-oriented** (expose the 100-entry internal capability registry as
  scopes) — it publishes an internal vocabulary as an external contract, so every
  internal capability rename becomes a breaking change for partners. Thread 3
  found 100 capabilities across 10 owners; that is an implementation detail.
- **Domain-oriented** (`childcare.*`) — too coarse to express "may read children
  but not write attendance", which is the first real grant anyone needs.
- **Mirroring RBAC permission keys 1:1** — couples the external contract to an
  internal permission surface that Thread 3 found is still being actively
  reshaped (PR #802 moved financial permissions during Thread 3's own closeout).

### V1 catalog — deliberately small

| External scope | Grants | Maps to internal |
|---|---|---|
| `context.read` | Read the installation's own context | none (self-describing) |
| `locations.read` | Read locations | location read authority |
| `children.read` | Read child records in boundary | child read authority |
| `attendance.read` | Read attendance facts | `attendance.read` |
| `attendance.write` | Author attendance facts | `attendance.record` |

Five scopes. Everything else is `LATER`. A catalog that starts small can grow
compatibly; one that starts large cannot shrink.

### Mapping law

The mapping from external scope → internal permission key lives in **one
platform-owned table**, versioned with the scope catalog. It is not derived
dynamically from the capability registry, because an internal rename must never
silently change what a partner's grant means. When an internal key is renamed the
mapping is updated deliberately and the external scope name is unchanged — that
indirection is the entire point.

### Capability and resource boundary stay separate

**Law:** scopes name *what*; the resource boundary names *where*. They never
merge.

```text
scope:            attendance.write
resource boundary: locations = [A, B, C]
```

Never:

```text
attendance.location_A.write
attendance.location_B.write
```

The combinatorial form multiplies the catalog by the tenant's location count,
makes grants unreadable, and turns "add a location" into "reissue every grant".
Alloy already models it correctly — `NonHumanProducerAuthority` carries
`grantedPermissionKeys` and `allowedSiteLocationIds` as separate fields, and
`assertNonHumanCaptureAllowed` checks them as separate denials. V1 preserves that
separation rather than inventing it.

## G. Resource boundary — ratified

**V1 supports exactly one boundary dimension: locations.**

```text
Organization = Firefly            (from the installation, not negotiable)
Allowed locations = [A, B, C]     (granted on the installation)
```

Rationale: it is the dimension the reference case needs, it is the dimension
Alloy already enforces for non-human principals, and it is the dimension the
attendance gate already checks. Programs, business domains and record
relationships are **`LATER`** — each needs its own evidence that a partner
genuinely needs it, and adding them speculatively is how a boundary model becomes
a policy engine.

### Empty means nothing, not everything

An installation with an empty location boundary is authorized for **no**
locations. `NonHumanProducerAuthority` already documents this: *"Sites this
producer is registered for. Empty denies everything."* An empty grant that means
"all" is the single most dangerous default in an authorization system, because it
is what an incomplete provisioning step produces.

### Caller input narrows only

> **Caller-supplied filters may narrow within the authorized boundary. They may
> never enlarge it.**

A request naming locations `[A, D]` where the boundary is `[A, B, C]` resolves to
`[A]` — the intersection — and never returns `D`. Alloy's attendance route
already implements exactly this intersection semantics rather than rejecting or
over-serving, and V1 adopts it: asking for an unheld site returns nothing, not
everything.

**No generic row-policy DSL.** The boundary is a typed, enumerable structure. A
DSL would be a second permission universe wearing a query language, and it would
be evaluated in the request path where its failure mode is silent over-serving.
