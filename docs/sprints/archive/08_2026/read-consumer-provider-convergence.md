# Read Consumer Convergence — Phase 1

**Branch:** `feat/read-consumer-provider-convergence`  
**Base:** `8141bb600` (P5B merged to staging)  
**Scope name:** Shared Provider Assembly + Focus Panel Children

This sprint does **not** close the full Field Platform Consumer Audit.

## Phase 1 completed

- Shared consumer assembly boundary (`consumerCanonicalProviderAssembly.ts`)
- Focus Panel Children canonical collection policy (`focusPanelCollectionPresentation.ts`)
- Children card evidence normalization through canonical ordering, active-only, and dedupe policy
- Forms tenant-field assembly proof (`field_definitions` → canonical registry → Forms assembly)
- Queue tenant-field assembly proof (registry filter only; no Queue product behavior change)
- Architecture-boundary tests

## Deferred (remaining consumer-convergence phases)

- Focus Panel Parents/Guardians collection migration
- Focus Panel concept-path → canonical provider-ref migration
- Current Work collection provider
- Operational Context collection provider feed
- Remaining Queue/Forms derivation simplification
- Focus Panel custom-field configuration/runtime path (beyond registry assembly proof)

---

## Target architecture (Phase 1 slice)

```text
canonicalCollectionProviderRegistry (children)
  → canonical collection policy (ordering, activeOnly, dedupe)
  → focusPanelCollectionPresentation
  → buildChildrenCardEvidence
  → Focus Panel VM
  → renderer
```

Enrollment operational overlay (program, schedule, stage) remains explicitly sourced from `_inquiry_children` inquiry/enrollment context — not redefined in the card builder.

---

## Shared consumer provider assembly

`web/lib/fields/consumerCanonicalProviderAssembly.ts` — thin adapters over `filterCanonicalDataProviders`:

| Adapter | Consumer filter |
|---------|-----------------|
| `assembleFormsDocumentProviders()` | `forms` |
| `assembleQueueRowProviders()` | `queue_row` |
| `assembleFocusPanelNestedProviders()` | `focus_panel` |

Canonical registry owns provider identity. Consumers apply capability filtering only.

---

## Settings-to-consumer proofs (bounded)

| Claim | Status |
|-------|--------|
| `field_definitions` → canonical registry → **Forms** assembly | **Proven in tests** |
| `field_definitions` → canonical registry → **Queue** assembly filter | **Proven in tests** (no Queue runtime/picker behavior change) |
| Focus Panel custom-field configuration/runtime | **Deferred** — not claimed in Phase 1 |

---

## Focus Panel Children adoption

**Files:**

- `web/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation.ts`
- `web/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence.ts` (uses adapter)

**Confirmed:**

- No Forms imports in collection presentation adapter
- No Queue imports
- Ordering follows `children` provider `display_name` policy
- Active/inactive follows `children` provider `activeOnly: true`
- Duplicate child ids normalized before render
- Enrollment overlay preserved from inquiry context

---

## Remaining consumer-convergence phases

1. Focus Panel Parents/Guardians via `person.contact_role.parents`
2. Concept-path → canonical provider-ref migration (compatibility adapter)
3. Operational Context collection projection
4. Current Work provider classification
5. Focus Panel tenant custom-field configuration/runtime path
6. Queue/Forms derivation simplification (non-breaking)

---

## Next branch

`feat/focus-panel-provider-convergence-phase-2` — Focus Panel Provider Convergence: Relationships, Collections, and Configuration
---

## Parents/Guardians migration — PAUSED (July 2026)

Focus Panel Parents/Guardians canonical collection migration is **paused** pending `family-relationship-projection-audit.md`.

**Reason:** `person.contact_role.parents` resolves to **Person-grain** and cannot preserve child-scoped relationship attributes (e.g. “Relationship to Child”). Operational roles must not be modeled as Person entity types.

**Do not implement** Parents/Guardians consumer adoption until relationship-instance grain and relationship-owned field platform are explicit.

## Relationship Edge Field Platform (July 2026)

Parents/Guardians Focus Panel migration remains **paused**. Canonical relationship platform foundation promoted separately on `feat/relationship-edge-field-platform`.
