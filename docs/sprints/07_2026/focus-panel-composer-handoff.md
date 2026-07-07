# Focus Panel Composer — Next Phase Handoff

**Prerequisite:** Queue Row Builder interaction model complete on `origin/staging` (see `queue-row-builder-runtime-vocabulary-handoff.md`).

**Goal:** Apply the **same field composer mental model** to Focus Panel surfaces — without redesigning nested surface drill-in, which already exists.

## Reuse from Queue Row

### Shared interaction pattern

Documented in `web/lib/adminV2/settings/surfaces/surfaceFieldComposer.ts`:

```
click surface → open library → place item → select item → inspector edits selected item
```

| Concept | Queue Row today | Focus Panel target |
|---------|-----------------|-------------------|
| Surface click | Row canvas zone / line | Card / field region on focus panel canvas |
| Library | `QueueRowItemLibraryPanel` | Focus panel field/widget library (existing catalog) |
| Place | Append to section + line | Append to card group + line |
| Select | Inline token on canvas | Inline token on card preview |
| Inspector | Section + Placement + field list | **Same Section / Placement language** |
| Row focus | Family / Child library order | Card focus or subject focus (TBD — same *library-only* rule) |

### Terminology to carry forward

From `surfaceFieldComposer.ts` — **do not reintroduce queue-row-only names** in shared modules:

- **Section** — where on the surface (map Focus Panel anatomy to section keys)
- **Placement** — same line vs new line below
- **Placement help** — reuse `SURFACE_FIELD_PLACEMENT_HELP` verbatim where possible

### What already exists (do not rebuild)

- **Nested surface drill-in** — `NestedSurfaceEditor`, card/field registry, tenant field definitions
- **Focus Panel layout runtime** — drawer/card responders, config-driven blocks
- **Evidence groups** — `compositionEvidenceGroupRegistry.ts` (Focus Panel card map)
- **Field availability adapter** — `compositionFieldAdapter.ts` / `availableFieldsForNamespaces`

## Focus Panel-specific work

### 1. Map anatomy → sections

Define Focus Panel section keys (parallel to queue row Primary/Secondary/…):

- Example mapping: card header → Primary, card body lines → Secondary, metadata rail → Right
- Persist as `builderSlot` or equivalent on focus panel field placements (mirror `queueRowComposerModel`)

### 2. Click-first library on canvas

- Blank/configured canvas (no hardcoded mock card content when fields exist)
- Single representation per field (no ghost text + floating chip duplicate)
- **+ Add field** after last field on line; new line when line full (reuse `MAX_FIELDS_PER_LINE` pattern if applicable)

### 3. Inspector parity

- Fields-on-surface list
- Section toggles + Placement toggles
- Move earlier / later, Remove
- Help text from `surfaceFieldComposer.ts`

### 4. Runtime parity

- Published focus panel config → runtime resolver (existing layout paths)
- **No builder-only values** at runtime
- `visibleWhen` hide-when-empty for optional fields
- Validator allow-list parity (picker ⊆ validator)

### 5. Operator language

Never expose in UI:

- `candidate`, `placement_candidate`, `OCM`, `customer_member`

Use:

- Child, Family, Sibling, Other children (when sibling vocabulary extends to focus panel)

## Suggested file plan

| Action | Path |
|--------|------|
| Extend shared composer | `surfaceFieldComposer.ts` — add Focus Panel section key union if needed |
| New (minimal) | `focusPanelComposerModel.ts` — placements, line cap (mirror queue row) |
| Adapt | Focus panel builder shell component(s) under `web/components/adminV2/settings/surfaces/` |
| Reuse | `compositionFieldAdapter.ts`, evidence groups, tenant fields |
| Tests | `focusPanelComposer*.test.ts` — library, placement, inspector language, no hardcoded runtime values |

## Non-goals for Focus Panel composer v1

- Redesigning card visual design system
- Changing drawer reveal / payload readiness gates
- New sibling derivation in builder (reuse runtime resolvers when sibling fields are added to focus panel catalog)
- Placement ranking (queue row deferred item — out of scope)

## Acceptance criteria (draft)

- [ ] Click card/canvas region opens library filtered by card evidence group namespaces
- [ ] Placed fields render once as inline editable tokens
- [ ] Inspector uses Section / Placement labels and shared help text
- [ ] Library order focus (if any) does not force layout
- [ ] Publish validation rejects unregistered refKeys
- [ ] Runtime renders configured fields from resolver — no builder mock data
- [ ] Tests cover placement, visibility, and publish guard

## Reference commits

- `48815f061` — queue row composer interaction polish
- `43d4665ad` — sibling runtime vocabulary
- Queue row closeout doc + tests in same sprint folder
