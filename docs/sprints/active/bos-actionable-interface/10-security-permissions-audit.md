---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 10 — Security, Permissions, Audit, and Retention

## Org scoping

All execute and Processing routes remain org-scoped via existing admin context. Session storage is browser-local; never trust it as authorization.

## Role permissions

| Gate | When |
|---|---|
| Discovery (Actions / future slash) | Existing action resolution + placement |
| BOS session start | Client check + soft fail |
| Execute | `requireAdminOrOps` on `/api/admin/actions/execute` |
| Processing plan/approve/execute | Existing privileged operator routes |
| AI parse assist (if server LLM later) | Org `ai_policy` + size limits |

V1 local parse may run client-side via existing `parseCreateLeadIntakeText` (deterministic). If server LLM enrichment is added later, gate with `ai_policy` and never let LLM choose `actionKey`.

## Placement visibility

Create Lead appears only where canonical/registry placements allow. BOS cannot surface an action removed from placement config.

## Prompt / tool injection protections

1. Operator text is **data**, never an instruction to select arbitrary tools.
2. Session `actionKey` is fixed at invocation from trusted UI/catalog — not parsed from user prose in V1.
3. Reject execute if payload `action_key` ≠ session invocation key.
4. No client path to service-role Supabase.

## Sanitization / size

- Source text max length (recommend 32KB).
- Strip control characters; preserve newlines.
- Do not persist entire thread to server in V1.

## Sensitive data

- Draft may contain PII (phone/email/DOB) — treat as operational PII under org policies.
- Avoid logging full source texts in client diagnostics.
- Audit stores field provenance + final confirmed values, not raw chat dumps.

## Transcript retention

| Store | Retention |
|---|---|
| sessionStorage draft/transcript | Tab lifetime / explicit discard |
| Processing case facts | Existing Processing retention |
| Action audit | Existing audit tables |

No new retention table in V1.

## Audit of parsed vs confirmed

At execute, include structured `input_provenance` in payload metadata (field → state). Processing facts already carry evidence tags (`create_lead:intake`). Extend carefully without breaking idempotency hashing (hash must remain stable — exclude volatile UI-only fields from idempotency key; keep today’s key inputs).

## Identity override reasons

Reuse Processing resolution reason capture — do not invent a BOS-only override path.

## Replay / idempotency

- Double confirm → same intake idempotency key → same case.
- Commit retries → execution idempotency key.

## No bypasses

- BOS cannot skip Processing approval.
- BOS cannot write identity rows.
- BOS cannot call privileged RPCs outside registered routes.
