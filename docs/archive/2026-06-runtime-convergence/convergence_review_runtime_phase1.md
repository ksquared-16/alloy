# Convergence Review — Runtime Convergence Phase 1

**Verdict: APPROVED**
**Reviewed:** staging commit `e296b300` ("Add layout runtime foundation (Phase 0) and relationship/reference readiness (Phase 1)"), parent `87eaf986`. Net: 22 files, +1985/−54. **0 migrations. 0 production drawer/queue/VM files touched.**
**Scope:** Layout V2 runtime read path + relationship/reference binding layer, **flag-gated (default off)**, proof/foundation only — no live cutover.
**Reviewer:** Convergence Review Authority · rubric [`convergence_review_rubric.md`](./convergence_review_rubric.md) · doctrine [`entity_relationship_reference_model.md`](./entity_relationship_reference_model.md).

---

## Review gates

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Creates a duplicate runtime/presentation system? | **No — PASS** | All additions under `web/lib/layout/**` (the convergence-target runtime). No `AdminEntityDrawer*`, production `QueueBlock`, or `vmDrawer/*` changes. Only non-lib caller is `web/app/api/admin/entity-layouts/effective/route.ts` — *"Does NOT affect live drawer/queue rendering (flag gated)"*, returns 404 when off. `runtimeParity.test.ts`: *"registry fallback unchanged."* Building the one runtime, not a parallel. |
| 2 | Complies with Layout Contract V1? | **Yes — PASS** | Binding classes are a **value-resolution axis, not new block kinds**, and are explicitly mapped back to the five frozen kinds in `classifyLayoutItemBinding.ts:33` `contractBlockForItemKind` (`widget`→`widget`, `repeater`→`repeater`, `relationship_field`/`reference_field`→`relationship_section`). Single-hop only (`opportunityRelationRegistry.ts:5` "§10.6"). Only `layoutV2.ts` change: header comment + additive `LayoutResolutionSource:"builtin"` (non-frozen enum). No tab/widget/surface change. |
| 3 | Complies with the Child Model decision? | **Yes — PASS** | Contacts → `persons`; household → `customers`; **enrollment children → `customer_members`** (durable child) with OCM only as internal `linkTable:"opportunity_customer_members"` join metadata (`opportunityRelationRegistry.ts:76–84`), not UI. `is_employee` bound via the **person** relation ("Employee (contact)", `opportunityDrawerRelationshipProofLayout.ts:105–110`), not child. No `inquiry_child`-as-product-entity; no raw OCM in operator UX. |
| 4 | Complies with the relationship/reference doctrine? | **Yes — PASS (exemplary)** | Binding classes = the doctrine's five rungs + widget (`base_field`/`reference_field`/`relationship_field`/`repeater`/`computed_projection`/`widget`). **Location is one entity through five relationship roles** — `site`, `classroom`, `room`, `household_address`, `person_address` all `targetEntity:"locations"` (`opportunityRelationRegistry.ts:39–73`) — the doctrine's headline case, implemented. `program_category` → `enrollment.program_category` computed/projection. Nothing flattened. |
| 5 | Keeps layout runtime flags off? | **Yes — PASS** | `featureFlag.ts`: `LAYOUT_RUNTIME_ENABLED` default **false**, `LAYOUT_V2_PREVIEW_ENABLED` default **false** (`readFlag(..., false)`); effective route gated; `resolveLayoutRuntime` DB-fetch defaults to the flag. `layoutRuntimeFlags.test.ts` added. |
| 6 | Avoids flattening relationship data into fields? | **Yes — PASS** | No migrations, no `field_definitions` added for related-record values. Related data resolves through `relationship_field`/`reference_field`/`repeater`/`computed_projection` bindings, never as new flat columns on child/opportunity. |
| 7 | Preserves future person/child drawer convergence? | **Yes — PASS** | Resolves to **durable** entities (`persons`/`customers`/`customer_members`/`locations`). Contacts → persons (person-drawer path preserved); children → customer_members (durable). No divergent child entity minted; relation registry is additive/extensible. No cutover locks anything. |

---

## Six convergence questions (rubric)

- **Q1 duplicate system?** No — gated runtime layer, no production renderer touched.
- **Q2 violates Contract V1?** No — binding classes map to the 5 frozen kinds; single-hop; no vocabulary breach.
- **Q3 new runtime concepts?** No new *runtime*; binding classes are the existing §8 bind step expressed as the doctrine's rungs, mapped to frozen primitives.
- **Q4 toward one runtime?** **Yes** — implements the `entity_layouts`/`LayoutDoc` read path with parity guard.
- **Q5 toward one field catalog?** Neutral/positive — does not add related-record fields; binds via relations.
- **Q6 toward one layout system?** **Yes** — extends Layout V2, the designated system.

---

## Why APPROVED (not "with concerns")

Every gate is **PASS** with direct evidence; no gate is CONCERN or FAIL. The "new concepts" (binding classes) are not divergence — they are explicitly reconciled to the five frozen block kinds in code, and they implement the just-ratified relationship/reference doctrine faithfully (location-as-one-entity, employee-via-person, children-via-repeater-to-customer_members, program-category-as-computed). Flags are off, no production path is touched, no schema changes, and parity/flag/relationship tests are added. This is textbook convergent foundation work.

---

## Standing conditions & forward notes (advisory — not blocking)

1. **Re-review before flag-on / production wiring.** This verdict covers the **gated, flag-off foundation only**. All seven gates re-apply when `LAYOUT_RUNTIME_ENABLED` is enabled or a production drawer/queue consumes this path.
2. **Renderer must surface labels, never join plumbing.** OCM appears correctly as a `linkTable` in the `enrollment_children` relation descriptor. When a renderer is wired, confirm it surfaces `customer_members`/child labels and never the `linkTable` name or `opportunity_customer_member_id` (Child Model: no raw table names in UX).
3. **`program_category` consistency.** Registry exposes `program_category: "enrollment.program_category"` while the summary classifies it `computed_projection`; confirm the classifier tags it consistently (computed vs reference) so downstream binding is unambiguous.
4. **Relation registry scope.** `OPPORTUNITY_DRAWER_RELATIONS` is Phase-1 opportunity-drawer scope; future person/child drawers should extend the same registry pattern (not fork it) to preserve Gate 7.

---

## Notes

- No FAIL, no CONCERN on any gate → **APPROVED**. The advisory notes are forward-looking watch-items for later phases, not defects of this sprint.
- Posture is exemplary: zero migrations, zero production-runtime changes, flags default off, doctrine implemented as written, and tests (`layoutRuntimeFlags`, `queueLayoutVariantResolve`, `relationshipReferenceRuntimePlan`, `runtimeParity`) added. Companion design note `relationship_reference_runtime_notes.md` is present and consistent.

---

*Convergence review of Runtime Convergence Phase 1 @ `e296b300`. Evidence-based; re-review required before flag-on / production wiring.*
