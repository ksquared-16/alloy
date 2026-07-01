# Operational Answers Platform

**Status:** Doctrine — approved design, pre-implementation (July 2026).

---

## Purpose

Alloy is an operating system, not a dashboard. Operators do not arrive to observe metrics. They arrive to answer operational questions and act immediately.

This doctrine introduces three new platform primitives — **Operational Answer**, **Runtime Presentation**, and **Operational Instrument** — and places them in the existing platform pipeline alongside Fields, Operational Facts, Operational Calculations, Surface Builder, and Runtime.

---

## Platform pipeline

```
Fields
  ↓  stored attributes on records
Operational Facts
  ↓  workflow_events · emitEvent — the append ledger
Operational Calculations
  ↓  registry resolves facts → measurements + state conditions
Operational Answers
  ↓  semantic output: question + answer + state + evidence + drill
Runtime Presentations
  ↓  reusable renderers: CompactInstrument, ExpandedInstrument, Tabular, …
Surface Builder
  ↓  answer placement: which answers appear, in what order, at what density
Published Surfaces
  ↓  workspace_operational_views · placements
Runtime
  ↓  hydrates answers, selects renderer, delivers to operator surfaces
Operator Action
     drill · queue · review · communicate
```

Each layer has exactly one responsibility. No layer invents meaning that belongs to another.

---

## Primitive: Operational Answer

An Operational Answer is the semantic output of an Operational Calculation. It is not a value. It is an answer to an operational question that the calculation was authored to answer.

### Contract

```typescript
type AnswerState =
  | "healthy"    // operating within normal parameters
  | "caution"    // approaching a threshold — attention warranted
  | "critical"   // threshold breached — action warranted
  | "empty"      // no data yet — intentional, not broken
  | "stale"      // data exists but freshness has expired
  | "loading";   // hydrating

type AnswerTrend = {
  direction: "up" | "down" | "flat";
  magnitude: string;          // "+3", "−12%", "no change"
  window: string;             // "this week", "vs. last 30d"
  valence: "positive" | "negative" | "neutral";
  // valence is decoupled from direction — enrollment up is positive;
  // waitlist up may be negative. The calculation knows; the renderer does not.
};

type AnswerFreshness = {
  isLive: boolean;
  updatedAt?: string;         // "2m ago", "today at 9:14 am"
  cadence?: string;           // "updates hourly", "recalculates on enrollment change"
};

type OperationalAnswer = {
  key: string;                // "enrollment.total", "capacity.fill_rate"
  question: string;           // "How many students are enrolled?"
  label: string;              // "Enrolled" — short surface label
  primaryValue: string;       // pre-formatted by the calculation — "142", "89%"
  state: AnswerState;
  answer: string;             // "Healthy", "Approaching Full", "Needs Review"
  evidence?: string;          // "2 classrooms remaining", "5 moved today"
  trend?: AnswerTrend;
  freshness: AnswerFreshness;
  confidence?: number;        // 0–1; present only for AI/derived answers
  recommendedDrill?: {
    label: string;            // "Open Waitlist Queue" — operator-facing action language
    surface: string;          // route or panel key
    filter?: Record<string, unknown>;
  };
  emptyState: {
    message: string;          // "No enrollments yet"
    action?: { label: string; key: string };
  };
  lane: "operational" | "ai";
  sourceCalculationKey: string;
};
```

### Authorship rule

The calculation author writes every field in this contract. The `answer` field ("Healthy", "Approaching Full") is business language authored by the person who understands the domain. The renderer never invents it.

The `evidence` field is optional secondary context that supports the answer — "2 classrooms remaining" is evidence for "Approaching Full." Both are authored in the calculation.

### State is semantic, not visual

`state` is a semantic signal. The renderer decides how to express `caution` visually — whether through color, language, or layout. The calculation does not prescribe colors. This separation ensures the same answer renders consistently in a compact instrument, an expanded panel, and a report row, and consistently in future contexts not yet designed.

### Trend valence is decoupled from direction

Enrollment count going up has `direction: "up"` and `valence: "positive"`. Waitlist growing has `direction: "up"` and `valence: "negative"`. The calculation knows the business context; the renderer applies the appropriate visual treatment based on valence.

### Empty state is operational information

An empty answer is not missing data. It is a valid operational state — "No enrollments yet" communicates that the process has not started. An empty answer renders with an intentional empty state; it does not disappear. `if (answers.length === 0) return null` is a bug, not a feature.

---

## Primitive: Runtime Presentation

A Runtime Presentation is a reusable renderer that accepts an `OperationalAnswer` and renders it for a specific surface context. The presentation never changes the answer's meaning — it changes only the visual form.

### Current presentations

| Key | Context | Density |
|-----|---------|---------|
| `compact-instrument` | Workspace Header, Work Unit Header | Tight — value + answer + trend |
| `expanded-instrument` | Operational Intelligence panel | Full — all fields including evidence, drill, confidence |
| `tabular` | Reports, exports | One row per answer |
| `badge` | Focus Panel, inline Cards | State dot + value only |
| `ai-narrative` | BOS bar, Focus Panel AI section | Natural-language rendering of the answer |

Surface Builder selects the presentation when placing an answer. Adding a new surface requires selecting an existing presentation — not authoring a new visual component.

---

## Primitive: Operational Instrument

An Operational Instrument is the visual component family that implements `compact-instrument` and `expanded-instrument` presentations. It is the first and primary Runtime Presentation.

An Instrument communicates, in priority order:

1. **State** — healthy, caution, or critical?
2. **Value** — what is the primary number?
3. **Label** — what does it measure?
4. **Answer** — what does the state mean in English?
5. **Evidence** — what supports the answer?
6. **Trend** — is it moving?
7. **Freshness** — is this current?
8. **Drill** — where does the operator go next?

This hierarchy is the reverse of most KPI systems, which lead with label → value → trend. Alloy leads with state because an operator scanning the workspace header needs "healthy or not" before anything else.

---

## Relation to existing platform primitives

### Fields

Fields are stored attributes on records. They are not Operational Answers — they are raw material that Operational Calculations consume. A field value (date of birth, program fee) may feed a calculation; it is not itself an answer.

### Operational Facts

`workflow_events` and `emitEvent` are the append ledger of what happened. Facts feed calculations. The Operational Facts model (hybrid, not event-sourced) is established doctrine — this platform does not change it.

### Operational Calculations

Calculations transform facts into measurements. The upgrade in this doctrine: calculations now resolve to a full `OperationalAnswer` — not just a `value: string`. The calculation author defines `state` conditions, the `answer` text, `evidence`, trend `valence`, and `recommendedDrill`. These are business-logic decisions; they live in the calculation layer.

What belongs in Calculations:
- State threshold logic (`if fill_rate > 0.85 → "caution"`)
- Answer language (`"Approaching Full"`)
- Evidence text (`"2 classrooms remaining"`)
- Trend valence interpretation
- Recommended drill target and label
- Empty state message and optional action
- Freshness cadence

What does not belong in Calculations:
- Visual treatment (colors, typography, layout)
- Which surfaces display this answer
- Display ordering
- Density variant selection

### Surface Builder

Surface Builder is unchanged architecturally. It composes answers into surfaces — selecting which answers appear, in what order, and which Runtime Presentation renders each one. It does not re-author operational meaning.

Surface Builder can allow a `labelOverride` — a display rename of the label field. It cannot override `state` logic, `answer` text, or `recommendedDrill`. Those are calculation concerns.

### Runtime

Runtime hydrates published surfaces: loads placements from `workspace_operational_views`, resolves each answer by calling the calculation resolver, selects the renderer based on the placement's `presentation` key, and delivers the rendered output to the operator surface.

`KPIBlock` → `OperationalAnswerStrip`  
`KPIVm` → `OperationalAnswer`  

The component rename signals the semantic shift. The implementation is additive — existing placements remain valid; new placements gain the full answer contract.

### Cards

Cards are reusable operational building blocks for queues and record surfaces. The `badge` Runtime Presentation embeds an Operational Answer inside a Card — the two systems compose without coupling.

### Business Processes and Actions

Business Processes define operational stages; Actions are the executable operations operators invoke. Operational Answers feed the header and intelligence surfaces that sit above both — they contextualize the stage the operator is working in. An answer's `recommendedDrill` may point to an Action as its target.

---

## Calculation type hierarchy

| Term | Definition | Output |
|------|------------|--------|
| Field | Stored attribute on a record | Raw value |
| Formula | Derived value from one or more fields | Calculated value |
| Rollup | Aggregation across related records or facts | Aggregated value |
| Metric | Named, reusable calculation — Field, Formula, or Rollup | Value + unit |
| KPI | Metric promoted to a high-visibility surface | Metric + placement metadata |
| Score | Composite weighted result (multiple metrics → 0–100) | Normalized score |
| Operational Answer | Full semantic output of any Metric, KPI, or Score for operator surfaces | Answer contract |
| Operational Question | Human-readable question that an Answer resolves | Authored in the calculation |

**Scope rule:** Operational Answer is the output type for calculations that surface to operators. Calculations that produce intermediate values consumed by other calculations output raw values, not Answers. A formula computing a student's age feeds another calculation; it is not itself an Answer. A formula computing "Is this student's immunization record complete?" is an Answer — it communicates operational state to an operator.

---

## Domain expansion

Once the Operational Answer contract and Runtime Presentations are in place, future domain modules add capability by:

1. Defining new Operational Calculations for their domain
2. The calculations resolve to `OperationalAnswer` using the standard contract
3. Surface Builder places them on the appropriate surfaces
4. Runtime renders them using existing presentations

Domains that will follow this pattern: Billing, Scheduling, Attendance, Processing, Communications, Compliance, AI-generated signals. No new UI paradigm is required for each domain.

---

## Terminology

Use these terms consistently:

| Use | Avoid |
|-----|-------|
| Operational Answer | KPI, metric tile, scorecard widget |
| Operational Instrument | KPI card, dashboard tile, metric card |
| Runtime Presentation | UI component, widget |
| Workspace Header | Top band, KPI strip |
| Work Unit Header | Department header, stage header |
| Operational Intelligence | Analytics, dashboards |
| Focus Panel | Drawer, side panel, record panel |

---

## What this is not

This is not a dashboarding system. Dashboards are observer surfaces. Operational Answers are operator surfaces — they exist to accelerate decisions and actions, not to visualize data for periodic review.

This is not a BI or reporting system. Reports and exports are downstream consumers of Operational Answers via the `tabular` presentation. The calculation layer is not designed for ad-hoc query or pivot exploration.

This is not a configuration feature. Authors configure which answers appear on which surface. They do not configure pixels, colors, or layout. Runtime owns presentation.

---

## Related docs

- `../foundation/architecture.md` — platform pipeline context
- `../governance/glossary.md` — canonical terminology
- `../../system/workspace-system.md` — Workspace, Work Unit, Focus Panel, Operational Intelligence
- `../../sprints/06_2026/analytics-operational-intelligence-platform/` — sprint history (Phase 1 shipped)
