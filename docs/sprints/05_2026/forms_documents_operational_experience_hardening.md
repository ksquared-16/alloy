# Forms/Documents — Operational Experience Hardening Sprint

**Path:** `docs/sprints/05_2026/forms_documents_operational_experience_hardening.md`  
**Date:** May 2026  
**Status:** UX implementation cards **UX-G through UX-H + P2-5** shipped — operational architecture ahead of visual layer.  
**Position in program:** Inserted **after** Forms/Documents Phase 2 **P2-1 → P2-4**; established the **canonical BOS operational interaction reference** for AdminV2.  
**Successor (visual layer):** [`forms_documents_product_experience_refresh.md`](./forms_documents_product_experience_refresh.md) — **PX-0 complete** (operational visual audit, visual doctrine, PX-1–PX-7 plan); implementation not started.

**Binding inputs (do not diverge):**

| Phase | Document |
|-------|----------|
| Phase 2 foundation | [`forms_documents_phase_2_packet_review_mvp.md`](./forms_documents_phase_2_packet_review_mvp.md) |
| Phase 2 audit | [`forms_documents_phase_2_step0_audit.md`](./forms_documents_phase_2_step0_audit.md) |
| Phase 2 design | [`forms_documents_phase_2_step1_design.md`](./forms_documents_phase_2_step1_design.md) |
| Product | [`docs/product/documents-and-forms.md`](../../product/documents-and-forms.md) |
| BOS placement (read-only) | [`docs/product/bos-foundation.md`](../../product/bos-foundation.md), [`bos_ux_coherence_sprint.md`](./bos_ux_coherence_sprint.md) |
| BOS recommendation program | [`bos_operational_recommendation_intelligence_sprint.md`](./bos_operational_recommendation_intelligence_sprint.md), [`completed/bos_operational_recommendation_phase1_execution.md`](./completed/bos_operational_recommendation_phase1_execution.md) |

**Product docs to update when cards ship:** `docs/product/documents-and-forms.md` (operator UX sections only).

---

## Overview

### Sprint objective

Harden **operational UX** on top of the shipped Forms/Documents read-model and review foundations (P2-1–P2-4). The backend capability gap is largely closed; the primary failure mode is now **operator cognitive load**: weak hierarchy, technical leakage, fragmented narrative, and surfaces that read like internal tooling instead of a premium case-file system.

This sprint is **not** major new capability. It is **layout, copy, disclosure, visual coherence, and workflow clarity** — preserving contracts, review PATCH semantics, and auditability.

### Success statement

An operator can open any intake/review path (standalone submission, public intake, or multi-step packet session) and **within seconds** understand: what this is, who submitted it, what needs attention, what changed vs what was already known, which artifacts exist, and what action to take — without reading JSON, UUIDs, or engine jargon first.

### Explicit non-goals

| Forbidden | Notes |
|-----------|-------|
| **P2-5 BOS insight** | Shipped — see Phase 2 MVP doc; visual polish in product refresh sprint |
| DCP / field-level CRM apply | Deferred program |
| New rollup contract version | Extend presentation only unless product amends frozen contract |
| Review PATCH semantic changes | Status values and server behavior unchanged |
| Migrations, packet state engine, queues | Out of scope |
| Public embed branding / re-open correction | Deferred |
| Communications refactor | Out of scope |
| `enrollment_context` API rename | Design may alias in UI; breaking rename is separate amendment |

### Implementation cards (execute in order)

| Card | Title | Depends on |
|------|-------|------------|
| **UX-G** | Shared spacing / type / status primitives | — (foundation for others) |
| **UX-A** | Forms hub operational refresh | UX-G |
| **UX-B** | Form detail lifecycle layout | UX-G |
| **UX-C** | Packet definition operational framing | UX-G |
| **UX-E** | Technical detail progressive disclosure | UX-G (pairs with UX-D) |
| **UX-D** | Packet / submission review case-file redesign | UX-G, UX-E |
| **UX-F** | Documents / provenance visual cleanup | UX-G, UX-D (partial parallel) |
| **UX-H** | BOS summary placeholder region | UX-D |

**Recommended batching:** UX-G → (UX-A ∥ UX-B ∥ UX-C) → UX-E → UX-D + UX-F → UX-H.

---

## Critical platform boundary

Enrollment packets are the **proving ground**, not the architecture ceiling. All UX decisions must generalize:

| Mode | Primary surfaces today | Hardening target |
|------|------------------------|------------------|
| Standalone operational form | `FormDetailClient`, submissions list/detail | Lifecycle hub + single-submission case file |
| Public lead / intake | Public embed + `FormSubmissionDetailClient` intake blocks | Intake-first narrative; prefill trust on embed (future) |
| Multi-step packet | `PacketReviewRollupView`, packet session page, opportunity modal | Packet case file; same region order as standalone |

**Preserve reusable:** review patterns, provenance patterns, submission lifecycle, document linkage, prefill infrastructure (`web/lib/forms/prefill/**`), rollup API (`GET .../review-rollup`).

**Avoid:** enrollment-only headings in shared components, hardcoded vertical copy in `PacketReviewRollupView`, packet-only mental models on standalone submission review.

**Contract note:** Rollup field `enrollment_context` is opportunity-centric naming; UI should present **Intake context** / **Linked records** and map labels from `launch_surface` + linkage — rename deferred to avoid P2 contract churn.

---

## Prefill doctrine (UX hardening)

| Layer | Operator truth |
|-------|----------------|
| CRM / launch / field maps | Hydrates **drafts** only |
| `form_submissions.payload` | **Submitted** answers — authoritative in review |
| `crm_snapshot` / `shared_values` | Compare hints — not silent CRM mutation |
| Review PATCH | Packet decision + PDF backfill — not arbitrary CRM apply |

**This sprint must identify and stage:**

- Where **already known** vs **new or changed** appears (rollup warnings → field-level badges in UX-D).
- How prefilled vs operator-entered reads on **public** surfaces (document only in UX-D/E; embed changes are follow-on).
- Where **BOS** may later summarize diffs (UX-H placeholder; P2-5 consumes rollup, does not write CRM).

---

## Operational UX doctrine

Every intake/review surface separates three layers:

1. **Operator understanding** — headline, subject, status, attention, human labels  
2. **Operational review / action** — answers, artifacts, linkage fixes, approve/reject  
3. **Technical / debug detail** — IDs, JSON, launch metadata, intake debug — **collapsed by default**

**Rules:**

- Never expose system architecture before operational meaning.
- Do not remove auditability — contain it.
- Primary actions above the fold when `needs_review` / linkage blocked.
- One visual “case file” vocabulary across packet page, opportunity modal, and submission detail.

---

## Unified BOS Operational Interaction Doctrine

**Canonical status:** This section is the **shared interaction contract** for Forms/Documents and BOS Operational Recommendation programs. The Forms/Documents case-file + Review assist pattern (`IntakeCaseFileLayout`, `BosReviewSummaryPlaceholder`, `PacketReviewInsightV1`) is the **reference interaction model** for AdminV2 operational intelligence surfaces.

**Mirrored in:** [`bos_operational_recommendation_intelligence_sprint.md`](./bos_operational_recommendation_intelligence_sprint.md) § Unified BOS Operational Interaction Doctrine; binding for Phase 2+ presentation work in [`completed/bos_operational_recommendation_phase2_operational_ux.md`](./completed/bos_operational_recommendation_phase2_operational_ux.md) (includes **§0.4 doctrine alignment audit** — AdminV2 drawer/queue/handoff convergence checklist).

### BOS role

BOS **is:**

| Role | Operator meaning |
|------|------------------|
| **Operational narrator** | States what the record/session is and where it stands |
| **Reviewer assistant** | Orients review without replacing judgment |
| **Anomaly detector** | Surfaces diffs, linkage gaps, and attention flags |
| **Workflow explainer** | Connects signals to existing workflow/action paths |
| **Operational prioritization layer** | Ranks what deserves attention first |

BOS **is not:**

| Anti-pattern | Why forbidden |
|--------------|---------------|
| Chatbot | No transcript UI, no conversational turn-taking |
| Autonomous agent | No silent execution or implied authority |
| Giant AI paragraph generator | No walls of prose; structured bullets only |
| Hidden workflow engine | Workflows remain visible and governed |
| Silent mutation system | All writes via known admin routes after human action |

### Operational cognition hierarchy

All BOS and intake/review surfaces must prioritize information in this order:

1. **Current operator action** — what can I do here, now?  
2. **Trust / confidence state** — ready, needs attention, incomplete, blocked  
3. **Changes / anomalies** — what differs from known records  
4. **Operational context** — who, what flow, linked records  
5. **Suggested focus** — where to look next (orientation, not command)  
6. **Technical detail** — IDs, JSON, debug — collapsed by default  

The UI must answer, in order:

1. What is this?  
2. Is anything wrong?  
3. What changed?  
4. What should I review?  
5. What should I do next?  

…before exposing implementation detail.

**Forms reference mapping:**

| Layer | Forms implementation |
|-------|----------------------|
| Orientation | `PacketCaseFileHeader`, intake context panel |
| Trust / confidence | `BosReviewSummaryPlaceholder` readiness + checklist (`PacketReviewInsightV1`) |
| Changes | `WhatChangedPanel` + insight `key_changes` |
| Context | Intake context, submitted forms, documents |
| Suggested focus | Insight `suggested_focus` + review paths |
| Technical | `PacketReviewTechnicalPanel`, collapsed disclosures |

**AdminV2 drawer/queue mapping (Phase 2+):** Queue strip, drawer L1, and handoff must converge on the same six-layer grammar — not a separate “suggestion feed” personality.

### Human authority doctrine

BOS **may:** summarize, explain, prioritize, suggest, draft (governed).

BOS **may not:** silently mutate records, bypass review, bypass workflows, bypass permissions, or imply autonomous authority.

All operational decisions remain **human-owned**. Copy must preserve explicit approval paths (approve / reject / request correction; governed Task Assist; workflow actions).

### Intelligence style doctrine

BOS should feel: **calm, concise, contextual, operational, trustworthy.**

Avoid: assistant-chat UX, giant summaries, flashy AI marketing, excessive color/emphasis, recommendation overload, multiple competing “AI” cards on one surface.

**Surface budget:** One primary intelligence region per page (e.g. region 3 Review assist on case file; one drawer strip band). Secondary surfaces defer or collapse.

### Deterministic-first doctrine

Preference order:

1. **Deterministic operational reasoning** — rollup, resolver, linkage, warnings, progress  
2. **Structured heuristics** — catalogs, checklists, readiness rules  
3. **Explainable guidance** — template copy tied to signal keys  

Only then:

4. **LLM enrich** (optional) — copy polish, preview-only, non-authoritative  
5. **Speculative recommendations** — never without grounding signals  

LLM enrich remains: secondary, explainable, optional, non-authoritative. Shipped: `PacketReviewInsightV1` (P2-5); deferred: packet review enrich (P2-6), attention enrich (existing, preview-only).

### Anti-patterns (program-wide)

| Do not ship | Ship instead |
|-------------|--------------|
| Multiple BOS personalities per product area | One vocabulary: readiness, summary bullets, attention, focus, paths |
| “Alloy suggestion” as primary framing | “Review assist” / operational judgment support |
| Resolver labels as the only headline | Catalog or case-file title + supporting resolver context |
| AI card spam in drawer + queue + panel | One canonical story per entity; projections differ by density only |
| Chatbot drift in Orchestrator | Handoff seeds; no open-ended agent persona on operational records |

---

## Program handoff — visual layer

Operational **logic and hierarchy** from this sprint are largely complete. The remaining gap is **unified operational product experience** (spacing, typography, surface treatment, emotional quality).

Do **not** reopen review PATCH semantics, rollup contracts, or BOS insight builder logic in the visual refresh sprint unless a presentation-only extension is required.

See: [`forms_documents_product_experience_refresh.md`](./forms_documents_product_experience_refresh.md).

---

## Part 1 — UX audit

Evidence: P2-1–P2-4 shipped; UI walkthrough of `web/app/admin/forms/**`, `web/components/forms/packets/**`, `web/components/admin/opportunity/*PacketReview*`, `EntityDocumentsSection.tsx`.

### 1.1 Current UX pain points (by focus area)

#### Focus 1 — Forms hub (`FormsHubClient.tsx`)

| Pain | Evidence |
|------|----------|
| Reads as **onboarding doc + data table**, not operations desk | Large “Forms in Alloy” + numbered how-to; `schema_version: 1` and `metadata.operator_context` in hub copy |
| No **operational signals** at hub level | Table shows publish/active/updated only — no pending review counts, packet usage, or “needs attention” |
| Weak **primary action** hierarchy | Every row equal weight “Open form workspace”; no quick path to submissions awaiting review |
| Seed / demo block feels **engineering-runbook** | `FormsSeedEnvironmentHint` with CLI on dev/preview |
| Packet entry is **footer link text**, not first-class ops | “Packet sessions” / “Packet definitions” as inline links under header |

#### Focus 2 — Form detail (`FormDetailClient.tsx`)

| Pain | Evidence |
|------|----------|
| **Accordion dump** — six+ nested `<details>` with similar visual weight | Operator guide, versions, links, schema workspace compete equally |
| Lifecycle exists but **incomplete vs stated ideal** | 5-step strip: Share → Open → Submit → Review → Document — missing **Design** and **Publish** as first-class stages |
| **Gray-box fatigue** — repeated `border-[#e6e8ec] bg-[#fafbfd]` panels | Preview callout + SectionCards + nested details |
| Schema editor **dominates** after scroll — ops actions not sticky | `FormSchemaWorkspace` full width below marketing-style guide |
| Technical leakage | `kind`, internal keys, connected-system bullets with engine terms |

#### Focus 3 — Packet definition (`PacketDefinitionDetailClient.tsx`)

| Pain | Evidence |
|------|----------|
| **CRUD admin** — name/desc/active + step rows + save | No “orchestration” narrative (who completes, how launched, what review means) |
| Empty states are **form errors**, not guided onboarding | Blank step row with little “start here” framing |
| Public link block **technical** (token prefix, embed path) | Weak connection to opportunity launch / intake modes |
| No visibility into **in-flight sessions** or review backlog tied to this definition |

#### Focus 4 — Submission / packet review (**highest priority**)

| Pain | Evidence |
|------|----------|
| **Wrong information order** in `PacketReviewRollupView` | Order today: (1) “Enrollment context” + UUIDs (2) Linkage summary (3) Name hints (4) All step answers (5) Per-step artifacts duplicated (6) Documents index (7) Technical JSON (8) Review actions **last** |
| Enrollment-specific **shared surface** | Section title “Enrollment context”; opportunity launch copy hardcoded |
| **Case file missing** — no family/household hero, no “what changed” band | `enrollment_context` has labels but rendered as bullet list with monospace IDs |
| Linkage / warnings **compete** with answers instead of “Needs attention” strip | Multiple amber boxes before content |
| Documents **triple-listed** — per-step artifacts + documents index + opportunity tab | Cognitive duplication |
| Standalone `FormSubmissionDetailClient` **better** (outcome summary first) but still exposes UUID rows, launch context panels, intake debug early | ~1000 lines; linkage workflow mixed with answers |
| Review actions **below fold** on page and modal | `reviewActionsSlot` after technical details |
| No **prefill vs changed** UX | Warnings are name-only; no field badges |
| BOS region **absent** | No placeholder; P2-5 would have nowhere consistent to land |

#### Focus 5 — Documents experience

| Pain | Evidence |
|------|----------|
| Provenance exists (P2-4) but **visually quiet** | `EntityDocumentsSection` 11px provenance line easy to miss |
| **Generated vs submitted record** badges present but not grouped** | Flat list on opportunity Documents |
| **Current vs historical** heuristic (`generation_label`) not explained | Operators see “Regenerated” without legend |
| Packet review **Documents index** feels like API dump | Secondary list after per-step duplication |

#### Focus 6 — Technical detail leakage

| Surface | Leakage examples |
|---------|------------------|
| `PacketReviewRollupView` | `session status`, `item_status`, `launch_surface` enum, monospace `opportunity_id` / `customer_id` |
| `FormSubmissionDetailClient` | `public_link_intake_debug`, launch context fields, `ConnectionRow` UUID chips |
| Forms hub | `org_id`, `schema_version`, seed CLI |
| Packet sessions list page | Raw `status` enum in table |
| Form detail | Version table IDs, link token prefix |

#### Focus 7 — Inconsistent interaction patterns

| Pattern | Issue |
|---------|-------|
| Review actions | Packet page: full-width form; opportunity modal: compact footer — same semantics, different chrome |
| Navigation | Mix of `admin` and `adminV2` paths via `ADMIN_FORMS_UI_BASE` — consistent URL but uneven AdminV2 shell polish on forms layout |
| Attention banners | Amber 2px border on submission vs softer amber on packet rollup |
| Status labels | `operatorReviewStatusLabel` vs raw `row.status` enums side by side |
| Open document | Button in rollup vs link in entity documents — same action, different affordances |

#### Focus 8 — Missing workflow guidance

| Gap | Impact |
|-----|--------|
| No **“what do I do next?”** on forms hub | Operators hunt per form |
| Form detail doesn’t surface **unreviewed submission count** | Must open submissions list |
| Packet definition doesn’t explain **review gate** after completion | Ops discover via opportunity drawer |
| Packet session list doesn’t filter **needs_review** | `/adminV2/forms/packets` is chronological only |
| Correction loop invisible | `needs_correction` status with no guided resend copy |

#### Where BOS would fail UX today (pre P2-5)

| Failure mode | Cause |
|--------------|-------|
| Insight **competes with linkage JSON** | No dedicated summary region; LLM text would land mid-page |
| **Implies CRM mutation** | If placed near “Enrollment context” with UUIDs |
| **Chatbot drift** | No frame/copy contract for bullet narrator vs thread |
| **Duplicates warnings** | `operator_review.warnings` already shown — BOS must synthesize, not repeat verbatim |
| **Wrong vertical voice** | Enrollment-specific section titles bias model copy |

---

## Part 2 — Target experience design

### 2.1 Experience principles

| # | Principle |
|---|-----------|
| P1 | **Meaning before mechanism** — human labels, statuses, and next action before IDs and enums |
| P2 | **One case file** — shared region order across packet, submission, and drawer modal |
| P3 | **Attention is scarce** — single “Needs attention” band; collapse duplicate amber panels |
| P4 | **Progressive disclosure** — technical detail collapsed; expand preserves audit trail |
| P5 | **Artifact clarity** — group documents; one provenance vocabulary (`documentProvenanceDisplay.ts`) |
| P6 | **Vertical-neutral language** — “Intake context”, “Packet session”, “Submitted forms” |
| P7 | **Prefill is context, submit is truth** — badge semantics for known/changed/new (presentation-layer; rollup warnings first) |
| P8 | **BOS is narrator, not actor** — read-only region; no apply; calm bullet frame |
| P9 | **AdminV2 coherence** — reuse drawer/attention typography (`alloy-*` where modal), shared status chips from UX-G |

### 2.2 Proposed page hierarchy (forms module)

```
/adminV2/forms                          → Operations hub (health + attention + definitions)
/adminV2/forms/[formId]                 → Lifecycle workspace (Design → Publish → Share → Review)
/adminV2/forms/[formId]/submissions     → Submission queue (filter: submitted, needs linkage)
/adminV2/forms/[formId]/submissions/[id]→ Standalone case file
/adminV2/forms/packet-definitions/...   → Packet orchestration (compose + launch guidance)
/adminV2/forms/packets                  → Session ops list (filter: completed, needs_review)
/adminV2/forms/packets/[sessionId]      → Packet case file (rollup-driven)
```

Opportunity drawer modal **embeds same case-file body** as packet session page (already uses `PacketReviewRollupView`; UX-D refactors internals only).

### 2.3 Proposed case-file region order (packet + generalized)

Applies to `PacketReviewRollupView` (`page` | `modal`) and informs standalone `FormSubmissionDetailClient` (subset of regions).

| Order | Region | Content source | Notes |
|-------|--------|----------------|-------|
| 1 | **Case header** | `packet_definition.name`, `operator_review.status`, `progress`, primary subject labels from context block | Title: “Packet review” not “Enrollment Packet Review” unless tenant copy |
| 2 | **Intake context** | `enrollment_context` → display aliases | Household/opportunity/customer **labels**; IDs only in technical |
| 3 | **BOS review summary** (UX-H) | Placeholder → P2-5 | Empty state: “Review assist will summarize this packet when enabled.” |
| 4 | **What changed** | `operator_review.warnings` + future field diff | Start: warning list; later: known/changed badges on answers |
| 5 | **Needs attention** | `linkage_summary`, intake flags, blocked doc gen | Single merged strip; links to fix |
| 6 | **Submitted forms** | `steps[]` + `answer_view` | Read-only renderer; step cards without per-step artifact footer |
| 7 | **Documents & records** | `documents_index` + grouped PDFs/records | **Authoritative** artifact list; remove duplicate per-step lists |
| 8 | **Review actions** | Existing PATCH UI | Sticky footer on page; modal footer unchanged structurally |
| 9 | **Technical details** | `launch_context`, `crm_snapshot`, `shared_values`, IDs | `<details>` closed default; no JSON until expand (optional pretty table later) |

**Standalone submission case file (subset):** Header → Intake context → What changed (linkage/prefill hints) → Needs attention → Answers → Documents → Actions (generate PDF, confirm linkage) → Technical.

**Public intake:** Embed prefill badges are **follow-on** (document in UX-D acceptance as out of card scope unless stretch).

### 2.4 Proposed component hierarchy

| Component | Responsibility | New / refactor |
|-----------|----------------|----------------|
| `FormsOperationalHub.tsx` | Hub layout, KPI strip, definitions table | New (extract from `FormsHubClient`) |
| `FormLifecycleWorkspace.tsx` | Stage rail + section slots | New (wrap `FormDetailClient` sections) |
| `PacketDefinitionOrchestration.tsx` | Guided compose + launch copy | New (wrap packet def client) |
| `IntakeCaseFileLayout.tsx` | Region order shell, slots | **New** — shared by packet + submission |
| `IntakeCaseHeader.tsx` | Title, status chips, subject | New |
| `IntakeContextPanel.tsx` | Human linkage labels | New (maps rollup context) |
| `NeedsAttentionBand.tsx` | Merged warnings + linkage | New |
| `WhatChangedPanel.tsx` | Warnings + future diff badges | New |
| `SubmittedFormsSection.tsx` | Step list + readonly renderer | Extract from rollup view |
| `ArtifactsPanel.tsx` | `documents_index` grouped | New |
| `TechnicalDetailDisclosure.tsx` | Progressive JSON/metadata | New (UX-E) |
| `BosReviewSummaryPlaceholder.tsx` | UX-H frame | New |
| `PacketReviewRollupView.tsx` | Thin composer over layout | **Refactor** |
| `formsReviewPresentation.ts` | Labels, context aliases, attention merge | New lib (no API) |

Keep: `buildPacketReviewRollupV1`, `fetchPacketReviewRollup`, `patchPacketReview`, `documentProvenanceDisplay.ts`, review PATCH routes.

### 2.5 BOS framing model (design only — implementation P2-5)

| Aspect | Design |
|--------|--------|
| Placement | Region 3 in case file — **above** answers, **below** intake context |
| Visual | Calm card, `assistant_notice`-adjacent typography, 3–6 bullets max, no chat thread |
| Layers | (1) UX-H deterministic placeholder copy (2) P2-5 deterministic insight (3) optional P2-6 LLM polish |
| Content rules | Summarize progress, attention, linkage; **never** “CRM updated”; cite submitted answers authoritative |
| Prefill/changed | “N hints” / “M fields differ from snapshot” — no field paths in operator line |
| Actions | **No** buttons in BOS region; review actions stay region 8 |
| Failure | Collapsed “Assist unavailable” — does not block review |

### 2.6 Review / case-file interaction model

| Interaction | Behavior |
|-------------|----------|
| Open packet session | Land on case header + needs attention if any |
| Open opportunity modal | Same body as page (`placement="modal"`) — denser spacing only |
| Fix linkage | Needs attention → deep link → submission detail → return |
| Open PDF | Artifacts panel primary; signed-url errors inline |
| Approve / reject / needs correction | Unchanged API; sticky action bar on page |
| Technical expand | Session-only; does not persist open state across navigation |
| Standalone submission | Same IntakeCaseFileLayout without packet steps |

### 2.7 Shared design language (UX-G)

| Token / pattern | Direction |
|-----------------|-----------|
| Page rhythm | `space-y-6` hub; `space-y-4` case file; reduce nested bordered boxes |
| Cards | One elevation: white surface + single border; reserve indigo/amber for attention only |
| Typography | Page title `text-lg font-semibold`; region titles `text-sm font-semibold`; meta `text-xs text-[#59678b]` |
| Status | Centralize on `StatusBadge` + `operatorReviewStatusLabel` + new `PacketSessionStatusLabel` |
| IDs | Never in region 1–8; copy-to-clipboard in technical only |
| AdminV2 modal | Prefer `alloy-*` tokens in opportunity modal for parity with drawer |
| Tables | Hub + session list: row actions right; attention column left |

### 2.8 Progressive disclosure strategy

| Content | Default | Expanded |
|---------|---------|----------|
| Launch / CRM snapshot / shared values | Hidden | JSON or key-value table |
| Linkage debug / intake debug | Hidden | Submission technical panel |
| Version IDs, token prefix | Hidden | Form detail “Advanced” |
| Per-step `item_status` | Hidden | Step card subtitle in technical |
| Documents index raw paths | Hidden | Show operator links only |

---

## Part 3 — Implementation cards

### UX-G — Shared spacing / type / status system ☑ (2026-05-21)

**Goal:** One presentation module for forms review surfaces so UX-A–F do not invent ad hoc colors and enums.

**Status:** Shipped — shared lib + review components + minimal integration on packet review, modal loading states, opportunity Documents badges.

**Primitives introduced**

| Layer | Path | Role |
|-------|------|------|
| Class tokens | `web/lib/forms/review/formsReviewClassTokens.ts` | Stack, titles, meta, links, grouped surfaces |
| Labels / tones | `web/lib/forms/review/formsReviewPresentation.ts` | Status labels, section ids, empty/loading copy, BOS placeholder text |
| Badge styles | `web/lib/forms/review/formsReviewBadgeStyles.ts` | Alloy-aligned badge class bundles |
| Case-file section | `web/components/forms/review/CaseFileSection.tsx` | Region shell (default / attention / context / subtle) |
| Badges | `FormsReviewBadge.tsx`, `FormsArtifactBadge.tsx` | Semantic status + artifact kinds |
| Provenance | `FormsProvenanceLine.tsx` | Line + generation chip |
| Technical | `TechnicalDetailDisclosure.tsx`, `TechnicalDetailJsonBlock.tsx` | Collapsed-by-default JSON/metadata |
| States | `FormsReviewStatePanel.tsx` | loading / empty / error / unavailable |
| BOS shell | `BosReviewSummaryPlaceholder.tsx` | Reserved assist region (no AI) |
| Barrel | `web/components/forms/review/index.ts` | Public exports |

**Files changed**

- `web/lib/forms/packets/packetReviewPresentation.ts` — re-exports shared presentation layer
- `web/lib/forms/packets/documentProvenanceDisplay.ts` — `artifactKindBadgeClass` → alloy tokens via shared styles
- `web/components/forms/packets/PacketReviewRollupView.tsx` — composes primitives (intake context, BOS placeholder, sections, technical disclosure)
- `web/components/forms/packets/PacketSessionReviewClient.tsx` — `FormsReviewStatePanel`
- `web/components/admin/opportunity/OpportunityPacketReviewModal.tsx` — `FormsReviewStatePanel`
- `web/components/admin/EntityDocumentsSection.tsx` — `FormsArtifactBadge` / `FormsReviewBadge`

**Tests run**

```bash
cd web && npm run test -- tests/forms/formsReviewPresentation.test.ts tests/forms/formsReviewComponents.test.tsx tests/forms/documentProvenanceDisplay.test.ts tests/admin/opportunity/OpportunityPacketReviewModalBody.test.tsx
# 24 passed
```

**Acceptance criteria**

- [x] Packet review uses shared helpers for review + session status badges
- [x] New code uses `alloy-*` / `admin-border` tokens (no new ad hoc hex in primitives)
- [x] Unit tests for labels, badges, disclosure default collapsed, BOS placeholder

**Known limitations (by design for UX-G)**

- Full case-file **region reorder** (review actions before technical) deferred to **UX-D**
- Forms hub / form detail / packet definition pages not restyled yet (**UX-A–C**)
- `enrollment_context` API field name unchanged; UI label is **Intake context**
- Submission detail still uses legacy layout; will adopt `IntakeCaseFileLayout` in UX-D
- BOS placeholder is copy-only; **P2-5** fills content

**Rollback:** Remove `web/lib/forms/review/**` and `web/components/forms/review/**`; revert consumer imports to P2-4 inline styles.

---

### UX-A — Forms hub operational refresh

**Goal:** Hub reads as **operations desk** — health, attention entry points, less documentation noise.

**Files likely touched:**

- `web/app/admin/forms/FormsHubClient.tsx`
- `web/components/forms/hub/FormsOperationalHub.tsx` *(new)*
- `web/app/api/admin/forms/route.ts` *(optional: aggregate counts if missing)*

**Tasks:**

1. Replace long “Forms in Alloy” essay with compact ops intro (2 sentences max).
2. Add top **summary strip**: form count, published count, link to packet sessions with `needs_review` filter (query param).
3. Table columns: **Attention** (e.g. unpublished, no published version), **Submissions** link, keep purpose truncated.
4. Move seed hint to collapsed “Setup help” `<details>`.
5. Promote packet sessions / definitions as **secondary nav cards**, not inline sentence.

**Acceptance criteria:**

- [ ] Hub loads without `schema_version` or `operator_context` in default view.
- [ ] Operator can reach packet sessions needing review in ≤2 clicks from hub.
- [ ] Empty state remains helpful without CLI in production default view.

**Testing:** Extend hub client test if present; smoke `cd web && npx tsc --noEmit`.

**Rollback:** Revert `FormsHubClient` only.

---

### UX-B — Form detail lifecycle layout

**Goal:** **Design → Publish → Share → Submit → Review → Generate** as dominant wayfinding; reduce accordion parity.

**Files likely touched:**

- `web/app/admin/forms/[formId]/FormDetailClient.tsx`
- `web/components/forms/workspace/FormLifecycleWorkspace.tsx` *(new)*

**Tasks:**

1. Add horizontal **lifecycle rail** with stage state (draft version exists, published, link exists, submission count badge).
2. Reorder sections: rail → primary actions (preview, create link, submissions) → schema workspace → collapsed guide/details.
3. Merge multiple “Operator guide” `<details>` into one **Playbook** disclosure.
4. Surface **submission queue** link with count when API available (or “View submissions”).
5. De-emphasize `kind` / internal key to technical footer.

**Acceptance criteria:**

- [ ] Published vs draft state obvious without opening versions accordion first.
- [ ] Primary CTA visible without scrolling on laptop viewport (≥900px).
- [ ] Schema editor still fully functional; no publish API changes.

**Testing:** Manual checklist; optional snapshot test for lifecycle rail markup.

**Rollback:** Revert layout wrapper; keep `FormSchemaWorkspace` untouched.

---

### UX-C — Packet definition operational framing

**Goal:** Packet builder feels like **orchestration**, not raw CRUD.

**Files likely touched:**

- `web/app/admin/forms/PacketDefinitionDetailClient.tsx`
- `web/components/forms/packets/PacketDefinitionOrchestration.tsx` *(new)*

**Tasks:**

1. Add header narrative: what this packet is for, who completes steps, what happens on completion (review gate).
2. Guided empty state: “Add steps in order — each step is a published form.”
3. Step list: show **published badge** per referenced form; warn if unpublished.
4. Public links section: operator copy for launch surfaces (opportunity, standalone); token prefix in technical.
5. Link to **active sessions** list filtered by `packet_definition_id` (query param on packets page).

**Acceptance criteria:**

- [ ] New operator can add 2 steps without reading API errors only.
- [ ] No change to save payload or packet-def API contracts.

**Testing:** `cd web && npx tsc --noEmit`; manual create/edit packet def.

**Rollback:** Revert client layout only.

---

### UX-D — Packet / submission review case-file redesign ☑ (2026-05-21)

**Goal:** Guided operational case-file hierarchy — orientation first, actions prominent, technical last.

**Status:** Shipped on packet review (page + modal) with submission header/needs-attention alignment.

**Case-file region order (enforced by `IntakeCaseFileLayout`)**

1. Case header · 2. Intake context · 3. BOS placeholder · 4. What changed · 5. Needs attention · 6. Submitted forms · 7. Documents & records · 8. Review actions · 9. Technical details

**Components introduced**

| Component | Role |
|-----------|------|
| `IntakeCaseFileLayout.tsx` | Fixed region order |
| `PacketCaseFileHeader.tsx` | Orientation band (subject, status, progress) |
| `PacketIntakeContextPanel.tsx` | Household/opportunity context (labels only) |
| `WhatChangedPanel.tsx` | Rollup warnings + kind badges |
| `NeedsAttentionPanel.tsx` | Linkage + step intake items (action links) |
| `PacketSubmittedFormsPanel.tsx` | Scan-friendly step answers (no per-step artifact clutter) |
| `DocumentsRecordsPanel.tsx` | PDFs vs submitted records groups |
| `CaseFileReviewActions.tsx` | Anchored decision band |
| `PacketReviewActionsForm.tsx` | Shared approve/reject UI (page + modal) |
| `PacketReviewTechnicalPanel.tsx` | Collapsed technical stack |
| `SubmissionCaseFileHeader.tsx` | Standalone submission orientation |

**Files changed**

- `web/components/forms/packets/PacketReviewRollupView.tsx` — thin composer
- `web/components/forms/packets/PacketSessionReviewClient.tsx` — uses `PacketReviewActionsForm`
- `web/components/admin/opportunity/OpportunityPacketReviewModal.tsx` — shared actions form
- `web/app/admin/forms/[formId]/submissions/[submissionId]/FormSubmissionDetailClient.tsx` — case header + needs attention section
- `web/lib/forms/review/formsReviewPresentation.ts` — `warningKindPresentationLabel`, `CASE_FILE_SECTION_ORDER`
- `web/lib/forms/review/formsReviewClassTokens.ts` — header + review-actions surfaces

**Tests run**

```bash
cd web && npm run test -- tests/forms/packetReviewCaseFileLayout.test.tsx tests/forms/packetReviewRollupTechnical.test.tsx tests/admin/opportunity/OpportunityPacketReviewModalBody.test.tsx tests/forms/formsReviewPresentation.test.ts
# 21 passed (packetReviewRollup.test.ts unchanged — PATCH not touched)
```

**Acceptance criteria**

- [x] Page and modal share region order (`placement="modal"` denser only)
- [x] Review actions in region 8 before technical (`data-testid="case-file-review-actions"`)
- [x] No UUIDs in header/intake primary bands
- [x] What changed always visible (empty state when no warnings)
- [x] Documents deduped — single grouped panel, no per-step provenance footers

**Remaining UX debt (UX-F / UX-H / later)**

- Opportunity modal lacks `technicalDetails` (full console link for JSON/IDs)
- Submission detail not full `IntakeCaseFileLayout` (header + needs attention only)
- Sticky footer on scroll not added (anchored surface only — avoids layout instability)
- Documents empty-state copy when index empty but steps have artifacts (data contract)

**Rollback:** Revert `PacketReviewRollupView` to pre-UX-D composer; keep region components for reuse.

---

### UX-E — Technical detail progressive disclosure ☑ (2026-05-21)

**Goal:** Contain JSON, IDs, intake debug, launch metadata in explicit collapsed disclosure regions without removing audit data.

**Status:** Shipped across packet review, submission detail, forms hub, form detail, packet definition.

**Primitives added / extended**

| Piece | Path |
|-------|------|
| Disclosure copy constants | `web/lib/forms/review/formsReviewTechnicalDisclosure.ts` |
| Field list rows | `web/components/forms/review/TechnicalDetailFieldList.tsx` |
| Bottom-of-page stack | `web/components/forms/review/FormsTechnicalDetailStack.tsx` |
| Submission consolidated panel | `web/components/forms/review/SubmissionReviewTechnicalPanel.tsx` |

**Files changed**

- `web/components/forms/review/TechnicalDetailDisclosure.tsx` — optional `data-testid` per panel
- `web/components/forms/packets/PacketReviewRollupView.tsx` — IDs/step status in technical stack; deduped step provenance
- `web/app/adminV2/forms/packets/[packetSessionId]/page.tsx` — passes `identifiers` into technical details
- `web/components/forms/packets/PacketSessionReviewClient.tsx` — session id removed from page header
- `web/app/admin/forms/[formId]/submissions/[submissionId]/FormSubmissionDetailClient.tsx` — diagnostics/linkage/technical stack
- `web/app/admin/forms/FormsHubClient.tsx` — setup help + schema notes collapsed
- `web/app/admin/forms/[formId]/FormDetailClient.tsx` — technical IDs disclosure
- `web/app/admin/forms/PacketDefinitionDetailClient.tsx` — packet/link ids collapsed; cleaner link list

**Tests run**

```bash
cd web && npm run test -- tests/forms/formsReviewTechnicalDisclosure.test.tsx tests/forms/packetReviewRollupTechnical.test.tsx tests/forms/formsReviewPresentation.test.ts tests/forms/formsReviewComponents.test.tsx tests/admin/opportunity/OpportunityPacketReviewModalBody.test.tsx
# 24 passed
```

**Acceptance criteria**

- [x] Warnings, review state, provenance summaries, and answers remain in primary flow
- [x] JSON / UUIDs / launch / intake debug default inside collapsed `<details>` (no `open` attribute)
- [x] Audit payloads still present when disclosures expanded (SSR HTML includes content)

**Remaining technical debt (UX-D / later)**

- Opportunity review modal does not pass `technicalDetails` (no session JSON in modal — full console link only)
- Form detail public-links table still shows embed URLs in primary when link minted (operational copy action)
- Manual-link UUID paste fields remain in linkage workflow (intentional operator action)
- Full case-file region reorder still **UX-D**

**Rollback:** Revert `SubmissionReviewTechnicalPanel` integration; restore inline sections in `FormSubmissionDetailClient`.

---

### UX-F — Documents / provenance visual cleanup ☑ (2026-05-21)

**Goal:** Intake outputs read as one coherent artifact experience — grouped, trustworthy provenance, calm currentness.

**Status:** Shipped on packet review documents region and opportunity Documents tab (intake vs attached split).

**Primitives**

| Piece | Path |
|-------|------|
| Shared artifact panel | `web/components/forms/review/ArtifactsPanel.tsx` |
| Artifact card | `web/components/forms/review/IntakeArtifactCard.tsx` |
| Structured provenance | `web/components/forms/review/FormsProvenanceDetail.tsx` |
| Presentation helpers | `web/lib/forms/review/intakeArtifactPresentation.ts` |
| Currentness copy | `web/lib/forms/packets/documentProvenanceDisplay.ts` (`Current PDF` / `Earlier PDF`) |

**Files changed**

- `web/components/forms/review/DocumentsRecordsPanel.tsx` — delegates to `ArtifactsPanel`
- `web/components/forms/review/FormsProvenanceLine.tsx` — delegates to `FormsProvenanceDetail`
- `web/components/admin/EntityDocumentsSection.tsx` — **Intake outputs** + **Attached documents** sections
- `web/lib/admin/normalizeDocumentRow.ts` — optional `document_provenance` on enriched rows
- `web/lib/forms/review/formsReviewClassTokens.ts` — artifact card / provenance tokens

**Tests run**

```bash
cd web && npm run test -- tests/forms/intakeArtifactsPanel.test.tsx tests/forms/documentProvenanceDisplay.test.ts tests/admin/relatedOpportunityDocuments.test.ts tests/forms/formsReviewComponents.test.tsx
```

**Acceptance criteria**

- [x] Generated PDF vs submitted record distinguished by group + kind label (not badge soup)
- [x] Provenance visible (origin, version, submitted/generated times); currentness legend when PDFs present
- [x] Empty / pending-generation states intentional
- [x] No rollup API or merge logic changes — display-only `document_provenance` on normalized rows

**Remaining UX debt (UX-H / P2-5)**

- Submission detail documents region not yet on `ArtifactsPanel`
- Opportunity modal review tab still uses rollup panel only (Documents tab uses entity section)
- Per-step pending PDF signal not wired from rollup steps into `DocumentsRecordsPanel`

**Rollback:** Revert `ArtifactsPanel` integration; restore prior `DocumentsRecordsPanel` / `EntityDocumentsSection` list markup.

---

### UX-H — BOS summary placeholder region ☑ (2026-05-21)

**Goal:** Integrated review-assist framing layer — readiness, guidance structure, human authority — without AI or P2-5 insight.

**Status:** Shipped on packet review (page + modal) and standalone submission detail header band.

**Structure (region 3 in case-file layout)**

| Slot | `data-testid` | Source |
|------|---------------|--------|
| Readiness badge | `bos-readiness-badge` | Rollup/submission state |
| Summary | `bos-review-summary` | Deterministic copy |
| Key changes | `bos-key-changes` | Rollup warnings (max 3) |
| Attention | `bos-attention-items` | Linkage/intake flags (max 3) |
| Suggested focus | `bos-suggested-focus` | State-derived orientation |
| Review paths | `bos-action-guidance` | Approve / investigate / documents framing |
| Authority note | `bos-human-authority-note` | Operator owns decisions |

**Files changed**

- `web/lib/forms/review/bosReviewAssistPresentation.ts` — derive assist model from rollup/submission
- `web/lib/forms/review/packetNeedsAttentionItems.ts` — shared attention builder (lib, no component import)
- `web/components/forms/review/BosReviewSummaryPlaceholder.tsx` — full assist shell + P2-5 docblock contract
- `web/components/forms/packets/PacketReviewRollupView.tsx` — passes `rollup`
- `web/app/admin/forms/.../FormSubmissionDetailClient.tsx` — secondary alignment via `submissionContext`
- `web/lib/forms/review/formsReviewClassTokens.ts` — BOS surface tokens

**Tests run**

```bash
cd web && npm run test -- tests/forms/bosReviewAssistPresentation.test.ts tests/forms/bosReviewAssistPanel.test.tsx tests/forms/formsReviewComponents.test.tsx tests/forms/packetReviewCaseFileLayout.test.tsx tests/admin/opportunity/OpportunityPacketReviewModalBody.test.tsx
```

**Acceptance criteria**

- [x] Region 3 visible on packet page and opportunity modal with structured subsections
- [x] Readiness states from existing rollup/review/linkage data only
- [x] No network calls; no BOS registry changes
- [x] P2-5 can replace inner bullet content without layout refactor (`deriveBosPacketReviewAssist` hook point)

**Remaining debt before P2-5**

- `buildPacketReviewInsightV1` + GET route not started
- Loading state wired but parent never sets `loading` yet (rollup SSR is synchronous today)
- Submission assist uses `recommendedNextAction` first line — P2-5 may unify packet + submission insight shape

**Rollback:** Revert `BosReviewSummaryPlaceholder` to UX-G empty aside; remove `rollup` prop from `PacketReviewRollupView`.

---

## Protected foundations (do not break)

| Asset | Protection |
|-------|------------|
| `GET /api/admin/forms/packet-sessions/[id]/review-rollup` | Response shape `PacketReviewRollupV1` |
| `PATCH .../packet-sessions/[id]/review` | Request/response semantics |
| `buildPacketReviewRollupV1` | Server-only rollup; UI presentation-only changes |
| `mergeOpportunityPacketDocuments` | Provenance merge for opportunity Documents |
| `createGeneratedPdfForSubmission` / approval PDF backfill | Unchanged |
| Prefill resolution | `resolveFormPrefillValues` — no change to hydration rules |
| Intake/linkage routes | `confirm-linkage`, manual link — unchanged |

---

## Sequencing vs Phase 2

| Phase 2 card | Relationship |
|--------------|--------------|
| P2-1 – P2-5 | **Complete** — operational architecture + deterministic insight |
| **This sprint (UX-G–H, D, F, E)** | Shipped — hierarchy, assist, documents, disclosure |
| **Product refresh** | [`forms_documents_product_experience_refresh.md`](./forms_documents_product_experience_refresh.md) — visual layer next |
| P2-6+ enrich | Optional; non-authoritative |

Update [`forms_documents_phase_2_packet_review_mvp.md`](./forms_documents_phase_2_packet_review_mvp.md) implementation table when starting UX work: insert row “UX hardening sprint” before P2-5.

---

## Verification (sprint-level)

When implementation completes:

```bash
cd web && npx tsc --noEmit
cd web && npm run lint
cd web && npm run test -- tests/forms/packetReviewRollup.test.ts tests/forms/documentProvenanceDisplay.test.ts tests/admin/opportunity/OpportunityPacketReviewModalBody.test.ts tests/forms/formsReviewPresentation.test.ts
```

Manual demo path:

1. Forms hub → form workspace → submissions → submission case file  
2. Packet definition → packet session → packet case file  
3. Opportunity drawer → packet review modal  
4. Opportunity Documents tab — provenance grouping  

---

## Risks / follow-ups

| Risk | Mitigation |
|------|------------|
| Layout refactor breaks modal scroll | Keep `placement="modal"` spacing contract tests |
| Hub counts need API aggregates | UX-A scope API only if trivial; else link with filters only |
| `enrollment_context` naming confuses | UI alias only this sprint |
| Field-level “changed” needs rollup extension | UX-D uses warnings first; contract amendment tracked separately |
| Public embed prefill badges | Document as follow-on; not blocking packet ops UX |

---

## Suggested commit message (doc-only)

```
docs: Forms/Documents operational UX hardening sprint (audit + design + cards)
```

---

## Cursor execution order (quick reference)

1. Read this doc + Phase 2 MVP doctrine sections.  
2. Execute **UX-G** first.  
3. **UX-A / UX-B / UX-C** in parallel if staffed.  
4. **UX-E** before or with **UX-D**.  
5. **UX-D + UX-F** — highest operator impact.  
6. **UX-H** — small, unblocks P2-5 placement.  
7. Do **not** start P2-5 until UX-D and UX-H are merged.
