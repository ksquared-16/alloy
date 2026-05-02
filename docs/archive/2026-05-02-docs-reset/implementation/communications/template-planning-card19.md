# Card 19 — Template planning (no implementation)

**Status:** Documentation only for a future epic. **Card 17 (drawer composer)** is the prerequisite UX for single-record sends; templates are **out of scope** for the current sprint.

## Lifecycle sketch

1. **Create** — Org admin defines a template (name, channel, optional location scope); body with `{{variables}}`; version pinned or drafts.
2. **Preview** — Operator picks record context (opportunity/job/person); server resolves variable catalog → **human-readable preview** (mandatory).
3. **Edit** — Operator may edit the resolved draft **before** send (same plain-text/HTML layer as MVP composer).
4. **Send** — Same canonical enqueue as today (`communication_*` queued rows + worker); no parallel provider pipe.

Later: AI proposes initial draft → same **preview + edit** step before enqueue.

## Variable catalog (to define before build)

- Opportunity: status, dates, household/person labels (non-contact-first IDs already on record).
- Job: dates, amounts (where policy allows), location label.
- Person: greeting name, email (already recipient).

Document the **allowlist** per org role to reduce injection/abuse surface.

## Risks

- **PII in templates** — Logged bodies and previews; retention policy.
- **Injection** — Untrusted vars into HTML/email; escape rules per channel.
- **Versioning** — Sent messages must reference template version + resolved snapshot for audits.

## Non-goal

No migrations, APIs, or UI for templates in this sprint.
