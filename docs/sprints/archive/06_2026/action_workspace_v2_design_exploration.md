# Action Workspace V2 — Design Exploration Sprint

**Path:** `docs/sprints/06_2026/action_workspace_v2_design_exploration.md`  
**Status:** **Concept B+ approved** — mockups for sign-off  
**Date:** 2026-06-08

## Approved direction: Concept B+

Split-pane BOS workstation with mandatory source visibility and conversational findings.

| Principle | Rule |
|-----------|------|
| Source Material | **Always visible** — never collapsed or removed after analysis |
| Findings voice | Lead with BOS findings, not field names |
| BOS tone | Conversational, operator-focused, not chatbot, not verbose |
| Visual | Alloy dark header, gold BOS identity, juniper/amber/red confidence, workstation feel |
| Avoid | Giant white modal, wizard pills, generic SaaS styling |

## Mockups (design sign-off)

**Live gallery:** `http://localhost:3000/dev/action-workspace-v2-mockups`

**Screenshots:**

```bash
cd web && npm run dev   # separate terminal
cd web && npm run screenshots:action-workspace-v2
```

Output: `docs/sprints/06_2026/assets/action-workspace-v2-mockups/`

| File | State |
|------|-------|
| `01-intake.png` | Source + BOS waiting |
| `02-findings.png` | Source + conversational findings |
| `03-fill-gaps.png` | Source + applied + gaps |
| `04-ready-to-create.png` | Source + approved preview |

**Implementation gate:** No production code until mockup sign-off.

---

## Concept B+ specification

### Shell — Action Deck (not modal)

- ~85vw workstation anchored to workspace
- **Dark Alloy header** (`alloy-midnight`) — title, subtitle, phase timeline
- **Split body:** Source Material (38%) | BOS Findings (62%)
- **Gold divider** (2px) between panes
- Footer spans full width — human approval actions

### Phase timeline (replaces wizard pills)

`Intake → Findings → Fill Gaps → Ready To Create`

Past phases show juniper check. Active phase shows gold chip.

### Source Material (left pane)

- Stone/document panel — inquiry text in readable pre-wrap
- Label: "Source Material · Always visible"
- Intake: Analyze CTA in pane footer
- **Never dimmed, never hidden** after analysis

### BOS Findings (right pane)

Gold-accent header: `✦ BOS Findings` + status line.

**Finding cards** — headline first:

| Status | Headline pattern | Color |
|--------|------------------|-------|
| Confirmed | "Found Contact Information" | Juniper rail + badge |
| Review | "Parent Name Needs Review" | Amber panel |
| Uncertain | "Location Requires Confirmation" | Red panel |

Inside expanded detail only: field labels (Email, Phone, First name…).

BOS narrative line per state:

> *BOS: I read the inquiry. Contact and family names look solid. Please confirm the source.*

### Fill Gaps

- Collapsed confirmed findings (one-line juniper summary)
- Amber "Still needed from you" panel
- Minimal inputs — **only missing platform keys**
- Source still full visibility on left

### Ready To Create

- Juniper readiness banner — BOS: "Ready when you are."
- Approved record preview (human-readable, not field grid)
- Footer: Review first (secondary) + Create lead (juniper primary)
- Source still visible for final comparison

### BOS copy templates

| Finding type | Confirmed | Review |
|--------------|-----------|--------|
| Contact | "Found Contact Information" | "Contact Needs Review" |
| Parent | "Found Parent Name" | "Parent Name Needs Review" |
| Child | "Found Child Information" | — |
| Source | — | "Source Needs Review" |
| Location | — | "Location Requires Confirmation" |
| Notes | "Found Inquiry Notes" | — |

---

## Original exploration (reference)

Three concepts explored: A Command Surface, B Split Pane, C Guided Assistant.

**Recommendation retained:** B as base, with A narrative voice + C gap-fill disclosure.

See git history for full A/B/C wireframes and comparison tables.

---

## Next step after sign-off

1. Component inventory (presentation layer only)
2. BOS copy template module per finding type × confidence
3. Implementation sprint — migrate `CreateLeadModal` gather UI to B+ deck
4. Regenerate screenshots against production components

**Execute path, registry, backend: unchanged.**
