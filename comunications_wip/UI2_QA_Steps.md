% Communications UI-2 — QA Steps (gate repo)
% Patch: communications-v2-ui2-family-workspace-hierarchy.bundle · 1 file changed · flag-gated

# UI-2 — Family Communication Workspace hierarchy: QA steps

**Base:** UI-1 commit `8db9d63` (on `c0307743`). **UI-2 commit:** `23ec4d0`.
**Scope:** workspace-pane internals only → Top (Family Snapshot + Communication Health + Consent Status) / Middle (Unified Timeline) / Bottom (Composer). Geometry, queue, BOS, routes, providers, schema unchanged.

## 1. Import

```
git fetch /path/to/communications-v2-ui2-family-workspace-hierarchy.bundle \
  refs/heads/communications-v2-reroot:refs/heads/comms-ui2
git checkout comms-ui2        # HEAD 23ec4d0, parent 8db9d63 (UI-1)
git log --oneline -2          # UI-2 then UI-1
```

Incremental on UI-1; only `web/app/adminV2/communications/CommandCenterShell.tsx` changes.

## 2. Sandbox-side checks (already run, reproducible)

```
node ui2_hierarchy_harness.mjs   # 12 assertions; exits 0 on PASS
```

Asserts: imports `computeCommunicationHealth` + reused `ComposerV2`; UI-1 grid token preserved; section order snapshot < timeline < composer; timeline/claim test-hooks preserved; **no new API route** (exactly the 3 existing endpoints).

## 3. Real gate checks (your machine)

```
cd web
npx tsc --noEmit                              # (pre-existing config/placement export errors are unrelated)
npx vitest run tests/communications            # comms + guardrail suites
npm run build
```

The change adds two existing-module imports and JSX only — no new types, routes, or data paths.

## 4. Browser QA (flags on)

`web/.env.local`:

```
NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1
NEXT_PUBLIC_COMMS_V2_COMPOSER=1     # required for the bottom Composer slot to render
```

`npm run dev`, open the Communications modal, select a conversation, verify the workspace pane (right column) now reads top-to-bottom:

1. **Family Snapshot** — family name + meta line (channel · location · owner · last contact); the Claim button is in the snapshot header.
2. **Communication Health** — status dot + label (Healthy / At risk / Unresponsive) with Engagement / Response / SLA. Values are computed from the loaded messages (e.g. response rate = inbound/outbound), so they reflect the selected conversation.
3. **Consent Status** — Email / SMS / Marketing chips, each showing a neutral "—" with the note "Per-channel consent loads with activation." (No fabricated ✓/✗ — consent data is a later activation item.)
4. **Unified Communication Timeline** — the middle, scrollable region; each entry tagged `channel · direction`. This is the largest band.
5. **Composer** — pinned at the bottom, the existing ComposerV2 (Email / SMS / Note, subject, body, preview/validation). No auto-send; Send is inert without a send context.

Also confirm:

6. **Geometry unchanged** — queue still ≈28% (≥320px floor), workspace ≈72%, BOS rail 345px beside, modal wide/no clipping.
7. **Order** — snapshot above timeline above composer; timeline scrolls independently while snapshot and composer stay pinned.

**Composer flag off** (`NEXT_PUBLIC_COMMS_V2_COMPOSER=0`): the bottom slot renders empty (ComposerV2 self-gates to null) — Top + Timeline still correct. **Command-center flag off**: legacy inbox panel, unchanged.

## 5. Not in UI-2 (later steps)

Queue row enrichment (operational-record fields), consent data wiring, workspace visual polish / exact height bands, announcements, drawer-tab reuse. UI-2 is the hierarchy swap using existing components/data only.

## 6. Sign-off → next

On green checks + browser 1–7, approve and I proceed to the next UI step (queue rows as operational records, or workspace visual refinement — your call).
