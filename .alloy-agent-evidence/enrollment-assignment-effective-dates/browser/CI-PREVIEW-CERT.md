# CI-preview certification — Assignment card model correction

**Approved by Kelly** as alternative to local port-3016 browser matrix (host-resource blocker).

## Scope

Certify the restored **one coherent Assignment offer** product model after reverting multi-entry cardinality over-correction (`387695dfa` / rebased tip includes equivalent revert).

## Product model (frozen)

- One coherent operational offer (site, program, room, schedule, start, tuition, estimate, quote, compact proposed/committed, contextual readiness)
- Family-request fields optional on Children — not Assignment sections
- No five-section report layout
- No multi-entry collection / interest rows
- Backend multi-assignment capability unchanged

## Why not localhost browser

See `HOST-RESOURCE-BLOCKER.md`. Next on 3016 could not remain stable through Playwright under concurrent heavy-next-dev load.

## Why not Playwright against Vercel preview URL

Firefly Preview for `62f3d279d` deployed successfully, but Deployment Protection redirects unauthenticated clients to **Vercel SSO** (`vercel.com/sso-api`). Slot storage-state cookies are localhost-scoped and cannot bypass SSO. No automation bypass token is available in this agent environment.

Preview URL (pre-sync deploy):  
`https://firefly-early-learning-ogak8ecsg-kellys-projects-2fc9d5eb.vercel.app`

Vercel status: Deployment has completed (Firefly). workwithalloy ignored-build canceled (expected).

## CI-preview gates executed

| Gate | Result |
|------|--------|
| Focused enrollment unit suites | **38/38 pass** (6 files) |
| `npm run typecheck` | **pass** |
| `npm run typecheck:tests` | **pass** |
| Vercel Firefly Preview deploy (branch commit) | **success** |
| Local Playwright on 3016 | waived (host blocker) |
| Authenticated Playwright on preview URL | waived (Vercel SSO) |

### Suites included

- `buildAssignmentCardModel` (offer model)
- `childrenEnrollmentFieldPlacement`
- `effectiveDateAuthority`
- `assignmentProposalReadiness`
- `assignmentServerPreflightVariants`
- `generateAssignmentQuote` (immutability / no-ledger)
- `operationalAssignmentService` (multi-assignment backend)

## Before / after visual evidence

| Artifact | Path |
|----------|------|
| Before (five-section) | `archive-before-five-section/04-assignment-five-sections.png` (+ related) |
| After (coherent offer) | Not captured in browser — waived under CI-preview approval; offer model covered by unit + VM tests |

## Staging sync

Branch rebased onto `origin/staging` via `alloy-worktree-sync` before promotion.
