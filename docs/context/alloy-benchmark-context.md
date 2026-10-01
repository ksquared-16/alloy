---
title: Alloy benchmark context pack
owner: platform
status: canonical
last_reviewed: 2026-09-30
supersedes: []
---

# Alloy benchmark context pack — V2

**This file defines which Alloy documents may be loaded as authoritative context, and what may be
inferred from each.** It is a curated corpus, deliberately much smaller than the repository. Loading
the whole documentation tree into a model is the failure this manifest exists to prevent: the tree
contains several generations of design history, and most of it is not current truth.

| | |
|---|---|
| **Version** | V2 |
| **Certified** | 2026-09-30 |
| **Base** | `3c4ac97f1` (staging), plus the Configuration and AI/BOS records carried in PR 1368 candidate `5d24b0d08` — **not yet on staging** |
| **Domains certified** | Developer Platform / API · Runtime · Business Process · **Identity/Access** · **Operations temporal truth** · **Enrollment / Placement** · **Staff / Scheduling** · **Attendance** · **Subsidy** · **Commercial** · **Operational Intelligence** · **Communications** · **Configuration** · **AI/BOS** (Operations: see [`../platform/core/operations-temporal-truth-certification.md`](../platform/core/operations-temporal-truth-certification.md); Attendance: [`../platform/modules/attendance-system.md`](../platform/modules/attendance-system.md)) |
| **Domains pending** | **Financials / Payments only** — stability gate CLOSED, 0 days quiet; last semantic change `75c1a016c` (2026-09-30), thirteen commits under `web/lib/financials/payments` in the preceding seven days |

**Foundation synthesis (2026-09-30).** The fourteen certified records are synthesized into three
companion documents — [`alloy-platform-synthesis.md`](alloy-platform-synthesis.md) (the current
platform model), [`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md) (one concern, one
owner, plus the staleness contract) and
[`alloy-inference-contract.md`](alloy-inference-contract.md) (safe and forbidden inference). **This
manifest is both the per-domain certification record and the fourth Tier 1 document**, loaded
`FETCH_LIVE` because it carries measured counts.

**The Tier 1 load set is exactly five files**, defined authoritatively by
[`package/alloy-context-package.json`](package/alloy-context-package.json) and published in
[`package/gpt-project-sources.json`](package/gpt-project-sources.json):

1. [`alloy-platform-synthesis.md`](alloy-platform-synthesis.md)
2. [`alloy-inference-contract.md`](alloy-inference-contract.md)
3. [`alloy-canonical-owner-map.md`](alloy-canonical-owner-map.md)
4. [`alloy-benchmark-context.md`](alloy-benchmark-context.md) — this file
5. [`../platform/governance/glossary.md`](../platform/governance/glossary.md)

> **Corrected 2026-10-01.** This paragraph previously called four companion documents "the Tier 1
> load set" and counted [`alloy-context-packages.md`](alloy-context-packages.md) among them, while
> omitting this manifest and the glossary — so it named a five-file set wrongly in both directions.
> `alloy-context-packages.md` is the **prose rationale** for the tiering and the Vacilando ingestion
> classes; it is **not** a Tier 1 GPT project source and is not uploaded. Found while installing
> `alloy-context.v1` into GPT Project Sources. The package manifests were correct throughout; only
> this prose disagreed with them.

### Enrollment / Placement and Staff / Scheduling — context treatment

**DIRECT** (load these): `../platform/core/effective-dated-assignment-doctrine.md`,
`../platform/core/operations-temporal-truth-certification.md`,
`../platform/core/placement-system.md`, and for Staff/Scheduling the four governance owners —
`staff-coverage-authority.md`, `time-aware-staffing-projection.md`, `assignment-time-authority.md`,
`assignments-authority-model-debt.md`.

**REFERENCE_ON_DEMAND**: `../platform/core/status-and-state-system.md` and
`business-process-system.md`, for the boundaries these domains are explicitly *outside*.

**PLANNED_ONLY** (never doctrine): the 32 files under `../platform/planning/**` with scheduling or
roster names. They describe intent, and several describe concepts that do not exist.

**EXCLUDE_HISTORY**: `certification/**` census SQL, results JSON and playwright evidence (92 artifacts);
`docs/sprints/**`, `docs/archive/**`, `docs/audits/**` (~50). Retained for provenance, excluded from
context. A PASS in one of them is not current evidence.

**Safe/forbidden inference for both domains is §5 of the certification record.** The two that cause the
most damage if got wrong: "latest row = active row" (resolve currency by the operational-state
predicate, never by recency) and "a declared capability is an enforced one" (319 declarations are a
`pending` backlog).

### Attendance — context treatment

**DIRECT**: [`../platform/modules/attendance-system.md`](../platform/modules/attendance-system.md) — the
single canonical owner, carrying its certification record.

**REFERENCE_ON_DEMAND**: `../platform/core/effective-dated-assignment-doctrine.md` — for the interval
model Attendance deliberately does **not** use, and `placement-system.md` for the committed foundation it
references.

**EXCLUDE_HISTORY**: `certification/attendance/**`, `certification/kiosk/**`,
`certification/playwright/**` attendance evidence, and the attendance QA guides and audits. These are
point-in-time evidence; a PASS in one is not current doctrine.

**Safe, because measured:** Attendance records observed presence, not schedule intent; schedule is
expectation and is compared against attendance rather than becoming it; the child subject is
`customer_member` + committed agreement while staff is canonical Person; corrections are append-only
links (`entry_type` + `corrects_event_id`) enforced by database triggers; and the service day is the
org's configured IANA-zone local day, derived at write time.

**Forbidden:** scheduled = attended · enrolled = present · absence inferred from a missing record (an
absence is an authored event with 328 rows) · a UI-hidden write means unauthorized (capability
enforcement is in the domain service, not the route) · the auth email identifies the subject (explicitly
refused in two places) · an old QA artifact is current doctrine · day boundaries follow the browser
timezone · attendance uses effective-dated supersession (it has no `supersedes_*` and no `end_date`
column) · `excused` exists (it does not, anywhere) · `present` and `schedule_override` are in use (both
are admitted by the CHECK and never written).

### Money domains — Subsidy certified, Financials and Commercial held

**SUBSIDY — CERTIFIED.** DIRECT: §0.1 of
[`../platform/modules/financials-canonical-authorities.md`](../platform/modules/financials-canonical-authorities.md).
Safe, because measured: subsidy suppresses **collection**, derived and never stored, and changes neither
obligation, reduction, responsibility nor payment; only a SUBMITTED claim suppresses, bounded by the
smallest of claimed / expected / outstanding; a shortfall becomes an unresolved variance and does not
raise what the family owes; ten production commands share the single capability `fin.subsidy`; there is
**no mounted HTTP write surface** — subsidy is command-dispatched, with exactly three durable writer
services and zero unexplained writers.

**FINANCIALS / PAYMENTS — NOT CERTIFIED, and deliberately so.** Payments V1 is mid-mutation: **nine
Payments V1 pull requests** in the last twenty staging commits, the most recent landing the same day as
this pass, and their subjects are corrections to core money semantics rather than polish — refund
ordering ("an operator's refund spends the money nobody has a claim on first"), held/deposit
availability ("held money was available to spend after all"), payer authorization, and the
return-versus-refund distinction. Freezing a domain mid-mutation is how a benchmark corpus starts
describing behaviour that has already changed. `web/lib/financials/payments` last changed 2026-09-30.

**COMMERCIAL — superseded by the Commercial section below, which certifies it.** The paragraph that
follows records the state at the time of the money pass and the misinformation it corrected; read the
certification, not this verdict.
`../platform/modules/commercial-configuration.md` listed discount programs, subsidies, fees/add-ons,
accounting and the simulator as "Future domains (deferred)". Measured: `discount_programs` holds 5 rows,
`financial_journal_entries` **13,136**, `financial_accounting_periods` 102, and subsidy is ten production
commands. That list is corrected. What remains before certification is a claim matrix across the wider
commercial surface — 54 route files, 89 handlers, 60 writes, nine discount tables — and the six `pending`
DELETE declarations on pricing, addons and service offerings.

**EXCLUDE_HISTORY** for all three: `certification/financials/**` (the 11a-* evidence trees) and
`certification/kiosk/**`. These prove releases, not doctrine.

**Forbidden across the money domains:** provider state = Alloy financial truth · quote = obligation ·
payment = revenue recognition · credit and reversal are interchangeable · **subsidy = payment** (it is
collection suppression) · an authorization or a draft claim suppresses collection (only a SUBMITTED claim
does) · a shortfall raises what the family owes · a negative row can be ignored without accounting
semantics · an old certification artifact defines current architecture · Commercial owns the obligation
its pricing produces (it owns intent only).

### Commercial — CERTIFIED, and the four slots held beside it

**COMMERCIAL — CERTIFIED.** DIRECT:
[`../platform/modules/commercial-configuration.md`](../platform/modules/commercial-configuration.md),
which now carries its certification record. 53 route files · 88 handlers (60 write, 28 read) · 12 UI
pages, and **zero portal-only or session-only mutations** — all 7 writes without a declared capability
carry a real role gate. The five "pending DELETE" declarations are **implemented**, eligibility-checked
and FK-guarded; what makes them unusual is that they administer the retired **Jobs/Booking** pricing
vertical (`pricing_*`, zero rows, including `pricing_first_clean_prices` and
`pricing_square_footage_tiers`), not childcare tuition, which lives in `commercial_tuition_rates`.

**FINANCIALS / PAYMENTS — STABILITY GATE CLOSED.** Latest substantive Payments semantic commit is
`75c1a016c`, **2026-09-30**, changing bank-account authorization (who may authorize a payer bank
account), with `e9694c5c8` changing refund-versus-paid accounting the same day. The gate requires seven
consecutive quiet days; there were zero. Not certified, and not attempted.

**OPERATIONAL INTELLIGENCE — one authority hole found and repaired; certification still outstanding.**
`admin/operational-questions/answer` POST answered a question and, by default, appended the observation
to `org_settings.metadata` and saved it, behind an authenticated session with org membership only — and a
caller could force it with a request flag. Analysis had become hidden authority. The repair gates the
**write** on `reports.write` via `canManageAnalytics` and leaves the **answer** open, because
`canReadAnalytics` states the position as "ops keeps `reports.read`, so Operational Intelligence stays
readable and only authoring narrows". Recorded as conditional side-effect authority in
`ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT` and locked by test. What remains is the claim matrix, the data
source/refresh model per output, and the V1 evidence review.

**COMMUNICATIONS · CONFIGURATION · AI/BOS — surfaces measured, not certified.** Exact counts:
Communications 48 files / 62 handlers / 38 writes / 6 pages; Configuration 80 / 109 / 56 / 65 pages;
AI-BOS 64 / 75 / 43 / 12 pages (AI overlaps Configuration and OI on shared handlers, so its counts are
not disjoint). Every flagged write surface resolved to a real gate on inspection — the Twilio SMS-status
webhook verifies `X-Twilio-Signature` per binding inside its handler library, `communications/unsubscribe`
is token-admitted, and `field-definitions/ensure-platform-field` and `org-settings` PATCH carry role
gates. **No authority holes were found in these three.** They are uncertified because their claim
matrices, owner sets and provider/lifecycle models are not done, not because anything measured is wrong.

**A pattern worth carrying:** in Attendance, Communications and OI alike, capability enforcement lives in
the domain service or handler library rather than at the route. A route-level scan under-reports it every
time, which is why the `helper` field in the declaration table exists. Never read "no capability call in
the route file" as "no capability".

### Operational Intelligence and Communications — context treatment

**OPERATIONAL INTELLIGENCE — CERTIFIED.** DIRECT: §0 of
[`../platform/core/operational-calculations.md`](../platform/core/operational-calculations.md), plus
`../platform/analytics/metric-platform-doctrine.md` and `metric-data-model.md` for the metric platform.
REFERENCE_ON_DEMAND: `operational-expectations-system-design.md` (frozen). PLANNED_ONLY:
`analytics-v2-roadmap.md`.

Four output families, and they differ in the property that matters: **Operational Expectations are
AUTHORED** (1,243 rows, 258 ratifications) while Questions, Metrics and Observations are **derived**.
Metric snapshots are append-only with `computed_at`, refreshed by an `x-cron-token` machine credential or
an operator holding `reports.write`. 44 route files / 62 handlers / 33 writes, 31 capability-declared;
`reports.read` and `reports.write` are separately granted, and ops deliberately holds only the read.
**Nothing in OI mutates domain state.**

**COMMUNICATIONS — CERTIFIED.** DIRECT:
[`../platform/modules/communications-platform.md`](../platform/modules/communications-platform.md) and
`communications-identity-platform.md`. REFERENCE_ON_DEMAND: `communications-runtime-contract.md`.
EXCLUDE_HISTORY: the V1 closeout and the public-link defect record.

**Resend** (email) and **Twilio** (SMS), both over raw HTTP with no SDK in `package.json`. Both webhooks
are signature-verified — Resend via Svix against `RESEND_WEBHOOK_SECRET`, Twilio via `X-Twilio-Signature`
per binding — and both verifications live in the **handler library**, so a route-level scan reports them as
ungated and is wrong. 43 route files / 54 handlers / 32 writes, every one resolving to real authority:
28 capability, 3 provider-signature, 1 token. A message cannot exist without a thread (`thread_id` NOT
NULL + FK, zero orphans).

**The correction each certification carried.** OI's owner said nothing about `org_settings` persistence,
refresh or read-versus-author authority — gaps now closed. Communications listed **inbound email** as
out-of-scope/next-sprint while `communication_inbound_ingress` holds 32 rows and has a full ingestion
writer. That is the third July-dated doc this programme has found calling a shipped feature future work,
after Commercial's "deferred" list and the claim that staff assignment did not exist.

**Forbidden across both:** a metric is the canonical source fact · a projection is durable future truth ·
a recommendation is an authorized action · a stale observation is current state (read `computed_at`) · an
OI write capability confers domain mutation permission · an email address is a Person · provider
*accepted* means delivered · contact information implies consent · an unmatched inbound message must
belong to a Person · a provider webhook is trusted without verification · a template is sent-message
truth · SMS or announcements are unused because this stack has no rows for them.

### Configuration and AI/BOS — context treatment

**CONFIGURATION — CERTIFIED.** DIRECT:
[`../platform/governance/configuration-publication-model.md`](../platform/governance/configuration-publication-model.md).
84 route files / 117 handlers / 62 writes / 67 UI pages. **It has four lifecycles, not one** —
`org_settings.metadata` is a single JSON document mutated in place; `entity_layouts` is append-only
(republish, never edit); Business Process runs draft → validate → publish → immutable revision; Programs
adds publish → distribute. The publish/distribute machinery holds **zero rows** on the certification stack,
and `business_process_revisions` is 0 against 2 drafts, so nothing has been published there. AI-assisted
configuration separates **generate / review / apply** into three capabilities: proposing confers nothing.

**AI/BOS — CERTIFIED.** DIRECT: [`../platform/trust/reasoning-runtime.md`](../platform/trust/reasoning-runtime.md)
and `trust-platform.md`. REFERENCE_ON_DEMAND: `privacy-runtime.md`, `information-classification.md`,
`decision-contract.md`, `reasoning-deployment-strategy.md`. PLANNED_ONLY:
`../platform/planning/trust-runtime/**`. EXCLUDE_HISTORY: the BOS closeout milestone and trust-adoption
evidence.

**One provider, no SDK:** OpenAI wire protocol only, raw HTTP, via the *first* implementation of Trust's
provider port. `OPENAI_BASE_URL` allows an OpenAI-compatible endpoint; that is not multi-provider support.
**Not everything called "AI" invokes a model** — two of four Trust capabilities are model-backed, and
the task-assist propose route (`web/app/api/admin/ai/task-assist/propose/route.ts`) says of its own output "Deterministic template draft (V1) — not from a
live model". `lib/trust` is asserted by control to contain no `fetch`, no SDK, no credential and not even
the substring `openai`; 133 boundary tests pass. When an AI path applies a change it takes the **domain's**
capability, not an AI one.

**Configuration and AI/BOS share handlers under `config-layout-assist/**` and that is not double
ownership:** Configuration owns the authored setting, its lifecycle and the capability that applies it;
AI/BOS owns the reasoning that proposes it.

**Forbidden across both:** a config string is an executable command · a draft is active behaviour · schema
support implies builder, UI or runtime support (four distinct layers) · a seed default is platform law ·
configuration visibility is authorization · an AI recommendation is an approved action · model output is
durable truth · AI bypasses capability checks · surface access is action authority · provider switching,
local models or self-hosted inference are current · a route under the AI path necessarily invokes a
model · an OI metric is model inference.

**With these two, every platform domain is certified.** The only domain still pending is
**Financials/Payments**, held by the seven-day stability gate — `75c1a016c`, 2026-09-30, **0 days quiet** —
plus foundation synthesis, which is a whole-estate task rather than a domain.

A domain appears here only when it has been certified by an authority-discovery pass. Absence means
"not yet certified", never "not important" — and never "safe to infer from whatever the tree holds".

---

## Domain status — the program scoreboard

One row per domain. `Declaration` is the certification token that exists in the tree; where it is
absent, the certification lives in this manifest's prose and nowhere else, which is recorded rather
than tidied away.

| Domain | Status | Declaration | DIRECT owner | Known non-blocking debt | Next re-certification trigger |
|---|---|---|---|---|---|
| Developer Platform / API | CERTIFIED | `API_…_PROMOTED_CERTIFIED` | [`../api/api-architecture.md`](../api/api-architecture.md) | — | a new `/api/v1` route, operation or scope |
| Runtime | CERTIFIED | `RUNTIME_…_PROMOTED_CERTIFIED` | [`../platform/foundation/architecture.md`](../platform/foundation/architecture.md) | `architecture.md` was `last_reviewed` 2026-07-12 and carried a stale configuration-plane table, corrected this pass | a new foundational runtime |
| Business Process | CERTIFIED | `BUSINESS_PROCESS_…` | [`../platform/core/business-process-system.md`](../platform/core/business-process-system.md) | — | a new writer of lifecycle state |
| Identity / Access | CERTIFIED | `IDENTITY_ACCESS_…_PROMOTED_CERTIFIED` | [`../platform/governance/roles-and-permissions.md`](../platform/governance/roles-and-permissions.md) | bounded implementation debt, itemised in §6 | an EXECUTE grant on a mutating RPC; a new public table |
| Operations temporal truth | CERTIFIED | *shares* `ENROLLMENT_PLACEMENT_…` — no separate token | [`../platform/core/effective-dated-assignment-doctrine.md`](../platform/core/effective-dated-assignment-doctrine.md) | cross-site move unrepresented; no correction path (both deliberate) | a migration touching `child_placements`, `schedule_assignments` or `employments` |
| Enrollment / Placement | CERTIFIED | `ENROLLMENT_PLACEMENT_…` | [`../platform/core/placement-system.md`](../platform/core/placement-system.md) | owner carries no `measured` record of its own | a change to supersession or site consistency |
| Staff / Scheduling | CERTIFIED | `STAFF_SCHEDULING_…` | [`../platform/governance/staff-coverage-authority.md`](../platform/governance/staff-coverage-authority.md) | [`../platform/governance/assignments-authority-model-debt.md`](../platform/governance/assignments-authority-model-debt.md); no shift model | a staff single-operational index, or a shift model |
| Attendance | CERTIFIED | `ATTENDANCE_…` | [`../platform/modules/attendance-system.md`](../platform/modules/attendance-system.md) | record says *measured 2026-09-30* while frontmatter still says `last_reviewed: 2026-09-10` | a new attendance producer; kiosk identity change |
| Subsidy | CERTIFIED | **none — no token exists in the tree** | §0.1 of [`../platform/modules/financials-canonical-authorities.md`](../platform/modules/financials-canonical-authorities.md) | certified in this manifest only; the owner document declares no state | an eleventh `fin.subsidy` command; a mounted HTTP write surface |
| Commercial | CERTIFIED | `COMMERCIAL_…` | [`../platform/modules/commercial-configuration.md`](../platform/modules/commercial-configuration.md) | pending DELETE declarations on the **retired Jobs/Booking** pricing vertical; this manifest says *five* in the Commercial section and *six* in the money section — one is wrong and the Commercial owner should settle it | a new pricing or catalog table |
| Operational Intelligence | CERTIFIED | `OPERATIONAL_INTELLIGENCE_…` | **record:** §0 of [`../platform/core/operational-calculations.md`](../platform/core/operational-calculations.md) | the module narrative [`../platform/modules/operational-intelligence-platform.md`](../platform/modules/operational-intelligence-platform.md) is `last_reviewed` 2026-07-28 and does **not** carry the record | a new registered metric key or Answer consumer |
| Communications | CERTIFIED | `COMMUNICATIONS_…` | [`../platform/modules/communications-platform.md`](../platform/modules/communications-platform.md) | — | a provider change or addition |
| Configuration | CERTIFIED | `CONFIGURATION_…` | [`../platform/governance/configuration-publication-model.md`](../platform/governance/configuration-publication-model.md) | Programs publication chain is built with **zero rows**; **record is on PR 1368, not yet on staging** | first rows in the publication chain; a fifth lifecycle |
| AI / BOS | CERTIFIED | `AI_BOS_…` | [`../platform/trust/reasoning-runtime.md`](../platform/trust/reasoning-runtime.md) | two of four Trust capabilities are deterministic — a fact, not debt; **record is on PR 1368, not yet on staging** | a new provider or adapter |
| **Financials / Payments** | **PENDING** | — | **none — do not load a Payments document as current truth** | the domain is mid-mutation, not merely undocumented | seven consecutive quiet days under `web/lib/financials/payments` |

**Declarations reconcile to twelve tokens for fourteen rows.** Operations temporal truth shares the
Enrollment/Placement declaration, and Subsidy has no token at all. Neither is a reason to doubt the
certifications, which rest on measurement recorded in the owner documents — but a table that silently
implied fourteen tokens would be the kind of tidy-looking falsehood this corpus exists to prevent.

## Financials / Payments — what may enter context now

Financials/Payments is **PENDING**, and the reason is measurable rather than editorial: the last
substantive semantic change under `web/lib/financials/payments` is `75c1a016c` (2026-09-30), with
thirteen commits under that path in the preceding seven days. The recent subjects are corrections to
core money meaning — refund ordering, held-deposit availability, payer authorization, and the
return-versus-refund distinction — not polish.

**Allowed into context now:**

- **Subsidy**, certified and stable — §0.1 of [`../platform/modules/financials-canonical-authorities.md`](../platform/modules/financials-canonical-authorities.md).
- **Commercial**, certified — [`../platform/modules/commercial-configuration.md`](../platform/modules/commercial-configuration.md).
- Core Financials QA material **only** as `EXCLUDE_HISTORY` evidence: `certification/financials/**`.
- The top-level statement that Financials/Payments is pending re-certification because its semantics
  are actively changing.

**Forbidden now:**

- Freezing current Payments behaviour into DIRECT context.
- Claiming or implying Financials certification, including by omission in a summary.
- Inferring current payment semantics from older Payments or Billing documents — several were
  overtaken during September 2026.

Subsidy and Commercial are **not** blocked by the Payments hold. They are separately certified, and
subsidy is collection suppression rather than a payment concept.

## 1. Corpus rules

These govern the whole manifest and outrank any individual entry.

1. **`status: canonical` alone does not qualify a document for DIRECT context.** Canonical means
   someone owns it; it does not mean it is the right thing to load, nor that it is current.
2. **A newer `last_reviewed` does not outrank an older canonical owner.** Review dates record
   attention, not authority. A recently-touched summary never displaces the owner it summarizes.
3. **Generated copies never outrank canonical sources.** Where a generated artifact and its source
   disagree, the source is right and the generator is stale.
4. **Sprint, audit and history material is excluded from current-truth inference** unless a task
   explicitly asks for evidence of how something came to be.
5. **Runtime, schema and code evidence outranks documentation.** When they contradict, the code is
   what ships.
6. **PLANNED_ONLY content must never be presented as implemented.** A document describing intended
   behaviour is evidence of intent only.
7. **REFERENCE_ON_DEMAND is authoritative but not part of default loading.** Pull it when the task
   touches that authority; do not preload it.
8. **Context inclusion is domain-certified, not repository-wide.** There is no default-include rule.

## 2. Treatments

| Treatment | Meaning |
|---|---|
| `DIRECT` | Load by default. Current Alloy doctrine for its domain. |
| `REFERENCE_ON_DEMAND` | Authoritative; load only when the task touches it. |
| `GENERATED_REFERENCE` | Machine-generated exactness (schemas, OpenAPI). Cite verbatim; never paraphrase. |
| `SUMMARY` | Orientation only. Never the basis for a specific claim. |
| `EXCLUDE_HISTORY` | Do not load for current-state reasoning. |
| `PLANNED_ONLY` | Intent, not implementation. |

---

## 3. Developer Platform / API — CERTIFIED

Certification: `API_DOCUMENTATION_CONTEXT_READY_PROMOTED_CERTIFIED`.

The distinction that matters most in this domain: **Alloy has two APIs**, and conflating them is the
characteristic error. `/api/v1/**` is the external partner surface with its own frozen contract.
`/api/admin/**` is internal and shares none of that contract.

| Document | Role | Authority owned | Treatment |
|---|---|---|---|
| `api/README.md` | Domain index | Which API is which; what is built vs not | DIRECT |
| `api/api-architecture.md` | Architecture | Route taxonomy, internal/external boundary | DIRECT |
| `api/developer-platform/external/alloy-developer-platform-specification.md` | External spec | The public contract as published to partners | DIRECT |
| `api/openapi/alloy-public-api.v1.json` | Machine contract | Exact public paths, operations, scopes, schemas | GENERATED_REFERENCE |
| `api/api-response-contract.md` | Internal envelope | The `/api/admin` response envelope — **internal only** | REFERENCE_ON_DEMAND |
| `api/developer-platform/guide/**` | Partner guide | Integration narrative for partners | REFERENCE_ON_DEMAND |
| `api/developer-platform/package/**` | Generated partner package | A build output; frontmatter is stripped by the generator | GENERATED_REFERENCE |
| `api/developer-platform/product/01–27` | Design history | How the platform was decided | EXCLUDE_HISTORY |
| `api/api-documentation-audit.md`, `api-contract-migration-status.md`, `openapi-readiness.md` | Workstream records | Point-in-time status | EXCLUDE_HISTORY |

**Safe inferences.** The public surface is closed and small: 18 paths, 22 operations, 13 grantable
scopes, 10 reads, 10 writes, one token exchange. The public error taxonomy is fixed. Attendance is
public; Financials and Communications are not. There are no generic PUT/PATCH/DELETE verbs.

**Forbidden inferences.** Never infer that an `/api/admin` behaviour applies to `/api/v1`, or the
reverse — shared code is not a shared contract. Never infer a public operation exists because an
internal one does. Never treat the generated package as a second source of truth for the surface.

**Higher authority.** `web/app/api/v1/**` route handlers and the OpenAPI document outrank prose.
`web/tests/support/publicSurfaceInventory.ts` derives the surface three independent ways.

**Staleness triggers.** Any new `/api/v1` route or operation; any scope added or removed; any change
to the public error taxonomy; any change to what is publicly exposed.

---

## 4. Runtime — CERTIFIED

Certification: `RUNTIME_DOCUMENTATION_CONTEXT_READY_PROMOTED_CERTIFIED`.

| Document | Role | Authority owned | Treatment |
|---|---|---|---|
| `platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md` | Freeze | The 15 canonical laws and 11 load-bearing seams | DIRECT |
| `platform/runtime/runtime-realization-architecture.md` | Architecture | How the runtime is realized | DIRECT |
| `platform/runtime/alloy-runtime-kernel.md` | Kernel | Preparation keying and kernel contract | DIRECT |
| `runtime/CARD-READINESS-LIFECYCLE.md` | Readiness definition | `ALL_FIRST_ORDER_READY` and the readiness lifecycle | REFERENCE_ON_DEMAND |
| `platform/runtime/operator-runtime-performance-certification.md` | Certification | Measured performance envelope | REFERENCE_ON_DEMAND |
| `platform/runtime/runtime-realization-engineering-specification.md` | Engineering spec | Orientation; still `status: proposed` | SUMMARY |
| `platform/runtime/runtime-implementation-authorization.md` | D1 contract | Proposed; **not ratified** | PLANNED_ONLY |
| `platform/runtime/stage-work-view-queue-canonical-model.md` | Fork diagnosis / plan | Why the queue fork exists and how it would resolve | PLANNED_ONLY |
| Runtime sprint, audit and preparation records | History | How the runtime got here | EXCLUDE_HISTORY |

**Safe inferences.** The freeze's laws hold and are verified by content rather than by file hash.
The runtime keys preparation by lens. Guard suites exist for the named seams.

**Forbidden inferences.** Never infer that a document being governed makes it the context owner.
Never treat `runtime-implementation-authorization.md` as ratified — two D1 guard suites cite it, and
a test citation is not ratification. Never read the Stage/Work View/Queue model as current
architecture: the fork it describes is still live.

**Higher authority.** The guard suites under `web/tests/runtime/**` and the seam files the freeze
names. Where the freeze and a seam disagree, read the seam.

**Staleness triggers.** Any law or seam changed; any guard suite removed; a performance envelope
re-measured; the D1 contract ratified or withdrawn.

---

## 5. Business Process — CERTIFIED

Certification: `BUSINESS_PROCESS_DOCUMENTATION_CONTEXT_READY` (2026-09-30). Implementation and doctrine
agree, and the final lifecycle writer census carries **zero unexplained writers**.

| Document | Role | Authority owned | Treatment |
|---|---|---|---|
| `platform/core/business-process-system.md` | Operator model | Business Process → Stage → Record; stage membership; what the canonical lifecycle path owns | DIRECT |
| `platform/core/stage-membership-and-outcomes.md` | Stage membership | Persisted `stage_key`, outcomes, subject grain | DIRECT |
| `platform/core/status-and-state-system.md` | Durable status | The three governed status domains and the one transition-policy gate | DIRECT |
| `platform/core/work-view-membership-and-navigation.md` | Work View | Membership evaluation, one evaluator, navigation | DIRECT |
| `platform/modules/business-process-execution-platform.md` | Execution runtime | Command/action execution surface | REFERENCE_ON_DEMAND |
| `platform/modules/actions-and-workflows.md` | Actions | Action runtime contract, Create Lead contract | REFERENCE_ON_DEMAND |
| `platform/operator/current-work-surface.md` | Current Work | The projection surface (owns no durable truth) | REFERENCE_ON_DEMAND |
| `platform/operator/queue-system.md` | Queue | Preview/materialization contract | REFERENCE_ON_DEMAND |
| `platform/core/data/action-status-field-matrix.md` | Field authority | Which action writes which field | REFERENCE_ON_DEMAND |
| `platform/runtime/stage-work-view-queue-canonical-model.md` | Fork diagnosis / plan | Why the queue fork exists; unexecuted convergence | PLANNED_ONLY |
| BP sprint, audit and closeout records | History | How this came to be | EXCLUDE_HISTORY |

**Safe inferences.** Stage position is persisted in `stage_key`. Intake/Processing establishes the
initial position; canonical process/outcome execution owns every subsequent movement. Governed status
changes pass one transition-policy gate (`validateStatusTransition` over `status_transition_rules`),
for case and child grain alike. Prior-stage reconciliation belongs to canonical lifecycle execution and
carries the operator's per-item disposition. The generic record PATCH is not lifecycle authority and
refuses governed lifecycle fields. Current Work is a projection and interaction surface that owns no
durable truth. Work View membership is computed and does not define process position. Queue is
preview/materialization. The Work Items Business Process source projects existing stage work rather
than duplicating it. A fresh child participation stores `new_inquiry`; "New Lead" is display language.

**Forbidden inferences.** Never infer that a raw status PATCH is a valid lifecycle pattern — it is
refused. Never infer that status defines stage, or that Work View membership defines process position.
Never treat the proposed stage-condition vocabulary (`membership_criteria_v1`, `entry_conditions`,
`exit_conditions`) as implemented — only `queue_membership_v1` exists. Never treat
`placement_candidates.status` as a governed Status domain; it is DB-CHECK-bound domain state. Never read
a historical compatibility writer as forward architecture. Never infer an outcome may bypass the
transition gate — no override exists.

**Implementation evidence that outranks these documents.**
`web/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition.ts` (the canonical path, its gate and
its reconciliation), `web/lib/lifecycle/stageOutcomeRuleTargetExecutor.ts` (outcome targets),
`web/app/api/admin/opportunities/[id]/route.ts` (the refusal), and
`web/lib/lifecycle/operationalProjection.ts` (the one membership/count evaluator).

**Staleness triggers.** A new writer of any governed lifecycle field; the record route accepting a
lifecycle key again; reconciliation or the transition gate leaving canonical execution; a second
transition validator; a change to the governed status-domain set; `placement_candidates.status` being
brought into `status_definitions`.

---

## 6. Identity / Authentication / Roles / Access — CERTIFIED

**State:** `IDENTITY_ACCESS_DOCUMENTATION_CONTEXT_READY_PROMOTED_CERTIFIED`.

Authority discovery completed 2026-09-29; RLS Model A was ratified 2026-09-30; the convergence pass
measured the estate afresh, found a cross-tenant mutation class the first pass had no term for, and
authored the repair. **The last gate closed 2026-09-30:** PR 1350 merged and `20261107120000` applied to
the deployed primary.

### The gate, and how it was proven closed

Per-version against the deployed primary, never max-version inference
(`certification/migrations/identity-access-apply-verification.sql`, run 2026-09-30T18:59Z):

| Version | Applied |
|---|---|
| `20261104120000` — org/actor-parameterized RPC EXECUTE boundary | **true** |
| `20261104130000` — RLS on unprotected org tables | **true** |
| `20261107120000` — unchecked mutating RPC EXECUTE boundary | **true** |

RPC authority, deployed (`identity-access-rpc-and-tenancy-census.sql`):

```
mutating_rpc_excluding_triggers ~ authenticated_executable ~ 0
mutating_rpc ~ no_caller_authority_check ~ 0
```

RLS, deployed (`identity-access-model-a-authority-census.sql`): **322 of 322** public base tables have
row level security enabled, **zero** disabled. `payment_provider_disputes` and
`commercial_policy_exceptions` each carry RLS with a service-role policy and grant `authenticated`
SELECT only. `app_users` has **zero untenanted write policies** and reads are `id = auth.uid()`.
`work_units` is org-scoped through `current_org_id()`.

> **`authenticated` still holds table-level INSERT/UPDATE/DELETE grants on `app_users` and
> `work_units`.** That reads alarming without the policy context and is not an exposure: under Model A
> RLS owns tenant isolation, and a grant with no admitting policy denies. For `app_users` the write
> policy count is zero, so those grants admit nothing; for `work_units` every policy is org-scoped.
> Do not "repair" the grants — the policies are the control.

### What the shape-based predicate caught that names would not have

`20261107120000` defines its watched family by DANGER SHAPE — mutating, client-executable, and
performing no recognised caller-authority check — rather than by parameter name. That choice paid for
itself twice.

The named target was `post_ledger_transaction`, which the earlier parameter-name predicate missed
because it takes `p_ledger_tx_id` rather than `p_org_id`. The unnamed one was
**`record_child_attendance_event`**: `SECURITY DEFINER`, taking `p_org_id` **from the caller**,
performing no authority check, and granting EXECUTE to `authenticated` — so any signed-in principal
could write an attendance event into any organization. It was closed by the same apply, and safely:
every mounted caller (`admin/childcare-attendance`, `public/kiosk/attendance`, `public/kiosk/identify`)
uses the service-role client, so no legitimate path called it with a user JWT.

**A name-shaped audit would have left it open.** That is the same failure mode recorded in
`assignments-authority-model-debt.md`, in the opposite direction.

### Remaining implementation debt — bounded, and not model uncertainty

**319 of 872 route handlers carry no declared capability** (303 program-owned, 16 inherited; ceiling
303, ratcheted downward only). 56 of those are mutations. This is W-15's burndown and it is
**propagation work, not doubt about the authority model**: the model is Model A, ratified and now proven
closed at the database boundary. Each pending handler is enumerated in
`scripts/routeCapabilities.declared.json` with a reason, so authority per route is a known quantity.

Do not read the pending count as "the domain is ungated": 456 handlers declare and bind a capability,
and the database-level exposures that a missing route gate could have been exploited through are the
ones this section just proved closed.

### Blockers closed on the documentation axis

- **The Director gate.** RATIFIED 2026-09-30 (Model A): route capabilities authorize, RLS isolates
  tenants, supported mutation is server-side under `service_role`, UI visibility is presentation only.
  Lives in `platform/foundation/platform-decisions.md` § *2026-09 — Route capabilities authorize; RLS
  isolates tenants; mutation is server-side*.
- **The tenancy class.** The 51 `app_users` write policies with no org predicate and the 2 `work_units`
  self-comparison tautologies are **gone** — remeasured to zero 2026-09-30 by reading every write
  policy's text, not by a negative pattern test. Repaired by `20260916040000`; held by
  `tests/access/rlsTenancyLock.test.ts`.
- **Cross-tenant read exposure.** Two tables had no RLS at all (`payment_provider_disputes`,
  `commercial_policy_exceptions`), both with `org_id` and a standing `authenticated` SELECT grant, so
  any authenticated principal read every organization's rows. **Repair authored** in
  `20261104130000` — *not yet applied; see the gate above.* The estate invariant is held going forward
  by `tests/access/rlsEstateCoverage.test.ts`.
- **The authentication/session layer has an owner.**
  `platform/governance/authentication-and-session-model.md` — new, canonical, and explicit about which
  facts are Alloy's, which are Supabase's, which are **UNKNOWN_EXTERNAL** provider configuration, and
  which are simply absent.

### The finding this pass added

**SECURITY DEFINER functions taking their organization as a parameter.** The September measurement
framed the drift as *table grants* and called it latent because RLS still denies the write. That
reasoning does not extend to SECURITY DEFINER, which never consults RLS at all — and nobody had
counted those.

Measured: **14 mutating functions EXECUTE-granted to `authenticated`, 9 SECURITY DEFINER, none
containing any caller-authority check.** Every one took `p_org_id` as a parameter. The live subset is
`execute_lead_status_mutation` / `execute_enrollment_status_mutation`, which write governed lifecycle
state for whatever org the caller names — bypassing the route, the capability check, and
`validateStatusTransition` together. **Repair authored** in `20261104120000`, which also **widens `access_rpc_boundary_report`** so the
existing live lock guards the *shape* rather than the *spellings* that let this family through. *Not
yet applied to the deployed primary; see the gate above.*

### Debt that remains, with exact sizes

| Debt | Size | Why it is not a certification blocker |
|---|---|---|
| `authenticated` INSERT/UPDATE/DELETE grants the architecture never needed | **259 tables**; **56** of them have no write policy at all | Latent by mechanism: RLS denies, and no supported path uses the authenticated principal to write. Phase 4 retires them per table family; the 56 are the risk-free start |
| Route handlers with no declared capability | **319 of 872** (303 owned + 16 frozen), across **122 route families**; **56 are mutations**, 263 reads | Measured, enumerated, and CI-gated by `scripts/checkRouteCapabilities.mjs` with a **downward ratchet**. Authority per route is knowable from `scripts/routeCapabilities.declared.json`; it is a known quantity, not an unknown one |
| Write policies resting on `current_org_id()` | 41 | Returns NULL above one organization (measured: 3 orgs), so all 41 **deny**. Fails closed — but would silently become permissive in a single-org deployment |
| Write policies matching none of the four known shapes | 142 | None are unconditionally permissive (measured: 0). Unclassified, not unsafe |
| Read semantics for the two newly RLS-protected tables | 2 tables | Both are service-role-only reads today, which is what the product does. Choosing an org-scoped authenticated read predicate is a Financials decision, ledgered rather than guessed |

**Route capability, stated correctly.** Of **872** handlers across 674 route files: **456 declare and
bind a capability**, **97 are declared admission-sufficient**, **319 are pending**. An earlier version
of this pack said "~17 assert a capability" — that was wrong by more than an order of magnitude and
would have led a reader to believe the domain was essentially ungated. It is roughly half-gated, with
the remainder enumerated.

**Admission is not authorization, and the helper name hides it.** `requireAdminOrOps` resolves
`portal.access` and *returns* the principal's permission-key union; asserting a key from it is the
route's job. The invariant is locked polarity-aware by
`tests/access/admissionDoesNotAuthorize.test.ts`: using admission affirmatively to grant
(`if (portalEligible) return true`) fails; using it to refuse (`if (!portalEligible) return forbidden`)
is correct and common.

**Customer/parent authentication is ABSENT** — no credential, no portal, no session. Stated in code as
unsolved (`lib/access/linkedPersonIdentity.ts`). Everything in `platform/planning/**` describing one is
PLANNED.

### Treatment

**DIRECT:** `platform/governance/roles-and-permissions.md`,
`platform/governance/authentication-and-session-model.md`,
`platform/foundation/platform-decisions.md` § *2026-09*.
**REFERENCE_ON_DEMAND:** `platform/governance/rls-authority-model-director-gate.md` — read it as the
*measurement and staged plan*, no longer as an open decision; its §*Remeasured 2026-09-30* supersedes
every count in §*The database, measured*.
**GENERATED_REFERENCE:** `scripts/routeCapabilities.declared.json` — the authoritative per-route
answer, and the only place to ask it.
**PLANNED_ONLY:** `platform/planning/access-identity-v2/**`, `platform/planning/vacilando-os/qa/**`.

### SAFE inferences

- Route capability checks authorize domain operations; RLS isolates tenant data.
- Supported server writes run under `service_role` **after** the application has authorized them.
- UI visibility is presentation only and grants no authority.
- Role permissions are additive across roles, scoped to an organization.
- User→Person linkage is explicit (`user_person_links`); email is contact data, never identity.
- Portal admission (`portal.access`) is a real grantable capability, and it is not domain authorization.
- The browser Supabase client is for `supabase.auth.*`; it does not write.

### FORBIDDEN inferences

- ✗ Portal admission means all admin actions are allowed.
- ✗ Hidden UI implies server authorization exists.
- ✗ RLS is the product permission system.
- ✗ Email identifies the canonical Person.
- ✗ Parent or customer login exists.
- ✗ Planned Access V2 constructs are implemented.
- ✗ Direct PostgREST mutation is supported merely because a DB grant exists.
- ✗ A route is capability-gated because it is under `/api/admin/`. Ask the declared table.
- ✗ MFA, trusted devices, or account disabling exist. Two are absent; the third is provider-side and unverified here.
- ✗ There is a session idle timeout. The mechanism exists and ships disabled.
- ✗ Revoking membership disables the credential. It does not — the user still authenticates and fails admission.
- ✗ Provider settings (password policy, token lifetime, signup openness, rate limits) can be inferred from this repository.

---

## 7. How downstream AI should use this pack

**Default reasoning.** Treat DIRECT entries as current Alloy doctrine. That is the whole default
context; nothing outside it is implied.

**Detail retrieval.** Load REFERENCE_ON_DEMAND only when the task touches that authority. Pulling it
speculatively re-creates the context bloat this manifest prevents.

**Machine contracts.** For anything that must be exact — a public path, a scope name, a schema field
— read GENERATED_REFERENCE and quote it. Do not paraphrase a contract.

**Conflicts.** If runtime, schema or code evidence contradicts a document, **do not silently prefer
the document, and do not silently prefer the code.** Surface the contradiction, name both sides, and
say which one the corpus rules make authoritative (rule 5: the code ships). A silently-resolved
contradiction is how a stale doc becomes a confident wrong answer.

**Planning.** Never infer implementation from PLANNED_ONLY. If a task depends on something only a
PLANNED_ONLY document describes, say it is not implemented.

**History.** Exclude EXCLUDE_HISTORY from current-state reasoning. Use it only when asked why
something is the way it is.

**Uncertified domains.** For a domain not listed here, say it is uncertified rather than reasoning
from whatever the tree happens to contain. The tree is not the corpus.

---

## 8. Maintenance

This manifest is versioned, not eternal. The base SHA records what was true when the current version
was certified; it is not a claim that the repository must stay there.

### Version history

| Version | Base | Change |
|---|---|---|
| **V2** | `3c4ac97f1` + PR 1368 | **Foundation synthesis.** Fourteen certified records synthesized into a five-file Tier 1 set; the domain status scoreboard and the Financials placeholder added here. Reconciled three internal inconsistencies in this manifest: Commercial was listed both NOT CERTIFIED and CERTIFIED, the pending-DELETE count differs between two sections, and declarations reconcile to twelve tokens for fourteen rows (Operations shares Enrollment/Placement's; Subsidy has none). Foundation convergence corrected four documents whose canonical claims had gone stale — most seriously a foundation document asserting Alloy has no partner API while `/api/v1` is a frozen 18-path contract with an OAuth token exchange. |
| **V1** | `f3fd86b4b` | Identity/Access measured, repaired in code, and **still pending certification on one gate** — the migration apply (§6). Its authentication/session layer gained a canonical owner, the cross-tenant SECURITY DEFINER mutation family was closed, and the route-capability figure was corrected from "~17 assert a capability" to **456 of 872 handlers declare and bind one** — an error of more than an order of magnitude that would have led a reader to believe the domain was essentially ungated. |
| V0 | `9cbe2915b` | First certification: Developer Platform / API, Runtime, Business Process. |

Re-certify a domain when any of these occur:

- product behaviour in that domain changes;
- schema ownership moves;
- a new platform decision lands;
- a canonical owner changes, is split, or is retired;
- a domain's certification is reopened;
- a document in the pack changes treatment.

Adding a domain requires an authority-discovery pass for it first — the same standard API, Runtime
and Business Process were held to. Do not add a domain to this pack because its documents look tidy.
