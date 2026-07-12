# Action Workspace V3 — Abandon The Form

**Status:** Design sign-off (pre-implementation)  
**Scope:** Intake interaction model only — empty state first  
**Gallery:** `/dev/action-workspace-intake-v3-mockups`

---

## Problem with V2

V2 mockups were cleaner visually but still solved the wrong problem:

```
Title
[ Large Content Area ]
[ Analyze with BOS ]
```

That is still a textarea inside a prettier container — CRM software, not BOS receiving information.

---

## V3 principle

The workspace **evolves**. Do not render a review/document surface before content exists.

```
Information arrives → BOS reviews → BOS understands → BOS presents findings
```

Not: `Information arrives → giant textarea`

---

## Concepts (screenshots)

Path: `docs/sprints/archive/06_2026/assets/action-workspace-intake-v3-mockups/`

| Concept | Model | Empty-state behavior |
|---------|--------|----------------------|
| **A — Inbox** | New inquiry arrived | Action rows: Drop email · Paste inquiry · Add call note · “No content yet” |
| **B — Intake Tray** | BOS waiting for material | Channel grid: Email · Call Note · Website Inquiry · Paste Text |
| **C — Conversation** | BOS prompts first | “Tell me about the family.” · Paste inquiry · Enter manually |
| **D — Drop Zone** | Calm creative drop | Whitespace · drop target · paste links · no form until content |

---

## Abandoned patterns

- Giant textarea
- Blank document canvas
- Review surface before content exists
- Analyze button below a form field
- V2 layout iterations

---

## Capture screenshots

```bash
cd web && npm run screenshots:action-workspace-intake-v3
```

---

## Next step

Choose an interaction model (or hybrid). Implementation touches intake composition only — no BOS identity redesign, no workflow/backend changes.
