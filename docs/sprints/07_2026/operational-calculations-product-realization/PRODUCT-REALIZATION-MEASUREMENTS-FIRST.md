# Product Realization — Measurements First, Calculations Second

**Status:** Discovery only (no implementation)  
**Date:** 2026-07-28  
**Slot context:** Integration branch holds accepted architecture; this document challenges **product flow**, not architecture.  
**Architecture stance:** Accepted and out of scope for redesign.

---

## 0. The one-sentence verdict

**If a childcare director sits down for the first time, the first click should be Operational Intelligence — specifically “What do we measure?” — not Calculations.**

Everything below exists to prove or falsify that claim with operator reasoning.

---

## 1. Operator mental model

### What directors wake up caring about

Directors and enrollment/operations leads wake up with **questions and pressures**:

- Will we have seats next month?
- Which rooms are too full or too empty?
- Who is aging out / needs to move?
- Where is enrollment stuck?
- Who on the waitlist should we call this week?
- Are we out of ratio?

They do **not** wake up wanting to author a reusable formula, publish a version, or bind a consumer.

### Two mental models

| Model | Opening thought | Product center of gravity |
|-------|-----------------|---------------------------|
| **A — Calculation-first** | “I need a calculation.” | Authoring reusable math |
| **B — Question-first** | “I want to know something.” | Measurements with goals and health |

**Hypothesis (to be treated as provisional until Kelly validates with real operators):** **B is primary.** Calculations are the *means*; measurements (and the actions they provoke) are the *ends*.

Architecture already encodes B correctly under the hood:

```text
Published calculation → measurement binding → observation → target → health → history → action
```

The **product** currently *presents* A: a top-level Calculations home that invites “New calculation” before any operational question is named.

That mismatch is why the architecture feels fine and the walkthrough feels confusing.

### Alloy nouns directors should feel

| Director language | Alloy concept (behind the curtain) |
|------------------|-------------------------------------|
| What we watch | Measurement |
| How good is good enough | Target / goal |
| Are we okay? | Health |
| How has it changed? | History |
| How the number is made | Source (sometimes a Calculation) |
| What to do next | Workspace context or BOS work |

Directors should almost never need the words *version*, *binding*, *AST*, or *consumer*.

---

## 2. Exercise 1 — Operator intent (eleven questions)

For each: question asked · outcome expected · likely next action.  
**No implementation.**

### 1. Future room capacity

1. **Question:** “How many seats will Room X have on date Y?”  
2. **Outcome:** A trustworthy seat count for a named room and date — or a clear “not enough information.”  
3. **Action:** Decide offers, holds, room moves, or staffing; escalate if below a personal standard.

### 2. Future age-outs

1. **Question:** “Which children will age out of their current room/program soon?”  
2. **Outcome:** A dated list of children with ages/windows, not a single KPI chip.  
3. **Action:** Plan transitions, notify families, reserve seats in the next room.

### 3. Upcoming transitions

1. **Question:** “What moves are already planned or due?”  
2. **Outcome:** A schedule of known transition events with status.  
3. **Action:** Confirm, reschedule, or complete the transition in Workspace / BOS.

### 4. Children eligible for movement

1. **Question:** “Who *could* move now given rules and capacity?”  
2. **Outcome:** Candidates with reasons (eligible / blocked / capacity).  
3. **Action:** Select children and initiate moves; not just “note the metric.”

### 5. Ratio risks

1. **Question:** “Where are we at risk of being out of ratio?”  
2. **Outcome:** Rooms/times with risk level vs policy.  
3. **Action:** Reassign staff, freeze enrollment, or move children.

### 6. Future staffing needs

1. **Question:** “How many teachers will we need for the plan we intend to run?”  
2. **Outcome:** A staffing picture with assumptions (not a pretend-certain number).  
3. **Action:** Hire, schedule, or change program hours/capacity.

### 7. Room utilization

1. **Question:** “How full is this room vs what it can hold?”  
2. **Outcome:** Occupancy vs capacity with a sense of healthy range.  
3. **Action:** Fill empty seats, pause offers, or rebalance rooms.

### 8. Program utilization

1. **Question:** “How is this program performing across rooms/sites?”  
2. **Outcome:** Program-level fullness / demand picture.  
3. **Action:** Adjust offerings, marketing focus, or staffing by program.

### 9. Enrollment bottlenecks

1. **Question:** “Where are families getting stuck in enrollment?”  
2. **Outcome:** Stages or steps with dwell / conversion problems.  
3. **Action:** Fix process, staffing, or packet/tour friction in the pipeline Workspace.

### 10. Waitlist opportunities

1. **Question:** “Who should we offer a seat to next?”  
2. **Outcome:** Ordered candidates with policy-visible reasons.  
3. **Action:** Make / prepare offers (Placement / BOS), not “admire a chart.”

### 11. Transition recommendations

1. **Question:** “Who should we move, and what should we do about it?”  
2. **Outcome:** Suggested moves with evidence, ready to accept/reject.  
3. **Action:** Execute or dismiss in BOS / Workspace.

---

## 3. Exercise 2 — Primary owner (exactly one)

| # | Question | Primary owner | Kind | Secondary consumers |
|---|----------|---------------|------|---------------------|
| 1 | Future room capacity | **Operational Intelligence — Measurement** | Measurement (calc-backed) | Room Workspace, later dashboard |
| 2 | Future age-outs | **Operational Planning** (cohort) | Forecast / planning output | Workspace lists, BOS exceptions |
| 3 | Upcoming transitions | **Workspace** (assignment/transition truth) | Operational schedule | BOS for overdue |
| 4 | Children eligible for movement | **BOS / Assignment** | Recommendation | Workspace on room/child |
| 5 | Ratio risks | **Operational Intelligence — Measurement** | Measurement | BOS when off goal |
| 6 | Future staffing needs | **Operational Planning** | Forecast / planning | Dashboard trends |
| 7 | Room utilization | **Operational Intelligence — Measurement** | Measurement | Room Workspace, dashboard |
| 8 | Program utilization | **Operational Intelligence — Measurement** | Measurement | Program Workspace, dashboard |
| 9 | Enrollment bottlenecks | **Operational Intelligence — Measurement** (+ pipeline Workspace for drill-down) | Measurement / insight | Dashboard funnel |
| 10 | Waitlist opportunities | **Placement / Planning** | Planning output | Workspace waitlist, BOS offer windows |
| 11 | Transition recommendations | **BOS** | Recommendation → action | Workspace evidence |

**Pattern:** Questions that answer “how are we doing against a goal?” belong to **Measurements**. Questions that answer “who should we act on next?” belong to **BOS / Workspace / Planning**. Calculations never own the operator’s first click.

---

## 4. Exercise 3 — Ideal journeys (question → action)

Principle for every journey: **the operator names the question; Alloy may create or reuse a calculation underneath without making that the story.**

### 1. Future room capacity

Think: “How many seats will I have next month?”  
→ Open **Operational Intelligence**  
→ **Add measurement** → choose **Future room capacity** (product template)  
→ Pick rooms / default date horizon / goal (e.g. minimum seats)  
→ Alloy ensures a governed source exists (reuse published calculation or create one from a plain-language recipe)  
→ **Activate** → Observe by room/date → Act (offers, holds, moves)

Operator never opens “Calculations” unless they want to change *how* the number is made.

### 2. Future age-outs

Think: “Who ages out this quarter?”  
→ Open **Planning** (or OI entry that hands off: “This needs a cohort plan”)  
→ Choose age-out window and programs  
→ Review dated child list  
→ Send selected children into transition work

Not a single KPI tile as the end state.

### 3. Upcoming transitions

Think: “What’s already on the calendar to move?”  
→ Open **Workspace** (site/room or Transitions work)  
→ See upcoming moves  
→ Confirm / complete / reschedule

### 4. Children eligible for movement

Think: “Who *could* move into that open seat?”  
→ Open room or capacity context  
→ **Eligible children** with reasons  
→ Select → create transition / BOS item

### 5. Ratio risks

Think: “Where are we unsafe on ratio?”  
→ OI → Add measurement → **Ratio risk**  
→ Set policy threshold  
→ Health on rooms → Off-goal rooms open BOS / staffing Workspace

### 6. Future staffing needs

Think: “Do we have enough teachers for the plan?”  
→ **Planning** staffing scenario  
→ Assumptions visible  
→ Gap list → hiring / schedule actions

### 7. Room utilization

Think: “Is this room full enough?”  
→ OI → **Room utilization** measurement  
→ Goal band → Observe → Rebalance or enroll

### 8. Program utilization

Think: “Is Infants under-enrolled org-wide?”  
→ OI → **Program utilization**  
→ Compare sites → Adjust offering / outreach

### 9. Enrollment bottlenecks

Think: “Where do families stall?”  
→ OI → Enrollment bottleneck measurement / pack  
→ Drill into pipeline Workspace for the stuck stage  
→ Fix process or staffing

### 10. Waitlist opportunities

Think: “Who do we call this week?”  
→ Waitlist / Placement surface  
→ Ordered opportunities  
→ Offer actions (BOS)

### 11. Transition recommendations

Think: “Tell me who to move and help me do it.”  
→ BOS attention  
→ Recommendation with evidence (capacity, eligibility, age-out)  
→ Accept → executes through existing assignment paths

---

## 5. Exercise 4 — Should Calculations stay top-level?

### Option A — First-class top-level Organization product

**Pros:** Power users and platform builders find authoring fast; matches engineering ownership.  
**Cons:** Forces every director through authoring vocabulary first; invents a morning habit (“create a calculation”) that doesn’t match intent; publication feels like an orphan climax.

**Verdict:** Wrong default for childcare directors. Acceptable as an *advanced* entry later.

### Option B — Advanced configuration reached from Measurements

**Pros:** Calculation appears when a measurement needs a source or when “How is this measured?” is asked; preserves a durable place for reuse and versioning.  
**Cons:** Slightly longer path for specialists.

**Verdict:** Strong product fit.

### Option C — Shared platform surfaced only when needed (no standing nav)

**Pros:** Maximum clarity for directors; zero orphan product.  
**Cons:** Harder for multi-consumer reuse discovery (“we already defined usable capacity”); auditors/admins may struggle to find the library of org math.

**Verdict:** Best *feeling* for first-time directors, but under-serves reuse. Prefer **C for first-run**, **B for ongoing admin**.

### Recommendation

**Primary product: Measurements (inside Operational Intelligence).**  
**Calculations: Option B with Option C behavior on first use** —

- No requirement to visit Calculations to answer a question.
- When a measurement needs governed math, Alloy offers: *Use an existing definition* or *Set up how this is calculated* (guided).
- A durable **Calculation library** remains reachable from measurement Source (“Advanced: manage reusable definitions”) and from Organization advanced settings — not as the default peer of Locations / Processes.

**Why:** Matches mental model B, preserves architecture (immutable published versions still exist), and stops publication from being a dead-end ceremony.

---

## 6. Exercise 5 — Ideal information architecture

Ignore today’s URLs. Ideal hierarchy:

```text
Organization
└── Operational Intelligence          ← first click for “how are we doing?”
    ├── Home (questions & health)
    ├── Measurements
    │   ├── [Measurement] e.g. Future Room Capacity
    │   │   ├── Overview (current answers + health)
    │   │   ├── Goal
    │   │   ├── History
    │   │   └── How it’s measured (Source)
    │   │       ├── Plain-language recipe
    │   │       ├── Version in use (business label)
    │   │       └── Advanced: open definition library
    │   └── Add measurement → pick a question template
    ├── Goals & health (org rollup)
    └── Attention (exceptions worth a human)  ← may deep-link into BOS

Organization (advanced / secondary)
└── Calculation library                 ← not the morning door
    ├── Reusable definitions
    ├── Versions (business language)
    └── Where used (measurements, room capacity, …)

Workspace / BOS / Planning / Dashboards
└── Consume the same answers in context
```

**If Calculations stayed primary** we would need operator evidence that directors routinely say “I need a reusable formula library.” We do not have that evidence; Kelly’s walkthrough reaction points the other way.

---

## 7. Exercise 6 — Wizard challenge and redesign

### Current Calculations wizard — challenge each step

| Step | Why it exists today | Director-understandable? | Confidence? | Could it disappear? |
|------|---------------------|----------------------------|-------------|---------------------|
| 1. Choose type | Maps to templates / product types | Partially (“Usable capacity” yes; “type” no) | Medium | Rename to **What do you want to know?** or skip if entered from a measurement template |
| 2. Business information | Name/description | Yes if “Name this answer” | Medium | Keep as **Name**, drop “business information” |
| 3. Inputs | Engineering framing of capacity fields | **No** — “inputs” sounds like a form builder | Low | Replace with **What should count as capacity?** with plain choices |
| 4. Preview | Proves the number | Yes if room + date + result | High | Keep as **Try it on a room** |

### Redesign from scratch (measurement-led)

**Path: Add measurement → Future Room Capacity**

1. **What do you want to know?**  
   Future room capacity (template). One sentence explanation.

2. **What does “capacity” mean here?**  
   Plain choices, e.g.  
   - The lower of physical and licensed seats  
   - Operational seats when set, otherwise physical  
   (No AST, no function names.)

3. **Name it**  
   Default: “Future room capacity.” Optional description for the team.

4. **Goal (optional)**  
   “Warn me when a room has fewer than __ seats.”

5. **Try it**  
   Pick two rooms and a date. Show number or honest unavailable.

6. **Turn it on**  
   Activate. Explain: changing the recipe later won’t silently change today’s answers until you choose to use the new version.

**Calculations wizard** (only when opening the library or “customize how it’s measured”) should be the same spine without pretending to be the product home.

---

## 8. Exercise 7 — Post-publish experience

Today: Publish → quiet success → operator stranded.

### Ideal next moment

Publication should feel like **making an answer available to the organization**, not filing a document.

After a definition becomes usable:

**Primary prompt (required product beat):**

> This can now answer **Future room capacity**.  
> **Start measuring it** · **Use it for room capacity** · **Not now — keep in library**

| Choice | Meaning |
|--------|---------|
| Start measuring it | Create/activate OI measurement bound to this exact version |
| Use it for room capacity | Bind room consumer (additive; does not replace platform capacity) |
| Not now | Library only — valid, but rare for first publish |

### Should publication exist independently?

**Yes, but secondary.**  
Immutability and exact-version binding are architectural goods. Product-wise:

- Prefer language: **Make available** / **Use this version** over **Publish** when the user is in a measurement flow.
- In the library, **Publish** can remain for specialists — always followed by “what should use this?”
- A definition that is never consumed is incomplete product success, not a finished journey.

### Should it stay unpublished until consumed?

**No.** Draft vs available is still useful (try safely, then lock).  
But **available without a consumer** should show an empty-state CTA: “Nothing is using this yet.”

---

## 9. Exercise 8 — Product language glossary

| Avoid (engineering) | Prefer (operator) |
|---------------------|-------------------|
| AST | How the number is calculated / recipe |
| Platform function | Approved capacity fact (physical seats, licensed seats, …) |
| Binding / consumer binding | What uses this / Connected to |
| Exact version UUID | Version 2 (May 12) / “Current recipe in use” |
| Publish (alone) | Make available · Start using |
| Inputs | What should count · What we use to calculate |
| Business information | Name · Description |
| Fallback / coalesce | “If we don’t have X, use Y” |
| Projection | Estimate for a future date · Looking ahead |
| Subject grain | Measured for each room / program / … |
| Evaluator | (invisible) |
| Immutable | Locked version · Won’t change quietly |
| Rebind | Use newer version |
| Observation | Check · Look up · Current answer |
| Not available (keep) | Not available — say **why** in plain language |
| Target | Goal |
| Health | On goal / Below goal / Not available |
| Pack | Related measurements (optional later) |
| Registry | (invisible) |
| Metadata store | (invisible) |

**Glossary principle:** If a director wouldn’t say it in a standup, it doesn’t belong on the primary path.

---

## 10. Deliverable summary

### 1. Operator mental model

Directors seek **answers and actions**, not formula authorship. Calculations are infrastructure for trustworthy answers.

### 2. Correct primary object

**Measurement** (Operational Intelligence).  
Calculation is a **source** behind a measurement (and a library for reuse).

### 3. Correct information architecture

OI → Measurements → [Measurement] → Overview / Goal / History / How it’s measured → advanced Calculation library.

### 4. Correct workflow

Question template → configure meaning in plain language → optional goal → try → activate → observe → act.  
Calculations created or reused as a side effect.

### 5. Wizard redesign

Replace type/inputs/business-information with question → meaning → name → goal → try → activate.

### 6. Post-publish experience

Always ask what should use the newly available definition (measure / room capacity / library only).

### 7. Navigation recommendation

**Default door: Operational Intelligence.**  
Calculations library: advanced / secondary, linked from measurement Source.

### 8. Product language glossary

See §9.

### 9. Open questions (need Kelly / real director input)

1. Do directors ever seek a calculation library *before* naming a question? (If yes, how often?)
2. Should “Room capacity on the room page” be framed as a measurement, a setting, or both?
3. Is “Make available” acceptable instead of “Publish,” or does Publish carry trust language worth keeping?
4. For age-outs / staffing, is the OI home allowed to deep-link into Planning without owning those models?
5. Should first-run Alloy ship **one** starter measurement (Future room capacity) pre-suggested on OI home?
6. Where do platform KPIs (tour conversion, etc.) and org-authored measurements share one list without feeling like two products?

### 10. Final recommendation

**Ship the mental model: Measurements first, Calculations second.**  
Keep the accepted architecture. Change the product story so the first click answers:

> “What do we need to know to run the center?”

---

## Success criterion — answered

**First click:** **Operational Intelligence** (What we measure / Add measurement),  
**not** Calculations (New calculation).

If that click doesn’t feel obvious in the next design pass, the product is still wrong — even if every API test passes.
