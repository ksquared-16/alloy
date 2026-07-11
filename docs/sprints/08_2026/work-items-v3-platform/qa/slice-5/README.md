# Work Items V3 — Slice 5B Authenticated QA Record

## Environment

| Field | Value |
| --- | --- |
| Date | 2026-07-10 |
| Branch | `feat/work-items-v3-platform` |
| Worktree | `/Users/Kelly/.cursor/worktrees/Alloy/wi3-platform` |
| Pre-closeout HEAD | `5a7494b183503e0947eff6162e15d4356f02ff47` (Slice 5A hardening) |
| Staging base | `05326e2b596ba9fd735ce2bfc33473d11ee0fc79` |
| Dev server | `http://localhost:3000` (Next.js 16, wi3-platform worktree) |
| Auth config | Copied `web/.env.local` from `/Users/Kelly/Alloy/web/.env.local` (gitignored; not committed) |
| Organization | Firefly Early Learning |
| Operator | Kelly Kurzman |
| Location context | All locations (North / South / West Campus) |

### Data available in dev org

| Fixture | Present |
| --- | --- |
| Manual operational Work Item | Yes — "Call the Kurzman family tomorrow morning." |
| Business Process stage Work Items | Yes — 2× Contact Family (Kurzman, Digan) |
| Processing case in **Needs Review** | **No** — only case is MO School Age Child Health Report in **Ready to publish** |

## Scenario matrix

| # | Scenario | Result | Notes |
| --- | --- | --- | --- |
| **Shell / Overview** |
| S1 | Work Items opens from navigation | PASS | Sidebar Work Items badge + modal |
| S2 | Overview is initial tab | PASS | |
| S3 | Overview metric-free | PASS | Action cards only; no KPI tiles |
| S4 | Create Work Item opens canonical runtime | PASS | Conversation + live preview |
| S5 | Approved Work Item terminology | PASS | No "task" in chrome |
| S6 | BOS rail + modal geometry | PASS | Unchanged AdminV2 BOS shell |
| **Queue foundation** |
| Q1 | Folders render | PASS | Inbox, All Work, Enrollment, Compliance, Projects |
| Q2 | Views render | PASS | Mine, Unassigned, Waiting, Due Today, Due Soon, Overdue, Completed |
| Q3 | Business Process source | PASS | Count 2 when open filter active |
| Q4 | Processing source | PASS (empty) | Count 0 — no Needs Review cases |
| Q5 | Unsupported sources visibly unavailable | PASS | Recurring + Communications disabled |
| Q6 | Counts include Processing projections | PASS (logic) | 0 projections in data |
| Q7 | Filters combine | PASS | Source + view + folder |
| Q8 | Scope switch clears invalid selection | PASS | |
| Q9 | Search | PASS | Filters queue client-side |
| Q10 | Sort | PASS | Due date / title / recently updated |
| Q11 | Selected state stable | PASS | |
| Q12 | No stale detail flash | PASS | |
| Q13 | Overdue styling restrained | PASS | |
| Q14 | No duplicate Processing projections | NOT APPLICABLE | No projections |
| Q15 | Completed/archived Processing hidden | NOT APPLICABLE | No projections |
| Q16 | BP rows classified correctly | PASS | metadata + projected fields |
| **Detail (3 row types)** |
| D1 | Ordinary Work Item detail | PASS | Manual Kurzman call item |
| D2 | BP-generated detail | PASS | Provenance, deferred stage/outcome copy |
| D3 | Processing projected detail | BLOCKED BY DATA | No Needs Review row |
| D4 | Activity tab truthful | PASS | No fabricated history |
| D5 | Conversation tab truthful | PASS | No implied persistence |
| D6 | Related tab domain context | PASS | BP context on Related |
| D7 | Actions (Complete, Reschedule, Edit, Dismiss, Open Record, Record Outcome) | PASS (BP) | Ordinary manual item verified create path |
| **Creation runtime** |
| C1 | Valid creation — Kurzman family tomorrow morning | PASS | Due Sat Jul 11 9:00 AM, assignee Kelly, single row created |
| C2 | Clarification state | PASS | Empty draft → needs_clarification; Create disabled |
| C3 | Incremental draft mutation | PASS | Due/assignee/priority/description/related record update one draft |
| C4 | Commit failure / retry | NOT APPLICABLE | Not safely reproduced in dev |
| C5 | Cancel | PASS | No row created; preview cleared |
| **Business Process round trip** |
| BP1 | Current Work → View in Work Items → exact selection | PASS | Contact Family / Kurzman selected |
| BP2 | Work Items → Open Current Work → drawer card | PASS | Returns to same record drawer |
| BP3 | Completion refreshes all surfaces | NOT APPLICABLE | Outcome flow not executed (safe dev) |
| **Processing round trip** |
| P1 | Needs Review projects to Work Items | BLOCKED BY DATA | Dev case in Ready to publish lane |
| P2 | Provenance copy | BLOCKED BY DATA | |
| P3 | Open in Processing | BLOCKED BY DATA | |
| P4 | Resolve removes projection | BLOCKED BY DATA | |
| P5 | No operational_tasks row for projection | NOT APPLICABLE | |
| **Refresh** |
| R1 | Queue refresh after create | PASS | New manual item appears |
| R2 | Warm navigation | PASS | No false empty during load after fix |

## Defects found (authenticated QA)

| ID | Severity | Description | Status |
| --- | --- | --- | --- |
| D-5B-1 | **High** | Queue tab empty on default Mine view while Overview showed open work — fetch used `assigned_to_me` instead of nav `open` filter | **Fixed** |
| D-5B-2 | Low | BP process group label shows department UUID instead of human name | Open (catalog/config) |
| D-5B-3 | Low | Source filter + Mine without open nav filter can show misleading empty copy while header counts remain non-zero | Open (follow-up UX) |
| D-5B-4 | — | No Needs Review Processing case in dev org | **BLOCKED BY DATA** |

## Defects fixed in Slice 5B

### D-5B-1 — Queue fetch respects navigation open filter

- Added `resolveWorkspaceTasksFetchFilter(view, navigationFilter?)` in `web/lib/workItems/workItemQueueScope.ts`
- `MyTasksPanel.load()` uses combined filter; folder/source counts use merged tasks
- `MyTasksModal` sets `navFilter("open")` when opening Queue / switching tabs; clears on scope change
- Regression: `web/tests/workItems/workItemQueueFetchFilter.test.ts`

## Automated validation (Slice 5B closeout)

```bash
cd web && npm run test -- tests/workItems/   # 36 passed (11 files)
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit   # passed
cd web && npm run lint -- app/adminV2/components/MyTasksPanel.tsx app/adminV2/components/MyTasksModal.tsx lib/workItems/workItemQueueScope.ts   # passed
```

## Screenshot manifest

All captured 2026-07-10 under this directory. Screenshots 11–13 document **empty Processing projection state** because no Needs Review case exists; 12 shows authoritative Processing queue (Ready to publish case).

| # | File | Scenario |
| --- | --- | --- |
| 1 | `01-overview.png` | Work Items Overview landing |
| 2 | `02-queue-ordinary-work.png` | Queue with manual + mixed work |
| 3 | `03-queue-business-process-source.png` | Source = Business Processes |
| 4 | `04-business-process-detail.png` | BP Work Item detail |
| 5 | `05-current-work-to-work-items.png` | Current Work → View in Work Items |
| 6 | `06-work-items-to-current-work.png` | Work Items → Open Current Work |
| 7 | `07-create-conversation-runtime.png` | Create Work Item runtime |
| 8 | `08-create-needs-clarification.png` | needs_clarification state |
| 9 | `09-create-ready-preview.png` | Ready-to-create preview |
| 10 | `10-processing-source-queue.png` | Source = Processing (0 rows) |
| 11 | `11-processing-detail.png` | Empty Processing detail placeholder |
| 12 | `12-processing-case-opened.png` | Processing module — Ready to publish case (not Needs Review) |
| 13 | `13-queue-after-processing-resolution.png` | Processing source after resolution (N/A — blocked) |

## Known projection gaps (unchanged)

- Full audit Activity timeline
- Stage position / previous-next outcome ("Not projected yet" copy present)
- Work Item conversation persistence
- Waiting view semantics
- Recurring / Communications sources
- BP process display name resolution (UUID label)

## Slice 5A hardening (prior commit)

- Rebased onto latest staging
- Processing open handler, Related tab context, selection clear on projection loss
- Processing refresh dedup, merged projection counts, BP deferred copy, detail panel key reset

## Recommendation

**BLOCKED** for full "Processing round trip" exit criteria until dev/staging has a Processing case in **Needs Review**. Queue foundation, creation runtime, and BP deeplink round trip **PASS** with one high-severity fetch defect **fixed**. Integrated foundation code is merge-ready; Processing convergence QA should be re-run when fixture data exists.
