---
title: Alloy Context Package
owner: platform
status: canonical
last_reviewed: 2026-10-01
supersedes: []
---

# Alloy Context Package — `alloy-context.v1`

## What this package is

A versioned, distributable definition of **what an AI should know about Alloy, and what it must never
assume.** It is the output of the documentation certification program turned into infrastructure:
fourteen certified domain records, reduced to a five-document global foundation plus thirteen domain
lanes, with explicit inference boundaries and machine-readable staleness triggers.

It serves two consumers from one source: **GPT project sources** and **Vacilando lanes**.

## Why it exists

Alloy's documentation tree holds roughly 1,900 markdown files across several generations of design.
Loading it into a model does not make the model better informed — it makes it confidently wrong,
because superseded doctrine sits beside current doctrine and nothing in the text distinguishes them.

Three concrete failures motivated this package. A canonical document called shipped features "future
work". A foundation document stated Alloy had no partner API while a certified, versioned 18-path
contract was live. Two documents both marked canonical disagreed about Alloy's own configuration
URLs. In each case an agent reading the corpus would have been confidently wrong, and in each case
nothing failed.

So this package makes the corpus **small, ranked, and bound to tests.**

## How GPT uses it

Load the **Tier 1** set always — five documents. Load a domain's **Tier 2** owners when working in
that domain. Pull **Tier 3** only on demand. Never load the excluded trees.

Exact file lists: [`gpt-project-sources.json`](gpt-project-sources.json). Step-by-step installation:
[`gpt-installation.md`](gpt-installation.md).

## How Vacilando uses it

Vacilando resolves a task to a **lane**, boots the AI with that lane's context, and runs a
documentation-impact assessment at closure. The lane registry is
[`vacilando-lanes.json`](vacilando-lanes.json); the resolution algorithm is
[`context-resolution.md`](context-resolution.md); the closure standard is
[`documentation-impact-contract.md`](documentation-impact-contract.md). The implementation
specification is [`vacilando-integration-spec.md`](vacilando-integration-spec.md).

## What a lane is

**A lane is a domain context package, not a folder and not a file.** It names the documents that are
authority for one domain, the shared mechanics it depends on, what it owns, what it explicitly does
*not* own, and what would make its certification stale.

Thirteen certified lanes, two shared context packages (`operations-temporal`, `product-urls`) and one
pending lane (`financials-payments`). A shared package is never a primary mutation lane: both
`enrollment-placement` and `staff-scheduling` depend on `operations-temporal`, and neither owns the
temporal mechanics.

## What DIRECT means

**DIRECT means "load this by default for this lane, and treat it as current doctrine."** It is a
load decision, not a quality judgement.

Three things DIRECT is *not*:

- It is **not** the same as `status: canonical`. Canonical means someone owns the document. Most
  canonical documents are Tier 2 or Tier 3, and some are deliberate non-owners.
- It is **not** permanent. A document whose measured counts go stale drops to `FETCH_LIVE`.
- It is **not** granted to a pending lane. `financials-payments` exists and supplies no DIRECT context
  at all.

## What REFERENCE means

**Authoritative, but not loaded by default.** Pull it when the task touches that authority. A
generated contract (OpenAPI, schema docs) is cited verbatim and never paraphrased. Reference answers a
question; it does not become doctrine.

## How context gets updated

1. A task changes something a lane owns.
2. A **recertification trigger** fires ([`recertification-triggers.json`](recertification-triggers.json)).
3. The task's documentation-impact assessment records affected lanes, the owner documents to change,
   and whether full recertification is required.
4. The owner document and, if needed, the lane registry and benchmark manifest are updated.
5. A **guard test** pins the new claim, so the next drift fails instead of surviving.
6. The validator and the generator keep the manifests mutually consistent.

## How recertification works

Each lane carries triggers with a `full_recertification` boolean. A `false` trigger means re-check the
named claim; a `true` trigger means re-run the domain's certification. Five universal triggers apply
to every lane — the most important being **a new mutation writer**, because it is the only change in
the list that touches no document and breaks no test on its own.

## How Financials pending is handled

`financials-payments` is `PENDING_DISABLED`, for a measured reason: the last substantive semantic
change under `web/lib/financials/payments` was 2026-09-30, and the seven-day stability gate has not
opened. Recent commits corrected core money meaning — refund ordering, held-deposit availability,
payer authorization, return-versus-refund — so freezing current behaviour into DIRECT context would
describe semantics that have already moved.

The lane **exists now** so routing works and so the refusal is explicit rather than an omission. It
provides no DIRECT context. Certified **Subsidy** and certified **Commercial** are not blocked by the
hold and remain fully available.

## How to add a new domain

1. Certify the domain first — measured, with a record in its owner document. **Do not add a lane
   because its documents look tidy.**
2. Add a lane entry to [`vacilando-lanes.json`](vacilando-lanes.json): owns, does-not-own, DIRECT
   owners, shared dependencies, inferences, evidence, triggers, routing hints.
3. Add its triggers to [`recertification-triggers.json`](recertification-triggers.json).
4. Add an owner row and a staleness row to [`../alloy-canonical-owner-map.md`](../alloy-canonical-owner-map.md).
5. Add a scoreboard row to [`../alloy-benchmark-context.md`](../alloy-benchmark-context.md).
6. Run `node scripts/build-context-package.mjs` to regenerate the derived manifests.
7. Run the validator. It will refuse an inconsistent package.

**Do not grow Tier 1.** The cap is five and raising it is a ratified decision, enforced by the
validator.

---

## Files in this package

| File | Role | Hand-authored? |
|---|---|---|
| [`alloy-context-package.json`](alloy-context-package.json) | package identity, Tier 1 foundation, excluded trees | yes |
| [`vacilando-lanes.json`](vacilando-lanes.json) | lane registry — the judgement | yes |
| [`recertification-triggers.json`](recertification-triggers.json) | machine-readable staleness contract | yes |
| [`gpt-project-sources.json`](gpt-project-sources.json) | GPT tier lists | **generated** |
| [`distribution-manifest.json`](distribution-manifest.json) | path + blob SHA manifest | **generated** |
| [`context-resolution.md`](context-resolution.md) | how any run resolves context | yes |
| [`documentation-impact-contract.md`](documentation-impact-contract.md) | closure standard | yes |
| [`gpt-installation.md`](gpt-installation.md) | operator instructions for GPT | yes |
| [`vacilando-integration-spec.md`](vacilando-integration-spec.md) | Phase 2 handoff | yes |

Generator: `node scripts/build-context-package.mjs` (`--check` verifies without writing).
Validator: `web/tests/docs/contextPackageValidator.test.ts`.
