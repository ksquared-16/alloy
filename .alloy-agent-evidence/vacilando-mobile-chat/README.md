# Vacilando mobile UI acceptance — live :3020, real lane data

Captured with Playwright against the running Gateway (iPhone 14 Pro viewport,
390×844) and a desktop pass at 1280×900. No fixtures. Metrics in
`acceptance.json` / `acceptance2.json`.

| # | Screenshot | What it proves |
|---|---|---|
| 01/08 | lane list | one canonical status + one summary per row; active → needs-input → idle → offline; no `[object Object]` |
| 02 | mobile chat default | header, one status line, thread, composer — nothing else on screen |
| 03 | user message collapsed | 6-line clamp (117px of a 1389px message) with **View more** |
| 04 | user message expanded | full 1389px with **View less** |
| 05 | details panel open | the single right-side panel: runtime, Claude status, capacity, notifications, rename, output chrome |
| 06/10 | copy proof | 2153 characters copied against 1818 on screen — the complete response, not the visible snapshot |
| 07 | keyboard-open composer | composer above the keyboard, 16px (no iOS zoom), safe-area padding; chrome stands down so the reply stays visible |
| 09 | completed output | `scrollHeight === clientHeight` — the whole final response, unclipped |
| 11 | desktop two-column | stage 683px + panel 341px side by side; toggle and scrim hidden |

Capacity reconciliation is API evidence, not a screenshot: admissions
`eadm_97cb00a0aa6bab4f` (Lifecycle Cert, queued 2026-08-19) and
`eadm_dce1b888a9f5922a` (Processing, queued 2026-08-18) were CANCELLED through
`POST /api/lanes/:id/runtime/release`, and both lanes now report no admission.
Because the two stale lanes were reconciled, no stale lane remains to
photograph the Release-capacity control on; it is covered by
`development-gateway-mobile-chat.test.mjs`.
