# Current Program / Schedule ownership (Phase 5)

## Finding

Compact queue fields labeled **Program** / **Schedule** (`inquiry_child.program`, `inquiry_child.schedule_type`, and Program category aliases) resolve from:

`QueueRowContext.placement_context.{program_label,schedule_label,room_label}`

which is built from **inquiry-child desired placement** (`desired_program_label` / schedule keys), with related-subject summary fallback.

They are **not** operational enrolled Current Program / Current Room / Current Schedule truth.

## Target vocabulary (not fully wired this sprint)

| Operator concept | Intended owner | Status |
|------------------|----------------|--------|
| Requested Program / Schedule / Start | Inquiry / placement preference | **What today’s Program/Schedule keys effectively are** |
| Current Program / Room / Schedule / Start | Enrollment / assignment operational truth | **Not yet separate compact providers** |
| Next Program / Room / Schedule + Effective Date | Future transition | Not started |

## Fix applied this sprint

- Documented ownership in punch list + this note
- `child.room` restored as compact-effective from `placement_context.room_label` (same inquiry-placement source — label as Room until Current Room exists)
- No Enrollment hardcoding; no fake “Current*” rename without operational owners
