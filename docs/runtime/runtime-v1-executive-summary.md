---
owner: platform
status: executive-summary
last_reviewed: 2026-07-19
---

# Runtime V1 — Executive Summary

## The one question

> **Can Alloy now confidently build products on Runtime V1 without reopening Runtime architecture?**

**Yes.** The Runtime architecture is mature, documented, and certified. Products are built *on* Runtime
V1 by publishing configuration and extending the provisioning answer — not by touching the runtime. One
bounded hygiene sprint (the test-suite sweep) stands between the current branch and a clean merge to
staging; it is engineering cleanup, not architecture.

## What Runtime V1 solved

- **One lifecycle for every operational surface:** Destination → Preparation → Provisioning → Commit →
  Settlement. The operator never experiences *click → loading page → render*; they experience
  *destination → prepared → commit → settlement*.
- **One owner per responsibility,** with a clean Runtime/Product boundary: Runtime owns destination,
  preparation, provisioning, commit, settlement, the warm cache, timing, and the operational lifecycle;
  Product owns composition, placement, ordering, visibility, card selection, and archetypes. **Configuration
  drives Runtime; Runtime contains no enrollment-specific behavior.**
- **The Focus Panel commits the published Summary composition** at commit (server-resolved in the one
  provisioning answer), summary-level — not an expanded drawer. Settlement enriches the summary; the
  workspace owns detailed interaction. This is live-proven: the org's *custom* published composition
  renders exactly, with zero engineering.
- **The operational workspaces became warm-first Runtime consumers** (Processing, Work Items, Operational
  Intelligence, Inbox) — warm the exact data on nav intent, serve warm-first, dedupe to one request per
  scope, open with no visible load. Four warm caches converged onto one extracted primitive
  (`createWarmCache`).
- **Real defects were found and fixed along the way** — the Inbox's runaway fetch loop (150→19) and a
  separate React render loop (now 0 max-update-depth errors); the Work View shell remount/flash; the
  Activity "loading conversation" wait; the Current Work summary showing expanded detail.

## What Runtime V1 intentionally does NOT solve (deferred to V2)

These are **extensions built on frozen V1**, not architecture gaps:

- Brand-new card **types** (existing archetypes are honored; a new key needs code).
- Archetype-driven rendering of the not-yet-implemented archetypes.
- Operational workspaces as full K1→K2→K3 **commit** consumers (they share the warm-first *data*
  lifecycle today, not the commit lifecycle).
- Inbox to literal zero-fetch reopen (content already paints warm).
- Folding the three genuinely-different bespoke caches onto the primitive.

## What future product work will pressure-test Runtime (→ V2 signals)

Do not build for these now; expect them to expose the V2 boundary:

- **Scheduling / Attendance** — time-windowed, high-frequency destinations → warm-cache staleness + the
  per-lens Row Grain constraint.
- **Commercial / Programs** — non-enrollment processes → the "no product-specific behavior" claim and the
  archetype generalization.
- **Director / cross-org** — multi-scope attention → destination identity, the pill-vs-tile question.
- **The first product with a NEW card type** — the natural trigger to open Runtime V2's archetype renderer.

## The bottom line

Runtime V1 is **architecturally ready to freeze.** It has a single lifecycle, a single owner per
responsibility, a config-driven surface, a certified operator experience, and a documented Constitution
with clear extension points. The recommendation is **Option B**: freeze the architecture, land the one
defined test-suite sweep, then merge. After that, Alloy builds products *on* Runtime V1 — and stops
reopening Runtime.

**Deliverables (this session):** Runtime Constitution V1 · Browser Certification · Purification Report ·
Freeze Report · this Executive Summary · reconciled Kernel / Engineering Specification / Operational
Doctrine. See [`docs/runtime/`](./) and [`docs/runtime/final-sprint/`](./final-sprint/README.md).
