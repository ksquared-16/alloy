# Fleet stabilization report — 2026-08-03

**Scope:** durability pass over the managed slots. No merge, rebase, or cherry-pick was performed. No product
implementation. Conflict classification below comes from read-only `git merge-tree --write-tree` probes.

**Base for all measurements:** `origin/staging @ ee44e5387`.

---

## 1. Slot durability — all six slots are remotely recoverable

Every slot branch now exists on `origin` at exactly the local HEAD.

| Slot | Branch | Remote SHA (= local HEAD) | Ahead | Behind | Merge base | Verified |
|---|---|---|---:|---:|---|---|
| 1 | `agent/claude/trust-runtime-v1` | `f2b2a16feb385b3998fee9967bd5076fec77fefc` | 8 | 97 | `b7a63e28` (2026-08-01) | ✅ |
| 2 | `feat/conversation-phase1-slice1` | `27130725a678365a3b3b3e0f9b8e1c59c0302720` | 0 | 115 | `27130725` | ✅ |
| 3 | `agent/claude/3-runtime-bp-convergence` | `8973febcd4653280763650e7b885063c17fcc23e` | 44 | 194 | `935f233c` (2026-07-30) | ✅ |
| 4 | `agent/claude/4-phase7-slice3-participant-runtime` | `709c442c0df3130fb918c5a6f11a92a76dd9933b` | 66 | 174 | `294a1139` (2026-07-30) | ✅ |
| 5 | `agent/claude/5-docker-stack-containment` | `100cdc77797eb3bf6dd8f8427bcd5f0acfccd4ca` | 5 | 0 | `ee44e538` (2026-08-03) | ✅ |
| 6 | `agent/claude/6-bp-config-integrity` | `0d8d4114e816a1ac7c05b4b47200aa39e06e5407` | 28 | 169 | `77ac3e68` (2026-07-30) | ✅ |

Slots 1, 3, 4 and 6 were stopped after their branches were durable, each passing the new finish gate with a
`DURABILITY_VERDICT=pass`. Slot 5 remains active (this sprint).

### Slot 2 — contradiction resolved

The notes claimed 25 unpushed commits. Git disagrees, and Git is right:

- local HEAD `27130725a` is **identical** to `origin/feat/conversation-phase1-slice1`
- `git merge-base --is-ancestor HEAD origin/staging` → **true**

The branch is **fully contained in `origin/staging`** — that work was completed and merged. It reads as "115 behind"
only because staging advanced afterwards. There are no local-only commits, no divergence, and nothing to recover.
The note was stale; the branch is **done**, not paused.

### Ownership domains and known gaps

| Slot | Primary domains (files changed vs merge base) | Tests run this pass | Known gaps |
|---|---|---|---|
| 1 | `web/lib/trust` (20), `docs/platform` (16), `web/lib/ai` (6), `web/tests/trust` (3) — 62 files | none | Not re-run against current staging; certification dir `certification/trust-runtime-v1` present but unverified here |
| 2 | — (merged) | none | none — superseded |
| 3 | `web/lib/lifecycle` (24), `web/tests/lifecycle` (11), `web/lib/runtime` (9), `docs/runtime` (9) — 116 files | none | 194 behind; convergence handoff assumes a base 4 days stale |
| 4 | `web/lib/pos` (31), `web/tests/pos` (17), `web/app/adminV2` (14), `web/lib/fields` (12) — 125 files | none | Largest divergence (66 commits, 125 files) on a 174-commit-stale base |
| 5 | `scripts/local-dev` (4), `scripts/processing` (2), docs, certification — 12 files | 32/32 containment cert; 21/21 durability gates | Toolkit installed from this branch, not staging (see §2) |
| 6 | `certification/*` (70), `web/lib/lifecycle` (25), `web/components/adminV2` (18) — 220 files | none | Only branch with merge conflicts; `getDraftPlan()` defect noted in prior handoff still open |

No test suites were executed during this pass. Running them would require rebasing onto current staging, which was
explicitly out of scope. "Tests run" is therefore recorded as **none** rather than inferred from stale evidence
directories.

---

## 2. Toolkit ownership — fixed

`~/bin/alloy-dev` symlinked into `wt6-bp-config-integrity/scripts/local-dev`, and two commands inside it
(`alloy-engineering-doctor`, `alloy-worktree-prune-merged`) symlinked into `wt6-vacilando-os-product-def`. The
machine-wide toolkit was owned by two **active** sprint worktrees.

Now: `~/bin/alloy-dev` → `~/.local/share/alloy/toolkit/current` → `<commit-sha>/`, extracted from the canonical
object store with `git archive`. 0 symlinks and 335 real files in the tree; 0 commands lost against the previously
live toolkit; 2 gained. `alloy-toolkit verify` asserts the invariant and fails when a worktree symlink is planted.

**Open item:** installed from `origin/agent/claude/5-docker-stack-containment`, not `origin/staging`, because the
lease-release wiring and durability gates are not in staging yet. Run `alloy-toolkit install origin/staging` after
this branch merges.

---

## 3. Local-only commits — the real exposure

Slot branches are safe now. The wider repository is not.

| Measure | Count |
|---|---:|
| Local branches | 330 |
| Remote branches | 275 |
| Local branches with **no** remote counterpart | **171** |
| …of those, branches carrying commits unreachable from `origin/staging` | **79** |
| **Commits existing only on this machine** | **880** |
| Stashes (repo-global, shared by every worktree) | **65** |

The 880 figure **excludes** the six slots, which are now durable. Largest concentrations:

| Branch | Local-only commits |
|---|---:|
| `pre-rebase-backup-p5` | 74 |
| `backup/proc-identity-pre-rebase-1bcbe4312` | 69 |
| `backup/pre-merge-config-discovery-v1` | 62 |
| `backup/pre-rebase-config-discovery-v1` | 60 |
| `comms-promotion-staging` | 29 |
| `agent/claude/objective-m6-effects-and-slice` | 28 |
| `agent/claude/objective-m5-contributions` | 26 |
| `agent/claude/objective-m3-activity-envelope` | 25 |
| `agent/claude/objective-m4-requirement-instances` | 24 |
| `agent/claude/objective-platform-promotion` | 24 |

Roughly 190 of the 880 sit on the seven `agent/claude/objective-*` branches, which look like a coherent unpushed
programme rather than debris. The `backup/*` and `pre-rebase-*` branches (265 commits) are by name safety copies
taken before rebases — probably redundant, but that is not safe to assume without inspection.

**The 65 stashes are the sharpest risk.** Stashes are repo-global: every worktree shares one stack, so
`git stash pop` in one slot can pop another slot's work. They span 2026-01-23 to 2026-07-28, and one holds 229
files. They are invisible to every durability check, including the new one.

**These were not pushed.** Pushing 171 branches would nearly double the remote (275 → 446) and is a judgement call
about what deserves to persist. Recommendation: push the ~23 `agent/*` branches carrying real work as
`archive/<name>` refs, triage `backup/*` separately, and convert the stashes to branches before touching them.

---

## 4. Fleet integration order and method

Conflict data from read-only `merge-tree` probes against `origin/staging`.

| Order | Slot | Branch | Classification | Method |
|---:|---|---|---|---|
| 1 | 5 | `5-docker-stack-containment` | **Ready for direct rebase** | 0 behind, clean probe, certified 32/32. Merge first — it carries the toolkit and durability gates everything else depends on. |
| 2 | 1 | `trust-runtime-v1` | **Ready for direct rebase** | Clean probe, only 8 commits, base 2 days old, tightly scoped to `web/lib/trust`. Cheapest real integration. |
| 3 | 3 | `3-runtime-bp-convergence` | **Requires conflict-aware rebase** | Probe is clean, but 194 behind with 24 files in `web/lib/lifecycle` — the same area slot 6 rewrites. Rebase before slot 6, re-run lifecycle tests. |
| 4 | 6 | `6-bp-config-integrity` | **Ordered cherry-pick slices** | Only branch with real conflicts (11 files), **all in `scripts/local-dev`** — the toolkit it was hosting. Take the `certification/*` and `web/lib/lifecycle` slices; drop its `scripts/local-dev` commits, which slot 5 supersedes. |
| 5 | 4 | `4-phase7-slice3-participant-runtime` | **Blocked pending product decision** | Largest divergence: 66 commits, 125 files, 174 behind, spanning `web/lib/pos`, `web/app/adminV2`, `web/lib/fields`, `web/lib/forms`. Probe is clean but that is a snapshot; a 4-domain change on a 174-commit-stale base needs a scope decision before mechanical integration. |
| — | 2 | `feat/conversation-phase1-slice1` | **Superseded by staging** | Already an ancestor of `origin/staging`. No action. Delete the local branch when convenient. |

**Recommended sequence:** 5 → 1 → 3 → 6 → 4, with a decision gate before 4.

Rationale for the ordering: slot 5 lands the enforcement everything else is measured by; slot 1 is the cheapest
proof the pipeline works end to end; slot 3 must precede slot 6 because both rewrite `web/lib/lifecycle` and slot 3
is the older base; slot 6 is cherry-pick rather than rebase because its conflicts are entirely in a directory whose
ownership has moved; slot 4 is deferred because its size is a product question, not a merge question.

---

## 5. Lifecycle enforcement now in place

`alloy-sprint-finish` fails closed unless **all** hold: clean tree · upstream tracking branch · HEAD present on
origin at the same SHA · zero unpushed commits · Docker lease released · no live managed processes · toolkit not
resolving through a worker worktree. Ahead/behind and merge base are recorded as `DURABILITY_*` evidence either way.
There is **no override flag** — a machine-only branch is never a finished sprint.

`alloy-sprint-start` gates integration debt: ≥50 behind warns, ≥100 blocks until a decision is recorded at
`$ALLOY_RUNTIME_ROOT/reconciliation/<worktree>.decision`.

**Consequence to expect:** slots 3, 4 and 6 are 169–194 behind. Restarting sprints on them will now be **blocked**
until a reconciliation decision is written. That is intended, and it is why the integration order above exists.

`scripts/local-dev/tests/test-git-durability.sh` — 21 assertions, every positive paired with a negative control that
plants the fault. Plus three live controls on the real machine: a machine-only commit blocks, a held lease blocks,
and a clean pushed tree passes.
