# Operational Intelligence Phase 2 — Consumption Model

**Status:** Architecture closeout for Phase 1 (documentation only)  
**Date:** 2026-07-28  
**Amended:** 2026-07-28 — Operational Answer Contract (consumers consume **Answers**, not Measurements)  
**Scope:** Where operational answers appear after OI Platform V1 is complete  
**Non-goals:** Implementation, UI work, new platform primitives, BOS feature build, new Questions/BOS capabilities

---

## 0. Phase 1 closeout (accepted)

Operational Intelligence Platform V1 is **complete** as a producer:

```text
Questions → Measurements → Definitions (Calculation Library)
  → Facts / Populations / Equivalencies / Calculations
  → Answers (Observations + Health + Explanation)
```

**Conceptual flow for every consumer (Phase 2+):**

```text
Question → Answer → Presentation → Action
```

Internal architecture (Measurements, Definitions, Goals, History) remains how OI **produces** answers. Consumers never traverse that stack themselves.

### What Operational Intelligence owns

| Object | Ownership |
|--------|-----------|
| Questions | Catalog + configure |
| Measurements | Durable watch binding (goal, history linkage, definition version) |
| Definitions | Published calculation versions (Calculation Library / Org Calcs) |
| Observations | **Answers** for subject + effective date |
| Goals | Accountability targets on measurements |
| History | Prior observations |
| Health | Derived from answer vs goal |
| Shared explanations | Explanation payload on the observation / answer |

### What consumers own

**Presentation only** — cards, chips, trends, conversation framing, scenario overlays labeled as scenarios.

OI does **not** own every operator experience. Other products **consume Answers**.

Phase 2 is the **consumption roadmap**: who presents answers, at what depth, and who acts.

Related (do not reopen):

- [`docs/platform/milestones/Operational-Intelligence-Platform-V1-Certified.md`](../../platform/milestones/Operational-Intelligence-Platform-V1-Certified.md)
- `docs/platform/modules/operational-intelligence-platform.md`
- `docs/sprints/07_2026/operational-calculations-product-realization/UNIFIED-OPERATIONAL-INTELLIGENCE-PLATFORM.md`
- `docs/sprints/07_2026/operational-intelligence-expansion/SCOPE.md`

---

## 1. Operational Answer Contract

**Canonical rule for Phase 2 and beyond:**

> Operational Intelligence owns how operational questions are answered.  
> Consumers own how those answers are presented.  
> Consumers never duplicate operational logic.  
> Consumers request **Answers** from Operational Intelligence.

| May | Must not |
|-----|----------|
| Request an Answer for a Question + subject + date | Recompute utilization, capacity, or staffing math |
| Present value, health, and short explanation | Own operational truth |
| Deep-link into OI for history / goals / definitions | Author a parallel definition |
| Act via Commands / Workspace / Planning after a recommendation | Treat Measurement configuration UI as a consumer API |

This contract is binding for:

Locations · Programs · Planning · Workspace · BOS · Dashboards · Reports · API · Commands · Notifications · Queues · Surfaces

**Consumers consume Answers.**  
Measurements, Definitions, and Goals are **OI-internal** accountability machinery. Consumers may *cite* a measurement id for deep links, but they do not “subscribe to Measurements” as their product object — they request and display **Answers**.

---

## 2. Principle

> Every Question produces an Answer.  
> Consumers present and act.  
> Producers do not re-implement.

| Role | Owns | Does not own |
|------|------|----------------|
| **Operational Intelligence** | Questions, Measurements, Definitions, Observations (Answers), Goals, History, Health, shared explanation | Execution, scenarios, room chrome, dashboards |
| **Locations** | Room/site presentation of Answers | Answer math, goals, definitions |
| **Programs** | Program presentation of Answers | Duplicate utilization engines |
| **Planning** | Scenarios, forecasts, deltas over baseline Answers | Authoritative answer truth |
| **Workspace** | Operator context / Current Work presentation | Measurement authoring |
| **BOS** | Conversation, recommendations, command handoff | Separate answer truth |
| **Dashboards / Reports** | Aggregation and trend presentation of Answers | Full history drilldown / definition editing |
| **Queues / Surfaces / Commands / Notifications / API** | Presentation and transport of Answers | New calculation engines |

**Never:** a second Room Utilization implementation inside Locations, Planning, or BOS.

**Always:** request Answers through the Operational Intelligence observe / explain / history contract (thin presentation adapters allowed; no forked math).

---

## 3. Question inventory (envisioned)

| Question | Phase 1 status | Primary grain | Notes |
|----------|----------------|---------------|--------|
| **Future Room Capacity** | Shipped | Room + date | Primary product question |
| **Room Utilization** | Shipped | Room + date | One question; counting mode is configuration (headcount / FTE / equivalency) |
| **Equivalent Child Count** | Library / advanced | Room + date | Not a primary Questions card; reusable numerator |
| **Program Utilization** | Deferred | Program (+ date) | Needs program-grain occupancy SoT |
| **Ratio Risk** | Deferred | Room / program | Needs scheduled/on-hand staff resolver — do not fake |
| **Future Staffing** | Envisioned | Room / site + date | Depends on staffing demand + schedule truth |
| **Enrollment Bottlenecks** | Envisioned | Pipeline / stage | Crosses CRM/enrollment + capacity answers |
| **Room Utilization (FTE)** | Legacy key only | — | **Not** a separate product question |

Future questions enter the catalog as Questions; they do not invent new consumption architectures.

---

## 4. Ownership table (who owns / displays / acts)

For each Measure question: **Answer owner** is always Operational Intelligence. Display and action owners differ by surface.

| Question | Owns the answer | Primary presentation | Acts on the answer |
|----------|-----------------|----------------------|--------------------|
| Future Room Capacity | OI | OI workspace; Locations room summary; Planning inputs; BOS | Director via OI goals; Planning scenarios; BOS → Commands |
| Room Utilization | OI | OI; Locations room; Dashboards; BOS | Capacity / enrollment ops; BOS when off-goal |
| Equivalent Child Count | OI | Embedded in Utilization explanations; Library; Planning (advanced) | Rarely alone — usually ingredient of Utilization |
| Program Utilization | OI (when shipped) | OI; Programs; Dashboards | Program directors; placement ops |
| Ratio Risk | OI (when shipped) | OI; Locations; Planning; BOS | Staffing lead; compliance review |
| Future Staffing | OI (when shipped) | OI; Planning; BOS | Staffing / scheduling owners |
| Enrollment Bottlenecks | OI (when shipped) | OI; Workspace queues; Dashboards; BOS | Enrollment ops; process owners |

**Rule:** Presenters never fork the definition. They request an Answer for `question_key` + subject + date (and may deep-link with `measurement_id` into OI).

---

## 5. Consumer map

| Consumer | Role in Phase 2 | Consumes Answers? | How |
|----------|-----------------|-------------------|-----|
| **Operational Intelligence** | System of record for Q → A | Yes — full | Full workspace: Overview, History, Settings, Definition drill |
| **Locations** | Room / site presentation | Yes — compact | Room Summary → Capacity / Utilization → health color → drill to OI |
| **Programs** | Program presentation | Yes — when Program Utilization ships | Program summary → health → drill to OI |
| **Planning** | Scenarios & forecasts | Yes — as baseline Answers | Current + future Answers; scenario delta vs baseline |
| **Workspace** | Day-to-day context | Selective | Attention chips when Answer health needs attention |
| **BOS** | Conversation + recommendation | Yes — same Answer APIs | Answer + explain + recommend → registered command |
| **Dashboards** | Aggregation & trend | Yes — rollups of Answers | Org/site aggregates; sparkline; no definition editor |
| **Queues** | Work selection | Rare | Only when an Answer-backed attention item is queued |
| **Surfaces** | Portal presentation | Optional later | Explicit opt-in only |
| **Reports** | Export / audit | Yes | Saved Answer series + health; cite definition version |
| **Commands** | Execution | Indirect | Receive recommendation handoffs; do not compute Answers |
| **Notifications** | Interrupt | Policy-driven | Off-goal Answer transitions when enabled |
| **API** | Integration | Yes | Canonical observe / history / explain (Answer) endpoints |

### Example (correct)

```text
Question (Future Room Capacity)
  → Answer (OI observation for room + date)
    → Presentation (Location Room Summary compact card + health)
      → Action (optional BOS recommendation → Command)
        → Deep explain always returns to OI
```

### Example (forbidden)

```text
Location
  → Local “capacity calculator”
    → Different math than OI Answer
```

---

## 6. Question visibility matrix

Legend: **F** = full · **C** = compact presentation · **I** = Planning input · **R** = recommendation context · **T** = trend/aggregate · **A** = alert eligible · **—** = do not surface · **L** = later

| Question | OI | Home / Workspace | Room (Locations) | Program | Planning | BOS | Dashboard | Alerts | Reports | API |
|----------|----|------------------|------------------|---------|----------|-----|-----------|--------|---------|-----|
| Future Room Capacity | F | C* | C | — | I | R | T | A | T | F |
| Room Utilization | F | C* | C | L | I | R | T | A | T | F |
| Equivalent Child Count | F† | — | —‡ | — | I | —§ | — | — | — | F |
| Program Utilization | F | C* | — | C | I | R | T | A | T | F |
| Ratio Risk | F | C* | C | C | I | R | T | A | T | F |
| Future Staffing | F | C* | C | — | I | R | T | A | T | F |
| Enrollment Bottlenecks | F | C | — | — | I | R | T | A | T | F |

\* Home shows **attention** only (off-goal / not available with an active watch), not every healthy Answer.  
† Full in Calculation Library / advanced path.  
‡ May appear inside Room Utilization explanation, not as a standalone room card.  
§ BOS may explain when asked; not a primary recommendation driver.

---

## 7. Answer surface depths

Consumers show only the depth that fits their job. Depths describe **presentation of Answers**, not ownership of Measurements.

| Depth | Contents | Typical consumer |
|-------|----------|------------------|
| **D0 — Signal** | Health color / chip only | Home attention, queue badge |
| **D1 — Compact** | Current Answer + health + optional goal band | Locations room card, Programs card |
| **D2 — Contextual** | D1 + short “why” (shared explanation) | BOS reply, Workspace detail strip |
| **D3 — Operational** | D2 + room/date picker + Get answer + goal | OI Overview |
| **D4 — Accountable** | D3 + History + Settings (goal, definition binding) | OI full measurement workspace |
| **D5 — Authoring** | Definition builder / Calculation Library | OI Calculation Library |
| **D6 — Scenario** | Current + future Answer + delta vs scenario assumptions | Planning |
| **D7 — Aggregate** | Rollup + trend of Answers; no per-room history UI | Dashboards / Reports |

| Consumer | Default depth | May escalate to |
|----------|---------------|-----------------|
| Operational Intelligence | D4 | D5 |
| Locations (Room) | D1 | D2 → deep-link D4 |
| Programs | D1 | D4 |
| Planning | D6 | D4 (baseline Answer) |
| Workspace Home | D0 / D1 attention | D4 |
| BOS | D2 + Recommendation | D4 via link |
| Dashboard | D7 | D4 via link |
| Reports | D7 | D4 citation |
| API | Full Answer payload | Client chooses presentation |

---

## 8. Surface behavior by question (canonical)

### Future Room Capacity

| Consumer | Behavior |
|----------|----------|
| OI | Full workspace (D4) |
| Locations | Compact Answer card in Capacity section (D1); color = health |
| Planning | Scenario input (D6) from baseline Answer |
| BOS | Answer + optional recommendation when below goal |
| Dashboard | Trend of Answers / rooms below goal (D7) |

### Room Utilization

| Consumer | Behavior |
|----------|----------|
| OI | Full workspace; counting mode is configuration, not a sibling question |
| Locations | Compact utilization Answer % + health |
| Planning | Input from Answer; FTE vs headcount follows OI configuration |
| BOS | Off-goal → recommend review children / capacity / schedules |
| Dashboard | Distribution of rooms by utilization band (from Answers) |

### Equivalent Child Count / deferred questions

Same pattern when shipped: **OI = D4**, **domain product = D1**, **Planning = D6**, **BOS = D2+R**, **Dashboard = D7**. Do not invent parallel math.

---

## 9. Recommendation model

OI stays **passive** by default: Answer + health + history.

```text
Question → Answer → Health
  → Passive presentation
  → Recommendation-eligible (off-goal / sustained not available)
    → BOS packages Insight + Recommendation
      → Operator confirms
        → Registered Command / Workspace / Planning handoff
```

| Question | Default posture | Recommendation eligible when | Typical handoff |
|----------|-----------------|------------------------------|-----------------|
| Future Room Capacity | Passive | Below min seats goal | Review capacity binding; Planning scenario |
| Room Utilization | Passive | Outside healthy range | Review children / schedules / capacity |
| Equivalent Child Count | Passive | Rarely alone | Prefer Utilization recommendations |
| Program Utilization | Passive | Outside range | Program placement / capacity review |
| Ratio Risk | Alert-forward | Risk threshold breached | Staffing / coverage review |
| Future Staffing | Passive → Planning-heavy | Gap vs demand | Scheduling / hiring planning |
| Enrollment Bottlenecks | Attention-forward | Stage SLA / capacity choke | Pipeline work item |

**Ownership split:** OI owns Answer + health + eligibility signal · BOS owns conversation · Commands / Workspace / Planning own execution.

---

## 10. Alert routing

Defaults are product recommendations, not mandates.

| Condition | Notification | Task | Queue item | BOS suggestion | Nothing |
|-----------|--------------|------|------------|----------------|---------|
| First Answer, on goal | — | — | — | — | ✓ |
| Transition to below / above goal | Optional digest | Optional | — | ✓ (default) | — |
| Sustained off-goal | ✓ | Optional | Optional | ✓ | — |
| Not available (missing inputs) | Soft (config) | — | — | Explain missing input | Often ✓ |
| Ratio Risk breach | ✓ | ✓ preferred | Staffing queue if exists | ✓ | — |
| Enrollment bottleneck SLA | ✓ | ✓ | Pipeline queue | ✓ | — |

1. Alerts reference Answer identity (`observation_id` / replay key) and may cite `measurement_id` for deep link — never a free-text number alone.  
2. Task/Queue creation is **consumer policy**, not OI core.  
3. BOS suggestions are the default interrupt for capacity/utilization; hard notifications are opt-in.

---

## 11. Explainability

One explanation engine: the **Answer’s** shared explanation (deeper definition drill only inside OI).

| Consumer | Affordance |
|----------|------------|
| Locations Room | “Why?” → same Answer explanation; link to OI |
| BOS | “Explain” → same Answer explanation |
| Planning | Scenario assumptions **plus** baseline Answer explanation (labeled separately) |
| Dashboard | Tooltip: last Answer + health; deep explain via OI |
| Reports | Footnote: question, definition version, evaluated_at |

**Forbidden:** Consumer-local prose that recalculates differently from the Answer.

---

## 12. Integration sketches (presentation of Answers)

### Workspace

- Attention: D0–D1 for Answers whose health needs attention.  
- Deep link into OI for full accountability.

### Planning

- Reads **Answers** as baselines.  
- Scenarios labeled vs measured Answers.  
- Never mutates OI measurements by publishing a scenario.

### Locations

- Room Summary presents compact Answers (Capacity + Utilization).  
- Health from OI.  
- Drill to OI — not a Locations settings clone.

### Dashboards

- Aggregate and trend **Answers** (D7).  
- Click-through to OI for a single-room Answer workspace.

### BOS

- Same Question keys and Answer APIs as the UI.  
- Recommendations invoke existing commands; no BOS-private math.

---

## 13. Long-term consumer rollout order (after Phase 1 merge)

| Order | Slice | Why |
|------:|-------|-----|
| **1** | Canonical **Answer** API (observe / history / explain / health) | Sole read contract |
| **2** | Locations Room Summary compact Answer cards | Highest director encounter rate |
| **3** | Deep link into OI | Completes Question → Answer → Presentation loop |
| **4** | BOS Answer parity | Conversation matches UI |
| **5** | BOS recommendation eligibility | First non-passive value |
| **6** | Workspace Home attention | Ambient presentation of Answer health |
| **7** | Dashboard trends | Leadership aggregates of Answers |
| **8** | Planning baseline Answers | Scenario deltas over truth |
| **9** | Notification / task policies | Interrupt after compact + BOS paths |
| **10** | Reports / exports | Audit of Answers |
| **11–14** | New Questions only with matching consumer presentation | Program Utilization → Ratio Risk / Staffing → Bottlenecks → Surfaces |

---

## 14. Implementation roadmap (documentation phases)

| Phase | Name | Outcome |
|-------|------|---------|
| **2.0** | Contract freeze | This document + V1 Certified milestone accepted |
| **2.1** | Location presentation of Answers | Room Summary D1 + deep link |
| **2.2** | BOS parity + soft recommendations | Same Answers; off-goal suggestions |
| **2.3** | Ambient + aggregate | Workspace attention + Dashboard D7 |
| **2.4** | Planning consumption of Answers | Baseline + labeled scenario deltas |
| **2.5** | Policy interrupts | Notifications / tasks from sustained health |
| **2.6** | Next questions | Each ships with a consumer presentation slice |

---

## 15. Success criteria for Phase 2

1. A director sees Future Room Capacity and Room Utilization **Answers** on the Room without opening OI first.  
2. The Room Answer **matches** OI for the same room + date.  
3. “Why?” on the Room and “Explain” in BOS return the **same** Answer explanation.  
4. Off-goal Answers can become BOS recommendations without OI owning execution.  
5. Planning scenarios cite OI Answers and never silently replace them.  
6. No consumer ships a private utilization or capacity calculator.

---

## 16. Final recommendation — consumer order

After Phase 1 is merged:

1. Answer API as sole read contract  
2. Locations Room Summary (Answer cards)  
3. Deep link into OI  
4. BOS Answer parity  
5. BOS off-goal recommendations  
6. Workspace attention  
7. Dashboard trends  
8. Planning inputs  
9. Alert/task policies  
10. Reports  
11. New questions only with matching presentation  

**Stop.** Phase 2 begins with consumers presenting **Answers**, not with new platform primitives.
