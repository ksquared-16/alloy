% Communications UI-3 — Fixture render: run & screenshot
% Patch: communications-v2-ui3-fixture-render.bundle · 2 files · UI only · no backend

# UI-3 — Make the live component match the target (no DB)

**Why this exists:** the structure was already in the code, but it only rendered when the
conversations API returned data. With the API 500ing / empty, the component fell into the
empty path and looked like a generic inbox. UI-3 makes the **real component** render the full
target from in-code fixtures, so UX is proven independent of the backend.

**Base:** UI-2 `23ec4d0` → **UI-3 `d6a69e3`**. Changed: `CommandCenterShell.tsx` + new
`fixtures.ts`. No schema/route/provider/seed/migration/BOS.

## Import
```
git fetch /path/to/communications-v2-ui3-fixture-render.bundle \
  refs/heads/communications-v2-reroot:refs/heads/comms-ui3
git checkout comms-ui3      # HEAD d6a69e3
```

## Run with fixtures (no DB, no seed)
In `web/.env.local`:
```
NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1
NEXT_PUBLIC_COMMS_V2_FIXTURES=1
```
Then `npm run dev`, open the Communications (Inbox) modal. It renders fully, no backend:

- **Queue** = family cards grouped by operational state — *The Rivera Family · Elena & Mateo · Preschool*, SLA chip, health dot, stage, owner, unread — i.e. family records, not bare categories.
- A family is **auto-selected**, so the workspace shows immediately (no "select a conversation" empty panel).
- **Workspace** top→bottom: Family Snapshot (children · program · location · stage · owner) → Communication Health (Healthy / At risk / Unresponsive + engagement/response/SLA) → Consent (Email/SMS/Marketing ✓/✗/—) → unified Timeline → **dominant Composer** (Email/SMS/Note, To + consent, subject, large body, Send now / Send later / BOS Enhance).
- BOS rail unchanged beside it; queue ≈28% / workspace ≈72% geometry preserved.

**Capture the screenshot here** — this is the real component, not a proxy. The composer is review-first/visual only (buttons inert, no send path), since this milestone is about UX, not wiring.

## Turn fixtures off
Remove `NEXT_PUBLIC_COMMS_V2_FIXTURES` (or set `=0`): the component reverts to fetching real data exactly as before — fixtures never touch production behavior.

## Note
I can't run your Next app from my sandbox (arch-mismatched node_modules + blocked registry), so I can't produce the screenshot myself. The fixtures make it a one-step capture on your machine. Once you've got the real screenshot and it matches, we lock the visual and (separately) wire the composer + real data behind their own flags.
