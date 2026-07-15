# Session handoff — PR #194 (identity disclosure field policy + inline edit)

> Session handoff for operator resume. Not doctrine.

## Mission

Finish [PR #194](https://github.com/ksquared-16/alloy/pull/194) after rebasing onto latest `origin/staging`, completing authenticated manual QA, correcting any defects found, finalizing docs, then making a merge decision.

## Workspace

| Item | Value |
|------|-------|
| Worktree | `/Users/Kelly/.cursor/worktrees/Alloy/6lmr` |
| Branch | `fix/focus-panel-field-policy-inline-edit` |
| Pre-closeout product HEAD | `1574830ccf6b95bed7377d6c0db639667cbecf1d` |
| PR | https://github.com/ksquared-16/alloy/pull/194 |

**Note:** The final docs closeout commit will advance HEAD beyond the product SHA above.

## Staging divergence at closeout (Jul 15, 2026)

| Reference | SHA |
|-----------|-----|
| `origin/staging` | `63d8267dac35beb7cd0e3dfe8a890ba1a1d681dd` |
| Merge base (`origin/staging`…HEAD) | `7c56f0f1e16c700eebf94d35d83c7809a44fb45c` |
| `git rev-list --left-right --count origin/staging...HEAD` | **91** behind staging, **6** ahead (before docs commit) |

## Six product commits (final correction stack)

1. `bde1c8130` — Enforce disclosure-tier field policy and inline Context editing.
2. `eb1691713` — Separate atomic name fields from derived identity display fields.
3. `08e3abbdf` — Render identity Details from published surface configuration.
4. `f232d14f0` — Preserve published identity field label presentation.
5. `3f5ece393` — Restore editable Context field runtime behavior.
6. `1574830cc` — Resolve computed Full Name and primary relationship presentation.

## Files changed by category (PR diff)

**Docs**

- `docs/platform/operator/focus-panel-builder.md`
- `docs/platform/operator/identity-surface-composition-v2.md`
- `docs/sprints/07_2026/identity-disclosure-v2/00-sprint-closeout.md`
- `docs/sprints/07_2026/identity-disclosure-v2/session-handoff-pr-194.md` (this file)

**UI / runtime CSS**

- `alloyOsRuntime.css`
- `HouseholdCard`
- `IdentityCollectionContext`, `IdentityDisclosureSurface`, `IdentityFieldGrid`, `IdentityFieldValue`, `IdentityRecordDetails`, `IdentityRecordSummary`

**Runtime / model**

- `buildHouseholdCardEvidence`, `householdRoleConfig`, `householdSurfaceFields`
- `buildIdentityCardVM`, `composeIdentityContextRows`, `identityFieldMutationBinding`, `identitySurfaceCompat`, `identitySurfaceCompose`, `identityFieldPlacement`, `nestedSurfaceEditorModel`

**Tests**

- `householdPersonEditAffordance`, `identityAtomicNameFields`, `identityDetailsProjection`, `identityDisclosureLayers`, `identityPlacementLabelPublication`, `identityPrimaryBadge`, `identitySurfaceComposition`, `identityTierFieldPolicy`

## Root causes fixed

- Exact-tier policy leakage from `contact_edit`
- Atomic first/last collapsed into derived name
- Context duplicate refs used Summary read-only cells
- Context `canMutate` required `onEditContact` rather than inline `onSaveField`
- Builder `showLabel` stored in `fieldModes` while runtime read `labelMode`
- No `person.full_name` / `contact.full_name` resolver
- Primary badge always neutral
- Details projection previously not fully authoritative

## Automated validation (complete)

- `npm run typecheck` — pass
- `npm run typecheck:tests` — pass
- `NODE_OPTIONS=--max-old-space-size=8192 npm run build` — pass
- Focused tests — **81/81** pass

## Manual authenticated QA matrix (pending)

**Summary:**

- First Name label hidden
- Last Name label hidden
- Email/Phone labels visible
- Summary fields read-only
- Full Name populated
- Primary badge Bend Pine
- Guardian badge neutral
- row layout and pairing correct

**Context:**

- configured fields display normally, not disabled
- Edit appears only on hover/focus
- First Name edits inline
- Last Name edits inline
- Email edits inline
- Phone edits inline
- Kelly mutation targets Kelly
- Kristi mutation targets Kristi
- save updates Context
- save refreshes Summary
- Full Name recomputes after First/Last changes

**Regression:**

- Household collection drill-in
- Household Details
- Household Evidence
- Children collection handoff
- Children Details
- Children Evidence
- published surfaces match /work-unit
- no stale configuration after publish/reload


## QA fixes (2026-07-15)

- **Other parent avatar:** `other_parent_guardian` avatar accent now matches Primary Contact (Alloy blue); Guardian badge stays neutral; Primary pill remains Bend Pine.
- **View Household focus:** Elevated grid cell `z-index` raised above the depth scrim so the household drill-in is not grayed/blocked.

## Known risks

- No authenticated browser QA in the session that produced this handoff.
- Branch is substantially behind staging (91 commits); rebase may conflict.
- Inline mutation scoped to supported person/contact fields only.
- Staging may have changed shared Focus Panel files since branch diverged.
- **No merge approval** until manual authenticated QA passes.

## Resume sequence

**Rebase onto latest `origin/staging` before any additional implementation.**

```bash
cd /Users/Kelly/.cursor/worktrees/Alloy/6lmr
git status --short
git fetch origin
git switch fix/focus-panel-field-policy-inline-edit
git rebase origin/staging
# resolve conflicts, then:
git push --force-with-lease origin fix/focus-panel-field-policy-inline-edit
cd web
npm run typecheck
npm run typecheck:tests
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

Then run the authenticated QA checklist above. Implement only defects found; update docs; re-run validation; push with `--force-with-lease` only if a rebase was performed.

**Do not merge PR #194 before authenticated QA passes.**
