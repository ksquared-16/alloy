# Assignment Phase 2 — Gender Save browser cert

**Date:** 2026-07-26  
**Worktree / port:** `wt5-assignment-platform-phase-2` / `3015`  
**Path:** New Leads → North Campus → Wenc Family → Children → Blake Wenc → Gender

## Result: PASS

| Check | Result |
|-------|--------|
| Gender select enabled with Male / Female / Not Specified | Pass |
| Save PATCH `/api/admin/customer-members/:id` `{ gender: "male" }` | Pass (200) |
| UI shows **Male** after save (no remount flash to `—`) | Pass |
| Cold reload still shows **Male** (raw inquiry profile hydration) | Pass |
| Re-open editor selects Male | Pass |

## Root cause (two layers)

1. **Options stuck disabled** (earlier): `useOptionSetSelectOptions` left `loading=true` on cancel; Identity select was `disabled={busy \|\| choiceOptionsLoading}`. Fixed previously — disable only while save `busy`; AlloySelect for gender.
2. **Save persisted but UI stayed `—`**: `buildChildrenCardEvidence` read `gender` from mapped drawer rows (which strip profile fields). Fixed to read raw `_inquiry_children` via `personDrawerGenderDisplayLabel` / `resolveInquiryChildGenderLabelFromRaw`. `saveInquiryChild` merge now uses `getTruth?.() ?? truth`.

## Screenshots

- `gender-03-blake-male-after-reload.png`
- `gender-04-save-persisted-male.png`

## Tests

```bash
cd web && npm run test -- \
  tests/adminV2/runtime/childrenCardEvidence.test.ts \
  tests/adminV2/runtime/identitySurfaceSaveRefresh.test.ts
```
