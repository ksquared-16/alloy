# E3 enrollment launch — deferred enhancements

## E3.1 (shipped in product) vs E3.2 (next)

**E3.1** delivers a guided drawer flow (enrollee, packet, recipient, prefill preview, copy/open link) with server-validated `enrollment_selection`, publishability checks on all packet steps, and in-session “recent launches” visibility.

**E3.2** is the next increment: durable opportunity timeline rows, Communications-based email send, resend/reminders, and optional stage/status automation when packet completes.

---

Not implemented in this milestone:

- **Outbound comms**: email/SMS send from the launch UI, templates, scheduling, and resend flows.
- **Reminders & expiration UX**: automated nudges before link expiry; operator-facing renewal/regenerate flows.
- **Richer CRM targeting**: explicit “enrollee” `customer_member` selection on the opportunity when multiple children exist; deeper metadata-driven prefill beyond the default guardian/household map.
- **Work-unit queue actions**: first-class “packet requested” queue items distinct from today’s drawer-only launch.
- **AI-assisted outreach**: suggested copy and follow-up timing (see broader Alloy AI roadmap).
