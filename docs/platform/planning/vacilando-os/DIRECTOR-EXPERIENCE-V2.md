---
owner: platform
status: proposed
last_reviewed: 2026-08-04
audience: product · design · implementation missions
constraint: presentation layer only — do not redesign mission architecture, workers, Director runtime, evidence model, certification engine, confidence engine, or technical logging
---

# Director Experience V2 — Product Specification

**Mission:** Make the Director experience understandable to a non-technical executive in under 30 seconds, while preserving complete engineering depth underneath.

**Out of scope:** Vacilando redesign, Missions redesign, execution engine redesign. This is a **presentation-layer** specification only.

**Builds on (do not break):**

- Deliverable certification briefing V1 — [`qa/deliverable-review/CERTIFICATION-EXPERIENCE.md`](qa/deliverable-review/CERTIFICATION-EXPERIENCE.md)
- Director feedback loop (certify note / share context / request changes / re-check) — closed
- Mission Confidence engine (`mission-confidence.mjs`) — explain, do not replace
- Evidence integrity + deliverable review VMs — re-present, do not redefine semantics
- Mission posture / choices — clearer cards and hierarchy, same action kinds

**Canonical UI sources today:** `mission-control.js`, `operator-views.mjs`, `mission-posture.mjs`, `deliverable-review.mjs`, `styles.css`

---

## 0. Executive verdict

The engine works. Certification briefing already passes a one-minute executive test for a single deliverable. The **mission-level** Director experience does not.

Today, Mission Control is an **ops console**: local server, usage, relaunch, dual confidence percentages, engineering tabs, and vague primary CTAs (“Review outcome”) compete with the one question that matters — *what should I do next, and why?*

Director Experience V2 reorganizes presentation into **four summary levels**, a single **Mission Outcome** hero, **explained confidence**, **visual-first evidence**, an **executive timeline**, and **decision cards that remove ambiguity** — without changing workers, certification rules, confidence math, or evidence storage.

**Success:** A first-time Director answers in ≤30 seconds:

1. What happened?
2. Did the mission succeed?
3. How confident should I be?
4. Why?
5. What evidence supports it?
6. What decision do I need to make?
7. What happens next?

Engineers can still open Level 3–4 and Debug without friction.

---

## 1. UX critique of the current experience

### 1.1 Surfaces reviewed

| Surface | What it is today | Executive fitness |
|---|---|---|
| Missions home | “Control plane home”; list cards with posture labels | Med — usable inbox, engineering brand |
| Mission Dashboard | Long stack: strip → local app → outcome → Director → Needs Me → Current/Recent → Usage → Confidence → Timeline | Low — correct facts, wrong hierarchy |
| Mission Summary | Implicit strip (title, status, phase, deliverables, confidence %, checkpoint) | Med — dense, no outcome story |
| Current Work | Live worker activity | Med — useful when running; noise when deciding |
| Recent Progress | Filtered milestones | Med — not a narrative |
| Evidence tab | Artifact cards with Proves / criteria / path | Med–High for engineers; Low for UI missions (paths > screenshots) |
| Confidence | Mission % + band + why + factors; separate certification % | Low — two truths, unexplained math |
| Director recommendations | Assessment card + recommendation line | Med — good intent, buried |
| Decision flow | “Review outcome” + choice chips (advance / more discovery / park / close) | Med — choices exist; primary CTA is vague |
| Mission completion | Outcome panel + choices | Med — explanations help; recommendation weight weak |
| Certification | Deliverable briefing (exec summary, chips, impact) | **High** — best surface in the product |

### 1.2 Questions a Director naturally asks

| # | Question | Answered today? | Where |
|---|---|---|---|
| Q1 | What was this mission trying to do? | Partially | Title + kickoff package; not restated on return |
| Q2 | Where are we right now? | Yes | Status pill + Director “where” |
| Q3 | Did we succeed? | Partially | Deliverable cert yes; mission-level ambiguous |
| Q4 | What was discovered / built? | Partially | Cert exec summary; mission outcome often thin |
| Q5 | What risks remain? | Partially | Cert risks; mission confidence factors buried |
| Q6 | How sure should I be? | Poorly | Dual % without “the number that matters for this yes” |
| Q7 | Why that confidence? | Partially | Why bullets + collapsed factors |
| Q8 | What evidence can I trust? | Partially | Evidence tab; screenshots not primary for UI |
| Q9 | What decision is mine? | Partially | Needs Me + choices; primary says “Review” |
| Q10 | What happens if I press this? | Good on certify | Approval Impact; weaker on advance/park/close |
| Q11 | What should I do next? | Weak | Recommendation line competes with Relaunch / Local app |
| Q12 | Can an engineer prove the details? | Yes | Technical details, timeline JSON, workers tab |

### 1.3 Where engineering detail overwhelms product understanding

1. **Local Alloy app** and **Resources & Usage** sit above or beside decision content.
2. **Mission Confidence** and **Certification Confidence** both show large percentages.
3. **Relaunch worker** appears as a hero peer of certify / advance.
4. Evidence emphasizes **paths, commands, exit codes** over **visual proof**.
5. Timeline expandable **technical JSON** is one click from the story.
6. Home/branding still frames an **Engineering Operating System / control plane**.
7. Dashboard section order does not enforce a **30-second path**.

### 1.4 Prioritized product problems (impact)

| Priority | Problem | Impact if unfixed |
|---|---|---|
| P0 | No mission-level Executive Summary hero after work completes | Directors cannot answer Q1–Q7 in 30s |
| P0 | Dual unexplained confidence percentages | Trust collapse / wrong approve |
| P0 | Vague primary CTA (“Review outcome”) when a recommended action exists | Decision paralysis |
| P1 | Ops chrome (local server, usage, relaunch) competes with decisions | Executive abandons surface |
| P1 | Evidence is artifact-path-first, not screenshot/comparison-first for UI | Remote review fails |
| P1 | Timeline reads as event log, not phases + decision gates | No sense of journey |
| P2 | Four summary levels not navigable (everything on one scroll) | Cognitive overload |
| P2 | Decision cards lack effort / outputs / risks / dependencies | Soft wrong choices |
| P3 | Debug / technical history always adjacent | Habitual over-reading |

### 1.5 What already works (preserve)

- Role framing: **approve Director’s certification, not the code**
- Cert briefing: three-sentence exec summary, chips, approval impact, collapsed technical details
- Feedback loop: note, share context, request changes, re-check, conversation thread
- Needs You inbox metaphor
- Plain-language timeline headlines (Director reviewed / you certified / …)
- Posture-driven choice kinds (`advance_implementation`, `reopen_work`, `park_outcome`, `certify_completion`)
- Mission Confidence factors (implementation, evidence, QA, dependencies, worker_health, architecture) — **keep math; change presentation**

---

## 2. Director mental model

### 2.1 Who the Director is (product, not runtime)

The human Director is a **busy executive sponsor**:

- Owns outcomes and risk tolerance, not commits and exit codes.
- Reviews remotely more often than at a workstation.
- Trusts a senior partner (Vacilando Director) who has already verified work.
- Needs a clear **recommended next action** with consequences.
- Occasionally needs to go deep with an engineer — on purpose, not by accident.

### 2.2 Mental model of a mission

```
Intent  →  Plan  →  Work  →  Proof  →  Judgment  →  Next
  ↑                                              ↓
  └───────────── Director conversation ──────────┘
```

| Stage | Director thinks | Product must show |
|---|---|---|
| Intent | “What did I ask for?” | Mission purpose (one sentence) |
| Plan | “What did we agree to do?” | Phases / deliverables count (not compiler vocabulary) |
| Work | “Is something happening?” | Current phase + progress, not worker PID |
| Proof | “Show me it worked” | Evidence gallery + outcome |
| Judgment | “Do I certify / advance / park?” | Decision cards + recommended action |
| Next | “What unlocks?” | Impact line identical in spirit to Approval Impact |

### 2.3 Relationship to Vacilando Director (AI)

| Human Director | Vacilando Director |
|---|---|
| Decides | Recommends and certifies readiness |
| Approves certification | Produces certification + confidence reasons |
| Chooses next mission step | Explains options + recommends one |
| Owns risk acceptance | Surfaces remaining uncertainty |

**Do not change** this authority split. V2 only clarifies it visually.

---

## 3. Information architecture

### 3.1 Global (unchanged capability set)

Keep nav capabilities; **reframe labels** for executive default mode:

| Today | V2 default (executive) | V2 engineer toggle |
|---|---|---|
| Missions | Missions | same |
| Needs You | Needs You | same |
| Workers | *(collapse under Mission → Team)* | Workers |
| Improvements | Improvements | same |
| Settings | Settings | Settings + Debug |

Optional product mode toggle: **Executive · Builder** (persisted). Builder restores today’s density; Executive applies V2 hierarchy. Same APIs and VMs.

### 3.2 Per-mission IA

```
Mission
├── Overview          ← Level 1 Executive Summary (default land)
├── Story             ← Timeline (phases + gates; Level 2 narrative)
├── Evidence          ← Level 4 visual gallery + Level 3 technical toggle
├── Decisions         ← Open + resolved decision archive
└── Depth             ← Level 3 Technical (workers, usage, local app, raw confidence factors, logs)
```

**Dashboard today becomes Overview**, not a kitchen-sink stack.

Subnav **Workers** moves under Depth (or Builder mode only). Evidence stays first-class.

### 3.3 Layered summaries (required)

| Level | Name | Time budget | Audience | Contains |
|---|---|---|---|---|
| L1 | Executive | ≤30s | Human Director | Outcome, success, discovery, risks, decision, next |
| L2 | Product | ≤5 min | Director + PM | Scope, deliverables status, risks detail, recommendation rationale, remaining work |
| L3 | Technical | as needed | Engineer | Factors, workers, commands, files, IDs, usage, local app |
| L4 | Evidence | as needed | Director remote / QA | Galleries, before/after, diagrams, tests, logs (secondary) |

**Navigation between levels:**

- Overview always shows **L1** above the fold.
- “Read the product brief” → expands **L2** on Overview or opens Story mid-panel.
- “Technical depth” → Depth tab (**L3**).
- “See evidence” → Evidence tab (**L4**), with deep-links from L1 evidence strip (3 thumbnails).
- Breadcrumb / chip: `Executive · Product · Technical · Evidence` — selecting scrolls or switches tab; never reloads mission state.

---

## 4. Screen hierarchy

### 4.1 Mission Overview (default)

**Above the fold (fixed order):**

1. Mission purpose (one line) + status
2. **Mission Outcome** component (hero)
3. **Executive Summary** (six answers)
4. **Decision strip** — recommended action + alternatives
5. **Confidence at a glance** — explained, not a lonely %
6. **Evidence strip** — 3 primary thumbnails + “Open gallery”

**Below the fold / progressive:**

7. Product brief (L2) — collapsed accordion default-closed when a decision is open; default-open when idle/running
8. Phase progress (compact timeline)
9. Current Work (only if busy)
10. Conversation / feedback (when review open)

**Never above the fold in Executive mode:** Local Alloy app, Resources & Usage, Relaunch, weighted confidence factor tables, raw event JSON, Improve Vacilando.

### 4.2 Story (Timeline)

Phases → current location → completed → remaining → decision gates → certification → completion. Technical history behind “Show engineering history.”

### 4.3 Evidence

Gallery-first. Filters: Screenshots · Comparisons · Diagrams · Tests · Code · Logs · Other. Default filter by mission type (UI → Screenshots).

### 4.4 Decisions

Open decision cards (full spec §9). Resolved archive with what was chosen and impact.

### 4.5 Depth

Local app, workers, usage, confidence factor math, IDs, debug. Honest empty states.

---

## 5. Executive Summary specification (L1)

### 5.1 Placement

Shown **immediately** when:

- A deliverable is ready for certification
- Discovery/implementation package is ready for mission-level choice
- Mission completes or parks
- Operator returns to a waiting mission

Also shown (lighter) while work is in progress: answers Q2/Q11 only (“where” + “next checkpoint”).

### 5.2 Structure (six blocks, ≤120 words total)

| Block | Label | Copy rules |
|---|---|---|
| A | Mission | One sentence: what we set out to do |
| B | Outcome | Outcome state label + one sentence (links to §6) |
| C | Discovered / Delivered | 1–3 bullets, plain English, no paths |
| D | Risks remaining | 0–3 bullets; “None material” if empty |
| E | Your decision | One sentence naming the decision (or “None — work continues”) |
| F | Do next | Imperative matching the recommended decision card |

**Example (discovery complete, advance recommended):**

> **Mission:** Map Identity & Access V2 so Alloy can ship a coherent access model.  
> **Outcome:** Ready for implementation.  
> **Discovered:** Current auth paths; gaps vs target model; Wave 0 census complete.  
> **Risks remaining:** Two allowlisted exceptions still need remediation (tracked).  
> **Your decision:** Whether to open implementation on this same mission.  
> **Do next:** Advance to implementation — Wave 0 unlocks first.

### 5.3 Behavior

- Sourced from existing VMs (`deliverableReviewVm` exec summary, director summary, posture) — **presentation composition**, not new engines.
- No filenames, worker IDs, commit SHAs, or raw confidence math in L1.
- “How we know” link → Evidence strip / L4.
- “Why this confidence” link → Confidence panel (§7).
- Updates when posture changes; no flicker to empty (hold prior L1 until new ready — same reveal doctrine spirit).

### 5.4 Acceptance (L1)

Cold reader answers Q1–Q7 without scrolling past the decision strip.

---

## 6. Mission Outcome specification

### 6.1 Purpose

A single visual answer to: **Did this succeed, and in what sense?**

Distinct from deliverable certification headline (“Director has certified this deliverable”). Mission Outcome is **mission-scoped**.

### 6.2 States (presentation mapping — reuse posture/review facts)

| State ID | Label (hero) | When (product meaning) | Tone |
|---|---|---|---|
| `accomplished` | Mission accomplished | All accepted; mission closed successfully | Success |
| `ready_implementation` | Ready for implementation | Discovery complete; advance available | Success / forward |
| `ready_certify_deliverable` | Ready for your certification | Open deliverable review | Attention |
| `blocked_architecture` | Blocked by architecture | Director/posture signals architecture blocker | Warning |
| `needs_discovery` | Needs additional discovery | Package incomplete / reopen discovery recommended | Caution |
| `high_impl_risk` | High implementation risk | Confidence/risk band says proceed with caution | Warning |
| `operator_approval` | Operator approval required | Generic needsYou decision (non-cert) | Attention |
| `in_progress` | Work in progress | Busy | Neutral |
| `parked` | Parked | Idle by choice | Neutral |
| `needs_work` | Needs more work | Reopen recommended | Caution |
| `failed_verification` | Verification incomplete | Director cannot certify yet | Danger |
| `closed_no_impl` | Closed without implementation | Explicit close choice | Neutral |

**Do not invent new mission states in the runtime.** Map existing posture / review / confidence / advance gates onto these **labels**.

### 6.3 Visual hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  [Status glyph]  READY FOR IMPLEMENTATION               │  ← 28–32px, one line
│  Discovery finished. Implementation can start here.     │  ← 1 supporting sentence
│  Phase 2 of 4 complete · 15/15 assignments accepted     │  ← meta, muted
└─────────────────────────────────────────────────────────┘
```

- One hero label; never two competing outcomes.
- Color token by tone (success / attention / warning / danger / neutral) — use existing Vacilando palette (forest / terracotta / cream); no new purple system.
- Glyph: simple shape, not emoji spam.

### 6.4 Copy principles

- Outcome label = judgment language, not eng status (`waiting_for_operator` → “Operator approval required” or more specific state when known).
- Supporting sentence answers “so what?”
- Meta line = countable progress only.

### 6.5 Behavior

- Clicking Outcome does not navigate away; it anchors Decision strip.
- When deliverable cert is open, Outcome may be `ready_certify_deliverable` while L1 still names the wave.
- After certify, brief confirmation state then return to `in_progress` or next Outcome.

---

## 7. Confidence specification (explain, don’t replace)

### 7.1 Principle

**Keep** `mission-confidence.mjs` and certification confidence computation.  
**Change** how humans read them.

### 7.2 Dual-confidence rule (P0)

At any moment, the UI declares **one primary confidence** for the open decision:

| Context | Primary | Secondary |
|---|---|---|
| Deliverable certification open | **Certification confidence** | Mission confidence in Depth / footnote |
| Mission-level advance/close/park | **Mission confidence** | Last certification confidence in L2 |
| In progress | Mission confidence (forecast) | — |

Primary is labeled explicitly, e.g. **“Certification confidence — why you can trust this approve”**.

Never show two large peer percentages above the fold.

### 7.3 Explained confidence panel

```
┌─ Confidence ───────────────────────────────────────────┐
│  Certification confidence: High (97%)                  │
│  Recommendation: Certify W-4                           │
│                                                        │
│  Why this level                                        │
│  • Evidence covers acceptance criteria                 │
│  • Tests green (70/70)                                 │
│  • Scope matched; risks documented                     │
│                                                        │
│  What would increase confidence                        │
│  • (or “Nothing material — ready to decide”)           │
│                                                        │
│  Remaining uncertainty                                 │
│  • Allowlisted exceptions deferred to W-15             │
│                                                        │
│  By category                           [Build ▾]       │
│  Evidence ●●●●○  Tests ●●●●●  Scope ●●●●●  …         │
│  (maps existing weighted factors — visual, not table)  │
└────────────────────────────────────────────────────────┘
```

### 7.4 Rules

- Prefer **band + why** over % alone; % allowed as secondary annotation.
- “What increases it” must be actionable or explicitly empty.
- Category bars map existing factors (implementation, evidence, QA, dependencies, worker_health, architecture) — **no new scoring**.
- Collapsed by default on L1 to a one-line: `High · 3 reasons · 1 uncertainty` with expand.
- Full factor weights only in Depth (L3).

### 7.5 Overall recommendation line

Always pair confidence with a verb:

> **Recommend: Certify W-4** — confidence High because evidence, tests, and scope check out.

---

## 8. Evidence specification

### 8.1 Principle (unchanged model)

Workers produce evidence artifacts. Director certifies against them. Operator reviews **proof**, not filesystem tourism.

V2 changes **browse UX** and **priority by work type**, not storage schema.

### 8.2 When to emphasize which evidence

| Work type | Primary | Secondary | Tertiary |
|---|---|---|---|
| UI / UX | Screenshots, before/after | Short clip (future), interactive preview (future) | Logs, code refs |
| Architecture / design | Diagrams (arch, DB, flow) | Decision notes | Code refs |
| Platform / API | Test output, acceptance coverage | Code refs | Logs |
| Bugfix | Before/after screenshots + failing→passing tests | Logs | Code diffs |
| Discovery | Structured findings summary | Diagrams | File inventories |
| Data / schema | Schema/ER diagrams | Migration notes | Test output |

### 8.3 Evidence card

```
┌──────────────┐
│  [thumbnail] │  Title (plain English)
│              │  Proves: <acceptance criterion>
│              │  Kind: Screenshot · Before/After · …
│              │  Result: Passed | Failed | Informational
│              │  [Open] [Compare] 
└──────────────┘
```

Paths, commands, exit codes, producer IDs → behind **Details**.

### 8.4 Evidence gallery

- Grid of cards; lightbox with keyboard next/prev.
- Filters + kind chips.
- “Acceptance coverage” list remains but is **secondary** to gallery for UI missions.
- Empty state: “Director is waiting on proof artifacts” — never fake screenshots.

### 8.5 Before / After comparisons

- Pair artifacts tagged `before` / `after` (or explicit comparison artifact).
- Slider or side-by-side; caption states what changed in product language.
- Primary pattern for UI and bugfix missions.

### 8.6 Future remote review (evidence model for tomorrow)

Presentation contract for future producers (no engine redesign now):

| Future artifact | Role |
|---|---|
| Screenshot set | Default remote proof for UI |
| Annotated comparison | Circles/callouts on diffs |
| Recorded demonstration | Narrated walkthrough (async) |
| Interactive preview | Hosted preview link with scope note |
| Video | Same gallery slot as demo; transcript optional |

**Director remote review loop:**

1. Open mission on phone/laptop → L1 tells outcome + decision.
2. Evidence strip → gallery → approve/reject without opening IDE.
3. Request changes + share context remains the feedback path.
4. Only escalate to L3 when proof is insufficient.

---

## 9. Director Decisions specification

### 9.1 Problem to solve

Replace ambiguous primaries (“Review outcome”) and flat choice lists with **decision support**.

### 9.2 Decision card anatomy

Every open choice is a card:

| Field | Required | Source |
|---|---|---|
| Title | Yes | Choice label (clearer copy) |
| Recommended badge | If primary | Posture recommendation |
| Why Director recommends / not | Yes | 1–2 sentences |
| Estimated effort | Yes | Coarse: Minutes / Hours / Days / Unknown |
| Expected outputs | Yes | What you’ll get if chosen |
| Risks | Yes | What you accept |
| Dependencies | If any | What must be true |
| Primary button | Yes | Exact action verb |

### 9.3 Copy upgrades (same action kinds)

| Kind | V2 title | Button |
|---|---|---|
| `advance_implementation` | Start implementation on this mission | **Advance to implementation** |
| `reopen_work` / more discovery | Send back for more discovery | **Request more discovery** |
| `park_outcome` | Pause — keep mission open | **Park for later** |
| `certify_completion` (close) | End without building | **Close without implementation** |
| `certify_completion` (accept) | Accept results and close | **Accept and close** |
| Deliverable certify | Approve Director’s certification | **Certify {wave}** |
| Request changes | Send back with direction | **Request changes** |
| Re-check | Ask Director to verify again | **Have Director re-check** |

**Primary CTA rule:** The recommended choice **is** the primary button. “Review outcome” becomes a secondary link: “Read full brief” (scrolls to L2), never the only hero action when a recommendation exists.

### 9.4 Decision strip (Overview)

```
Recommended
[ Advance to implementation ]     Why · Effort: Days · Unlocks Wave 0

Other options
  Request more discovery · Park · Close without implementation
```

Expanding “Other options” reveals full cards.

### 9.5 Mid-mission decisions

Same card anatomy for Approve recommendation / Reject and provide direction. Always show **after approve** and **after reject** impact (mirror Approval Impact).

---

## 10. Timeline specification (Story)

### 10.1 Principle

Communicate **journey**, not logs.

### 10.2 Phase rail

```
Intent ✓ —— Plan ✓ —— Discovery ✓ —— [Implementation •] —— Certify ○ —— Done ○
                         ↑ you are here
```

Decision gates shown as diamonds on the rail (e.g. Certify W-4, Advance to implementation).

### 10.3 Story rows (default)

Each row: time · plain headline · one-line meaning.  
Examples (preserve existing voice):

- Director reviewed your Mission Brief
- You approved execution
- Discovery package ready for your decision
- Director verified W-4 — recommends certification
- You certified W-4 — W-5 unlocked

### 10.4 Drill-down

- “Show engineering history” reveals actor, event type, expandable technical payload (today’s JSON).
- Default Story view never auto-expands technical payloads.

### 10.5 Relation to Current Work / Recent Progress

- **Current Work** stays on Overview only while busy (live).
- **Recent Progress** merges into Story; remove duplicate dashboard column in Executive mode.

---

## 11. Engineering detail placement

| Detail | Placement |
|---|---|
| Mission purpose, outcome, decision, next | Immediate (L1) |
| Deliverable exec summary, approval impact | Immediate when cert open |
| Product scope, remaining work, risk detail | Collapsed L2 |
| Confidence why / uncertainty | Collapsed on L1; full in panel |
| Category confidence bars | Expand from L1 or L2 |
| Weighted factor table, raw scores | Depth (L3) |
| Workers, relaunch, local app, usage | Depth (L3) |
| Evidence thumbnails (3) | Immediate strip |
| Full gallery, comparisons | Evidence (L4) |
| Paths, commands, exit codes, commits | Evidence card Details / L3 |
| Timeline technical JSON | Story → engineering history |
| Improve Vacilando, diagnostics | Settings / Debug mode |
| Conversation thread | With open review (not Depth) |

**Debug mode:** query or Settings flag that re-enables today’s dense Mission Control layout for builders. Default off for Executive.

---

## 12. Wireframes (low fidelity)

### 12.1 Overview — decision moment

```
┌──────────────────────────────────────────────────────────────┐
│ Identity & Access V2                                         │
│                                                              │
│ ┌─ OUTCOME ───────────────────────────────────────────────┐  │
│ │  READY FOR IMPLEMENTATION                               │  │
│ │  Discovery finished. Implementation can start here.     │  │
│ │  15/15 assignments accepted · Phase complete            │  │
│ └─────────────────────────────────────────────────────────┘  │
│                                                              │
│ Executive summary                                            │
│  Mission · Outcome · Discovered · Risks · Decision · Next    │
│                                                              │
│ ┌─ DO THIS ───────────────────────────────────────────────┐  │
│ │ ★ Advance to implementation                             │  │
│ │   Effort: Days · Unlocks Wave 0 · Risk: tracked gaps    │  │
│ │   [ Advance to implementation ]                         │  │
│ └─────────────────────────────────────────────────────────┘  │
│ Other options ▾   Read product brief ▾   Why confidence ▾    │
│                                                              │
│ Confidence: High · 3 reasons · 1 uncertainty        [▾]      │
│ Evidence: [img] [img] [img]  Open gallery →                  │
│ Story: Intent✓ Plan✓ Discovery✓ [Impl•] Certify○ Done○       │
└──────────────────────────────────────────────────────────────┘
```

### 12.2 Overview — certify deliverable

```
┌──────────────────────────────────────────────────────────────┐
│ ┌─ OUTCOME: READY FOR YOUR CERTIFICATION ─────────────────┐  │
│ └──────────────────────────────────────────────────────────┘  │
│ Executive summary (6 blocks)                                 │
│ ★ Certify W-4 · Certification confidence High (why…)         │
│ [ Certify W-4 ]  [ Request changes ]  [ Re-check ]           │
│ Evidence strip · Conversation · Product brief ▾              │
│ Technical details ▾ (unchanged collapse pattern)             │
└──────────────────────────────────────────────────────────────┘
 Depth tab holds Local app / Usage / Workers
```

### 12.3 Evidence gallery

```
Filters: [Screenshots] [Before/After] [Diagrams] [Tests] [Code] [Logs]
┌────┐ ┌────┐ ┌────┐
│bef │ │aft │ │ui  │
└────┘ └────┘ └────┘
Lightbox: ← → · Proves · Details ▾
```

### 12.4 Story

```
Phase rail …
────────────────────────────────────────
Tue  Director verified W-4
     Recommends certification — evidence and tests passed
────────────────────────────────────────
Tue  You certified W-4
     W-5 unlocked; mission continues
────────────────────────────────────────
[ Show engineering history ]
```

---

## 13. High-fidelity interaction recommendations

1. **Motion:** Outcome hero crossfades on posture change (150–200ms); do not blank to skeleton if prior L1 exists.
2. **Focus order:** Outcome → Executive Summary → Recommended button → Other options → Confidence → Evidence.
3. **Sticky decision bar** on desktop when scrolling L2 while a decision is open (Certify / Advance remains reachable).
4. **Keyboard:** `C` focus certify/recommended (when safe), `E` evidence, `1–4` summary levels — Builder power only; document in Settings.
5. **Mobile remote:** L1 + decision + evidence strip only; Depth behind “For engineers.”
6. **Toast after decision:** One sentence impact (“W-4 accepted · W-5 unlocked”), not raw API payload.
7. **Empty/error honesty:** Keep Vacilando’s no-fake-progress rule; Outcome `failed_verification` must not look like success.
8. **Visual identity:** Stay cream / forest / terracotta; avoid generic purple SaaS / dark glow aesthetics.
9. **Certification chips:** Preserve Scope / Evidence / Tests / Acceptance / Risks; move duplicate % into explained confidence panel.
10. **Builder mode:** One toggle restores current Mission Control density for power users.

---

## 14. Implementation roadmap

Presentation-only missions. No confidence/certification/evidence engine rewrites.

| Phase | Name | Deliverables | Depends |
|---|---|---|---|
| **DX-0** | Doctrine lock | This spec accepted; mode toggle decision; primary-confidence rule accepted | — |
| **DX-1** | Overview L1 shell | Mission Outcome + Executive Summary + Decision strip; demote Local/Usage/Relaunch to Depth | DX-0 |
| **DX-2** | Explained confidence | Dual-confidence rule UI; why / increases / uncertainty / category bars from existing factors | DX-1 |
| **DX-3** | Decision cards | Effort / outputs / risks / dependencies; kill “Review outcome” as sole primary | DX-1 |
| **DX-4** | Story timeline | Phase rail + gates; engineering history collapse; merge Recent Progress | DX-1 |
| **DX-5** | Evidence gallery | Cards, filters, before/after; UI-primary screenshots; L1 strip | DX-1 |
| **DX-6** | Levels + Builder mode | L1–L4 navigation chips; Executive/Builder toggle; mobile remote layout | DX-2…5 |
| **DX-7** | Remote-ready polish | Annotated comparison hooks, preview/demo slots (UI stubs OK if producers not ready) | DX-5 |
| **DX-8** | QA + migration | Suites below; default Executive for new sessions; Builder opt-in | DX-6 |

**Suggested first implementation mission:** DX-1 + DX-3 (hierarchy + decisions) — highest executive impact.

---

## 15. Acceptance criteria

### 15.1 Thirty-second test (gate)

Given a completed discovery mission with advance available, a first-time Director who has never used Vacilando, without opening Depth or engineering history, must correctly answer:

| Question | Pass condition |
|---|---|
| What happened? | States mission purpose in own words matching L1 |
| Did it succeed? | Matches Mission Outcome label |
| Confidence? | States band or primary confidence correctly |
| Why? | Names ≥1 real reason from panel |
| Evidence? | Points to strip/gallery content (not invents) |
| Decision? | Names the open decision |
| Next? | Names recommended action |

### 15.2 Functional

- [ ] All existing posture actions still available (advance, reopen, park, close, certify, re-check, request changes, share context)
- [ ] Certification briefing content preserved (chips, approval impact, conversation)
- [ ] Mission Confidence math unchanged (snapshot fields identical)
- [ ] Certification confidence computation unchanged
- [ ] Evidence artifacts unchanged on disk; gallery is presentation
- [ ] Builder mode can restore prior dense layout
- [ ] No false empty Outcome / Evidence during load (hold prior)

### 15.3 Negative

- [ ] Two large peer confidence % not shown above the fold
- [ ] Local app / Usage not above the fold in Executive mode
- [ ] “Review outcome” is not the only primary when a recommendation exists

---

## 16. QA plan

| ID | Type | What |
|---|---|---|
| Q-30s | Human protocol | 3 cold Directors, stopwatch, script from §15.1; ≥2/3 pass |
| Q-cert | Regression | Deliverable cert still passes CERTIFICATION-EXPERIENCE one-minute table |
| Q-conf | UI assert | Primary confidence rule by context (unit on presentation helper) |
| Q-dec | Interaction | Recommended button equals posture recommendation; alternatives present |
| Q-ev | UI | UI-tagged mission defaults to Screenshots filter; before/after renders when paired |
| Q-tl | UI | Phase rail current marker matches posture phase |
| Q-depth | UI | Local/Usage/Workers absent from Overview Executive; present in Depth |
| Q-builder | UI | Toggle restores dense layout without data loss |
| Q-a11y | a11y | Focus order §13; Outcome/Decision landmarks |
| Q-mobile | Layout | Remote layout: L1 + decision + evidence usable at 390px width |
| Q-load | Runtime | No false empty on warm nav (align with AdminV2 reveal spirit for Vacilando SPA) |

Automate presentation VM tests where possible (`operator-views` composition); keep human 30s protocol as release gate for DX-6+.

---

## 17. Migration strategy

1. **Ship behind Executive/Builder toggle**, default **Builder** for one release (zero surprise for power users), then default **Executive**.
2. **Compose from existing VMs** — add `executiveOverviewVm` presentation helper; do not fork mission posture.
3. **Map Outcome labels** in one pure function from posture + review + advance gate + confidence band.
4. **Demote, don’t delete** Local app / Usage / Workers — move to Depth.
5. **Preserve URLs** where possible (`#/missions/:id`); map old “Dashboard” → Overview.
6. **Docs:** Update CERTIFICATION-EXPERIENCE residual UX items as resolved when DX-2 ships; link this spec from vacilando-os README index.
7. **No data migration** — presentation only.
8. **Rollback:** Toggle to Builder or feature flag off returns prior Mission Control render path.

---

## 18. Success criteria (mission done when)

1. Thirty-second test (§15.1) passes with ≥2 of 3 cold Directors.
2. P0 problems from §1.4 closed.
3. Engineers confirm L3/L4 still expose full depth (workers, factors, logs, paths).
4. No changes to mission architecture, workers, Director runtime, evidence storage semantics, certification rules, or confidence formulas — verified by review of diff scope.
5. Certification feedback loop and Approval Impact remain intact.
6. Product spec (this document) is the implementation brief for DX-1…DX-8; no redesign of Vacilando or Missions required to proceed.

---

## 19. Open product decisions (resolve in DX-0)

| ID | Question | Recommendation |
|---|---|---|
| OD-1 | Default mode Executive or Builder? | Builder for one release, then Executive |
| OD-2 | Keep “Workers” in top nav? | Executive: hide; Builder: show |
| OD-3 | Show % at all on L1? | Band primary; % in parentheses |
| OD-4 | Effort estimates source? | Heuristic from phase/wave metadata; “Unknown” honest default — **no new ML** |
| OD-5 | Screenshot producers for older missions? | Gallery shows what’s present; no backfill required |

---

## 20. Appendix — Director question → V2 answer map

| Question | V2 answer location |
|---|---|
| What happened? | L1 Mission + Discovered |
| Did it succeed? | Mission Outcome |
| How confident? | Primary confidence band |
| Why? | Why this level + categories |
| What evidence? | Evidence strip → gallery |
| What decision? | Decision strip / cards |
| What next? | Do next + recommended button |
| Full product story? | L2 Product brief + Story |
| Implementation detail? | Depth L3 |
| Proof artifacts? | Evidence L4 |

---

## Document control

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-08-04 | Initial complete product specification — no implementation |

**Implementation missions must cite this document and list DX phase IDs in their brief.**
