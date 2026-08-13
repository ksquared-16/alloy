# Tour communications — configuration ownership (Slot 5)

Templates own **content**. Workflow / `TourCommsConfig` own **delivery policy**.

Internal Tour notifications use **configured internal recipients**, not a Tour Host ownership model.

## Ownership map

| Concern | Owner |
| --- | --- |
| Parent email/SMS copy | Communications Studio templates (system-provisioned, org-editable) |
| Reminder timing (24h / 48h / …) | `org_settings.metadata.tour_comms.reminder_offsets[]` |
| Reminder channels | `reminder_offsets[].channels` ∩ `tour_comms.channels` |
| Ask parent to confirm attendance | `tour_comms.ask_parent_confirm_attendance` |
| Parent recipient policy | `tour_comms.parent_recipient_policy` (seed: `primary_contact`) |
| Internal calendar / staff notification recipients | `tour_comms.internal_recipients` (`enabled` + `user_ids[]`) |
| Quiet hours | `tour_comms.quiet_hours` |
| ICS attach to parent confirmation | `tour_comms.ics` |
| Scheduling correctness | Platform Tour reminder / orchestrator runtime |

## Internal recipients (not Tour Host)

```json
{
  "tour_comms": {
    "internal_recipients": {
      "enabled": true,
      "user_ids": ["<auth-user-id>", "<auth-user-id-2>"]
    }
  }
}
```

- Supports **0 / 1 / many** canonical auth user ids.
- On confirm / reschedule / cancel, orchestrator sends internal ICS email artifacts to those users.
- Parent-facing templates are not blindly CC'd.
- No `host_user_id` assignment UI; no host-based calendar ownership.

### Operator UI (Communications → Studio → Templates)

For system Tour templates (`system_key` prefix `tour_*`), **Delivery & automation** appears under Template details (dense card; message content stays primary).

| Template | Controls surfaced |
| --- | --- |
| Tour Reminder | Reminder enabled, hours-before timing (`reminder_offsets[0]`), Email/SMS channels, parent recipient policy (Primary contact), ask-parent-confirm toggle, shared internal recipients |
| Tour Confirmation / Reschedule / Cancel | Shared internal recipients only (same org list) |
| Tour Invitation / No-show follow-up | Inheritance note — edit Reminder or lifecycle templates for policy |

- Internal recipients and reminder timing persist to **`org_settings.metadata.tour_comms`** (read-modify-write on save). Template rows hold **content only**.
- UI copy: *Inherited from Tour communications policy* — one org-wide list, not per-template overrides in V1.
- Staff picker uses canonical org users (`/api/admin/users`); no UUID paste.

## Parent confirmation

When `ask_parent_confirm_attendance` is true, reminders may include Confirm / Reschedule / Cancel.
No response does **not** cancel or unconfirm the booking.

## Deferred

- Tour Host assignment model
- External calendar free/busy / OAuth availability
