# Enrollment Assignment & Effective Dates — Evidence Index

## Environment

| Field | Value |
|-------|-------|
| Staging base (active) | `86c34f13ae5b8f10298a359c992efe9ab5fee701` |
| Branch | `agent/cursor/3-enrollment-assignment-effective-dates` |
| Slot / port | 3 / 3013 |
| Seeded record | Kurzman Family `df771481-841f-4329-b7bb-c0a03d9fb621` |

## Automated certification

| Suite | Result |
|-------|--------|
| `tests/enrollment/*` + household Make primary | **53 passed** (post-rebase) |
| `npm run typecheck` | **passed** |
| Build fix `HouseholdCardVerify` stub | `c5ebbdaee` |
| Staging-base `focusPanelMutation.saveInquiryChild` event-count | **FAIL (pre-existing)** |

## Browser certification — before configuration unblock

| Artifact | Meaning |
|----------|---------|
| `browser/00-before-authenticated-work-unit.png` | Authenticated work-unit shell |
| `browser/00-before-assignments-linked-omitted.png` | Kurzman Focus Panel without Assignments card |
| `browser/focus-panel-dump.json` | Visible keys: current_work, children, household (± billing_preview); **no scheduling** |
| `browser/created-lead.json` | Kurzman opportunity / child ids |
| `browser/evidence-notes.json` | Machine-readable before-state |

**Blocker (accepted):** Firefly published Enrollment Focus Panel Summary parks Assignments (`scheduling`) as **Linked** and omits it from visible layout areas. Published LayoutDoc correctly overrides code defaults.

## Harness

- Spec: `web/playwright/tests/enrollment-assignment-effective-dates-evidence.spec.ts`
- Uses seeded Kurzman + subject deep-link; soft matrix recording for post-unblock certification.

## After configuration unblock (pending)

- Draft/publish evidence
- Runtime Assignments visible screenshots
- Full 20-point operator matrix
