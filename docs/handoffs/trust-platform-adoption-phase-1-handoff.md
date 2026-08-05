# Trust Platform Adoption — handoff into Phase 1

**Phase 0 is merged.** PR [#338](https://github.com/ksquared-16/alloy/pull/338) merged into `staging`
as **`b6927558fef1493b0b8726123abe98e57961eb3d`** on 2026-08-05. Every Phase 0 commit is an ancestor
of `origin/staging`.

**Continue in the existing worktree.** Kelly's instruction: the next session reuses this worktree and
continues the program directly. Do **not** bootstrap a new sprint slot.

| | |
|---|---|
| Root | `/Users/Kelly/Alloy` (canonical — verify with `alloy-root`) |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-trust-platform-adoption` |
| Slot / port | 1 / **3011** |
| Provider | claude |
| HEAD at handoff | `b6927558f` — **identical to merged `origin/staging`**, tree clean |
| Branch checked out | `agent/claude/1-trust-platform-adoption` (fast-forwarded past its own merge; the PR branch is spent) |
| Server | stopped. Start only if the assignment requires it. |

The branch pointer was fast-forwarded onto the merge commit so the worktree holds current code. The
Phase 0 tip is still reachable at `eb101d505` if you ever need the pre-merge state.

---

## 1. Start here

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt1-trust-platform-adoption && git fetch origin && git status -sb
```

Then create the Phase 1 branch from the current HEAD — **do not commit Phase 1 work onto the spent PR
branch**. HEAD is merged staging plus this handoff commit, so the new branch carries this document:

```bash
git checkout -b agent/claude/1-trust-phase-1-processing
```

Read, in this order:

1. `docs/platform/planning/trust-adoption/PHASE-0-CLOSEOUT.md` — what exists and why, deferrals, debt
2. `docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md` — the accepted program plan, §Phase 1
3. `docs/platform/trust/trust-platform.md`, `trust-runtime.md`, `trust-platform-decisions.md` — canonical doctrine
4. `certification/trust-runtime-v1/README.md` — the certification template every phase inherits

---

## 2. What Phase 0 delivered

Seven slices, each individually certified. Phase 0 made the Trust Runtime **adoptable**; it did not
adopt anything.

| Slice | Capability unlocked |
|---|---|
| 0.1 | `reason()` and validation call-outs may be async — the precondition for any provider-backed strategy or database-reading validator |
| 0.2 | One registry composition root over an ordered manifest; duplicate keys and dangling references fail loudly at startup |
| 0.3 | One canonical authorization decision, consumed by the three proven routes; authorization / reasoning mode / availability stay distinct axes |
| 0.4 | Expiry and supersession as append-only observations; one total, deterministic lifecycle projection |
| 0.5 | A recommendation may name a registered Operational Command with bounded intent — never an executable payload |
| 0.6 | Ten Trust metrics through the existing Operational Intelligence platform; no second analytics engine |
| 0.7 | Measured provider cost is representable and validated; invalid cost yields a refusal package, never a clamp |

**The registry still contains exactly one Decision Class** — the one Trust Runtime V1 shipped. The BOS
compatibility adapter and the execution binding contract are both dormant, with tests asserting so.

### Evidence at merge

`tests/trust` **255/255** (8 files, including Trust Runtime V1's original 41 assertions unchanged) ·
`tests/metrics/trustMetrics.test.ts` **37/37** · 14 compile-time invariants ·
`certification/trust-runtime-v1` **21/21** · `certification/trust-lifecycle-observations` **12/12** ·
`certification/trust-metrics` **9/9** · import graph **0 cycles / 199 modules** · **0**
`lib/trust` → `lib/adminV2` or `lib/platform` value dependencies.

---

## 3. Phase 1 — deterministic Processing convergence

**Objective:** `processing_source_classification` and `processing_identity_resolution` become Decision
Classes at **escalation level 0, zero egress**. Deterministic engines submit Decision Contracts and
receive Decision Packages; no provider is involved.

**This is not document understanding.** Provider-backed extraction is Phase 6, gated on privacy
tokenization (Phase 2), segmentation and the scheduler.

### Where the real code lives

Neither decision-class key exists in code yet — today they appear only in the planning documents. The
engines they will wrap are:

- `web/lib/pos/processingCase/classification/` — `classifyNonFormSource.ts`,
  `maybeClassifyProcessingCaseFromDocumentSafe.ts`, `operatorCorrection.ts`, `types.ts`,
  `processingCaseClassificationDb.ts`
- `web/lib/pos/processingIdentity/` — `canonicalResolutionEngine.ts`, `shadowComparison.ts`,
  `processingResolutionsDb.ts`, `plan/`, `sources/`, `executor/`

Existing coverage to preserve: `web/tests/pos/processingCaseClassification.test.ts` and its siblings
under `web/tests/pos/`.

### Acceptance

A **fixture-corpus diff**: classification and resolution outputs must be **byte-identical** to the
pre-migration engines. The migration must be observably a no-op in operator experience.

Carry forward the standing gates: one contract → one package · canonical runtime order · refusal
matrix · no operational mutation from `lib/trust` · structural boundary test with a negative control ·
operator reachability proven by module graph **and** a real browser.

---

## 4. Debt carried forward

Phase 0 recorded these deliberately rather than fixing them opportunistically.

1. **`AttentionSuggestionAiEnrichmentV1.provider_report.provider_key`** — a capability embeds a
   provider label inside its own `recommendation` jsonb. Pre-existing on staging. ADR-2 governs the
   *platform* contract; the platform cannot police an opaque payload it never interprets. Pinned by a
   test. **Not a platform regression.**
2. **Six `lib/trust` → `lib/ai` value dependencies**, all grandfathered from Trust Runtime V1. None
   added by Phase 0.
3. **No learning-policy registry** — `learning_policy_key: "none_v1"` is compared by magic string.
4. **`requires_allowed_feature`** on a Decision Class has zero consumers.
5. **Supersession is dual-sourced** — the observation's `superseding_package_id` and the package's
   `supersedes_package_id` can disagree with no database-level cross-check.
6. **`parseAiPolicyFromMetadata` coerces an unknown or missing provider to `stub`** when
   `enabled: true`. Pre-existing in all three routes; reproduced and pinned, not silently tightened.
7. **`cache_utilized` is hard-coded `false`** at both write sites.
8. **No writer emits** `expired`, `superseded`, or a `proposed_command` binding yet.

### Inherited test failures — do not "fix" them in a Trust PR

Three failures in the metrics/OI surface are inherited from staging, proven by running the identical
command against a worktree at the exact base commit: base **3 failed / 219 passed**, branch **3 failed
/ 256 passed**, failing set byte-identical.

`workspaceOipExposure` "enriches enrollment lifecycle cards" · `metricEngine` "tour conversion KPI via
rate_min" · `metricPacks` "covers all eleven Phase 1 metrics".

Root cause of the third: six enrollment metrics (`lead_count`, `active_leads`, `active_families`,
`new_leads`, `waitlisted`, `tour_completed_count`) are in the metric registry but in **no available
pack**. Zero Trust keys are involved. Fixing it is a presentation decision about pack membership.

---

## 5. Operating constraints proven in this program

- **Never `git stash` in this repository.** It holds 70+ foreign stashes and a lost pop cost a
  baseline once. Use `cp` to a scratch path → `git checkout --` → `cp` back.
- **`lib/trust` must contain no `.update(`** — not even inside a comment. The boundary suite scans
  source text. Use one-shot `crypto.hash`, not `createHash().update()`.
- **The project targets ES2017.** The `s` (dotAll) regex flag is a TS1501 build error; use `[\s\S]*`.
- **Local `tsc` is SIGTERM-killed (exit 144) under host load.** CI is the authority on typechecks.
- **Use unique backup filenames.** `lib/metrics/types.ts` and `lib/analytics/calculations/types.ts`
  collided in one flat scratch directory and the restore wrote the wrong contents.
- **A type-only change requires a `.test-d.ts`.** A runtime negative control *passes* against a
  reverted type because vitest strips types. See `web/tests/trust/trustCostTypeInvariants.test-d.ts`.
- **Database certification uses disposable containers.** Never take or modify another sprint's shared
  certification tenant. Never run `supabase start`; use `alloy-stack use` / `alloy-stack release`.
- **Baseline comparison technique:** `git worktree add /tmp/base <sha> --detach`, symlink
  `web/node_modules`, and remove the *symlink* before `git worktree remove --force` so the real
  `node_modules` survives.

---

## 6. Commands

```bash
alloy-root
alloy-worker-status
alloy-worker-doctor 1
alloy-dev-start          # only if the assignment needs :3011
alloy-sprint-finish 1
```

Certification:

```bash
./certification/trust-runtime-v1/run.sh
./certification/trust-lifecycle-observations/run.sh
./certification/trust-metrics/run.sh
```

Tests and lint, from `web/`:

```bash
npx vitest run tests/trust tests/metrics/trustMetrics.test.ts
```

---

## Related documents

- [`Phase 0 Closeout`](../platform/planning/trust-adoption/PHASE-0-CLOSEOUT.md)
- [`Trust Platform Adoption — Assessment and Program Plan`](../platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md)
- [`Trust Platform`](../platform/trust/trust-platform.md) · [`Trust Runtime`](../platform/trust/trust-runtime.md) · [`Trust Platform Decisions`](../platform/trust/trust-platform-decisions.md)
