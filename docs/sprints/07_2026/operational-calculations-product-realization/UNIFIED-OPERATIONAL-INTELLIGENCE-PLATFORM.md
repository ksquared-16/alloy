# Unified Operational Intelligence Platform

**Status:** Platform charter (design only — no implementation)  
**Date:** 2026-07-28  
**Slot context:** Slot 2 `org-calcs-integration` (architecture + measurements-first product accepted)  
**Depends on (accepted, not redesign):**

- Organization Calculations + exact-version binding  
- Measurement architecture (observe → goal → health → history)  
- Measurements-first product realization (`PRODUCT-REALIZATION-MEASUREMENTS-FIRST.md`)  
- BOS as placement on registered commands / shared runtime (`docs/platform/modules/ai-platform.md`)

**Non-goals:** Redesign OI UI. Redesign BOS chrome. New calculation engine. New measurement types beyond the accepted catalog framing.

---

## 0. One-sentence charter

**Operational Intelligence is one platform.** The UI and BOS are entry points into the same Questions, Measurements, Calculations, Observations, and recommended Actions — never two intelligence systems that happen to look similar.

Success criterion (frozen):

> A director who opens Operational Intelligence **or** asks BOS must receive the **same** operational answer for the same question, because both consume the same platform objects. If answers diverge by entry point, the architecture is wrong.

---

## 1. Canonical object model (Exercise 1)

### Primary operator object

**Measurement** is the primary *durable operational object*.

Directors do not wake up owning “insights” or “ASTs.” They wake up owning **questions they need answered repeatedly with accountability**.

### Object stack (accepted pipeline — labeled)

```text
Operational Question          catalog entry — “what are we trying to understand?”
        ↓
Measurement                   durable org object — named watch + goal + health + history
        ↓
Source (often Organization    how the number is made (exact published version when calc-backed)
  Calculation version)
        ↓
Platform Facts                approved capacity / entity facts (never invented zeros)
        ↓
Observation                   answer for a subject + time (room + date, …)
        ↓
Health                        on goal / below goal / not available / no goal
        ↓
History                       prior observations
        ↓
Insight (optional)            packaged explanation of observation + health for humans/BOS
        ↓
Recommendation (optional)     proposed next step grounded on measurement health
        ↓
Action                        registered command / Workspace / Planning handoff
```

### Definitions

| Object | What it is | Owns |
|--------|------------|------|
| **Operational Question** | Catalog template: intent, grain, default recipe, default actions | Product catalog (code/config) — not org-authored prose alone |
| **Measurement** | Org instance of a question: name, source binding, goal, lifecycle | **Operational Intelligence Platform** |
| **Organization Calculation (+ version)** | Governed reusable math; immutable published versions | Calculation library (advanced) |
| **Platform Fact** | Approved input truth (physical seats, licensed seats, …) | Platform / entity authors |
| **Observation** | Evaluated answer for subject + effective time | Measurement runtime (OI Platform) |
| **Health** | Goal comparison over an observation | Measurement runtime |
| **Insight** | Operator-facing explanation bundle (answer + why + confidence) | Derived from Observation — **not** a separate store of truth |
| **Recommendation** | Propose registered next step when health/policy warrants | **OI Platform emits; BOS presents** — same payload |
| **Action** | Registered command or owned Workspace/Planning work | Existing action / BOS / Workspace / Planning runtimes |

### Rejected primary objects

| Candidate | Why not primary |
|-----------|-----------------|
| Operational Question alone | Catalog without org instance cannot hold goals/history |
| Insight | Ephemeral packaging; must not become parallel truth |
| Calculation | Means, not ends (measurements-first accepted) |
| BOS attention item | Presentation of Recommendation — not the measurement |

### Principle

**One Measurement ID. Many surfaces.**  
UI detail page, BOS conversation turn, Room Workspace chip, and Dashboard tile that claim the same question must resolve the same `measurement_id` (or platform KPI key) and the same observation contract.

---

## 2. Two entry points (Exercise 2)

### Scenario A — UI (“I need to know something”)

```text
Director → Operational Intelligence home
  → “What do you want to know?” / Add measurement / Current measurements
  → Select or create Measurement (e.g. Future Room Capacity)
  → Configure meaning / goal (if needed)
  → Observe (room + date)
  → See Answer + Health + History
  → Act (or open How it’s calculated)
```

### Scenario B — BOS (“BOS, how many seats will we have next month?”)

```text
Director → BOS
  → Intent: capacity / future seats
  → Resolve Operational Question → existing Measurement (or guided create)
  → Clarify subject (room/site) + horizon (next month → effective date)
  → Same observe API / same Observation
  → Same Answer + Health + Explanation
  → Offer same next actions (registered commands / deep links)
```

### Shared core (no duplication)

| Concern | Single owner |
|---------|----------------|
| Which measurement | Measurement registry / OI org-calc store + platform KPI keys |
| How computed | Exact calculation version or platform metric resolver |
| Observation | OI observe / MetricEngine path — **never** BOS-local math |
| Goal / health | Measurement target + health evaluator |
| History | Measurement history store |
| Explanation lines | Evaluator / observation explanation — BOS may narrate, not invent |

BOS may **clarify and narrate**. BOS may **not** compute a second capacity number.

---

## 3. Conversation-first design (Exercise 3)

BOS conversation is a **wizard in dialog form** — same steps as UI, different interaction.

### Opening

> “What are you trying to understand?”

**Domains (Question Catalog groups):**

| Domain | Operator language |
|--------|-------------------|
| Capacity | Seats, rooms, programs filling |
| Children | Age-outs, who moves, eligibility |
| Enrollment | Stuck families, waitlist, bottlenecks |
| Compliance | Ratio, licensing pressure |
| Staffing | Teachers needed for the plan |

### Mapping conversation → platform

| BOS turn | Platform step (same as UI) |
|----------|----------------------------|
| Choose domain / question | Select Operational Question template |
| “Do you already measure this?” | Find existing Measurement or start create |
| “What should capacity mean?” | Recipe / meaning step |
| “When should I warn you?” | Goal step |
| “Which room / when?” | Observe parameters |
| “Here’s the answer…” | Observation + Health + Insight |
| “Want to open Sunflower / adjust goal / see why?” | Recommendation → Action |

### Hard rule

If BOS creates or configures a measurement, the resulting Measurement must be **indistinguishable** from one created in the OI UI (same schema, same binding, same activation semantics).

---

## 4. Shared workflow — Future Room Capacity (Exercise 4)

### Shared terminal state (identical)

After either path finishes configuration:

- Measurement **active**  
- Exact `calculation_version_id` locked  
- Optional goal (e.g. warn below 18 seats)  
- Unit: seats; grain: room + effective date  
- Ready for observe / history / consumers  

### UI experience

| Step | UI |
|------|-----|
| Question | Add measurement → Future Room Capacity |
| Configure | Name · capacity meaning · optional goal |
| Try | Room + date → Answer / Not available |
| Activate | Start measuring · version lock explanation |
| Use | Check a room · Goal · History · How it’s calculated |
| Act | Deep link Workspace / offers / “Manage how it’s calculated” |

### BOS experience

| Step | BOS |
|------|-----|
| Conversation | “Help me understand future room capacity” |
| Clarify | Room or site? Horizon (e.g. +30 days)? Existing measurement or new? |
| Configure | Same meaning + goal prompts in chat (writes same Measurement APIs) |
| Show answer | Observation card: value / not available / health / short why |
| Next action | “Open room” · “Lower goal” · “Explain” · “Use newer recipe version” (advanced) |

### Parity checklist

| Capability | UI | BOS |
|------------|----|-----|
| Create measurement | Yes | Yes (guided) |
| Observe | Yes | Yes |
| Same answer for same room/date | Required | Required |
| Edit goal | Yes | Yes |
| Show explanation | Expanded disclosure | Spoken + expandable |
| Rebind version | Advanced source | Advanced / confirm |
| Invent alternate math | Never | Never |

---

## 5. Configuration ownership (Exercise 5)

Canonical owner of Measurement truth: **Operational Intelligence Platform** (APIs + persistence).  
UI and BOS are **clients**.

| Capability | UI | BOS | Notes |
|------------|----|-----|-------|
| Create measurement | Primary | Yes | Same create API |
| Rename | Yes | Yes | Soft config |
| Edit goal | Yes | Yes | Soft config |
| Observe / check | Yes | Yes | Same observe API |
| View history | Yes | Yes (summary) | Full table may stay UI |
| Explain reasoning | Advanced disclosure | Primary strength | Same explanation payload |
| Change recipe / meaning | Yes (guided) | Yes (guided) | May create/reuse calc; still OI-owned measurement |
| Rebind version | Advanced | Advanced + confirm | Exact-version invariant |
| Archive / disable | Yes | Yes (with confirm) | |
| Author arbitrary AST | Calculation library only | No | BOS must not become a calc IDE |
| Publish calculation | Calculation library | No (or “make available” via guided setup only) | Specialists |
| Proactive attention | Attention list | **Primary** | Driven by Measurement health |

**Canonical owner summary:** Platform owns data. UI owns browse/configure density. BOS owns conversational clarify + proactive surfacing. Neither owns a private measurement fork.

---

## 6. Question catalog (Exercise 6)

The catalog is the **product index of Operational Questions**.  
UI “Add measurement” and BOS “What are you trying to understand?” both render from this catalog.

**Status legend:** `Proven` = Future Room Capacity path exists · `Accepted-framed` = belongs in OI Measurements · `Handoff` = OI may deep-link but another system owns truth · `Future` = not in current proving slice.

### Capacity

| Question | Measurement | Calculation / source | Action | Consumer |
|----------|-------------|----------------------|--------|----------|
| How many seats will Room X have on date Y? | Future Room Capacity | Org calc (exact version) over capacity facts | Adjust offers / holds / moves | OI, Room Workspace, BOS |
| How full is this room vs what it can hold? | Room Utilization | Occupancy vs capacity measurement | Fill / pause / rebalance | OI, Room Workspace, Dashboard |
| How is this program filling across sites? | Program Utilization | Program rollup measurement | Offering / outreach | OI, Program Workspace |

### Children

| Question | Measurement | Calculation / source | Action | Consumer |
|----------|-------------|----------------------|--------|----------|
| Who ages out soon? | (Handoff) Age-out cohort | Planning forecast | Plan transitions | **Planning** primary; OI deep-link |
| What moves are already planned? | (Handoff) Transition schedule | Workspace truth | Confirm / reschedule | **Workspace** |
| Who could move now? | (Handoff) Movement eligibility | Assignment rules + capacity | Initiate move | **BOS / Assignment** |

### Enrollment

| Question | Measurement | Calculation / source | Action | Consumer |
|----------|-------------|----------------------|--------|----------|
| Where do families get stuck? | Enrollment Bottlenecks | Pipeline stage metrics | Fix process / staffing | OI → pipeline Workspace |
| Who should we offer next? | (Handoff) Waitlist opportunity | Placement ranking | Make offer | **Placement / Planning**; BOS windows |

### Compliance

| Question | Measurement | Calculation / source | Action | Consumer |
|----------|-------------|----------------------|--------|----------|
| Where are we at ratio risk? | Ratio Risk | Policy vs staffing/occupancy measurement | Staff / freeze / move | OI, BOS when off goal |

### Staffing / Planning

| Question | Measurement | Calculation / source | Action | Consumer |
|----------|-------------|----------------------|--------|----------|
| How many teachers for the intended plan? | (Handoff) Staffing need | Planning scenario | Hire / schedule | **Planning** |

### Platform KPIs (already in OI)

Tour conversion, delivery rate, needs-attention count, etc. remain **Measurements** in the same collection (platform-owned source), not a second product. Catalog entries mark `source_kind: platform_metric`.

### Catalog invariants

1. Every entry names **one primary owner** (OI Measurement vs Planning vs Workspace vs BOS recommendation).  
2. Calculations appear only when the measurement is calc-backed.  
3. BOS never lists a question that is not in the catalog (no shadow intelligence).

---

## 7. Answer model (Exercise 7)

Every observation/answer payload (UI card, BOS turn, API) should be a single **Answer Contract**:

| Field | Mandatory? | Meaning |
|-------|------------|---------|
| **Answer** | **Yes** | Value **or** explicit Not available (+ reason) |
| **Subject** | **Yes** | Room / program / org scope identity + labels |
| **As-of / effective time** | **Yes** | Date or window used |
| **Measurement identity** | **Yes** | `measurement_id` or platform KPI key |
| **Source identity** | **Yes** | Recipe label + version number (business), not raw UUID in primary UI |
| **Health** | **Yes** when goal exists; else `no_goal` | On / below / not available |
| **Goal** | Optional | Threshold that drove health |
| **Explanation** | **Yes** at least one plain line when resolved or unavailable | Why this number / why missing |
| **Confidence** | Optional now; **required later** for forecasts | e.g. complete facts vs partial |
| **History summary** | Optional in chat; **required** on measurement detail | Trend / last N |
| **Recommended next action** | Optional; **required** when health is below goal or policy says attention | Registered action or deep link |

### Mandatory vs optional (charter)

**Always:** Answer, Subject, Effective time, Measurement id, Source identity, Explanation, Health (including `no_goal`).  

**When configured:** Goal.  

**When attention-worthy:** Recommended next action.  

**Progressive:** Confidence, rich history, multi-step explanation traces (advanced disclosure).

BOS and UI must not omit mandatory fields; they may collapse optional fields differently.

---

## 8. Recommendation model (Exercise 8)

### Source of truth

Recommendations are **derived from Measurement health (+ policy)**, not from a BOS-only ruleset that re-implements capacity.

```text
Observation + Goal → Health
Health + Recommendation policy → Recommendation payload
BOS / OI Attention → present Recommendation
Operator → confirm → Action runtime
```

### Example

Sunflower Room projected 14 seats; goal 18 → health `below_goal`.

**BOS (and OI Attention) may say:**

> “Sunflower Room is projected to have only 14 seats next month (goal: at least 18). Would you like to see why?”

Grounding:

- Same measurement id  
- Same observation  
- Same explanation lines  
- Proposal uses registered navigation/command — not a silent mutation  

### When BOS is proactive

| Trigger | Behavior |
|---------|----------|
| Health below goal | Offer explain + contextual actions |
| Not available where goal expects a number | Offer fix facts / open room capacity setup |
| Newer calculation version available | Soft advanced notice — never silent rebind |
| Catalog question asked with no measurement | Offer create (shared create flow) |

### When BOS stays quiet

| Condition | Behavior |
|-----------|----------|
| On goal / no goal and no ask | No proactive capacity nag |
| Ambiguous subject | Clarify first — do not guess room |
| Autonomous side effects | Forbidden (AI platform frozen rule) |

---

## 9. Action routing (Exercise 9)

Once an Answer exists, **next step ownership** follows the Question Catalog primary owner — not whichever surface showed the answer.

| After answer… | Typical next owner | Transition |
|---------------|--------------------|------------|
| Adjust enrollment offers / holds | Workspace / Placement | Deep link with room + date context |
| Move children / eligibility | BOS proposal → Assignment command | `bos_proposal` → confirm → registered action |
| Confirm planned transition | Workspace | Open transition work |
| Age-out cohort planning | Planning | OI/BOS handoff with window params |
| Staffing gap | Planning | Handoff with scenario assumptions |
| Fix missing capacity facts | Room / Locations config | “Not available” reason → configure facts |
| Change how capacity is calculated | Calculation library (advanced) | From measurement Source only |
| Change goal only | OI Platform (UI or BOS) | Patch measurement target |
| Admire a chart | Dashboard (secondary) | Consumes same measurement snapshots |

### Ownership map (short)

| Layer | Owns |
|-------|------|
| **Operational Intelligence Platform** | Question catalog, measurements, observe, goals, health, history, recommendation *payload* |
| **BOS** | Conversation entry, clarify, proactive presentation, propose registered actions |
| **Workspace** | Operational schedules, queues, record work |
| **Planning** | Forecasts, cohorts, staffing scenarios |
| **Dashboards** | Presentation of already-resolved measurements |
| **Calculation library** | Versioned math definitions |

---

## 10. Long-term architecture (Exercise 10)

```text
Operational Question (catalog)
        ↓
Measurement (OI Platform)
        ↓
Calculation version / Metric resolver
        ↓
Observation (+ Explanation)
        ↓
Insight (packaging)
        ↓
Recommendation (from health/policy)
        ↓
Action (registered / Workspace / Planning)
```

### Where each surface participates

| Stage | OI UI | BOS | Workspace | Planning | Dashboards |
|-------|-------|-----|-----------|----------|------------|
| Question | Add / browse catalog | “What are you trying to understand?” | Contextual ask | Domain handoff | Rare |
| Measurement | **Home + CRUD** | Create/configure via chat | Read / chip | Read | Read |
| Calculation | Advanced link | Guided setup only | — | May consume | — |
| Observation | Check a room | Show answer | Inline | Scenario inputs | Tile |
| Insight | Detail panels | Narration | Tooltips | Plan notes | Captions |
| Recommendation | Attention | **Proactive + chat** | — | Plan alerts | — |
| Action | Deep links | Propose → confirm | **Execute work** | **Execute plan work** | Navigate |

### Navigation model (Exercise 5 + IA)

```text
Organization
└── Operational Intelligence          ← UI door for questions & measurements
    ├── Home (What do you want to know?)
    ├── Measurements (collection + detail)
    ├── Attention (health-derived; shared feed with BOS)
    └── Advanced → Calculation library

BOS (always available assistant)
└── Same Question Catalog + Measurement APIs + Recommendation feed

Workspace / Planning / Dashboards
└── Consumers of Measurement answers — never alternate math
```

### Anti-patterns (forbidden)

1. **BOS Intelligence** pack that computes seats differently from OI.  
2. **UI-only measurements** invisible to BOS recommenders.  
3. **BOS-only measurements** absent from OI collection.  
4. LLM-invented KPIs or capacity numbers.  
5. Silent rebind of calculation versions.  
6. Recommendations that cannot cite a `measurement_id` / KPI key + observation.

---

## 11. Deliverable index

| # | Deliverable | Section |
|---|-------------|---------|
| 1 | Canonical object model | §1 |
| 2 | Question catalog | §6 |
| 3 | Shared UI/BOS workflow | §4 |
| 4 | Conversation flow | §3 |
| 5 | Navigation model | §10 |
| 6 | Ownership / configuration model | §5, §9 |
| 7 | Answer model | §7 |
| 8 | Recommendation model | §8 |
| 9 | Action routing | §9 |
| 10 | Long-term architecture | §10 |

---

## 12. Open questions (for Kelly / directors)

1. Should Attention be a **shared feed** object (one API for OI + BOS), or is BOS a pure presenter of Measurement health queries?  
2. Is **Confidence** mandatory before any Planning forecast appears in BOS, or only after first forecast ship?  
3. For Room Workspace capacity chips: consumer of Future Room Capacity measurement, or separate binding that must still share observation API?  
4. May BOS ever open the Calculation library UI, or only guided “set up how it’s calculated”?  
5. Should platform KPIs and org-calc measurements share one Attention policy engine from day one?

---

## 13. Graduation path (docs only — later)

When accepted, distill into:

- `docs/platform/modules/operational-intelligence-platform.md` — add “Unified entry points (UI + BOS)”  
- `docs/platform/modules/ai-platform.md` — add “OI Platform as BOS measurement ground truth”  
- Keep this file as sprint charter / decision record  

**No code until this charter is accepted.**

---

## Success criterion — restated

Directors can open **Operational Intelligence** or ask **BOS** and get the **same** Future Room Capacity (and every catalogued question) because both are clients of one Operational Intelligence Platform.

Different interaction. Same objects. Same answer.
