# Schedule certification

**Status:** Implemented and acceptance-tested for Section Certification #6.

## Alloy translation

- Schedule uses the canonical child-object master/detail grammar.
- The collection lists recurring patterns with Active/Inactive state and weekday summary; the selected pattern owns the detail workspace.
- View mode explains assignment availability and shows the recurring weekdays without exposing fields as a form.
- Edit mode replaces the view and contains name, weekdays, and active state.
- Add Schedule Pattern is available from both the shell Actions rail and collection header; both open the same creation editor.
- Selected weekday chips use Bend Pine; unselected chips remain neutral. No repeated weekday sentence appears beneath the chips.
- Closures and exceptions remain a separate region. Add Closure is disabled with the explicit reason that no authoritative date-specific provider exists.

## Persistence matrix

- Create pattern: response PASS; local list PASS; routed selection PASS; hard refresh PASS.
- Pattern name: PATCH response PASS; local detail PASS; hard refresh PASS.
- Weekdays: array response PASS; chip selection PASS; list summary PASS; hard refresh PASS.
- Active state: boolean response PASS for both false and true; local status PASS; hard refresh PASS.
- Existing-pattern edit: authoritative PATCH response PASS; read surface PASS; hard refresh PASS.
- Acceptance records were deleted after verification.

## Evidence

- `screenshots/schedule-list-detail.png`
- `screenshots/schedule-create-pattern.png`
- `screenshots/schedule-edit.png`
- `screenshots/schedule-weekday-selected-state.png`
