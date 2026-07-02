# Alloy Visual Language

**Status:** Canonical design doctrine (July 2026). This document is the source of truth for all color and visual language decisions in the Alloy platform. CSS, components, and AI-assisted development must derive from this document — not the reverse.

---

## Philosophy

Color in Alloy communicates meaning, not identity. Most surfaces are neutral. Color enters only when the operator needs to act or when a signal is worth calling out. When everything is colored, nothing is.

The visual language should feel closer to flight instruments, professional industrial control systems, and Linear than to Power BI, Salesforce, or HubSpot. The test is: would this feel at home in a Bloomberg terminal or an aircraft cockpit? If not, reconsider.

---

## Brand Color Palette

These six colors are the complete Alloy brand palette. Every color in the product derives from one of these or is a neutral mix against white/surface.

### Midnight Forge

| | |
|---|---|
| **HEX** | `#273F52` |
| **RGB** | `39, 63, 82` |
| **Role** | Structural — brand, navigation, headers, strong typography, chrome |

Midnight Forge is the foundational brand color. It creates the product's sense of depth and authority. It appears in:
- Primary navigation and sidebar chrome
- Bold headings and section labels
- Strong typographic emphasis
- Structural borders and dividers

**Does not represent operational state.** Forge on a data cell does not mean "healthy" — it means "this is a structural UI element." Using Forge to indicate positive state is a color vocabulary error.

### Bend Pine

| | |
|---|---|
| **HEX** | `#00A283` |
| **RGB** | `0, 162, 131` |
| **Role** | Positive operational state — healthy, live, active, success, confidence |

Bend Pine is the primary Alloy accent and the operational confidence color. It appears when the platform is telling the operator that something is working, current, or healthy. It appears in:
- Healthy state indicators on Operational Instruments
- Live data dots (pulsing or static)
- Positive trend indicators
- Success states in actions and forms
- Active stage indicators
- Confirmation and completion states

**Bend Pine is a teal-green (`#00A283`), not a dark slate.** Do not substitute Midnight Forge (`#273F52`) for Bend Pine. They are categorically different.

### Coastal Current

| | |
|---|---|
| **HEX** | `#00458C` |
| **RGB** | `0, 69, 140` |
| **Role** | Intelligence — AI signals, informational, secondary emphasis |

Coastal Current distinguishes AI-generated or intelligence-derived signals from operational data. It is not positive, not caution — it is a different epistemic category: "this was derived, not measured."

It appears in:
- AI lane instruments and signals
- Confidence indicators
- BOS intelligence annotations
- Informational badges and states

Do not use Coastal Current for interactive primary actions — those use Bend Pine or neutral Forge-based treatments.

### Ember

| | |
|---|---|
| **HEX** | `#BC4300` |
| **RGB** | `188, 67, 0` |
| **Role** | Caution — threshold approaching, attention required |

Ember communicates that something needs the operator's attention but does not yet require immediate intervention. The threshold has been approached; it has not been breached.

It appears in:
- Caution state on Operational Instruments
- SLA approaching warnings
- Capacity threshold indicators
- "Growing" or "Approaching" answer states

### River Stone

| | |
|---|---|
| **HEX** | `#7C273A` |
| **RGB** | `124, 39, 58` |
| **Role** | Critical — threshold breached, blocked, destructive action, failure |

River Stone communicates that a threshold has been crossed and action is required now. It also marks destructive or irreversible actions in the UI.

It appears in:
- Critical state on Operational Instruments
- SLA breach indicators
- Blocked record states
- Destructive action buttons
- Failure states

River Stone is a dark burgundy-crimson, not rust or orange. Do not use Ember (`#BC4300`) where River Stone is required — they are distinct severity levels.

### Alloy White

| | |
|---|---|
| **HEX** | `#F4F6F9` |
| **RGB** | `244, 246, 249` |
| **Role** | Primary neutral application background |

Alloy White is a slightly warm, blue-tinted off-white that forms the base of all operational surfaces. It is not pure white (`#ffffff`). Panel surfaces lift above it using `#ffffff` or a very slight tint.

---

## Semantic State System

Brand colors map to semantic roles. Code references semantic roles, not brand color names. This is the layer that allows the palette to evolve without touching every component.

| Semantic role | Brand color | HEX | Meaning |
|---|---|---|---|
| `state-positive` | Bend Pine | `#00A283` | Healthy, live, active, success |
| `state-caution` | Ember | `#BC4300` | Approaching threshold, attention |
| `state-critical` | River Stone | `#7C273A` | Breached, blocked, failure |
| `state-intelligence` | Coastal Current | `#00458C` | AI-derived, informational |
| `state-neutral` | Midnight Forge | `#273F52` @ 35–55% opacity | No signal, structural |
| `surface-base` | Alloy White | `#F4F6F9` | Application background |
| `brand-primary` | Midnight Forge | `#273F52` | Navigation, headers, chrome |
| `brand-accent` | Bend Pine | `#00A283` | Primary interactive accent |

### Using semantic roles

Components reference `--state-positive`, not `#00A283`. This means:
- A color audit checks semantic roles, not hex values
- Brand color updates propagate through the token layer
- AI and engineers speak the same vocabulary

---

## Runtime Token System

Semantic roles are implemented as CSS custom properties. These tokens are the implementation boundary — CSS below this layer should not reference hex values directly.

### Canonical token names

```css
:root {
  /* Brand */
  --brand-primary:    #273F52;   /* Midnight Forge */
  --brand-accent:     #00A283;   /* Bend Pine */
  --brand-secondary:  #00458C;   /* Coastal Current */

  /* Semantic state */
  --state-positive:   #00A283;   /* Bend Pine */
  --state-caution:    #BC4300;   /* Ember */
  --state-critical:   #7C273A;   /* River Stone */
  --state-intelligence: #00458C; /* Coastal Current */

  /* Surface */
  --surface-background: #F4F6F9; /* Alloy White */
  --surface-panel:      #FFFFFF;
  --surface-border:     rgba(39, 63, 82, 0.10);
  --surface-border-strong: rgba(39, 63, 82, 0.18);

  /* Text */
  --text-primary:    #273F52;          /* Midnight Forge */
  --text-secondary:  rgba(39, 63, 82, 0.60);
  --text-muted:      rgba(39, 63, 82, 0.40);
  --text-disabled:   rgba(39, 63, 82, 0.25);
}
```

### Token derivation rules

Components derive tinted variants using `color-mix()` rather than hardcoding midtones:

```css
/* Correct — derives from token */
color: color-mix(in srgb, var(--state-positive) 65%, transparent);

/* Wrong — hardcodes a tint */
color: rgba(0, 162, 131, 0.65);
```

---

## Operational Instrument Color Rules

### When to use color

Color on an instrument is a signal amplifier, not the primary communication channel. The primary channel is typography and operational language. An instrument should communicate its state through the answer text ("Healthy", "Approaching Full", "Needs action") first, and reinforce it with color second.

**Most instruments are mostly neutral.** The 2px top inset line, the state dot, the answer text color, and the value color are the only colored elements. The cell background is always transparent or near-neutral.

### Color per state

| State | Top line | State dot | Value color | Answer text |
|---|---|---|---|---|
| healthy | `--state-positive` @ 55% | `--state-positive` @ 55% | `--brand-primary` (Forge) | `--state-positive` @ 65% |
| caution | `--state-caution` @ 65% | `--state-caution` @ 68% | `--state-caution` @ 88% | `--state-caution` @ 76% |
| critical | `--state-critical` @ 70% | `--state-critical` @ 74% | `--state-critical` @ 88% | `--state-critical` @ 80% |
| ai/intelligence | `--state-intelligence` @ 50% | `--state-intelligence` @ 56% | `--state-intelligence` @ 82% | `--state-intelligence` @ 72% |
| empty | Forge @ 12% | Forge @ 22% | Forge @ 22% | Forge @ 30% |
| stale | Forge @ 20% | Forge @ 28% | `--brand-primary` | Forge @ 38% |

### Healthy state note

Healthy instruments use `--state-positive` (Bend Pine) for the indicator elements (dot, top line, answer text tint) but keep the primary value in `--brand-primary` (Midnight Forge). This is intentional — the value is structural data; the color annotation communicates its state.

### Live data dot

The live data dot uses `--state-positive` (Bend Pine) at 70% opacity. It communicates "this is current" regardless of the instrument's health state. A caution-state instrument with live data shows a Bend Pine live dot beside an Ember caution indicator — both are correct simultaneously.

---

## Surface Color Rules

| Surface | Background | Border | Note |
|---|---|---|---|
| Application | `--surface-background` (`#F4F6F9`) | — | Alloy White base |
| Workspace panel | `#FFFFFF` | `--surface-border` | Lifted above base |
| Instrument band | `color-mix(#F4F6F9, --brand-primary 3%)` | `--surface-border` top only | Very slightly tinted |
| Instrument cell | transparent | `--surface-border` right only | No fill |
| Focus Panel | `#FFFFFF` | `--surface-border` | Same as workspace panel |
| Operational Intelligence | `#FFFFFF` | `--surface-border` | Grid of expanded instruments |

---

## Typography Color Rules

Strong typographic hierarchy is more important than color variety. Most text is Midnight Forge at varying opacities.

| Role | Token | Approximate |
|---|---|---|
| Primary heading | `--text-primary` | `#273F52` — full Midnight Forge |
| Body / labels | `--text-secondary` | Forge @ 60% |
| Muted / micro-labels | `--text-muted` | Forge @ 40% |
| Placeholder / disabled | `--text-disabled` | Forge @ 25% |
| Instrument value | `--text-primary` (default) or state color | see table above |
| Instrument label | `--text-muted` | Forge @ 40–42% |
| Instrument answer | state color or Forge @ 60% | see table above |

---

## Anti-patterns

These are explicit violations of the Alloy visual language:

| Pattern | Problem | Correct approach |
|---|---|---|
| Using Midnight Forge (`#273F52`) for healthy state | Forge is structural, not positive | Use Bend Pine (`#00A283`) |
| Using generic SaaS purple for AI signals | Not in the Alloy palette | Use Coastal Current (`#00458C`) |
| Using `#8C3300` (deep rust) for critical | Not River Stone | Use `#7C273A` (dark burgundy) |
| Colored cell backgrounds on instruments | Makes tiles feel like KPI cards | Keep backgrounds transparent/neutral |
| Color as primary communicator | Fails in low-contrast or color-blind contexts | Typography and language first, color second |
| Hardcoded hex values in components | Bypasses the token system | Always reference `--state-*` or `--brand-*` tokens |
| Using different greens for "active" vs "healthy" | Fragments the positive signal | Bend Pine for all positive/healthy/live |

---

## Glossary of color vocabulary

| Term | Meaning |
|---|---|
| Midnight Forge | `#273F52` — primary brand, structural |
| Bend Pine | `#00A283` — positive operational state |
| Coastal Current | `#00458C` — AI and intelligence signals |
| Ember | `#BC4300` — caution state |
| River Stone | `#7C273A` — critical state |
| Alloy White | `#F4F6F9` — application background |
| State token | `--state-positive`, `--state-caution`, etc. — semantic implementation |
| Brand token | `--brand-primary`, `--brand-accent` — brand implementation |

---

## Migration note (July 2026)

The initial Operational Instrument implementation (PR to be updated) incorrectly used:
- `#273F52` (Midnight Forge) as the healthy/live indicator — should be `#00A283` (Bend Pine)
- `#8C3300` (deep rust) as the critical color — should be `#7C273A` (River Stone)
- `#2667FF` (generic brand blue) for AI — should be `#00458C` (Coastal Current)

The `alloy-ci-*` CSS block in `workspace.css` must be updated to use `--state-*` tokens resolving to the correct hex values.

---

## Related docs

- `../modules/operational-answers.md` — Operational Answer contract
- `../../platform/governance/glossary.md` — platform terminology
- `../../system/typography-and-presentation-doctrine.md` — typography rules
