# Card 20 — Communications sprint completion audit (Cards 16–20)

Audit date aligns with completion of Cards 16–20 implementation artifacts in-repo.

## Checklist

| Item | Status | Notes |
|------|--------|--------|
| Backend canonical email send (staging: binding + worker + Resend) | **Staging path** documented | See `resend-outbound-smoke-test.md`; production requires env + binding sign-off |
| Drawer composer enqueue + refresh | **Implemented** | `CommunicationsDrawerSection` + `POST /api/admin/communications/send`; threads refetch after send; messages refetch if thread panel would already load messages |
| Recipient selection person-first | **Implemented** | `drawer-recipients` + `drawerEmailRecipients.ts`; no contact anchor |
| No contact-first dependency in new paths | **Designed out** | Grep/remediation ongoing in reviews; canonical send uses `recipient_person_id` → `persons.email` |
| `COMMUNICATION_DUAL_WRITE` | **Default off** | Composer does not enable; no changes in these cards toggle org-wide dual-write |
| Provider bindings doctrine | **Unchanged** | `secret_ref` only; no new plaintext secrets in `config` |
| Performance / lazy loading | **Preserved** | `active` prop still gates mount/fetches where parent passes `false`; bindings/recipients fetch only when section active + email channel plausible; bounded thread/message limits unchanged; **no polling** |

## Capability readiness

| Capability | Production-ready? |
|------------|-------------------|
| Drawer email composer (enqueue only) | **Staging-first** until Card 14 hardening satisfied |
| Resend outbound | **Env + verified domain dependent** |
| SMS (Twilio) | Separate track; inbound signature validation etc. (`Card 14`) |
| Templates | **Planned only** (`template-planning-card19.md`) |
| Bulk messaging | **Planned only** (`bulk-messaging-planning-card19-5.md`) |

## Recommended next sprint (ordered)

1. Staging composer smoke (`Card 18`) with evidence attachments.
2. Close Card 14 must-fix items (Twilio inbound verify, rate limits posture).
3. Template epic after variable catalog + preview/draft UX design.
