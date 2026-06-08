# Child Drawer VM — staging validation checklist

Enable **`NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM=true`** before Vercel build (child chrome opens only).

## Open paths to verify

- [ ] View Person from inquiry children section (`opportunity_inquiry_child`)
- [ ] Child open with enrollment mirror seed from inquiry row

## Success criteria

- [ ] Single `GET /api/admin/v2/view-models/drawer/child/:id` on cold open
- [ ] Child summary, household, medical, BOS panel paint without composed-refetch loop
- [ ] `_drawer_presentation_emphasis: child_lifecycle` on paint record
- [ ] No second-beat skeleton after VM apply

## Hard cutover failure

- [ ] Explicit error when VM cannot compose (not silent fallback to entity GET)
- [ ] `[drawer-vm-cutover:hard_cutover_failure]` with `entity_type: child`

## Regression (flag off)

- [ ] Legacy child open path unchanged
- [ ] Parent person opens unaffected unless `NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM` also enabled

## Pairing with Person VM flag

- Child opens use **Child flag only** (detected via `isChildDrawerVmOpen`).
- Parent opens use **Person flag only**.
- Do not enable both flags until each path is validated independently.
