# Phase F — Certification note

## Automated validation
| Check | Result |
|-------|--------|
| Focused Vitest (compact publish, Work Unit header, overview layout, builder library) | **22/22 pass** |
| `npm run typecheck` (`tsconfig.build.json`) | **pass** |
| `npm run build` | **pass** |
| Playwright chromium install | completed in agent cache |
| Authenticated browser QA / viewport screenshots | **blocked** — slot4 `storage-state.json` redirects to `/login` (session expired). Toolkit does not store passwords; needs manual re-auth then re-run capture. |

## Evidence dirs
`/.alloy-agent-evidence/operational-surface-realization/{before,after,phase-a,phase-b,phase-c,phase-e}/`

Authenticated after-shots not written (auth expired).

## Recommendation
**HOLD** — code + unit/typecheck/build certified; live browser acceptance still required after re-auth.
