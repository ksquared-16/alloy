---
owner: platform
status: proposed
last_reviewed: 2026-08-05
audience: product · directors · implementation leadership
constraint: milestone record only — no new implementation charter
---

# Director Experience V2 — Phase 1 Complete

**Closed:** 2026-08-05  
**Staging merge tip:** `374fad991` (DX-8 via PR #344)  
**Certified source tip (unchanged history):** `4ee73d7bd` on `agent/cursor/6-director-experience-dx8-command-center`  
**Canonical spec:** [`DIRECTOR-EXPERIENCE-V2.md`](DIRECTOR-EXPERIENCE-V2.md)  
**Evidence index:** [`qa/director-experience-v2/README.md`](qa/director-experience-v2/README.md)

Phase 1 is the presentation-layer arc that made Vacilando Mission Control readable and operable for a Director across **one mission** and then **many missions** — without redesigning lifecycle, workers, certification, confidence math, or evidence storage.

---

## 1. Completed capabilities

| Slice | Capability | Staging promotion |
|---|---|---|
| DX-1 | Executive Overview (Mission Outcome + L1 hierarchy) | earlier |
| DX-2 | Explained Confidence | earlier |
| DX-3 | Director Decision Cards | earlier |
| DX-4 | Mission Journey | earlier (#335) |
| DX-5 | Evidence Experience | #340 |
| DX-5.5 | Mission Continuation | #341 |
| DX-6 | Director Collaboration | #342 |
| DX-7 | Director Portfolio | #343 |
| DX-8 | Executive Command Center | #344 |

Together these form three layered responsibilities:

- **Mission page** — What is happening here?
- **Portfolio** — Where should I look across everything?
- **Command Center** — What can I do right now?

---

## 2. What changed from the original Mission Control experience

**Before Phase 1**, Mission Control read primarily as an ops console: dense status, workers, dual confidence signals, engineering-adjacent surfaces, and vague primaries (“Review outcome”) competed with the executive question.

**After Phase 1**, the default Director path is:

1. Open Vacilando → **Portfolio** answers attention (counts, groups, focus).
2. **Command Center** answers action (deterministic lanes + one primary action per card).
3. Open a **mission** only when depth is needed — Outcome, explained confidence, journey, evidence, continuation, collaboration.

Presentation adapters own aggregation and language. Engines underneath were not rewritten.

---

## 3. Executive workflows now supported

A Director can, without inventing new lifecycle states:

- Understand a single mission’s outcome, confidence, and next step in ~30 seconds.
- See why confidence is high or at risk, with supporting / reducing / uncertainty language.
- Choose among explicit decision cards (advance, continue discovery, park, close).
- Follow the mission journey (phases + gates) without digging engineering history first.
- Review evidence as a screenshot-first gallery with before/after pairing and sufficiency language.
- Act on a recommended next action and presentation alternatives (findings, feedback, close without continuing).
- Leave durable collaboration notes (feedback, guidance, revision requests, approval notes) — not chat.
- Scan many missions via Portfolio groups (needs attention, blocked, ready to implement/promote, waiting, recently finished).
- Take highest-priority actions from the Command Center using existing mission actions (approve implementation, review certification, resolve blockers, promote/close paths, open decisions).

---

## 4. Remaining known limitations

These are accepted Phase 1 boundaries, not open defects requiring immediate code:

- Home latency still grows with mission count (posture projection per mission; enrichment capped on focus/actionable cards).
- Some promotion/implementation fixtures surface `recheck_deliverable` until certification briefing is ready.
- Command Center and Portfolio both list missions by design (action vs situation); Needs You inbox is not yet fully converged.
- Collaboration is append-oriented and mission-scoped — not realtime, not worker reply threads.
- Provide Feedback persistence is collaboration-store based, not a messaging system.
- Browser certification was slice-scoped; continuous multi-mission soak with production-shaped data is evaluation work, not a Phase 1 deliverable.
- Some Vacilando tests leave open handles and hang on process exit after printing ok (noise during promotion, not a Director-facing failure).

---

## 5. Roadmap items intentionally deferred

The original roadmap named further slices. **They are deferred**, not started:

| Deferred | Original intent |
|---|---|
| Remote Review | Annotated comparison / remote-ready polish |
| Mission / list / Needs You convergence | Collapse duplicate inbox surfaces with Portfolio + Command Center |
| Worker Operations | Demote worker ops further behind the executive home |
| Initiatives / mission hierarchy | Explicitly out of scope for Phase 1 |
| Notifications / scheduling / realtime | Explicitly out of scope |

Do **not** treat the deferred list as the automatic next sprint order.

---

## 6. Recommendation: evaluation period before the next roadmap

Phase 1 should be followed by a **real-world Director evaluation period**, not by mechanically continuing DX-9+.

Suggested evaluation focus (observation only):

- Can a Director clear a morning of attention in ≤15 minutes using Portfolio + Command Center alone?
- Which actions still force unnecessary mission-page deep dives?
- Where do labels or lanes confuse (especially promote vs re-check vs implement)?
- Does home feel slow with a realistic mission set?
- Is Collaboration used as institutional memory, or ignored?
- Does Needs You still compete with Command Center?

**Next roadmap should be driven by those observations** — which may reaffirm deferred items, reorder them, or introduce different presentation work. No implementation charter is opened by this milestone.

---

## 7. Evidence pointers

| Slice | Evidence |
|---|---|
| DX-1 + DX-3 | [`DX1-DX3-EVIDENCE.md`](qa/director-experience-v2/DX1-DX3-EVIDENCE.md) |
| DX-2 | [`DX2-EVIDENCE.md`](qa/director-experience-v2/DX2-EVIDENCE.md) |
| DX-4 | [`DX4-EVIDENCE.md`](qa/director-experience-v2/DX4-EVIDENCE.md) |
| DX-5 | [`DX5-EVIDENCE.md`](qa/director-experience-v2/DX5-EVIDENCE.md) |
| DX-5.5 | [`DX5_5-EVIDENCE.md`](qa/director-experience-v2/DX5_5-EVIDENCE.md) |
| DX-6 | [`DX6-EVIDENCE.md`](qa/director-experience-v2/DX6-EVIDENCE.md) |
| DX-7 | [`DX7-EVIDENCE.md`](qa/director-experience-v2/DX7-EVIDENCE.md) |
| DX-8 | [`DX8-EVIDENCE.md`](qa/director-experience-v2/DX8-EVIDENCE.md) |

Screenshots live under [`qa/director-experience-v2/screenshots/`](qa/director-experience-v2/screenshots/).

---

## 8. Closing statement

Director Experience V2 Phase 1 is **complete on staging**. The product question shifts from “build the next DX slice” to “watch Directors use this and let usage write the next roadmap.”
