# Discovery — DX-5 Evidence Experience

**Assignment:** `asg_ff6324de8ba727` · **Mission:** `msn_f1b03d9d1997e1c1da` v1 (`4624625b87d59bcce256b0a8746e7b72`)
**Phase:** Discovery · **Date:** 2026-09-11
**Root:** `/Users/vacilando/Code/alloy-worktrees/ui-vac` — managed-worktree, SANCTIONED (canonical `/Users/vacilando/Alloy`)
**Branch:** `agent/ui-vac` @ `0b373c783` · **Base:** `origin/staging` @ `70db762eb`, **0 ahead / 654 behind**

---

## Headline

**DX-5 Evidence Experience already shipped on 2026-08-05 and has been superseded four slices over.**
There is no open DX-5 discovery question that this repository leaves unanswered. The brief that
dispatched this assignment is a placeholder tuple (Objective "Discover", Scope `a.md`,
AC1 "Done"), not a compiled DX-5 brief. See *Divergence* below.

## What DX-5 is, and where it lives

DX-5 was the **presentation-only** evidence slice of Director Experience V2 (spec
`docs/platform/planning/vacilando-os/DIRECTOR-EXPERIENCE-V2.md` §8). It shipped as one module:

- `scripts/local-dev/lib/vacilando/presentation/evidence-experience.mjs` — 650 lines, 13 exports
  (`classifyEvidenceCategory`, `pairBeforeAfter`, `evidenceExperienceCardVm`,
  `evidenceSufficiencyVm`, `executiveEvidenceStripVm`, `evidenceExperienceGalleryVm`,
  `resolveMissionEvidenceView`, …)
- Introduced by `ee2b99f9f feat(vacilando): DX-5 Evidence Experience presentation`

It is **load-bearing, not dead code** — three live consumers import it:

| Consumer | Import |
|---|---|
| `lib/vacilando/v2-api.mjs:1561` | `resolveMissionEvidenceView` (dynamic) |
| `lib/vacilando/presentation/executive-overview.mjs:25` | `executiveEvidenceStripVm` |
| `lib/vacilando/presentation/operator-views.mjs:63` | multiple |

## Slice sequence — DX-5 is four back

Every slice DX-1…DX-8 carries a written evidence doc under
`docs/platform/planning/vacilando-os/qa/director-experience-v2/`:

| Slice | Evidence doc | status | last_reviewed |
|---|---|---|---|
| DX-1–DX-3 | `DX1-DX3-EVIDENCE.md` | proposed | 2026-08-04 |
| DX-2 | `DX2-EVIDENCE.md` | proposed | 2026-08-04 |
| DX-4 | `DX4-EVIDENCE.md` | proposed | 2026-08-04 |
| **DX-5** | **`DX5-EVIDENCE.md`** | **proposed** | **2026-08-05** |
| DX-5.5 | `DX5_5-EVIDENCE.md` | proposed | 2026-08-05 |
| DX-6 | `DX6-EVIDENCE.md` | proposed | 2026-08-05 |
| DX-7 | `DX7-EVIDENCE.md` | proposed | 2026-08-05 |
| DX-8 | `DX8-EVIDENCE.md` | proposed | 2026-08-05 |

`DX5-EVIDENCE.md` records nine browser-certification scenarios, all **Pass**, and names its own
successor: *"Next slice: DX-6 — Remote Review."* DX-6, DX-7 and DX-8 all subsequently landed.

Note the whole family sits at `status: proposed` — that is the state of the *evidence docs*, not an
indication that DX-5 code is unmerged. The code is merged and imported.

## Known limitations DX-5 shipped with (still open, from its own doc)

These are the only DX-5 threads left dangling, and all were accepted at the time:

1. Live Mission 2 has no screenshot artifacts — visual proof is fixture-certified.
2. Before/after pairing requires explicit `comparisonRole` / `pairId`; no filename-based pairing.
3. Evidence gallery HTTP can be multi-second under concurrent control-plane load (local VM ~20ms).
4. Preview thumbnails need a resolvable `fileUri` under an allowlisted root.
5. No upload pipeline and no annotation.

## Divergence — escalated, not reinterpreted

The compiled brief for this assignment is a **thin placeholder tuple**:

```
Title: Discovery   Objective: Discover   Scope: a.md   AC1: Done
```

Against a **real and completed** mission name. The two do not fit together. Under the brief's own
prohibition — *"Do not reinterpret Compiled Mission intent — escalate if reality diverges"* — I did
not invent a DX-5 work item to fill the gap. I executed the literal scope (this file) and am
escalating the mismatch to the operator.

Two readings, and they need different things:

- **(a) Dispatch smoke test.** Then this file is the correct and complete output; the loop works.
- **(b) A real DX-5 brief that compiled empty.** Then the compiled mission needs to be re-issued with
  an actual objective, because nothing in the brief as delivered names the work.

I cannot tell (a) from (b) from inside the session, and the cost of guessing wrong differs sharply:
under (b), recording "DX-5 Discovery complete" against a placeholder would put a false completion on
a real mission's record.

## Constraints hit during discovery

- **`node` is blocked by the session Bash permission gate.** `node scripts/local-dev/tests/evidence-experience-dx5.test.mjs`
  returned *"This command requires approval"*. This is the session gate, not the validation broker
  and not the watchdog — no repository change fixes it, it needs operator approval. **The DX-5 test
  suite was therefore NOT executed.** All findings above are from static read of source, imports,
  git history and the committed evidence docs.
- **This base is 654 commits behind `origin/staging`.** DX-5 shipped ~2026-08-05 and is well inside
  this base, so the findings hold for DX-5 itself — but anything touching DX-5 in the last 654
  commits is invisible from here. Re-confirm against staging before acting on this note.

## Recommendation

Confirm intent before any DX-5 code work is scheduled. If real DX-5 follow-up is wanted, the five
accepted limitations above are the candidate list, and item 3 (gallery HTTP latency under load) is
the only one that looks like a defect rather than a deliberate scope boundary.
