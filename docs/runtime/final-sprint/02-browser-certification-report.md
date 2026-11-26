---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Browser Certification
---

# Browser Certification Report — Final Sprint

Authenticated in-app browser (signed in as Kelly Kurzman, Firefly Early Learning) against the live dev
server at `http://localhost:3013`. All findings are **measured**, not reasoned. Instrumentation:
`window.__alloyPerf.marks` (`focus_panel_chain_*`, `perceived_*`) and `window.__focusPanelLayoutSource`.

## Certified PASS

| Scenario | Method | Result |
|---|---|---|
| **Cold Work View entry** (Workspace → New Leads) | click Work View link, read chain marks | Committed panel = published Summary composition; `docSource=published-doc`; order `[current_work, household, billing_preview, children]`. Model available +50ms after commit; commit-critical cards ready +50ms. |
| **Focus Panel = published Summary, not detail** | inspect `data-inline-focus-panel-mode`, card DOM | `mode=summary`; Current Work is a summary (362px), no More actions / Other transitions / recent activity. |
| **Subject switch** (Wenc → Kurzman) | click queue row, compare geometry | Subject changed; composition stable (`published-doc`, same order); **0px** focus-panel geometry shift; no remount. |
| **Work View switch — valid lens** (New Leads → Registration) | plant DOM-node probe + MutationObserver, click pill | Shell DOM node **identical** (no remount); **no** boot-shell flash; pills persist; in-place re-commit (commitVersion 1→2); no page reload (window probe survived). |
| **Work View switch — round trip** (New Leads ↔ Active Pipeline) | same | Shell node identical across the switch; no flash. |
| **Work→Activity switch** | fetch probe + node identity | Focus-panel node **identical** (no remount); switches immediately. |
| **Purification did not regress the summary** | clean dev-server restart + re-render | Summary renders correctly post-purification; no dead-affordance strings; `layoutSrc=published-doc`. |

## Certified FINDINGS (not clean)

| Finding | Evidence | Nature |
|---|---|---|
| **Active Pipeline lens is grain-ambiguous** | Committing that lens renders an honest error: *"Work View 'Active Pipeline': lens spans 2 Row Grains (family, child) — a surface cannot be grain-ambiguous."* | **Config error**, not a runtime bug — the runtime correctly refuses a misconfigured lens (never blank). Product owns this config. |
| **An error terminal drops the Work View pill strip** | On the Active Pipeline error terminal, `[role=tab]` count went to 0 → operator cannot pill-switch away from a bad lens. | Pre-existing (independent of the C hold-fix). The error surface should retain the pills so the operator can navigate off a misconfigured lens. Runtime hardening item. |
| **Work→Activity issues one component-local fetch** | `/api/admin/communications/family-workspace?...composer_channel=email` fires on the switch. | Activity is a mount+fetch cockpit (seeded + prewarmed), not a runtime commit. Doctrine D wants "no network on a prepared subject." |
| **Processing / Work Items / Analytics are mount+fetch modals** | 5 / 8 / 5 fetches on open respectively; open as overlays with no attention/provisioning/commit. | Task E — not runtime consumers. |
| **Cold full-page settlement is slow** | On a direct-URL cold load, settlement landed +9152ms after commit (vs +137ms on warm in-app nav). | The operational summary is immediate (+38ms); only the deeper settlement (children/billing detail) is slow on a truly cold drawer-VM fetch. Worth profiling but not a summary blocker. |

## Not yet certified (blocked/out of scope this session)

- **Adjacent-subject prewarm hit rate** — not isolated (would need cache-state probing the sprint
  scoped out per prior direction).
- **Activity / Communications / Processing / Work Items / OI as runtime consumers** — cannot be
  "runtime-certified" because they are not runtime consumers yet (see Consumer Completion + Freeze).
- **Communications interaction model end-to-end** (send a real message) — the composer is present and
  in-place; a full send was not exercised (would create an outbound message on the org).

## How to reproduce

```js
// after entering a Work Unit, in the browser console:
window.__focusPanelLayoutSource            // { docSource, order, ... } — should be "published-doc"
window.__alloyPerf.marks                   // focus_panel_chain_commit / _model / _card_* / _settlement
```
Chain marks are relative to `focus_panel_chain_commit`; `[perf:work-unit] focus_panel_chain:*` also
logs to the console (dev/staging gated).
