# SESSION HANDOFF — Runtime & Experience (paste into next session)

**Branch:** `agent/claude/3-runtime-drawer-deletion` · **ahead 32 / behind 16** vs `origin/staging` ·
**tree clean, nothing pushed.** Full detail: `docs/handoffs/runtime-experience-implementation-handoff.md`.

## Where the project stands

The **Work Unit Configuration Runtime is complete and certified.** Every visible region (Header, Queue,
Focus Panel, Editing, Actions) is driven by published configuration through the single applicability
resolver **`resolveSurfaceVariant`**, with exactly one owner per responsibility and all legacy ownership
deleted. This is documented and audited in
`docs/platform/runtime/work-unit-configuration-runtime-constitution.md` (§5 final audit). Config consumption
is **browser-provable** (the queue emits `data-queue-row-source="published"` / `-surface-id` / `-variant`;
identity fields emit `data-identity-policy` / `-editable`).

Two experience wins landed on top:
- **Blank time removed.** Hover/focus intent prefetches the exact K2 provisioning answer → **warm commit
  ~150 ms**. Cold server compose **−47% (~2850→~1500 ms)** via three semantics-preserving parallelizations.
  **0 blank frames cold.**
- **Queue-row fidelity corrected.** A real field-by-field browser audit proved the row rendered a phantom
  `name·email·phone` composite; the wrong owner was the **server CRM enricher** (it baked the composite into
  `display_name`). Fixed → the row now renders exactly the authored fields ("Taryn Wenc · email", no phantom
  phone). The Settings builder also got a faithful **Live preview** + "Not in row" no-op warnings.

A large **architecture-only** design is approved and written (not implemented): **The Alloy Anticipatory
Operational Runtime** (`docs/platform/runtime/workspace-operational-preparation-runtime.md`). Core idea: the
**Workspace prepares operational destinations before click; the click commits one** — generalizing the
144 ms prefetch cache into a keyed, invalidated, prioritized Prepared-Destination store. It defines the
Operational Graph, `PreparedOperationalDestination`, commit-critical/Settlement contract, scheduler (P0–P5),
queue adjacency, Focus-mode continuity, the **queue selection state machine** (§6.1–6.4), the Metrics
Runtime, stale/invalid matrix, single loading owner, security/resource model, and a phased plan (A–M).

## What changed (headline commits)

`resolveSurfaceVariant` (P0) → Header/Queue/Focus-Panel/Editing/Actions cutover + legacy deletion (P1–P4) →
config-provenance to DOM (P2-V) → blank-time prefetch + cold-path parallelism (EXP-1) → builder + render
fidelity (EXP-2, Queue Failure 1) → two architecture docs. 32 commits, 61 files, +3459/−1151, **local only**.

## Two live bugs mapped but NOT fixed (root-cause complete)

1. **Workspace metric counts stale after deletion** (§10.1): one refresh event + membership gate; delete
   never dispatches it, `delete_child` is outside the allow-list, the 4 s totals cache is never busted.
   → **Phase J**.
2. **Duplicate midnight-blue loader on refresh** (§13): `app/adminV2/loading.tsx` renders the boot shell,
   then `AdminV2Shell.tsx:319` Suspense fallback (via `useSearchParams()`) re-paints the identical shell.
   → **Phases K/L**.

## What should happen next (recommended order)

1. **Phase G** — Queue selection state machine + atomic Runtime Focus commit (highest user value; §6.1–6.4).
2. **Phase J** — Metrics Runtime + targeted invalidation (fixes the deletion-count bug).
3. **Phases K/L** — single "Thinking…" loading owner + delete the duplicate shell.
4. **Phases A→B→C** — Operational Graph → Prepared Destination Store → retained Workspace.
5. **Phases D→E→H→I** — visible prep → Work-View adjacency (EXP-3) → queue adjacency → Focus-mode prep.
6. **Phase M** — certification + performance freeze on a **production build** (dev perf numbers are noisy).

## How to re-establish context quickly

1. Read this file → the full `runtime-experience-implementation-handoff.md` (*Current Truth* + *Remaining
   Mission*) → the two runtime docs.
2. **Rebase** `agent/claude/3-runtime-drawer-deletion` onto `origin/staging` (behind 16; expect conflicts in
   `workUnitProvisioningAnswer`, queue presentation files, Settings surface builders). Re-run `tsc --noEmit`
   + kept unit suites + the 7 `web/playwright/tests/*cert*.spec.ts` to confirm green.
3. Bring up the surface: `alloy-dev-start wt3-runtime-drawer-deletion` (slot 3, port 3013);
   `alloy-agent-status 3`.
4. **Do not push/merge** without explicit authorization; keep commits local. Follow the phase discipline
   (land → browser-certify → measure → delete legacy owner → next).

## Certified truths to rely on
- One resolver (`resolveSurfaceVariant`), one owner per region, legacy deleted, docs match reality.
- Prepared/warm commit ~150 ms; cold server −47%; 0 blank frames; 1 request / 0 dupes on the critical path.
- Queue row renders exactly the authored supported fields (no phantom values).
- 73 pre-existing `tests/adminV2/runtime` failures predate this session (not regressions).
