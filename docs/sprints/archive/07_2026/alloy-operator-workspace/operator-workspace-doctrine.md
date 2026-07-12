# Alloy Operator Workspace Doctrine

**Status:** Implementation-ready — final design sprint (July 2026)

---

## North star

Operators open a record **because there is work to accomplish**. Information supports work. Work does not support information.

**Current Work** is the organizing principle — implemented as the **first Summary card** in the Focus Panel body, using the same Focus grammar as every other card.

---

## 1. Where Current Work belongs — analysis

| Approach | Verdict | Why |
|----------|---------|-----|
| **Hero banner** | ❌ Reject | Breaks card grammar; feels like a dashboard widget bolted above the product |
| **Workspace header section** | ❌ Reject | Header owns identity + navigation (OperationalModalHeader / fp-chrome). Work content in header competes with record identity |
| **Right rail panel** | ❌ Reject | Separate navigation model; proven wrong in V2 integration sprint |
| **Sticky persistent strip** | ❌ Reject | Third surface duplicating Summary; operators learn two "current work" locations |
| **First Summary card, Fill width** | ✅ **Recommend** | Same primitive as Household; earns priority through position + weight; Summary → Focus unchanged |

### Recommendation (locked)

**Current Work is row 1, Fill intent, full width — the workspace anchor card.**

It is not a new primitive. It is `current_work` with:
- `supportsFocus: true`
- Tier 1 Decision placement
- Enhanced visual weight (Bend Pine left accent, subtle elevation)
- Always above the fold on Summary + Work modes

**Persistence:** On Summary/Work modes, row 1 scrolls with the panel but is always the first thing visible on record open — no sticky chrome needed.

---

## 2. Complete workspace layout

```
┌─────────────────────────────────────────────────────────────────┐
│ App nav │ Global top bar (search · campus · account)            │
│         ├───────────────────────────────────────────────────────│
│         │ Work unit header (breadcrumb · work view pills · ◀▶) │
│         ├──────────┬──────────────────────────────┬───────────│
│         │ Queue    │ Focus Panel                  │ BOS rail  │
│         │ (preview)│ ┌ fp-chrome: identity + modes┐│           │
│         │          │ ├ fp-body ──────────────────┤│           │
│         │          │ │ [Current Work — FULL]      ││           │
│         │          │ │ [Household] [Children]     ││           │
│         │          │ │ [Readiness] [Tour]         ││           │
│         │          │ │ [Communications] [Docs]    ││           │
│         │          │ └────────────────────────────┘│           │
└─────────┴──────────┴──────────────────────────────┴───────────┘
```

**Activity mode:** Same fp-chrome; body switches to Activity Cockpit (communications hero, work panel, documents). Current Work collapses to compact chip — tap reopens Focus.

---

## 3. Visual hierarchy (justified)

| Element | Emphasis | Space | Rationale |
|---------|----------|-------|-----------|
| **Current Work Summary** | Highest | Full width row 1 | Answers "what do I do?" in 2 seconds |
| **Primary CTA** | High | Inside Current Work only | One green button — never duplicated |
| **Household / Children** | Medium | Row 2, half each | Identity truth — supports checklist handoff |
| **Readiness / Tour** | Medium-low | Row 3 | Diagnostic context — never competes with Current Work |
| **Communications / Documents** | Medium-low | Row 4 | Evidence — operator reaches via checklist or scan |
| **Queue rows** | Low-medium | Left rail | Preview/selection — work hint not status |
| **fp-chrome identity** | Medium | Fixed top of focus | Who — not what to do (no status chip) |
| **BOS rail** | Low | 56px right | Assist — never primary workflow |

**Full width:** Yes — Current Work spans both columns. Work is the spine; information cards are supporting columns.

**Visual anchor:** Yes — Bend Pine left border + elevation distinguishes Tier 1 without inventing a new component.

> **Token note:** Product language is **Bend Pine**. Internal CSS may still expose legacy aliases such as `alloy-juniper` / mockup `--juniper` that resolve to Bend Pine `#00A283`.

---

## 4. Surface relationships

| Surface | Relationship to Current Work |
|---------|------------------------------|
| **Household** | Checklist handoff target for contact work. Current Work coordinates; Household owns contact truth |
| **Children** | Handoff for program/schedule/start-date items. Current Work blockers reference Children |
| **Communications** | Handoff for outreach. BOS drafts route here. Current Work does not duplicate thread |
| **Documents** | Handoff for paperwork items. Read-only until operator opens |
| **Readiness** | Diagnostic — full factor view. Current Work shows mission-scoped blockers only; Readiness shows complete checklist |
| **Tour** | Context card. Schedule Tour supporting action + checklist handoff |
| **Activity** | Deep workspace for comms/timeline. Current Work chip persists; operator can complete work from Summary/Work modes |
| **History** | Inside Activity/timeline — not on Summary canvas. Current Work does not duplicate |

**Pattern:** Current Work **coordinates** and **hands off**. It does not summarize or duplicate card content.

---

## 5. Focus integration flow

```
Record open → Current Work Summary visible (row 1)
  → Click card or CTA → Current Work Focus (zoom-from-origin)
    → Work checklist / blockers / BOS / supporting
      → Primary CTA → completion phases inside Focus
        → Runtime executes
          → Focus body refreshes (next Current Work)
            → Dismiss → Summary card already updated
              → Continue (Household handoff, next queue row, etc.)
```

Identical grammar to Household Summary → Household Focus.

---

## 6. Operator flow (enrollment)

1. Click Digan Family in New Inquiries queue
2. See **Qualify Family** immediately — 2 of 3, Complete Qualification
3. Scan Household/Children if needed — or click checklist item
4. Open Current Work Focus — full checklist, blockers, BOS
5. Complete Qualification → What happened? → Confirm
6. Focus refreshes → **Schedule Tour**
7. Back to Summary — card already says Schedule Tour
8. Continue — no status read, no stage awareness

---

## 7. Cross-domain parity

Same layout, same card keys, same interaction. Only `projectCurrentObjective()` content changes.

---

## 8. What stays in header ··· 

Administrative only: Export, Duplicate, Close (advanced). No Update Status. No workflow verbs that appear on Current Work Focus.

---

## Implementation mapping

| Mockup region | Code target |
|---------------|-------------|
| os-frame | Work unit page + AdminV2 shell |
| wu-header | Work unit header surface |
| queue-panel | QueueRegion |
| fp-chrome | FocusPanelShell / OpportunityFocusPanelHeader |
| fp-scroll + card grid | FocusPanelCardGrid + published layout |
| card-current-work | `current_work` card Summary view |
| Focus overlay | FocusPanelCardGrid elevated Focus |
| bos-rail | BOS rail (existing) |

No new routes. No new runtime modules.
