# AdminV2 AI Command Surface (v1)

**Status:** Implementation spec (AdminV2 internal).  
**Non-goals (explicit):** No LLM in v1. No floating chat window. No draggable AI. No primary AI response in the right rail. No traditional infinite chat transcript in the main UI.  
**Scope v1:** AdminV2 only. One command surface pattern. First domain: **job overview configuration assistant** (existing semantic planner + existing v1 apply rail).

**Core model (fixed):** Bottom **command surface** + **upward expansion** into a response region in the **same visual zone**. This document refines that model for a tighter, product-complete implementation—without changing the core layout.

---

## 1. Summary

AdminV2 needs an AI-native **command surface**, not a chatbot. Configuration and navigation behave like **native admin commands**: the user issues a command from a **bottom-docked bar**, and the UI expands **upward** into a **response region** that is **one unified component** with that bar—not a separate modal or a detached panel.

This surface is optimized for:

- **One-shot commands with review/apply** (preview → diff → apply).
- **Short follow-ups** that refine the last result (**replace-in-place**, not a stacked transcript).
- **No-op protection** (already satisfied / unresolved-only) to prevent meaningless audit churn.
- **Trust cues** (confidence / clarity) and **suggested next actions** as first-class UI, not prose buried in rationale.

Full history and audit belong in **AI Activity**, not in the live command surface.

### 1.1 What this is NOT

This command surface is explicitly **not**:

| Not this | Why |
|----------|-----|
| **A chatbot transcript** | No scrolling message list, no user/assistant bubbles, no “thread” as the primary model. |
| **A floating or draggable chat window** | No detached chrome; expansion is anchored to the bottom workspace edge. |
| **A right-rail-first AI surface** | The right rail stays secondary; the primary AI readout lives in the bottom zone. |
| **An agent-picker or multi-agent switcher UI** | v1 does not center on choosing agents; it centers on **commands in context** (domain expands later). |
| **An LLM conversation** | v1 is deterministic / catalog-backed where specified; no open-ended model chat in this surface. |

---

## 2. Layout model

This model assumes the AdminV2 workspace shell contract (primary workspace + secondary right rail). The AI command surface is a **bottom-docked, unified component** that **grows upward** when there is something to show.

### 2.1 Regions

- **Top nav (global)**  
  Persistent. Not owned by the AI surface. May show lightweight status (e.g. “Working…”) but not the primary response.

- **Main workspace (primary canvas)**  
  The current AdminV2 workspace stays visible (record/queue/work unit/etc.). The AI surface **must not** replace it.

- **Bottom command surface (primary AI zone)**  
  The sole entry point for commands: **persistent command input** + primary trigger(s). Always reachable.

- **Response region (same component, expands upward)**  
  When a command runs or completes, the **same unified component** increases height upward to reveal the response. Content scrolls **inside** this region; the **input stays docked at the bottom** of the component.

- **Right rail (secondary support)**  
  Context, “what’s next,” lightweight helpers. Must not compete with the command surface for primary attention.

- **AI Activity (separate destination)**  
  Canonical history, audit, applied changes. The live surface shows **one current response** only.

### 2.2 Visual relationship (workspace)

- The workspace remains visible behind the expanded component; optional subtle dim only (see §5.3).
- The right rail does not host the AI transcript or primary response.

### 2.3 Visual anchoring (unified component)

The **command input** and **response panel** are **one UI component**, not two:

- **Shared container:** One bottom-anchored surface with a single border/shadow treatment (per AdminV2 tokens). The response area reads as **growing out of** the command bar, not as a separate dialog.
- **No modal semantics:** Avoid centered modals, draggable panes, or “floating card” that breaks the bottom edge. If focus management needs a scrim, it should still **read as an extension of the bottom shell**, not a new window.
- **Vertical growth:** Expansion is **upward-only** from the bottom dock; the top edge of the component moves up; the input row stays at the **bottom** of the component.
- **Continuity:** The response region should visually “stack” above the input **inside the same rounded frame** (or equivalent), so the user always sees: **[response body → scroll] [input row]** as one object.

Implementation note: the “response panel” is not a second mount—it is the **expandable body** of the command surface.

---

## 3. State model

The command surface is a finite-state UI with clear transitions. State names below are UI states, not backend states.

### 3.1 Idle

- Bottom bar shows input + primary action (e.g. “Preview” / “Run”).
- Expanded body **collapsed** (height minimal or zero).
- Workspace fully interactive.

### 3.2 Focused (typing)

- Input focused; optional inline hints (v1 optional).
- Enter submits (or Cmd/Ctrl+Enter per product convention).

### 3.3 Loading (command executing)

- Expand upward **immediately** with a compact loading state (skeleton or spinner) so motion reinforces “work is happening **here**.”
- Headline may read **“Working on your request…”** (see §4.6) or a domain-specific loading headline.
- Workspace remains visible; interaction may stay enabled (preferred) or use light dim (optional).

### 3.4 Response shown

- Expanded body shows **one** response payload using the hierarchy in §5.1.
- **Command input remains visible** at the bottom of the unified component.

### 3.5 Replace-not-stack (critical)

- **Each new submitted command replaces** the current response body entirely.
- Do **not** append prior turns as stacked messages. Do **not** build an in-panel transcript.
- Optional: a single subtle line when replacing (e.g. “Replaced previous preview”)—**not** a history list.
- Follow-ups are **new commands** that replace content the same way; they may *reference* prior context in logic, but the UI still shows **one** response.

### 3.6 Apply / review mode

For responses that propose changes:

- Primary CTA: **Apply** (when changes exist and apply is allowed).
- Secondary: **Dismiss** / collapse.
- **Suggested actions** row may include **Refine request**, **Open in AI Activity**, etc. (see §5.4).

### 3.7 No-op mode (already satisfied / unresolved-only)

When preview determines **no meaningful layout diff** (or equivalent in other domains):

- Headline and confidence state reflect **no-op** or **blocked** (see §4.6, §5.2).
- **Apply disabled by default**; **Apply anyway** appears as a **suggested action** (explicit opt-in), not hidden in advanced text.
- Still show unresolved targets, rationale, diff summary, and raw proposal under **Advanced** for transparency.

### 3.8 Dismissed / collapsed

- Expanded body collapses; input may retain last command text (prefer retain).
- No transcript remains in the surface; history is in AI Activity.

### 3.9 Follow-up mode (lightweight)

- User types again in the **same input**; submit **replaces** the panel content (see §3.5).
- At most **one** contextual line allowed (e.g. “Refining last preview”)—never a chat log.

---

## 4. Response model

All responses render in the expanded body **above** the persistent input. Each response type maps to a template: **headline** (§4.6) + **confidence** (§5.2) + sections (§5.1) + **suggested actions** (§5.4).

### 4.1 Informational / explanation

- Teaching or clarifying without mutation.
- Typically **clear match** or **partial match** if scope is fuzzy.
- Suggested actions: **Refine request**, **Open docs** (if applicable), **Open AI Activity**.

### 4.2 Action preview / diff (proposal)

- Primary domain for **Apply**.
- Shows what will change; advanced holds rationale, diff, raw proposal.

### 4.3 No-op / already satisfied

- **No layout/config diff** to apply.
- Apply disabled; **Apply anyway** only as explicit control when policy allows.

### 4.4 Navigation / open

- Outcome is routing: open queue, record, settings area.
- Primary CTA is **Open** / **Go to…**; no Apply.

### 4.5 Unresolved / capability gap

- System cannot place a requested concept on the current rail/domain (e.g. phone/email without keys).
- Often pairs with **partial match** or **unresolved / blocked** confidence.
- Suggested actions: **Add custom field**, **Open relationship settings**, **Refine request**—see §5.4.

### 4.6 Headline system (product copy patterns)

Headlines are **one line**, **sentence case**, **non-chatty**. They appear at the **top of the expanded body** (above confidence). Use these patterns by situation:

| Situation | Headline pattern | Example |
|-----------|------------------|---------|
| **No-op / already satisfied** | `Layout already matches` / `No changes to apply` | **No changes to apply** — *Subline optional: “Your overview already matches this request.”* |
| **Unresolved / capability gap (only)** | `Can’t add X on this overview` / `Some requests couldn’t be placed` | **Some requests couldn’t be placed on the overview** |
| **Action preview** | `Review changes` / `Preview ready` | **Review changes before applying** |
| **Navigation / open** | `Open [destination]` | **Open unassigned jobs queue** |
| **Apply success / applied** | `Changes applied` | **Changes applied** — *Subline: link to AI Activity.* |
| **Loading** | `Working on your request…` | **Working on your request…** |

Rules:

- Prefer **outcome-first** (“No changes to apply”) over assistant-y (“Here’s what I found”).
- Avoid emoji and avoid “I” in headlines; optional in sublines if it aids clarity.
- **Subline** (one line, muted) is optional for context; keep headlines short.

---

## 5. Interaction model

### 5.1 Content hierarchy (exact order above the input)

Content **above** the persistent command input should appear in this **fixed order**. Skip empty sections.

1. **Headline** (+ optional subline) — see §4.6.
2. **Confidence / clarity indicator** — see §5.2 (always show for command responses; compact).
3. **What I understood** — short, structured (bullets or key-value), plain language.
4. **What will change** (preview) **or** **What happened** (after apply) — bullets.
5. **What I couldn’t place** — only if unresolved/gaps exist; explicit list.
6. **Suggested actions** — actionable controls (see §5.4); not duplicate prose from rationale.
7. **Primary row: Apply / Dismiss / Open** — domain-dependent; **Apply** only when applicable.
8. **Advanced details (collapsed by default)** — full rationale, structured diff, raw JSON / `structured_override`.
9. **Persistent command input** — fixed to the **bottom of the unified component** (not inside the scrollable advanced section).

Scrolling: the region between headline and the input scrolls; **input does not scroll away**.

### 5.2 Confidence / clarity indicator

A small **status model** always visible for command results (directly under headline, above “What I understood”):

| Status | Meaning | Typical use |
|--------|---------|-------------|
| **Clear match** | Request maps cleanly to supported intents and catalog fields. | Preview with a real diff; informational answers with high confidence. |
| **Partial match** | Some of the request was applied or understood; some parts could not be placed or need clarification. | Preview with diff **and** unresolved items; or ambiguous but usable outcome. |
| **Unresolved / blocked** | Nothing meaningful can be applied **or** the user-facing outcome is blocked until something else happens (e.g. only gaps). | No-op with only gaps; planner error; apply not allowed without override. |

**Presentation (v1 guidance):**

- Compact **pill** or **inline label + icon** at the top of the body (e.g. “Clear match”, “Partial match”, “Unresolved”).
- Color is **semantic but restrained** (AdminV2 tokens)—not alarming for partial; blocked can be stronger.
- **Purpose:** set trust **before** bullets—users should know *how literally* to take the preview.

Mapping note (semantic overview): combine planner signals (e.g. `effective_layout_change`, `unresolved_targets`, ambiguity) into this tri-state for the UI layer—exact mapping is an implementation detail, but the **user-facing triad is stable** across domains.

### 5.3 Suggested actions (inline controls)

A dedicated row **between** the main explanatory sections and **Advanced details** (and **before** or **alongside** primary Apply/Dismiss, depending on density—**never** only inside rationale text).

**Purpose:** turn common “what next” outcomes into **buttons or tertiary links**, e.g.:

| Action | When |
|--------|------|
| **Refine request** | Always useful after a preview or partial result; focuses input / placeholder. |
| **Apply anyway** | No-op or blocked apply; explicit override only. |
| **Add custom field** | Unresolved facts that need org-defined fields (capability gap). |
| **Open relationship settings** / **Open person** | When channels/PII live outside overview layout. |
| **Open AI Activity** | View audit / full detail. |
| **Open [queue / record / tab]** | Navigation-style outcomes. |

Rules:

- **Actions are controls**, not sentences in the rationale.
- Cap visible actions (e.g. 3–4); overflow goes to a **“More”** menu if needed.
- Do not duplicate the primary **Apply** button here unless **Apply anyway** is conceptually different (override).

### 5.4 Panel open / expand behavior

- On submit, expand upward immediately (including loading).
- Max height with **internal scroll** in the response body; input fixed.
- No drag-to-resize required in v1.

### 5.5 Workspace dimming

- Prefer **no hard modal**; workspace stays readable.
- Optional light scrim **only** if needed for focus; never block the entire workspace by default.

### 5.6 Dismiss behavior

- Dismiss in panel header or secondary control collapses the expanded body.
- Escape may collapse when focus is in the surface (optional).

### 5.7 No-op protection (semantic overview v1)

When preview returns **no effective layout change**:

- Headline + confidence reflect **no-op** or **unresolved / blocked** per §4.6 / §5.2.
- **Apply** disabled; **Apply anyway** in **Suggested actions** (explicit).
- **Advanced** still contains rationale, diff summary, raw JSON for transparency.

---

## 6. Right rail / AI Activity roles

### 6.1 Right rail (secondary support)

Focus:

- **What’s Next** — task-oriented next steps for the current scope.
- **Light context** — facts that support decisions (config version, scope label).
- **Non-competing** reminders.

Must not:

- Host the primary AI response or transcript.
- Replace the command surface for preview/apply.

### 6.2 AI Activity (history and audit)

- Full history, applied proposals, audit trail.
- Live surface links here for “full story”; **does not** mirror a live transcript in the main UI.

---

## 7. Recommended implementation phases

### Phase 0 — UI shell (unified component)

- Bottom command surface with **single component** architecture: expandable body + **persistent input** (§2.3, §5.1).
- **Replace-not-stack** behavior (§3.5).

### Phase 1 — Semantic preview integration (job overview only)

- Map planner output to: **headlines** (§4.6), **confidence** (§5.2), hierarchy (§5.1), **suggested actions** (§5.3).
- **No-op mode** when `effective_layout_change === false` (§5.7).

### Phase 2 — Apply flow (existing v1 rail)

- Wire Apply; success headline **Changes applied** (§4.6).
- Keep **Apply anyway** as suggested action for no-op override.

### Phase 3 — History hookup (AI Activity)

- Record events; **Open AI Activity** in suggested actions.

### Phase 4 — Narrow expansion

- Additional deterministic commands in the same surface; still **no transcript**, **no LLM** in v1 scope of this doc.

---

## 8. Open questions (pre-implementation)

1. **Exact visual token** for the unified surface (elevation, radius, divider between body and input)—should match AdminV2 shell components.
2. **Maximum expanded height** (viewport fraction vs fixed px) and whether **mobile** gets full-screen sheet (out of scope for some internal admin UIs).
3. **Confidence mapping** from planner: single source-of-truth table for semantic overview (when to show partial vs blocked when both diff and gaps exist).
4. **Apply anyway** copy and confirmation: checkbox vs two-step—product/legal preference for audit trails.
5. **Keyboard**: global shortcuts for focus command bar vs dismiss—align with existing AdminV2 patterns.
