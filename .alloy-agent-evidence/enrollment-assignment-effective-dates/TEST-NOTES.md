# Enrollment Assignment & Effective Dates — Evidence Index

## Environment

| Field | Value |
|-------|-------|
| Staging base (active) | `86c34f13ae5b8f10298a359c992efe9ab5fee701` |
| Branch | `agent/cursor/3-enrollment-assignment-effective-dates` |
| Slot / port | 3 / 3013 |
| Seeded record | Kurzman Family `df771481-841f-4329-b7bb-c0a03d9fb621` (Lennon + Wrigley) |
| Auth | `qa-slot3-performance@example.com` → slot3 storage state |

## Configuration unblock (Classification **A**)

| Item | Value |
|------|-------|
| Root cause | Firefly published Enrollment Focus Panel Summary **v128** parked `scheduling` (Assignments) as **Linked** and omitted it from grid areas; published LayoutDoc correctly overrode code defaults |
| Repair path | Canonical duplicate → draft → PATCH → publish (admin entity-layouts API) |
| Before | published v128, `scheduling.visibility=linked`, not in areas |
| After | published **v129** `a7ec300e-cbe2-451d-b4fe-c7e47e3f2afc`, `scheduling.visibility=visible`, in areas |
| Product code | Unchanged for unblock (no Firefly-only hardcode) |
| Preset | Canonical enrollment defaults already include Assignments **visible** |
| Evidence | `config/ROOT-CAUSE.md`, `config/00-published-before.json` … `04-runtime-resolve-after.json` |

## Automated certification

| Suite | Result |
|-------|--------|
| `tests/enrollment/*` + household Make primary | **53 passed** |
| Focus Panel default/visibility composition tests | **14 passed** (scheduling visible in defaults) |
| `npm run typecheck` | **passed** (production/`tsconfig.build.json` graph includes `HouseholdCardVerify`) |
| Build fix `HouseholdCardVerify` stub | `c5ebbdaee` |
| Full `next build` on this host | **Not completed** — process exits during Turbopack compile under ~300MB free RAM; production type graph + stub verified instead |
| Staging-base `focusPanelMutation.saveInquiryChild` event-count | **FAIL (pre-existing)** — expects 1 dispatch, still double-fires on staging SHA |

## Browser certification matrix

Source: `browser/browser-matrix.json` — **20/20 pass** (0 fail).

| # | Scenario | Status |
|---|----------|--------|
| 1 | Open Enrollment record (≥1 child) | pass |
| 2 | Assignments five sections | pass |
| 3 | Requested days save | pass |
| 4 | Days persist after reload | pass |
| 5 | Weekdays unknown independently | pass |
| 6 | Readiness gaps operator language | pass |
| 7–8 | Outcome attempt + server block | pass |
| 9 | Complete assignment info / readiness | pass |
| 10–12 | Quote snapshot + no ledger | pass |
| 13 | Assignment handoff exercised | pass |
| 14–16 | Requested Start vs Start Date authority | pass |
| 17–18 | Household primary → Kristi; prior linked | pass (API + UI primary flip; Focus Panel summary still omits secondary adult) |
| 19 | Multi-child isolation Lennon/Wrigley | pass |
| 20 | Tenant A/B config variants | pass (unit suite + live preflight) |

### Notable artifacts

| Artifact | Meaning |
|----------|---------|
| `browser/00-before-assignments-linked-omitted.png` | Before unblock — no Assignments card |
| `browser/05-after-publish-assignments-visible.png` / `10-matrix-*` | After v129 — Assignments visible |
| `browser/11-matrix-five-sections.png` | Five assignment sections |
| `browser/quote-generate.json` + `quote-immutability.json` | Durable quote; prior snapshot retained on regenerate |
| `browser/household-primary-api.json` | Kristi made primary; Kelly remains previous_primary |
| `browser/outcome-preflight-incomplete.json` | Server preflight blockers |

## Harness

- Spec: `web/playwright/tests/enrollment-assignment-effective-dates-evidence.spec.ts`
- Hardened for cold Focus Panel paint + disambiguated work-unit search locator

## Repeatability for other tenants

Surfaces → Enrollment Focus Panel Summary → set Assignments (`scheduling`) **Visible** → place in grid (preferred after Household) → Validate → Publish. Do not force via runtime when a published LayoutDoc exists.
