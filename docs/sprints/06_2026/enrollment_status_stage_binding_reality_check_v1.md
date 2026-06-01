# Enrollment Status ↔ Stage Binding — Reality Check v1

**Status:** Step 1 (Process Builder next slice)

## Current source of truth

| Layer | Field | Purpose |
|-------|--------|---------|
| `status_definitions` | `status_key`, `status_label` | CRM inquiry status identity |
| `metadata.lifecycle_stage` | `intake` \| `qualification` \| `execution` \| … | **Universal CRM enum** — KPIs, not operator Enrollment Process stages |
| `metadata.enrollment_operator_stage` | `lead` \| `qualification` \| … \| `unassigned` | **Operator process stage** (this slice) |
| Code catalog | `ENROLLMENT_STAGE_STATUS_KEYS` | Platform defaults when metadata absent |

**Queues / work units** filter by `status_key` in `queue_definition` — they do **not** read `enrollment_operator_stage`. Changing stage mapping does not rewrite queue JSON; operators must keep status keys aligned with lane filters.

## Recommended storage (shipped)

- **Write:** `status_definitions.metadata.enrollment_operator_stage` on **org** rows (`org_id = current org`).
- **Read:** effective row (org overrides industry) → metadata override → else canonical catalog by `status_key`.
- **Explicit unassign:** `enrollment_operator_stage: "unassigned"` overrides canonical so a status can leave a stage without deleting the row.
- **Reset stage:** remove `enrollment_operator_stage` from org rows explicitly set to that stage; canonical defaults return.

## Copy-on-write

Industry defaults (`org_id` null) are not PATCHable. On first edit, API **inserts** an org `status_definitions` row copying label, sort_order, and metadata from the effective row, then applies the stage key.

## Runtime safety

- QueueService / filters: unchanged (still `status_key`).
- Action `condition_config`: unchanged.
- Settings hub / statuses page: unchanged; new API is additive.
- No migration required — metadata key is optional.

## Risks

| Risk | Mitigation |
|------|------------|
| Status in stage but not in queue filter | Work Queue card shows drift hint; operator adjusts mapping or Work Units |
| Duplicate labels across keys | UI shows label + disambiguation via list order |
| Partial org overrides | Merge rules unchanged; effective list is complete |

## Not in this slice

- Per-department status-stage overrides (org-wide only).
- Auto-sync queue_definition from stage mapping.
- BOS proposal apply path (placeholder only).
