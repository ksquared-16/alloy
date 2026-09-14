---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 04 — API documentation architecture (Slice A, Part 4)

## The one non-negotiable

> **There is exactly one API specification: the governed public OpenAPI
> artifact.** The reference is derived from it. Narrative documentation explains
> it and never restates endpoint truth.

Thread 4 made 100% public OpenAPI coverage a build gate. That gate is what makes
derivation safe: a documented endpoint that is not in the spec cannot exist.

## Two kinds of documentation, kept apart

| | **Narrative** | **Reference** |
|---|---|---|
| Content | Concepts, guides, worked examples | Endpoints, schemas, parameters, responses |
| Source | Hand-written, reviewed | **Generated from public OpenAPI** |
| Changes when | The model changes | The spec changes |
| Failure if merged | Endpoint truth drifts in prose nobody regenerates | — |

Narrative may *reference* an operation by id; it may not restate its parameters.

## Renderer decision — ratified

**Build-time generation into Alloy's own primitives. No runtime third-party
OpenAPI renderer in V1.**

Established renderers were evaluated as Part 4 requires:

| Option | Licence | Why not for V1 |
|---|---|---|
| **Scalar** | MIT | Best-maintained modern option, and the one to revisit if this decision is reversed. Still imports a complete foreign visual system. |
| **Redoc** (community) | MIT | Read-only reference, clean, but large React bundle and its own design language. |
| **Swagger UI** | Apache-2.0 | Mature and ubiquitous; dated UX, heavy, and its "Try it" console is an authenticated-request surface. |
| **Stoplight Elements** | Apache-2.0 | Heavier still; same visual-system objection. |

**Why none of them in V1** — two binding reasons, neither about quality:

1. **Part 10 is binding.** "The Developer Platform must look and behave like
   Alloy… Do not build a generic SaaS developer dashboard detached from Alloy's
   visual language." Every renderer above *is* a generic developer dashboard.
   Embedding one wins a week and loses the requirement.
2. **"Try it" consoles execute authenticated requests from the browser.** That is
   a live credential surface Thread 4 did not design, against an API whose
   security prerequisites are unmet. V1 ships **no execution console**; examples
   are copyable `curl`.

**Honest tradeoff:** this is more work than embedding, and it is the reason to
revisit. What it is *not* is "inventing a renderer" — it is a build-time
generator emitting static Alloy-native pages from a spec, the same pattern Alloy
already uses to generate its internal typed client. There is no runtime
dependency, no bundle cost, no CSP exception, and no second visual system.

If Slice B finds the generator materially harder than estimated, **Scalar is the
sanctioned fallback**, and the cost of switching is one build step because the
spec — not the renderer — is the source of truth.

## Structure

```text
Developer Platform → Documentation
  ├── Getting Started        narrative
  ├── Authentication         narrative
  ├── Tenancy & Installation narrative
  ├── Scopes & Boundaries    narrative
  ├── Resources vs Operations narrative
  ├── External IDs           narrative
  ├── Idempotency            narrative
  ├── Pagination             narrative
  ├── Errors                 narrative
  ├── Attendance example     narrative, end-to-end
  └── API Reference          GENERATED from public OpenAPI
```

The narrative starter is written and lives at
[`../guide/`](../guide/README.md). The reference cannot be generated yet — the
public OpenAPI artifact does not exist (§01).

## Contextual documentation

Documentation is reachable **from the installation**, carrying that
installation's `client_id` and granted scopes into the examples. A developer
should not have to translate a generic example into their own context — that
translation step is where most first integrations fail.
