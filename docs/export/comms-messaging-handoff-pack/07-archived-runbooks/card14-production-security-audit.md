# Card 14 — Production hardening & security audit (Communications)

**Status:** Tracking document — not a sign-off. Update as controls land.

---

## Must-fix before production (ordered)

| # | Topic | Severity | Notes |
|---|-------|----------|-------|
| 1 | Twilio inbound **signature validation** (`X-Twilio-Signature`) on `/sms/inbound` and `/sms/inbound/{binding_id}` using auth secret from `secret_ref` / env lookup | Critical | Stubbed Cards 8+; spoofed POSTs risk abuse without verification. |
| 2 | **Rate limits / send caps** per org/channel | High | Composer + worker lack global guards. |
| 3 | **Opt-out / consent / TCPA** alignment workflow for SMS/email | High | Legal/process + product ownership. |
| 4 | **secret_ref rotation** playbook (env var roll on backend; never plaintext keys in DB) | Medium | Operational contract. |

---

## Safe-for-staging checklist

- Migration `20260430254100_communications_v1_foundation.sql` applied; RLS checks per `card10-migration-rls-verification.md`.
- **`COMMUNICATION_DUAL_WRITE`** default off unless validating mirror skips (`grep` **`[COMM_DUAL_WRITE]`** in logs).
- Composer + **`POST /api/admin/communications/send`** behind **admin/ops**; `communications.send` hook stub acknowledged.
- **`INTERNAL_MESSAGES_PROCESS_URL`** + **`INTERNAL_CRON_TOKEN`** set for dequeue after enqueue where applicable.
- Resend/Twilio keys only in secrets managers — **`seed_bindings_placeholder.sql`** placeholders only.

---

## Deferred post–V1

| Item | Rationale |
|------|-----------|
| Resend bounce / complaint webhooks + suppression | Needs secure inbound webhook surface |
| Vault / KMS for `secret_ref` targets | Env-only resolves today |
| Per-user bindings completion | Python resolver stub |
| `send_message` workflow mirror parity | Canonical coverage gap |
| Sunset **`public.messages` / messages_outbox** | Separate migration program |

---

## Brief risk ratings

- Twilio webhook verification: **Critical gap** until shipped.
- Resend webhook path: **Low** intentionally absent.
- Credential leakage via logs/errors: **Medium** — scrub client-facing errors.
- Org/location sender resolution: **Medium** — worker uses metadata location + bindings.
