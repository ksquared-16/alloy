# API contracts

**Status:** Canonical representative map (not full OpenAPI).

Admin, public, webhook, and worker boundaries for the platform.

---

## Admin API pattern

1. Auth + `getAdminContextCached` (org + portal eligibility)
2. CRM routes add `getAdminAccessContextCached` (permissions + dept/site scope)
3. Deny-by-default for restricted scope — empty lists or 404

---

## Representative surfaces

| Surface | Examples |
|---------|----------|
| Entity records | `GET /api/admin/entity/[type]/[id]` |
| Actions | `POST /api/admin/actions/execute` |
| Queues | `GET /api/admin/queues/...` |
| Business process builder | `/api/admin/lifecycle-builder/*` |
| Communications | `/api/admin/communications/*` |
| BOS assist | `/api/admin/ai/*` |
| Settings / RBAC | `/api/admin/settings/*`, `/api/admin/rbac/*` |
| Global search | `GET /api/admin/global-search` |

---

## Public & tokenized

| Surface | Examples |
|---------|----------|
| Booking | `/api/book-v2/*` |
| Form public links | `/api/public/forms/*` |
| Action links | `/api/action/[token]/consume` |

---

## Webhooks & workers

| Surface | Examples |
|---------|----------|
| Twilio / Resend | `/api/webhooks/*` |
| Message worker | Python `POST /internal/messages/process` |
| Scheduled sends | `/api/admin/communication-scheduled-sends/process-due` |

---

## Rules

- Service role server-only for privileged writes
- No browser direct mutation of `workflow_events`
- Org scoping on every tenant route

---

## Expanded reference

`../../system/api-contracts.md` — transitional detailed route table.

---

## When to update

New public/admin route families, auth pattern changes, or webhook additions.
