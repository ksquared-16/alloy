% Communications UI-1 — QA Steps (gate repo)
% Patch: communications-v2-ui1-queue-workspace-split.bundle · 1 file changed · flag-gated

# UI-1 — Two-column drawer split: QA steps

**Baseline:** `communications-v2-reroot` @ `c0307743` (the tree re-rooted on staging 9d565f2 — the one in `comms-v2-current.bundle`, default HEAD).
**Patch commit:** `8db9d63` on top of `c0307743`.
**Scope:** queue ~28% / workspace ~72% + shell-geometry consumption. Nothing else.

## 1. Import the patch

From your gate repo (the one already at `communications-v2-reroot` = `c0307743`):

```
git fetch /path/to/communications-v2-ui1-queue-workspace-split.bundle \
  refs/heads/communications-v2-reroot:refs/heads/comms-ui1
git checkout comms-ui1            # HEAD should be 8db9d63, parent c0307743
git log --oneline -1             # feat(comms UI-1): two-column drawer split…
```

(The bundle is incremental — it fast-forwards `c0307743` → `8db9d63`. Only `web/app/adminV2/communications/CommandCenterShell.tsx` changes.)

## 2. Real gate checks (your machine — sandbox can't run these)

```
cd web
npx tsc --noEmit                                  # typecheck
npx vitest run tests/communications               # comms + guardrail contract suites
npx vitest run tests/adminV2 2>/dev/null || true  # (pre-existing baseline drift is unrelated)
npm run build                                      # Next build
```

Expected: typecheck clean, comms suites green, build passes. The change is a single Tailwind grid-template token, so no new type or import surface.

## 3. Layout-math harness (deterministic, no app needed)

```
node ui1_layout_harness.mjs    # prints split at 880 / 1040 / 1280 drawer widths; exits 0 on PASS
```

Confirms: at 1280 drawer → queue 354px (28%), workspace 902px (71.4%); 320px floor holds at narrow widths; workspace always dominates.

## 4. Browser QA (flag on)

In `web/.env.local`:

```
NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1
```

`npm run dev`, open the Communications modal (the inbox modal), and verify:

1. Modal opens at the **drawer-computed-width × max-h(min(920px,100%))** geometry — wide landscape, not square; no clipping.
2. **BOS rail sits beside** the modal at 345px, unchanged, not collapsed, not inside Communications content.
3. Two columns inside the modal: **Queue ≈ 28% (~354px at full width), Family Workspace ≈ 72% (~902px)** — workspace clearly dominant.
4. Queue never narrower than **320px** when you resize the window down; workspace stays the larger column.
5. Both columns scroll independently; the grid fills the modal height (no short floating card, no blank band).
6. Metrics strip (5 tiles) and filters row render above the split, unchanged.

**Flag-off regression:**

```
NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=0   # or unset
```

The legacy inbox panel renders exactly as before (CommandCenterShell not mounted).

## 5. What did NOT change (by design)

Queue row content, workspace internals (snapshot/timeline/composer restructure), composer, announcements, drawer-tab reuse, BOS, routes, providers, schema. Those are later UI steps. UI-1 is the column split + geometry only.

## 6. Sign-off → next

On green typecheck/tests/build + browser checks 1–6, approve and I proceed to the next UI step (queue rows as operational records, then the Family Workspace internal height bands). Screenshots from your run confirm the rendered result against the proxy.
