# GPT Handoff — Digital Mailroom V2+ (post-lock)

**Paste into a new thread to continue Processing work.**

---

## Context

**Digital Mailroom V1 UI is locked** (2026-07-08). Do not redesign the shell.

- **Product name:** Digital Mailroom — "Where operational work happens."
- **Engine:** Processing (cases, form-draft, queue APIs)
- **Canonical UX:** AdminV2 modal via sidebar **Processing** → `ProcessingModal`

---

## Mode pattern (Work vs Studio)

| Level | Control | Work mode tabs | Studio mode tabs |
|-------|---------|----------------|------------------|
| 1 | `AlloyModeSwitch` | Work | Studio |
| 2 | `CommsModalTabBar` | Overview · **Queue** | Forms · Packets · Fields · Branding |

Shared nav: `OperationalWorkspaceModeNav` (Communications + Digital Mailroom).

**Horizontal divider:** `border-b border-stone-200` under level-2 tabs.  
**Vertical divider:** `border-r border-stone-200` on Queue panel in `PosProcessingWorkspace`.

---

## Tab hierarchy

```
ProcessingModal
└── DigitalMailroomShell
    ├── OperationalModalHeader
    ├── OperationalWorkspaceModeNav
    └── execution
        ├── Work + Overview  → ProcessingOverviewLanding
        ├── Work + Queue     → PosProcessingWorkspace
        └── Studio + *         → ProcessingFormsStudio → ProcessingFormBuilder
```

Forms editing stays **in-modal**. Never hand off to `/admin/forms` for operator flow.

---

## Work review (Queue, document case)

- Queue ~22% · Source document ~55% · Review questions ~23%
- `PosTemplateSetupColumn` + `ProcessingQuestionReviewList`
- Generate form → `openFormInStudio` (mode Studio, tab Forms)

---

## Do NOT

- Redesign shell, nav, or three-column review layout
- Change divider contract without explicit product approval
- Route operators to `/admin/forms` from Digital Mailroom
- Mix non-doctrine colors in shell chrome

---

## Next threads (functionality only)

OCR · AI extraction · Studio Packets/Fields/Branding · Runtime submission · BOS in Work surfaces

Docs: `docs/platform/modules/documents-and-forms.md`, `docs/sprints/07_2026/processing-v1-lock-closeout.md`
