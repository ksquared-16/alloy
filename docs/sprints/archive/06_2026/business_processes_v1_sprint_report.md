# Business Processes V1 Sprint Report

**Date:** 2026-06-10  
**Scope:** Operator-facing Enrollment Process — rename, builder UX, V1 stages, outcome picker, communication association.

---

## 1. Audit findings (Phase 1)

| Location | Before | After |
|----------|--------|-------|
| `/admin/settings/lifecycle` page title | Lifecycle | **Business Processes** |
| Settings hub tile | Lifecycle | **Business Processes** |
| Breadcrumb | Lifecycle | **Business Processes** |
| Catalog dropdown label | Lifecycle | **Process** |
| Create button | Create Lifecycle | **Create Process** |
| Cross-link banners | Open Lifecycle | **Open Business Processes** |
| Stage editor sections | Records in this stage / Work in this stage | **Who belongs here?** / **Expected Work** |
| Operating plan labels | Stage purpose / Completion outcomes | **Purpose** / **Success Criteria** / **Off Track Criteria** |

**Not renamed (internal):** `lifecycle_builder_v1`, API paths (`/api/admin/lifecycle-*`), component filenames, TypeScript types, metadata keys.

---

## 2. Files changed

### New
- `web/lib/lifecycle/businessProcessUiLabels.ts` — operator label source
- `web/lib/lifecycle/defaultEnrollmentBusinessProcessV1Stages.ts` — 13 V1 stages
- `web/lib/lifecycle/resolveStageWorkOutcomeContext.ts` — outcome picker resolution
- `web/lib/lifecycle/stageWorkOutcomePickerClient.ts` — client API helpers
- `web/lib/lifecycle/associateOutboundCommunicationToContactAttempt.ts` — comm auto-association
- `web/app/api/admin/lifecycle-builder/stage-work-outcomes/route.ts`
- `web/components/admin/StageWorkOutcomePicker.tsx`
- `web/tests/lifecycle/defaultEnrollmentBusinessProcessV1Stages.test.ts`

### Updated (high signal)
- `lifecycleBuilderConfig.ts` — new processes seed **Enrollment Process** with 13 stages
- `queueMembershipV1.ts` — V1 stage queue membership defaults
- `defaultEnrollmentStageOperatingPlans.ts` — V1 stage work/outcome/attention defaults
- Settings UI: page, catalog, create form, stage workspace, operating plan editor, queue membership editor
- `MyTasksPanel.tsx` / `MyTasksTaskCard.tsx` — outcome picker on Complete
- `app/api/admin/communications/send/route.ts` — contact attempt association hook

---

## 3. Business Process Builder (Phase 2)

Stage editor now presents operator language:

| Section | Operator question |
|---------|-------------------|
| **Who belongs here?** | Which families, children, or candidates appear in this stage |
| **Expected Work** | Purpose, journey, work templates, success outcomes, off-track rules |
| Statuses / Required information / Actions / Queue view | Unchanged (advanced configuration) |

Implementation jargon hidden from primary sections:
- Outcome rules (status routing) removed from visible editor — still in metadata defaults
- Queue membership described as record type + inclusion, not `queue_membership_v1`

**Screenshots:** Not captured in this session — verify in browser at `/admin/settings/lifecycle` after selecting Enrollment Process → Contacting stage.

---

## 4. Enrollment Process V1 configuration (Phase 3)

New builder processes receive **13 stages** without seed scripts:

**Family journey:** New Lead → Contacting → Qualification → Tour Scheduled → Tour Completed → Decision Pending → Closed Lost

**Child journey:** Waitlist → Offered Spot → Enrolling → Future Start → Enrolled → Withdrawn

Each stage ships with:
- `queue_membership_v1` defaults (via resolver)
- `stage_operating_plan_v1` defaults (purpose, expected work, outcomes, off-track rules)

**Contacting example (defaults):**
- Purpose: Reach the family and confirm interest
- Expected work: Contact attempt #1, #2, #3
- Success: Reached family
- Off track: Bad number, no response after 3 attempts

Existing 6-key builder processes remain supported via legacy stage key defaults.

---

## 5. Outcome picker (Phase 4)

**Flow:**
1. Operator clicks **Complete** on a lifecycle-linked task (My Tasks)
2. `GET /api/admin/lifecycle-builder/stage-work-outcomes?task_id=…` resolves stage plan outcomes
3. **StageWorkOutcomePicker** shows "What happened?" options
4. Selection calls `POST /api/admin/lifecycle-builder/complete-stage-work` → existing outcome rule execution

**Requirements for picker:** Task must have `context_snapshot.lifecycle_stage_key` and linked opportunity; stage must have configured outcomes.

**Not yet wired:** Drawer task chips (`OpportunityOperationalCompactStrip`) — still direct complete. Follow-up: same picker hook.

---

## 6. Communication association (Phase 5)

On successful `POST /api/admin/communications/send` for an opportunity (email or SMS):
- Finds open `contact_family` work in lead/contacting stages
- Completes with `sent_text` outcome via `completeStageWorkWithOutcome`
- Stamps `associated_communication_message_ids` on task metadata when message id returned

**Limitation:** Phone call logging not auto-associated. Email uses `sent_text` outcome key (no dedicated email outcome yet).

---

## 7. Attention doctrine (Phase 6)

No runtime changes — doctrine already implemented via `create_needs_attention` outcome targets and attention rules in stage plans.

Off-track criteria visible in builder under **Off Track Criteria** (from `attention_rules`). Attention does not auto-close or auto-move records.

---

## 8. Child journey split (Phase 7)

**Not validated in live QA this session.** Architecture unchanged:
- Child grain via OCM `outcome_status_key` / disposition keys
- `decision_pending` stage outcomes: Enrolling vs Waitlist per child
- Queue membership child subject type on post-tour stages

**Required manual QA:** Smith family / Emma+Noah scenario with builder routing enabled.

---

## 9. Full QA walkthrough (Phase 8)

**Status:** Not executed end-to-end in this session (requires running dev server + test org with builder routing).

**Recommended script:**
1. Create Process → Enrollment Process (13 stages appear)
2. Configure Contacting stage → save
3. Create Lead (Smith family, Emma + Noah)
4. Progress family stages through Tour Completed → Decision Pending
5. Split: Emma → Waitlist, Noah → Enrolling
6. Complete contact attempt via outcome picker + via send SMS
7. Verify queue counts, drawer focus, separate child rows

---

## 10. Remaining gaps

| Gap | Priority |
|-----|----------|
| Outcome picker in drawer operational strip | P1 |
| Live E2E QA (Smith family scenario) | P1 |
| Stage-entry work spawning (auto-create contact attempts) | P2 |
| Outcome rules editable in UI (not read-only defaults) | P2 |
| Email-specific outcome label (vs sent_text) | P3 |
| Phone call auto-association | P3 |
| Migrate existing 6-stage orgs to 13-stage V1 | P2 (optional migration tool) |
| Builder routing env flag still required for queue membership runtime | Known |

---

## 11. Recommended follow-up sprint

**Business Processes V1.1 — Runtime validation**
1. Wire outcome picker to drawer task chips
2. Execute documented Smith family QA with builder routing on
3. Stage-entry work instantiation for Contacting (contact attempts spawn on stage entry)
4. Child split UX in Decision Pending (per-child outcome selection)
5. Attention surfacing copy: what is wrong / what decision is needed

---

## Validation

```bash
cd web && npm run test -- \
  tests/lifecycle/defaultEnrollmentBusinessProcessV1Stages.test.ts \
  tests/lifecycle/lifecycleBuilderConfig.test.ts \
  tests/lifecycle/lifecycleStageQueueMembershipUi.test.ts \
  tests/lifecycle/lifecycleStageOperatingPlanUi.test.ts \
  tests/lifecycle/stageOperatingPlanV1.test.ts \
  tests/lifecycle/executeStageOperatingOutcome.test.ts
```

Run `cd web && npx tsc --noEmit` before merge.

---

## Suggested commit message

```
Reframe lifecycle builder as Business Processes with Enrollment V1 stages and outcome picker.

Operators see process language in settings; new enrollment processes seed 13 stages with work/outcome defaults. Task completion and outbound email/SMS can route through stage operating plan outcomes.
```
