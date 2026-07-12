# Convergence Review — Person + Child Drawer Runtime Foundation

**Verdict: APPROVED**
**Reviewed:** `origin/cursor/person-child-drawer-runtime-foundation` @ `b367cb0a` ("Add Person and Child drawer layout runtime proof foundation"), single commit on merge-base `36af8691`. Net: 18 files, **+1,361/−6. 0 migrations. 0 production drawer/VM/queue/nav/seed files modified.**
**Scope:** Proof-only Person + Child drawer LayoutDocs, relation registries, and proof fixtures, behind the preview flag.
**Reviewer:** Convergence Review Authority · rubric [`convergence_review_rubric.md`](./convergence_review_rubric.md) · doctrine [`entity_relationship_reference_model.md`](./entity_relationship_reference_model.md) · naming [`child_namespace_decision.md`](./child_namespace_decision.md).

---

## Ten gates

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Reuses existing layout runtime (no new drawer system)? | **PASS** | Reuses `LayoutRuntimePlanView` (Phase-2 proof renderer, +27 additive), `classifyLayoutItemBinding`, the relation-registry pattern, and `buildLayoutRuntimePlan`. New files are proof routes + relation registries + proof layouts/fixtures — no new drawer system. |
| 2 | Preserves Layout Contract V1? | **PASS** | Block kinds are `relationship_section` / `repeater` (frozen set); `surface: "drawer"`. Classifier change is additive (anchor→namespace map); no new block kind, surface, tab, or widget vocabulary. |
| 3 | Follows Child Namespace doctrine? | **PASS** | Durable child fields `child.*` anchored on `customer_members` (`CHILD_LAYOUT_ANCHOR_ENTITY = "customer_members"`); person fields `person.*`; OCM legacy `child_inquiry` recognized only as alias (not minted — sweep returned NONE). Operator labels "Child" / "Parents" / "School / site" / "Classroom". |
| 4 | Follows relationship/reference doctrine? | **PASS (exemplary)** | `childRelationRegistry.ts:4` "relationships are modeled as edges, not flat fields." Household/address/site/classroom/room/primary_contact = relationship/reference blocks; parents = `repeater` (`related_list`); locations = one entity, five roles. |
| 5 | Avoids flattening parent/classroom/site/billing onto child? | **PASS** | `buildProofChildRecord.ts:4–5` "never flat classroom/site fields on the child record." Durable child = `child.name/date_of_birth/age_band` only; all else via relationship handles. Parents are a repeater of `person.*` columns, not child columns. |
| 6 | Keeps billing/attendance/scheduling as placeholders/widgets only? | **PASS** | `childDrawerRelationshipProofLayout.ts:26` "Future tab placeholders — not real billing, attendance, or scheduling"; future tabs `schedule/attendance/billing/...` are LayoutDoc placeholders rendered by `FutureModulePlaceholder` ("Placeholder only — not implemented in layout runtime"). |
| 7 | Avoids exposing OCM / `inquiry_child` / `customer_member` / raw IDs? | **PASS** | Fixtures expose **handles/labels** only (household "Johnson Household", site "Sunshine… Main Campus", classroom "Infant Room A"). No `opportunity_customer_members`, `inquiry_child`, `customer_member`, or UUID values. (Synthetic repeater row ids `parent-1/2` are list keys, not rendered values; Phase-2 opaque-id guard still applies.) |
| 8 | Proof/shadow-only with flags off? | **PASS** | Routes under `(proof)/adminV2/layout-proof/{person,child}-drawer`; clients gate on `isLayoutV2PreviewEnabledClient()` and render an instruction message when off. Flags default off (Phase-0 `featureFlag.ts` unchanged — not in diff). |
| 9 | Preserves production Person/Child drawer behavior? | **PASS** | No production drawer files modified: `PersonsDrawerVmRuntime`, `PersonDrawerOperatingSections`, `ChildDrawerVmRuntime`, `AdminEntityDrawer*`, `vmDrawer/*` all untouched. |
| 10 | Safe foundation for future Person/Child cutover? | **PASS** | Child anchored on `customer_members` (durable), Person on `persons` (distinct); relationships via registries; future tabs in LayoutDoc; unbuilt modules render safe placeholders. Clean, doctrine-aligned base. |

---

## Also-checks (explicitly requested)

| Check | Result | Evidence |
|---|---|---|
| Future tabs via LayoutDoc tabs/blocks, **not hardcoded React tabs** | **PASS** | `FUTURE_TAB_PLACEHOLDERS` (child) + `OPPORTUNITY_FUTURE_DRAWER_MODULES` (children/parents/communications/tasks) appended via `futureModuleSection`; rendered by config-driven `FutureModulePlaceholder`, not production React tab components. |
| `child_inquiry.*` **not minted** | **PASS** | `git grep` for `child_inquiry.` in new runtime/proof code → NONE (only legacy-alias recognition in `classifyLayoutItemBinding`). |
| `person == child` **not implied** | **PASS** | Two distinct anchors: `PERSON_LAYOUT_ANCHOR_ENTITY = "persons"`, `CHILD_LAYOUT_ANCHOR_ENTITY = "customer_members"`; separate registries. The classifier maps `customer_members → child` (i.e. **customer_member == child**, the doctrine) and `persons → person` — never person == child. |
| Location roles correct for site/classroom/room/address | **PASS** | One `locations` entity via roles `site`, `classroom`, `room`, `household_address`, `person_address` (child + person registries) — exactly the "one entity, many relationships" doctrine. |

---

## Six convergence questions (rubric)

- **Q1 duplicate system?** No — reuses the layout proof runtime.
- **Q2 violates Contract V1?** No — frozen block kinds; additive classifier.
- **Q3 new runtime concepts?** No — relation registries + proof layouts on the existing runtime.
- **Q4 toward one runtime?** Yes — extends the Layout V2 proof to Person/Child.
- **Q5 toward one catalog?** Neutral/positive — canonical `child.*`/`person.*`/`inquiry_child.*` refKeys, no `child_inquiry` mint.
- **Q6 toward one layout system?** Yes.

---

## Outcome

All ten gates and all four also-checks pass with direct evidence. This is a **flag-gated, proof-only** foundation that anchors the child drawer on the **durable `customer_member`** (not person), models parents/household/classroom/site/room as **relationships/references** (never flattened), keeps billing/attendance/scheduling as **explicit placeholders**, exposes **no OCM/`inquiry_child`/raw ids**, mints **no `child_inquiry.*`**, and touches **no production drawer**. It is a clean, doctrine-aligned base for a future Person/Child production cutover. → **APPROVED.**

## Forward notes (advisory)

- **Re-review before flag-on / production cutover.** All gates re-apply when a production Person/Child drawer consumes this path — especially a parity check against the current production VM drawers (Gate 9).
- **Shared classifier change.** `classifyLayoutItemBinding.ts` is shared with the opportunity path; the anchor→namespace map is additive and covered by `personChildDrawerRuntimeProof.test.tsx`, but re-confirm opportunity parity (Phase 2/3/4 tests) before cutover.
- **Enrollment-context locations.** The child drawer's `enrollment_site/classroom/room` relations must resolve through the **enrollment-child context** (child → enrollment/OCM → location) when wired, surfacing **labels**, never OCM names or ids.
- **Repeater row ids.** Ensure real parent/child repeater binding renders person labels, not the synthetic/opaque row ids used in fixtures (opaque-id guard).

*Convergence review of Person + Child Drawer Runtime Foundation @ `b367cb0a`. Evidence-based; re-review required before flag-on / production cutover.*
