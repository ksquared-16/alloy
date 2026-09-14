---
title: Department abstraction convergence
status: sprint
owner: business process / platform model
raised_by: Access & Identity V2 — Department product retirement + Business Process authority convergence
---

# Department abstraction convergence — retire the product, keep the identity

**Status:** convergence design, no implementation.
**Base:** `origin/staging` 78df95d0b.
**Evidence:** census `gar_4801886a81e716` (adoption) and `gar_04da3f449e8ea4` (write provenance),
both against `alloy_deployed_primary`; source census of the mounted adminV2 tree at that SHA.

---

## 1. The finding, and a correction to the prior turn

The previous run classified Departments **LIVE_CANONICAL_PRODUCT** on the strength of five rows, a
write two days old, and thirty-one dependent business-process revisions. That reading was wrong, and
the provenance census says exactly how:

| key | active | created | updated | lifecycle marker | metadata |
|---|---|---|---|---|---|
| `lead_management` | yes | 2026-06-02 | **2026-09-12** | **builder-owned + `lifecycle_builder_v1`** | 6 keys |
| `enrollment` | **no** | 2026-04-22 | 2026-07-28 | none | attention rules |
| `finance` | yes | 2026-04-22 | 2026-04-22 | none | `scaffold_note`, `tenant_slice` |
| `operations` | yes | 2026-04-22 | 2026-04-22 | none | `scaffold_note`, `tenant_slice` |
| `system` | yes | 2026-04-22 | 2026-04-22 | none | `scaffold_note`, `tenant_slice` |

- **The 2026-09-12 write was the Lifecycle Builder**, not a human. It landed on the single
  builder-owned row, the only one carrying a `lifecycle_builder_v1` document.
- **All 31 business-process revisions hang off lifecycle-marked departments; zero off the others**
  (`bp_revisions_by_marker: on_lifecycle_marked=31 on_unmarked=0`). Work units split 7 / 2.
- **Three of five rows have never been updated since the day they were provisioned**, and carry only
  `scaffold_note` / `tenant_slice` — provisioning scaffolding. A fourth is deactivated.

Persistence dependency was being mistaken for product legitimacy. The Director was right.

## 2. Canonical doctrine already says this

Two governance documents classify `departments` without ever calling it a product entity:

- `docs/platform/core/entity-model.md:78` — **`departments` | ACL + metadata ownership**, in the
  business-process configuration table beside `lifecycles` (catalog) and `work_units` (execution
  host). The operator model on the next line is **Process → Stage → Record**. Department is not in it.
- `docs/platform/core/configuration-ownership-and-inheritance.md:116` — "`department` / `work_unit`
  are **orthogonal access/metrics axes**, *not* the config-value ladder."
- `docs/platform/core/business-process-system.md:39,44` — the operator label is **Business Process**;
  "Builder API paths remain `lifecycle-*` internally — **Accepted**, rename deferred."

So the platform has already decided that internal path naming may lag product naming. That is the
precedent this plan follows: converge authority and product surface now, defer the rename.

## 3. Classification

**MIXED — LEGACY PRODUCT ABSTRACTION over LIVE RUNTIME IDENTITY.**

- *Department as product*: **LEGACY.** No mounted navigation, no operator need, no doctrinal standing.
- *Department as persistence/grouping*: **LIVE and load-bearing.** ACL anchor, metadata envelope,
  NOT NULL parent of work units and business-process drafts/revisions.

## 4. Product exposure (Phase 1)

`CONFIGURATION_WORKSPACE_DOMAINS` (`web/lib/adminV2/configurationWorkspaceDomains.ts:122`) carries
`{ label: "Departments", description: "Teams and organizational structure.", advanced: true }` — and
`SettingsWorkspaceNav.tsx:107` renders `domain.items.filter((item) => !item.advanced)`. The entry is
registered and then suppressed. It is **not** in `CONFIGURATION_WORKSPACE_ADVANCED_ITEMS`, which is a
separate hand-curated list of four unrelated items. **Result: unreachable by navigation.**

`app/adminV2/settings/departments/page.tsx` does exist and mounts the legacy client with adminV2
chrome, and `app/legacy-admin/system/departments/page.tsx` redirects into it, so the screen is
reachable **by typed URL only**. Classification: `LEGACY_SURFACE`.

> Correction: the prior turn reported "no adminV2 importer" for `DepartmentsClient.tsx`. There is one
> — `app/adminV2/settings/departments/page.tsx:1`. The surface is mounted; it is the *navigation*
> that is absent. The conclusion is unchanged, the reason is not.

| Question | Answer |
|---|---|
| Navigate to a Departments screen? | **No** — filtered out of the settings nav |
| Create a Department from current UI? | **Not as a Department.** Only by typed URL, or implicitly by creating a **Lifecycle** |
| Rename one? | **Not as a Department.** Renaming a **Lifecycle** syncs `departments.name` |
| Delete one? | **No mounted path.** Only the unlinked legacy client |

Remaining visible occurrences: the attention/SLA page renders a `Department` picker label and the
toast "Saved department attention rules"; `KpiPlacementsSettingsClient` says "Department pages".
Those are `FILTER/GROUPING_LABEL` leakage of the legacy noun into live surfaces.
`app/adminV2/components/canvas/mockDepartments.ts` and `DepartmentNode.tsx` are `DEAD_COPY` (mock).

## 5. Caller census (Phases 2–3)

**Generic CRUD**

| Route | Mounted callers | Legacy callers | Verdict |
|---|---|---|---|
| `POST /api/admin/departments` | `clientCreateLifecycleViaBuilder.ts` — **creates a Lifecycle** | `DepartmentsClient` | **Lifecycle create in disguise** |
| `PATCH /[departmentId]` | `LifecycleActivationBoard` (rename sync, `activationOwned` only); `attention-sla-rules` (metadata envelope) | `DepartmentsClient` | **Lifecycle + config writes** |
| `DELETE /[departmentId]` | **none** | `DepartmentsClient` | **LEGACY CRUD** |

`createLifecycleViaBuilderPath` is the decisive artifact: the operator types a *Lifecycle name*, and
the client POSTs `{ key: slugifyLifecycleKey(name), metadata: newBuilderOwnedDepartmentMetadata(...) }`
to `/api/admin/departments`, then immediately PATCHes `…/lifecycle-builder` with `create_process`. The
code already names the result `runtimeDepartmentId`. `lifecycleBuilderOwned.ts` calls it "the
canonical marker for departments created by the primary Lifecycle Builder."

**Lifecycle families** — every mounted caller is a Lifecycle or Business Process surface; none is
department administration.

| Family | Mounted callers | Actual product owner |
|---|---|---|
| `lifecycle-builder` | 13 (`LifecycleHubClient`, `LifecycleActivationBoard`, `LifecycleCreateForm`, `LifecycleAddStageForm`, `LifecycleBuilderToolbar`, `StageWorkRequirementsEditor`, `StagePaperworkCard`, `StagePerChildPathsEditor`, `StageFormRequirementsEditor`, `BusinessProcessTrackAdoptionCard`, `LifecycleEnrollmentV2TemplateCard`, `useBosProcessEffectiveCommandKeys`, `clientCreateLifecycleViaBuilder`) | **Business Process** |
| `lifecycle-activation` | 3 (`LifecycleActivationBoard`, `LifecycleActivationValidation`, `LifecycleBuilderPrimary`) | **Business Process (activation)** |
| `lifecycle-requirements` | 2 (`LifecycleStageRequirementsEditor`, `LifecycleStageFieldRequirementsEditor`) | **Business Process** |
| `lifecycle-actions-matrix` | 2 (`LifecycleActionsMatrix`, `BusinessProcessActionsQueueWorkspace`) | **Business Process** |

These are Business Process operations wearing a legacy namespace.

## 6. What `department_id` means today (Phases 4, 8, 9)

| Table | What it groups | Class | Operator picks it? |
|---|---|---|---|
| `business_process_revisions` / `_drafts` | which process this revision configures | **LIFECYCLE CONFIGURATION** | no — implied by the Lifecycle |
| `work_units` | which domain a queue belongs to | **GROUPING / OWNERSHIP** | no — derived at bootstrap |
| `action_placements`, `status_transition_rules`, `workspace_kpi_placement` | optional placement/rule targeting | **GROUPING** | indirectly, as a filter label |
| `user_department_access`, `user_access_profiles.department_scope` | which domains a principal may operate in | **SCOPE** | yes, in Access |
| `departments.metadata` | lifecycle documents, attention rules | **LIFECYCLE CONFIGURATION (envelope)** | no |

`departmentIdAllowed` (`web/lib/admin/accessScope.ts:46`) is enforced by **40 files**, including every
lifecycle and business-process route. It means *"this principal may operate within this operational
domain"*, never *"this person belongs to HR department X"*. Record it as **legacy terminology over a
live operational-domain scope** — keep the mechanism, retire the word, do not broaden access.

## 7. Dispositions

- **DELETE** — category **B + D**: no mounted caller, guarded by a `work_units` precheck (409) and FK
  `23503` handling, and `business_process_revisions.department_id` is NOT NULL, so it is *effectively
  unusable on any real domain*. **RETIRE with the legacy UI.** Do not create `departments.delete`.
- **POST** — keep the endpoint as **Lifecycle runtime provisioning**, not generic department creation.
  Authority belongs to the Business Process family. Lifecycle deletion already has its own path
  (`lifecycle-activation` DELETE → `deleteActivationLifecycleForDepartment`).
- **PATCH** — keep for the two live writers, rehome authority. Its `metadata` shape is a
  **storage-envelope coupling**: attention/SLA rules and lifecycle documents share a jsonb column on
  an ACL row. Record as model debt; do not migrate it in this slice.
- **`DepartmentsClient.tsx`** — `DEAD_REQUIRES_COMPATIBILITY`: the adminV2 page imports the component
  and `legacy-admin/system/work-units/WorkUnitsClient.tsx:10` imports its `DepartmentRow` **type**, so
  removal needs the type rehomed and the `/legacy-admin/system/departments` redirect handled.

## 8. Authority consequence (Phase 14)

| # | Gate | Method | Disposition |
|---|---|---|---|
| 1 | `departments/route.ts:76` | POST | **REHOME_AUTHORITY** → business process configure |
| 2 | `[departmentId]/route.ts:78` | PATCH | **REHOME_AUTHORITY** → business process configure |
| 3 | `[departmentId]/route.ts:205` | DELETE | **RETIRE** with the legacy UI |
| 4 | `lifecycle-builder:192` | PATCH | **REHOME_AUTHORITY** → configure |
| 5 | `lifecycle-requirements:135` | PATCH | **REHOME_AUTHORITY** → configure |
| 6 | `lifecycle-actions-matrix:86` | PUT | **REHOME_AUTHORITY** → configure |
| 7 | `lifecycle-activation:56` | PATCH | **REHOME_AUTHORITY** → activate |
| 8 | `lifecycle-activation:136` | DELETE | **REHOME_AUTHORITY** → activate |
| — | `business-process/configuration/publish:43` | POST | adjacent, same family — fold in |

**Should any `departments.*` capability be created? NO.**

## 9. Proposed capability family (Phase 15)

No `lifecycle.*` or `business_process.*` permission key exists today; all 14 departments routes are
`"status": "pending"` in `routeCapabilities.declared.json`. The smallest truthful family, split on the
same sensitivity line as the Option Sets / Layouts / Fields slice:

- **`business_process.configure`** — builder edits, stage requirements, actions matrix, runtime
  provisioning (POST), metadata PATCH. Ordinary configuration of a process.
- **`business_process.activate`** — activation PATCH and DELETE, and publish. Changes what the tenant
  is actually running.

Before implementing, run the equivalence check that settled the last slice: whether Config Layout
Assist or the lifecycle tooling already grants an equivalent effect to a holder of an existing
capability. That is what separates convergence from expansion.

## 10. Retirement level and next slice

**LEVEL 2** — retire the legacy product surface and unusable CRUD, rehome live lifecycle authority,
keep `department_id` persistence, keep every FK, keep `departmentScope`. No schema rename, no data
migration. Level 3 is not warranted: the identity is load-bearing and cheap to keep.

**Next slice — Department product retirement + Business Process authority convergence V1**

1. Remove the `Departments` entry from `CONFIGURATION_WORKSPACE_DOMAINS` and the
   `app/adminV2/settings/departments` page; rehome `DepartmentRow`; handle the legacy redirect.
2. Retire `DELETE /api/admin/departments/[departmentId]` and its role gate.
3. Introduce `business_process.configure` / `business_process.activate` with a
   `businessProcessAuthority.ts` helper, seeds, and the class-A provenance-preserving grant delete.
4. Replace the remaining seven gates (plus the publish gate) with capability checks.
5. Live/API certification per persona; restage the lifecycle tests under their canonical owner.
6. Terminology: **product language** — stop saying "Department" in the attention/SLA and KPI
   surfaces, say **operational domain** (already canonical in the handbook, os-runtime-map, and
   operational-ux-doctrine). **Code/API/database language** — unchanged this slice, per the accepted
   `lifecycle-*` precedent.

**Expected role-title debt removed: 8** (9 with the publish gate) — 110 → 102.

## 11. Namespace (Phase 12)

**No route movement.** `/api/admin/business-process/` already exists as the canonical namespace, and
doctrine has explicitly accepted that builder paths keep `lifecycle-*`. Moving four route families
would churn 20 mounted callers to buy naming, and risks a second lifecycle system. Converge the
*authority* and the *product language*; leave the paths.

## 12. Risks

- `POST`/`PATCH` cannot simply be deleted — Lifecycle create and rename depend on them. Retiring them
  as *product CRUD* while keeping them as *runtime provisioning* is a doc-and-authority change, and
  the next reader must not mistake the surviving endpoint for a live department product.
- The metadata envelope mixes attention rules with lifecycle documents on an ACL row. Untouched here;
  it will have to be split before `departments` can ever stop being a metadata owner.
- `departmentScope` stays as-is. Renaming an access dimension enforced in 40 files is its own slice.
- One principal is department-restricted on the deployed primary. Nothing in this plan narrows or
  widens that.

---

## 13. Debt recorded by the implementation slice

Three items, none of which this slice was authorized to resolve, all of which it had to name rather
than absorb.

**`DEPARTMENT_METADATA_ENVELOPE_DEBT`** — `departments.metadata` is one jsonb column carrying six
distinct lifecycle documents (`lifecycle_builder_v1`, `lifecycle_activation_v1`,
`lifecycle_builder_stage_field_rules_v1`, `lifecycle_progression_requirements_v1`,
`lifecycle_actions_matrix_order_v1`) alongside `opportunity_attention_rules`, which belongs to a
different owner entirely. Storage was deliberately not split here. What the slice did instead was
make **authority follow the semantic owner of each write rather than the shared column**, so the
envelope is now a storage problem rather than an authorization one.

**`ATTENTION_SLA_METADATA_AUTHORITY_DEBT`** — raised by the split above. `PATCH
/api/admin/departments/[departmentId]` carrying `metadata` is the org-wide attention/SLA write and
has no truthful capability. `settings.manage` is held by admin *and* ops while the handler is
admin-only, so reusing it would widen access; `business_process.configure` would turn a
process-design key into a generic JSON metadata-write key. That shape keeps the role gate it already
had — no more reachable than before — and is the third and final entry in the architecture lock's
`KNOWN_ROLE_GATED` list. When attention/SLA gets an owner, the cap returns to two.

**`DEPARTMENT_SCOPE_TERMINOLOGY_DEBT`** — `departmentScope`, `allowedDepartmentIds` and
`departmentIdAllowed` mean *operational-domain scope*, and are enforced in roughly forty files. The
mechanism is correct and load-bearing; only the noun is legacy. Renaming a scope primitive at that
blast radius deserves a dedicated compatibility slice, and the certification proves the dimension
still binds under the new capabilities: the same principal holding both keys and restricted to one
domain answers 400 inside it and 404 outside it.
