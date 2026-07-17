---
owner: operator
status: canonical
last_reviewed: 2026-07-17
supersedes: []
---

# Configuration Workspace Visual Language

**Status:** Canonical. The visual specialization of `configuration-workspace-platform-doctrine.md`.
**Builds on:** `alloy-visual-language.md` (the ten premises) and `operational-surface-design-system.md` (card grammar, tokens, System 5). This doc does **not** restate those; it adds what is specific to configuration, and explains *why* a configuration workspace feels different from both a settings form and an operational workspace.

> The prototype feels different because it is **calm, object-shaped, and consequence-first** — it looks like you are running a place, not editing its record.

---

## Why configuration must feel different

A configuration screen has a unique risk: it is where implementation most wants to leak. Tables, forms, precedence, and versioning all live one layer down, and the lazy visual answer is to expose them. The visual language exists to **refuse that** — to make configuration read as an operational surface, not a database UI.

The feeling has three sources, and every visual decision serves one of them:

1. **Calm** — a configured object is quiet. Whitespace, restraint, and a single accent do the work; nothing competes for attention that does not need it.
2. **Object-shape** — the page is visibly *about a thing*. The object's name is the loudest element; everything else is subordinate to it.
3. **Consequence-first** — numbers appear as sentences with a reason ("Holds 11 children — limited by staffing ratios"), not as bare metrics. The operator reads meaning before data.

---

## The system this extends

Configuration uses the **Alloy Configuration-Platform** visual system (the `config-*` token family), not the marketing palette and not the legacy Alloy-Blue admin kit.

- **Workspace canvas:** a quiet Stone field. White is reserved for meaningful object-owned regions so hierarchy comes from composition rather than a wall of cards.
- **The single accent is Bend Pine `#00A283`** — used for the active tab, the selected object, positive/available state, and the primary action. It is the *only* accent. (Note: `alloy-pine` is a slate token, not green; the green is `alloy-bend-pine`.)
- **Ink:** `alloy-midnight` / `alloy-forge` for text, stepped by opacity (`/85`, `/55`, `/45`) to build hierarchy without new colors.
- **Warning/attention:** `alloy-ember` for Fix-grade items and destructive intent, sparingly. Blue (`alloy-blue`) for informational/Improve and scheduled state.
- **Neutral surface:** `alloy-stone` for row hover, chips, and quiet fills.

Color is meaning, never decoration: green = good/available/active, amber = attention/open-but-watch, grey = unavailable/inactive, ember/red reserved for true problems.

---

## Spacing & white space

White space is the primary tool of calm. Configuration surfaces are **less dense** than operational queues on purpose — the operator is deliberating, not triaging.

- Section rhythm is generous: cards separated by `space-y-4`, content within a card by `space-y-3`.
- A card breathes: `p-4`, `rounded-xl`, a hairline border (`~rgba(89,103,139,0.14)` / `border-alloy-forge/10`), a whisper shadow.
- A healthy object's Overview should have **visible empty space**. If a configuration screen feels full, it is doing too much.

## Workspace canvas, regions, and objects

The Stone workspace canvas is the field on which the selected configuration object is understood and operated. White regions sit on that field only when they carry a coherent operator answer: identity, operating picture, readiness, attention, an owned capability, or a focused editor.

- A **Region** groups one answer or one operational concern. It may be white, but it is not automatically a card and does not imply independent navigation.
- An **Object** has identity, status, selection, view/edit state, and usually a URL-addressable workspace. Do not make a region look like a selectable object.
- Prefer one composed white region with hairline rows over nested white cards.
- The selected object owns the detail workspace. Supporting lists and rails remain visually subordinate.

## Typography

Configuration uses the `config-typo-*` scale (from `configurationRuntime.css`), tuned tighter than marketing type:

- **Object title** (`config-typo-page-title`): ~1.25–1.5rem, 600, negative tracking. The loudest thing on the page.
- **Section title** (`config-typo-workspace-title` / card title): ~15px, 600.
- **Eyebrow** (`config-platform-hub-eyebrow`): 10–11px, 600, uppercase, wide tracking, muted — the "Platform Configuration" kicker.
- **Body**: 13px, `alloy-midnight/80`.
- **Meta / supporting**: 11–12px, `alloy-midnight/45–55`.

The type scale itself communicates hierarchy, so color stays reserved for meaning.

## Object headers

The object header is the anchor of the whole system. It carries: the **object name** (largest type on the page), a **status pill** beside it, and one row of **identifying facts** (address · phone · timezone; or code · program · age range) in muted meta type. The primary action (Edit) and overflow sit at the right. A hairline border under the header separates it from the tab bar. The header makes the operator's first question — *what am I configuring?* — answered before they read anything else.

## Cards & sections

Cards communicate **state, not schema** (premise 3 of `alloy-visual-language.md`, sharpened for configuration). The configuration card families:

- **Glance card** — a utilization bar plus a tiered metric group; the health signal (utilization) reads before inventory (counts).
- **Summary card** — a plain-language headline ("Holds 11 children"), the *why* as a business phrase, and quiet component detail beneath. One "Manage ▸" affordance.
- **List card** — ranked or ordered rows with a per-row action (Attention, closures, activity, programs), divided by hairlines, not boxed individually.
- **Editor card** — inline fields plus a live consequence sentence plus one save.
- **Readiness region** — an explained percentage/progress bar plus the authoritative per-area states that reconcile it.
- **Configuration Domain Card** — a compact publisher-landing navigation object with identity, publication state, concise ownership, Used By summary, and one Open affordance. A responsive object grid is allowed because each card is a configuration object, not a metric widget. Cards are equal height for rapid scanning; detailed inheritance, overrides, and health move inside the domain.

Sections are **structured rows inside one card**, not a mosaic of separate cards. The doctrine is: prefer `border-b` rows within a section over a grid of boxes. A configuration workspace is a small number of calm sections, not a wall of tiles.

## Sidebar & object list behavior

The object list (left rail) is a **persistent selector**, not a page. Rows carry the object's identity (name, sub-label, status) and a selected state that is unmistakable: the canonical queue-row Bend Pine wash, border, and inset rail. Active identity glyphs use Bend Pine without inventing pale decorative tiles; inactive identities are muted. Selection is the single most important state in the system — the operator must always know which object they are operating. On drilling into a nested object, the list swaps to the child's siblings; the selected state moves with the drill.

On a top-level no-selection landing, peer objects may use an **equal-height tile grid** instead of long full-width rows. The tile carries only collection-level posture and one Open affordance; detailed configuration remains in the selected object workspace. Organization Domain Cards and Locations fleet tiles share this rhythm and surface treatment without sharing a forced content model.

The two canonical top-level archetypes answer different questions. Organization is a **Catalog Runtime**: its dominant surface is the configuration-domain grid. Locations is a **Fleet Runtime**: its dominant surface is the searchable Location collection, with readiness and attention as compact supporting context. At desktop widths the fleet may use a narrow sticky summary rail and an independently bounded tile scroller so hundreds of Locations do not make the page infinitely tall. Search, filters, and Add stay visually attached to that scroller. Neither archetype uses dashboard proportions or duplicates selected-object detail.

## Navigation (tabs & breadcrumb)

- **Tabs** are the object's owned concerns. The active tab is Bend-Pine text over a Bend-Pine underline; idle tabs are muted with no underline. Tabs are quiet — they name concerns, not features.
- **Breadcrumb** is the ownership path in business language (Settings › Prototypes › … or Locations › Downtown Campus › Toddler Room), with the current object bold and ancestors as links. It reads as *where this object sits*, never as a URL.

## Badges & status

- **Status pill:** a dot + label in a soft bordered chip — Bend-Pine wash for Active, Stone for Inactive. Small, calm, never shouting.
- **Inheritance tag:** a muted Stone chip naming the owner ("Uses location hours") — whisper weight, never an alarm.
- **Attention glyph:** ⚠ ember (Fix), ⓘ blue (Improve), ✓ Bend-Pine (Good) — the only place color does heavy signaling.

## Progress & attention (the two-status visuals)

- **Attention** is a list card in the object body — the operational health signal. Fix items lead, each with a one-tap "View ▸." Empty state is a single calm "Everything looks good ✓" line. No timestamp, no global "Healthy" badge.
- **Operational Readiness** is a supporting body region beside the operational glance. It shows a progress bar, assessed/not-assessed reconciliation, and every authoritative dimension as Complete, Needs setup, Not assessed, or Not applicable. It never competes with Attention or hide its basis behind an unexplained percentage.

## Editing affordances

- Editing is **discovered, not forced** — a quiet "Edit ▸" or an inline field, never a page-dominating form.
- The **consequence sentence** is a bordered, tinted one-liner (Bend-Pine-tinted when resolved, ember-tinted when incomplete) that restates the substrate's result as a business outcome, updating live as fields change.
- The **effective-from save** is a single quiet line ("Effective from Today ▾") beside the Save button — the only visual nod to versioning.
- Derived numbers carry a small ⓘ that reveals their plain-language basis on hover/tap.

## Interaction rhythm

- **Immediate, but authoritative.** A save may keep valid displayed data visible, but success is not declared and an editor is not closed until the authoritative mutation response contains the submitted patch. The local read model, summaries, and readiness then update from that confirmed row; a hard refresh must reproduce the same value.
- **Motion preserves context** (premise 6): transitions are subtle (100–250ms ease), used to keep the operator oriented across tab and object switches — never decorative, and honoring `prefers-reduced-motion`.
- **Calm under pressure:** even in error (a guardrail hit), the surface stays composed — an inline, kind message beside the field, not a red modal.

---

## The one-paragraph "why"

Put together: a configuration workspace feels different because it visually **commits to the object and the consequence** and visually **refuses the schema**. The object's name dominates; a single accent carries all signal; whitespace carries the calm; numbers arrive as sentences; inheritance whispers; editing is a quiet, deliberate act with an immediate, legible result. It does not look like a settings page because it is not organized around settings — it is organized around a thing the operator runs.

---

## Executable token authority

Where this doc and code disagree on a token value, **code wins** (`globals.css` `@theme`, `configurationRuntime.css`, `web/styles/tokens/colors.ts`). This doc names the *intent* of each token; the values are authoritative in code (per `alloy-visual-language.md`'s token-authority rule).

## Related docs

- `configuration-workspace-platform-doctrine.md` — the platform this visual language serves.
- `configuration-workspace-component-library.md` — the primitives these visuals compose into.
- `alloy-visual-language.md`, `operational-surface-design-system.md` — the parent visual systems.

## When this doc must be updated

A new configuration visual pattern is adopted, the accent/token system for configuration changes, or a card family is added or retired.
