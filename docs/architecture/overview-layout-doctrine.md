# Overview layout — doctrine

## What “overview” means

The **overview** is a **structured summary surface** for a record (or record-like object). It is **not** a stacked dump of every field the system knows about.

## Control surfaces

1. **Config** — Which facts, groups, and relationship summaries **appear** on the overview (and in what priority) is **data-driven**, not hardcoded per vertical in application code.

2. **Lightweight layout metadata** — How items are **composed** (e.g. grid vs band, column span, grouping into “contact / operational / financial / relationship summary”) uses **simple structural hints**, not a general-purpose page builder.

3. **Fixed renderer pattern** — A small number of **approved layout templates** interpret that metadata so the product stays coherent and accessible. **No drag-and-drop page builder** and no arbitrary freeform grids as the default model.

## Default pattern (conceptual)

A sensible default overview structure:

1. **Header strip** — Identity, status, key identifiers, breadcrumbs context as needed.
2. **Summary grid** — Highest-signal fields in a compact grid.
3. **Optional grouped bands** — Such as:
   - Contact / people summary  
   - Operational / scheduling summary  
   - Financial summary (when materially relevant)  
   - Relationship summary (semantic groups, not raw table rows)

Bands may be omitted per config.

## Relationship to RRS

Overview layout consumes the **Record Rendering System** payload and **field/section registry** data. The resolver supplies **semantic sections**; the overview config chooses **which sections appear** and **layout hints**; the renderer applies the **fixed pattern**.

## Conflicts to avoid

- **Do not** treat “every `field_definitions` row with drawer visibility” as the overview order.
- **Do not** use overview as the only place financial data exists — full record and workflows may expose more; overview **summarizes**.

**Terms:** [glossary.md](./glossary.md)
