---
owner: platform
status: proposed
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

---

## DX-EXPERIENCE-V2

**Priority:** P1 (executive clarity — presentation only)  
**Opened:** 2026-08-04  
**Source:** Director Experience V2 product mission (spec only)  
**Related:** [`DIRECTOR-EXPERIENCE-V2.md`](DIRECTOR-EXPERIENCE-V2.md), [`qa/director-experience-v2/README.md`](qa/director-experience-v2/README.md), [`qa/deliverable-review/CERTIFICATION-EXPERIENCE.md`](qa/deliverable-review/CERTIFICATION-EXPERIENCE.md)

### Intent

Ship the presentation-layer Director Experience V2 so a first-time Director can
answer what happened / success / confidence / why / evidence / decision / next
in ≤30 seconds, without redesigning missions, workers, confidence math,
certification, or evidence storage.

### Acceptance criteria

1. Spec phases DX-1…DX-8 implemented per `DIRECTOR-EXPERIENCE-V2.md` (or explicitly deferred with reason).
2. Thirty-second human protocol (§15.1) passes ≥2/3 cold Directors.
3. Dual large peer confidence % removed above the fold; primary confidence rule enforced.
4. “Review outcome” is not the sole primary when a recommendation exists.
5. Local app / Usage / Workers demoted from Executive Overview above-the-fold.
6. Diff scope review confirms no engine redesign (confidence / cert / evidence / missions / workers).

### Suggested first slice

DX-1 (Overview L1 shell) + DX-3 (decision cards).

### Out of scope for this item

- Redesigning Vacilando, Missions, or the execution engine
- New confidence or certification algorithms
- Screenshot backfill for historical missions

---

## MC-MANAGED-WORKER-DOCK

**Priority:** P1 (operator control-plane clarity)  
**Opened:** 2026-08-04  
**Source:** Mission Control Workers vs Legacy Board gap (Director Experience DX-1 session)  
**Related:** `apps/vacilando/public/mission-control.js` (`viewWorkers`), `apps/vacilando/public/app.js` (Legacy Worker Dock), `presentation/operator-views.mjs` (`workersHomeVm`), toolkit `alloy-worker-*`

### Problem

Mission Control → **Workers** shows only Vacilando **mission-assignment** workers
(Director telemetry). The Legacy Board exposes the actual **managed toolkit slots**
and operational controls (Pause / Resume / Diagnose / App / End). Operators told
that all six slots are occupied cannot see or control those slots on the primary
Workers surface and believe workers or controls are missing.

### Intent

Mission Control must clearly distinguish:

1. **Mission workers / Director telemetry** (assignment health, deliverable focus)
2. **Managed toolkit slots 1–6** (sprint assignment, provider, port, server)

Expose or deep-link the appropriate **Pause, Resume, Diagnose, App (start/open/stop),
and Finish** controls without changing mission-worker semantics.

### Acceptance criteria

1. Mission Control Workers (or an adjacent Managed Slots section) lists all toolkit
   slots 1–6 with occupancy, sprint, provider, port, and health — including free slots.
2. Operator can Pause / Resume / Diagnose / open or start App / Finish (or equivalent
   safe toolkit commands) without opening Legacy Board for routine slot ops.
3. Mission-assignment worker cards remain intact; no merge of the two vocabularies
   into one ambiguous list.
4. Empty / free / unhealthy states are honest (no invented workers).
5. Focused UI or API projection tests cover slot listing + action wiring; browser
   evidence for occupied + free slots.

### Out of scope for this item

- DX-1…DX-8 Executive Overview work
- Changing mission posture, certification, or confidence
- Deleting Legacy Board (may remain as advanced/legacy escape hatch)
