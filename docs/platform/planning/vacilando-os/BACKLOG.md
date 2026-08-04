---
owner: platform
status: active
last_reviewed: 2026-08-04
---

# Vacilando backlog

Narrow, durable follow-ups for Vacilando expansion. Do not use this file for
product design essays — one item per concern, with acceptance criteria.

---

## CP-AUTH-NON-LOOPBACK

**Priority:** P1 (before any shared-host / tunnel / remote exposure)  
**Opened:** 2026-08-04  
**Source:** Director feedback-loop closeout (`fbe918247`)  
**Related:** `qa/deliverable-review/FEEDBACK-LOOP-CERTIFICATION.md`, `vacilando-api-auth.mjs`, `vacilando-server.mjs`

### Intent

- **Local loopback-only** control-plane mode (`127.0.0.1`) **may remain unauthenticated**.
- **Any non-loopback bind**, tunnel, shared host, or remote exposure **must fail closed**
  unless API authentication is configured.

### Acceptance criteria

1. Bind to loopback without `VACILANDO_API_TOKEN` / auth required → allowed (current local UX).
2. Attempt to listen on a non-loopback address (or documented tunnel/shared-host mode)
   without configured API auth → **refuse to start** (or refuse to accept connections)
   with a clear error.
3. Non-loopback with auth configured → Bearer (or equivalent) required on protected
   deliverable-review / director-message routes; unauthorized → 401.
4. Documented in control-plane startup / health docs; covered by a focused test.

### Out of scope for this item

- Multi-tenant org auth for Vacilando
- Replacing loopback with a hosted control plane
- Further Director feedback-loop product polish
