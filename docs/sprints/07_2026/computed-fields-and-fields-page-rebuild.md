# Computed Fields + Settings → Fields Page Rebuild

**Sprint:** July 2026  
**Branch:** `feat/fields-registry-audit-wt-p2os`  
**Status:** Implemented

## Platform / Custom / Computed field model

Alloy fields now flow through one architecture with three ownership classes:

| Class | Storage | Settings behavior | Forms |
| --- | --- | --- | --- |
| **Platform** | Native DB columns | View only | Editable when native binding exists |
| **Custom** | `field_definitions` / `field_values` | Configure / Delete | Editable when registry + picker allow |
| **Computed** | Runtime projection | View logic | Read-only — never editable inputs |

Stack (unchanged):

```
Registry → Availability engine → Resolver registry → Builder library → Runtime rendering → Settings → Fields
```

## Computed field catalog

Canonical catalog: `web/lib/fields/computedFieldCatalog.ts`

Each entry defines:

- canonical `refKey`, operator label, entity, section, description, type
- `ownership: "computed"`
- `source_derivation`, `resolver_ref_keys`, `resolver_owner`, `resolver_status`
- `intended_surfaces`, `editable: false`, `configurable: false`
- dependencies, freshness, fallback, and honest `unavailable_reason` for future fields

### Resolver status summary

| Status | Meaning |
| --- | --- |
| `now` | Resolver aliases exist on queue hydration, drawer manifest, or derived modules |
| `future` | Catalog entry documents intent; runtime resolver not wired yet |

**Resolver-ready (`now`):** `child.age`, `person.primary_phone`, `person.primary_email`, `person.relationship_to_child`, `family.primary_parent`, `family.primary_phone`, `family.primary_email`, `family.children_summary`, `opportunity.current_stage`, `opportunity.current_work`, `opportunity.next_step`, `opportunity.tour_scheduled_date`

**Future (honest reasons):** remaining catalog entries including `family.needs_response`, `opportunity.days_in_stage`, all `location.*` projections

## Resolver ownership map

| Surface | Module | Owner |
| --- | --- | --- |
| Computed (all) | `computed_projection` | `web/lib/fields/computedFieldCatalog.ts` + alias resolvers |
| Drawer | `layout_runtime` / `computed_projection` | Layout runtime + age derivation |
| Queue / Focus | `computed_projection` | Queue validator allow-list aliases |
| Forms | blocked | “Calculated at runtime” |
| Table / BP | blocked | Not registered as columns / lifecycle requirements |

Computed canonical refKeys may map to runtime aliases (e.g. `family.children_summary` → `children.summary`, `opportunity.current_stage` → `queue_row.stage_label`).

## Settings → Fields UX model

Rebuilt as Platform Configuration workspace:

- **Left entity nav:** Person, Family, Child, Lead, Location with P / C / ∑ counts
- **Entity header:** operator explanation, total + ownership counts, where entity appears
- **Ownership filters:** All / Platform / Custom / Computed
- **Grouped sections:** Identity, Contact, Enrollment, Profile, Requirements, Runtime Signals, Communications, Placement, System
- **Unified field cards:** ownership badge, refKey, type, source line, availability badges, actions
- **Field detail inspector:** source, resolver, surfaces, builder usage, computed calculation block

Key files:

- `web/app/adminV2/settings/fields/SettingsFieldsHubClient.tsx`
- `web/lib/fields/fieldCatalogForSettings.ts`
- `web/components/admin/fields/FieldsSettingsWorkspaceView.tsx`
- `web/components/admin/fields/FieldDetailInspector.tsx`

## Availability rules

Capability engine (`fieldCapabilityEngine.ts`) derives availability:

1. Registry exists  
2. Resolver exists  
3. Renderer exists  
4. Builder supports  
5. Publish supports  

Computed-specific rules:

- Forms: always unavailable — “Not available in Forms because this value is calculated at runtime.”
- Queue/Focus: available only when `resolver_ref_keys` intersect queue validator allow-list
- Drawer: available when manifest alias or age derivation path exists
- Future catalog entries: blocked at resolver layer with catalog `unavailable_reason`

## Builder support rules

- `buildCanonicalQueueBuilderFields` merges validator allow-list **and** resolver-ready computed catalog entries
- Computed fields appear in Queue/Focus builders only when `canSurfaceResolveField` passes for that surface
- Forms builder excludes computed fields via capability engine (not UI hardcoding)

## Runtime projection audit (8 required fields)

| refKey | Catalog | Resolver | Capability | Builder | Settings | Inspector |
| --- | --- | --- | --- | --- | --- | --- |
| `child.age` | ✓ | ✓ (DOB derivation + aliases) | ✓ drawer/queue | queue when alias-backed | ✓ Child tab | ✓ |
| `family.primary_parent` | ✓ | ✓ (`person.primary_contact_name`) | ✓ queue/focus | ✓ | ✓ Family tab | ✓ |
| `family.children_summary` | ✓ | ✓ (`children.summary`) | ✓ queue/focus | ✓ | ✓ | ✓ |
| `opportunity.current_stage` | ✓ | ✓ (`queue_row.stage_label`) | ✓ queue/focus | ✓ | ✓ Lead tab | ✓ |
| `opportunity.current_work` | ✓ | ✓ (`queue_row.work_summary`) | ✓ queue/focus | ✓ | ✓ | ✓ |
| `opportunity.days_in_stage` | ✓ | future | unavailable | not exposed | ✓ | ✓ reason shown |
| `opportunity.next_step` | ✓ | ✓ | ✓ queue/focus | ✓ | ✓ | ✓ |
| `family.needs_response` | ✓ | future | unavailable | not exposed | ✓ | ✓ reason shown |

## Known gaps

1. **`OPERATIONAL_FORM_SYSTEM_FIELDS`** — legacy Forms fallback; not fully converged with canonical builder library
2. **`CHILDCARE_STARTER_FIELD_CATALOG`** — still feeds platform catalog labels/storage hints
3. **Focus Panel builder inspector** — availability badges not yet in builder inspector UI (Settings shows them)
4. **Workflow condition catalog** — separate from Fields registry; document-only relationship
5. **Future computed fields** — catalog documents intent; resolver wiring tracked per entry
6. **`opportunity.days_in_stage` / `family.needs_response`** — need queue hydration + comms triage wiring

## Next steps

1. Wire `family.needs_response` from `conversationTriage` as queue/focus resolver alias
2. Implement `opportunity.days_in_stage` from stage-entered timestamps
3. Add Focus Panel builder inspector availability badges (parity with Settings cards)
4. Converge `OPERATIONAL_FORM_SYSTEM_FIELDS` into `canonicalBuilderFieldLibrary`
5. Promote `child.age` manifest phase from `fc5` to `now` when drawer picker eligibility is desired

## Tests

```bash
cd web && npm run test -- tests/fields
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Coverage includes:

- computed catalog completeness and read-only invariants
- Forms blocking for computed fields
- queue/focus availability for resolver-ready projections
- Settings catalog ownership counts
- operator entity labels (no internal grain leaks in labels)
- `child.age` DOB derivation
