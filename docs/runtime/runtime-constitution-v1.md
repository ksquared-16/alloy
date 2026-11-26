---
owner: platform
status: ratified
last_reviewed: 2026-07-19
supersedes: []
---

# Runtime Constitution V1

**Status: RATIFIED — Runtime V1 constitutional infrastructure.**

This is the single constitutional reference for the Alloy Runtime. Products are built **on top of**
Runtime V1; they do not reopen it. Future engineering must **extend** this model, never introduce a
parallel owner or a second lifecycle. Where a detailed spec is needed, this Constitution points to the
frozen kernel and the region constitution — it does not restate them.

- **The kernel** (what runtime exists): [`alloy-runtime-kernel.md`](../platform/runtime/alloy-runtime-kernel.md) — K1 Attention · K2 Provisioning · K3 Focus · K4 Instrumentation.
- **Work Unit region ownership** (Header/Queue/Focus Panel/Actions/Editing): [`work-unit-configuration-runtime-constitution.md`](../platform/runtime/work-unit-configuration-runtime-constitution.md).
- **Operator laws** (never watch Alloy build itself): [`operational-runtime-doctrine.md`](../platform/runtime/operational-runtime-doctrine.md).
- **Performance doctrine** (what the runtime must achieve, its two performance classes, readiness strategy, and the frozen performance invariants): [`operator-runtime-performance-certification.md`](../platform/runtime/operator-runtime-performance-certification.md).
- **Freeze evidence**: [`docs/runtime/final-sprint/`](./final-sprint/README.md) (8 reports) + the Runtime V1 Freeze Report and Executive Summary alongside this file.

---

## 1. The one lifecycle

Every Runtime consumer moves an operator through exactly this, and nothing else:

```
Destination  →  Preparation  →  Provisioning  →  Commit  →  Settlement
```

- **Destination** — where the operator's attention points (a work unit + lens, a subject, a workspace).
  Caused only by an operator gesture. Movement supersedes movement.
- **Preparation** — anticipatory warming of the destination the instant intent is registered (nav
  intent, hover/focus, idle prefetch). Preparation never gates a reveal.
- **Provisioning** — one authoritative answer that carries everything needed to render the destination's
  first operational frame: identity, business state, the truthful primary action, the commit-critical
  Focus Panel projections, and the resolved presentation composition.
- **Commit** — the atomic moment the visible world catches up to attention. Header, Queue, and Focus
  Panel commit together from the provisioning answer. Commit is caused only by the provisioning terminal
  — never a clock, never the DOM.
- **Settlement** — post-commit enrichment. Settlement fills reserved geometry and deeper detail in
  place. **Settlement never gates commit and never creates operational truth.**

### 2. Mapping to the kernel (no architecture changed — only phase names)

| Constitution phase | Kernel (`alloy-runtime-kernel.md`) |
|---|---|
| Destination | K1 **Attention** — `attention.moved` (E1) |
| Preparation | K2's *prepare* phase (warming begun at intent) |
| Provisioning | K2 **Provisioning** as a whole — `preparation.terminal` (E2) |
| Commit | K3 **Focus** — `focus.committed` (E3) = Operational Commit |
| Settlement | K2 settlement phase, applied by K3 — `focus.settled` (E4) |

The kernel folds "Destination" into Attention and "Preparation" into Provisioning; this Constitution
makes the five phases linear for the operator vocabulary. The behavior is identical.

---

## 3. Ownership (the boundary that cannot move)

**Runtime owns** — and is the *sole* owner of:

| Responsibility | Sole owner (file) |
|---|---|
| Destination identity | `lib/runtime/graph/destinationId.ts` + `resolveOperationalDestination.ts` |
| Attention (K1) | `lib/runtime/kernel/attention.ts` |
| Preparation (anticipatory) | `lib/runtime/kernel/workUnitProvisioningPrefetch.ts` + nav-intent warms + `createWarmCache` |
| Provisioning (K2) | `lib/runtime/kernel/provisioning.ts` + `lib/runtime/provisioning/workUnitProvisioningAnswer.ts` |
| Commit (K3, atomic) | `lib/runtime/kernel/focus.ts` `FocusOwner.onPreparationTerminal` |
| Settlement | `lib/presentation/runtime/useWorkUnitSettlement.ts` + the record VM (`useRecordWorkRuntime`) |
| Warm cache (operational lifecycle) | `lib/runtime/warmCache.ts` (`createWarmCache`) + per-surface consumers |
| Runtime timing | `lib/adminV2/runtime/focusPanel/focusPanelCommitTiming.ts` + `lib/perf/perceivedPerf.ts` |

**Product owns** — and Runtime must never author:

- **composition** (which cards/regions appear), **placement**, **ordering**, **visibility**, **card
  selection**, **card archetypes** — all through published configuration (`entity_layouts` /
  `action_placements`), resolved by the ONE applicability resolver `resolveSurfaceVariant`.

**Invariants.**
1. No responsibility above has a second owner. A change that creates one is invalid.
2. Legacy ownership is **deleted in the migration that supersedes it** — never left dormant.
3. **Configuration drives Runtime.** Runtime contains no product-specific (enrollment-specific)
   behavior. If Product publishes a different composition, Runtime renders it with zero engineering.

---

## 4. Focus Panel Constitution (the final product model)

**The first committed surface is the published Summary composition — not the expanded workspace.**

- At commit, the Focus Panel renders the org's **published Summary** composition (`docSource:
  published-doc`), resolved server-side inside the provisioning answer (`focusPanelSummaryDoc`, `fps:`
  config-cache with publish/rollback/delete invalidation). No default-doc stand-in, no post-commit
  composition reflow.
- The commit-critical card set — Current Work, Household, Children, Readiness — is derived from a
  **declared registry** (`focusPanelCommitCriticalCards.ts`) over the answer's `OperationalContext`,
  with no new DB read. Reserved cells show card identity, never blank rectangles.
- **The committed Current Work card is summary-level.** Status, progress, requirements readiness, the
  primary action, and "Open workspace →". Workspace-level, settlement-derived affordances (more actions,
  other transitions, recent activity) live in the drill-in **workspace** (`CurrentWorkWorkspace`,
  `presentation="workspace"`).
- **Settlement enriches the summary; the workspace owns detailed interaction.** The drawer VM fills
  reserved geometry and deeper detail in place — it never rebuilds the summary.

---

## 5. Runtime Consumer Doctrine

A **Runtime Consumer** prepares, commits, and settles. The operator must never experience:

```
click  →  loading page  →  render
```

Instead:

```
destination  →  prepared  →  commit  →  settlement
```

**Operationally:** a Runtime Consumer warms the exact entries it will read at *intent* (nav hover/focus,
idle), serves them **warm-first** (paint from cache, revalidate in the background), and dedupes
concurrent reads to one request per scope. The shared mechanism is `createWarmCache`
(`lib/runtime/warmCache.ts`): a scope-keyed cache + single in-flight request + stale-while-revalidate +
snapshot/subscribe + `warm({force})`.

Consumers today: the Work Unit surface (full kernel consumer), the Focus Panel Activity cockpit, and the
four operational workspaces (Processing, Work Items, Operational Intelligence, Inbox/Communications) at
the warm-first data lifecycle. See §7 for what remains deferred to V2.

---

## 6. Extension points (build products here, not in Runtime)

To build a new operational product on Runtime V1 **without reopening Runtime architecture**:

- **Publish composition.** Author the surface's cards/order/placement/visibility in Settings → Surfaces
  (`entity_layouts`); the runtime honors it via `resolveSurfaceVariant`. Re-composing the **existing**
  card types is zero-engineering (live-proven).
- **Add commit-critical data** by extending the provisioning answer's projection + the commit-critical
  card registry (`focusPanelCommitCriticalCards.ts`) — never by adding a card-level fetch.
- **Add a warm-first surface** by giving it a `createWarmCache` and warming it on nav intent — the
  Runtime Consumer pattern, proven across four workspaces.
- **Add actions** through `action_placements` / `action_definitions`, resolved by
  `resolveActionsForContext` — never a hard-coded menu.

---

## 7. What Runtime V1 intentionally does NOT solve (deferred to V2, not defects)

- **Brand-new card *types*.** Re-composing existing archetypes is honored today; a genuinely new card
  key needs code (three closed sets — the key allowlist, the per-key model producer, the closed type
  union). The scoped fix is in the Scalability Certification.
- **Archetype-driven rendering of new archetypes.** The doctrine's Communication/Documents/Workspace/
  Intelligence archetypes have no generic body yet; existing archetypes render config-driven.
- **Operational workspaces as full K1→K2→K3 commit consumers.** Processing/Work Items/OI/Inbox share
  the warm-first *data* lifecycle but remain `openWorkspaceModal` modals, not committed destinations.
- **Inbox to literal zero-fetch reopen.** Content paints warm; ~18–25 comms datasets still revalidate.
- **Three bespoke warm caches** (`oipWorkspaceWarmCache` fuzzy site-key fallback,
  `communicationsWorkspaceWarmCache` multi-dataset orchestrator, `drawerFamilyWorkspacePrefetchCache`
  prefix-invalidation) are legitimately different shapes and were deliberately **not** forced onto
  `createWarmCache`.

These are **intentional deferrals with documented plans**, not gaps in the frozen architecture.

---

## 8. Where future product work will pressure-test Runtime (→ V2 signals)

Do not build these now; expect them to expose the V2 boundary naturally:

- **Scheduling / Attendance** — high-frequency, time-windowed destinations will pressure-test warm-cache
  staleness windows and the "different Row Grain per lens" constraint (already surfaced as the
  Active-Pipeline grain-ambiguous config error).
- **Commercial / Programs** — non-enrollment business processes will pressure-test the claim that
  Runtime contains no product-specific behavior (the archetype/registry generalization).
- **Director / cross-org** — multi-scope attention will pressure-test destination identity and the
  pill-vs-tile host-identity product question.
- **Any product introducing a NEW card type** — will be the first real exercise of the new-card-type
  gap (§7), and the natural trigger to open Runtime V2's archetype-driven renderer.

---

## 9. What is frozen

The lifecycle (§1), the ownership boundary (§3), the Focus Panel model (§4), the consumer doctrine (§5),
and the kernel (K1–K3) are **frozen**. They are extended, never reopened. A change that adds a second
owner, a second lifecycle, or product-specific behavior into Runtime is unconstitutional.
