# Drawer-VM Settlement — Investigation CLOSED (premise disproven)

**Status:** CLOSED (2026-07-30). **Verdict:** accepted by Kelly.
**Owner doc:** `RUNTIME-V1-CERTIFICATION-SPRINT.md`. **Predecessor:** `CP1-ENRICHED-VM-WATERFALL.md`.

> **RECORDED VERDICT (Kelly, verbatim):**
>
> "The planned drawer-VM settlement sprint is complete. The original hypothesis does not hold for the
> certified tenant. No structural optimization is justified until another surface or tenant demonstrates a
> real dependency."

**Do not reopen `scheduling`. Do not reopen `billing_preview`. Do not manufacture work because the roadmap
expected a larger optimization.**

---

## 1. The premise, and what actually measured

The sprint premise was that a large operator-visible spread (7–8 s, "first card → all cards") is caused by
non-deferred cards waiting on the enriched drawer view model, and that removing that dependency is the
dominant remaining product cost.

Measured on the certified tenant (Firefly), prod-representative, quiet host (load avg ≈ 4),
harness `web/scripts/tmp-settlementTiming.mjs`:

```
strategy=published-lanes  publishedCards=4
2553  operational-resolved                                        (op+0)
2553  settlement-pending  · What's Next · Children · Household     cells=4 reserved=1
4372  settlement-resolved                                         (op+1819)
4372  card:Billing Preview                                        (op+1819)

operational-ready : 2553 ms
settlement        : 4372 ms
GAP op->settle    : 1819 ms
cards painting AFTER operational-ready: Billing Preview only
drawer-VM responses: 1
```

Three of the four published cards are truthful **at operational-ready**. Exactly one card is late. It is
`billing_preview`, and frozen doctrine **requires** it to be late.

**The 7–8 s figure is withdrawn as a measure of this gap.** It was taken on a host at load ≈ 160 and it
measured first-card → *all* cards including background work. It is not a cold/warm-invariant property of the
settlement dependency, as the earlier reading implied.

## 2. Dependency graph — per-card classification (A–E)

Classes: **A** = truthful commit source already exists · **B** = data already in the answer, the wait is a
*policy* withholding · **C** = genuinely foundational (needs the enriched model) · **D** = deferred by
doctrine · **E** = no provider (withheld).

| Card | Class | Waits on drawer VM? | Evidence / note |
|---|:--:|:--:|---|
| `current_work` | A | no | commit truth present in the answer |
| `household` | A | no | primary assertion is answer-satisfied (`SubjectIdentityTruth` bag) |
| `children` | A | no | sourced from `related_subjects_summary` (`b4af8d883`) |
| `billing_preview` | **D** | **yes — and must** | `CARD-READINESS-LIFECYCLE.md:19,220-221`: must NOT resolve at commit; forcing it fabricated a verdict (fixed `7ce9f23e3`) |
| `tour_summary`, `communications` | C | yes | genuinely enriched-model-dependent — but authored `linked`, **never placed** |
| `milestones` | E | n/a | provider-unavailable, excluded from participation (`f413fa8c7`) |
| `scheduling` | **B** | yes | its only read is `record._inquiry_children`, which the answer already carries |

**Firefly published composition = 4 cards (`current_work`, `billing_preview`, `children`, `household`).**
Non-deferred, non-provider-unavailable, *visible* cards that wait on the drawer VM: **zero**.

**Code default composition:** exactly one — `scheduling`.

## 3. Why the one class-B item is still not promoted

`scheduling` was promoted (`cc948f1b8`) and **reverted** (`6de844554`) under the dormant-capability law.
That analysis stands and is not reopened here:

- participation is **tenant-dependent** — Firefly's published doc excludes `scheduling`, so the promotion is
  not observable on the certified tenant at all;
- the commit producer **cannot see the resolved composition** (`FocusPanelWorkModeFromAnswerInput` carries no
  composition field; the published doc arrives from a separate client fetch ~10 s later), so gating on it
  would make commit await a network hop.

The precondition test stays green for a possible re-promotion **at the Child second surface**, where
participation becomes knowable for a second real consumer.

## 4. Enriched producer — a real structural fact, with no visible cost

The enriched path performs a **whole-model swap** (`OpportunityFocusPanelBody.tsx:68-96`), not a merge. That
sounds like it should cause churn. It does not: the four shared cards are **byte-identical** across the swap
because both paths call the same builder functions. Recorded so a future reader does not re-derive it as a
defect.

## 5. What would justify reopening

- another **surface** (Child is next) whose commit-critical cards genuinely need enriched data, or whose
  composition makes a class-B card visible; or
- another **tenant** whose published composition places a class-B or class-C card; or
- a measurement on a quiet host showing a non-deferred visible card painting materially after
  operational-ready.

None of those exists today.

## 6. Artefact

`web/scripts/tmp-settlementTiming.mjs` — per-card first-truthful-paint relative to the
`data-focus-panel-operational` / `data-focus-panel-settlement` markers. Retained: it is the measurement that
distinguishes "settlement is slow" from "one doctrine-deferred card rides settlement", and the next surface
needs exactly that distinction.
