# UI-6.1 — Workspace implementation dedupe

**Commit:** `4662e8b` (UI-6) → `6a35502`. **Bundle:** `communications-v2-ui6.1-workspace-dedupe.bundle`.
One canonical workspace implementation now serves the full modal and the drawer tabs. No data/API/send/migration/BOS changes; no modal-shell geometry change; no drawer behavior change.

## Implementation

- **New `FamilyCommunicationWorkspaceView.tsx`** — the canonical workspace markup (conversation | composer two-column body: snapshot + chat timeline w/ UI-5H status + UI-5C recipient selector + UI-5E draft + UI-5G send review). It is **presentational** (all data + handlers via props) and was **ported verbatim** from the locked UI-4H modal workspace, so it is visually identical by construction.
- **`CommandCenterShell` (modal)** — keeps the **queue column** and all of its state/handlers (fixture + live), and renders `<FamilyCommunicationWorkspaceView … />` for column 2 instead of the inline markup. The now-unused helpers/icons were removed. UI-4H geometry (`25% / 72%` + `1fr / 1.35fr`) preserved; fixture mode and live-workspace mode both preserved (same data feeding the View).
- **`FamilyCommunicationWorkspace` (drawer)** — rewritten as a **thin container**: fetches the VM (by `customerId` or drawer entity) and renders the **same View**. So the drawer workspace equals the modal workspace by construction (workspace-only, no queue).

## Single source — verified

`data-cc-recipient-selector` (and the whole composer/timeline markup) now appears in **exactly one file** (the View): CommandCenterShell inline = 0, drawer container inline = 0, View = 1. Both modal and drawer render `<FamilyCommunicationWorkspaceView/>`.

**Confirmation:** future timeline and composer changes happen in **one place only** — `web/app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx`. The modal and the drawer automatically inherit them. The modal additionally owns the queue (in `CommandCenterShell`); the drawer owns its fetch container — neither contains workspace markup.

## Tests / verification

- No new pure logic (this is a structural extraction); the 5 existing Node harnesses still pass **66/66** (lib untouched). All `.ts` modules strip-check.
- The two `.tsx` (View + drawer container) and `CommandCenterShell.tsx` are JSX (not strip-checkable in-sandbox): brace/paren balance verified, no unused icons in the View, no dangling unused identifiers in CommandCenterShell, geometry token intact. Full type/JSX validation runs on the gate via `tsc`.
- Gate: `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/`.

## Manual QA (staging)

1. `tsc --noEmit` + `npm run test -- tests/communications/v2/` → green.
2. **Modal — fixture (default):** open Communications with `comms_v2_command_center=1` only → workspace renders identically to UI-4H (snapshot, chat with sender names, single "To" chip, composer). Queue present.
3. **Modal — live:** add `comms_v2_live_workspace=1` (+ a fixture `customerId`) → recipient selector, real timeline + status, send review — same as before UI-6.1.
4. **Drawer:** open an Opportunity/Child/Person drawer Communications tab (`comms_v2_record_tab=1` + `comms_v2_live_workspace=1`) → the **same** workspace pane (snapshot/timeline/composer), now visually matching the modal (sender names, status, selector).
5. **Parity check:** modal column-2 and the drawer tab are pixel-equivalent (same component).
6. **Edit-once proof:** change a class in `FamilyCommunicationWorkspaceView.tsx` → both modal and drawer reflect it.

## Blockers / notes

- The modal's **fixture** path still feeds the View via `CommandCenterShell` state (FixtureFamilyDetail → `detail`, fixture messages → `messages`). The View is source-agnostic; when fixtures are retired, only the modal's data assembly changes — the View stays.
- The drawer maps the VM `consentSummary.displayFlags` (booleans) to the snapshot's E/S/M marks as opted-in/out (tri-state "—" not represented there); cosmetic, matches available data.
- Drawer assignment/Claim is inert (`onClaim` no-op) — the drawer is family-scoped, not conversation-assignment scoped (the Claim affordance is a modal/queue concern).
- Carryover (unchanged): receipts/open tracking still needs provider webhook ingestion (UI-5H); person→customer multi-household picks first; `jobs`/other drawer entity types resolve to "No conversation".
