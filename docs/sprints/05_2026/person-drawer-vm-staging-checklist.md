# Person Drawer VM — staging validation checklist

Enable **`NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM=true`** before Vercel build (parent/generic person chrome only).

## Open paths to verify

- [ ] View Person from opportunity primary contact (parent chrome)
- [ ] View Person from family contacts panel
- [ ] Generic person open (household panel raw open — generic surface)
- [ ] Person open with warm entity cache

## Success criteria

- [ ] Single `GET /api/admin/v2/view-models/drawer/person/:id` on cold open (no parallel full entity GET for first paint)
- [ ] No `personDrawerComposedPreparing` skeleton when VM `first_paint.settled`
- [ ] Header, summary, household sections paint together (no second beat)
- [ ] `[drawer-vm-cutover:drawer_apply]` or person VM load success in console (when logging enabled)

## Hard cutover failure

- [ ] With flag on, composed-not-ready / not-found shows explicit error (not silent legacy GET)
- [ ] `[drawer-vm-cutover:hard_cutover_failure]` logged with `entity_type: person`

## Regression (flag off)

- [ ] Legacy seed + entity GET + composed refetch unchanged
- [ ] Opportunity drawer VM unaffected

## Child drawer

Child chrome uses **`NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM`** — see `child-drawer-vm-staging-checklist.md`.
