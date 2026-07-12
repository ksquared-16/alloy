---
owner: platform
status: sprint
last_reviewed: 2026-07-12
concept: documentation-rebaseline-v2
---

# Documentation Rebaseline V2 — Current Staging Reconciliation

**Wave:** 1 (governance + validation only)  
**Record type:** Sprint execution history — not canonical doctrine.

---

## Baseline SHAs

| Marker | SHA | Notes |
|--------|-----|-------|
| **Current `origin/staging`** | `f70730c167dd3dfe5a7c72ce40f71f5bc588d39c` | Authoritative truth for this wave |
| **Handoff merge to staging** | `3c767ef9ea60807c8bb86fc666ddaab41fa7bd28` | Placed audit/blueprint/handoff on staging |
| **Handoff planning baseline** | `29fbcfb93` | Recorded in handoff; superseded by newer staging |
| **Audit baseline** | `bb720f495` | Original architecture audit snapshot |

**Staging advanced beyond handoff merge:** Yes — **33 commits** between `3c767ef9` and `f70730c16`.

---

## Documentation changes since handoff merge (`3c767ef9` → `f70730c16`)

45 paths under `docs/` changed. Classification:

### Canonical content updates (no blueprint structural impact)

| Path | Classification |
|------|----------------|
| `docs/platform/core/business-process-system.md` | Content update — Work Items V3 convergence references |
| `docs/platform/core/navigation-and-workspace-doctrine.md` | Content update — certified Communications + Work Items |
| `docs/platform/foundation/platform-capabilities.md` | Content update — V3 platform capabilities |
| `docs/platform/foundation/release-history.md` | Milestone record — Work Items V3 ship |
| `docs/platform/governance/design-and-operational-doctrine.md` | Content update |
| `docs/platform/governance/glossary.md` | Content update |
| `docs/platform/governance/implementation-patterns.md` | Content update |
| `docs/platform/modules/communications-platform.md` | Content update — convergence with Work Items |
| `docs/platform/operator/identity-surface-composition.md` | Content update |
| `docs/platform/operator/queue-system.md` | Content update — Work Items queue integration |
| `docs/platform/operator/universal-card-archetypes.md` | Content update |

### New canonical document

| Path | Classification | Blueprint impact |
|------|----------------|------------------|
| `docs/platform/operator/identity-surface-composition-v2.md` | New canonical operator doctrine (Identity Disclosure V2) | **Add to manifest** as KEEP; not in July blueprint inventory |

### Sprint-only changes (no Wave 1 action)

| Paths | Classification |
|-------|----------------|
| `docs/sprints/07_2026/current-work-action-hardening/00-sprint-closeout.md` | Sprint closeout update |
| `docs/sprints/08_2026/*` (field platform, processing, work-items-v3 QA matrices + screenshots) | Sprint execution artifacts |

**No path changes, ownership moves, or structural tree edits** occurred in canonical layers since the handoff merge.

---

## Blueprint discrepancies (staging wins)

| Blueprint assumption (July plan) | Current staging reality | Manifest adjustment |
|----------------------------------|-------------------------|---------------------|
| `platform-freeze-july-2026.md` on unmerged branch | **Merged** at `docs/platform/foundation/platform-freeze-july-2026.md` (PR #163) | Wave 3 MOVE to `milestones/` still planned; location updated |
| `presentation-runtime-v2.md` cited as superseding operator doctrine | Lives at `docs/platform/experience/presentation-runtime-v2.md` (not `operator/`) | Supersession banner targets operator doc; survivor path is `experience/` |
| `docs/platform/experience/` folder | **Exists** with 13 files including PR-v2 closeout/handoff | Blueprint MOVE of closeout/handoff to sprints still valid |
| Work Items V3 platform | **Shipped to staging** (PR #165) after blueprint | Add V3 docs to manifest as KEEP; no structural move in Wave 1 |
| Identity Disclosure V2 | **Shipped** (PR #171) after blueprint | New `identity-surface-composition-v2.md` added to manifest |

---

## Completed or invalidated blueprint items

| Blueprint item | Status on staging |
|----------------|-------------------|
| Land handoff audit trio in `docs/audits/` | **Completed** (merge `3c767ef9`) |
| Merge platform-freeze-july-2026 | **Completed** (PR #163, before handoff merge) |
| Install `scripts/docs-lint.mjs` | **Wave 1 in progress** (this branch) |
| Promote `canonical-*` cluster to `platform/core/data/` | **Not started** (Wave 2+) |
| Evict sprint leakage from `platform/` | **Not started** — `premium-operational-experience/` still in `platform/` |
| Delete `docs/export/` | **Not started** |
| Normalize sprints lifecycle folders | **Not started** |

---

## New conflicts or duplicates

| Item | Severity | Wave 1 action |
|------|----------|---------------|
| `identity-surface-composition.md` vs `identity-surface-composition-v2.md` | Expected version progression | **REVIEW-GATE** — confirm v1 supersession relationship in Wave 2 |
| `presentation-runtime-doctrine.md` (operator) vs `presentation-runtime-v2.md` (experience) | Known live contradiction from audit | Banner in Wave 1 truth-integrity pass |
| 16 `canonical-*` files at `docs/` root | Structural debt (unchanged) | Manifested for Wave 2 MOVE |
| Schema CSV missing `communications_identity` tables | Generated reference stale | Record blocker; regen needs `DATABASE_URL` |

---

## Open review gates (unchanged from handoff)

1. Phase-5 vs July data-contract reconciliation (`canonical-status-architecture` vs Phase-5 siblings)
2. Sprint→doctrine promotion candidates (~9 docs per blueprint §7)
3. Out-of-tree authorities (`web/docs/TIMEZONE_SEMANTICS.md`, `web/components/workspace/doctrine.ts`)
4. `operator/` vs `experience/` presentation-runtime ownership line
5. `system/` long-term tier vs fold into `platform/runtime/`
6. Identity Surface Composition v1 → v2 supersession

---

## Open documentation branches / PRs (concurrency)

| PR | Branch | Relevance |
|----|--------|-----------|
| [#114](https://github.com/ksquared-16/Alloy/pull/114) | `docs/presentation-runtime-v2-closeout` | Milestone freeze doc — unmerged |
| [#136](https://github.com/ksquared-16/Alloy/pull/136) | `docs/work-items-v3-phase1-freeze` | Work Items freeze — unmerged; staging already has V3 ship docs |
| [#10](https://github.com/ksquared-16/Alloy/pull/10) | `claude/runtime-simplification-plan` | Historical planning — no merge assumed |

**Concurrency rule:** Do not cherry-pick unmerged doc branches. Reconcile against `origin/staging` only.

---

## Wave 1 readiness decision

**Wave 1 may safely proceed.**

Rationale:

- Handoff files present and indexed as planning artifacts.
- Staging advanced with content-only canonical updates; no structural migration occurred.
- Blueprint remains directionally valid; discrepancies recorded above and reflected in the execution manifest.
- No blocking conflict with open doc PRs for Wave 1 scope (governance, validation, link repair).

**Wave 2 prerequisite:** This reconciliation + frozen manifest + docs-lint baseline landed on staging.
