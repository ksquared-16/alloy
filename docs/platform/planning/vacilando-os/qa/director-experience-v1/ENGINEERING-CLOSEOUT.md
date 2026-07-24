# Director Experience V1 — Engineering Closeout

**Status:** BUILT · browser-certified end-to-end · nothing pushed/merged/promoted.
**Branch:** `agent/claude/6-vacilando-os-product-def` · worktree `wt6-vacilando-os-product-def` · server :3020.
**Builds on:** Director Intelligence V1 (the upstream preparation pipeline). This sprint added **no new intelligence** — it made the existing pipeline *usable*.

Goal delivered: the operator now experiences **conversation → preparation → review → approval → execution**, and the architecture disappears.

---

## 1. Experience audit (operated as a first-time operator)

Compiled the five example intents cold:

| Intent | Old result |
|---|---|
| Build Access & Roles V2 | OK → Ready |
| Improve Scheduling | **FAIL** `no_capability` (raw JSON) |
| Redesign Financials | **FAIL** `no_capability` |
| Communications V2 | **FAIL** `no_capability` |
| Fix runtime responsiveness | **FAIL** `no_capability` |

Leaks found (before):
- **4 of 5 intents dead-ended** at a raw `no_capability` failure — no path forward.
- **Slot-and-runtime-centric.** The mission was **tab #2 of 8** developer tabs (`work, mission, director, closeout, outputs, resources, repository, history`) inside a worker frame ("Vacilando V2 · slot 6 · Running · healthy", "End work", "Start server", "Diagnose").
- **Runtime vocabulary everywhere.** Intro copy literally read "Director retrieves the capability… the Mission Compiler assembles a Mission Package." Button said "Compile Mission." Fields showed `readiness_status`, `snapshot_id` hashes, `gap_report_id`.
- **Preparation was invisible** — one API call; no visible progression.
- **Send-back was not actionable** — a verdict named a stage but gave no button.
- **Mission list was a pill pile** of "… Implementation Proposal · Ready/Failed/Interrupted".

## 2. New Director workspace

A dedicated top-level surface (`#/director`, primary nav) — mission-first, no slot selection:
- Hero **"What should we build?"** + one intent box + **Prepare**.
- Mission cards (title, intent, verdict, status).
- `no_capability` becomes **"Director doesn't know X yet — Define & prepare."**
The operator never leaves this workspace.

## 3. Preparation timeline

A visible progression rendered on every mission: **Intent → Capability → Knowledge → Gap Analysis → Package → Approved → Executing → Accepted**, each stage carrying a state (done ✓ / current • / needs-review ! / pending ○), derived deterministically from the mission + package.

## 4. Package review experience

One panel that explains the mission in under two minutes: Summary, Capability + *why this capability*, Deliverables, Acceptance, Product decisions, References, Risks, Questions, Gap confidence, Version + diff.

## 5. Readiness redesign (operator language)

Verdicts are now operator language: **Ready · Needs Product Decisions · Needs References · Needs Acceptance Criteria · Needs Clarification · Needs Review**. Every blocker answers **Why? / What should I do? / Where do I go?** and renders a one-click button (e.g. "Open Product Definition"). An empty product definition now honestly reads **Needs Product Decisions** instead of a false Ready.

## 6. Version review

Recompiling revises the package into a new version and shows **v2 · Needs Product Decisions → Ready** plus Added / Resolved counts — the operator never rereads everything.

## 7. Send-back workflow (closes in-UI)

**Needs Product Decisions → Open Product Definition → record a decision → prepare again → readiness climbs to Ready.** Backed by real endpoints: `define-capability`, `product-decision`, `recompile`. Other blockers open the review and offer "prepare again" (honest V1 — editing Knowledge/Acceptance is not yet a workspace surface).

## 8. Natural language

No runtime names surface in the workspace. The operator sees "Director doesn't yet have the product decisions this mission depends on," not "the Product Definition Runtime is empty."

## 9. Usability findings (assessed against the Phase 9 criteria)

Evaluated the flow as someone who knows nothing of the architecture. Could they…

| Task | Result |
|---|---|
| Create a mission | ✅ one intent box, one button |
| Understand why it isn't ready | ✅ plain-language Readiness card + timeline |
| Resolve the blockers | ✅ one-click "Open Product Definition" → record → prepare again |
| Review the package | ✅ single 2-minute review panel |
| Approve it | ✅ "Approve & Send to Worker" appears only when Ready |
| Send it | ✅ governed start (preview → confirm) |

**Residual leaks (follow-ups, not blockers):**
- The proposal **file path in the package summary still contains the raw `cap_…` id** (comes from the compiler's deliverable path). Cosmetic; fix by using the capability slug in `proposalPath`.
- Send-back for **References / Acceptance / Clarification** is honest-but-thin: it opens review + "prepare again" rather than a dedicated editor. Those editors are the next slice.
- The workspace defaults a mission's target slot to 6 (where the worker will run). Surfacing "will run in <worktree>" at approval time would make that explicit.

## 10. Recommendation for Director V2

1. **Dedicated Knowledge & Acceptance editors** so *every* send-back resolves in-UI (parity with the Product Definition loop).
2. **Explicit run-target at approval** ("Approve & send to <worktree>") — make the slot a visible, chosen detail, not a hidden default.
3. **Clean the last technical leak** — capability slug (not id) in deliverable paths.
4. **Conversation history per mission** — Director's questions and the operator's decisions as a running thread, so preparation reads as a dialogue.
5. **Provider-backed Gap reasoning** behind the existing seam (when execution-in-preparation is authorized) to deepen suggested criteria and detect subtler conflicts.

---

## Verification

- `node --test scripts/local-dev/tests/mission-runtime.test.mjs` → **22/22** (was 19/19; +3).
- **Browser-certified end-to-end** on :3020 (host calm ~22): typed "Improve Reporting" (an unknown capability) → "Define & prepare" → **Needs Product Decisions** with timeline + one-click send-back → recorded one decision → **prepared again → Ready** (v2 · Needs Product Decisions → Ready). Zero console errors. Screenshots in the closeout PR / session.
- Before/after: the old slot-centric Mission tab vs the new `#/director` workspace.

## Commits (this arc)

`25798072a` experience backend (define-capability, product-decision, recompile, operator vocabulary) ·
`247620d50` mission-first workspace (frontend) ·
`7e87a4a77` polish (route-aware crumb + friendly define-banner name).

## Governance (held)

Loopback only · fixed executables · `shell:false` · **nothing pushed/merged/promoted**. "Approve & Send to Worker" runs the existing governed start (preview → confirm); no provider turn was executed during certification.
