# Experience Builder / Layouts Architecture — Mockups

**Status:** Design only — no implementation  
**Parent:** [`../experience_builder_layouts_architecture.md`](../experience_builder_layouts_architecture.md)

Open any `.html` file in a browser at **1440px** width. Styles: `_shared.css` (Bend Pine · Configuration Mode · white canvas).

| # | File | Scenario |
|---|------|----------|
| 1 | `01-layouts-landing.html` | `/settings/layouts` landing — Context + Layout Queue + Summary workspace |
| 2 | `02-surface-selector.html` | New Layout — surface family + entity chooser |
| 3 | `03-layout-queue.html` | Layout list with draft/published/default badges |
| 4 | `04-empty-workspace.html` | Guided blank layout — start from catalog |
| 5 | `05-card-catalog.html` | Add card — blueprint catalog overlay |
| 6 | `06-card-editor-add-field.html` | Card selected — direct add field affordance |
| 7 | `07-field-inline-menu.html` | Field inline edit popover |
| 8 | `08-expanded-content-editor.html` | Collapsed vs expanded slot editor |
| 9 | `09-queue-row-editor.html` | Queue row slot configuration |
| 10 | `10-focus-panel-summary.html` | Focus Panel Summary mode editor |
| 11 | `11-focus-panel-work.html` | Focus Panel Work mode editor |
| 12 | `12-publish-assign.html` | Publish flow + where used + Assign in Processes |

## Visual law

- Configuration Mode: Context → Layout Queue → Layout Workspace → BOS  
- Primary actions: Bend Pine `#00a283`  
- No blue admin styling · no gray accordion panels  
- Typography: page title 24px · workspace title 19px · queue item 15px · field labels 11px uppercase  

## Not in scope

These mockups are static HTML — no React, no API, no migrations.
