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
- Parent-facing templates are not blindly CC’d.
- No `host_user_id` assignment UI; no host-based calendar ownership.

## Parent confirmation

When `ask_parent_confirm_attendance` is true, reminders may include Confirm / Reschedule / Cancel.
No response does **not** cancel or unconfirm the booking.

## Deferred

- Tour Host assignment model
- External calendar free/busy / OAuth availability
