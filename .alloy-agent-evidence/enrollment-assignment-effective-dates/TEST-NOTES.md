# Enrollment Assignment & Effective Dates — evidence log

## Staging base

- SHA: `3195fae4a301e75cac43db934dcb163168e25674`
- Verified: worktree clean at bootstrap, `0/0` vs `origin/staging`

## Unit tests (this sprint)

```bash
cd web && npm run test -- \
  tests/enrollment/effectiveDateAuthority.test.ts \
  tests/enrollment/assignmentProposalReadiness.test.ts \
  tests/adminV2/runtime/householdCardMakePrimary.test.ts
```

Result: **18 passed**

## Baseline comparison

`tests/adminV2/runtime/focusPanelMutation.test.ts` → `saveInquiryChild` expects 1 record-patch event, observes 2.

- Reproduced on **exact staging base** with clean tree (stash) → **pre-existing**, not introduced by this sprint.
- Likely optimistic + confirm double-dispatch in `saveInquiryChild`.

## Next evidence needed

- Authenticated browser QA for Household Make primary + Assignment card sections
- Typecheck when machine-wide tsc slot free
- Outcome-execution path for Enrollment Date stamp (integration)
