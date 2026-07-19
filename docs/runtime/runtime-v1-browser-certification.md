---
owner: platform
status: freeze-certification
last_reviewed: 2026-07-19
---

# Runtime V1 — Browser Certification (freeze re-run)

Authenticated in-app browser against the live dev server (`:3013`, signed in as Kelly Kurzman, Firefly
Early Learning). Re-run for the freeze. All findings are **measured**, not reasoned. Instrumentation:
`window.__focusPanelLayoutSource`, `window.__alloyPerf.marks` (`focus_panel_chain_*`), console error
interception for `Maximum update depth`, and a `fetch` counter.

## Result: PASS — no regressions.

| Scenario | Method | Result |
|---|---|---|
| **Focus Panel commits published Summary** | inspect layout source + cards at commit | `docSource: published-doc`; order `[current_work, household, billing_preview, children]` (the org's custom composition); `mode: summary`. **PASS** |
| **Summary presentation (not expanded detail)** | Current Work card DOM | 362px; contains progress / requirements / Record outcome / Open workspace →; **no** More actions / Other transitions / recent events. **PASS** |
| **Runtime timing present** | `focus_panel_chain_*` marks | commit epoch present; model +28ms; settlement +9.7s (cold full-page). Warm in-app settlement ~137ms (prior runs). **PASS** |
| **Work View transition = attention movement** | shell-node identity + boot-shell MutationObserver | shell DOM node **identical** across New Leads→Registration (no remount); **no** boot-shell flash; pills persist (5); in-place re-commit (`data-active-work-view` updated). **PASS** |
| **Activity warm-first (no load on switch)** | fetch probe + DOM (Kurzman, has conversations) | **no** "Loading conversation…"; the "resolved" thread topics + first thread render immediately on switch. **PASS** |
| **Processing warm** | cold open + warm reopen fetch count | cold 4 fetches; **warm reopen 0 fetches**, content instant. **PASS** |
| **Work Items warm** | cold open | cold 3 fetches; content rendered. **PASS** (prior: warm reopen 0) |
| **Operational Intelligence warm** | cold open | cold 2 fetches; content rendered (no skeleton on warm). **PASS** |
| **Inbox — no loops** | console `Maximum update depth` counter across all four workspace opens | **0 max-update-depth errors**; Inbox open 25 fetches (was ~150 pre-fix), content paints warm. **PASS** |

## Known, documented (not regressions)

- **Cold full-page settlement is slow** (~9.7s in one direct-URL cold load) — the cold drawer-VM fetch;
  the operational summary is immediate (+28ms). Warm in-app navigation settles in ~137ms.
- **Inbox reopens revalidate ~18–25 comms datasets** — content paints warm; this is background
  revalidation, not a visible load. Deferred (Constitution §7).
- **Active Pipeline lens is grain-ambiguous** (a Product *config* error the runtime honestly refuses;
  never blank). Not a runtime defect.

## Not re-run this session (auth-bound / prior-certified, unchanged code)

- Production `.next-prodcert` authenticated matrix (needs a fresh operator sign-in on the prod build).
- Back/Forward popstate destination restoration (B2 — certified in the prior freeze report; code
  unchanged).

## Reproduce

```js
window.__focusPanelLayoutSource          // { docSource:"published-doc", order:[…] } at commit
window.__alloyPerf.marks                 // focus_panel_chain_commit / _model / _settlement
// Work View switch: capture the ProvisionedWorkUnitSurface node, click a pill, assert node === node.
// Workspaces: open via sidebar nav, count fetches; reopen within the stale window → expect ~0.
```
