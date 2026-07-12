# Visual Layout Configuration Builder — Phase 5.15 Go-Live Certification Report

**Sprint:** 5.15 — Opportunity Drawer Go-Live Certification  
**Surface:** Opportunity Drawer only  
**Baseline:** Phase 5.14B (MVP blocker pass)

## Executive summary

Phase 5.15 attempted to break the Opportunity Drawer Layout Builder through programmatic certification layouts, publish-guard stress tests, empty-state matrix checks, save/repair helpers, and regression test expansion. One publish-validation gap was found and fixed (contact role block field refs). One publish-guard gap was closed (opportunities related-list entity). Platform slot UX was extended to `lead_summary`.

**Production readiness decision: YELLOW** — MVP-complete with named, documented non-blocking limitations. Ready to clone as the platform template after staging manual QA (save → publish → refresh → rollback cycle).

---

## 1. Files changed

### Bug fixes
| File | Change |
|------|--------|
| `web/lib/layout/layoutEditorPublishGuards.ts` | Block publish when related-list section entity is preview-only (`opportunities`). |
| `web/lib/layout/surfaceLayoutRegistry.ts` | Allow contact block role field refs (`person.secondary_phone`, billing/emergency refs, etc.) so contact card starters publish cleanly. |

### UX copy / badge fixes
| File | Change |
|------|--------|
| `web/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx` | Platform slot badge on `lead_summary` (“Platform summary strip · contents editable, position fixed”). |
| `web/lib/layout/opportunityDrawerLayoutEditorModel.ts` | Friendlier `formatLayoutValidationErrors` messages for preview-only related lists and action buttons. |

### Tests / fixtures
| File | Change |
|------|--------|
| `web/lib/layout/layoutEditorOpportunityDrawerCertificationLayouts.ts` | *(new)* Certification layouts A–E + production recreation builders. |
| `web/tests/layout/opportunityDrawerLayoutPhase515Certification.test.ts` | *(new)* 19 certification tests (layouts, guards, empty states, stress helpers, widget metadata). |

### Docs
| File | Change |
|------|--------|
| `docs/sprints/archive/06_2026/visual_layout_configuration_builder_phase5_15_certification_report.md` | This report. |

---

## 2. Certification results (layouts)

| Layout | Result | Issues found | Fixes made | Remaining risk |
|--------|--------|--------------|------------|----------------|
| **A — Contact heavy** | **PASS** | Contact role block templates used field refs not in publish allowlist | Added `OPPORTUNITY_DRAWER_CONTACT_BLOCK_FIELD_REFS` to surface registry | Sparse billing/emergency data shows placeholders (intentional) |
| **B — Child heavy** | **PASS** | None in automated pass | — | Missing DOB/program/room render as empty placeholders |
| **C — KPI heavy** | **PASS** | Initial fixture created empty widget section | Rebuilt with populated widget sections + row group | Widget singleton limits (one attention/tasks/current_work per section) |
| **D — Minimal** | **PASS** | None | — | Empty household/child states depend on record data |
| **E — Operational** | **PASS** | None | — | Notes/activity sections are content sections, not widgets |
| **Production recreation** | **PASS** | None in automated pass | Starters-only builder validates | Manual browser parity vs legacy default not re-run in this session |

**Manual staging QA (Workstream A cycle):** Not executed in CI. Recommended before GREEN promotion: create draft → save → publish → refresh → open live drawer → compare preview vs runtime → edit → republish → rollback → republish.

---

## 3. Publish guard results

| Invalid scenario | Expected | Result |
|------------------|----------|--------|
| Layout action button placement | Blocked | **PASS** — clear preview-only message |
| Preview-only block template (`address_card`) | Blocked | **PASS** |
| Opportunities related-list entity | Blocked | **PASS** *(fixed in 5.15)* |
| Invalid field ref (`not.a.real.field`) | Blocked | **PASS** |
| Invalid widget ref | Blocked | **PASS** |
| Delete `household_contact` | Blocked | **PASS** |
| Delete `children_enrollment` | Blocked | **PASS** |
| Delete `lead_summary` | Blocked | **PASS** |
| Invalid section row span | Blocked | Covered by `validateSectionLayoutMetadata` (514a) |
| Orphaned row-group metadata after delete | Rebalanced | **PASS** — survivor cleared or rebalanced |
| Legacy keys (`section_3`, bare block) | Repair path | **PASS** — `ensureOpportunityDrawerLayoutDocSaveReady` |
| Unsupported nested item | Blocked | Covered by surface parse (513) |

---

## 4. Runtime parity results

Automated checks cover metadata and repeater resolution. Full visual browser parity (Workstream G) was not re-photographed in this session.

| Area | Preview vs runtime | Fixed? |
|------|-------------------|--------|
| Section order / row groups | Metadata-driven; tests pass | N/A — no mismatch filed |
| Widget tone + description | Metadata preserved on KPI layout | Verified in unit test |
| Contact repeater rows | Preview record + sparse record | Verified |
| Child repeater rows | 0 / 5 children | Verified |
| Platform slots (4/5/3 grid) | Fixed positions; badges added | UX only |
| Opportunities related list | Preview-only; publish blocked | Guard added |
| Action buttons | Preview-only; publish blocked | Already in 5.14B |
| Preview block templates | Publish blocked | Already in 5.14B |

---

## 5. Empty state results

| Case | Result |
|------|--------|
| No contacts | Empty repeater list; no raw null/undefined |
| Many contacts (preview record) | Rows render with role/email/phone |
| No children | Empty repeater |
| Five children | Five rows; missing optional fields show placeholders |
| Missing email / phone / DOB | Placeholder display; no crash |
| No widget data | Widget sections still render shell |
| Empty related lists | Intentional empty copy (5.14B) |

---

## 6. Remaining follow-ups

### MVP blockers
*None identified in automated certification after 5.15 fixes.*

### Post-MVP enhancements
1. **Opportunities related list** — configurable in builder; runtime backing deferred; publish blocked with clear message.
2. **Layout action buttons** — preview in builder; publish blocked until live dispatch.
3. **Preview-only block templates** — `address_card`, `child_summary_card` publish-blocked.
4. **Replace 4/5/3 household/enrollment shell** with fully row-grouped layout — deferred shell refactor.
5. **Manual staging certification** — full Workstream A browser cycle + operator friction log in live org.

### Future surface cloning considerations
- Starters + section composition pattern is clone-ready for Person/Child drawers once those surfaces open in registry.
- Publish guard module pattern (`validate*LayoutPublishGuards`) should be copied per surface.
- Platform slot badge pattern applies to any fixed composition grid.
- Contact/child repeater mappers are opportunity-drawer-specific today; clone with surface-specific runtime mappers.

---

## 7. Production readiness decision

### **YELLOW**

**Rationale:** Supported primitives validate end-to-end, publish guards block preview-only configuration with clear messages, and certification layouts A–E plus production recreation pass automated publish validation. Remaining yellow items are explicit product choices from 5.14B (opportunities entity, action buttons, optional block templates, fixed 4/5/3 grid) — they do not silently publish and do not break runtime for supported layouts.

Promote to **GREEN** after one clean staging manual QA pass (Workstream A + operator friction log) with no new MVP parity bugs.

---

## 8. Operator UX friction log (automated + code review)

| Friction | Severity | Action |
|----------|----------|--------|
| “Why can’t I publish?” — opportunities related list | Medium | **Fixed** — publish guard + formatted error |
| “Why can’t I publish?” — contact cards with secondary/billing fields | **Blocker found** | **Fixed** — field allowlist |
| “Why is this locked?” — platform slots | Low | Badges on household, enrollment, summary strip |
| “Why can’t I delete this?” — lead_summary | Low | Existing gate message |
| Preview vs runtime for opportunities list | Low | Blocked at publish; preview still shows in editor |
| Action buttons in layout | Low | Blocked at publish with explanation |

---

## 9. Test results

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutPhase512.test.ts \
  tests/layout/opportunityDrawerLayoutPhase513.test.ts \
  tests/layout/opportunityDrawerLayoutPhase514a.test.ts \
  tests/layout/opportunityDrawerLayoutPhase514b.test.ts \
  tests/layout/opportunityDrawerLayoutPhase515Certification.test.ts
```

**53/53 passed**

---

## 10. Recommended commit message

```
fix(layout): harden opportunity drawer builder certification gaps

- Block opportunities related-list entity at publish
- Allow contact role block field refs in surface allowlist
- Add lead_summary platform slot badge and certification test suite
```

Alternative if treating as test-only follow-up to 5.14B docs:

```
test(layout): certify opportunity drawer builder for platform MVP
```
