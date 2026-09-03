# 12. Implementation Roadmap — Work Items V3 (Frozen)

**Status:** FROZEN planning contract  
**Baseline branch:** `origin/staging` @ `db0276591` or later  
**No implementation in Phase 1 freeze sprint**

---

## 12.1 Phase map

| Phase | Theme | Risk | Duration |
|-------|-------|------|----------|
| **0** | Doctrine promotion | Low | 1 week |
| **1** | Terminology + Overview IA | Low | 2 weeks |
| **2** | One creation runtime | Medium | 3–4 weeks |
| **3** | Queue evolution | Medium | 3 weeks |
| **4** | Recurring work | Medium | 3 weeks |
| **5** | Projects + record-queue previews | High | 4 weeks |
| **6** | Polish + mobile | Low | 2 weeks |

---

## 12.2 Phase 0 — Doctrine promotion

**Deliverables:**
- Promote [02-canonical-platform-doctrine.md](./02-canonical-platform-doctrine.md) → `docs/platform/operator/work-items-platform-doctrine.md`
- Apply proposed amendments to existing platform docs
- Product sign-off on [13-open-questions.md](./13-open-questions.md)

**Safe:** Documentation only.

---

## 12.3 Phase 1 — Terminology + Overview (SAFE FIRST PR)

**Scope:**
- UI strings: Task → Work Item; "New task" → "Create & Ask BOS"
- Overview action cards per [10-information-architecture.md](./10-information-architecture.md)
- Event alias `adminv2:open-work-items`
- Contract test updates

**Files:**
- `WorkItemsShell.tsx`, `WorkItemsOverviewLanding.tsx`, `MyTasksModal.tsx`
- Presentation label helpers
- `myTasksModal.contract.test.ts`, `workspaceDoctrine.test.ts`

**Feature flags:** None required (presentation only).

**Breaking-change risk:** Low — copy + layout only.

**Reuse:** Existing `WorkspaceShell`, `WorkspaceCard`.

---

## 12.4 Phase 2 — One creation runtime

**Scope:**
- `WorkItemDraftV1` types + validation
- `beginWorkItemDraft` / `commitWorkItemDraft`
- Propose endpoint or Task Assist adapter
- `WorkItemCreateModal` (conversation + preview)
- BOS compact card + `work_item_create` capability
- Form demoted to Advanced tab

**Shared component extraction:**
- `WorkItemDraftPreview`
- `workItemDraftToBosProposalEnvelope`

**Feature flags (recommended):**
- `work_items_bos_create` — gates new create path; form fallback when off

**Breaking-change risk:** Medium — Task Assist paths must adapter, not break.

**Migration:** Parallel compat until flag default on.

---

## 12.5 Phase 3 — Queue evolution

**Scope:**
- `WorkspaceQueueRow` primitive
- Folders + Views rail sections
- `work_item_folders` / `work_item_views` config (schema — first migration)
- Tabbed detail + BOS summary + footer composer
- Generators sidebar counts

**Runtime-sensitive:** `MyTasksPanel.tsx` queue reveal — run AdminV2 doctrine tests.

**Feature flags:**
- `work_items_folders_v1`

**Breaking-change risk:** Low additive API query params.

---

## 12.6 Phase 4 — Recurring work

**Scope:**
- `work_schedule_templates` + materializer job
- Recurring management UI
- BOS "make recurring" on draft

**Dependency:** Phase 2 commit service.

**Breaking-change risk:** Low — new tables only.

---

## 12.7 Phase 5 — Projects + convergence

**Scope:**
- `parent_work_item_id`
- Projects folder + scoped queue
- Record-queue preview rows (read-only, open record)

**Breaking-change risk:** High — touches workspace queue semantics.

**Feature flags:** `work_items_record_preview_rows`

**Prerequisite:** Work View label API; runtime ownership map compliance.

---

## 12.8 Phase 6 — Polish

- Mobile narrow layouts
- Server-side search
- Visual regression suite
- `work_items.assign` permission

---

## 12.9 Safe first PR (frozen recommendation)

```
feat(work-items): Phase 1 terminology and Overview action cards
```

**Includes:** Copy migration, Overview composition, CTA rename, tests  
**Excludes:** Schema, BOS runtime, folders, API changes

---

## 12.10 Shared component extraction order

1. `WorkspaceQueueRow` (Phase 3 — but design in Phase 1)
2. `WorkItemDraftPreview` (Phase 2)
3. `WorkItemsFoldersViewsRail` (Phase 3)
4. `WorkItemDetailTabs` (Phase 3)

Processing and Communications adopt `WorkspaceQueueRow` in follow-on PRs — not blocking Work Items Phase 3.

---

## 12.11 Compatibility matrix

| Consumer | Phase 1 | Phase 2 | Phase 3 |
|----------|---------|---------|---------|
| Task Assist | unchanged | adapter | adapter |
| BP spawn | unchanged | unchanged | unchanged |
| Current Work | unchanged | unchanged | unchanged |
| `adminv2:open-tasks-panel` | alias added | unchanged | unchanged |
| API clients | unchanged | additive endpoints | query params |

---

## 12.12 Success criteria

- >50% creates via BOS within 90 days of Phase 2 GA
- Zero false-empty queue regressions
- 100% BP spawned rows visible with correct breadcrumb
- No duplicate checklist/outcome UI in Work Items detail

---

## 12.13 Architectural drift guards

Each PR checklist:

- [ ] Uses `operational_tasks` — no parallel table
- [ ] BOS propose does not commit without explicit approval
- [ ] Current Work boundary preserved
- [ ] No new workflow engine
- [ ] Queue changes pass runtime doctrine tests if applicable
