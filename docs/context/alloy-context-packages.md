---
title: Alloy context packages
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Context packages — what to load, and what never to load

**Purpose.** Turn fourteen certified domain records into concrete load lists for the two consumers
that exist: a GPT project with a small source budget, and Vacilando, which needs
implementation-sensitive depth.

**The problem this solves, measured.** The repository holds **1,893** markdown files. **1,479 of them
(78%) are in trees that must never be loaded as current truth** — archive, audits, sprints, handoffs,
marketing, product reviews, planning, milestones, QA and RFCs. Loading the documentation tree into a
model does not make it better informed; it makes it confidently wrong, because the tree contains
several generations of superseded design alongside the current one.

Tier 1 is **five files**. That is the deliberate answer to a corpus of 1,893, of which only 414
survive the exclusions at all.

Companion documents: [`alloy-platform-synthesis.md`](alloy-platform-synthesis.md),
[`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md),
[`alloy-inference-contract.md`](alloy-inference-contract.md),
[`alloy-benchmark-context.md`](alloy-benchmark-context.md).

---

## 1. Treatments

The vocabulary is defined in [`alloy-benchmark-context.md`](alloy-benchmark-context.md) §2 and is not
redefined here. What matters for packaging:

| Treatment | Loads by default? |
|---|---|
| `DIRECT` | yes — Tier 1 or the matching Tier 2 domain |
| `REFERENCE_ON_DEMAND` | no — Tier 3, pulled when the task touches it |
| `GENERATED_REFERENCE` | no — Tier 3, cited verbatim, never paraphrased |
| `SUMMARY` | orientation only; never the basis for a specific claim |
| `PLANNED_ONLY` | never as implemented behaviour |
| `EXCLUDE_HISTORY` | never for current-state reasoning |

**Canonical is not DIRECT.** Of the documents marked `status: canonical`, most are Tier 2 or Tier 3.
Being owned is not being preloaded.

---

## 2. GPT project source package

### TIER 1 — ALWAYS LOAD (5 files)

The smallest set that lets a model reason about Alloy without being wrong about it.

| File | Why it is here |
|---|---|
| [`alloy-platform-synthesis.md`](alloy-platform-synthesis.md) | the whole current platform in one document |
| [`alloy-inference-contract.md`](alloy-inference-contract.md) | what may and may not be concluded — the guardrail |
| [`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md) | where to go next, so Tier 2 is a lookup rather than a guess |
| [`alloy-benchmark-context.md`](alloy-benchmark-context.md) | per-domain certification state and the scoreboard |
| [`../platform/governance/glossary.md`](../platform/governance/glossary.md) | shared vocabulary; cheap and prevents term drift |

No foundation document is Tier 1. The handbook, system overview, architecture, capabilities, roadmap
and release history are each either narrative, index, intent or history — and three of them carried
stale claims as recently as this pass.

### TIER 2 — DOMAIN DIRECT (load the rows your task touches)

Take the **canonical owner** column from
[`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md) §1 for the domain in play, and nothing
else. A task in one domain does not load another domain's owner.

Representative loads:

| Working on | Load |
|---|---|
| stage, lifecycle, process | `business-process-system.md` + `status-and-state-system.md` |
| placement, enrollment, scheduling, attendance | `effective-dated-assignment-doctrine.md` + the domain owner |
| permissions, RLS, capabilities | `roles-and-permissions.md` |
| configuration authoring or publication | `configuration-publication-model.md` |
| URLs, routing, redirects | `routing-doctrine.md` |
| the public API | `api-architecture.md` |
| AI, Trust, reasoning | `reasoning-runtime.md` |
| money | `financials-canonical-authorities.md` — and read the pending notice first |

### TIER 3 — REFERENCE (pull on demand, never preload)

- [`../api/openapi/alloy-public-api.v1.json`](../api/openapi/alloy-public-api.v1.json) — exact public contract (`GENERATED_REFERENCE`)
- [`../api/api-response-contract.md`](../api/api-response-contract.md) — internal envelope only
- `docs/schema/**` — table, policy and constraint detail
- the **reference owners** column of the owner map
- [`../platform/foundation/platform-decisions.md`](../platform/foundation/platform-decisions.md) — ratified decisions, when the question is *why*

### EXCLUDE — never as current truth

| Tree | Files | Why |
|---|---|---|
| `docs/sprints/**` | 705 | execution history |
| `docs/archive/**` | 283 | superseded generations |
| `docs/platform/planning/**` | 271 | intent and proposals |
| `docs/audits/**` | 133 | point-in-time findings |
| `docs/product/**` | 30 | reviews and convergence notes |
| `docs/handoffs/**` | 26 | session handoffs |
| `docs/platform/milestones/**` | 18 | historical certifications |
| `docs/marketing/**`, `docs/platform/qa/**`, `docs/platform/rfcs/**` | 13 | not platform truth |
| `certification/**` | — | release evidence, not doctrine |

**Total excluded: 1,479 of 1,893 markdown files — leaving 414, of which Tier 1 is five.**

Two specific traps: the **Access V2 planning tree** is planning, never authority; and
`docs/platform/runtime/runtime-implementation-authorization.md` and
`stage-work-view-queue-canonical-model.md` are still *proposed* and must never be DIRECT.

---

## 3. Vacilando ingestion package

Vacilando needs implementation-sensitive context, so its package is wider than GPT's and is
classified by **volatility** rather than by subject. The distinction that matters: a document whose
claims are pinned by a test can be embedded and trusted between refreshes; a document whose claims are
measured counts cannot.

| Class | What it is | Ingestion | Refresh trigger |
|---|---|---|---|
| **STATIC DOCTRINE** | laws that hold regardless of implementation detail — the temporal doctrine, the inference contract, Platform Decisions | embed and index | an RFC or a ratified decision |
| **CURRENT IMPLEMENTATION CONTRACT** | what the code does now — domain owners, routing doctrine, configuration lifecycles | embed, but re-fetch on the domain's staleness trigger | the owner map's staleness row |
| **GENERATED SPEC** | OpenAPI, schema dumps, the declared route-capability table | **always fetch live** — never embed | every read |
| **VOLATILE CERTIFICATION EVIDENCE** | measured counts, census artifacts, certification records' numeric claims | fetch live; treat embedded copies as expired | every read |

### Per-document ingestion table

| Document | Priority | Authority role | Class | Domain tags | Implementation evidence | Live? |
|---|---|---|---|---|---|---|
| `context/alloy-platform-synthesis.md` | 1 | synthesis, owns nothing | static doctrine | all | the fourteen domain records | embed |
| `context/alloy-inference-contract.md` | 1 | guardrail | static doctrine | all | the guard suites under `web/tests/docs/**` | embed |
| `context/alloy-canonical-owner-map.md` | 1 | routing to owners | static doctrine | all | — | embed |
| `context/alloy-benchmark-context.md` | 1 | certification manifest | **volatile** | all | `web/tests/docs/benchmarkContextPack.test.ts` | live |
| `platform/core/effective-dated-assignment-doctrine.md` | 2 | canonical owner | static doctrine | operations, placement, scheduling | `apply_participation_operational_change`; `temporalCardinalityAsymmetry.test.ts` | embed |
| `platform/core/business-process-system.md` | 2 | canonical owner | implementation contract | process, stage | `lifecycleWriterCensus.test.ts` | embed |
| `platform/core/status-and-state-system.md` | 2 | canonical owner | implementation contract | status | `status_definitions` | embed |
| `platform/governance/roles-and-permissions.md` | 2 | canonical owner | implementation contract | access, RLS | `scripts/routeCapabilities.declared.json` | embed |
| `platform/governance/configuration-publication-model.md` | 2 | canonical owner | **volatile** (measured counts) | configuration | the Configuration certification record | live |
| `platform/trust/reasoning-runtime.md` | 2 | canonical owner | **volatile** (capability census) | AI, trust | `aiBosCertificationClaims.test.ts` | live |
| `platform/modules/communications-platform.md` | 2 | canonical owner | implementation contract | communications | `communicationsCertificationClaims.test.ts` | embed |
| `platform/modules/attendance-system.md` | 2 | canonical owner | implementation contract | attendance | `attendanceCertificationClaims.test.ts` | embed |
| `platform/modules/operational-intelligence-platform.md` | 2 | canonical owner | implementation contract | OI | `operationalIntelligenceWriteAuthority.test.ts` | embed |
| `platform/modules/financials-canonical-authorities.md` | 2 | canonical owner; **Subsidy only is certified** | **volatile** | subsidy, financials | `subsidyCertificationClaims.test.ts` | live |
| `system/routing-doctrine.md` | 2 | canonical owner | implementation contract | routing, URLs | `web/next.config.ts`; `canonicalAdminRoutes.ts` | live |
| `api/api-architecture.md` | 2 | canonical owner | implementation contract | API | `web/app/api/v1/**` | embed |
| `api/openapi/alloy-public-api.v1.json` | 3 | machine contract | **generated spec** | API | `publicSurfaceInventory.ts` | **live** |
| `schema/**` | 3 | generated | **generated spec** | data | the migrations | **live** |
| `platform/foundation/platform-decisions.md` | 3 | ratified decisions | static doctrine | governance | — | embed |
| `platform/foundation/product-roadmap.md` | 4 | **intent only** | planned-only | all | — | embed, flagged non-authoritative |
| `platform/foundation/release-history.md` | 4 | historical | exclude-history | all | git history | do not ingest as truth |

### Rules for the ingestion pipeline

1. **Never embed a `GENERATED SPEC` or `VOLATILE` document.** A stale embedded count is worse than no
   count, because it reads as measured.
2. **A certification record's prose may be embedded; its numbers may not.** The doctrine is durable;
   the counts expire. See the locked-half / unlocked-half distinction — counts and prose sit side by
   side in one document and only one half is test-pinned.
3. **Tag by domain and honour the tag.** Cross-domain retrieval is how a Scheduling answer acquires
   an Attendance premise.
4. **Carry the pending flag.** Any retrieval touching Financials/Payments must surface that the domain
   is uncertified before its content is used.

---

## When this document must be updated

When Tier 1 changes — which should be rare and deliberate; when a domain is certified or
de-certified; when an excluded tree is added; or when a document changes volatility class, which
happens whenever measured counts are added to a previously static doctrine.
