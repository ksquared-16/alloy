# Queue system

**Status:** Canonical (June 2026 freeze).

Queue preview contract, QueueService behavior, and operational row presentation.

---

## Purpose

Queues are **stage execution lenses** — preview lists that help operators select records. They are not authoritative record stores.

---

## Truth boundary (locked)

Queue rows MAY: render labels, sort/filter, select entity, navigate to drawer.

Queue rows MUST NOT: drive business logic, workflows, actions, financial math, identity resolution, or drawer authority.

**Pattern:** Queue → select → entity GET → act.

---

## Queue definition

JSON on `work_units.queue_definition` (v1 schema):

- **Sections / domains** — lane groupings (enrollment pipeline)
- **Grain** — `case` vs `candidate` / child-primary
- **Filters, sorts, allowlists** — interpreted by `QueueService`
- **Needs attention queue** — optional overlay lane

Validated by `web/lib/config/queueDefinitionSchema.ts`.

---

## QueueService

`web/lib/queues/QueueService.ts`:

- Org timezone bounds
- Status definition joins
- Opportunity enrichment (person, tour preview, placement priority opt-in, attention flags)
- Summaries + paginated item lists

Enrichment reads canonical tables for **display** — list remains preview.

---

## Route-owned selection

URL `?queue=` + attention bucket aliases beat bootstrap default lane.

Code: `workUnitQueueSelection.ts`, bootstrap `focus_queue`.

---

## Operational queue rows (layout v3)

`metadata.queue_record_layout` v3 — columns, fields, widgets from Settings layouts.

Renderer owns spacing/typography only. Locked: `../../system/queue-record-doctrine.md`.

---

## Needs Attention

Resolver-backed overlay — not a stage. Bucket config: `metadata.opportunity_attention_rules.needs_attention_buckets`.

Count semantics differ by surface/cap — align cohort before QA comparisons. Detail: `../../system/workspace-system.md` § Needs attention count semantics (transitional).

---

## Client-side record filters

URL-synced `q`, `rf_*` on work-unit page — filters loaded preview page only; server GET unchanged.

---

## Performance note

Queue row API latency (~800ms–1s) is known backend debt — not a reveal regression if gates hold.

---

## Related

- `../core/business-process-system.md`
- `../core/record-system.md`
- `../../system/workspace-system.md` (transitional expanded reference)
