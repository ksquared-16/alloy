---
owner: platform
status: historical
last_reviewed: 2026-07-11
concept: documentation-migration-blueprint
---

# Alloy Documentation Migration Blueprint — July 2026

**Status:** Migration blueprint (authoritative implementation plan). **Not doctrine.**
**Built from:** `origin/staging` @ `29fbcfb93`.
**Type:** BLUEPRINT ONLY — no files changed, moved, or committed by producing this plan.
**Companion:** [`documentation-architecture-audit-2026-07.md`](./documentation-architecture-audit-2026-07.md) (current-state input).

> **Reader's contract:** Every architectural decision is made here. The implementer (Cursor or
> an engineer) executes mechanically. Where a decision genuinely requires human doctrine
> judgment (content reconciliation, promoting a stale sprint seed to canon), this blueprint
> marks it **`REVIEW-GATE`** — stop and flag, never guess.

---

## 1. Executive Summary

The audit proved Alloy's canonical doctrine is good and accurate; the disease is structural
entropy. This blueprint converts the audit's findings into an exact end-state and an execution
order that **minimizes broken references** (the #1 risk, given 532 already-broken links).

**The target in one sentence:** one canonical tree (`docs/platform/`) where *being in the tree
means current truth*, one locked-runtime tier (`docs/system/`), two generated reference layers
(`docs/schema/`, `docs/api/`), one vertical tier (`docs/product/`), one sprint tier on a single
lifecycle scheme, and **one archive** — with governance moved from paper to CI so a third
entropy wave cannot form.

**What changes structurally:**
1. **Promote the marooned data-contract layer** — 16 loose `canonical-*`/`universal-field-system`
   files at `docs/` root become `docs/platform/core/data/`.
2. **Evict sprint leakage from `platform/`** — `premium-operational-experience/` (6),
   `operational-expansion-wave1-*` (2) → `sprints/`; `operational-expansion-phase1-rfc` → new
   `platform/rfcs/`.
3. **Give milestone/certification/freeze records one home** — `platform/milestones/`.
4. **Delete the `export/` duplication** (68% byte-identical) after extracting ~18 unique files.
5. **Collapse three archive-like trees into one** — `platform_convergence/` + `handoffs/` → `docs/archive/`.
6. **Reclassify `docs/system/`** from "transitional" (wrong) to "Locked Runtime Implementation
   Detail" (authoritative); archive the ~7 true duplicates within it.
7. **Normalize sprints** onto `active/completed/archive`, evict **111 MB** of stale mockups,
   move `product/pos/` (24) home.
8. **Merge duplicate doctrine** — `card-archetypes`→`universal-card-archetypes`, dedupe
   `commercial-configuration`, banner the live contradictions.
9. **Install governance-in-CI** — link integrity, duplicate-basename, orphan/metadata/placement,
   schema freshness.

**Net:** ~1,086 docs → keep ~110 canonical + ~28 locked-runtime + 29 generated + vertical;
archive ~660 (mostly sprints); delete ~80 (export dups + scratch); evict ~110 MB of assets.
**Doctrine content is not rewritten** — only relocated, bannered, and (in flagged cases)
reconciled under review.

---

## 2. Target Documentation Architecture

```
docs/
├── README.md                     # THE navigation hub (single source of load order)
├── platform/                     # CANONICAL DOCTRINE — "here = current truth"
│   ├── foundation/               # entry points & platform-wide framing
│   ├── core/                     # domain truth (entity, record, status, process…)
│   │   └── data/                 # NEW: canonical data-contract layer (promoted from root)
│   ├── operator/                 # surface & CARD COMPOSITION doctrine (+ README = version map)
│   ├── experience/               # cross-cutting BEHAVIORAL RUNTIME (motion, reveal, nav, PR-v2)
│   ├── modules/                  # per-capability doctrine
│   ├── commercial/               # commercial domain (+ absorbs programs/)
│   ├── analytics/                # metric platform
│   ├── runtime/                  # runtime topology + enrollment runtime
│   ├── governance/               # THE single governance home (absorbs docs/governance/)
│   ├── milestones/               # NEW-consolidated: certification / stabilization / freeze records
│   └── rfcs/                     # NEW: frozen/ratified RFCs awaiting fold-in to doctrine
├── system/                       # LOCKED RUNTIME IMPLEMENTATION DETAIL (authoritative)
├── schema/                       # GENERATED schema reference (do not hand-edit)
├── supabase/reference/           # schema CSV source of truth
├── api/                          # GENERATED + governed API reference
├── product/                      # VERTICAL (childcare) reference only
├── sprints/{active,completed,archive}/   # execution history on ONE scheme
├── audits/{active,archive}/
└── archive/                      # THE single permanent archive (dated, banner-gated)
```

Per-directory Purpose / Owner / Allowed / Prohibited / Neighbors rules are enumerated in the
audit and summarized here; the operative rule is **"in `platform/` = current canonical truth"**:
no sprint artifacts, no superseded docs, no in-flight RFCs, no handoffs, no point-in-time audits,
no duplicates, no generated reference inside `platform/`.

Key directory contracts:
- **`platform/core/data/`** — the canonical data-contract layer (SSOT for business facts).
  Allowed: data-system, entity-specification, relationship-model, field-system, field-catalog
  (generated), status-architecture, action-status-field-matrix, configuration-data-alignment,
  runtime-data-alignment. Summarized by `core/*`; generated-from by `schema/`.
- **`operator/`** = surface & card *composition* doctrine (what surfaces/cards ARE).
  **`experience/`** = cross-cutting *behavioral* runtime (how they behave). Hard line between.
- **`system/`** = Locked Runtime Implementation Detail — authoritative, not transitional. The
  implementation-detail counterpart to `platform/`. (Long-term open question: fold into
  `platform/runtime/`.)
- **`milestones/`** = point-in-time certification/stabilization/freeze records. Manifesto stays
  in `foundation/` (it is living constitution, not a milestone).

---

## 3. Documentation Manifest

Legend — Action ∈ {KEEP, MOVE, MERGE, ARCHIVE, DELETE, RENAME, GENERATE, BANNER}.
`REVIEW-GATE` = human doctrine decision required before/instead of the move.

### 3.1 Loose `docs/` root (23) — top priority

| Current path | Action | Destination / Notes |
|---|---|---|
| `README.md` | KEEP + EDIT | fix 4 dead refs; add new tiers |
| `canonical-data-system.md` | MOVE+RENAME | → `platform/core/data/data-system.md` |
| `canonical-entity-specification.md` | MOVE+RENAME | → `platform/core/data/entity-specification.md`; BANNER current |
| `canonical-relationship-model.md` | MOVE+RENAME | → `platform/core/data/relationship-model.md` |
| `canonical-field-catalog.md` | MOVE | → `platform/core/data/field-catalog.md`; keep generator note (`web/scripts/generateCanonicalFieldCatalogDoc.ts`) |
| `universal-field-system.md` | MOVE+RENAME | → `platform/core/data/field-system.md` |
| `canonical-status-architecture.md` | MOVE+RENAME | → `platform/core/data/status-architecture.md`; BANNER current, supersedes Phase-5 status |
| `canonical-action-status-field-matrix.md` | MOVE+RENAME | → `platform/core/data/action-status-field-matrix.md` |
| `canonical-configuration-data-alignment.md` | MOVE+RENAME + `REVIEW-GATE` | → `platform/core/data/configuration-data-alignment.md`; reconcile vs July status contract |
| `canonical-runtime-data-alignment.md` | MOVE+RENAME + `REVIEW-GATE` | → `platform/core/data/runtime-data-alignment.md` |
| `canonical-data-system-phase-1..7*.md` (7) | MOVE | → `sprints/completed/canonical-data-system/` |
| `canonical-data-system-audit.md` | MOVE | → `audits/archive/` |
| `LAYOUT_CONFIG_V2_FOUNDATION_AUDIT.md` | ARCHIVE | → `archive/2026-06-layout-v2/` |
| `layout_v2_foundation_design.md` | ARCHIVE | → `archive/2026-06-layout-v2/` |
| `layout_v2_drawer_doctrine.md` | ARCHIVE | → `archive/2026-06-layout-v2/` |
| `waitlist_layout_v2_audit.md` | ARCHIVE | → `audits/archive/` |
| `waitlist_candidate_card_vm_layout_v2_plan.md` | ARCHIVE | → `archive/2026-06-layout-v2/` |

### 3.2 `platform/` internal fixes

| Current path | Action | Destination / Notes |
|---|---|---|
| `platform/premium-operational-experience/` (6) | MOVE | → `sprints/archive/06_2026/premium-operational-experience/` |
| `platform/operational-expansion-wave1-cursor-execution-packet.md` | MOVE | → `sprints/archive/06_2026/operational-expansion/` |
| `platform/operational-expansion-wave1-implementation-spec.md` | MOVE | → `sprints/archive/06_2026/operational-expansion/` |
| `platform/operational-expansion-phase1-architecture-rfc.md` | MOVE + `REVIEW-GATE` | → `platform/rfcs/operational-expansion-phase1.md`; promote ratified decisions into `core/` |
| `platform/operational-truth-flow-doctrine.md` | MOVE | → `platform/core/operational-truth-flow-doctrine.md` |
| `platform/operational-ux-doctrine.md` | MOVE | → `platform/core/operational-ux-doctrine.md` |
| `platform/platform-capabilities.md` (root) | MOVE+RENAME | → `platform/foundation/capability-model-doctrine.md` |
| `platform/foundation/platform-certification-july-2026.md` | MOVE | → `platform/milestones/certification-july-2026.md` |
| `platform/foundation/platform-manifesto.md` | KEEP | stays in `foundation/` |
| `platform/milestones/platform-stabilization-july-2026.md` | KEEP+RENAME | → `platform/milestones/stabilization-july-2026.md` |
| *(unmerged)* `platform/foundation/platform-freeze-july-2026.md` | ON MERGE → MOVE | → `platform/milestones/freeze-july-2026.md`; coordinate with branch owner |
| `platform/operator/card-archetypes.md` | MERGE | → `platform/operator/universal-card-archetypes.md` (§5) |
| `platform/operator/presentation-runtime-doctrine.md` | ARCHIVE+BANNER | → `archive/2026-06-presentation-runtime/`; superseded by `experience/presentation-runtime-v2.md` |
| `platform/operator/focus-panel-edit-information-doctrine.md` | BANNER | superseded-by → `focus-panel-composition-v2-and-editing.md` |
| `platform/operator/universal-card-system.md` | BANNER | note editing shipped; keep doc |
| `platform/operator/*` (remaining ~47) | KEEP | + GENERATE `operator/README.md` (version map, §8) |
| `platform/experience/presentation-runtime-v2-handoff.md` | MOVE | → `sprints/completed/presentation-runtime-v2/` |
| `platform/experience/presentation-runtime-v2-focus-panel-surface-composer-closeout.md` | MOVE | → `sprints/completed/presentation-runtime-v2/` |
| `platform/experience/navigation-runtime-doctrine.md` | KEEP + `REVIEW-GATE` | verify not superseded by shipped `surface-host-architecture` |
| `platform/experience/*` (remaining ~10) | KEEP | fix 2 dead links to missing `foundation/runtime-architecture-map.md` |
| `platform/modules/operational-mutation-platform.md` | ARCHIVE | → `archive/2026-06-superseded-modules/` |
| `platform/modules/commercial-configuration.md` | KEEP | canonical commercial config |
| `platform/commercial/commercial-configuration.md` | ARCHIVE | → `archive/2026-06-superseded-modules/` (resolves dup) |
| `platform/programs/program-offerings.md` | MOVE | → `platform/commercial/program-offerings.md`; delete `programs/` |
| `platform/runtime/operational-runtime-topology.md` | ARCHIVE+BANNER | → `archive/2026-06-runtime/` |
| `platform/runtime/work-unit-runtime-simplification-closeout.md` | MOVE | → `sprints/completed/` |
| `platform/runtime/enrollment-process-v1-handoff.md` | KEEP | canonical handoff |
| `platform/runtime/{enrollment-process-runtime, operational-runtime-doctrine}.md` | KEEP | |

### 3.3 `docs/system/` (36) — reclassify + de-dup

| Files | Action | Notes |
|---|---|---|
| adminv2-runtime-performance-doctrine, platform-performance-doctrine, work-unit-layout-doctrine, work-unit-surface-context-contract, queue-record-doctrine, drawer-doctrine, drawer-operating-model-v1, drawer-view-model-runtime-contract, routing-doctrine, bos-identity-doctrine, bos-rail-action-icon-doctrine, configuration-runtime-v1, configuration-mode-doctrine, configuration-ownership-doctrine, configuration-workspace-v1-doctrine, configuration-runtime-design-alignment, operating-plan-runtime-doctrine, typography-and-presentation-doctrine, workspace-atmosphere-doctrine, legacy-architecture-inventory (**20**) | KEEP | Locked authoritative; add `system/README.md` reframing |
| action-workspace-foundation, option-sets-system | KEEP | active planning |
| field-model-convergence-doctrine | KEEP+BANNER | cross-link → `core/data/field-system.md` |
| configuration-system, settings-v2-doctrine | KEEP + `REVIEW-GATE` | verify not superseded by configuration-runtime-v1 |
| enrollment-placement-doctrine | KEEP+BANNER | supporting ref → `core/placement-system.md` |
| entity-model, record-system, actions-and-workflows, navigation-doctrine, workspace-system (**5**) | ARCHIVE | pure duplicates → `archive/2026-06-superseded-system/`; update inbound links |
| api-contracts, roles-and-permissions | ARCHIVE | duplicate `platform/governance/`; redirect |
| alloy-loader-inventory-audit | MOVE | → `audits/archive/` |
| bos-operational-intake-shell-doctrine | ARCHIVE | REVERTED → `archive/2026-06-reverted/` |
| repository-state-2026-06 | MOVE | → `platform/milestones/` or `archive/2026-06/` |

### 3.4 `docs/product/` (33)

| Current path | Action | Notes |
|---|---|---|
| `crm-system.md` | KEEP | vertical, banner present |
| `ai-system.md`, `bos-foundation.md` | KEEP + `REVIEW-GATE` | verify not competing with `modules/ai-platform.md`; banner vertical |
| `communications.md`, `billing-and-financials.md`, `documents-and-forms.md` | ARCHIVE | thin stale stubs → `archive/2026-06-superseded-product/`; redirect |
| `pos/` (24) | MOVE | sprint package → `sprints/archive/06_2026/pos/` |

### 3.5 Duplicate & historical trees

| Current path | Action | Notes |
|---|---|---|
| `docs/export/` `*/01-canonical/*` + files with a live twin (63 exact + 11 stale) + 2 `.zip` | DELETE | live copy wins (§5) |
| `docs/export/` unique (~18) | MOVE | → `archive/2026-06-handoff-packs/` — **extract before deleting** |
| `docs/platform_convergence/` (28) | ARCHIVE | → `archive/2026-06-runtime-convergence/`; drop 7 dead `convergence_review_rubric.md` links |
| `docs/handoffs/` (3, closed) | ARCHIVE | → `archive/2026-06-handoffs/` |
| `docs/archive/**` (226) | KEEP | prune `dev-assets/` JSON + labeled `duplicates/` |

### 3.6 Small / singleton folders

| Current path | Action | Notes |
|---|---|---|
| `docs/governance/` (4) | MOVE | → `platform/governance/`; update README + `.cursor` refs to agent-repo-boundaries |
| `docs/core/{glossary,system-overview}.md` | DELETE | redirect stubs; repoint inbound links to `platform/` |
| `docs/doctrine/configuration-workspace-doctrine.md` | MOVE | → `docs/system/`; delete `doctrine/` |
| `docs/execution/operating-doctrine.md` | MERGE | → `platform/governance/design-and-operational-doctrine.md` |
| `docs/execution/roadmap-and-gaps.md` | ARCHIVE | superseded by `foundation/product-roadmap.md` |
| `docs/backlog/experience-builder-framework-backlog.md` | MOVE | → `sprints/active/` (update README link) |
| `docs/forms/` (2 contracts) | MOVE | → supporting refs beside `modules/documents-and-forms.md` |
| `docs/forms/` (4 deferred) | ARCHIVE | → `sprints/archive/`; delete `forms/` after |

### 3.7 `docs/audits/` (18) → split

| Files | Destination |
|---|---|
| supabase-schema-alignment-audit, operational-expansion-architecture-audit-2026-07, legacy-messages-retirement-plan | `audits/active/` |
| documentation-audit, documentation-closeout-report, documentation-governance-followup, documentation-followup-closeout | `audits/archive/2026-06-doc-rebaseline/` |
| adminv2-hardening-audit, adminv2_drawer_vm_ownership_audit, drawer-to-drawer-navigation-vm-audit, drawer_runtime_state_machine_audit_2026-06, event-integrity-audit, person-vs-contact-audit, person_child_drawer_vm_phase_b_audit, vm_drawer_transition_performance_audit, work_unit_runtime_cutover_audit, workflow-execution-consistency-audit, workflow-rbac-alignment-audit (11) | `audits/archive/2026-05/` |
| *(this initiative)* documentation-architecture-audit-2026-07, documentation-migration-blueprint-2026-07, documentation-initiative-handoff-2026-07 | stay in `audits/` (or `audits/active/` until migration executed) |

### 3.8 Non-`docs/` (report + light action)

| Path | Action | Notes |
|---|---|---|
| root `README.md` | EDIT | fix "home cleaning/Bend" → childcare-first |
| root `PRE_COMMIT_SHIP_CHECK.md` | ARCHIVE/DELETE | one-off scratch |
| `web/docs/TIMEZONE_SEMANTICS.md` | KEEP + MIRROR + `REVIEW-GATE` | decide canonical home |
| `web/components/workspace/doctrine.ts` | KEEP + RECONCILE + `REVIEW-GATE` | code-vs-docs authority for visual tokens |
| `.cursor/rules/alloy-project-context.mdc` | GENERATE | from `docs/README.md` load order |
| `web/test-results/` | UNTRACK | add to `.gitignore` |
| `web/docs/sprints/07_2026/**` (50 PDF/PNG) | MOVE | out of git → external/LFS |
| `backend/ghl_cusotm_field_ids.txt` | RENAME | typo → `ghl_custom_field_ids.txt` |
| `sync/`, `backend/README_*`, `web/README_ADMIN_AUTH`, `web/README_GUTTERS_LEAD`, `web/lib/.../THREAD_SEMANTICS.md`, `web/docs/DEV_TENANT_SPINUP` | KEEP | legitimate co-located dev docs |

---

## 4. Canonical Ownership Matrix

| Concept | Canonical owner (post-migration) | Supporting references | Historical |
|---|---|---|---|
| Architecture | `platform/foundation/architecture.md` | os-runtime-map, platform-manifesto | archive resets |
| Platform constitution | `platform/foundation/platform-manifesto.md` | system-overview, capability-model-doctrine | milestones/* |
| Capabilities | `platform/foundation/platform-capabilities.md` | capability-model-doctrine | release-history |
| Entity Model | `platform/core/entity-model.md` | `core/data/entity-specification`, `relationship-model` | system/entity-model (archived) |
| Record System | `platform/core/record-system.md` | operator/record-resolution | system/record-system (archived) |
| Business Process | `platform/core/business-process-system.md` | modules/business-process-execution-platform | archived mutation-platform |
| Status / State | `platform/core/status-and-state-system.md` | `core/data/status-architecture`, stage-membership-and-outcomes, action-status-field-matrix | canonical-status (pre-July) |
| Fields | `platform/core/data/field-system.md` | field-catalog (generated), modules/field-concepts, system/field-model-convergence | universal-field-system (orig) |
| Data System | `platform/core/data/data-system.md` | entity-spec, relationship-model, alignments | 7 phase files (sprints/completed) |
| Actions | `platform/operator/operational-action-doctrine.md` | modules/actions-and-workflows, action-system, actions-current-work-alignment | — |
| Workflow | `platform/modules/actions-and-workflows.md` | runtime/operational-runtime-doctrine | workflow audits (archived) |
| Current Work | `platform/operator/current-work-surface.md` | actions-current-work-alignment | — |
| Navigation | `platform/core/navigation-and-workspace-doctrine.md` | experience/operational-navigation-contract | system/navigation-doctrine (archived) |
| Cards | `platform/operator/universal-card-lifecycle.md` (behavior) + `focus-panel-card-library.md` (catalog) | card-language, universal-card-system, universal-card-archetypes, card-composition/5B/5C, operational-grammar | card-archetypes (merged) |
| Focus Panel | `platform/operator/focus-panel-composition-v2-and-editing.md` | vocabulary, cutover-report, card-library, operational-context-boundary | edit-information-doctrine (bannered) |
| Communications | `platform/modules/communications-platform.md` | comms-identity-platform, comms-runtime-contract | product/communications, export copies (deleted) |
| Processing | `platform/modules/documents-and-forms.md` (+ POS sprint history) | forms contracts | product/pos (sprints) |
| Documents / Forms | `platform/modules/documents-and-forms.md` | forms/*-contract, modules/field-concepts | forms/deferred (archived) |
| Scheduling / Attendance | `platform/modules/attendance-system.md` | operational-consumption-platform | — |
| Billing | `platform/modules/billing-financials-platform.md` | financial-platform-domain, operational-consumption-platform | product/billing (archived) |
| Analytics | `platform/analytics/metric-platform-doctrine.md` | metric-data-model, metric-builder-ux, analytics-v2-roadmap | — |
| AI / BOS | `platform/modules/ai-platform.md` | system/bos-identity-doctrine, bos-rail-action-icon | product/bos-foundation, ai-system (bannered) |
| Configuration | `docs/system/configuration-runtime-v1.md` (+ cluster) | modules/configuration-platform, core/configuration-ownership-and-inheritance | configuration-system (review) |
| Schema | `docs/schema/*` (generated) | supabase/reference CSVs | — |
| Platform Events | `platform/foundation/platform-event-catalog.md` | modules/actions-and-workflows | — |
| Identity | `platform/modules/communications-identity-platform.md` + `core/entity-model.md` | operator/identity-surface-composition | person-vs-contact-audit (archived) |
| Operator Experience | `platform/operator/canonical-interaction-model.md` | interaction-grammar, operator-story, alloy-runtime-specification | — |
| Experience Builder | `platform/operator/experience-builder-v3-universal-surface-composition.md` | experience-builder-doctrine, presentation-runtime-carry-forward | v2 sprint docs |
| Presentation Runtime | `platform/experience/presentation-runtime-v2.md` | surface-composer, surface-host-architecture | operator/presentation-runtime-doctrine (archived) |
| Interaction Grammar | `platform/operator/interaction-grammar.md` | canonical-interaction-model | — |
| Visual Language | `platform/operator/alloy-visual-language.md` | system/typography-and-presentation, workspace-atmosphere | `web/components/workspace/doctrine.ts` (reconcile) |
| Glossary | `platform/governance/glossary.md` | — | core/glossary (deleted), export copies |
| API | `docs/api/` (generated) | platform/governance/api-contracts | system/api-contracts (archived) |
| Runtime | `platform/runtime/operational-runtime-doctrine.md` | enrollment-process-runtime, operator/surface-view-model-composition | operational-runtime-topology (archived) |
| Governance / Docs | `platform/governance/documentation-governance.md` | design-and-operational-doctrine, agent-repo-boundaries | audits/archive/2026-06-doc-rebaseline |

---

## 5. Merge Matrix

| Cluster | Why | Survivor | Content moved | Discarded | Preserve historically? |
|---|---|---|---|---|---|
| export/ ↔ live (74) | Hand-copied packs drifted | live docs | none (live superset) | 63 exact + 11 stale + 2 zips → DELETE | No; extract ~18 unique first |
| `communications.md` ×3 | Forked across packs + product | `modules/communications-platform.md` | unique notes → module | 2 export + product stub | product stub → archive redirect |
| system/ ↔ platform/ (7) | Pre-rebaseline copies | platform/ | verify+fold unique detail | 7 system copies → ARCHIVE | Yes (archive/2026-06-superseded-system) |
| glossary ×4 | Reset residue + export | `platform/governance/glossary.md` | missing terms merged | core/ + 2 export | No |
| platform-capabilities ×2 | Basename clash | `foundation/platform-capabilities.md` | root doc renamed, kept distinct | none | Both kept |
| card-archetypes ↔ universal-card-archetypes | Concept + System-5A doc, same 8 archetypes | `universal-card-archetypes.md` | concept-primer intro | redundant descriptions | Yes (git history) |
| commercial-configuration ×2 | Superseded config vs module | `modules/commercial-configuration.md` | none | `commercial/` one → ARCHIVE | Yes |
| operating-doctrine → design-and-operational-doctrine | Transitional doc-rules | `governance/design-and-operational-doctrine.md` | unique rules | overlap | Yes (execution/ archived) |
| product module stubs ↔ modules/ (3) | Thin stubs | `modules/*` | none | product stubs → ARCHIVE redirect | Yes |

**History-preservation rule:** every MERGE keeps the source in git history; survivors of docs
carrying *unique architectural reasoning* gain a "History" footnote linking the archived
original. No architectural history is discarded — only redundant restatement.

---

## 6. Archive Matrix

One archive, dated sub-buckets, each with a supersession-pointer `README.md`.

| Archive bucket | Contents | Reason |
|---|---|---|
| `archive/2026-05-02-docs-reset/` | *(existing)* frozen old docs root | pre-rebaseline snapshot |
| `archive/2026-06-runtime-convergence/` | `platform_convergence/` (28) | completed migration |
| `archive/2026-06-handoffs/` | `docs/handoffs/` (3) | closed handoffs |
| `archive/2026-06-handoff-packs/` | export/ unique (~18) | portable-pack remnants |
| `archive/2026-06-superseded-system/` | 7 system/ duplicates | platform/ supersedes |
| `archive/2026-06-superseded-modules/` | operational-mutation-platform, commercial/commercial-configuration | self-superseded |
| `archive/2026-06-superseded-product/` | 3 product stubs | modules/ supersedes |
| `archive/2026-06-presentation-runtime/` | operator/presentation-runtime-doctrine | superseded by experience/PR-v2 |
| `archive/2026-06-runtime/` | runtime/operational-runtime-topology | superseded by simplification closeout |
| `archive/2026-06-layout-v2/` | root layout_v2_* + LAYOUT_CONFIG_V2 + waitlist plan | superseded by Experience Builder V3 |
| `archive/2026-06-reverted/` | system/bos-operational-intake-shell-doctrine | reverted in production |
| `audits/archive/2026-06-doc-rebaseline/` | 4 prior documentation audits | prior-art |
| `audits/archive/2026-05/` | 11 closed 2026-05-02 investigations | findings closed |
| `sprints/archive/` | historical month folders | execution history |

Differentiation preserved: RFCs (`platform/rfcs/` → archive on fold-in), Sprint execution
(`sprints/archive/`), Promotion/closeout (`sprints/completed/`), Completed audits
(`audits/archive/`), Planning (`sprints/archive/`), Historical decisions/migrations
(`archive/2026-*`).

---

## 7. Sprint Migration Matrix

**Decision: adopt the `active/completed/archive` lifecycle scheme; retire date folders into
`archive/`.**

| Bucket | Rule | Destination |
|---|---|---|
| Active | Touched ≥ 2026-07 AND not closed: `08_2026/*`, `active/*`, `future/*` (paused) | `sprints/active/` |
| Completed | Self-labeled `*closeout`/`*certification`/`completion`, shipped | `sprints/completed/` |
| Archive | Everything else in 05/06/07_2026 + `2026-07` (merge into 07_2026 first), all audits/plans/reports/mockups | `sprints/archive/<month>/` |
| Assets | 403 PNG + 70 HTML + 11 office (104 MB in 06_2026) | EVICT from git → LFS/external; leave a manifest `.md` |
| Index | `README.md`, `COMPLETED_SPRINTS_SUMMARY.md` | REWRITE; add missing `08_2026`; fix dead `record_person_location_convergence_audit.md` link |

**Sprint → Doctrine (`REVIEW-GATE`, do NOT auto-promote).** Per candidate: (a) check for a
`platform/`/`system/` twin; (b) twin exists → archive; (c) none → **flag for human doctrine
review**, do not move into `platform/`. Candidates to check: `alloy_operational_doctrine_v1`,
`canonical_action_catalog_v1`, `canonical_enrollment_operating_model_seed`,
`childcare_lifecycle_matrix_v1`, `lifecycle_information_matrix_v1`,
`entity_status_lifecycle_stage_and_location_scope_contract`,
`enrollment_lifecycle_status_matrix_contract`, `configuration_runtime_core_interaction_doctrine`,
`lifecycle_canonical_vocabulary`. (Others — `adminv2_reveal_doctrine`,
`presentation-runtime-architecture/*`, `operator-workspace-doctrine`,
`communications-preview-vm-doctrine` — have twins → archive.)

---

## 8. Documentation Governance Model

Extends `platform/governance/documentation-governance.md`. The policy exists; this adds
enforcement, metadata, and lifecycle.

**Ownership** — `CODEOWNERS`: `docs/platform/**` → platform architects; `docs/system/**` →
runtime owners; `docs/schema|api/**` → bot-owned (hand-edit fails CI); `docs/product/**` →
vertical lead. Every canonical doc names an `owner`.

**Required frontmatter (CI-enforced on `platform/`, `system/`, `core/data/`):**
```yaml
owner: <team-or-person>
status: canonical | frozen | proposed | superseded | generated
last_reviewed: YYYY-MM-DD
supersedes: <path|none>
superseded_by: <path|none>   # required iff status: superseded
```

**Status vocabulary (fixed):** `canonical` (current truth), `frozen` (design locked, may not be
fully built — must say so), `proposed` (approved-to-document, not ratified), `superseded` (must
carry `superseded_by`; must live in `archive/`), `generated` (do not hand-edit).

**Cross-link:** each concept's owner links its supporting + historical refs; supporting docs
link up to their owner; **no doc in `platform/` may link into `sprints/`.**

**Versioning:** retire ad-hoc "System N / VN / Rev N" as primary identity; keep as labels;
publish ONE reconciliation map in `platform/operator/README.md`. New docs use `status` +
`last_reviewed`, not version-in-title.

**Approval:** behavior-changing PR updates the matching platform doc in the same PR +
doctrine-review from CODEOWNERS for `platform/**`. New canonical topic → added to
`docs/README.md` load order in the same PR (CI blocks unindexed new `platform/` files).

**Lifecycle:** `proposed → canonical → superseded → archive`. Sprint closeout summarizes into
`release-history.md` + `platform-capabilities.md`, then archives detail. RFC ratified → decisions
merge into `core/`/`modules/`, RFC → `archive/`.

**How to add a doc (decision tree, published in governance):** current doctrine → `platform/<domain>/`
(+README + frontmatter); locked runtime detail with code dep → `system/`; generated → `schema/`|`api/`
(never hand-edit); vertical-specific → `product/` (+banner); in-flight/execution → `sprints/active/`;
superseded → `archive/` (+`superseded_by`); milestone/cert → `platform/milestones/`. **Never** create
a file at `docs/` root or a new singleton folder.

**Cadence:** quarterly capabilities+roadmap pass; **quarterly rebaseline sweep** (the June wave
recurred in ~6 weeks — cadence is the antibody); schema/api regen after each migration apply;
`last_reviewed` older than 2 quarters flags in CI.

---

## 9. Automated Validation Strategy

Implement as `scripts/docs-lint.mjs` in `.github/workflows/` on PRs touching `docs/**`.

| Check | Catches | Gating |
|---|---|---|
| Broken internal links | 532 today (13 in canon) | **Block** on `platform/`,`system/`,`README`; warn elsewhere |
| Duplicate basenames | glossary×4, entity-model×3 | Warn; block for `platform/` |
| Orphan documents (no inbound link + not indexed) | undiscoverable doctrine | Warn |
| Missing/invalid frontmatter | ungoverned new docs | **Block** on `platform/`,`system/`,`core/data/` |
| `superseded` w/o `superseded_by`, or superseded doc outside `archive/` | stale masquerading as canon | **Block** |
| Placement lint (new root file or new singleton folder) | root-orphan recurrence | **Block** |
| New `platform/` file not in README load order | index drift | **Block** |
| Schema freshness (doc references table absent from CSVs, or export older than newest migration) | comms-identity bug | Warn (nightly), block on schema PRs |
| Generated-file hand-edit (`schema/`,`api/`, generated field-catalog) | drift from generator | **Block** |
| Duplicate canonical concept (>1 `status: canonical` for same concept tag) | ownership conflict | Warn |
| Cross-tier link violation (`platform/**` → `sprints/**`) | canon depending on execution | **Block** |

---

## 10. Migration Execution Plan

Ordered to minimize broken references: instrument first, banner-in-place before moving, move
leaves before hubs, update links immediately, delete last.

- **Phase 0 — Instrument (no doc moves).** Land `scripts/docs-lint.mjs` + CI in report-only mode.
  Regenerate `schema/` + `api/`. Baseline the 532 broken links.
- **Phase 1 — Truth banners (edits only).** Banner the 2 live contradictions + 7 self-superseded
  docs. Fix root README framing. No link risk.
- **Phase 2 — Promote the data layer.** Create `platform/core/data/`; MOVE+RENAME the 9 standing
  docs; MOVE 7 phase files → `sprints/completed/`, audit → `audits/archive/`. Update inbound
  links + README. `REVIEW-GATE` the Phase-5↔July reconciliation.
- **Phase 3 — Evict `platform/` leakage.** Move premium-experience, wave1 → sprints; RFC →
  `platform/rfcs/`; cross-cutting axes + capabilities rename; consolidate milestones; merge
  card-archetypes; move experience handoffs → sprints; archive superseded operator/runtime/
  module/commercial docs. Update links.
- **Phase 4 — Reclassify `system/` + fold governance.** Add `system/README.md`; archive 7
  duplicates; loader-audit → audits, reverted/snapshot → archive; `docs/governance/` →
  `platform/governance/`; delete `core/` stubs; fold doctrine/execution/backlog/forms.
- **Phase 5 — Product + duplication purge.** Move `product/pos/` → sprints; archive product
  stubs; extract export unique then DELETE `export/` + zips; collapse platform_convergence +
  handoffs → archive; split `audits/`.
- **Phase 6 — Sprints normalization.** Adopt lifecycle scheme; merge `2026-07`→`07_2026`;
  archive month folders; rewrite indexes; execute sprint→doctrine `REVIEW-GATE`; EVICT 111 MB
  assets → LFS/external (separate history-rewrite decision).
- **Phase 7 — Non-docs hygiene.** Untrack `web/test-results/` + gitignore; move binaries; rename
  typo; `REVIEW-GATE` the two out-of-tree authorities; GENERATE `.cursor` load order from README.
- **Phase 8 — Enforce.** Flip CI to blocking. Final full link sweep green.

---

## 11. Commit Sequencing

One reviewable commit per logical step; each leaves the tree green.

| # | Commit | Scope |
|---|---|---|
| C1 | `docs(ci): add docs-lint + regenerate schema/api (report-only)` | Phase 0 |
| C2 | `docs(truth): banner superseded doctrine + fix root README framing` | Phase 1 |
| C3 | `docs(core): promote canonical data-contract layer to platform/core/data` | Phase 2 |
| C4 | `docs(platform): evict sprint artifacts, consolidate milestones, merge card-archetypes` | Phase 3 |
| C5 | `docs(system): reclassify locked tier + fold governance, delete stubs` | Phase 4 |
| C6 | `docs(cleanup): move pos, delete export dup, collapse archive trees, split audits` | Phase 5 |
| C7 | `docs(sprints): adopt lifecycle scheme, archive month folders, rewrite indexes` | Phase 6 (assets in a **separate** PR: `chore(git): evict doc mockups to LFS`) |
| C8 | `chore(repo): untrack test-results, move binaries, gen cursor rules` | Phase 7 |
| C9 | `docs(ci): enforce docs-lint (blocking)` | Phase 8 |

`REVIEW-GATE` items (Phase-5 reconciliation, sprint→doctrine promotions, out-of-tree authority,
freeze-branch coordination) are **separate human-reviewed PRs**.

---

## 12. Risks

- **Link breakage at scale** — 2,720 links, 20% already broken. *Mitigation:* Phase 0
  instrumentation + immediate link updates per move + green-gate per commit.
- **Concurrent doc work on staging** — the `docs/platform-freeze-july-2026` branch is unmerged
  and 5 doc commits landed mid-audit. *Mitigation:* coordinate before Phase 3 milestone
  consolidation; rebase if it merges first.
- **Blind sprint→doctrine promotion could entrench stale seeds** — *Mitigation:* `REVIEW-GATE`.
- **Phase-5 vs July data-contract skew** — *Mitigation:* `REVIEW-GATE` in Phase 2.
- **Asset eviction rewrites git history** — 111 MB. *Mitigation:* isolate in its own PR; decide
  LFS vs delete-going-forward; do not block the doc reorg on it.
- **`system/` reclassification touches a `.cursor` rule + README dependency** — *Mitigation:*
  update refs in the same commit (C5).
- **Deleting `export/` loses ~18 unique files** — *Mitigation:* extract-before-delete (Phase 5).
- **Out-of-`docs/` authorities re-split truth if mirrored wrong** — *Mitigation:* `REVIEW-GATE`.

**Open questions for the owner (decide before execution):**
1. Sprints scheme: finish lifecycle migration (recommended) or standardize on month folders?
2. `export/` packs: still a real offline-portability requirement? If yes → generator; if no → delete.
3. Asset strategy: git-LFS-migrate the mockup history vs delete-going-forward.
4. Out-of-tree doctrine: is `web/components/workspace/doctrine.ts` the intended source of truth
   (docs mirror it) or vice versa?
5. `operator/` vs `experience/`: hold the composition-vs-behavior line (recommended) or merge.
6. Versioning: adopt one scheme going forward, or keep all three with a permanent map?
7. `system/` long-term: permanent tier, or eventually fold into `platform/runtime/`?

---

## 13. Validation Checklist

Execution is complete when all pass:

- [ ] `docs-lint` green: 0 broken links in `platform/`,`system/`,`README`; repo-wide < 20 (from 532).
- [ ] No file at `docs/` root except `README.md`.
- [ ] No new singleton folders; `doctrine/`, `execution/`, `core/`(stubs), `forms/`, `programs/`, `platform/premium-operational-experience/` gone.
- [ ] `docs/export/` deleted; ~18 unique files preserved in `archive/`; no `.zip` in docs.
- [ ] `platform_convergence/` + `handoffs/` collapsed into `archive/`; 0 dead `convergence_review_rubric.md` links.
- [ ] `platform/core/data/` exists with 9 docs; `data-system` + `field-system` have owners; README references them.
- [ ] Every `platform/**` + `system/**` doc has valid frontmatter; every `superseded` doc lives in `archive/` with `superseded_by`.
- [ ] `card-archetypes` merged; `commercial-configuration` de-duplicated; `platform-capabilities` collision resolved.
- [ ] The 2 live contradictions carry superseded banners; root README reframed to childcare-first.
- [ ] `docs/system/README.md` describes tier as authoritative; the 7 duplicates archived.
- [ ] Milestone/certification/freeze records all under `platform/milestones/`.
- [ ] `sprints/` on `active/completed/archive` only; month folders archived; indexes rewritten; `08_2026` indexed; 111 MB assets evicted.
- [ ] `product/` contains only vertical docs with banners; `pos/` moved.
- [ ] `audits/` split active/archive; 4 prior doc-audits preserved.
- [ ] `schema/` + `api/` regenerated and current; generated-file hand-edit check active.
- [ ] `.cursor/rules/alloy-project-context.mdc` generated from README; `web/test-results/` untracked.
- [ ] All `REVIEW-GATE` items resolved in their own PRs.
- [ ] CI `docs-lint` flipped to blocking; final sweep green.

---

*Blueprint produced read-only. Every mechanical decision is fixed above; the implementer
executes Phases 0–8 / C1–C9. The only judgment left is the `REVIEW-GATE` set, deliberately
reserved for human doctrine review because those change content, not just location.*
