# Alloy Visual Language

**Status:** Canonical doctrine (June 2026). **Visual doctrine** — the bridge from the [Canonical Interaction Model](./canonical-interaction-model.md), [Interaction Grammar](./interaction-grammar.md), and [Operator Story](./operator-story.md) into the next design phase: **mockups**.

This is **not** a design system spec, a Tailwind/token document, a Figma spec, or component implementation guidance. It states how Alloy should **feel** — visually and behaviorally — so mockups *express* the interaction model rather than inventing a new one.

---

## Core premise

> Alloy should not feel like a configurable database UI. **Alloy should feel like a modern operational system.**

Configuration powers the runtime, but the runtime must not expose raw configuration as the primary experience. The operator sees **operational meaning**; the schema lives underneath.

This doctrine pairs with the interaction model: the interaction model defines the **primitives and laws**; this doc defines how those primitives should **look and behave**. Mockups should be derived from both — not designed screen-by-screen.

---

## 1. Business meaning before fields

The interface leads with **operational meaning**, not schema.

| ❌ Schema-first (avoid as headline) | ✅ Meaning-first (lead with this) |
|-------------------------------------|-----------------------------------|
| Enrollment Status | This family is ready for tour. |
| Program / Desired Start Date | This child is blocked by missing medical documentation. |
| Billing Type | This payment failed and needs action. |
| Tour Date | This room has capacity risk next week. |

Fields are still necessary — they **support** meaning, they do not **dominate** the screen.

## 2. Operators scan before they read

Operators are interrupted and under pressure. The runtime must be **quickly scannable**:

- Strong hierarchy
- Concise labels
- Meaningful chips
- Clear status
- Calm whitespace
- Predictable card rhythm
- Immediate recognition of **risk / readiness / next action**

Avoid dense field grids as the default presentation.

## 3. Cards communicate state, not schema

Cards are **business primitives** that answer a business question — *Is this family ready? What is blocking enrollment? Is billing set up? Is this child safe to attend? Is this schedule valid? Is capacity available? What work remains?*

| ❌ Schema grouping (avoid) | ✅ Business primitive (prefer) |
|----------------------------|-------------------------------|
| Enrollment Fields | Enrollment Readiness |
| Billing Info | Billing Setup |
| Child Details | Health & Safety |
| (field dump) | Placement · Schedule · Capacity · Operational Work |

A card should not merely group fields. (Card primitive doctrine: `./canonical-interaction-model.md` § Cards doctrine.)

## 4. Understanding is ambient; editing is intentional

The **default state of Alloy is understanding, not editing**. Operators first see the current operating state; editing happens when they intentionally choose to act. This reduces form fatigue.

| Prefer | Avoid |
|--------|-------|
| Summaries, snapshots, chips | Always-on editable field grids |
| Inline status, action rows | Exposed empty fields |
| Focused edit panels | Long forms as primary content |
| Progressive disclosure | Controls that compete with meaning |

## 5. The drawer is an operating surface, not a form

Drawers must not feel like database records. The drawer answers:

- **Who/what** am I looking at?
- **Why** am I looking at it now?
- What is the **current state**?
- What **needs action**?
- What **happened before**?
- What should I **do next**?

The drawer **chrome** makes the active context obvious:

| Chrome element | Carries |
|----------------|---------|
| Record of attention | What the operator is working on |
| Context frame | Why it was opened right now |
| Source perspective | Where it was opened from |
| Active location / scope | Which child / site / context is active |
| Previous / Next | Traversal of the current filtered queue |
| Primary action | The expected next move |
| Attention / risk state | Whether this needs urgency |

(Drawer concepts: `./canonical-interaction-model.md` § The drawer carries three concepts.)

## 6. Motion preserves context

Motion **explains continuity** — it does not decorate.

| Use motion to show | Avoid |
|--------------------|-------|
| Queue → drawer focus | Flashing |
| Card expansion | Layout jumps |
| Action completion | Skeleton morphing |
| Next-record progression | Sudden content reordering |
| Background context preservation | Animations that delay work |
| State update without disorientation | |

Motion must respect the locked reveal/performance gates — it never weakens atomic reveal or composed-payload readiness (`../../system/adminv2-runtime-performance-doctrine.md`).

## 7. Inputs are platform primitives

Date pickers, time pickers, dropdowns, lookups, status controls, money inputs, phone inputs, address inputs, and person pickers must feel **consistent across every domain**. A weak input primitive damages the entire platform.

**Current UX alignment gaps (acknowledged):**

- Drawers currently feel too **grid/form-like**.
- **Date/time** controls feel cumbersome.
- **Dropdown** styling, background, font color, disabled state, read-only state, and editable affordance need **platform-level consistency**.
- **Field density** should be controlled intentionally.
- Modernizing these primitives is **not cosmetic** — it is part of making the runtime feel cohesive.

(These mirror `./canonical-interaction-model.md` § Known UX alignment gaps and do not change any locked runtime doctrine.)

## 8. Calm under pressure

Childcare operators are interrupted constantly. Alloy should feel **calm, not busy**. Visual decisions reduce cognitive load. The runtime should:

- Keep operators oriented
- Avoid unnecessary contrast and noisy surfaces
- Make **risk visible without making everything feel urgent**
- Make completion satisfying
- Make empty states feel **intentional**, not broken

## 9. Premium means predictable

Premium is **not decorative**. Premium means:

- Predictable spacing · consistent controls · clear hierarchy
- Fast transitions · stable surfaces
- No visual surprises · no accidental layout changes
- No jarring state refreshes · **no "raw admin panel" feeling**

## 10. The visual system must serve the interaction model

Do **not** design screens independently. Design the **universal primitives**, and let every domain inherit them:

```
Workspace · Perspective · Queue · Row · Drawer shell · Context frame ·
Mode · Card · Section · Field · Platform inputs
```

Enrollment, Billing, Attendance, Scheduling, Staffing, Subsidy, Compliance, POS, Transportation, Meals, and Health all inherit the **same visual language**.

> **Mockups express the doctrine; they do not invent a new interaction model.**

---

## How to use this doc (entering mockups)

1. Start from the canonical primitives, not a domain screen.
2. For each primitive, decide its **meaning-first** presentation (principles 1–3).
3. Default every surface to **understanding**, with editing as an intentional, focused act (principle 4).
4. Treat the drawer as an operating surface with explicit context chrome (principle 5).
5. Specify motion only where it preserves continuity (principle 6).
6. Treat inputs as one shared primitive set across domains (principle 7).
7. Validate against **calm under pressure** and **premium = predictable** (principles 8–9).
8. Confirm the result is reusable across domains (principle 10).

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Interaction primitives | [`./canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Interaction laws | [`./interaction-grammar.md`](./interaction-grammar.md) |
| Lived operator experience | [`./operator-story.md`](./operator-story.md) |
| Runtime Specification (synthesis; implementation bridge) | [`./alloy-runtime-specification.md`](./alloy-runtime-specification.md) |
| Planes / domains share one architecture | [`../operational-ux-doctrine.md`](../operational-ux-doctrine.md) |
| Card / section / field authoring | [`./experience-builder-doctrine.md`](./experience-builder-doctrine.md) |
| Typography & presentation (existing) | [`../../system/typography-and-presentation-doctrine.md`](../../system/typography-and-presentation-doctrine.md) |
| Locked reveal / performance gates | [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md) |

---

## When this doc must be updated

- A visual principle changes or a new one is added.
- A UX alignment gap is closed (move it out of principle 7).
- A new domain validates or stresses the shared visual language.
- Mockups surface a tension between visual feel and the interaction model.
