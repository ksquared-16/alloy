---
owner: platform
status: historical-record
last_reviewed: 2026-07-19
runtime_version: Runtime V1
---

# Runtime V1 — Closeout

**The permanent historical record of Runtime V1.** Written for someone reading it two years from now who
wants to understand why Runtime V1 exists, what it is, and where its edges are.

- **Runtime version:** V1
- **Date frozen:** 2026-07-19
- **Branch:** `agent/claude/3-runtime-drawer-deletion` (managed Slot 3)
- **Merge:** fast-forward into `staging` from `ba5f50cb6` → the branch head (113+ commits). Clean
  fast-forward — `staging` was a strict ancestor of the branch, so there were no conflicts and no merge
  commit. See §8.

---

## 1. Why Runtime V1 exists

Before Runtime V1, entering an operator surface was a cascade: `pathname → mount → useEffect fetch ×N →
a multi-condition readiness gate → reveal`. The operator watched Alloy *build itself* — a blank canvas,
a skeleton, cards popping in one by one, a Focus Panel that resolved in several visible stages. Data
ownership was diffuse: the drawer, the queue, and the URL each thought they owned "who the operator is
working on," which produced synchronization loops (thousands of duplicate requests) and mixed frames.

Runtime V1 replaced that with **one lifecycle, one owner per responsibility, and a config-driven
surface** — so the operator experiences *attention movement*, and the complete operational surface
appears at once.

## 2. What Runtime V1 accomplished

- **One lifecycle:** Destination → Preparation → Provisioning → Commit → Settlement. The operator never
  experiences *click → loading page → render*; they experience *destination → prepared → commit →
  settlement*.
- **A single owner per responsibility,** with a hard Runtime/Product boundary (§4).
- **The Focus Panel commits the published Summary composition at commit** — server-resolved inside the
  one provisioning answer, summary-level (not an expanded drawer). Settlement enriches; the workspace
  owns detail. The org's *custom* published composition renders exactly, zero engineering.
- **The operational workspaces became warm-first Runtime consumers** (Processing, Work Items, Operational
  Intelligence, Inbox) — warm on nav intent, warm-first, deduped, no visible load. Four bespoke warm
  caches converged onto one extracted primitive, `createWarmCache`.
- **Real defects found and fixed** along the way: the Inbox's runaway fetch loop (150→19) and a separate
  React render loop (→ 0 errors); the Work View shell remount/flash; the Activity "loading conversation"
  wait; the Current Work summary showing expanded detail; and — caught during the freeze re-certification
  — `createWarmCache.getState` referential stability for `useSyncExternalStore`.

## 3. The final architecture

The runtime is **exactly four systems** (the kernel):

- **K1 Attention** — the only cause. Operator intent registers a destination; movement supersedes movement.
- **K2 Provisioning** — truth acquisition. Prepares (warms) at intent, then produces one authoritative
  terminal answer carrying everything to render the first operational frame.
- **K3 Focus** — the visible world. The *atomic operational commit* (header + queue + focus panel
  together) happens only when a K2 terminal reaches K3 — never a clock, never the DOM. Owns hold,
  retention, and URL projection.
- **K4 Instrumentation** — observes; participates in nothing.

The Constitution re-expresses K1/K2/K3 in the linear operator vocabulary Destination → Preparation →
Provisioning → Commit → Settlement (same behavior, linear names). Detailed spec:
[`alloy-runtime-kernel.md`](../platform/runtime/alloy-runtime-kernel.md).

## 4. Constitutional decisions

1. **One owner per responsibility.** A change that creates a second owner is unconstitutional. Legacy
   ownership is deleted in the migration that supersedes it — never left dormant.
2. **Configuration drives Runtime.** Runtime contains no product-specific (enrollment-specific)
   behavior. Product owns composition, placement, ordering, visibility, card selection, and archetypes;
   Runtime owns destination, preparation, provisioning, commit, settlement, warm cache, timing, and the
   operational lifecycle.
3. **The first committed surface is the published Summary composition** — not the expanded workspace.
   Settlement enriches the summary; the workspace owns detailed interaction.
4. **Settlement never gates commit and never creates operational truth.** The operator can perform the
   first meaningful action from the provisioning answer alone.
5. **A Runtime Consumer prepares, commits, and settles** — and warms the exact data it will read at
   intent, serving it warm-first.

Full text: [`runtime-constitution-v1.md`](./runtime-constitution-v1.md).

## 5. What changed from the original runtime

| Original | Runtime V1 |
|---|---|
| `pathname → mount → useEffect fetch ×N → readiness gate → reveal` | Attention → Provisioning answer → atomic commit → settlement |
| Drawer / queue / URL each owned the operational subject → sync loops | One committed Operational Subject (K3), single owner |
| Focus Panel resolved post-commit via client fetches, in visible stages | Focus Panel Summary commits WITH the surface, server-resolved in the one answer |
| Current Work card showed the full expanded workspace at commit | Current Work commits summary-level; detail is the drill-in workspace |
| Operational workspaces mount-and-fetch on open (fetch storms, loops) | Warm-first consumers on `createWarmCache` — no visible load |
| Config resolution ad-hoc (`highestVersion`, `filter+sort`) | One applicability resolver `resolveSurfaceVariant`; published-only, deterministic |

## 6. Browser certification summary

Certified against the authenticated app (freeze re-run): Focus Panel commits the published Summary
composition (`docSource: published-doc`, summary-level card); Work View switch is attention movement
(shell node identical, no boot-shell flash, pills persist); Activity opens warm (no "loading
conversation"); Processing / Work Items / Operational Intelligence open warm (warm reopen ~0 fetches);
Inbox opens with **0 max-update-depth loops** (was ~150 fetches + a render loop). Runtime timing marks
present. One defect was caught and fixed during the re-run (getSnapshot stability). Full evidence:
[`runtime-v1-browser-certification.md`](./runtime-v1-browser-certification.md).

## 7. Known limitations (intentional V1 boundaries)

Recorded in full in [`runtime-v1-known-limitations.md`](./runtime-v1-known-limitations.md). In brief:
new card *types* require registration (existing archetypes are zero-code); operational workspaces share
the warm-first *data* lifecycle, not the *commit* lifecycle; three bespoke caches stay bespoke; the Inbox
revalidates on reopen; flag-gated comms legacy awaits a product decision; one superseded settlement fetch
is a V1.1 refactor; the runtime test suite modernization is a separate initiative
([`runtime-test-hygiene-initiative.md`](./runtime-test-hygiene-initiative.md)). **None are runtime
defects.**

## 8. Merge information

- **Source:** `agent/claude/3-runtime-drawer-deletion` (Slot 3 worktree).
- **Target:** `staging`.
- **Method:** fast-forward (staging @ `ba5f50cb6` was a strict ancestor of the branch head) — no merge
  commit, no conflicts.
- **Local promotion only.** `staging` was advanced locally and its build verified. Pushing to
  `origin/staging` (which triggers CI/Vercel) is a separate outward step and was **not** performed here.

## 9. Future Runtime evolution guidance

**Do not build Runtime V2 speculatively.** Runtime V1 is frozen constitutional infrastructure; it is
*extended*, never reopened. Future Runtime evolution must come from **real product pressure**, not
speculation. The natural pressure points are recorded in the Known Limitations (Scheduling / Attendance
/ Commercial / Director, and the first product introducing a new card type). When one of those products
genuinely cannot be expressed on V1's extension points, that — and only that — is the signal to consider
Runtime V2. Until then, the next work is **product development on top of Runtime V1.**

## 10. Final recommendation

**Runtime V1 is complete and frozen.** Alloy can confidently build future products on Runtime V1 without
reopening Runtime architecture — the lifecycle, ownership boundary, Focus Panel model, and consumer
doctrine are frozen, documented, and certified, and products build on the extension points (publish
composition, extend the provisioning answer, add warm-first surfaces, add actions via config). The one
follow-on — the Runtime Test-Suite Hygiene initiative — is independent engineering that does not gate
product work. **The Runtime initiative is closed.**
