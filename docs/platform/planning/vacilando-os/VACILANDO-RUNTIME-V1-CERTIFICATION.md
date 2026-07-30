---
owner: platform
status: certified
last_reviewed: 2026-07-30
---

# Vacilando Runtime V1 Certification

**Certification date:** 2026-07-30  
**Verdict:** Certified for operational validation and real Claude-driven mission execution.

This record closes Vacilando Runtime V1. It does **not** claim Alloy product production readiness for Access & Identity V2, nor that every host edge case is extinguished. It certifies that the Mission Control runtime has proven an end-to-end Claude execution chain under operator control.

---

## Runtime version / commit range

| Field | Value |
|---|---|
| Worktree | `wt6-vacilando-os-product-def` |
| Branch | `agent/claude/6-vacilando-os-product-def` |
| Certification tip (pre-closeout) | `2b21dab82` — finish Claude Provider V1 operational closeout |
| Authoritative capability commits | `215018d6d` → `f645347e4` → `2b21dab82` (Claude sessions, desktop hardening, operational closeout) |
| Control plane | `http://127.0.0.1:3021` (Vacilando.app-owned) |
| Provider | Claude via execution sessions (`VACILANDO_EXECUTION_PROVIDER=auto` → Claude) |

Closeout archival / Mission History / artifact organization commits land on top of this tip; see git history on the same branch.

---

## Certified capabilities

Truthfully validated in live operation (not aspirational):

| Capability | Status |
|---|---|
| Mission Brief intake | Validated |
| Director interpretation | Validated |
| Readiness and kickoff | Validated |
| Assignments | Validated |
| Mission Dashboard | Validated |
| Needs Me | Validated |
| Decisions | Validated |
| Timeline | Validated |
| Evidence | Validated |
| Continuous Improvement | Validated |
| Provider selection (auto → Claude; mock gated) | Validated |
| Claude execution sessions | Validated |
| Progress and heartbeats | Validated |
| Completion packages | Validated |
| Restart recovery (orphan Claude stop + resume path) | Validated |
| Claude session resume | Validated |
| Sequential deliverable dispatch | Validated |
| Archival history (Mission History; read-only) | Validated at closeout |

---

## Validated mission and session ids

### Primary live certification mission

| Field | Id |
|---|---|
| Mission | `msn_e9133cdade883793d2` — Access & Identity V2 — Operational Closeout |
| Session (inventory, resumed after restart) | `exs_49ae17dbf6eb5a7d` |
| Session (canonical model) | `exs_26ae795e96267ae2` |
| Session (implementation / QA sequence) | `exs_6bc03dfb3e0bd209` |

### Related validation / certification missions (archived at closeout)

See [`qa/runtime-v1-closeout/archived-mission-inventory.json`](qa/runtime-v1-closeout/archived-mission-inventory.json). Notable ids:

- `msn_dc854bba07cc2046b2`, `msn_7782d3e37dfeebd871`, `msn_98c60def0cde1973a4` — Access & Identity V2 proof runs  
- `msn_d34d658b3d39c91781` — Director certification mission  
- `msn_ecdb02e437bd467813` — Access & Identity V2 Demo  
- Earlier Access & Roles V2 phase missions — superseded drafts  

All are **archived, not deleted**.

---

## Restart / recovery result

- Vacilando.app restart stopped orphan Claude CLI PIDs rather than pretending reattach.  
- Resume used recovery / `--resume` paths for the interrupted inventory session (`exs_49ae17dbf6eb5a7d`).  
- Desktop ownership of `:3021` and forced `auto` provider resolution prevent parent-shell `mock` poisoning of Finder-launched builds.

---

## Provider used

**Claude** (execution connector / execution sessions), selected through desktop `auto` resolution. Mock remains available only under explicit dual-auth desktop test paths — not everyday Vacilando.app.

---

## Evidence summary

- Live deliverables under [`qa/access-identity-v2/`](qa/access-identity-v2/) (inventory, model, QA sequence, live-run JSON, operational closeout report).  
- Product-source copies under [`docs/platform/planning/access-identity-v2/`](../access-identity-v2/).  
- Artifact classification manifest: [`qa/runtime-v1-closeout/access-identity-artifact-manifest.json`](qa/runtime-v1-closeout/access-identity-artifact-manifest.json).  
- Continuous Improvement observations retained and filterable (Active / Archived / All).  
- Timeline, decisions, evidence, workers, and execution sessions preserved on archived missions.

---

## Known limitations

- Mission Control UI still evolves from operational evidence; Dashboard V1 is “feature complete enough,” not frozen forever.  
- Some recovery and resume paths still surface operator-facing friction (recorded as Improvements).  
- Host resource pressure and long Claude sessions can require restart; recovery is honest, not invisible.  
- Browser automation / screenshot capture is unreliable in agent environments — manual routes remain authoritative for visual proof.  
- This certification is for **Vacilando runtime operation**, not for shipping Access & Identity V2 product changes.

---

## Remaining non-blocking defects

Captured as Continuous Improvement observations on archived validation missions (not deleted). Themes include:

- External Node processes chaining dispatch under mock provider  
- Orphan Claude CLI after app restart (mitigated; still monitor)  
- Parent-shell `VACILANDO_EXECUTION_PROVIDER=mock` inheritance (mitigated in desktop)  
- Occasional need for Terminal during closeout edge resets  
- Workspace git-status evidence attaching unrelated dirty files  
- Older Mission Control copy gaps (worker naming, purged mission ids, buried certification incompleteness)

Filter Improvement Center → **Archived missions** to review.

---

## Authoritative commits

```
215018d6d feat(vacilando): Claude execution sessions with live Access & Identity deliverable
f645347e4 feat(vacilando): harden Claude execution for everyday Vacilando.app use
2b21dab82 feat(vacilando): finish Claude Provider V1 operational closeout
```

Plus subsequent Runtime V1 closeout commits (mission archive, Mission History, artifact manifest, this certification record, packaged Vacilando.app install).

---

## Post-certification operating posture

- Active Missions starts empty of validation clutter.  
- History is available via **Mission History**.  
- No Access & Identity production mission is seeded.  
- The operator creates the real **Access & Identity V2** mission through Mission Brief → Director interpretation → Readiness → Approval → Execution.

**Language for external reference:**  
“Vacilando Runtime V1 is certified for operational validation and real Claude-driven mission execution.”
