---
owner: platform
status: active-sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Adaptive Workspace — Corrective Pass Plan

> Continuation of slot **3** · `wt3-adaptive-workspace-presentation` · `agent/cursor/3-adaptive-workspace-presentation`  
> **Not a new sprint.** Nothing pushed or merged.

## 0. Sprint state (recorded before edits)

| Field | Value |
|-------|-------|
| Slot | 3 (cursor) · port **3013** · server running |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt3-adaptive-workspace-presentation` |
| Branch | `agent/cursor/3-adaptive-workspace-presentation` |
| HEAD | `1bfe7d1de` (= origin/staging tip) |
| First-pass commits | **None yet** — first pass is uncommitted dirty tree |
| Ahead/behind | 0 / 0 |
| Working tree | **dirty** (first-pass adaptive files + docs) |
| Tests already done | adaptive unit **5/5**; typecheck **exit 0** |
| Browser evidence of remaining failures | Operator screenshots (queue stacked above Focus; BOS large fixed floating overlay) — initiating this pass |

## 1. First-pass failure diagnosis

| Symptom | Root cause |
|---------|------------|
| Queue full-width above Focus Panel | `FocusPanelSurface` uses `flex-col` → `xl:flex-row` (**1280px viewport**). CSS `@media (max-width: 1279px)` forces `[data-adaptive-queue-column] { width:100% }`. Ambient Compact/Constrained never keeps a side-by-side rail. |
| BOS large floating overlay, incomplete control | First pass only: Expanded = pinned 345px; Compact/Constrained = fixed off-canvas + FAB. Overlay still `position:fixed` via `CommandRailBosMount` + `measureBosRailOverlayAnchorStyle`. No docked/compact/floating/hidden operator model, no resize, no preference. |
| “Switched active record …” chat spam | `AICommandSurfaceShell` appends `assistant_notice` + `noticeRole: "context_boundary"`; `CommandSurfaceThread` renders as bubble. Header chips already exist (`BosRailHeader` / `parseBosRailContextChips`) but chat still shows the notice. |

## 2. Corrective contract (this pass)

### Adaptive Workspace Region Contract (minimal)

Roles: **selection** · **primary** · **supporting** · **assistant**.  
Priority: preserve primary → condense selection → collapse supporting → adapt assistant (preference + canvas).

### BOS presentation states

`docked` | `compact-docked` | `floating` | `hidden`

- Canvas recommends initial state; **operator preference wins**.
- Temporary constraint may force floating/hidden **without overwriting** stored preference; restore when width returns.
- Docked states reserve width via `--ws-rail` and reflow ambient primary; floating does not reserve.
- Horizontal resize required for docked; floating move required; floating resize secondary.
- Persist preference + width via sidebar-style durable session keys.

### Work Unit

- Side-by-side `[selection rail | Focus primary]` through common laptop widths (do **not** use xl/1280 stacking).
- Two-pane floor → temporary slide-over selection; Focus stays main; clear show-records affordance.
- BOS independent of queue layout.

### Context chrome

- Suppress `context_boundary` from **visible** thread render (keep append/persist optional; prefer suppress-at-render).
- Enrich quiet context pills from canonical runtime context (BP / Work View / Subject).

### Modules

Same region laws for Communications, Processing, Work Items shells — no internal OS redesign. Activity empty/reading/composing retained under all BOS states.

## 3. Implementation sequence

1. Region + BOS preference/derivation helpers + durable prefs.
2. BOS presentation controller wired into shell / command rail (docked widths, resize handle, floating panel, hidden + trigger).
3. FocusPanelSurface: side-by-side until two-pane floor; temporary queue selector.
4. Suppress context_boundary in CommandSurfaceThread; enrich BosRailHeader pills.
5. CSS: remove 1279px queue stack override; docked rail width from CSS var; floating panel styles.
6. Module shell data-attrs for region roles where cheap.
7. Tests + typecheck; browser matrix when capacity allows.
8. Doctrine updates (navigation + AI/BOS owner + communications confirm).

## 4. Width hypotheses (validate in browser)

| Token | Range |
|-------|-------|
| Compact docked | 280–340px (default ~300) |
| Standard docked | 360–460px (default ~400) |
| Docked max | ~560px |
| Two-pane floor (primary after assistant reserve) | ~700px (queue ≥256 + focus ≥420 + gap) |

## 6. Corrective pass status

| Item | Status |
|------|--------|
| Sprint state recorded | Done — first pass was **uncommitted** dirty tree |
| Corrective plan | `corrective-pass-plan.md` |
| BOS presentation controller | Done — docked / compact-docked / floating / hidden + resize + prefs |
| Work Unit side-by-side + temporary selector | Done — floor 700px; removed xl stack |
| Context-boundary chat suppress + pills | Done |
| Doctrine | navigation + ai-platform updated |
| Adaptive unit tests | **11/11** pass |
| Typecheck | **exit 0** |
| Browser certification matrix | Pending operator refresh at http://localhost:3013 |
| Local commits | Still uncommitted (nothing pushed) |

---

*Corrective realization landed; browser evidence required before closeout.*
