# Experience Builder — surface cloning plan

**Status:** Implementation plan (June 2026). **Do not start Person/Child/Queue cloning until Lead reference is signed off.**

Applies the [Experience Builder doctrine](./experience-builder-doctrine.md) to additional record surfaces.

---

## Summary matrix

| Surface | Runtime path today | Default layout | Builder UI | Inline edit | Priority |
|---------|-------------------|----------------|------------|-------------|----------|
| **Opportunity (Lead)** | `LayoutRuntimePlanView` + VM record | `defaultLeadLayouts.ts` | Shipped (`OpportunityDrawerLayoutVisualEditor`) | Shipped (518X–518Z) | **Reference** |
| **Person drawer** | `LayoutRuntimePlanView` + person composition hints | `defaultPersonLayouts.ts` | Partial — doc exists, editor parity incomplete | Field `editable` in default doc; section Edit not fully verified | P1 |
| **Child drawer** | `LayoutRuntimePlanView` + child composition hints | `defaultChildLayouts.ts` | Partial | Same as Person | P1 |
| **Queue record row** | `OperationalQueueRecordRow` + v3 metadata | Queue presets / `queueRecordLayoutV3` | Queue layout editor (settings) | Row fields only — no section Edit pattern | P2 |
| **Waitlist queue** | Same queue row composer | `defaultWaitlistLayouts.ts` | Shared with queue editor | Same | P2 |
| **Future drawers** | `LayoutRuntimePlanView` target | Per-entity default doc | Reuse Experience Builder shell | Per save adapter registry | P3 |

---

## Shared reuse checklist

When cloning to a new surface:

1. **LayoutDoc** — entity-specific default doc + publish path on `record_drawer_layouts` (or queue metadata).
2. **Field catalog** — `opportunityDrawerLayoutEditorFieldCatalog` pattern → entity catalog groups.
3. **Runtime record** — VM → `ProofRuntimeRecord` builder (e.g. `buildOpportunityLayoutRuntimeRecordFromVm`).
4. **Renderer** — `LayoutRuntimePlanView` with entity composition hints (no forked drawer body).
5. **Inline edit** — extend `layoutRuntimeFieldIsEditable` + save adapters for entity PATCH paths.
6. **Tests** — parity tests per surface (`layoutBuilderRuntimeParity*` + entity proof tests).

---

## 1. Person Drawer

### Current path

| Layer | Location |
|-------|----------|
| VM | `PersonsDrawerVmRuntime` (flag-gated) |
| Layout body | `LayoutRuntimePlanView` when person overview composition enabled |
| Default doc | `web/lib/layout/defaultPersonLayouts.ts` |
| Composition | `personOverviewComposition.ts`, `PersonOverviewRuntimeComposition` |
| Proof tests | `personChildDrawerRuntimeProof.test.tsx` |

### Default layout source

- Sections: identity, contact methods, connected children, household relationships, communication prefs, activity, documents (widgets).
- Many fields ship `editable: true` in default doc — needs audit against save adapters before enabling section Edit.

### Field catalog

- `childcareLayoutFieldCatalog.ts` + person-scoped groups in layout editor catalog.
- Relationship contact roles reuse `layoutEditorContactRoles`.

### Related lists / repeaters

- **Connected children** — `connected_children` related_list; filter via `filterPersonRelatedListColumnsForComposition`.
- **Household relationships** — family/guardian repeater; card list presentation option.

### Inline edit support needed

| Area | Gap |
|------|-----|
| Save adapters | Person PATCH for phone/email/address; verify registry coverage |
| Section Edit | Wire `resolveLayoutRuntimeSectionEditMode` — same as Lead |
| Contact blocks | Reuse `resolveLayoutEditorContactBlockPerson` with person record shape |
| Related-list columns | Column `editable` + in-place controls in card list |

### Relationship / contact needs

- Primary contact from person record (self).
- Additional contacts from `_customer_persons` / household links.
- Hide-when-empty on additional contact blocks — same doctrine as Lead.

### Runtime renderer reuse

- **Reuse** `LayoutRuntimePlanView`, `DrawerOverviewPanelShell`, `LeadEnrollmentCardList` pattern for child lists.
- **Do not** expand `DrawerHouseholdProfileSection` substitution — layout-doc path only.

### Migration plan

1. Enable person VM + layout doc publish for pilot org.
2. Audit default doc — set `editable: true` only where PATCH exists.
3. Run person proof record through builder preview parity tests.
4. Enable Experience Builder editor tabs for person entity (catalog + section keys).
5. Manual QA: identity, contact, connected children, section Edit hover pattern.

### Tests needed

- `personChildDrawerRuntimeProof.test.tsx` — extend for section Edit + inline controls.
- `layoutBuilderRuntimeParity518*` — person contact block visibility cases.
- Default doc validation (`validateLayoutDoc`).

---

## 2. Child Drawer

### Current path

| Layer | Location |
|-------|----------|
| VM | Child drawer via `PersonsDrawerVmRuntime` / child entity routes |
| Layout body | `LayoutRuntimePlanView` + `childOverviewComposition` |
| Default doc | `web/lib/layout/defaultChildLayouts.ts` |

### Default layout sections

- Child identity (name, DOB, age computed).
- Household / guardians (related_list or contact blocks).
- Enrollment status, school/location/program/room.
- Schedules (widget / related).
- Medical/compliance — `FUTURE_MODULE_METADATA_KEY` placeholders.
- Related opportunities / enrollments list.

### Field catalog

- Child + inquiry_child + enrollment refKeys from `childcareLayoutFieldCatalog`.
- DOB/Age: age from DOB only (`child.dob_age` display config).

### Related lists / repeaters

- **Family relationships** — guardian cards/table.
- **Enrollment / opportunities** — optional related_list.

### Inline edit support needed

| Field group | Adapter status |
|-------------|----------------|
| DOB | Child PATCH |
| School/program/room | Inquiry-child placement (reuse enrollment adapters) |
| Enrollment status | `enrollment_child_status` option source |
| Identity (name) | Display-only or PATCH — policy decision |

### Relationship / contact needs

- Guardians via household `_customer_persons` / child–person links.
- Contact blocks: `parents`, `emergency` roles — exclude duplicate primary guardian.

### Runtime renderer reuse

- Same as Person — single `LayoutRuntimePlanView`.
- Enrollment-style row template for program/room rows if configured.

### Migration plan

1. Publish `buildChildDrawerDefaultDoc()` for pilot org.
2. Align enrollment columns with Lead child row template metadata.
3. Verify placement provider loads for child drawer context.
4. Builder editor: child entity picker + section certification layouts.

### Tests needed

- `personChildDrawerRuntimeProof.test.tsx` — child sections render.
- Age-from-DOB parity (518W tests).
- Inline edit on DOB/program/room columns in related lists.

---

## 3. Queue record layouts

### Current path

| Layer | Location |
|-------|----------|
| Config | `LayoutDoc.metadata.queue_record_layout` v3 (`queueRecordLayoutV3.ts`) |
| Editor | Queue record layout editor in settings |
| Runtime row | `OperationalQueueRecordRow`, `buildQueueRowLayoutRuntimeEnrichment` |
| Preview | `QueueRecordLayoutPreview` → `OperationalQueueRecordRow` (fixture) |

### Default layout source

- Org/queue presets; not full LayoutDoc sections.
- Blocks: `field_group`, `repeated_record_block` (children chips/cards).

### Field catalog

- `queueRecordScopeCatalog` — scoped fields (main record, primary related, repeated related, lifecycle context).

### Related lists / repeaters

- **Repeated related block** — compact child rows on queue card (preview-only selection surface).
- Not full drawer related_list — simplified row/chip display.

### Inline edit support

- **Out of scope for drawer-style section Edit** on queue rows.
- Queue rows are preview/selection — authoritative edit in drawer.
- Optional future: inline PATCH for 1–2 high-frequency fields (status, assignee) — separate sprint.

### Waitlist-specific

- `defaultWaitlistLayouts.ts` — waitlist queue column presets.
- Same v3 composer; waitlist-specific field keys and attention widgets.

### Runtime renderer reuse

| Approach | Recommendation |
|----------|----------------|
| Full Experience Builder shell on queue | **No** — queue rows need compact single-row composer |
| Shared field metadata / display helpers | **Yes** — status labels, date format, typography tokens |
| Shared inline control component | **Optional** — if queue inline PATCH added later |

### Expected gaps

- Queue v3 schema ≠ LayoutDoc section model — bridge or keep parallel (documented).
- No section Edit pattern — row is atomic.
- Preview uses fixture record — need live queue row enrichment parity tests.

### Migration plan

1. Document v3 block → display contract (done in this plan).
2. Align status/attention widgets with drawer vocabulary (`formatLayoutRuntimeStatusLabel`).
3. Queue builder preview uses same enrichment as work-unit page row.
4. **Do not** force LayoutDoc sections into queue rows without schema design.

### Tests needed

- `queueRecordLayoutEditorModel.test.ts` — extend for display parity.
- Work-unit page row render with published v3 config.
- Waitlist preset regression.

---

## 4. Future drawers

Any new entity drawer should:

1. Add `build{Entity}DrawerDefaultDoc()` following Lead/Person/Child anatomy.
2. Register entity in layout publish + builder entity switcher.
3. Add VM record builder → `ProofRuntimeRecord`.
4. Extend save adapter registry before marking fields `editable: true`.
5. Add certification layout + parity test file.

---

## Remaining blockers (cross-surface)

| Blocker | Surfaces affected |
|---------|-------------------|
| `DrawerHouseholdProfileSection` legacy substitution | Lead `household_contact` when profile path active |
| Person/Child VM flag default OFF | Person, Child |
| Queue v3 ≠ LayoutDoc sections | Queue, Waitlist |
| Job/schedule layout editors | Not started |
| Full `record_actions` registry migration | Actions in builder preview |

---

## Related

- [Experience Builder doctrine](./experience-builder-doctrine.md)
- [Drawer system](./drawer-system.md)
- [Queue system](./queue-system.md)
