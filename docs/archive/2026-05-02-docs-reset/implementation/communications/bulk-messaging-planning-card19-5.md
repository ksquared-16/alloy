# Card 19.5 — Bulk messaging planning (no implementation)

## Non-goal (current sprint)

- No bulk-send UI, no CSV upload in drawer, **no multi-record fan-out** from drawer **Send**.
- Drawer composer stays **single-entity**, person-checklist bounded to that record (Card 17).

## Future architecture (bullets)

- **Surface:** Global/campaign workspace, department/work-unit scoped action, or dedicated messaging hub — **not** hidden inside one opportunity/job drawer.
- **Audience:** Saved filters / RBAC-checked queries (counts + sample recipients + optional export for ops audit).
- **Dedupe:** By `person_id` primary; normalized email secondary guardrail.
- **Delivery model:** Prefer **one `communication_messages` row per recipient** (existing canon); optionally a **`communication_batch`** (or equivalent) header linking many rows — **proposal only**, no migration in this sprint.
- **Privacy:** Avoid BCC “mass list” leaks; transactional per-recipient or provider patterns that hide other recipients.

## Gaps before any bulk ship

- Consent/opt-out matrix, rate limits, cross-org safeguards, spam complaint handling (`Card 14` overlaps).
