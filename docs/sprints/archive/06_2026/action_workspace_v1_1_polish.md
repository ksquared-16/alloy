# Action Workspace V1.1 — UX Polish Sprint

**Path:** `docs/sprints/archive/06_2026/action_workspace_v1_1_polish.md`  
**Status:** Complete (Create Lead reference)  
**Date:** 2026-06-08  
**Scope:** Polish only — no new actions, action types, or AI features

## Goal

Move Action Workspace from technically correct to delightful, trustworthy, and BOS-first — the primary BOS-assisted execution surface alongside (not replacing) BOS Command Center.

**Hero principle:** BOS assists; the human approves. The form is not the hero.

---

## UX decisions

### 1. No vertical scrolling

- Shell height: `min(calc(100vh - 8.5rem), 820px)` — reserves space for BOS Command Center (`ACTION_WORKSPACE_VIEWPORT_INSET`).
- Content area: `overflow-hidden`; gather sub-panels use flex + tabbed fields instead of long scroll.
- Acceptance: Create Lead gather phases fit in viewport without workspace scroll.

### 2. BOS-first gather sub-flow

Inside **Gather**, three exclusive phases:

| Phase | Visible | Hidden |
|-------|---------|--------|
| **A · paste** | Paste canvas, BOS banner, Analyze CTA | Form fields |
| **B · bos-results** | Suggestions, confidence, missing hints, Apply | Form fields |
| **C · details** | Tabbed gather form (Person / Child / Context) | Paste + suggestions |

Users meet BOS before form fields. Manual entry skips A/B via **Enter manually**.

### 3. BOS visual identity

- `ActionWorkspaceBosBanner` — gold gradient anchor (`alloy-gold`, `alloy-gold-dark`).
- Analyze CTA uses gold gradient + Sparkles icon (not generic blue).
- Suggestion cards use gold-framed panel; confidence uses semantic left border.

Related to Command Center but distinct: Command Center = conversation; Action Workspace = execution.

### 4. Confidence system

| Level | Label | Color |
|-------|-------|-------|
| `high` | High confidence | Green (`alloy-pine`) |
| `medium` | Needs review | Amber |
| `low` | Low confidence | Red |

Parser tightened: call-note phrasing (`"Johnson called today"`) no longer heuristically extracts as a parent name line.

### 5. Inline suggestion editing

Each suggestion card has an editable input. Corrections happen before Apply; inline edits disable the fast path (same as post-apply form edits).

### 6. Visual hierarchy

1. BOS banner (what is happening)
2. Primary canvas (paste / suggestions / tabbed form)
3. Missing-required or confidence hints
4. Footer actions (Cancel → Review/Create)

Header title reframed: **"Tell BOS about the family"** with subtitle explaining lead creation — action name revealed in context, not as the opening headline.

### 7. BOS Command Center relationship

| Surface | Role | Z-index |
|---------|------|---------|
| BOS Command Center | Exploration, conversation, cross-record assist | ~90 |
| Action Workspace | Task execution, structured gather, explicit confirm | 98 |

Workspace never overlaps Command Center; shared gold BOS language, different layout density.

---

## Review step — recommendation (implemented)

**Retain Review as a conditional step, not the default path.**

### Fast path (skip Review)

After BOS Apply, when **all** of:

- `gatherPhase === "details"`
- Platform minimum satisfied (name + email or phone)
- Applied from BOS (not manual-only entry)
- No inline suggestion edits before apply
- No form edits after apply
- All applied suggestions were `high` confidence

→ Primary CTA: **Create lead** (goes straight to Execute). Secondary: **Review first**.

### Review required

- Any `medium` or `low` confidence in applied suggestions
- Manual entry path
- Inline suggestion edits or post-apply form edits
- Platform minimum not yet met (stays on details with alert)

→ Primary CTA: **Review lead** → read-only summary → Confirm & create lead.

**Rationale:** High-trust BOS flows lose a click; ambiguous extractions keep explicit human confirmation. Review remains in the step rail for orientation but is not always visited.

---

## Title exploration

| V1 | V1.1 |
|----|------|
| "Create Lead" | "Tell BOS about the family" |

Step rail still shows Gather → Review → Execute → Continue. Execute/Success copy uses "Lead" where the outcome is clear. Registry action key remains `create_lead`; only workspace framing changed.

---

## Screenshots

Regenerate:

```bash
cd web && npm run dev   # separate terminal
cd web && npm run screenshots:action-workspace
```

| File | State |
|------|-------|
| `01-bos-intake.png` | Paste only (State A) |
| `02-bos-suggestions.png` | Suggestions + confidence (State B) |
| `03-gather-details.png` | Form after Apply, fast-path footer |
| `04-review.png` | Conditional Review |
| `05-execute.png` | Execute |
| `06-success.png` | Success / drawer handoff |

Gallery: `http://localhost:3000/dev/action-workspace-review`

---

## Files touched

| Area | Files |
|------|-------|
| Shell / theme | `ActionWorkspaceShell.tsx`, `actionWorkspaceBosTheme.ts`, `ActionWorkspaceBosBanner.tsx` |
| Gather UX | `ActionWorkspacePasteCanvas.tsx`, `ActionWorkspaceBosSuggestions.tsx`, `ActionWorkspaceGatherFields.tsx` |
| Flow | `actionWorkspaceGatherFlow.ts`, `CreateLeadModal.tsx` |
| Parser | `parseCreateLeadIntakeText.ts` |
| Dev / screenshots | `ActionWorkspaceReviewGallery.tsx`, `action-workspace-review.spec.ts` |

---

## Acceptance notes

| Requirement | Status |
|-------------|--------|
| No workspace vertical scroll | ✅ Viewport inset + overflow-hidden |
| BOS before form | ✅ Three-phase gather |
| BOS visual identity | ✅ Gold banner, confidence colors |
| Inline suggestion edit | ✅ Editable suggestion inputs |
| Conditional Review skip | ✅ `canFastPathCreateLead` |
| Command Center preserved | ✅ Bottom inset, documented distinction |
| No new actions / AI | ✅ Polish only |
| Create Lead without scroll | ✅ Tabbed compact form |

### Out of scope (unchanged)

- Child field persistence on execute
- AI parser swap
- Migrating other actions to Action Workspace

---

## Tests

```bash
cd web && npm run test -- \
  tests/admin/actions/actionWorkspaceFoundation.test.ts \
  tests/lifecycle/actionIntakePasteParser.test.ts
cd web && npx tsc --noEmit
```
