---
owner: platform
status: historical
last_reviewed: 2026-07-11
concept: documentation-architecture-audit
---

# Alloy Documentation Architecture Audit — July 2026

**Status:** Audit record (point-in-time investigation). **Not doctrine.**
**Audit date:** 2026-07-10 (refreshed against staging 2026-07-11)
**Baseline:** `origin/staging` @ `bb720f495` (audit) → re-synced to `29fbcfb93` for the blueprint.
**Type:** AUDIT ONLY — no files were moved, renamed, deleted, or rewritten.
**Companion:** [`documentation-migration-blueprint-2026-07.md`](./documentation-migration-blueprint-2026-07.md) (the executable plan derived from this audit).

> This audit supersedes the June 12 2026 rebaseline audit set (`documentation-audit.md`,
> `documentation-closeout-report.md`, `documentation-governance-followup.md`,
> `documentation-followup-closeout.md`) as the current-state assessment. Those remain valid
> prior art for how the canonical tree was first established.

---

## 1. Executive Summary

**Alloy's documentation problem is structural entropy, not bad content.** The canonical layer
is genuinely strong and — verified against code — strikingly accurate. The failure mode is
organizational: a disciplined rebaseline established good bones, its follow-ups were never
closed, and a second accumulation wave has since re-created exactly the sprawl the rebaseline
fixed.

Three findings define the situation:

1. **The June 12 2026 rebaseline was real and good, but incomplete.** It established
   `docs/platform/` + `docs/schema/` as canonical (~32 platform docs + generated schema),
   reframed the operator model to Business Process → Stage → Record, and wrote a governance
   doc. But its own closeout left the link sweep, physical sprint migration, schema re-export,
   and glossary fold-in **unchecked** — and they remain open today.

2. **A second, ungoverned accumulation wave (late June–July) rebuilt the sprawl.** The
   `canonical-data-system` cluster (16 files) landed **loose at `docs/` root**, unreferenced by
   any index, and is now the *only* home for Field Catalog and Data System doctrine. The POS
   package (24 files) is misfiled as vertical reference. Sprint artifacts
   (`premium-operational-experience/`, `operational-expansion-wave1-*`) landed **inside the
   canonical tree**. This is the exact pattern the prior audit warned about, reoccurring because
   governance was documented but never enforced.

3. **The canonical content is accurate; the navigation and hygiene around it have decayed.**
   Codebase reality-check verdict: navigation, runtime, actions, process engine, communications,
   status, config, and the honest "staged drawer sunset" framing are all **ACCURATE**. The only
   real accuracy gap is the schema snapshot lagging migrations. Meanwhile hygiene has rotted:
   **532 broken internal links (~20%)**, `docs/sprints/` weighs **111 MB** (mostly 473 stale
   mockup images), `docs/archive/2026-06-handoff-packs/` is **68% byte-identical duplicate** of live docs, and **three
   uncoordinated versioning schemes** (System 1–5C / V1–V4 / Rev N) trap every newcomer.

**The verdict:** Alloy does not need a doctrine rewrite. It needs a **rebaseline v2** — finish
the migration the first one started, fold in the second accumulation wave, and put governance
under machine enforcement so a third wave can't recur. The bones are good enough to support
hundreds of engineers; the surrounding entropy is not.

---

## 2. Current Documentation Inventory

| Subtree | .md | Assets | Size | Last touched | Character |
|---|---|---|---|---|---|
| `docs/sprints/` | 441 | 473 img/html + 11 office | **111 MB** | 2026-07-10 | Execution history; 104 MB in `06_2026/` alone |
| `docs/archive/` | 226 | 3 | 3.5 MB | 2026-06-10 | Genuinely superseded; **clean** |
| `docs/platform/` | 134→137 | 0 | 1.9 MB | 2026-07-10 | **Canonical doctrine** |
| `docs/archive/2026-06-handoff-packs/` | ~94 | 2 zips (580 KB) | 2.3 MB | 2026-06-12 | **68% byte-identical duplicates** of live docs |
| `docs/system/` | 36 | 0 | 0.4 MB | 2026-07-10 | ~22 locked doctrines + ~6 transitional |
| `docs/product/` | 33 | 0 | 0.5 MB | 2026-06-25 | Childcare vertical + misfiled `pos/` (24) |
| `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/` | 28 | 0 | 0.6 MB | 2026-06-09 | **Completed** migration; 7 dead links |
| `docs/api/` | 22 | 0 | 0.5 MB | 2026-06-28 | **Healthy**; generated 460-route index |
| `docs/audits/` | 18 | 0 | 0.3 MB | 2026-07-10 | Prior doc audits + ~11 closed investigations |
| `docs/schema/` | 7 | — | 0.7 MB | 2026-06-28 | **Generated**; stale vs newer migrations |
| loose `docs/` root | ~23 | 0 | — | 2026-07-03 | **Orphaned** canonical-* cluster + layout_v2 + waitlist |
| small folders (forms, governance, core, doctrine, execution, backlog, handoffs) | ~19 | 0 | — | mixed | Small/singleton folders |
| **Non-`docs/`** | ~21 | 50 PDF/PNG + test-results | — | mixed | Mostly legitimate co-located dev runbooks |

**Healthy generated layers** (leave alone): `docs/schema/` (from 8 CSVs in
`docs/supabase/reference/`, regen via `npm run export:supabase-schema` →
`generate-schema-docs.mjs`) and `docs/api/` (`api-index.md` + `api-inventory.json`, 460 routes,
via `generate-api-inventory.mjs`).

**July staging deltas folded in:** foundation gained `platform-manifesto.md` +
`milestones/certification-july-2026.md`; a new `platform/milestones/` folder appeared
(`platform-stabilization-july-2026.md`); an unmerged `docs/platform-freeze-july-2026` branch
adds `milestones/freeze-july-2026.md`. These milestone-class records are being placed
inconsistently (certification in `foundation/`, stabilization in `milestones/`) — the same
entropy pattern continuing.

---

## 3. Documentation Classification Matrix

| Class | Where it lives | Approx count | Disposition |
|---|---|---|---|
| **Canonical Doctrine** | `platform/{core,operator,experience,modules,foundation,governance}` | ~110 | Keep; resolve ownership overlaps (§6) |
| **Canonical — misfiled at root** | loose `canonical-*` + `universal-field-system` | 16 | **Promote** into `platform/core/data/` |
| **Locked Runtime Doctrine** | `docs/system/` | ~22 | Keep & **reclassify as authoritative** |
| **Schema Reference (generated)** | `docs/schema/` + `docs/supabase/reference/*.csv` | 7 + 8 | Keep; regenerate |
| **API Reference (generated + governed)** | `docs/api/` | 22 | Keep as-is |
| **Operator/Developer Guide** | `web/README_ADMIN_AUTH`, `sync/README`, `backend/README_*` | ~10 | Keep co-located |
| **Historical Decision / Migration** | `archive/2026-06-runtime-convergence/platform_convergence/`, `handoffs/`, `archive/2026-06-freeze` | ~31 | **Collapse into `archive/`** |
| **Promotion / Closeout Report** | `sprints/**/*closeout`, `documentation-closeout-report` | ~38 | Archive after summary → release-history |
| **Sprint Artifact** | `sprints/**`, `product/pos/`, `sprints/archive/06_2026/premium-operational-experience/`, `operational-expansion-wave1-*` | ~450 | Archive; evict the ones inside `platform/` |
| **Audit (point-in-time)** | `docs/audits/**` (2026-05-02 cluster) | ~11 | Move to `audits/archive/` |
| **Audit (living)** | `supabase-schema-alignment-audit`, `operational-expansion-architecture-audit-2026-07` | 2 | Keep in `audits/active/` |
| **Duplicate (snapshot copy)** | `export/*/01-canonical/*`, `system/{entity-model,record-system,…}` | ~74 | Delete / banner |
| **Superseded (self-declared, still in canon)** | `commercial-configuration`, `operational-mutation-platform`, `operational-runtime-topology`, `operator/presentation-runtime-doctrine`, layout_v2 (3) | ~7 | Archive |
| **Temporary / scratch** | `PRE_COMMIT_SHIP_CHECK.md`, `backend/ghl_cusotm_field_ids.txt`, `web/test-results/` | 3+ | Delete / gitignore |
| **Redirect stub** | `core/glossary`, `core/system-overview` | 2 | Keep thin or delete post-sweep |

---

## 4. Canonical Documentation Ownership Matrix (summary)

Full owner→supporting→historical mapping is in the blueprint §4. The concepts with **genuine
ownership problems** (as opposed to clean layering):

| Concept | Problem | Recommended owner |
|---|---|---|
| **Field Catalog** | No owner exists in `platform/` | create `platform/core/data/field-system.md` |
| **Data System** | Only lives loose at root | promote `platform/core/data/data-system.md` → `platform/core/data/data-system.md` |
| **Cards** | 11 docs, `card-archetypes` ≈ `universal-card-archetypes` | merge to `universal-universal-card-archetypes.md` |
| **Presentation Runtime** | operator doctrine ("no runtime") contradicts shipped `experience/presentation-runtime-v2` | `experience/presentation-runtime-v2.md`; archive the operator umbrella |
| **Focus Panel** | read-only-blocker docs vs shipped-edit docs | `focus-panel-composition-v2-and-editing.md`; banner the stale ones |
| **Capability model** | basename collision (`platform/foundation/capability-model-doctrine.md` vs `foundation/platform-capabilities.md`) | rename root → `capability-model-doctrine.md` |
| **Commercial config** | duplicated (`commercial/` vs `modules/`) | keep `modules/commercial-configuration.md`; archive the other |
| **Governance** | two folders (`docs/platform/governance/` + `platform/governance/`) | consolidate to `platform/governance/` |
| **Visual tokens** | doctrine lives in code (`web/components/workspace/doctrine.ts`) and docs | reconcile authority (review) |
| **Timezone contract** | canonical doc stranded in `web/docs/` | mirror into `platform/` |

---

## 5. Duplicate Documentation Matrix

| Duplicate set | Copies | Root cause | Action |
|---|---|---|---|
| `export/*/01-canonical/*` ↔ live docs | **63 byte-identical + 11 stale forks** (of 94) | Hand-copied "handoff packs" | **Delete `export/`**; regenerate on demand if needed |
| `communications.md` | 3 divergent copies (177/159/169 ln) | Same doc forked 3 ways | Single owner `modules/communications-platform.md` |
| `system/{entity-model,record-system,actions-and-workflows,navigation-doctrine,api-contracts,roles-and-permissions,workspace-system}` ↔ `platform/*` | 7 pairs | Pre-rebaseline copies retained | Banner or archive |
| `glossary.md` | ×4 (core, platform/governance, 2× export) | Reset residue + export copies | Owner = `platform/governance/glossary.md` |
| `platform/foundation/capability-model-doctrine.md` ↔ `platform/foundation/platform-capabilities.md` | 2 (different content, **same basename**) | Intra-canon collision | Rename root → `capability-model-doctrine.md` |
| `roadmap-and-gaps.md` | ×3 (execution + 2 export) | Export copies | Owner = `platform/foundation/product-roadmap.md` |
| `product/{communications,billing-and-financials,documents-and-forms}.md` ↔ `platform/modules/*` | 3 | Thin vertical stubs | Banner or archive |
| `export/*.zip` (2, 580 KB) | duplicate their own folders | Committed binaries | Remove |

---

## 6. Conflicting Documentation Matrix

Genuine contradictions where a reader can reach opposite conclusions:

| Conflict | Doc A says | Doc B says | Resolution |
|---|---|---|---|
| **Presentation Runtime status** | `operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`: "design stage, no runtime yet" | `experience/presentation-runtime-v2.md`: "all surfaces render through one Presentation Runtime, frozen on staging" | Banner A as superseded-by-B |
| **Focus Panel editing** | `focus-panel-edit-information-doctrine` + `universal-card-system`: "June 2026 read-only blocker" | `focus-panel-composition-v2-and-editing` + July closeout: "runtime edit shipped" | Banner the read-only docs |
| **`system/` authority** | `docs/README.md`: "transitional, prefer platform/" | ~22 system/ files: "Locked / Canonical / Frozen" | Rewrite README framing — system/ is authoritative |
| **Experience Builder version** | `experience-builder-doctrine.md`: "V4 Canvas" | `experience-builder-v3-universal-surface-composition.md`: "V3", dated later (July) | Publish one version map; V2/V3/V4 are axes not a sequence |
| **canonical-* Phase 5 vs July** | July `canonical-status-architecture`: "supersedes Phase 5" | Phase 5 siblings sit beside it, no banner | Add superseded-by headers |
| **Product framing** | root `README.md`: "home cleaning, Bend Oregon" | canonical docs + `.cursor` rules: "childcare-first platform" | Update root README |
| **Canonical↔sprint direction** | `platform/experience/*` links into `sprints/archive/06_2026/*` (5 links) | governance anti-pattern | Fix links; promote or inline |

---

## 7. Obsolete Documentation

- **Self-declared superseded, still in canonical folders:** `commercial/commercial-configuration.md`,
  `modules/operational-mutation-platform.md`, `runtime/operational-runtime-topology.md`,
  `operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md`.
- **Superseded sprint artifacts at root:** `layout_v2_foundation_design.md`,
  `layout_v2_drawer_doctrine.md`, `LAYOUT_CONFIG_V2_FOUNDATION_AUDIT.md`,
  `waitlist_layout_v2_audit.md`, `waitlist_candidate_card_vm_layout_v2_plan.md`.
- **Reverted-in-production doc presented as doctrine:** `system/bos-operational-intake-shell-doctrine.md`.
- **Completed migrations still living as active trees:** `archive/2026-06-runtime-convergence/platform_convergence/` (28), `handoffs/` (3, all closed).
- **Stale generated snapshots:** `docs/schema/*` (2026-06-28) predates
  `20260715120000_communications_identity_platform_foundation.sql` → the freshest subsystem
  (Communications Identity) *looks* undocumented.
- **Point-in-time audits with closed findings:** ~11 files in `docs/audits/` dated 2026-05-02.
- **Orphaned root scratch:** `PRE_COMMIT_SHIP_CHECK.md` (one-off May sprint result).

---

## 8. Missing Documentation

| Gap | Why it matters |
|---|---|
| **Field Catalog canonical owner** in `platform/core/` | Only lives at root; no doctrine home |
| **Data System canonical owner** in `platform/core/` | SSOT-for-business-facts doctrine marooned at root |
| **Master version map** (System 1–5C ↔ V1–V4 ↔ Rev N) | Three schemes, no index — biggest newcomer trap |
| **`operator/` folder index/README** | 51 files, 11 on Cards alone, no map |
| **`.github/` PR template + CONTRIBUTING** | Heavy agent-governance elsewhere, none at the contribution gate |
| **`foundation/runtime-architecture-map.md`** | Referenced twice from `experience/`, does not exist |
| **`convergence_review_rubric.md`** | Referenced by 7 files in `archive/2026-06-runtime-convergence/platform_convergence/`, does not exist |
| **Doc ownership / CODEOWNERS + versioning/governance metadata** | No per-doc owner, status vocabulary, or review date |
| **Link-integrity + schema-freshness CI** | 532 broken links and a month-stale schema went undetected |
| **Timezone contract in canonical tree** | Real doctrine stranded in `web/docs/` |

---

## 9. Codebase Accuracy Reality-Check

Docs were checked against implementation. Verdicts:

| Area | Verdict | Note |
|---|---|---|
| Navigation / routes (`/workspace`, work-unit, Focus Panel; `/dept` removed) | **ACCURATE** | `web/app/adminV2/workspace/**`, rewrites in `next.config.ts` |
| Runtime (Surface ViewModels, Focus Panel owns subject) | **ACCURATE** | `web/lib/adminV2/runtime/{surface,focusPanel,operationalContext}/*` |
| Actions (registry, `resolveActionsForContext`) | **ACCURATE** | `web/lib/admin/actions/*`, `web/lib/adminV2/actions/*` |
| Process engine + Operational Facts | **ACCURATE** | `web/lib/process/{engine,definitions/enrollment}/*`, `emitEvent`→`workflow_events` |
| Communications | **ACCURATE** | `web/lib/communications/*`, `backend/app/services/message_sender.py` |
| Focus Panel vs Drawer (staged sunset) | **ACCURATE (honest)** | Drawers still physically dominant (~1459 vs ~208 files); docs say so |
| Schema | **PARTIALLY-STALE** | Generator fine; CSV export 2026-06-28 lags newer migrations |
| Configuration (Runtime V1, Experience Builder V3) | **ACCURATE** | `web/app/adminV2/settings/surfaces/`, `surfaceComposition/*` |
| Status (via action pipeline) | **ACCURATE** | `updateStatusAction.ts` runtime-only registered action |

**Top accuracy gap:** the schema snapshot lagging migrations makes the freshest subsystem
(Communications Identity, migration dated 2026-07-15) *look* undocumented in `docs/schema/`.
Regenerate on a staging export.

---

## 10–16 (Recommended architecture, archive strategy, cleanup, governance, migration, risks, open questions)

These sections were the design output and are carried forward in full in the executable
blueprint. See [`documentation-migration-blueprint-2026-07.md`](./documentation-migration-blueprint-2026-07.md):

- Recommended Documentation Architecture → blueprint §2 (Target Architecture)
- Recommended Archive Structure → blueprint §6 (Archive Matrix)
- Repository Cleanup Findings → blueprint §3.8 + §11 below
- Documentation Governance Recommendations → blueprint §8 (Governance Model)
- Migration Strategy / Execution Plan → blueprint §10–11
- Risks → blueprint §12
- Open Questions → blueprint §12 + handoff doc

### Repository cleanup findings (report only)

| Item | Size/count | Recommendation |
|---|---|---|
| `docs/sprints/archive/06_2026/` mockup assets | ~104 MB, ~400 PNG + 70 HTML | Evict from git (LFS/external) |
| `docs/archive/2026-06-handoff-packs/*.zip` (2) | 580 KB | Remove (duplicate their own folders) |
| `docs/archive/2026-06-handoff-packs/` markdown | 74 dup/stale of 94 | Delete tree; extract ~18 unique first |
| `web/docs/sprints/archive/07_2026/**` | 50 PDF/PNG | Move out of git |
| `web/test-results/` | committed Playwright output | Untrack + `.gitignore` |
| `docs/sprints/archive/06_2026/communications-v2/*.docx/.xlsx` | 7 office files | Archive/external |
| `PRE_COMMIT_SHIP_CHECK.md` (root) | 1 | Delete or archive |
| `backend/ghl_cusotm_field_ids.txt` | 1 (typo) | Rename |
| `.cursor/rules/repo-boundry.mdc` | typo + hard-scoped to `/Users/Kelly/Alloy` | Fix |

---

*Audit produced read-only. No repository files were changed by the audit itself. The migration
that acts on these findings is specified in the companion blueprint and must be executed
separately under its own review.*
