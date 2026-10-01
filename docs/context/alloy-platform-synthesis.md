---
title: Alloy platform synthesis
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Alloy platform synthesis — the current platform, in one document

**This is the Tier 1 context document.** It is the smallest accurate description of the Alloy that
exists on 2026-09-30, synthesized from fourteen certified domain records. It is deliberately short
and it deliberately owns nothing: every section hands off to the canonical owner that does.

Read this first, then load only the domain owners your task touches. The companion documents are
[`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md) (who owns what, and what makes it
stale), [`alloy-inference-contract.md`](alloy-inference-contract.md) (what may and may not be
inferred), [`alloy-context-packages.md`](alloy-context-packages.md) (what to load, in what tier) and
[`alloy-benchmark-context.md`](alloy-benchmark-context.md) (the per-domain certification manifest).

> **Scope.** This document describes **implemented** behaviour. Intent, sequencing and unbuilt work
> live in [`../platform/foundation/product-roadmap.md`](../platform/foundation/product-roadmap.md)
> and the Planned/Future rows of
> [`../platform/foundation/platform-capabilities.md`](../platform/foundation/platform-capabilities.md).
> Where this document and a July-dated foundation document disagree, this one was measured later —
> but the **code** outranks both.

---

## What Alloy is

Alloy is a configurable operating system for service businesses. Childcare is the first primary
market; the platform layers below the domain modules are industry-agnostic.

An operator runs high-context work from one workspace: records, queues, communications, documents,
scheduling, attendance, money and AI-assisted action — every read and write scoped by organization,
permission and configuration.

What makes it a platform rather than an application: **the shape of the work is configured, not
coded.** Business processes, stages, fields, layouts, actions, forms and workflows are org-authored
data interpreted by shared runtimes. What is *not* configurable is the set of invariants — tenancy,
authorization, temporal truth and event emission — which live in code precisely so configuration
cannot weaken them.

## Core model

| Concept | What it is | Canonical owner |
|---|---|---|
| **Organization** | The tenant. Every tenant table carries `org_id`; isolation is enforced by RLS, not by query discipline. | [`../platform/governance/roles-and-permissions.md`](../platform/governance/roles-and-permissions.md) |
| **Person** | The canonical human identity (`persons`, `customer_persons`). `contacts` is compatibility only. **Email does not define identity.** | [`../platform/core/entity-model.md`](../platform/core/entity-model.md) |
| **Entity / Record / Relationship** | Records are entity instances; relationships are first-class rows, not foreign-key trivia. Authoritative record detail comes from the resolver-backed entity GET — never from a queue preview. | [`../platform/core/record-system.md`](../platform/core/record-system.md) |
| **Business Process** | The operator hierarchy is `Organization → Business Process → Stage → Record`. | [`../platform/core/business-process-system.md`](../platform/core/business-process-system.md) |
| **Stage** | Persisted process position. A record is *at* a stage. | [`../platform/core/business-process-system.md`](../platform/core/business-process-system.md) |
| **Status** | Governed disposition, defined by `status_definitions`. **Status does not define Stage**, and the two are not interchangeable. | [`../platform/core/status-and-state-system.md`](../platform/core/status-and-state-system.md) |
| **Work** | Work Views, Queues and lane badges are **projections** over records, derived from stage and status. A queue is not a cohort and a badge count is not a fact. | [`../platform/operator/queue-system.md`](../platform/operator/queue-system.md) |
| **Configuration** | Org-authored intent — processes, fields, layouts, actions, forms, workflows. Four distinct lifecycles, not one. | [`../platform/governance/configuration-publication-model.md`](../platform/governance/configuration-publication-model.md) |
| **Access** | Route capabilities authorize product actions; RLS owns tenant isolation. The two are different jobs. | [`../platform/governance/roles-and-permissions.md`](../platform/governance/roles-and-permissions.md) |
| **Runtime** | Nine foundational runtimes interpret configuration and render the operator plane. Construction is frozen; new foundational runtimes require an RFC. | [`../platform/foundation/architecture.md`](../platform/foundation/architecture.md) |

## Product domains

Fourteen domains are certified as documented-and-measured. One is not.

| Domain | State |
|---|---|
| Developer Platform / API, Runtime, Business Process, Identity/Access | certified platform spine |
| Operations temporal truth, Enrollment/Placement, Staff/Scheduling, Attendance | certified operations |
| Subsidy, Commercial | certified money |
| Operational Intelligence, Communications, Configuration, AI/BOS | certified platform services |
| **Financials / Payments** | **PENDING** — actively changing; see below |

The per-domain certification state, owners and staleness triggers are in
[`alloy-benchmark-context.md`](alloy-benchmark-context.md). The scoreboard is the domain status
table there.

**Financials / Payments is pending for a measurable reason, not an editorial one.** The last
substantive semantic change under `web/lib/financials/payments` is `75c1a016c` (2026-09-30), and
thirteen commits landed there in the preceding seven days. A domain is not documentable as current
truth while its semantics move daily. Subsidy and Commercial are certified and stable and are
**not** blocked by this.

## Authority model

**Where truth lives, and who may change it.**

Authority is layered, and the layer that enforces is often not the layer you first look at:

```
route handler          may authorize, and often does — but not always
  domain service       frequently the real capability owner
    handler library    shared enforcement for a family of routes
      registered action operator-invocable, separately gated
        RPC / SQL      transaction-owning; SECURITY INVOKER unless stated
          RLS          tenant isolation, always, independent of the above
```

Two rules follow, and both have been violated in this repository before:

1. **A route file that does not call a capability helper is not therefore ungated.** Authority may
   live in the domain service, the handler library, a registered action, a provider-signature helper
   or a token boundary. Chain-follow before concluding.
2. **A table grant with no admitting RLS policy denies.** Absence of a policy is not a wildcard.

Mutation authority is **never** conferred by reasoning, recommendation or derivation. An
Operational Intelligence answer is not an action; an AI proposal is not an approval. Applying either
takes the *domain's* own capability.

## Configuration model

Configuration expresses **intent**; the runtime owns **execution**. JSON does not replace
authorization, and it cannot create an invariant.

The Configuration domain runs **four distinct lifecycles** — flattening them into "config is
versioned" is wrong in three of the four cases:

| Shape | Lifecycle |
|---|---|
| `org_settings.metadata` | one JSON document, edited **in place** |
| `entity_layouts` | **append-only** — republish, never edit or delete |
| `business_process_drafts` → `revisions` | draft/revision pair |
| Programs: `program_drafts` → `revisions` → `configuration_publications` → `distribution_targets`/`_runs` | full publish-and-distribute chain |

The Programs chain is **real, reachable code with zero rows** as measured. It is built and
unexercised — which is neither "in use" nor "not implemented".

**Where configuration lives, as URLs.** Three canonical bases coexist, and the filesystem matches
none of them:

| Canonical URL base | Serves | Note |
|---|---|---|
| `/organization` | configuration landing and its domain surfaces | bare `/admin`, `/admin/settings`, `/settings` and `/settings/organization` all redirect here |
| `/settings/*` | settings sub-surfaces | `/admin/settings/*` redirects here |
| `/admin/*` | non-settings admin modules — forms, workflows, messages, tasks, finance, ai-activity | still canonical as a **prefix**; only the bare root redirects |

All three are **rewritten** onto the implementation tree `web/app/adminV2/**`. So the browser URL
and the filesystem path deliberately differ, and searching for `web/app/organization` finds
nothing. Authority: `web/lib/admin/canonicalAdminRoutes.ts` and `web/next.config.ts`; the doctrine
is [`../system/routing-doctrine.md`](../system/routing-doctrine.md).

## Temporal model

Effective-dated operational truth **supersedes; it does not overwrite.** A change to a defining
fact closes the prior truth interval and inserts a successor linked by `supersedes_*`. Historical
truth stays readable because a partner that already synchronised a row must be able to resolve it.

Three concepts that must not be conflated: an **operational change** (it became different),
a **cancellation** (it never became true — the row is retained, not deleted), and a **correction**
(the record was factually wrong). **No correction path is implemented**, deliberately.

Cardinality is **not uniform**, and flattening it is a regression: placements and child primary
assignments allow at most one operational row per agreement, enforced by partial unique index; staff
primary assignments are governed by an overlap trigger only, so a staff member may legally hold a
current *and* a future-dated primary assignment. Owner:
[`../platform/core/effective-dated-assignment-doctrine.md`](../platform/core/effective-dated-assignment-doctrine.md).

**Schedule is expectation; Attendance is observation.** They are different ledgers and Scheduling
must never become Attendance truth.

## Intelligence model

Two different things wear the word "intelligence", and they are not layers of each other.

**Operational Intelligence** is deterministic derivation: registered metric keys, org-authored
metric definitions, and Answers consumed by specific surfaces. An OI answer is a *reading*. It
recommends nothing and authorizes nothing.

**AI / BOS** is model-backed reasoning behind the Trust boundary. Measured: **one** provider (the
OpenAI wire protocol over raw HTTP — no SDK in `package.json`), and **two of four** Trust
capabilities actually reach a model; the other two are deterministic. A whole mounted surface,
`web/app/api/admin/ai/task-assist/propose`, is deterministic despite its path and says so in its
own output.

The live gate is **credential presence** (`OPENAI_API_KEY` *and* `OPENAI_MODEL`) plus org policy —
not a boolean feature flag. `lib/trust` is control-enforced to contain no `fetch(`, no provider SDK
and no credential. Autonomous agents are **not** current behaviour. Owner:
[`../platform/trust/reasoning-runtime.md`](../platform/trust/reasoning-runtime.md).

## Communications model

Alloy owns **intent**; a provider owns **transport**. The canonical enqueue path records what the
organization meant to send. Provider delivery state is telemetry about a vendor's pipeline — it is
**not** business truth, and a delivered/bounced webhook does not resolve operator work.

A reply does not clear attention; only operator triage resolves an attention item. Owner:
[`../platform/modules/communications-platform.md`](../platform/modules/communications-platform.md).

## Developer model

**Alloy has two APIs and conflating them is the characteristic error of this domain.**

| Surface | Contract |
|---|---|
| `/api/v1/**` | The **external partner surface**. A frozen, versioned, closed contract: 18 paths, one OAuth token exchange, a fixed error taxonomy, no generic PUT/PATCH/DELETE. Attendance is public; Financials and Communications are not. |
| `/api/admin/**` | **Internal only.** Its response envelope, its behaviours and its permissions share nothing with the public contract. |

Shared code is not a shared contract. Never infer a public operation from an internal one, or the
reverse. There is **no outbound partner event delivery** — no subscription or delivery machinery
exists. Owner: [`../api/api-architecture.md`](../api/api-architecture.md); the machine contract is
[`../api/openapi/alloy-public-api.v1.json`](../api/openapi/alloy-public-api.v1.json).

---

## What this document is not

It is not an authority. Every claim here is a synthesis of a certified domain record, and where a
domain owner and this summary disagree, **the owner wins and this document is the bug**. It is also
not a substitute for reading code: runtime, schema and route evidence outrank all documentation,
including this.

## When this document must be updated

When a domain's certification state changes; when a new domain is certified or a certified one goes
stale; when the core model, authority layering or canonical URL bases change. The per-domain
staleness triggers are in [`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md).
