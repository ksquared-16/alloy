# Alloy Services — Experience Design & V1 Blueprint

**Type:** Production-quality UX concept exploration + converged implementation blueprint (design sprint, no code).
**Builds on:** `financial_configuration_product_spec.md` §2 and `financial_experience_01_services.md` (the Operator Experience Specification). Those are canonical; this document explores *how the experience is shaped* and converges on the implementation target.
**Author posture:** Principal Product Designer / UX Architect / Director of Operations.
**Rule above all rules:** invent no new design language. Everything composes the frozen Configuration Runtime — the same shell, queue, workspace, cards, Alloy typography (`config-typo-*`), spacing, hierarchy, and **Bend Pine `#00a283`** active state used everywhere else in settings. When someone opens Services it must feel like *"this page has always existed."*

> **The problem all three concepts solve, differently:** a childcare director needs to answer **"What services does my organization provide?"** — not *"create a service record."* The winning concept is the one where the operator never once feels the record beneath the offering.

---

## 0. The shared chassis (constant across all three concepts)

Every concept lives inside the **frozen** Configuration Runtime shell — they differ only in what fills the Workspace, never in the chassis:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CONTEXT BAR  (ConfigurationContext)                                       │
│  "Services"   ·  "What your organization offers — and what each switches on"│
├───────────────┬───────────────────────┬────────────────────────────────────┤
│ SECTION QUEUE │  OBJECT QUEUE          │  WORKSPACE  (flex, ~950px @1920)   │
│ 260px         │  320px                 │                                    │
│               │                        │                                    │
│ FINANCIALS    │  Services        6     │   ← the three concepts differ      │
│  Overview     │  ● Full-Time Care      │     ONLY in here                   │
│ WHAT YOU SELL │  ● Before Care         │                                    │
│ ▸ Services    │  ● After Care          │                                    │
│  Rate Plans   │  ○ Drop-In             │                                    │
│ MONEY RULES   │  ● Registration        │                                    │
│  …            │  ○ Meals               │                                    │
└───────────────┴───────────────────────┴────────────────────────────────────┘
```

Constants (do not vary by concept): white canvas; stone borders (`--cr-stone-border`); `1rem` card radius; Bend Pine for active/complete/emphasis; `config-typo-page-title` (context), `config-typo-queue-item-title` (queue rows), `config-typo-workspace-title` (card headers), `config-typo-field-label` (labels), `config-typo-sublabel`/`meta` (secondary). Persistent `ConfigReadonlyNotice`: *"This is configuration. It does not post money."* Three Focus-Panel modes — **Summary / Work / Activity** — are the only depth mechanism (no tab chrome).

The Object Queue rows: a **completion glyph** (Bend Pine ● = active with a resolvable price path; hollow ○ = incomplete) + name + a **billing-rhythm chip**. This is constant; what happens when you *select* a row is the concept.

---

# CONCEPT A — Guided Setup

*"A beautiful onboarding. Configure one service at a time, with progress and recommendations."*

### A.1 Purpose
Turn first-time financial setup into a confident, sequential build: the operator configures services one at a time, guided, with the system recommending the common path and showing how far along they are.

### A.2 Primary operator goal
*"Walk me through setting up everything I offer — don't let me miss anything."*

### A.3 Screen hierarchy
The Workspace becomes a **single-service focus canvas** with a persistent **setup progress rail** at top.

```
WORKSPACE
┌────────────────────────────────────────────────────────────┐
│  Setting up your services            ▓▓▓▓▓░░  4 of 6 done   │  ← progress rail
├────────────────────────────────────────────────────────────┤
│  Full-Time Care                              [Recurring]    │  ← one service, large
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Step 2 of 5 · What does this service power?         │  │  ← guided step card
│  │  ◉ Creates a schedule   ◉ Tracks attendance         │  │
│  │  ◉ Consumes capacity    ◉ Priced by a Rate Plan     │  │
│  │                                                      │  │
│  │  💡 Most full-day care tracks attendance and is      │  │  ← recommendation
│  │     priced weekly. We've set sensible defaults.      │  │
│  │                          [ Back ]   [ Next: Pricing ]│  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### A.4 Cards
Cards appear **one step at a time** (Identity → Switchboard → Pricing → Programs → Revenue home), each a large `ConfigurationDetailCard` filling the canvas, with a recommendation strip and Back/Next. The card set is the spec's §6 cards, sequenced rather than stacked.

### A.5 Sections
The setup rail replaces the static card stack with an ordered sequence; the Object Queue still lists all services so the operator sees the whole set, with per-service progress rings.

### A.6 Progressive disclosure
Disclosure is **temporal** — you only see the current step. Advanced fields are an optional "More options" within a step. Billing rhythm chosen at step 1 prunes later steps (One-time skips Scheduling/Attendance/Capacity).

### A.7 Editing workflow
First pass: linear Next/Back. After completion the service "graduates" to a normal Summary view; re-editing reopens the relevant step card in place.

### A.8 Relationships
Each relationship is introduced as its own guided step with explanation ("Which programs deliver this? Programs are how you group ages — Toddler, Preschool, Pre-K"). Read-through deep-links still point to Rate Plans/Charges/Accounting for authoring.

### A.9 Validation
Step-gated: the operator can't advance past Pricing with Tuition on and no price without seeing the attention read inline ("a family enrolling today would have no tuition") — but is never hard-blocked (can save as Draft and continue).

### A.10 Versioning
Largely absent during first build (nothing to supersede yet). Post-graduation, "Schedule a change" appears on the graduated Summary view; the guided flow itself is not versioned.

### A.11 Empty state
The strongest empty state of the three: a warm "Let's set up what you offer" hero with the BOS seed proposal front and center, flowing straight into step 1.

### A.12 First-run state
This concept **is** the first-run state — it shines exactly once.

### A.13 Power-user flow
Weak. A returning admin who wants to change one switch on one service must re-enter a stepped flow or wait for "graduation" mode. Fast edits feel gated.

### A.14 BOS opportunities
Rich: per-step recommendations, the seed proposal, "you usually price care weekly," progress nudges ("2 services left"). BOS as a guide.

### A.15 Advantages / Weaknesses
- **Advantages:** unbeatable first-run confidence; nobody misses a step; recommendations land at the moment of decision; teaches meaning by sequencing it.
- **Weaknesses:** a wizard is wrong for the 80% of visits that are quick edits; hides the holistic, connected nature of a Service (you see steps, not the switchboard whole); "graduation" creates two different UIs for the same object; re-entry friction; can feel like software-onboarding rather than operating.

---

# CONCEPT B — Operational Workspace

*"The service is always visible. Programs, Rate Plans, Charges, Policies, Capabilities — everything feels connected."*

### B.1 Purpose
Present a Service as a living operational object whose every relationship is visible at once, so the operator sees — and operates — the whole switchboard and its connections in a single calm view.

### B.2 Primary operator goal
*"Show me this offering and everything it touches, and let me adjust any of it from here."*

### B.3 Screen hierarchy
The Workspace is a **two-column connected canvas**: the switchboard and identity on the left (the Service itself), the relationship constellation on the right (what it connects to), all in Summary mode.

```
WORKSPACE
┌───────────────────────────────┬────────────────────────────────┐
│  Full-Time Care   [Recurring] │  Which programs deliver it?     │
│  "Full-day care, 5 days/wk."  │   [Toddler][Preschool][Pre-K]   │
│  Sold per week · Active       ├────────────────────────────────┤
│                               │  How is it priced?              │
│  WHAT DOES THIS POWER?        │   Standard Tuition · $145–285/wk│
│  ◉ Creates a schedule         │   → Open in Rate Plans          │
│  ◉ Tracks attendance          ├────────────────────────────────┤
│  ◉ Consumes capacity          │  Charges that post here    3    │
│  ◉ Families can wait          │   Registration · Field Trip …   │
│  ◉ Priced by a Rate Plan      │   → Open in Charges             │
│  ◉ Visible to families        ├────────────────────────────────┤
│                               │  Where does its revenue land?   │
│  [ Advanced ▾ ]               │   Tuition → 4000 Tuition Revenue│
└───────────────────────────────┴────────────────────────────────┘
```

### B.4 Cards
All §6 cards visible simultaneously: Identity + Switchboard anchored left; Programs, Pricing, Charges, Revenue-home as a right-hand stack of `ConfigurationDetailCard`s. Connectedness is the point — the operator sees the whole graph node.

### B.5 Sections
No sequencing; the Service detail is one dense, scannable Summary surface. Object Queue switches between service nodes.

### B.6 Progressive disclosure
**Spatial, not temporal:** everything relevant to the rhythm is shown; Advanced collapses proration/tax under a disclosure; Activity (history) is a mode away. Billing rhythm still prunes which right-column cards appear (Recurring shows Rate Plan; One-time shows Charges).

### B.7 Editing workflow
Inline everywhere: toggle a switch in place (with consequence confirmation); edit name/sentence inline; relationship cards are read-through with deep-links to their authoring homes. No mode change to make a quick edit.

### B.8 Relationships
The hero of this concept. Programs, Rate Plans, Charges, Accounting each render as a live relationship card with a count/summary and a deep-link — the Service visibly *connected* to the rest of Financials.

### B.9 Validation
Attention states decorate the relevant card in place (price card glows ember if Tuition-on-no-price) and roll up to the queue glyph and Overview readiness — all without leaving the view.

### B.10 Versioning
"Schedule a change" lives on the price-affecting fields; the version timeline is the Activity mode of this same canvas. Operate and history are two modes of one surface.

### B.11 Empty state
Weaker than A: an empty Service canvas (mid-add) can feel like a lot of empty cards. Needs the add flow to populate it (see convergence).

### B.12 First-run state
Weakest of the three at zero-state: confronting a new operator with the full connected canvas before they understand the pieces risks the "everything at once" overwhelm the Visual Language warns against (#8 calm under pressure).

### B.13 Power-user flow
The strongest of the three. A returning admin sees the whole offering and edits any facet in one or two clicks, no wizard, no mode dance. This is the daily-driver view.

### B.14 BOS opportunities
Ambient attention chips on the relevant card ("recurring but no price — fix in Rate Plans?"), connection health ("this service tracks attendance but isn't priced"). BOS as a quiet co-pilot in the margins.

### B.15 Advantages / Weaknesses
- **Advantages:** matches the spec's core thesis (a Service is a switchboard/hub) better than any other; best for returning + power users; shows connectedness; one object, one surface, three modes; zero re-entry friction.
- **Weaknesses:** intimidating on first-run/empty; offers little *guidance* on what to do next; assumes the operator already knows what each relationship means; recommendation surface is thinner than A.

---

# CONCEPT C — Journey First

*"Configure one service by answering operational questions. Not forms — questions."*

### C.1 Purpose
Author a Service as a sequence of **operational questions** the director already asks aloud, so configuration feels like answering, not filling. Intent precedes data (Operational Grammar Law #3).

### C.2 Primary operator goal
*"Just ask me about this offering and I'll tell you how it works."*

### C.3 Screen hierarchy
The Workspace is a **single, advancing question** with a quiet trail of answered questions above it — a conversation, not a form.

```
WORKSPACE
┌────────────────────────────────────────────────────────────┐
│  ✓ Who receives this service?      Children, on enrollment  │  ← answered (collapsed)
│  ✓ When is it delivered?           Weekdays, full day        │
│  ────────────────────────────────────────────────────────── │
│  How is it billed?                                          │  ← active question, large
│     ◉ Recurring (a regular tuition)                         │
│     ○ One-time (a single charge)                            │
│     ○ Usage-based (per item or visit)                       │
│                                                             │
│     ↳ "This sets what the service switches on next."        │
│                                  [ Back ]      [ Continue ] │
│  ────────────────────────────────────────────────────────── │
│  ◌ How is attendance tracked?                               │  ← upcoming (dimmed)
│  ◌ What capabilities does it enable?                        │
│  ◌ What charges use it?                                     │
└────────────────────────────────────────────────────────────┘
```

The question sequence: **Who receives this? → When is it delivered? → How is it billed? → How is attendance tracked? → What capabilities does it enable? → What charges use it?**

### C.4 Cards
Each question is a lightweight card with 2–4 plain-language options (not fields). Answered questions collapse to a one-line "✓ Question — answer" trail the operator can revisit. No `ConfigField` grids during authoring — those are for the Summary read *after*.

### C.5 Sections
The journey is the section structure. After the last question, the answers compose into the spec's §6 Summary card stack — the same object, now in read mode.

### C.6 Progressive disclosure
**Question-gated:** "How is it billed?" determines which later questions even appear (One-time skips the attendance/capacity questions). Maximum disclosure discipline — you only ever see one decision.

### C.7 Editing workflow
Author-by-question on add. To change later, the operator re-opens a single answered question from the trail (or edits the resulting Summary card directly). Questions are reversible and non-destructive.

### C.8 Relationships
Introduced as questions: "What charges use it?" surfaces the Charges relationship; "Which programs deliver it?" is the "Who receives this?" answer. Authoring still routes to the real homes.

### C.9 Validation
Per-answer, conversational: choosing Recurring then skipping price prompts gently at the end ("You set this as recurring but haven't priced it — set a price in Rate Plans, or save as a draft").

### C.10 Versioning
The journey authors the first version; subsequent changes use "Schedule a change" on the composed Summary. The Q&A is not itself a version history.

### C.11 Empty state
Strong and inviting: a single first question ("What are you setting up?") is the least intimidating possible start.

### C.12 First-run state
Excellent — the most operator-native first-run: it literally asks the director what she already knows, in her words.

### C.13 Power-user flow
Mixed. Wonderful for thoughtful authoring; slow for "flip one switch" — a power user doesn't want a conversation to toggle Capacity off.

### C.14 BOS opportunities
BOS pre-answers questions from context ("Most full-day care is billed Recurring — is that right?"), turning the journey into a confirm-flow. BOS as interviewer.

### C.15 Advantages / Weaknesses
- **Advantages:** the purest expression of "operators answer questions, not edit records"; best teaching of *meaning*; least intimidating; intent-first; reversible.
- **Weaknesses:** linear Q&A is slow for edits; can feel like a chatbot if overdone; hides the connected whole during authoring; risk of too many questions for a simple offering.

---

# CRITIQUE & CONVERGENCE

### What each gets right
- **A (Guided Setup):** *orientation and recommendation.* Progress and "we set sensible defaults" land confidence at first-run. Nobody misses a step.
- **B (Operational Workspace):** *the truth of the object.* A Service IS a connected switchboard, and B is the only concept that shows it whole. It is the correct **daily-driver** surface and the best power-user experience.
- **C (Journey First):** *the soul of Alloy.* "Answer questions, not edit records" is the platform's doctrine made literal. It is the correct **authoring/first-run** surface and the best teacher of meaning.

### What each gets wrong
- **A:** wrong as a *permanent* shape — a wizard you re-enter for a one-switch edit; the "graduation" split creates two UIs for one object; shows steps, not the connected whole.
- **B:** wrong as a *zero-state* — the full connected canvas overwhelms a new operator and offers little guidance on what to do next.
- **C:** wrong as an *editing* shape — a conversation to flip one toggle is friction; can drift toward chatbot; hides connectedness during authoring.

### The surviving ideas
1. **B's connected Operational Workspace is the home/returning state.** (The switchboard whole + live relationship cards, Summary mode.)
2. **C's question sequence is the add/first-run authoring flow.** (Intent-first; answers compose into B's Summary.)
3. **A's progress + recommendations survive as the Overview journey rail + a BOS proposal layer** — *not* as a forced wizard. Guidance becomes ambient, not modal.

### The convergence thesis (not a compromise)
The three concepts are not three designs of one screen — they are **three moments of one object's life**: *being born* (C), *being operated* (B), *being learned/oriented* (A). The strongest product gives each moment the shape it deserves, unified by the frozen shell and the Summary/Work/Activity mode model. Nothing is averaged; each idea owns the moment it's strongest.

---

# ALLOY SERVICES V1 — the implementation target

A **mode-adaptive Service workspace**: the same frozen shell, where the Workspace takes one of three shapes depending on what the operator is doing — **Operate** (B), **Author** (C), **History** (Activity) — with **orientation & recommendation** (A) layered ambiently across all three. This is the canonical Services experience.

## V1.1 The constant frame
Context bar + 260 Section Queue + 320 Object Queue (all per §0). The Object Queue is the spine of *operating*: every service, completion glyph, rhythm chip, count. A persistent **"Add a service"** `ConfigPrimaryButton` sits in the Object Queue header. The Workspace shape is chosen by state:

| Operator is… | Workspace shape | Source concept | Mode |
|---|---|---|---|
| Returning, a service selected | **Operate** — connected switchboard canvas | B | Summary |
| Adding / first-run | **Author** — question sequence | C | Work |
| Reviewing change history | **History** — version timeline | spec §16 | Activity |
| Anywhere | **Orientation** — journey progress + BOS chips | A | (ambient overlay) |

## V1.2 OPERATE shape (the home state — Concept B)
The daily driver. Selecting a service fills the Workspace with the connected canvas:

```
WORKSPACE  (Summary mode)
┌───────────────────────────────────────┬──────────────────────────────────────┐
│  Full-Time Care            [Recurring] │  Which programs deliver it?           │
│  config-typo-workspace-title           │  [Toddler] [Preschool] [Pre-K]  [＋]  │
│  "Full-day care, 5 days a week,        │  config-typo-sublabel on empty        │
│   billed weekly."   ·  Sold per week   ├──────────────────────────────────────┤
│  Status: ● Active                      │  How is it priced?                    │
│                                        │  Standard Tuition · $145–$285 / week  │
│  ── WHAT DOES THIS SERVICE POWER? ──   │  → Open in Rate Plans                 │
│                                        │  (ember attention here if no price)   │
│  ◉ Creates a schedule                  ├──────────────────────────────────────┤
│  ◉ Tracks attendance                   │  Charges that post here          3    │
│  ◉ Consumes capacity                   │  Registration · Field Trip · Late…    │
│  ◉ Families can wait for it            │  → Open in Charges                    │
│  ◉ Priced by a Rate Plan               ├──────────────────────────────────────┤
│  ◉ Visible to families                 │  Where does its revenue land?         │
│                                        │  Tuition → 4000 Tuition Revenue       │
│  [ Advanced ▾ ]   [ Schedule a change ]│  → Change in Accounting               │
└───────────────────────────────────────┴──────────────────────────────────────┘
```

**Layout spec (mockup-ready):**
- Two columns inside the Workspace, ~`44% / 56%` split, `1.5rem` gutter. Left = the Service itself (identity + switchboard); right = the relationship constellation.
- **Left column.** Identity block at top: name in `config-typo-workspace-title` (`1.1875rem/600`), one-sentence meaning in `config-typo-sublabel` directly beneath, then a meta line "Sold per week · ● Active" in `config-typo-meta`. The billing-rhythm chip sits top-right of the identity block, Bend-Pine-bordered pill. Below a `1px` stone divider, the **switchboard** under a `config-typo-queue-section-label` header "WHAT DOES THIS SERVICE POWER?". Six switch rows, `0.75rem` vertical rhythm; each row = toggle (Bend Pine when on) + label (`config-typo-field-label` weight, sentence case) + a `config-typo-meta` read-through when on ("Enrolling a child here creates a weekly schedule").
- **Right column.** A vertical stack of four `ConfigurationDetailCard`s (Programs, Pricing, Charges, Revenue-home), `1rem` gap, each `1rem` radius / `1px` stone border / white. Card header = the operator question in `config-typo-field-label` uppercase; body = `ConfigField`/chips/summary. A trailing `→ Open in …` deep-link in Bend Pine sits bottom-left of each relationship card. The Charges card carries a count chip top-right.
- **Visual emphasis.** The switchboard is the visual anchor (largest contiguous block, left, above the fold). Bend Pine is reserved for: active toggles, the rhythm chip border, deep-links, and the completion glyph. Attention is **ember** and appears only on the affected card + the queue glyph (e.g. Pricing card border/icon turns ember when Tuition-on-no-price), never as a global banner.
- **Progressive disclosure.** Billing rhythm prunes the right column (Recurring → Pricing card; One-time/Usage → the Charges card leads, Pricing hidden). "Advanced ▾" reveals proration-eligibility + tax on the left, collapsed by default. Activity is one mode away.
- **Interactions.** Toggles flip inline; any live-operation toggle (Scheduling/Attendance/Capacity/Portal *off*) raises the consequence confirmation (spec §9–§13) before commit. Name/sentence edit inline on click. Relationship cards are read-through — their only action is the deep-link (no in-place authoring). "Schedule a change" opens the History/editor for price-affecting fields.

## V1.3 AUTHOR shape (add & first-run — Concept C)
Clicking **"Add a service"** (or first-run empty state) replaces the Workspace with the question sequence — intent-first, the spec's §20 add flow made conversational:

```
WORKSPACE  (Work mode — authoring)
┌────────────────────────────────────────────────────────────┐
│  ✓ What are you setting up?     "Full-Time Care"            │  answered trail
│  ✓ How is it billed?            Recurring · per week        │  (collapsed, revisitable)
│  ──────────────────────────────────────────────────────────│
│  What does it switch on?                                    │  active question, large
│  We've set the usual defaults for recurring care —          │  ← A's recommendation voice
│  confirm or adjust:                                         │
│     ◉ Creates a schedule     ◉ Tracks attendance            │
│     ◉ Consumes capacity      ◉ Families can wait            │
│     ◉ Priced by a Rate Plan  ◉ Visible to families          │
│                                   [ Back ]   [ Continue ]   │
│  ──────────────────────────────────────────────────────────│
│  ◌ Which programs deliver it?                               │  upcoming (dimmed)
│  ◌ What charges use it?                                     │
└────────────────────────────────────────────────────────────┘
```

**Layout spec:**
- Single centered column, max ~`640px`, generous `2rem` vertical rhythm — calm, one decision at a time.
- **Answered trail** above: each a collapsed `✓ Question — answer` row in `config-typo-meta`, Bend-Pine check, click to revisit (re-expands that question, non-destructive).
- **Active question:** the question in `config-typo-workspace-title`; a one-line recommendation in `config-typo-sublabel` (Concept A's voice, now ambient not modal); 2–4 plain-language options as large selectable rows (radio for single, toggles for the switchboard step). `[Back]` (`ConfigSecondaryButton`) + `[Continue]` (`ConfigPrimaryButton`) in a `ConfigButtonRow`, right-aligned.
- **Upcoming questions** below, dimmed `◌`, so the operator sees the path without being able to jump ahead unanswered.
- **Sequence:** What are you setting up? (name) → How is it billed? (rhythm — *this prunes the rest*) → What does it switch on? (switchboard, pre-set) → Which programs deliver it? → What charges use it? (One-time) / confirm price path (Recurring). On finish, the answers **compose directly into the V1.2 Operate canvas** — same object, now read mode. No "graduation to a different UI": Author and Operate are two shapes of one workspace.
- **BOS:** can pre-answer from context ("Most full-day care is Recurring — right?"), turning steps into confirmations.

## V1.4 HISTORY shape (Activity mode — spec §16)
The version timeline for price-affecting attributes and retirement: Current / Scheduled / Superseded / Retired rows (`ConfigVersionBadge`), each "what changed, in operator words · effective date · who scheduled it." "Schedule a change" and "Void scheduled" live here. This is the same canvas in Activity mode — depth on demand.

## V1.5 ORIENTATION layer (Concept A, ambient — across all shapes)
A's progress and recommendations survive **without a wizard**:
- **Overview journey rail** (spec §1.2) shows Services as step 1 of 6 with its completion state — the progress A wanted, relocated to where orientation belongs.
- **The Object Queue glyphs + count** are the per-service progress A wanted, distributed onto the real list.
- **BOS proposal chips** (seed common services; missing-price; capability sanity) are A's recommendations as approve-able proposals (spec §23), appearing in the empty state and as margin attention — never as forced modal steps.

## V1.6 Empty & first-run
- **Empty (zero services):** `ConfigurationEmptyState` — *"No services yet. Services are the things your organization offers — full-time care, before & after care, drop-in, meals, registration. Start with the one most families enroll in."* + `ConfigPrimaryButton` "Add your first service" → opens the **Author** shape. BOS chip: *"Most childcare orgs start with Full-Time Care, Before Care, After Care. Want these as drafts?"*
- **First-run vs returning:** first-run lands on the empty state → Author (C). Returning lands on the Object Queue list → Operate (B) on selection. The Services journey glyph reflects real state. This is exactly the spec's §19 split, now mapped to shapes.

## V1.7 Power-user flow
A returning admin: queue → select service → Operate canvas → flip any switch or follow any deep-link in one click, no wizard, no mode dance. Bulk/seed actions are BOS proposals. This is B's strength, preserved as the default.

## V1.8 Validation, versioning, relationships, BOS
Unchanged from the Operator Experience Specification (§15, §16, §8–§14, §23) — V1 only chooses *where each renders*: attention on the affected card + queue glyph + Overview readiness (Operate & end-of-Author); "Schedule a change" in History; relationships as read-through cards with single authoring homes; BOS as ambient proposal chips.

## V1.9 Why this is the convergence, not a compromise
- The operator who is **learning** gets C's questions and A's recommendations — the gentlest possible on-ramp.
- The operator who is **operating** gets B's connected switchboard — the truest view of what a Service is.
- The operator who is **auditing** gets the Activity timeline.
- One object, one frozen shell, three shapes, one mode model. Each concept owns the moment it is strongest; none is diluted to fit the others. The add-flow is not bolted onto the operate-view — they are the **Work** and **Summary** modes of a single canvas, so there is no "graduation" seam and no second UI.

## V1.10 Success test
When Maya opens Services she is *asked what she offers* (Author), then *shown her offering as a living switchboard connected to everything it touches* (Operate), and never once types an ID, sees a "record", or fills a Name/Type/Description form. She is configuring **how her business operates** — which is the entire point.

---

## Appendix — concept-to-V1 traceability

| Idea | Origin | Role in V1 |
|---|---|---|
| Connected switchboard canvas, all relationships visible | B | **Operate** shape (home/returning) |
| Question sequence, answers-not-forms | C | **Author** shape (add/first-run) |
| Billing rhythm prunes the path | C / spec | Gating in both Author & Operate |
| Progress + "sensible defaults" recommendations | A | Overview journey rail + ambient recommendation voice in Author |
| Per-service progress | A | Object Queue glyphs + count |
| Recommendations / seed / missing-price | A | BOS proposal chips (approve-able, not modal) |
| Version timeline | spec §16 | **History** (Activity) shape |
| Read-through relationships, single authoring home | spec §8–§14 | Relationship cards in Operate |
| Consequence confirmations on live toggles | spec §9–§13 | Inline in Operate |

**Discarded (and why):** A's forced wizard as the permanent shape (re-entry friction, two-UI split); B's full canvas as the zero-state (overwhelm); C's conversation as the editing shape (friction for one-switch edits). Each is wrong only *as a universal* — each is right for its moment, which is exactly how V1 deploys them.
