# Forms Lifecycle Requirement Coverage — Card 0 Audit

**Path:** `docs/sprints/06_2026/forms_lifecycle_requirement_coverage.md`  
**Date:** 2026-06-02  
**Status:** Cards 0–2 — audit + logic layer shipped (Cards 3–6 pending)

## Goal

Add lifecycle-aware validation to Forms so operators can configure **Lifecycle · Stage · Intent** on a form and see whether the published schema satisfies Lifecycle Builder required/recommended information — without moving Forms setup into Lifecycle Builder or duplicating the requirement engine.

**Doctrine:** Lifecycle defines the contract; Forms prove coverage. Reuse existing resolvers and bindings.

**Related:**

- `docs/sprints/06_2026/action_intake_spec_resolver_p0.md` — Create Lead action intake spec (implemented)
- `docs/sprints/06_2026/lifecycle_action_intake_model.md` — action intake design
- `docs/sprints/06_2026/lifecycle_required_info_child_fields_audit.md` — Child / inquiry_child grain
- `docs/sprints/05_2026/completed/forms_intake_runtime_validation_closeout.md` — intake runtime doctrine
- `docs/sprints/05_2026/completed/forms_mvp_productization.md` — operational intent templates
- `docs/product/documents-and-forms.md` — forms engine overview

---

## Executive summary

Alloy already has **most of the backend spine** for lifecycle ↔ form coverage, but it lives in **Lifecycle Settings**, not in **Form Builder**, and it does **not** gate publish/share/runtime today.

| Area | Current state | Gap |
|------|---------------|-----|
| Lifecycle requirement source | `effectiveFieldRulesForStage` + dept `lifecycle_progression_requirements_v1` | No form-level lifecycle/stage/intent binding |
| Form field mapping | `lifecycleFieldRuleBindings.form_capture_keys` + fuzzy label/id match | Coverage ignores `field_source`; custom fields mostly `unknown` |
| Form coverage engine | `enrollmentProcessFormCoverage.ts` + Lifecycle hub API | **New:** `evaluateFormsLifecycleFieldCoverage` (field_source-first); hub module unchanged |
| Action intake spec | `resolveActionIntakeSpec` (create_lead) | **Wired:** `resolveFormsLifecycleRequirementContract` delegates for `enrollment_lead` @ lead |
| Publish validation | Schema valid + ≥1 field | No lifecycle coverage check |
| Share readiness | Intent + link outcome (`intakeRuntimeOrchestrationPresentation`) | No required-field coverage block |
| Public submit | Schema validation + guardian email/phone for intake | Missing lifecycle fields → submission still succeeds; CRM intake skipped or partial |

**Recommended path:** Adapter Cards 1–2 reuse `effectiveFieldRulesForStage` + `lifecycleFieldRuleBindings`; Card 3 adds Form Settings UI; Cards 4–5 block record-creating readiness and server-side operationalization when required coverage fails.

---

## 1. Existing form builder fields

### 1.1 How fields are defined

Published and draft fields live in **`form_definition_versions.schema_json`** as **`FormSchemaV1`** (`web/lib/forms/schema.ts`):

- **`id`** — stable field key in `payload.values` (often equals system registry id, e.g. `guardian_first_name`)
- **`label`**, **`required`**, **`type`**, visibility, validation rules
- **`field_source`** (optional) — provenance for operational mapping:

```typescript
{ entity_type, field_key, shared_value_key?, crm_mapping_key? }
```

Schema is validated on publish (`validateFormSchema`) and on public submit (`validateFormPayload`).

### 1.2 System field selection

Admin authoring uses **`OPERATIONAL_FORM_SYSTEM_FIELDS`** (`web/lib/forms/systemFieldRegistry.ts`) and **`formFieldFromRegistryEntry`** (`web/lib/forms/systemFieldToFormField.ts`).

- Registry **`id`** becomes form field **`id`** and `field_source.field_key`
- **`entity_type`** values: `child`, `guardian`, `opportunity`, `customer`, `associate`, `enrollment`, `custom`
- **`crm_mapping_key`** encodes entity path (e.g. `guardian.first_name`, `child.first_name`, `opportunity.interest_notes`)
- **`shared_value_key`** aligns with public `values` keys when present

UI picker: `useFormSchemaFieldAuthoring` + `FormFieldAuthoringCard` (Admin Forms workspace).

### 1.3 Custom / unmapped fields

Custom fields are created with:

```typescript
field_source: { entity_type: "custom", field_key: "unmapped" }
```

(`web/lib/forms/systemFieldToFormField.ts`, `useFormSchemaFieldAuthoring.ts`)

They participate in **form schema `required`** validation only. They are **not** automatically mapped to lifecycle `person:*` / `child:*` rules unless their **field id or label** fuzzy-matches a binding token.

### 1.4 Where field keys live

| Layer | Location |
|-------|----------|
| Form schema | `form_definition_versions.schema_json` → `fields[].id`, `field_source` |
| Submission payload | `form_submissions.payload.values[field_id]` |
| Intake extraction | Link `intake_field_paths` → `buildFormIntakeMetaFromPayload` (`web/lib/forms/intake/buildFormIntakeMetaFromPayload.ts`) |
| CRM person create | `payload.meta.intake.guardian.*` from mapped value paths (defaults: `guardian_*` ids) |
| Lifecycle rules | Internal `rule_id` (e.g. `person:first_name`) — never shown to operators |

### 1.5 Audit answers

| Question | Answer |
|----------|--------|
| Can we reliably know the form captures `person.first_name`? | **Yes, when** the field uses system id `guardian_first_name` (or binding token match on id/label). **`field_source.crm_mapping_key`** (`guardian.first_name`) is authoritative for intake but **not yet used** by coverage matcher. |
| Can custom fields satisfy lifecycle requirements? | **Only weakly today** — fuzzy match on custom field **id/label** against `form_capture_keys`. Custom org rules (`custom:person:field_key`) need exact `field_key` match or state is **`unknown`**. Unmapped custom fields generally **cannot** satisfy. |
| Mappings stored as entity paths, system keys, or both? | **Both** on schema (`field_source` + `crm_mapping_key`) plus a **separate binding table** (`lifecycleFieldRuleBindings`) for lifecycle rule ids → form capture tokens + runtime value paths. |

---

## 2. Existing form intent support

### 2.1 Operational intent templates

**Catalog:** `OPERATIONAL_INTENT_CATALOG` (`web/lib/forms/operationalIntentTemplates.ts`)

| Intent key | Label (short) | Typical record outcome |
|------------|---------------|------------------------|
| `enrollment_lead` | Capture new enrollment lead | Creates person + opportunity |
| `existing_family` | Existing family update | Attach only |
| `operational_document` | Operational document | Evidence + optional CRM |
| `waitlist` | Waitlist intake | Waitlist opportunity |
| `packet_step` | Packet step | Packet session step |
| `custom` | Advanced manual setup | Operator-defined flags |

**Form metadata (stored):**

- `intake_intent` — primary intent key (PATCH via `FormOperationalIntentPicker`)
- Legacy: `intake_purpose: "enrollment_lead"`
- `intake_outcome` — e.g. `auto_create_opportunity`, `default_opportunity_status_key`

**Link metadata (merged on create/PATCH):**

- `lead_capture`, `intake`, `mode`, `auto_create_*`, `default_vertical_id`, routing ids, `intake_field_paths`, review flags
- Built by `buildOperationalIntentLinkMetadataPatch` + org routing defaults (`applyOperationalIntentToLinkMetadata`)

### 2.2 Intake type inference

`inferIntakeTypeFromLink` / `INTAKE_TYPE_CATALOG` (`web/lib/forms/inferIntakeType.ts`) — used when intent not stored. Demo form key can preserve enrollment-lead inference.

### 2.3 Create lead vs attach vs packet

| Flow | Config surface | Runtime |
|------|----------------|---------|
| Create lead | `enrollment_lead` intent + link flags + vertical | `applyFormIntakeSafe` on public submit |
| Existing record | `existing_family` + `form_context_mode: existing_record` | Launch context FKs; no new opp |
| Packet step | `packet_step` + packet launch metadata | `formPacketService` session advance |
| Document | `operational_document` | Review + document paths |

Workspace Create Lead action uses **`resolveActionIntakeSpec`** (`action_key=create_lead`) — separate from public form submit but **same field rule source**.

### 2.4 Stage relevance (partial)

`form_definitions.metadata.enrollment_operator_stages` — optional string array override for which lifecycle stages a form applies to (`formRelevantToOperatorStage` in `enrollmentProcessFormCoverage.ts`). Default mapping from intent via `INTAKE_TYPE_OPERATOR_STAGES`.

**No `department_id`, `process_id`, or lifecycle name** on form metadata today.

### 2.5 Audit answers — where should lifecycle/stage/intent live?

| Surface | Recommendation |
|---------|------------------|
| **Form definition metadata** | **Primary** — add `lifecycle_usage_v1` (see §4) alongside existing `intake_intent`. Lifecycle + stage + intent (action or operational intent) are form-level design choices. |
| **Public link metadata** | **Inherited routing only** — keep `default_department_id`, `default_work_unit_id`, location, vertical. Do **not** duplicate lifecycle contract on every link unless location-specific **routing** differs (already supported). |
| **Both** | Form declares **what lifecycle contract** it targets; link declares **where submissions land** operationally. |

**Location-specific links:** `FormLocationShareLinksPanel` mints links with location routing. Lifecycle coverage should be evaluated on **published schema** (same for all links of that form). Link activation/readiness may still require `default_vertical_id` + outcome flags per existing doctrine.

**Website Inquiry / progressive enrichment:** Preserve flows where intake succeeds with minimal contact (email/phone) and enriches later — lifecycle coverage should **block record-creating readiness**, not necessarily block publish of non-record forms or store-only links.

---

## 3. Current publish / readiness validation

### 3.1 Publish

`POST /api/admin/forms/[formId]/versions/[versionId]/publish` (`web/app/api/admin/forms/.../publish/route.ts`):

- Version must be `draft`
- `validateFormSchema` must pass
- **`fields.length >= 1`** — only structural gate

No lifecycle, intent, or coverage checks.

### 3.2 “Ready to share” / orchestration

**Form lifecycle steps:** `buildFormLifecycleSteps` (`web/lib/forms/formLifecyclePresentation.ts`)

- **Publish:** ready when draft exists
- **Share:** blocked until published; “Ready to share” when `outcomeConfigured`; otherwise “Choose purpose first” / “Finish setup first”

**Intake orchestration panel:** `buildIntakeRuntimeOrchestrationViewModel` (`web/lib/forms/intakeRuntimeOrchestrationPresentation.ts`)

- `liveReady = shareComplete && outcomeComplete && !linkSetupIncomplete`
- `outcomeComplete` = intent-specific link flags (e.g. enrollment_lead needs `auto_create_opportunity` + vertical + lead_capture)
- **`FormIntakeRuntimeOrchestrationPanel`** shows **“Ready to share”** badge when `liveReady`

**No lifecycle field coverage** in these gates today.

### 3.3 Form-level required field validation

- **Schema `required: true`** — enforced on public submit via `validateFormPayload`
- **System field defaults** — registry `default_required` seeds authoring only
- **Lifecycle required fields** — not enforced at publish or share

### 3.4 Audit answers — where should lifecycle coverage block?

| Gate | Recommendation |
|------|------------------|
| **Publish** | **Allow** for record-creating forms (warn in UI). Block publish only if product later requires lifecycle selection for certain kinds — not V1. |
| **“Ready to create lead” / share** | **Block** when intent creates records (e.g. `enrollment_lead`) and required lifecycle field coverage is incomplete. Use copy: *“This form cannot create a Lead yet because it does not capture all required information for the selected lifecycle stage.”* |
| **Public link active** | Treat same as share readiness for record-creating intents — inactive or flagged until coverage passes (optional: allow inactive link creation with warning). |
| **Recommended fields** | **Warn only** — never block readiness. |

Align with existing **`outcomeConfigured`** checks in `isOutcomeConfiguredForIntent` — add **`lifecycleCoverageComplete`** sibling flag.

---

## 4. Submission → record creation flow

### 4.1 Public submit path

`POST /api/public/forms/[token]/submissions/[submissionId]/submit` (`web/app/api/public/forms/.../submit/route.ts`):

1. Resolve embed context + schema
2. **`validateFormPayload`** (schema rules)
3. If **`linkRequiresLeadCapture`**: `buildFormIntakeMetaFromPayload` → `applyFormIntakeSafe`
4. Persist submission + workflow events

### 4.2 Intake meta extraction

`buildFormIntakeMetaFromPayload`:

- Requires **`default_vertical_id`** on link
- Requires **guardian email OR phone** in mapped value paths (defaults: `guardian_email`, `guardian_phone`)
- Maps guardian/child fields via **`intake_field_paths`** (defaults in `DEFAULT_FORM_INTAKE_VALUE_PATHS`)

Does **not** validate full lifecycle `required_rule_ids`.

### 4.3 CRM operationalization

`applyFormIntakeSafe` (`web/lib/forms/intake/applyFormIntakeSafe.ts`):

- Gates on `parseIntakeAutoCreateFlags`
- Person match/create requires email or phone (not full name requirement at runtime)
- Opportunity create when flags allow + vertical present
- Errors → `intake_error` on submission meta; **submission still completes**

### 4.4 Failure modes today

| Condition | Behavior |
|-----------|----------|
| Missing vertical | `intake_skip_reason`; no CRM FKs |
| Missing email/phone | `missing_guardian_contact`; intake skipped |
| Ambiguous person match | No FKs; needs review |
| Other intake errors | `intake_resolution_path: skipped_error` |

**Progressive enrichment preserved:** submissions save even when CRM intake skips.

### 4.5 Audit answers — server-side lifecycle validation

| Question | Recommendation |
|----------|----------------|
| Where to run? | **`buildFormIntakeMetaFromPayload` / submit route** before `applyFormIntakeSafe`, when link intent is record-creating and department lifecycle context is known (from form metadata + link `default_department_id`). |
| Before creating records? | **Yes** — if required lifecycle fields absent from submitted values (via binding map), **do not** call `applyFormIntakeSafe` auto-create paths; return **400** with operator-safe field labels. |
| Before operationalization? | Same check — block auto_create_* when coverage fails. |
| Public error shape | `{ error, code: "lifecycle_coverage_incomplete", missing_fields: [{ entity_label, field_label }] }` — no internal rule ids. |

Store-only / non-intake links: **skip** lifecycle validation (preserve Website Inquiry store-only behavior).

---

## 5. Lifecycle requirement source

### 5.1 Canonical storage

**Department metadata:** `departments.metadata.lifecycle_progression_requirements_v1`

Structure (`web/lib/completion/lifecycleProgressionRequirementsConfig.ts`):

```typescript
stages[stage].field_rules.required_rule_ids
stages[stage].field_rules.recommended_rule_ids
stages[stage].required_labels / recommended_labels  // object-level (legacy/display)
```

**Merge helpers:**

| Function | Purpose |
|----------|---------|
| `effectiveFieldRulesForStage(stage, deptMetadata)` | **Canonical field-level rules** |
| `effectiveLifecycleProgressionRequirementsForStage` | Object labels (Person, Child, …) |
| `effectiveFieldRulesForDepartment` | Wrapper for Settings/API |
| `platformFieldRulesForStage` | Platform defaults |
| `mergeLifecycleFieldPaletteForStage` | Org custom fields in palette |

### 5.2 Catalog and bindings

| Module | Role |
|--------|------|
| `lifecycleFieldRequirementsCatalog.ts` | Platform `rule_id` catalog + entity labels |
| `lifecycleFieldRuleBindings.ts` | rule_id → runtime paths + **`form_capture_keys`** |
| `lifecycleRequirementFieldDetail.ts` | Object label → nested field labels (display) |
| `createLeadIntakeFieldMap.ts` | rule_id → create_lead execute payload keys |
| `resolveActionIntakeSpec.ts` | **Action intake spec** for workspace Create Lead |

### 5.3 Existing form coverage (Lifecycle Settings)

**Engine:** `web/lib/lifecycle/enrollmentProcessFormCoverage.ts`

- Extracts capture tokens: field **labels + ids** from published schema
- **`coverageStateForFieldRule`** — uses `lifecycleFieldRuleBinding.form_capture_keys` + fuzzy normalize match
- **`buildFormFieldRuleCoverageRows`** — required/recommended rows + summary `complete | partial | unknown`

**API:** `GET /api/admin/enrollment-process/form-coverage?department_id=&stage=`  
**UI:** `EnrollmentProcessFormsCoverageCard` (Lifecycle hub) — lists org forms relevant to stage

**Legacy stub:** `enrollmentProcessFormsCoverage.ts` — static hints only; prefer `enrollmentProcessFormCoverage.ts`.

### 5.4 Audit answers

| Question | Answer |
|----------|--------|
| Canonical resolver for stage required fields? | **`effectiveFieldRulesForStage`** + **`lifecycleFieldRuleBindings`** |
| Can Forms reuse it? | **Yes** — wrap in a Forms adapter; do not fork rules |
| Smallest adapter? | **`resolveFormLifecycleCoverageSpec({ departmentId, stage, actionKey?, intent? })`** → `{ required, recommended, constraints }` delegating to `effectiveFieldRulesForStage` + create_lead policy from `resolveActionIntakeSpec` when intent is record-creating |
| Competing model? | **Avoid** — extend `enrollmentProcessFormCoverage`, don’t add a third matcher |

**Action intent mapping (V1 proposal):**

| Form intent | Lifecycle action / stage context |
|-------------|----------------------------------|
| `enrollment_lead` | `stage=lead`, policy aligned with `create_lead` (person required; child dept-required → recommended at capture) |
| `waitlist` | `stage=waitlist`, field rules for waitlist |
| `existing_family` | Coverage optional / attach-only — warn if updating required stage fields |
| `operational_document` | Stage from form metadata or enrollment |
| `general` / store-only | **No lifecycle selection required** |

---

## 6. Field requirement matching doctrine

### 6.1 Two parallel requirement layers

1. **Object labels** (`Person`, `Child`, …) — `lifecycleProgressionRequirementsCatalog` + fuzzy label match in `coverageStateForRequirement`
2. **Field rules** (`person:first_name`, …) — **`lifecycleFieldRuleBindings.form_capture_keys`** + fuzzy match in `coverageStateForFieldRule`

**Forms lifecycle coverage should use field rules (layer 2)** — matches Settings Required Information and action intake spec.

### 6.2 Person / guardian mapping

Lifecycle entity **`person`** maps to form **`guardian_*`** system fields:

| Lifecycle rule | Form system id | crm_mapping_key |
|----------------|----------------|-----------------|
| `person:first_name` | `guardian_first_name` | `guardian.first_name` |
| `person:last_name` | `guardian_last_name` | `guardian.last_name` |
| `person:email` | `guardian_email` | `guardian.email` |
| `person:phone` | `guardian_phone` | `guardian.phone` |

Binding tokens also include labels (`"Guardian first name"`, `"First Name"`) for fuzzy match.

**Doctrine:** `guardian_*` **satisfies** `person:*` for coverage and intake. Operators see **Person / Guardian** grouping in UI.

**Platform constraint (create_lead):** at least one of **`person:email`** or **`person:phone`** (`CREATE_LEAD_CONTACT_RULE_IDS`) — coverage should treat as **OR group**, not two independent required fields.

### 6.3 Child mapping

Lifecycle **`child:*`** → inquiry child / OCM paths:

| Rule | Typical form ids |
|------|------------------|
| `child:first_name` | `child_first_name` |
| `child:program_interest` | `desired_program_type` |
| `child:desired_schedule` | `desired_schedule_type` |
| `child:desired_start_date` | `desired_start_date`, `child_desired_start_date` |
| `child:classroom` | `program_room_preference`, `child_room_cohort` |

Entity type in registry may be `child` or `enrollment`; **`crm_mapping_key`** under `enrollment.*` still maps to inquiry child columns via intake.

### 6.4 Opportunity / customer

| Rule | Form support |
|------|--------------|
| `opportunity:tour_date`, `tour_time` | Binding exists; fuzzy label match |
| `opportunity:enrollment_date`, `enrollment_packet` | `form_coverage_supported: false` — coverage **unknown** |
| `opportunity_interest_notes` | Registry field exists; **no** lifecycle rule binding — does not satisfy opportunity message requirements unless added |

### 6.5 Custom org fields

Rules: `custom:{entity}:{field_key}` from org `field_definitions`.

Coverage: exact **`field_key`** match on form field id or **`field_source.field_key`**; else **`unknown`**.

### 6.6 Recommended matching precedence (Card 2)

For each lifecycle rule, consider field **satisfied** if **any** of:

1. Form field **`id`** ∈ `form_capture_keys`
2. Form field **`field_source.field_key`** or **`shared_value_key`** ∈ capture keys
3. Form field **`field_source.crm_mapping_key`** maps to binding runtime path
4. Normalized **label** match (current fallback — keep for legacy forms)

**Unmapped custom fields:** cannot satisfy unless operator maps via future explicit mapping UI (out of V1 scope).

---

## 7. Recommended data model — form lifecycle usage

Store on **`form_definitions.metadata`** (jsonb — no migration required):

```typescript
lifecycle_usage_v1?: {
  version: 1;
  /** Enrollment department or builder-owned lifecycle department */
  department_id: string;
  /** Optional when dept has multiple processes */
  process_id?: string | null;
  /** LifecycleOperatorStage key, e.g. "lead" */
  stage_key: LifecycleOperatorStage;
  /**
   * Operational intent — reuse OperationalIntentKey where possible.
   * When record-creating, ties coverage policy to action intake (create_lead).
   */
  intake_intent?: OperationalIntentKey;
  /** Future: explicit lifecycle action_key when intent alone is ambiguous */
  action_key?: "create_lead" | string | null;
}
```

**Coexistence:**

- Keep **`intake_intent`** at top level for backward compatibility OR mirror into `lifecycle_usage_v1.intake_intent` — Card 3 should **write both** during transition.
- Keep **`enrollment_operator_stages`** as optional override; prefer explicit `stage_key` when `lifecycle_usage_v1` present.

**Resolution order for coverage:**

1. `lifecycle_usage_v1` on form
2. Else infer from `intake_intent` + link `default_department_id` + `INTAKE_TYPE_OPERATOR_STAGES`
3. Else **no lifecycle coverage** (general forms)

---

## 8. Proposed UI (Form Builder — future cards)

Section: **Lifecycle usage / coverage** on Form Detail (not Lifecycle Builder)

| Control | Source |
|---------|--------|
| Lifecycle | Department picker (builder-owned + enrollment dept) |
| Stage | Stage keys from active lifecycle process |
| Intent | `OPERATIONAL_INTENT_CATALOG` subset + mapping to action policy |

**Coverage panel:**

- Required / recommended rows grouped by entity (Person/Guardian, Child, Opportunity, Customer)
- Status: Satisfied / Missing / Recommended only
- Overall: **Ready** vs **Missing required fields**
- Link to Lifecycle Settings for changing requirements (read-only contract)

Do not expose `rule_id` or raw field keys in primary UI.

---

## 9. Proposed implementation cards

### Card 1 — Requirement resolver adapter

**Goal:** Single server helper for Forms (and reuse in Cards 4–5).

**Deliverables:**

- `resolveFormLifecycleCoverageSpec({ supabase, orgId, departmentId, stageKey, intent?, actionKey? })`
- Returns merged `required` / `recommended` field specs (labels, entity, rule_id internal, constraints e.g. email-or-phone)
- Delegates to `effectiveFieldRulesForStage` + `applyCreateLeadIntakePolicy` when intent is `enrollment_lead`
- Optional thin **`GET /api/admin/forms/[formId]/lifecycle-coverage`** for Form Detail panel

**Files:** new `web/lib/forms/lifecycle/resolveFormLifecycleCoverageSpec.ts`; tests.

### Card 2 — Field coverage mapper

**Goal:** Deterministic satisfied/missing from published schema.

**Deliverables:**

- Extend `extractCaptureTokensFromSchema` → **`extractFormFieldCaptureIndex`** (ids, labels, field_source, crm_mapping_key)
- **`evaluateFormLifecycleFieldCoverage(spec, captureIndex)`** — upgrade `coverageStateForFieldRule` to use binding precedence (§6.6)
- Handle **`CREATE_LEAD_CONTACT_RULE_IDS`** OR constraint
- Unit tests mirroring / extending `enrollmentProcessFormCoverage.test.ts`

**Files:** `web/lib/lifecycle/enrollmentProcessFormCoverage.ts` or `web/lib/forms/lifecycle/formLifecycleFieldCoverage.ts` (prefer extend existing module to avoid drift).

### Card 3 — Form settings UI

**Goal:** Lifecycle + stage + intent selectors + coverage panel on Form Detail.

**Deliverables:**

- `FormLifecycleUsagePanel` component
- PATCH form metadata with `lifecycle_usage_v1`
- Live coverage fetch on schema/version change
- Wire into `FormDetailClient` / `FormLifecycleWorkspaceLayout`

**Files:** new component under `web/components/forms/admin/`; `FormDetailClient.tsx`.

### Card 4 — Readiness / publish validation

**Goal:** Block record-creating readiness when required coverage missing.

**Deliverables:**

- Integrate coverage into `buildIntakeRuntimeOrchestrationViewModel` + `buildFormLifecycleSteps`
- Block “Ready to share” / `liveReady` when `createsLead && !coverageComplete`
- Optional warn banner on publish (non-blocking)
- Admin API guard on link activate optional

**Copy:** canonical message from sprint spec.

**Files:** `intakeRuntimeOrchestrationPresentation.ts`, `formLifecyclePresentation.ts`, `FormIntakeRuntimeOrchestrationPanel.tsx`.

### Card 5 — Runtime server validation

**Goal:** Server-side enforcement before CRM record creation.

**Deliverables:**

- `validateSubmissionLifecycleCoverage({ schema, values, linkMetadata, formMetadata, departmentMetadata })`
- Call from public submit route before `applyFormIntakeSafe` when record-creating
- Return 400 with missing field labels; do not set `intake_skip_reason` silently for coverage failures

**Files:** public submit route; new validator module; tests with demo enrollment lead schema.

### Card 6 — QA + docs closeout

- Manual QA: enrollment lead form missing phone+email, missing last name, recommended-only child fields
- Preserve Website Inquiry / store-only / existing-record flows
- Update `docs/product/documents-and-forms.md` § lifecycle coverage
- Cross-link Lifecycle hub form coverage card to Form Detail deep link

---

## 10. Risk areas

| Risk | Mitigation |
|------|------------|
| **Duplicate requirement engines** | Only call `effectiveFieldRulesForStage` + existing bindings; share mapper with Lifecycle hub API |
| **Fuzzy label matching false positives/negatives** | Card 2 adds `field_source` precedence; document legacy forms may need system fields re-added |
| **Guardian vs person naming confusion** | UI grouping “Person / Guardian”; bindings already map |
| **Child rules blocking lead capture** | Reuse `applyCreateLeadIntakePolicy` — dept-required child fields are **recommended** at create |
| **Email-or-phone constraint** | Model as constraint row in coverage + runtime validator |
| **Multi-department orgs** | Require explicit `department_id` on form; don’t infer from first enrollment dept only |
| **Location links with different routing** | Coverage is schema-level; routing stays on link |
| **Silent intake skip today** | Card 5 replaces skip with explicit error for coverage failures on record-creating links |
| **Custom org fields unknown** | Show “Coverage unknown” not “Missing”; don’t block until mappable |
| **Breaking progressive enrichment** | Only block auto_create paths; allow submit + review lane when operator disables auto_create |

---

## 11. Files likely to change (by card)

| Card | Files |
|------|-------|
| 1 | `web/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract.ts`, `web/lib/forms/lifecycle/formsLifecycleCoverageTypes.ts`, `web/tests/forms/resolveFormsLifecycleRequirementContract.test.ts` |
| 2 | `web/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage.ts`, `web/lib/forms/lifecycle/formFieldCaptureIndex.ts`, `web/tests/forms/evaluateFormsLifecycleFieldCoverage.test.ts` |
| 3 | `web/components/forms/admin/FormLifecycleUsagePanel.tsx`, `web/app/admin/forms/[formId]/FormDetailClient.tsx`, `web/app/api/admin/forms/[formId]/route.ts`, `web/app/api/admin/forms/[formId]/lifecycle-coverage/route.ts` (new) |
| 4 | `web/lib/forms/intakeRuntimeOrchestrationPresentation.ts`, `web/lib/forms/formLifecyclePresentation.ts`, `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx` |
| 5 | `web/app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts`, `web/lib/forms/lifecycle/validateSubmissionLifecycleCoverage.ts`, `web/lib/forms/intake/buildFormIntakeMetaFromPayload.ts` (coordination) |
| 6 | `docs/product/documents-and-forms.md`, `docs/sprints/06_2026/forms_lifecycle_requirement_coverage.md` (closeout section) |

**Read-only reference (do not fork):**

- `web/lib/lifecycle/lifecycleFieldRuleBindings.ts`
- `web/lib/lifecycle/resolveActionIntakeSpec.ts`
- `web/lib/completion/lifecycleProgressionRequirementsConfig.ts`
- `web/app/api/admin/enrollment-process/form-coverage/route.ts`

---

## 12. Tests needed

| Area | Test file / scope |
|------|-------------------|
| Coverage spec resolver | `web/tests/forms/resolveFormsLifecycleRequirementContract.test.ts` — **shipped** |
| Field mapper | `web/tests/forms/evaluateFormsLifecycleFieldCoverage.test.ts` — **shipped** |
| Readiness presentation | `web/tests/forms/formLifecycleReadiness.test.ts` — liveReady false when missing person:last_name |
| Public submit validator | `web/tests/public/formSubmitLifecycleCoverage.test.ts` — 400 on missing required; store-only passes |
| Regression | Existing `actionIntakeSpecResolver.test.ts`, `formsAdminRoutes.test.ts` publish smoke |
| Typecheck | `cd web && npx tsc --noEmit` on all TS changes |

---

## 13. Guardrails checklist

| Do | Don’t |
|----|-------|
| Consume lifecycle configuration from dept metadata | Move Forms setup into Lifecycle Builder |
| Reuse `effectiveFieldRulesForStage` + bindings | Duplicate requirement engine |
| Keep Forms module ownership | Hardcode enrollment-lead-only rules in Forms |
| Allow general / store-only forms without lifecycle | Require lifecycle on all forms |
| Block record-creating readiness + runtime auto_create | Block non-record forms unnecessarily |
| Operator labels in UI | Expose `rule_id` / technical keys in primary UI |
| Preserve Website Inquiry + progressive enrichment | Fail entire submit for optional enrichment gaps |

---

## 14. Card 0 exit criteria

- [x] Architecture audited across form fields, intent, publish/readiness, submit flow, lifecycle resolvers, matching doctrine
- [x] Existing modules and APIs identified
- [x] Recommended metadata location documented
- [x] Implementation cards 1–6 proposed
- [x] Card 0 doc only (no product code in that card)

---

## 15. Cards 1–2 implementation (2026-06-02)

### Card 1 — Requirement resolver adapter

**Module:** `web/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract.ts`  
**Types:** `web/lib/forms/lifecycle/formsLifecycleCoverageTypes.ts`

**Entry point:** `resolveFormsLifecycleRequirementContract(input)`

| Input | Role |
|-------|------|
| `stageKey` | Parsed to `LifecycleOperatorStage` |
| `intent` | Operational intent string (e.g. `enrollment_lead`, `waitlist`, `general`) |
| `departmentId` + `departmentMetadata` | Dept-scoped rule merge |
| `orgFieldDefinitions` | Palette labels for custom org fields |

**Resolution paths (no duplicate engine):**

1. **`enrollment_lead` @ `lead` stage** with `departmentId` → `resolveActionIntakeSpec({ action_key: "create_lead" })` → normalized contract + **`constraints`** (email-or-phone OR group).
2. **All other intent/stage pairs** → `effectiveFieldRulesForStage` + `mergeLifecycleFieldPaletteForStage`.

**Output:** `FormsLifecycleRequirementContract` with `required`, `recommended`, `constraints`, `requirementsSource`.

### Card 2 — Field coverage mapper

**Modules:**

- `web/lib/forms/lifecycle/formFieldCaptureIndex.ts` — `buildFormFieldCaptureIndex(schemaJson)`
- `web/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage.ts` — `evaluateFormsLifecycleFieldCoverage(schemaJson, contract)`

**Matching precedence (strong → weak):**

1. `field_source.crm_mapping_key` vs binding-derived CRM paths  
2. `field_source.entity_type` + `field_key` / `shared_value_key` (guardian → person)  
3. System registry id / `form_capture_keys`  
4. Forms-only alias `opportunity:interest_notes` → `opportunity_interest_notes`  
5. Label token match — **`matchKind: label_weak`**, blocked across entities (guardian field cannot satisfy `child:*`)

**OR constraints:** `constraints[].kind === "at_least_one"` — satisfied when any listed rule id matches a form field (e.g. `person:email` **or** `person:phone`).

**Readiness:** `ready === true` when all **required** items are `satisfied` and all constraints pass. **`unknown`** required items do not block (custom org rules). Recommended gaps never block.

**Guardrails preserved:**

- `guardian_full_name` does **not** satisfy `person:first_name` / `person:last_name`
- Custom `entity_type: custom, field_key: unmapped` never satisfies lifecycle rules
- Lifecycle hub `enrollmentProcessFormCoverage.ts` left unchanged (future: delegate to new mapper)

### Mapping doctrine (implemented)

| Lifecycle rule | Form capture |
|----------------|--------------|
| `person:first_name` | `guardian_first_name`, `crm_mapping_key: guardian.first_name` |
| `person:last_name` | `guardian_last_name` |
| `person:email` / `person:phone` | `guardian_email` / `guardian_phone`; OR constraint for create_lead |
| `child:*` | `child_*`, enrollment registry ids, `crm_mapping_key` under child/enrollment |
| `opportunity:interest_notes` | `opportunity_interest_notes` (forms extra capture map) |

### Limitations / deferred

| Item | Card |
|------|------|
| Form Settings UI (lifecycle/stage/intent selectors + panel) | 3 |
| `lifecycle_usage_v1` on `form_definitions.metadata` | 3 |
| Publish / share readiness blocking | 4 |
| Public submit server validation | 5 |
| Location routing as coverage (link metadata, not schema) | 4–5 |
| Consolidate Lifecycle hub coverage API onto new mapper | Optional follow-up |
| `status_transition` requirement source | Not modeled yet |
| Full opportunity/tour rule coverage (`form_coverage_supported: false` rules) | Returns `unknown` |

### Test coverage (shipped)

```bash
cd web && npm run test -- \
  tests/forms/resolveFormsLifecycleRequirementContract.test.ts \
  tests/forms/evaluateFormsLifecycleFieldCoverage.test.ts
```

**17 tests** — adapter stage/intent/action-intake paths, mapper person/child/OR/weak-label/custom/unmapped/opportunity notes, Website Inquiry example.

### Example — Website Inquiry @ enrollment_lead

Schema helper: `websiteInquiryFormSchemaForCoverageExample()` in `evaluateFormsLifecycleFieldCoverage.ts`.

Contract: `resolveFormsLifecycleRequirementContract({ departmentId: "…", stageKey: "lead", intent: "enrollment_lead" })`.

**Result:** `ready: true` — satisfies person first/last name, email-or-phone via `guardian_phone` or `guardian_email`, recommended child gaps allowed.

**Next:** Card 3 — Form settings UI + optional `GET /api/admin/forms/[formId]/lifecycle-coverage`.

---

## Card 3 — Form Settings UI + Coverage Panel (implemented)

### Scope delivered

- Form Detail / Form Setup **Lifecycle Usage** section with department, stage, and intent selectors
- **Coverage** summary: Ready / Missing required fields / empty / no schema
- Entity-grouped detail rows (Person/Guardian, Child, Opportunity/Lead, Customer/Household)
- Operator-facing labels only — no raw field keys, UUIDs, or resolver internals
- **No publish blocking**, **no runtime submission blocking**, **no public submit changes**

### Metadata

Stored on `form_definitions.metadata.lifecycle_usage_v1`:

```typescript
{
  version: 1;
  department_id: string;
  stage_key: LifecycleOperatorStage;
  intake_intent: string;
  process_id?: string | null;
}
```

- `buildLifecycleUsageMetadataPatch` writes usage and keeps `metadata.intake_intent` in sync when usage is saved
- `buildOperationalIntentFormMetadataPatch` syncs `lifecycle_usage_v1.intake_intent` when operational intent changes and usage already exists

### API

**`GET /api/admin/forms/[formId]/lifecycle-coverage`**

1. Loads form definition
2. Reads `metadata.lifecycle_usage_v1`
3. Loads published schema (fallback draft)
4. Resolves contract via `resolveFormsLifecycleRequirementContract` (Card 1)
5. Evaluates coverage via `evaluateFormsLifecycleFieldCoverage` (Card 2)
6. Returns `contract`, `coverage`, `presentation` (display labels), `department_name`, `schema_source`, `configured`

**`PATCH /api/admin/forms/[formId]/lifecycle-coverage`**

- Body: `lifecycle_usage_v1` (or `lifecycle_usage`) with `department_id`, `stage_key`, `intake_intent`, optional `process_id`
- Admin-only; department scoped via access dimensions
- Persists metadata patch + returns refreshed coverage payload

### UI

- Component: `FormLifecycleUsagePanel.tsx`
- Placement: `FormIntakeRuntimeOrchestrationPanel` — after Purpose / Lead routing
- Empty state: “Select a lifecycle stage to check whether this form captures the required fields.”
- Ready: “Ready for this lifecycle stage.”
- Missing required: “Missing required fields. This form is not ready to create a Lead for this stage.”
- Expandable coverage detail grouped by entity

### New / updated modules

| File | Role |
|------|------|
| `web/lib/forms/lifecycle/formLifecycleUsageMetadata.ts` | Parse/build `lifecycle_usage_v1`, intent sync |
| `web/lib/forms/lifecycle/loadFormLifecycleCoveragePayload.ts` | Server loader for GET |
| `web/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation.ts` | Operator-facing presentation |
| `web/app/api/admin/forms/[formId]/lifecycle-coverage/route.ts` | GET + PATCH |
| `web/components/forms/admin/FormLifecycleUsagePanel.tsx` | Selectors + coverage card |
| `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx` | Embeds panel |
| `web/lib/forms/operationalIntentTemplates.ts` | Intent patch syncs lifecycle usage |

### Tests

```bash
cd web && npm run test -- \
  tests/forms/resolveFormsLifecycleRequirementContract.test.ts \
  tests/forms/evaluateFormsLifecycleFieldCoverage.test.ts \
  tests/forms/buildFormLifecycleCoveragePresentation.test.ts \
  tests/forms/formLifecycleCoverageRoute.test.ts \
  tests/forms/formLifecycleUsagePanel.test.tsx
cd web && npx tsc --noEmit
```

**25 tests** — Cards 1–2 (17) + presentation (3) + API route GET/PATCH/no-usage (3) + UI ready/missing/no-raw-keys/prefill (2+).

### Example — Website Inquiry @ enrollment_lead / lead

With lifecycle usage configured and guardian first/last + email (or phone) fields:

- **Status:** Ready
- **Person / Guardian:** First name, Last name, Phone or Email — Required — Satisfied
- Recommended child fields may show as Missing without blocking Ready

### Remaining gaps (Cards 4–6)

| Card | Gap |
|------|-----|
| **4 — Publish / share readiness gating** | Wire `coverage.ready` + missing-required warnings into publish/share UX; block or warn “ready to create lead” |
| **5 — Runtime submit validation** | Server-side check before `applyFormIntakeSafe`; reject or flag incomplete intake |
| **6 — QA + docs closeout** | End-to-end operator QA, enrollment hub alignment, sprint closeout |

**Card 4 readiness:** Logic layer (`coverage.ready`, presentation status) is ready to consume; gating hooks not wired yet.
