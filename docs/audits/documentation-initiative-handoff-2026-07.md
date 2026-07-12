---
owner: platform
status: historical
last_reviewed: 2026-07-11
concept: documentation-initiative-handoff
---

# Documentation Architecture Initiative — Engineer Handoff (July 2026)

**Status:** Handoff record. **Not doctrine.** Read this first, then the blueprint.
**Owner of next phase:** whoever executes the migration.
**Prepared:** 2026-07-11 against `origin/staging` @ `29fbcfb93` (planning baseline).

> **Reconciliation note (handoff promotion, 2026-07-11).** Between opening the handoff PR and
> merging it, `origin/staging` advanced `29fbcfb93 → f6081c46b` via **PR #163
> ("certify and freeze July 2026 platform architecture")**. That change added
> `docs/platform/milestones/freeze-july-2026.md` and touched `README.md`,
> `platform-manifesto.md`, `product-roadmap.md`, and `release-history.md`. It did **not** touch
> `docs/audits/`, so it does not conflict with these handoff files, and the audit/blueprint were
> **not** rewritten. Two consequences for the implementer:
> 1. **Latest `origin/staging` is authoritative** — the planning baseline (`29fbcfb93`) is a
>    historical marker, not current truth. Reconcile against the newest staging before executing.
> 2. The freeze doc that the blueprint (§3.2) described as an *unmerged branch* has now **merged**
>    to `docs/platform/milestones/freeze-july-2026.md`. The blueprint's guidance stands
>    (on migration, relocate it to `platform/milestones/freeze-july-2026.md`).

---

## What this initiative is

A two-phase effort to establish Alloy's long-term canonical documentation architecture:

1. **Audit** → [`documentation-architecture-audit-2026-07.md`](./documentation-architecture-audit-2026-07.md)
   — the current-state assessment (what exists, what conflicts, what's stale/duplicated).
2. **Blueprint** → [`documentation-migration-blueprint-2026-07.md`](./documentation-migration-blueprint-2026-07.md)
   — the authoritative, executable plan (target tree, per-file manifest, ownership matrix,
   governance model, CI validation, phased execution + commit sequence).

Both phases were **planning only** — no doctrine was rewritten, no files reorganized. These three
docs are the entire deliverable.

---

## The one-paragraph situation

Alloy's canonical doctrine (`docs/platform/` + generated `docs/schema/`/`docs/api/`) is **good and
verified accurate to code**. The problem is **structural entropy**: the June 12 2026 rebaseline
built clean bones but never closed its follow-ups, and a second wave (late-June–July) rebuilt the
sprawl — 16 orphaned `canonical-*` files at `docs/` root, sprint artifacts leaking *into*
`platform/`, a mislabeled `system/` tier, 532 broken links (~20%), a 111 MB pile of stale sprint
mockups, and a 68%-duplicate `export/` tree. **Fix = rebaseline v2 + governance-in-CI. Do NOT
rewrite doctrine.**

---

## What the next engineer does (execution order)

Follow the blueprint's §10 (phases) and §11 (commits). The spine:

| Phase | Commit | Gist |
|---|---|---|
| 0 | C1 | Land `scripts/docs-lint.mjs` + CI (report-only); regenerate schema/api; baseline 532 broken links |
| 1 | C2 | **Banner the 2 live contradictions + 7 self-superseded docs; fix root README framing** (zero link risk) |
| 2 | C3 | Promote the `canonical-*` cluster → `platform/core/data/`; create Data-System + Field-System owners |
| 3 | C4 | Evict sprint artifacts from `platform/`; consolidate `milestones/`; merge `card-archetypes` |
| 4 | C5 | Reclassify `system/` as authoritative; fold `docs/platform/governance/` → `platform/governance/`; delete stubs |
| 5 | C6 | Move `product/pos/`; delete `export/` (extract ~18 unique first); collapse archive trees; split `audits/` |
| 6 | C7 | Normalize `sprints/` to `active/completed/archive`; evict 111 MB assets (**separate PR**) |
| 7 | C8 | Untrack `web/test-results/`; move binaries; generate `.cursor` load order from README |
| 8 | C9 | Flip `docs-lint` to blocking; final link sweep green |

**Golden rule for execution:** instrument first, banner-in-place before moving, move leaves before
hubs, update links in the same commit, delete last. Each commit must leave links green.

---

## Highest-leverage first moves

1. **Phase 1 (banners) has zero link risk and immediate value** — do it first, ship it, get truth
   integrity before any file moves.
2. **Governance-in-CI (Phase 0) is the actual cure.** The governance policy already exists on
   paper (`platform/governance/documentation-governance.md`); its own anti-patterns are what's
   being violated. Enforcement is the leverage — without it, a third entropy wave forms in ~6 weeks.

---

## `REVIEW-GATE` items — human doctrine decisions, DO NOT auto-execute

These require judgment (they change content, not just location). Each gets its own reviewed PR:

- **Phase-5 vs July data-contract reconciliation** — `canonical-status-architecture` (July) says it
  supersedes the Phase-5 contract, but the Phase-5 siblings sit beside it unbannered. Reconcile
  before/while promoting to `platform/core/data/`.
- **Sprint→doctrine promotion** — ~9 candidate sprint docs may be the *only* home for a concept
  (list in blueprint §7). Check for a `platform/`/`system/` twin: twin → archive; none → flag for
  doctrine review. **Never blind-move a sprint seed into `platform/`.**
- **Out-of-tree authorities** — `web/docs/TIMEZONE_SEMANTICS.md` (real TZ contract) and
  `web/components/workspace/doctrine.ts` (visual tokens as code). Decide canonical direction
  before mirroring.
- **`platform-freeze-july-2026`** — **now merged** to `docs/platform/milestones/freeze-july-2026.md`
  (PR #163, staging `f6081c46b`). Phase 3's `milestones/` consolidation must relocate it to
  `platform/milestones/freeze-july-2026.md` and account for the accompanying README/manifesto/
  roadmap/release-history edits that landed with it.

## Owner decisions needed before execution (blueprint §12)

1. Sprints scheme: lifecycle (recommended) vs month folders.
2. `export/` packs: keep (build a generator) vs delete — offline portability still required?
3. **111 MB mockup assets: git-LFS-migrate the history vs delete-going-forward** (history-rewrite call).
4. `operator/` vs `experience/`: hold the composition-vs-behavior line (recommended) vs merge.
5. `system/` long-term: permanent locked tier vs eventually fold into `platform/runtime/`.

---

## Guardrails / gotchas

- **`staging` is checked out in another worktree** (`operational-calculations`) — you cannot
  `git checkout staging` from a fresh worktree; deliver via a branch + PR (as this handoff did).
- **The web/ vitest baseline is ~750 red** and worktrees can be ~1000+ commits behind
  `origin/staging` — always sync to newest staging before acting; this is docs-only so tests are
  not the gate, but don't audit a stale tree.
- **The canonical docs are accurate — trust them.** The reality-check (audit §9) found nav,
  runtime, actions, process engine, comms, status, config all ACCURATE. The lone real gap is the
  **schema snapshot lagging migrations** (regenerate with a staging `DATABASE_URL`), which makes
  Communications Identity *look* undocumented though it is built.

---

## Provenance

- Audit baseline: `bb720f495`; blueprint + handoff planning baseline: `29fbcfb93`. Handoff
  promoted to staging after it advanced to `f6081c46b` (see the Reconciliation note above);
  always defer to the newest `origin/staging`.
- These three docs live in `docs/audits/` (consistent with the repo's prior documentation-audit
  precedent). Under the blueprint's own target, `audits/` holds point-in-time investigations;
  once the migration executes, these move to `audits/active/` → then `audits/archive/`.
- Nothing outside `docs/audits/` was changed to produce this handoff.
