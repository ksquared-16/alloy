# Lifecycle configuration correction pass v1

**Date:** 2026-05-31  
**Scope:** Operator-facing IA rename (Enrollment Process → **Lifecycle**), product model alignment, in-hub configuration for requirements, statuses, work units, actions, and forms.

Related: **`lifecycle_builder_architecture_reality_check_v1.md`**, **`lifecycle_field_rules_qa_proof_v1.md`**.

---

## 1. Naming / route cleanup

| Before | After |
|--------|--------|
| Settings tile “Enrollment Process” | **Lifecycle** |
| `/adminV2/settings/enrollment-process` (primary) | **`/adminV2/settings/lifecycle`** (canonical) |
| Legacy route | `/adminV2/settings/enrollment-process` **redirects** to lifecycle |
| Cross-links “Open Enrollment Process” | **Open Lifecycle** |

**Settings subtitle:** “Configure processes, stages, requirements, statuses, queues, actions, and forms.”

**Process selector:** Enrollment is the first lifecycle instance (`lifecycleProcessTypes.ts`).

---

## 2. Required Information correction

**Model:** Entity → field → Off / Recommended / Required (stored in `departments.metadata.lifecycle_progression_requirements_v1.stages.*.field_rules`).

**Removed from palette:**
- `person:email_or_phone` (deprecated composite)
- Combined “DOB or Age Group” presentation — now separate **Date of Birth** and **Age Group** fields

**UI note:** `LIFECYCLE_CONDITIONAL_RULES_NOTE` — conditional rules (“Email OR Phone”) are documented as future validation rules, not fields.

**Field sources:** Platform catalog + org `field_definitions` merge (`lifecycleFieldPaletteMerge.ts`).

---

## 3. Statuses inside Lifecycle

**Editable today (Opportunity / Lead only):**
- Status entity selector (Opportunity enabled; Person / Child disabled with “coming soon”)
- Assign / remove opportunity statuses to current stage via `/api/admin/enrollment-process/status-stages`
- Create status link → Statuses settings
- Heading: **“Opportunity statuses in this stage”**

**Not mixed:** Person and Child status mapping is not wired in this hub yet.

---

## 4. Work Units inside Lifecycle

**Today:**
- Stage card shows queue lanes, statuses feeding the queue, and mismatch warnings
- **Set up work queue** / **Map work queue** links → Work Units & Queues (`department_id` preserved)
- Advanced queue JSON remains on Work Units page only

**Not in hub:** In-stage work unit create wizard (name, department, stage, status filters) — needs safe lane writer API.

---

## 5. Actions inside Lifecycle

**Editable when `editable` prop is set (Lifecycle hub):**
- View stage actions from `/api/admin/enrollment-process/stage-actions`
- Add placement via `/api/admin/action-placements` (surface/slot: Drawer, Queue Row, Work Unit Rail, Department Rail, Workspace Rail)
- Catalog from `/api/admin/actions/definition-catalog`

**Linked for advanced:** Action Buttons settings for new definition authoring.

**Gap:** Adding a placement does not set `lifecycle_stage` on the action definition; stage inventory filter is best-effort.

---

## 6. Forms linking / coverage

**Editable:**
- Coverage rows from form schema vs stage `field_rules`
- **Link form** — PATCH `/api/admin/forms/[formId]` merges `metadata.enrollment_operator_stages` (GET-then-merge to preserve other metadata)

**Linked:** Form editor for schema changes.

**Future:** Create form from requirements.

---

## 7. Fully editable vs linked / disabled

| Area | In Lifecycle hub | Notes |
|------|------------------|-------|
| Lifecycle selector | Read-only (Enrollment only) | Create Lifecycle **disabled** |
| Department | **Editable** | |
| Primary entity | Display only (Opportunity/Lead default) | Storage not yet per-lifecycle |
| Add Stage | **Disabled** | Needs `lifecycle_stages` table/API |
| Stage tabs | **Editable navigation** | Six platform stages |
| Required Information | **Editable** | Per entity field rules |
| Statuses (Opportunity) | **Editable** | Assign to stage |
| Statuses (Person/Child) | **Disabled** | Entity selector placeholder |
| Work Unit | **Read + link out** | No in-hub wizard |
| Actions | **Partially editable** | Placements; not new defs |
| Forms | **Partially editable** | Link + coverage |
| Needs Attention | **Read + link** | Attention settings |
| BOS suggest | **Disabled hook** | Documented future |

---

## 8. QA walkthrough (target)

1. Settings → **Lifecycle** → Enrollment + Enrollment department  
2. Stage **Lead** → Required Information: Person → First Name **Required**, Email **Required**  
3. Statuses: assign/create Opportunity status for Lead  
4. Work Queue: follow **Set up work queue** to Work Units  
5. Actions: add Send Form / Add Child placement if in catalog  
6. Forms: link Lead Capture form; verify coverage partial/complete  

---

## 9. Remaining blockers for fully manual lifecycle setup

1. **`lifecycle_processes` / `lifecycle_stages` storage** — multi-lifecycle and custom stage lists  
2. **Person / Child status stage mapping** in hub (separate from opportunity `status_definitions`)  
3. **In-hub work unit wizard** writing lane filters from stage statuses without JSON  
4. **Conditional validation rules** (“Email OR Phone”, “DOB OR Age Group”)  
5. **Custom org field runtime enforcement** for non-catalog fields  
6. **Action stage scoping** on definitions (not just placements)  
7. **Primary entity persistence** per lifecycle (today enrollment defaults to Opportunity)  
8. **Deprecate** `LifecycleStagesRequirementsHub` once all entry points use `LifecycleHubClient`

---

## Files (primary)

- `web/app/adminV2/settings/lifecycle/page.tsx`
- `web/components/adminV2/settings/LifecycleHubClient.tsx`
- `web/lib/lifecycle/lifecycleConfiguration.ts`
- `web/components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx`
- `web/components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx`
- `web/components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard.tsx`
- `web/components/adminV2/settings/enrollmentProcess/EnrollmentProcessFormsCoverageCard.tsx`
