# Firefly Enrollment Focus Panel — version ledger and QA disposition

Certification artifact for the PR #809 authenticated QA window. Read under the product's own
`GET /api/admin/entity-layouts` as the registered QA identity; no database census was needed.

**Surface** — `entity_type=opportunities`, `surface=drawer`, `layout_key=focus_panel_summary`,
org Firefly Early Learning (`93667019-bd28-49b5-a688-acc9bb1e0a19`).

## The ledger is append-only by design

`entity_layouts` holds **one row per version**, unique on
`(org_id, entity_type, surface, layout_key, version)`. `status` admits only `draft` and
`published` — there is **no archived, superseded, hidden or test state**. Publishing writes a new
row; `rollbackLayoutFromVersion` is a roll *forward* and says so outright: *"Historical rows are
never mutated."*

So a published version is a durable record of what was live at a moment, and the only sanctioned
way to change what is live is to add another version. **That is exactly what the QA restoration
did** — it is not a workaround, it is the mechanism.

## The QA window is ordinary in kind, not just in intent

There are **153 published versions**, the first from 2026-06-30. **112 of them carry geometry
identical to their predecessor** — 73% of this ledger is no-op republication produced by ordinary
authoring sessions. Five such versions (v141–v145) were published on 2026-09-02, before any of
this work. The seven QA versions are indistinguishable in kind from what the ledger already held.

## Chronology

| Version | Row id | Published (UTC) | Geometry (the cards that moved) | Class |
| --- | --- | --- | --- | --- |
| v141 | `b3695391-5340-4302-9d87-bb72811201ee` | 2026-09-02 21:53:19Z | business_process 1/8, financials 9/4 | PRE-EXISTING |
| v142 | `223bc102-b380-406f-aa30-23d5e8f3a1a4` | 2026-09-02 23:05:31Z | business_process 1/8, financials 9/4 | PRE-EXISTING |
| v143 | `d2c9d806-7512-4149-8240-04f03de9d4b3` | 2026-09-02 23:23:58Z | business_process 1/8, financials 9/4 | PRE-EXISTING |
| v144 | `55bf061e-0c89-4db2-9bce-889871f6de07` | 2026-09-02 23:53:29Z | business_process 1/8, financials 9/4 | PRE-EXISTING |
| v145 | `7012b07c-63ba-4a2b-a387-33ba63a8f756` | 2026-09-02 23:54:11Z | business_process 1/8, financials 9/4 | PRE-EXISTING |
| v146 | `e584865f-f065-46c1-9602-24970e63d6d6` | 2026-09-10 22:02:42Z | business_process 1/8, financials 9/4 | QA-INTERMEDIATE |
| v147 | `214c455e-0411-45b6-81fa-4c806dc1ab0e` | 2026-09-10 22:02:49Z | business_process 1/8, financials 9/4 | QA-INTERMEDIATE |
| v148 | `eba10508-0431-40f1-8922-e58e57b51c01` | 2026-09-10 22:04:22Z | business_process 1/8, financials 5/4 | QA-INTERMEDIATE |
| v149 | `82ea9318-7093-431d-b213-3d15105d6e2c` | 2026-09-10 22:04:30Z | business_process 1/8, financials 5/4 | QA-INTERMEDIATE |
| v150 | `d95d86ab-8754-4ba1-9ea5-a80e8522488d` | 2026-09-10 22:06:08Z | business_process 1/6, financials 5/4 | QA-INTERMEDIATE |
| v151 | `072c250a-1997-4eeb-a515-63e10b7e720c` | 2026-09-10 22:08:16Z | business_process 1/6, financials 9/2 | QA-INTERMEDIATE |
| v152 | `717a9fb3-f197-4bf8-aca9-df820d3edb94` | 2026-09-10 22:10:31Z | business_process 1/6, financials 7/2 | QA-INTERMEDIATE |
| v153 | `aa22a972-a518-43e3-8709-49cb64d98bba` | 2026-09-10 22:35:10Z | business_process 1/8, financials 9/4 | CURRENT-CANONICAL (QA-RESTORATION) |

`v153` geometry is **byte-identical** to `v145` across all six regions:
`attendance 1/6`, `business_process 1/8`, `children 7/6`, `financials 9/4`,
`health_safety 1/6`, `household 7/6`.

`v152` is the composition that exposed the defect PR #809 fixed — Financials authored two columns
wide (`7/2`) beside two six-wide cards, which the builder drew at 165px and the Work Unit drew at
554px.

## Disposition: KEEP, DOCUMENTED. Nothing deleted, archived or altered.

- **Deletion** — refused. These are published rows in an append-only ledger with no archive state.
  `business_process_layout_assignments.entity_layout_id` is the only foreign key into the table
  (`ON DELETE SET NULL`), so deletion would not error — it would silently punch holes in an audit
  chain to make it read more tidily. Audit truth outranks cosmetic cleanliness.
- **In-place annotation** — refused, and this is the interesting one. The `metadata` jsonb column
  exists and would take a "this was QA" marker. Writing it would **mutate historical published
  rows**, which is the one thing the versioning model promises never happens. A marker that costs
  the immutability guarantee is worth less than the guarantee.
- **A new archive/QA-version mechanism** — refused. None exists, and building one for a single
  org's history would be a Firefly-specific product change.

The version ids above are therefore the record. Anyone reading this ledger later can see which
rows the certification produced and why.

## Current state, re-certified

- Published: **v153**, `aa22a972-a518-43e3-8709-49cb64d98bba`, updated 2026-09-10 22:35:10Z.
- Draft: **none**.
- Builder and Work Unit both render `published-grid` over the same six regions, and a cold reload
  keeps it — `hygiene-builder-current.png`, `hygiene-runtime-current.png`, and the
  `focus-panel-surface-parity` spec, which compares the two surfaces directly.

## Not exposed to operators

The Surfaces workspace Versions tab reads *"Version history will appear here when available."* No
operator sees these rows today, so the QA versions are not visible clutter — they are ledger
entries that a future history UI, when it exists, should be able to explain. This document is what
explains them.
