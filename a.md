# Discovery — role editor simplification

Mission `msn_f6c69aa36ea0b747fd` v1 · context hash `7925190b4920d87d78a39ed7154312b9` · phase Discovery.

## Operator guidance of record

> Keep architecture; simplify role editor.

This note exists to make that instruction survive the handoff to implementation. The two halves
pull in opposite directions, so the useful discovery finding is not "the editor is big" — it is
**which parts of the editor are load-bearing architecture that a simplification must not touch**,
and where the remaining complexity actually sits.

## What "keep architecture" means concretely

The access architecture is not a convention; it is pinned by executable locks under
`web/tests/access/`. Four invariants, each verified against the current tree (`origin/staging @
c5d8acfcf`):

| Invariant | Where it is locked | Current state |
| --- | --- | --- |
| Exactly one component **edits** role permissions | `roleEditorSingleSurface.test.ts:76` — discovers every file calling `applyGridRowSelection` | 1 file: `AccessRolesConfigurationPage.tsx` ✅ |
| The permission projection is consumed only inside the Access chapter | same file, :81–88 — discovers readers of `buildPermissionGridRows` / `PermissionGridRow` | 2 files, both under `components/adminV2/settings/access/` ✅ |
| Three legacy authority surfaces are gone, but still resolve | `roleEditorSingleSurface.test.ts:91–113` | dirs absent; all three redirect to `/organization/access` in `next.config.ts:225,226,232` ✅ |
| Scope is a **sibling** of capability, never folded into the role object (`RL-53`) | `oneRoleEditorPage.test.ts` header | no `user_access_profiles` / `user_department_access` / `user_site_access` reference anywhere in the access chapter ✅ |

Two of these constrain *how* the editor may be simplified, and are easy to trip by accident:

- **The single-editor lock keys on the mutation, not the file.** `applyGridRowSelection` must keep
  being called from `AccessRolesConfigurationPage.tsx`. Extracting the grid mutation into a shared
  `useRoleGrant` hook — the most natural-looking refactor of a 929-line component — moves the call
  site and fails the lock, because the discovered editor list would no longer equal that one path.
- **The reader lock keys on the directory.** Any extracted subcomponent that touches a
  `PermissionGridRow` must stay under `components/adminV2/settings/access/`. Hoisting a grid
  presenter into a shared `components/ui/` location fails it.

The lock comments are explicit that this discrimination is deliberate: `OD-8` narrowed the test
from "imports the projection" to "calls the mutation" precisely so that *reading* grants (which the
Users chapter now does to explain effective access) is not convicted as a second editor. Reading is
not editing. A simplification should preserve that distinction rather than re-derive a second
catalog.

`RL-53` is the one boundary where a change would genuinely alter the architecture rather than
simplify it: merging scope into the role object. That is out of scope for this guidance.

## Where the complexity actually is

`web/components/adminV2/settings/access/AccessRolesConfigurationPage.tsx` — 929 lines, a single
component function holding ~20 `useState` calls. The size is not architectural; it is six
independent state machines sharing one scope:

| Cluster | State | Notes |
| --- | --- | --- |
| Role list / selection | `search`, `selectedRoleKey`, `visibleRoles`, `memberCountByRole` | pure derivation from `roles` + `members` |
| Role identity editing | `roleLabel`, `roleActive`, `editingIdentity`, `saving` | self-contained form |
| New-role creation | `newRoleOpen`, `newRoleLabel`, `newRoleBusy` | self-contained modal |
| Grant grid | `grantLoad`, `grantKeys`, `gridRows`, `matrix`, `heldAreas`, `openAreas`, `showAdvanced` | the only cluster touching the locks |
| Request status | `loading`, `error`, `message` | duplicated across every async path |
| History | `historyToken` | a reload counter |

Five of the six clusters have no relationship to the permission grid at all, and none of them are
named by any lock. That is the simplification surface: extract the list, identity form, creation
modal, status and history clusters into hooks or child components **kept inside
`components/adminV2/settings/access/`**, and leave the grant-grid cluster — including the
`applyGridRowSelection` call — in the page component. That satisfies "simplify" while every
invariant above still holds by construction.

Worth preserving during extraction: `RL-48`/`H2` — a grant save must round-trip permission keys the
grid cannot display. The seed grants `admin` every active key while the grid renders a subset, so a
naive "save what's on screen" rewrite silently deletes authority. This is a property of the save
payload, not of the component tree, and it is the single most likely casualty of a refactor that
moves save logic around.

## Evidence

Dependencies are not installed in this promotion worktree and the lane holds no Development Slot,
so the suites were not executed here. The four invariants above are fs+regex predicates, and each
was evaluated directly against the tree by running the same discovery the tests run — results in
the table. This measures the assertions, not the runner: a green run of
`web/tests/access/oneRoleEditorPage.test.ts` and `roleEditorSingleSurface.test.ts` in a slotted
lane remains the check to run before merging any change in this area.

## Recommendation

Proceed to implementation on the five non-grid clusters only. Treat the grant grid, the
`applyGridRowSelection` call site, the access-chapter directory boundary, and the `H2` save
round-trip as frozen.
