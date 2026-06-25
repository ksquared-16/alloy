# Alloy OS — System 4: Universal Card System

**Path:** `docs/sprints/06_2026/alloy_os_system_4_universal_card_system.md`
**Status:** **REVISION 5 — domain pressure test, recommend freeze pending sign-off.** No production code. No runtime spec promotion.
**Primary artifact:** Cursor Canvas `universal-card-system.canvas.tsx` (Revision 5)

> **Revision 5:** Compact Work Launcher (~68px). Domain pressure tests: Billing, Scheduling, Attendance. Config pseudo-schema validated. **Recommend freezing Concept B** after sign-off.

## Revision 5 summary

| Area | Update |
|------|--------|
| Work Launcher | ~68px compact card — 3 one-line rows — secondary to blockers/workflow steps |
| Work idle | Required Information → launcher → tasks/automations → primary next action |
| Work active | Workflow steps primary; launcher receded (65% opacity) |
| Billing test | Summary/Work/Activity + card universality matrix |
| Scheduling test | Summary/Work/Activity + card universality matrix |
| Attendance test | Summary/Work/Activity + card universality matrix |
| Config pressure test | Pseudo `mode_layout` for Enrollment · Billing · Attendance Summary |
| Freeze recommendation | **Concept B recommended for approval** — same grid engine composes all domains |

**Final recommendation:** Concept B — responsive operational grid (unchanged direction, richer spec). A = narrow collapse. C = rejected as default.

**Remains unknown:** Field System spec, Communications module API, BOS Assist handoff, grid engine implementation detail, per-card warm-swap reveal, Runtime Spec tier amendment promotion.

**Configuration Runtime thread:** card composition schema, mode layout variants, work launcher rules, field widget catalog, metric placements, comms embed contract, card visibility per stage/mission.
**Expands:** [`docs/platform/operator/alloy-runtime-specification.md`](../../platform/operator/alloy-runtime-specification.md) Part 7 (Universal Card System), Part 8 (Card Blueprint Library), Part 11 (Runtime Hierarchy)

---

## Frozen inheritance (do not reopen)

This sprint builds **on top of** prior Alloy OS freezes. None of these are reopened here.

| System | What is frozen | Authority |
|--------|----------------|-----------|
| **System 1** — Runtime shell | Spine: Workspace → Perspective → Queue → Row → Drawer → Subject → Mission → Mode → Card | Runtime Spec Part 2 |
| **System 1.5** — Workspace Layout | Operational surface geometry (Queue · Focus Panel · BOS peers), `--alloy-os-op-surface-*` tokens | Runtime Spec Part 3, Concept B |
| **System 2** — Queue UX | Compressed 52px two-line row, grain-aware fields, State 1 / State 2 | Runtime Spec Part 4 |
| **System 3** — Focus Panel shell | Concept B chrome + subject + mode control; fixed header, scrolling body | Focus Panel UX freeze |
| **Work Unit Context** | ~148px stacked context bar (title / KPI / perspective rail / controls) | Runtime Spec Part 3 |
| **Focus Panel shell** | Docked peer (~410px right of queue, 720px target), fixed bounds, no remount on swap | Runtime Spec Part 3, Part 5 |

> This sprint designs the **Universal Card System** (the contents of the Focus Panel and, later, every other plane) and specifies the **Focus Panel header implementation target** (Concept B). It does **not** change the shell, geometry, queue, or panel bounds.

**Guardrails honored:** No schema changes. No Business Process redesign. No Experience Builder redesign. No enrollment-specific hardcoding (enrollment appears only as a *reference* composition). Respects `adminv2-runtime-performance-doctrine.md`: no section-owned above-fold skeletons, no full-panel skeleton on warm swap, atomic/coordinated reveal preserved.

---

# Deliverable 1 — Card Philosophy

## What a Universal Card is

A **Universal Card is a reusable business primitive** — the platform's unit of operational meaning. It is **not** a field container, a section, or a styled box around schema.

A card has four defining properties:

1. **Reusable business primitive** — one card type (e.g. *Readiness*) is composed once and expressed across Enrollment, Compliance, Billing, etc. via data bindings, not re-built per domain.
2. **Answers exactly one operational question** — "Is this ready?" "Why now?" "What work remains?" "Who are the people?" If a card answers two questions, it is two cards.
3. **May contain** fields, widgets, actions, metrics, related records, **or** workflow entry points — in any mix the question requires. Composition is open; the question is singular.
4. **Configurable in composition, platform-owned in anatomy and behavior.** Tenants choose *which* cards, *where*, and *what's inside*. The platform owns *how a card is shaped and how it behaves*.

> A card is the answer to a question an operator would otherwise have to assemble by reading raw fields. Cards exist so the operator **scans meaning** instead of **reading schema**.

## Ownership map (canonical)

The card system is deliberately split so no single layer can hardcode a domain or break the spine.

| Concern | Owner | Means |
|---------|-------|-------|
| **Card anatomy** (header, body, footer, states, slots) | **Platform** | Code — `Card` shell primitive |
| **Card behavior** (expand/collapse, loading/empty/error, reveal timing, motion) | **Platform** | Code |
| **Card tier + placement rules** (importance hierarchy) | **Platform** | Code (config may reorder *within* a tier only) |
| **Card composition** (which cards, order, span, visibility, fields/widgets inside) | **Experience Builder** | Tenant config (layout doc) |
| **Why / when a card appears** + which workflow entry points it exposes | **Business Processes** | Mission + stage rules |
| **Metric / KPI cards** (the numbers, thresholds, comparisons) | **Analytics** | Metric placements |
| **Card data** (the facts a card renders) | **Record System / Entity Model** | Entity GET / record responders |
| **Card actions** (what the buttons do) | **Actions / Workflow** | Registered action + event keys |
| **Required info / readiness signals** | **Readiness / Status systems** | Requirement + status evaluation |

**One-line summary:** *Platform owns the card; Experience Builder owns the composition; Business Processes own the why; Analytics owns the metrics; Record System owns the data; Actions/Workflow own the doing.*

---

# Deliverable 2 — Card Anatomy

The platform owns one card anatomy. Every card — across every tier, density, and plane — is the same shell with optional slots. Configuration fills slots; it never invents new ones.

## Anatomy diagram

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER  (fixed height per density)                          │
│  ┌────┐  Title ......................... [status chip]  ⋯  ^ │
│  │icon│  Primary insight (one meaning-first line)           │
│  └────┘                                                      │
├─────────────────────────────────────────────────────────────┤
│  BODY  (grows; scrolls only when card is Expanded)          │
│   • Secondary details / fields / widgets / related records  │
│   • Metric tiles / mini-lists / readiness checklist         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  FOOTER  (optional)                                          │
│  [ Primary action ]   secondary · secondary        metadata │
└─────────────────────────────────────────────────────────────┘
```

## Slot definitions

| Region | Slot | Required? | Carries |
|--------|------|-----------|---------|
| **Header** | Icon | Optional | Card identity glyph (neutral; tier-tinted only for Attention) |
| | Title | **Required** | What card is this (1–3 words) |
| | Status / summary chip | Optional | Business state: `ready` / `blocked` / `at-risk` / `due` / `done` |
| | Primary insight | Optional (recommended) | One meaning-first sentence (the answer) |
| | Header actions | Optional | Overflow `⋯`, expand/collapse `^` |
| **Body** | Secondary details | Optional | Fields, widgets, metrics, related records, sub-lists |
| | Workflow entry points | Optional | "Start work" / step launchers (owned by BP + Actions) |
| **Footer** | Primary action | Optional | The expected next move |
| | Related actions | Optional | Secondary moves |
| | Metadata | Optional | Quiet context (source, updated-at, ids) |

This maps 1:1 onto the frozen 7-element card anatomy in Runtime Spec Part 7 (Identity → Business State → Business Meaning → Primary Action → Supporting Detail → Metadata → Related Actions).

## Behavioral states (platform-owned)

| State | Rule |
|-------|------|
| **Empty** | Intentional, not broken. Card renders header + a calm one-line empty message + (optional) a "create/start" action. Never a blank box, never a false zero. |
| **Loading** | Card never shows an above-fold skeleton independently. It participates in the coordinated reveal: header frame may render, body holds until the composed payload is ready (no section-owned skeleton — performance doctrine). |
| **Error** | Card renders header + a contained error affordance with retry. Error in one card never blanks the panel or other cards. |
| **Expanded / collapsed** | Platform-owned toggle. Collapse preserves header + status chip + primary insight. Expand reveals body in place (no layout jump, motion preserves continuity). |

## Required sizing (platform tokens)

These are the canonical anatomy tokens. Density (Deliverable 4) selects among header heights; everything else is shared.

| Token | Value | Notes |
|-------|-------|-------|
| **Header height** | 36 / 44 / 52 / 56px | micro / compact / standard / expanded |
| **Card padding (x)** | 16px | 12px at micro |
| **Card padding (y)** | 12px | 8px at micro |
| **Internal spacing (row gap)** | 8px | between body rows |
| **Title type** | 14px / 600 weight | 13px at micro |
| **Primary insight type** | 13px / 500 | meaning-first line |
| **Body type** | 13px / 400 | secondary details |
| **Metadata type** | 12px / 400, muted | footer/quiet context |
| **Icon size** | 16px (micro/compact) · 20px (standard/expanded) | neutral metadata tint |
| **Status chip** | 20px height, 8px radius | state color, not decorative |
| **Border** | 1px hairline | calm, low-contrast |
| **Radius** | 10px | 8px at micro |
| **Elevation** | flat resting; 1-level lift only on Attention or hover-actionable | premium = predictable, not shadowy |
| **Action placement** | Header overflow `⋯` for secondary; **footer** for primary | primary action never hidden behind expand |

Color references inherit the frozen palette: **Bend Pine `#00A283`** for primary/active, juniper/amber/red for state confidence, `alloy-midnight` for chrome.

---

# Deliverable 3 — Card Layout System (critical)

The Focus Panel must support **more than a stack of full-width cards.** This is the system that makes the panel feel like an operational dashboard instead of a form.

## Composition primitives

| Primitive | Definition | Use |
|-----------|------------|-----|
| **Stack** | Vertical sequence of full-width cards | default fallback; narrow panels |
| **Row** | Horizontal group of cards sharing one baseline height | side-by-side context |
| **2-column grid** | Two equal/҂spanned tracks | Household + Children |
| **3-column micro grid** | Three tracks for micro/compact tiles | KPI / readiness tiles |
| **Card span** | A card occupies 1 col, 2 cols, or the full row | spanning within a grid |
| **Inline card strip** | Horizontally scrollable micro-card strip (no wrap) | attention chips, quick KPIs |
| **Collapsible section** | A titled group of cards that collapses as a unit | "Reference", "History" |

## Grid specification

The Focus Panel body is a responsive 12-unit conceptual grid expressed as CSS grid columns.

| Property | Value |
|----------|-------|
| **Grid columns** | up to **4** at full panel width (≥ 1040px) |
| **Min card width** | 240px (standard) · 160px (micro tile) |
| **Column gap** | 16px |
| **Row gap** | 16px |
| **Section gap** | 24px (between collapsible sections) |
| **Outer padding** | 16px (matches surface safe area) |

### Span behavior

| Span | Behavior |
|------|----------|
| `span 1` | one column (a tile or compact card) |
| `span 2` | two columns (Household next to Children) |
| `span row` / full-width | the entire current row (Timeline, Communications) |
| **Auto-fit** | when configured cards exceed available columns, the grid wraps to the next row at the min card width; it never horizontally scrolls the panel |

## Responsive collapse rules

The panel reads its **own width** (it is a docked peer that absorbs the band toward BOS — 410px floor up to 720px+ target), not the viewport.

| Panel width | Grid behavior |
|-------------|---------------|
| **≥ 1040px** (wide) | up to 4 columns; rows render as designed |
| **820–1039px** | max 3 columns; 4-tile rows wrap 3 + 1 or become a strip |
| **560–819px** | max 2 columns; `span 2` cards drop to full-width, micro tiles pair up |
| **< 560px** (narrow) | **single column stack**; rows linearize top-to-bottom by tier priority; micro tiles become an inline strip |

Linearization order on collapse is **tier priority** (Deliverable 5), never raw config order — the operator always meets Attention/Work first.

## Mapping to Experience Builder (later)

Each primitive has a clean config representation so this converts to layout config without redesign:

```
mode_layout:
  rows:
    - cells:
        - card: attention      span: 1
        - card: current_work   span: 1
        - card: tour_summary   span: 1
        - card: readiness_kpi  span: 1   density: micro
    - cells:
        - card: household      span: 2
        - card: children       span: 2
    - cells:
        - card: communications span: row
```

Platform owns the grid engine and collapse rules; Experience Builder owns the `rows / cells / span / density` values. (Deliverable 10.)

---

# Deliverable 4 — Card Density

Density is platform-owned. Configuration may *select* a density per card placement; it cannot invent new ones.

| Density | Use case | Height range | Content rules | Action rules | Collapse/expand |
|---------|----------|--------------|---------------|--------------|-----------------|
| **Micro** | KPI/readiness tile, status glance | 56–88px | Title + 1 metric/insight only. No body list. | 0 actions (whole tile may be a tap target) | Never expands; tap navigates |
| **Compact** | Context at a glance (Household, Tour Summary) | 96–160px | Header + insight + ≤ 3 secondary rows | ≤ 1 primary action in footer | Optional expand to Standard |
| **Standard** | Default working card (Readiness, Children) | 160–360px | Header + insight + body (list/fields/widget) | 1 primary + ≤ 2 secondary | Expand reveals full body in place |
| **Expanded** | Active work / deep detail (Current Work, Timeline) | 360px+ (scrolls internally) | Full body, sub-sections, related records | Full action set + workflow entry points | Default-open; collapses to Standard/Compact |

**When to collapse/expand (platform defaults; BP/Mission may override):**

- A card defaults **collapsed** when it is Reference/Historical tier or has no current signal.
- A card defaults **expanded** when it is the Mission/Work card for the current Mission, or its status chip is `blocked` / `at-risk` / `due`.
- Expand/collapse never reflows neighbors destructively — the grid row re-measures with motion (no jump).

---

# Deliverable 5 — Card Tiers

The runtime spec freezes a 4-tier **importance hierarchy** (Mission → Context → Reference → Historical, Part 11). This sprint **extends** that into the operator-facing 6-tier model below. Attention and Metric are additive; the spine ordering is preserved.

> **Amendment note (requires approval):** This adds **Attention** above Mission/Work and **Metric** as a cross-cutting tier to Runtime Spec Part 7/11. Mapping: Attention = highest-urgency Mission service; **Work cards = Mission cards** expressed in Work mode; Context/Reference/Historical unchanged; Metric is owned by Analytics and may appear in any tier slot as a micro tile.

| Tier | Purpose | Visual treatment | Allowed actions | Allowed placement | Default priority |
|------|---------|------------------|-----------------|-------------------|------------------|
| **Attention** | "Why now" — the single reason this subject needs the operator | Tier-tinted icon + state color rail; 1-level elevation; never muted | Primary action = resolve/act now | Top of Summary; pinned first on collapse | **1 (highest)** |
| **Work** | Active operational work for the current Mission | Bend Pine accent on primary action; expanded by default | Full action set + workflow entry points | Leads Work mode; high in Summary | 2 |
| **Context** | Adjacent operational context for this subject | Neutral, calm; standard density | ≤ 1 primary + secondary | Summary rows; Work supporting | 3 |
| **Reference** | Stable supporting facts (identity, placement reference) | Quiet; compact; collapsible | Edit (intentional) | Lower Summary; collapsible section | 4 |
| **Historical** | What happened, in order | List/timeline; muted metadata | Read; drill-in | Activity mode; full-width in Summary | 5 |
| **Metric** | A number that summarizes state (KPI/forecast) | Micro tile; value-first typography | Tap → drill to source | Inline strip / micro grid in any mode | cross-cutting (placed by Analytics) |

**Hard rule (inherited):** configuration MAY reorder cards **within** a tier; configuration MAY NOT make a lower tier outrank a higher tier. A Reference card can never sit above an Attention card.

---

# Deliverable 6 — Focus Panel Header Implementation Target (Concept B)

The approved **Focus Panel Shell Concept B** is the header target. The header is platform chrome; the body below it is the Card System (Deliverables 1–5).

## Header structure

```
┌───────────────────────────────────────────────────────────── CHROME TIER ──┐
│  ✕   Enrollment › Today's Tours › Wright Family          ✉  📅      ⋯       │
├──────────────────────────────────────────────────────────── SUBJECT TIER ──┤
│  ┌────┐   Wright Family                                                      │
│  │ WF │   Tour today · 2:30 PM — readiness blocked by medical doc           │
│  └────┘   [ at-risk ]  ·  Lincoln Park  ·  2 children          [ Start Tour ]│
├───────────────────────────────────────────────────────────── MODE CONTROL ─┤
│   ( Summary )   Work   Activity                                              │
└─────────────────────────────────────────────────────────────────────────────┘
   ▲ header fixed                                                              ▲
   ▼ body scrolls (Card System)                                                ▼
```

## Tier breakdown

| Tier | Element | Carries |
|------|---------|---------|
| **Chrome** | Close `✕` | Dismiss panel (returns to State 1 / queue intact) |
| | Record breadcrumb / context | Process › Perspective › Subject |
| | Secondary actions | Message `✉`, Schedule `📅`, overflow `⋯` |
| **Subject** | Avatar / icon | Subject identity glyph (grain-aware) |
| | Subject identity | Who/what (Record of Attention) |
| | Mission line | Why here now (Context Frame) — meaning-first |
| | Business state row | State chip · scope/location · key facts |
| | Primary action | Expected next move (Bend Pine) |
| **Mode control** | Segmented control | Summary / Work / Activity |

## Behavior rules (frozen targets)

| Rule | Specification |
|------|---------------|
| **Header fixed** | Chrome + Subject + Mode control do not scroll. |
| **Body scrolls** | Only the Card System region scrolls, within the panel's fixed bounds. |
| **Record switching keeps shell mounted** | Swapping subject does not remount the panel (inherits Focus Panel shell freeze). |
| **Subject tier swaps / cross-fades** | On swap, only the Subject tier content cross-fades; chrome + mode control persist. |
| **Mode persists on record swap** | If operator is in Work, the next subject opens in Work. |
| **Body scroll resets on swap** | New subject's body starts at top. |
| **No full-panel skeleton on warm swap** | Composed payload readiness gates the body; header frame stays. No section-owned above-fold skeleton (performance doctrine). |

---

# Deliverable 7 — Summary Mode Composition (Enrollment reference only)

This is a **reference composition** to validate the grid — **not hardcoded**. Enrollment ships it as default config; other domains supply their own.

```
SUMMARY ───────────────────────────────────────────────────────────────────────
Row 1  [ Attention/Why Now ] [ Current Work ] [ Tour Summary ] [ Readiness KPI ]
        span1 · standard      span1 · compact   span1 · compact   span1 · micro

Row 2  [ Household                    ] [ Children                              ]
        span2 · standard                 span2 · standard

Row 3  [ Communications / Recent Activity ] ......................... span row · standard
Row 4  [ Documents / Missing Info         ] ......................... span row · compact
```

| Card | Tier | Span | Density | Notes |
|------|------|------|---------|-------|
| Attention / Why Now | Attention | 1 | Standard | leads; expanded if `at-risk`/`blocked` |
| Current Work | Work | 1 | Compact | expands in Work mode |
| Tour Summary | Context | 1 | Compact | mission-relevant context |
| Readiness KPI | Metric | 1 | Micro | tap → Readiness detail |
| Household | Reference | 2 | Standard | side-by-side with Children |
| Children | Reference | 2 | Standard | child-grain list |
| Communications / Recent Activity | Historical | row | Standard | full-width |
| Documents / Missing Info | Context | row | Compact | full-width; readiness-linked |

On narrow panels (< 560px) this linearizes by tier: Attention → Current Work → Tour Summary → Readiness → Household → Children → Documents → Communications.

---

# Deliverable 8 — Work Mode Composition

Work mode is the **shell** for getting work done. No workflows are implemented here — only the card/layout structure.

```
WORK ──────────────────────────────────────────────────────────────────────────
[ Work Launcher ]  ...................................... span row · standard
   ◦ Manual          ◦ BOS Assist          ◦ Import / Intake

[ Active Workflow Steps ] ............................... span row · expanded
   step ① done · step ② active · step ③ pending

[ Tasks / Follow-ups ]  [ Automations After Completion ]
   span2 · standard         span2 · compact
```

| Card | Tier | Span | Density | Role |
|------|------|------|---------|------|
| Work Launcher | Work | row | Standard | entry points: Manual · BOS Assist · Import/Intake (workflow entry points owned by BP + Actions) |
| Active Workflow Steps | Work | row | Expanded | step-state list for the in-play work (read-only shell here) |
| Tasks / Follow-ups | Work | 2 | Standard | operational work items |
| Automations After Completion | Context | 2 | Compact | what fires on completion (preview only) |

Work mode leads with the **Work tier**; Attention card (if unresolved) pins above the launcher. Card actions route through Actions/Workflow; nothing is executed in this design.

---

# Deliverable 9 — Activity Mode Composition

Activity mode is **history / facts**. Card and list behavior only.

```
ACTIVITY ──────────────────────────────────────────────────────────────────────
[ Timeline ] ........................................... span row · expanded
   unified, reverse-chron; filterable by type

[ Communications ]  [ Documents ]
   span2 · standard    span2 · standard

[ Notes ]           [ Audit / Workflow Events ]
   span2 · standard    span2 · standard
```

| Card | Tier | Span | Behavior |
|------|------|------|----------|
| Timeline | Historical | row | Unified reverse-chron feed; type filter chips; lazy-paginates within the card (no panel skeleton) |
| Communications | Historical | 2 | List of threads/messages; drill-in opens detail, never authors here |
| Documents | Historical | 2 | List of docs + states; drill-in to viewer |
| Notes | Historical | 2 | Note list; add-note is an intentional action |
| Audit / Workflow Events | Historical | 2 | Event log; read-only |

All Activity cards are **read/drill** — they consume record truth and never become authoring surfaces (queues/cards are previews; truth lives in entity GET / record responders).

---

# Deliverable 10 — Configuration Mapping

How this design becomes configurable later — **no config UI is built now**, but every primitive maps cleanly to an owner.

| Design element | Becomes (config) | Owner |
|----------------|------------------|-------|
| Focus Panel mode layout (Summary/Work/Activity) | Experience Builder **layout doc** (per mode) | Experience Builder |
| Card stack / row / grid / span / density | Experience Builder **card composition config** (`rows / cells / span / density`) | Experience Builder |
| Card visibility (which cards, when) | Business Process rules + Experience Builder visibility | BP + Experience Builder |
| Card actions | Registered action + event keys | Actions / Workflow |
| Metric / KPI cards | Metric placements | Analytics |
| Required info / readiness signals | Requirement + status evaluation | Readiness / Status systems |
| Card data bindings | Entity GET / record responders | Record System / Entity Model |
| Tier hierarchy + grid engine + density + states | **Platform code (not config)** | Platform |

Config readiness note (compatibility layer): like the Queue UX freeze, the first implementation may **derive** default compositions from existing config (CRM layout slots, `queue_definition`, KPI placements) before a dedicated card-composition editor exists. Derivation is the import/fallback path, not the final owner.

---

# Deliverable 11 — Three Concepts

Each concept is a different answer to "how dense should the Focus Panel feel?" All three reuse the same anatomy, header, tiers, and config mapping — they differ only in the **layout system** they exercise.

## Concept A — Conservative stacked cards

```
┌ Focus Panel ───────────────────┐
│ [ Attention / Why Now ]        │  full-width
│ [ Current Work ]               │  full-width
│ [ Tour Summary ]               │  full-width
│ [ Readiness ]                  │  full-width
│ [ Household ]                  │  full-width
│ [ Children ]                   │  full-width
│ [ Communications ]             │  full-width
│ [ Documents ]                  │  full-width
└────────────────────────────────┘
```

- **Mockup feel:** a single column of full-width cards, ordered by tier. The familiar drawer.
- **Pros:** simplest to build; trivially responsive (already single column); lowest risk; easy to read top-to-bottom.
- **Cons:** wastes horizontal space at 720px+ panel; lots of scrolling; feels like a long form, not an operational surface; no side-by-side relationships (Household/Children); does not deliver the "premium dashboard" feel.
- **Sizing:** all cards Standard/Compact, span = row; no grid engine needed.
- **Config-readiness:** high — composition is just an ordered list; trivially expressible.
- **Implementation risk:** **low.** Closest to today's drawer; minimal new layout code.

## Concept B — Recommended responsive card grid

```
┌ Focus Panel (wide ≥1040) ─────────────────────────────────────┐
│ [Attention] [Current Work] [Tour Summary] [Readiness·KPI]     │ row · 4 tiles
│ [ Household            ] [ Children                  ]         │ row · 2× span2
│ [ Communications / Recent Activity ]                          │ full-width
│ [ Documents / Missing Info ]                                  │ full-width
└───────────────────────────────────────────────────────────────┘
         ▼ collapses to 2-col, then single column on narrow
```

- **Mockup feel:** rows + columns + spans; meaningful side-by-side pairs; micro KPI tiles; full-width history. Operational, calm, premium.
- **Pros:** uses the panel's real width; relationships sit side-by-side; tier priority drives collapse; one engine serves Summary/Work/Activity and later Workspace/Planning/Reports/BOS; maps 1:1 to Experience Builder `rows/cells/span/density`.
- **Cons:** requires the grid engine + responsive collapse rules; composition config is richer than a flat list; needs careful reveal coordination so cards don't pop in.
- **Sizing:** full anatomy + density set; grid columns up to 4, min card 240px (160 micro), 16px gaps.
- **Config-readiness:** **high** — designed around the config schema in Deliverable 10.
- **Implementation risk:** **medium** — new grid engine and collapse rules, but bounded and reusable; respects existing reveal gates.

## Concept C — Aggressive dashboard-like dense layout

```
┌ Focus Panel ─────────────────────────────────────────────────┐
│ [A][CW][Tour][KPI][KPI][KPI]   ← inline micro strip          │
│ [Household][Children][Readiness][Billing]  ← 4-up micro grid  │
│ [Schedule][Attendance][Docs][Funding]      ← 4-up micro grid  │
│ [ Timeline (dense) ........................................ ] │
└───────────────────────────────────────────────────────────────┘
```

- **Mockup feel:** dashboard of dense tiles; many cards visible at once; maximal information density.
- **Pros:** maximum at-a-glance coverage; great for power users/large panels; showcases Metric tier.
- **Cons:** high cognitive load (violates "calm under pressure"); risks "raw admin panel" feel; micro tiles can't carry primary actions well; hardest to keep readable on narrow panels; tempts per-domain special-casing; heaviest reveal coordination.
- **Sizing:** micro/compact dominate; 3–4 column micro grids; tight gaps (12px).
- **Config-readiness:** medium — expressible, but dense compositions are easy to misconfigure into noise.
- **Implementation risk:** **high** — most layout + reveal complexity; greatest chance of violating calm/premium doctrine.

---

# Deliverable 12 — Recommendation

**Adopt Concept B — Responsive Card Grid.**

It is the right balance:

- **Not limiting like Concept A.** It uses the Focus Panel's real width (the panel absorbs the band toward BOS up to 720px+), so Household/Children sit side-by-side and KPI tiles read at a glance instead of stretching full-width.
- **Not dashboard-heavy like Concept C.** It stays calm under pressure: tier-ordered, generous spacing, primary actions in footers, history full-width. It avoids the "raw admin panel" feel.
- **Supports configuration.** Its primitives (`rows / cells / span / density`) map 1:1 to the Experience Builder layout doc (Deliverable 10), so it converts to config without redesign.
- **Works across domains.** The same grid + tiers + anatomy serve Summary/Work/Activity now and Workspace, Planning, Reports, and BOS later — no per-domain layout engine.
- **Gives the Focus Panel a premium feel.** Predictable spacing, stable surfaces, side-by-side meaning, no layout jumps — premium = predictable.

Concept A is retained as the **narrow-panel collapse target** of Concept B (single-column stack). Concept C is **rejected as a default** but its Metric-tile + micro-grid patterns are absorbed into Concept B as opt-in `density: micro` strips where a domain genuinely needs density (e.g. Reports).

---

# Deliverable 13 — Freeze Checklist

Approve each before any implementation begins. Nothing in this artifact is implemented until these are checked.

| # | Item | Deliverable | Approved? |
|---|------|-------------|-----------|
| 1 | **Card anatomy** (header/body/footer/states/slots + sizing tokens) | D2 | ☐ |
| 2 | **Density rules** (micro/compact/standard/expanded) | D4 | ☐ |
| 3 | **Grid / row / span / responsive collapse behavior** | D3 | ☐ |
| 4 | **Focus Panel header target** (Concept B chrome/subject/mode tiers + behavior) | D6 | ☐ |
| 5 | **Summary composition** (enrollment reference, not hardcoded) | D7 | ☐ |
| 6 | **Work composition** (shell only) | D8 | ☐ |
| 7 | **Activity composition** (read/drill only) | D9 | ☐ |
| 8 | **Configuration mapping** (owners + config schema) | D10 | ☐ |
| 9 | **Tier amendment** (Attention + Metric added to Runtime Spec Part 7/11) | D5 | ☐ |
| 10 | **Concept B recommendation** accepted as the layout direction | D12 | ☐ |

## On approval

- Promote the frozen sections into **Runtime Spec Part 7 / 8 / 11** (replace the current stubs).
- Update `docs/platform/operator/experience-builder-doctrine.md` cross-reference for the card-composition config schema.
- Only then open an implementation sprint for the **Focus Panel header (Concept B)** as the first build target.

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Runtime spine / card anatomy stub | [`../../platform/operator/alloy-runtime-specification.md`](../../platform/operator/alloy-runtime-specification.md) |
| Visual feel (meaning-first, calm, premium) | [`../../platform/operator/alloy-visual-language.md`](../../platform/operator/alloy-visual-language.md) |
| Card / section / field authoring | [`../../platform/operator/experience-builder-doctrine.md`](../../platform/operator/experience-builder-doctrine.md) |
| Drawer / queue / record | [`../../platform/operator/drawer-system.md`](../../platform/operator/drawer-system.md), [`../../platform/operator/queue-system.md`](../../platform/operator/queue-system.md) |
| Reveal / performance gates (must respect) | [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md) |
| Perspective compatibility layer | [`../../platform/operator/runtime-perspective-compatibility-layer.md`](../../platform/operator/runtime-perspective-compatibility-layer.md) |

---

**End of design freeze artifact. No production code. Stop after design freeze.**
