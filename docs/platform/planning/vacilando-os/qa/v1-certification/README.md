---
owner: platform
status: sprint
last_reviewed: 2026-07-22
---

# Vacilando Project OS — V1 Certification QA

Live acceptance evidence for the end-to-end lifecycle certification. Full
write-up: [`../../CERTIFICATION-V1.md`](../../CERTIFICATION-V1.md).
Served `http://127.0.0.1:3020` (loopback). Captured by driving the live app
(`scripts/local-dev/apps/vacilando/capture-qa-cert.mjs`, Node 22).

## The success sentence — proven true

> A new project can be started, developed, reviewed, promoted, and closed from
> Vacilando **without routine Terminal usage**.

Executed through the governed command runtime against a **disposable fixture**
(`wt2-vacilando-cert-fixture`, branch `agent/claude/2-vacilando-cert-fixture`,
PR `[CERT-FIXTURE] … DO NOT MERGE`). Merge never executed; nothing promoted.

## Lifecycle — every step audited

| Step | Command | Effect | Result |
|---|---|---|---|
| Commit | `repository.commit` | empty commit | ✅ |
| Push | `repository.push` | branch → origin | ✅ |
| Draft PR | `promotion.open_pr` | PR #232 → staging | ✅ |
| Read state | `/api/pr` | `OPEN·draft·MERGEABLE·CLEAN` | ✅ |
| Merge readiness | `merge.execute` preview | exact `gh pr merge`, **not run** | ✅ |
| Close (no merge) | `promotion.close_pr` | PR #232 `CLOSED`, `mergedAt:null` | ✅ |
| Delete worktree | `worktree.delete` (typed `delete 2`) | checkout removed | ✅ |
| Free slot | archive slot record | slot 2 → available | ✅ |
| Branch cleanup | local + `origin --delete` | no residue | ✅ |

Authoritative record: [`lifecycle-audit.json`](lifecycle-audit.json).
External proof: `gh pr view 232 -R ksquared-16/alloy → CLOSED / mergedAt:null`.

## Gates proven empirically (in the audit)

- **Confirm gate:** open_pr / worktree.delete without `confirm` → `refused`.
- **Typed-confirm gate:** wrong phrase `"delete"` → `typed_confirmation_required`;
  only `"delete 2"` executed (4 `refused` deletes precede 1 `succeeded`).

## Defects certification caught and fixed

1. `gh` rejected git's `-C` flag → commands now set a spawn `cwd`.
2. Server dropped `confirm_text` → the UI Delete button was un-completable → forwarded.
3. Teardown ordering (`worktree.delete` then `sprint.finish` can't reconcile) → V1.1 unified End Work.

## Screenshots

- `01-dashboard-slot2-freed.png` — slot 2 freed; 5/6 occupied, 1 available; scheduler recommends slot 2.
- `02-repository-governed.png` — Repository tab: PR state + governed Push/Draft PR/Merge/Delete.
- `03-policies-governed-commands.png` — governed command allowlist.
- `04-work-history-audit.png` — execution audit surface.

## Safety

Loopback only · no credentials captured · release/merge never auto-approved and
not executed · destructive ops typed-confirmed · disposable fixture only · no
active work touched · throwaway branch cleaned up (local + remote).
