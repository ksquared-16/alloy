# Commands P9 — executeAdminAction compatibility drain

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-27

---

## Outcome

P9 establishes a **measurable fallback ledger** and **in-process telemetry** for
`execute_admin_action_fallback` without inventing fake executors or deleting live
compatibility branches without traffic evidence.

```text
Migrated (facade) → must not hit route fallback
Intentional compatibility → retain until zero legitimate traffic
Placeholder / unsupported / retire → honest dispositions, no fake execution
```

---

## Delivered

| Item | Location |
|------|----------|
| Disposition ledger | `executeAdminActionFallbackLedger.ts` |
| Fallback counter | `executeAdminActionFallbackTelemetry.ts` |
| Route wire | `recordExecuteAdminActionFallback` before fallback execute |
| Compat log enrichment | `fallback_disposition` on diagnostics |
| Post-delegation no-fallback | already enforced (verified) |

---

## Classification summary

| Disposition | Count (ledger) | Examples |
|-------------|----------------|----------|
| migrated | 22 | close_lead, relationship keys, tour terminals, delete_lead |
| direct_domain_compatibility | 17 | mark_lost, schedule_tour, add_family_member, send_form |
| navigation_workflow | 2 | open_record, ask_bos |
| configuration_maintenance | 1 | configuration.maintenance |
| placeholder | 2 | reopen_lead, reopen_tour |
| unsupported | 6 | archive_lead, send_message, withdraw_child |
| retire | 1 | contact_attempted |

Unlisted DB keys default to `direct_domain_compatibility` until classified.

---

## Intentionally retained (not deleted)

- `mark_lost` (force-lost ≠ close_lead)
- Relationship hubs (`add_family_member`, …)
- `schedule_tour` / `record_tour_outcome`
- Legacy status forms (`update_enrollment_status`, `mark_won`, …)
- Partial comms/docs (`quick_message`, `send_form`, …)
- Nav (`open_record`, `ask_bos`)
- Entire `switch (action_type)` shell until zero-traffic evidence

`create_lead` / `confirm_tour` remain **migrated on the route** but may still call
`executeAdminAction` from RegisteredAction wrappers (documented wrapper debt).

---

## Not done (honest)

- No production Prometheus counter (in-process counter for drain measurement)
- No zero-traffic retirement of compatibility branches (requires production evidence — P10)
- No broad API rename (`/api/admin/actions/*` retained per D3)
- No placeholder→fake-executor conversions

---

## Tests

```text
executeAdminActionFallbackDrain.test.ts + prior Commands execute route suites as needed
```

---

## Checkpoint

```text
Slice: P9 executeAdminAction drain (ledger + telemetry)
Commit: (pending)
Tests: focused drain suite
Typecheck: (pending)
Behavior change: measurable fallback classification; no operator path deletion
Compatibility retained: intentional compatibility keys + action_type switch
Next slice: P10 certification and closeout
```
