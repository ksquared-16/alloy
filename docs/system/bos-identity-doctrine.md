# BOS Identity Doctrine

**BOS Identity Status:** FROZEN  
**Version:** 1.0  
**Last Updated:** June 2026

Future work may adopt BOS primitives.  
Future work may not redesign BOS identity without explicit doctrine revision.

**Scope:** Visual identity only — motion, mark, and composition. BOS capability semantics remain in **`docs/product/bos-foundation.md`**.

---

## Final identity rules

| Rule | Detail |
|------|--------|
| **Alloy mark** | Official geometry from `public/brand/alloy-brandmark-blue.svg`. Single-color Bend Pine (`#00A283`). Never spin, pulse, or animate the mark itself. |
| **BOS lockup** | Alloy mark + primary horizon + secondary wave (`BosMark` with `horizon`). Canonical identity unit for headers, notifications, and secondary CTAs. |
| **Smoke** | Soft cloud of possibility — complexity condensing into clarity. Not streams, lanes, pipelines, particles, or magic. |
| **Working reveal** | `BosRevealSequence` `mode="working"` — cloud condenses into mark while BOS analyzes, drafts, parses, or reviews. |
| **Workspace reveal** | `BosRevealSequence` `mode="workspace"` — center clears; atmospheric perimeter emerges; full BOS shell appears. |
| **Complete** | Smoke fades; mark / header / workspace remains. |

Import from:

```ts
import {
  BosMark,
  BosHorizon,
  BosSmoke,
  BosRevealSequence,
  BosWorkingState,
  BosButton,
  BosHeader,
  BosNotification,
  BosWorkspaceShell,
} from "@/app/adminV2/components/bos/identity";
```

Gallery: `/dev/bos-identity-system`

---

## Approved use cases

| Primitive | Use when |
|-----------|----------|
| **BosMark** | BOS entry icon in CTAs, compact inline anchors. Primary CTAs: white mark only (no horizon). Secondary/outline: mark + horizon lockup. |
| **BosHeader** | BOS territory title blocks (Action Workspace header, Forms review assist, Command Center rail, modals). |
| **BosButton** | “Work with BOS”, “Analyze with BOS”, “BOS Assist” — prefer over custom juniper buttons. |
| **BosNotification** | Insight-ready BOS cards with optional action link. |
| **AlloyIdentityLoader** | **Canonical loading** — crisp Alloy mark above horizon, Bend Pine smoke behind mark, secondary message. Drawers, routes, execution, transitions. |
| **BosWorkingState** | Static gallery/docs only when `state` prop is set (delegates to `AlloyIdentityLoader`). Live thinking: `BosRevealSequence` `mode="working"`. |
| **BosRevealSequence** | Live analyze/generate/review (working) or BOS workspace/modal open (workspace). |
| **BosWorkspaceShell** | Full BOS modal/workspace surfaces with atmospheric perimeter. |
| **ActionWorkspaceBosShell** | Create Lead operational intake — locked stadium shell. See **`docs/system/bos-operational-intake-shell-doctrine.md`**. |
| **BosExecutionLoader** | Phased execution narrative beside **`AlloyIdentityLoader`** — Create Lead execute, drawer prep, route load. |
| **BosRailActionIcon** | Operational icons on BOS rail recommendation rows — not `BosMark`. See **`docs/system/bos-rail-action-icon-doctrine.md`**. |

---

## Rejected motifs

Do **not** introduce or restore:

- Genie lamp (`BosGenieLampIcon` — deprecated wrapper only)
- Star, sparkle, magic wand, “AI” generic icons
- Spinning or pulsing Alloy mark
- Green blur blobs, glow ellipses, or neural-graph placeholders as loaders
- Dark rounded-square logo badges / boxed mark containers
- Stream/lane/pipeline smoke motion
- Competing parallel BOS visual systems

---

## Reveal placement

### `mode="working"` — use for

Analyzing, drafting, generating, parsing, reviewing, synthesizing — while real async work runs:

- Action Workspace paste analyze
- Action Intake paste parse
- Forms review summary loading
- Communication draft generation (when a dedicated thinking surface exists)

Pass `active={isLoading}` so motion loops during work. Do not add artificial delay on completion.

### `mode="workspace"` — use for

Opening a full BOS workspace or modal:

- Action Workspace BOS shell (overlay presentation)
- Composer BOS enhance modal

Embedded presentations may skip reveal when layout regression risk exists.

### Do **not** use reveal for

- Regular navigation
- Drawer open / route loading (`AdminV2RouteLoadingState`, `AdminV2DrawerLoadingState`)
- Button busy / sending states
- Fake login or cold-start splash without real preparation work

---

## Component usage guide

```tsx
// Secondary BOS CTA
<BosButton variant="secondary" size="sm" label="BOS Assist" onClick={…} />

// Primary BOS action
<BosButton variant="primary" label="Analyze with BOS" disabled={…} onClick={…} />

// Live thinking (prefer over BosWorkingState without state prop)
<BosRevealSequence mode="working" message="Analyzing…" active={loading} />

// Workspace open
<BosRevealSequence mode="workspace" autoPlay fill onComplete={() => setRevealed(true)} />

// Territory header
<BosHeader title="BOS Assist" subtitle="…" size="md" onDark={inMidnightHeader} />

// Full modal shell
<BosWorkspaceShell title="BOS Assist" subtitle="…">{children}</BosWorkspaceShell>

// Drawer / route / execution loading (one canonical loader)
<AlloyIdentityLoader message="Preparing Lead…" />
```

---

## Canonical loader

**One loader composition** for drawer open, route transitions, execution, and shell prep:

1. **Alloy mark** — crisp, 100% opacity, official geometry  
2. **Horizon** — thin canonical line beneath the mark (mark sits slightly above)  
3. **BosSmoke** — Bend Pine, very soft, behind the mark, rising from the horizon  
4. **Message** — secondary (`Preparing Lead…`, `Opening Lead…`, etc.)

Do **not** use blur blobs, radial glow ellipses, neural graphs, spinners, or skeleton placeholders for these surfaces. `BosExecutionLoader` pairs phased copy beside the same identity stack — it does not introduce a second visual language.

Full inventory and migration order: **`docs/system/alloy-loader-inventory-audit.md`**.


---

## Execution loading vs identity

| System | Purpose |
|--------|---------|
| **BOS Identity** (smoke, reveal, mark) | Emotional “BOS is thinking / emerging” |
| **BosExecutionLoader** | Operational execution steps (Create Lead, Schedule Tour, drawer prep) |

Do not merge these systems.

---

## Change policy

1. **Identity frozen** — no redesign sprints unless product explicitly reopens identity.
2. **Adoption sprints** — wire real workflows to existing primitives; fix regressions only.
3. **New surfaces** — audit against this doc before shipping; extend adoption tests in `web/tests/bos/`.
4. **Docs** — behavior changes to *where* identity is applied update **`docs/sprints/06_2026/bos_adoption_sprint01_surface_audit.md`** (or successor adoption audit).

---

## Related docs

- **`docs/product/bos-foundation.md`** — BOS capabilities, orchestrator, proposals
- **`docs/sprints/06_2026/bos_identity_reveal_system.md`** — reveal implementation notes
- **`docs/sprints/06_2026/bos_adoption_sprint01_surface_audit.md`** — surface audit (Adoption Sprint 01)
