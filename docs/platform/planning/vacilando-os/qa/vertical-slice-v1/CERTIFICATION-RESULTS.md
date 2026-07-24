# Vertical Slice V1 — Certification Results

Live end-to-end certification of the Vacilando operating model:
**Kelly → Mission Intent → Director → Capability → Knowledge → Mission Compiler →
Mission Package → Kelly Approval → Worker → Provider → Outputs → Acceptance.**

- Date: 2026-07-23
- Worktree: `wt6-vacilando-os-product-def` (branch `agent/claude/6-vacilando-os-product-def`)
- Server: `http://127.0.0.1:3020`
- Capability: `cap_access_roles` (Access & Roles, seeded, maturity=mature)
- Certification mission: "Build Access & Roles V2" → compiled to an
  **Implementation-Proposal** mission (bounded, source-safe)
- Accepted mission: `msn_a47b9aded72c70955f` · package `pkg_92244e354b6d2d7020`
- Provider session: `01705ac0-7e2f-4659-a531-5f1f434bb318` (persisted, resumed)

## Proof matrix

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Start returns in < 1s | **PASS** | `START returned in 7 ms` |
| 2 | Appears immediately as Starting | **PASS** | start → `{status:"starting"}`; projected within the same second |
| 3 | Advances to Running | **PASS** | `status=running phase=running`; live stream activity ("read the RBAC routes…") |
| 4 | Browser refresh does not interrupt/hide | **PASS** | durable append-only store; survived 2 full server restarts; mission list re-renders after reload |
| 5 | Navigate away & back; mission remains | **PASS** | missions projected from `/api/missions`; 6 missions persist in the Slot-6 Mission list |
| 6 | Runs beyond the old 600s failure | **PASS (model)** | old hard 600s SIGKILL removed; per-turn max **30 min** + 5 min inactivity, mission spans multiple turns with no lifetime cap. (This cert's turns finished in ~2–3 min; the 600s ceiling no longer exists.) |
| 7 | Provider session ID persisted | **PASS** | `provider_session_id=01705ac0-…` captured from first stream frame, persisted immediately |
| 8 | Proposal stored as an expected output | **PASS** | `cap_access_roles-v2-proposal.md` (21,568 bytes, sections 1–7 + Appendix) + 2 durable turn outputs |
| 9 | Provider does not implement (package excludes it) | **PASS** | `git status` after the run: only `docs/.../vertical-slice-v1/` changed; **no source files touched** |
| 10 | Ends waiting_for_operator or completed | **PASS** | run 1 → `waiting_for_operator` (write denied, honest escalation); run 2 → `waiting_for_acceptance` (completion claim) |
| 11 | Follow-up instruction resumes same mission | **PASS** | steer → `resumed:true`, turns 1→2, **same session** `01705ac0…`, appended `## 7. Open Questions` with full prior context |
| 12 | Server restart restores honest resumable/interrupted state | **PASS** | killed server mid-run → restart log `recovered 1 interrupted mission(s) (1 resumable)`; status `interrupted`, session `9add3784…` preserved; never faked "running" |
| 13 | No push / merge / promotion | **PASS** | HEAD on no remote branch; no push/merge in reflog; 2 local commits only |

## Acceptance Runtime evaluation (the real gate)

Gate: **needs_operator** (all objective criteria met; one requires human judgment).

| Criterion | Status | Evidence |
|---|---|---|
| AC1 — proposal file exists | met | 21,568 bytes at the declared path |
| AC2 — all required sections present | met | Current-State, V2 Scope, Data Model, Acceptance Criteria, QA Plan, Rollout |
| AC3 — no source changed | met | only the allowed docs path changed (git-attributed vs a mission baseline) |
| AC4 — rejected patterns not reintroduced | **operator_review** | honest — product fidelity is not machine-verifiable; advisory scan noted rp1/rp2 are cited as *rejected* |

Operator accepted → mission `completed`; capability `mission_history` updated
(the learning write-back loop, orchestrated by Director across existing runtimes).

## Notable honest behavior observed

- **Run 1 (permission-denied):** the headless provider drafted the full proposal
  but its file Write was denied by the permission layer. It reported
  `provider_completion_claim:false`, `AC1 unmet`, and emitted
  `<<VACILANDO status=waiting_for_operator>>`. The Worker Runtime **refused to
  fake completion** and escalated. Fix: run the mission turn in
  `--permission-mode acceptEdits` (bounded — file edits only), and pre-create the
  declared deliverable directory. Run 2 then produced the file and claimed
  completion → `waiting_for_acceptance` (never auto-completed).

## How to reproduce

```
node scripts/local-dev/lib/vacilando-server.mjs --port 3020   # from the worktree
# UI: open http://127.0.0.1:3020 → Slot 6 → Mission → "Build Access & Roles V2" → Compile → Start
# or API:
curl -sX POST :3020/api/missions/compile -d '{"slot":6,"intent":"Build Access & Roles V2"}'
curl -sX POST :3020/api/missions/start   -d '{"mission_id":"<id>"}'
curl -sX POST :3020/api/missions/accept  -d '{"mission_id":"<id>"}'
```
