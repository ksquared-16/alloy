# AdminV2 AI Command Surface — Component Spec (v1)

**Status:** Implementation spec (internal/admin-only).  
**Constraints:** No code in this doc. No LLM. No new backend rails. Do not broaden beyond **overview configuration assistant** (job overview semantic planner preview + existing v1 record-overview apply rail).  
**Depends on:** [`adminv2-ai-command-surface-v1.md`](./adminv2-ai-command-surface-v1.md)

---

## 1. Summary

This document specifies the **component-level architecture** for the AdminV2 AI Command Surface so it can be implemented without guessing.

The surface is a **single bottom-docked component** with a persistent input bar and an upward-expanding response body. It is **replace-not-stack** (no transcript) and uses deterministic preview/apply flows:

- **Preview:** existing semantic planner preview path for job overview layout.
- **Apply:** existing v1 `record_overview_layout` apply rail.
- **No-op protection:** respects `effective_layout_change === false` and requires explicit “Apply anyway”.
- **History:** persists to **AI Activity** (link out; no transcript in the surface).

---

## 2. Component tree

### 2.1 High-level tree (required)

```
AdminV2WorkspaceShell
  ├─ (top nav)
  ├─ MainWorkspaceCanvas
  ├─ RightRail (secondary)
  └─ AICommandSurfaceShell  (bottom-docked; unified component)
       ├─ AIResponsePanel   (expandable body; replaces content per submit)
       │    ├─ AIResponseHeader
       │    │    ├─ AIResponseHeadline
       │    │    └─ AIConfidenceBadge
       │    ├─ AIUnderstoodSection
       │    ├─ AIChangeSummarySection
       │    ├─ AIUnresolvedSection
       │    ├─ AISuggestedActionsRow
       │    ├─ AIPrimaryActionsRow
       │    └─ AIAdvancedDetailsDrawer
       └─ AICommandInputBar (persistent; always visible)
```

### 2.2 Component responsibilities (required)

#### `AICommandSurfaceShell`

- **Role:** Own the unified bottom-docked container and orchestrate state transitions.
- **Owns:** layout sizing, overlay/dimming policy, replace-not-stack behavior, focus management.
- **Inputs:** current workspace context (org id, entity scope, active record/queue identifiers), right-rail hooks, AI Activity link target.
- **Outputs:** preview/apply requests to existing endpoints; navigation requests to the router.

#### `AICommandInputBar`

- **Role:** Accept command text and submit; show minimal inline help (optional).
- **Always visible:** Even when the response panel is open.
- **Controls:** submit button, loading indicator (compact), optional “Dismiss” affordance when expanded.
- **Keyboard:** Enter submits (or Cmd/Ctrl+Enter if multiline is allowed; v1 recommend single-line + optional expansion to textarea).

#### `AIResponsePanel`

- **Role:** Expandable body above the input. Shows exactly **one** response at a time (replace-not-stack).
- **Behavior:** internal scroll for body; must not scroll the input out of view.
- **Visibility:** collapsed in idle; expanded in loading/response states.

#### `AIResponseHeader`

- **Role:** Show the headline + confidence indicator + small meta (timestamp optional, “View in AI Activity” link optional).
- **Must not:** show chat bubbles, user/assistant avatars, or transcript UI.

#### `AIConfidenceBadge`

- **Role:** Always-on clarity indicator with 3 states (see §3): `clear_match`, `partial_match`, `blocked`.

#### `AIUnderstoodSection`

- **Role:** Compact “What I understood” representation.
- **Format:** small key-value or bullet list (domain-specific).
- **Data:** from preview parse/intent.

#### `AIChangeSummarySection`

- **Role:** “What will change” (preview) or “What happened” (after apply).
- **Data:** from diff summary / apply result.
- **Must:** explicitly state when **no meaningful change** is proposed (no-op mode).

#### `AIUnresolvedSection`

- **Role:** Show unresolved / capability gaps (e.g. phone/email) as a stable list.
- **Must:** be explicit that unresolved items are **not applied**.

#### `AISuggestedActionsRow`

- **Role:** First-class next actions as controls (buttons/links), capped in count.
- **Examples:** Refine request, Apply anyway, Open AI Activity, Add custom field, Open relationship settings.

#### `AIPrimaryActionsRow`

- **Role:** Domain-appropriate primary CTA(s).
- **Examples:** Apply (only when allowed), Open (for navigation response), Dismiss/Close.
- **No-op rule:** Apply disabled by default unless “Apply anyway” is enabled.

#### `AIAdvancedDetailsDrawer`

- **Role:** Collapsible advanced details (collapsed by default).
- **Content:** rationale list, diff JSON/summary, raw proposal JSON / structured_override preview (read-only or editable per v1 policy—see §5.6).

### 2.3 Naming flexibility

You may rename the components to match the codebase conventions, but the **structural roles** must remain explicit and the tree above must be implementable 1:1.

---

## 3. State machine

### 3.1 State enum (required)

`AICommandSurfaceState`:

- `idle`
- `focused`
- `loading_preview`
- `showing_response`
- `review_apply` (preview with change)
- `no_op` (preview with `effective_layout_change === false`)
- `applying`
- `success_applied`
- `error` (preview or apply error)
- `dismissed` (collapsed; retains input and last response optional)
- `follow_up` (focused with last response context; still replaces content)

Notes:

- `dismissed` is a UI state; data may be preserved in memory but the panel is collapsed.
- `follow_up` is not a transcript state; it only affects input placeholder/context.

### 3.2 Transition table (required)

| From | Event | To | Notes |
|------|-------|----|------|
| `idle` | focus input | `focused` | Panel remains collapsed. |
| `focused` | submit command | `loading_preview` | Expand panel immediately with loading header. |
| `loading_preview` | preview success (change) | `review_apply` | `effective_layout_change === true`. |
| `loading_preview` | preview success (no-op) | `no_op` | `effective_layout_change === false`. |
| `loading_preview` | preview error | `error` | Show error headline + recovery actions. |
| `review_apply` | dismiss | `dismissed` | Collapses panel; keeps input text. |
| `no_op` | dismiss | `dismissed` | Collapses panel; keeps input text. |
| `review_apply` | submit follow-up | `loading_preview` | Replace-not-stack: wipe body, show loading. |
| `no_op` | submit follow-up | `loading_preview` | Replace-not-stack. |
| `review_apply` | click Apply | `applying` | Apply uses existing v1 rail. |
| `no_op` | click Apply | blocked | Apply disabled unless override enabled (see §5.5). |
| `no_op` | enable “Apply anyway” | `no_op` | Same state; updates allowed-apply flag. |
| `no_op` | click Apply (override enabled) | `applying` | Must still warn about version/audit churn. |
| `applying` | apply success | `success_applied` | Show “Changes applied”; link to AI Activity. |
| `applying` | apply error | `error` | Preserve preview details if possible. |
| `success_applied` | submit new command | `loading_preview` | Replace content. |
| `error` | edit command / retry | `focused` or `loading_preview` | Retry can reuse last command text. |
| `dismissed` | focus input | `focused` | No transcript shown. |

### 3.3 Confidence/clarity model (required)

`AIConfidence`:

- `clear_match`
- `partial_match`
- `blocked`

Suggested mapping for **semantic overview** responses:

- `clear_match`: preview ok, `effective_layout_change === true`, unresolved empty (or minimal).
- `partial_match`: preview ok, `effective_layout_change === true` **and** unresolved non-empty.
- `blocked`: preview ok, `effective_layout_change === false` (no-op) **or** preview ok but only unresolved targets; also used for preview failure errors.

This mapping is UI-level and must not imply model uncertainty; it communicates **fit** of the request to supported capabilities.

---

## 4. Layout / sizing rules

### 4.1 Unified container sizing

- **Collapsed height (idle/focused):** fixed bottom bar height (e.g. 56–72px depending on AdminV2 density), containing only the input bar row.
- **Expanded:** the same container grows upward to show `AIResponsePanel` above `AICommandInputBar`.

### 4.2 Expanded height behavior

Rules:

- Expand immediately on submit (loading state) to reinforce anchoring.
- Response body scrolls internally; input is fixed and always visible.

Recommended v1 sizing:

- **Max height:** \( \min(0.55 \times viewportHeight,\ 520px) \) for desktop-like sizes.
- **Small screens:** use a larger max height (up to ~0.75vh) but still keep a sense of “workspace behind” when possible.
- **Minimum expanded height:** enough to show headline + confidence + at least one section + primary actions (avoid a cramped “toast-like” response).

### 4.3 Responsive behavior (v1)

- **Desktop:** expanded panel as bottom sheet with max height; workspace remains visible.
- **Narrow widths:** input bar may become multi-row; suggested actions may overflow into “More”.
- **Very small heights:** allow near-full-height sheet, but keep the **unified bottom anchoring** (still a bottom sheet, not centered modal).

### 4.4 Workspace dimming / overlay policy

- Default: **no hard modal**. Workspace remains readable and clickable.
- Optional: subtle scrim when expanded to help focus, but must not read as a detached dialog.

### 4.5 Right rail behavior while active

Right rail remains visible and secondary. While the command surface is expanded:

- Right rail may show **support context** (current layout version, scope, “What’s Next”) but must not mirror the response panel.
- Right rail must not become the primary scrolling surface for the command output.

---

## 5. Rendering rules by response type

This section defines which subcomponents are required/optional for each response type.

### 5.1 Common rules (applies to all response types)

Always render:

- `AIResponseHeader` (headline + confidence)
- `AIPrimaryActionsRow` (even if it only contains Dismiss/Close)
- `AICommandInputBar` (persistent)

Never render:

- transcript stacks
- chat bubbles
- avatar-based “assistant messages”

### 5.2 Informational / explanation

Required:

- Header: informational headline
- Confidence badge (usually `clear_match` or `partial_match`)
- Understood section (what the command was interpreted as)

Optional:

- Suggested actions (Refine request, Open AI Activity)
- Advanced details (source links, longer rationale)

Primary actions:

- Dismiss/Close

### 5.3 Action preview (proposal)

Required:

- Header: “Review changes…” style headline
- Confidence badge
- Understood section
- Change summary section (what will change)
- Primary actions (Apply + Dismiss)

Optional:

- Unresolved section (if partial match)
- Suggested actions (Refine request, Open AI Activity)
- Advanced drawer (diff summary, rationale, raw proposal/structured_override)

### 5.4 No-op / already satisfied

Required:

- Header: “No changes to apply” / “Layout already matches”
- Confidence badge: `blocked`
- Change summary section must include **explicit no-op explanation**
- Suggested actions row must include at least one of:
  - Refine request
  - Apply anyway (explicit override)
  - Open AI Activity (optional)
- Primary actions: Dismiss/Close; Apply is disabled unless override enabled

Optional:

- Unresolved section (if unresolved-only is the reason)
- Advanced drawer (must include rationale + diff summary + raw proposal for transparency)

### 5.5 Unresolved / capability gap (gap-only or mixed)

If **gap-only** (nothing else changes):

- Render as **No-op** plus unresolved section.

If **mixed** (some changes + some gaps):

Required:

- Header + confidence `partial_match`
- Understood
- Change summary
- Unresolved section
- Suggested actions (Add custom field, Open relationship settings, Refine request)
- Primary actions (Apply + Dismiss)

Advanced drawer optional but recommended.

### 5.6 Navigation / open

Required:

- Header: “Open …”
- Understood (destination summary)
- Primary actions: Open + Dismiss

Optional:

- Suggested actions (Open in new tab, refine destination)
- Advanced drawer rarely needed

### 5.7 Applied / success

Required:

- Header: “Changes applied”
- Change summary: “What happened” (concise)
- Suggested actions: “View in AI Activity”
- Primary actions: Dismiss/Close

Optional:

- Advanced drawer: include raw applied payload / diff summary if helpful

### 5.8 Error (preview or apply)

Required:

- Header: error headline
- Confidence badge: `blocked`
- Understood section (echo the command and scope)
- Suggested actions: Retry, Refine request, Open AI Activity (if partial history exists)
- Primary actions: Dismiss/Close

Optional:

- Advanced drawer with error details and request ids (internal only)

---

## 6. Interaction behavior

### 6.1 Submit behavior

- Submit from input triggers immediate expand + loading state.
- Disable repeated submit while loading unless “Cancel and run” semantics are explicitly implemented (v1 recommend disable).

### 6.2 Replace-not-stack behavior (hard rule)

- On every submit, clear the response body and replace with loading.
- When result arrives, replace loading with the new response.
- Do not accumulate previous responses inside the panel.

### 6.3 Dismiss behavior

- Dismiss collapses the expanded panel (response body hidden) but does not clear input by default.
- Dismiss never deletes AI Activity history (history is independent).

### 6.4 Follow-up behavior

- Follow-ups are new commands that replace the panel content.
- Optional one-line context may appear in the header (“Refining last preview”) but must not create a transcript.

### 6.5 “Apply anyway” behavior (no-op override)

When in `no_op`:

- Apply is disabled by default.
- “Apply anyway” is an explicit control (checkbox or secondary confirm) shown in **Suggested actions**.
- When enabled, Apply becomes available but must retain a warning subtext (audit/version churn).

### 6.6 Advanced details behavior

- Advanced drawer is collapsed by default.
- Advanced is still available in no-op mode (transparency requirement).

### 6.7 Keyboard expectations (v1)

- **Focus command bar:** optional global shortcut (defer if no existing conventions).
- **Enter submits** when input is single-line.
- **Escape** collapses panel when expanded (optional; must not conflict with other AdminV2 dialogs).

---

## 7. Integration points (v1)

### 7.1 Semantic planner preview path (existing)

Use the existing job overview semantic planner preview integration (already in Agent/Lab flows). The UI surface must consume a response object that includes:

- planner result (success/failure)
- `effective_layout_change`
- unresolved targets
- rationale
- diff summary
- generated proposal payload (`structured_override`) for apply

The command surface should treat the preview as **authoritative** for no-op gating and confidence mapping.

### 7.2 Apply rail (existing v1)

Apply uses the existing v1 record-overview-layout agent route and must pass the existing envelope (`structured_override`). No new rails.

### 7.3 No-op / churn protection (existing logic)

When preview returns `effective_layout_change === false`:

- enter `no_op` state
- disable Apply by default
- offer explicit override

### 7.4 AI Activity (existing destination)

- On apply success, provide a suggested action / link to AI Activity (“View in AI Activity”).
- The command surface does not render a transcript; AI Activity remains the canonical history UI.

### 7.5 Right rail (existing secondary support)

Right rail remains secondary and should not mirror the response. If the right rail has a “What’s Next” module, it may incorporate:

- “Open AI Activity”
- “Review current layout”
- “Common commands” (optional)

But it must not compete with the command surface for primary response content.

---

## 8. Recommended implementation phases

### Phase 0 — Shell only

- Implement `AICommandSurfaceShell` + `AICommandInputBar` + collapsed/expanded sizing.
- Implement replace-not-stack mechanics and dismiss.
- Hardcode a few mock response objects to validate rendering.

### Phase 1 — Response rendering (static)

- Implement `AIResponsePanel` section components and the rendering rules matrix (§5).
- Implement advanced drawer and suggested actions row (wired to no-op gating flags).

### Phase 2 — Semantic planner hookup (preview)

- Wire submit → preview → render states (`loading_preview` → `review_apply` / `no_op` / `error`).
- Map planner outputs to understood/change/unresolved/diff sections.

### Phase 3 — Apply flow

- Wire Apply to existing v1 apply rail.
- Add applying/success/error states and AI Activity link.
- Enforce no-op protection and Apply anyway override behavior.

### Phase 4 — AI Activity linkage polish

- Ensure successful apply response includes stable link/anchor to AI Activity entry.
- Confirm that history is discoverable without polluting the command surface.

### Phase 5 — Future expansion (explicitly not v1)

- Additional admin config assistants (field visibility, queues) only after v1 is stable; keep replace-not-stack.

