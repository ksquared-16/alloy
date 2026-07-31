# Legacy GHL dispatch — decommissioning recommendation

**Status:** recommendation only. Nothing here is authorized or executed.
**Raised by:** Phase 0 commit 7 (S-1 containment).
**Decision owner:** Kelly.

Commit 7 contained these routes. It did not fix them, adopt them, or plan for
them. This document exists because containment is a holding action and someone
has to decide when it ends.

---

## 1. What this is

Two FastAPI routes in `backend/app/routes/dispatch.py`:

| Route | Purpose |
| --- | --- |
| `POST /dispatch` | Offer a cleaning job to a pool of contractors by SMS |
| `POST /contractor-reply` | Accept an offer by replying with a 5-digit code |

They belong to a **cleaning-services vertical** whose state machine lives in
GoHighLevel, not in Alloy. Alloy holds the offer codes and the job/contractor
lookup; GHL holds the pipeline, the opportunity stages, and the messaging
channel.

This is not part of the Conversation Platform. It predates it, uses a different
provider, a different identity model, and a different template mechanism.

## 2. Why it was contained rather than migrated

Per the standing instruction: *contain it, do not rebuild it into the canonical
Conversation Platform.*

Migrating it would have meant adopting, into the Conversation Runtime:

- a contact identity namespace owned by GHL (`contact_id` is a GHL id, not a
  `persons.id`)
- a job/offer state machine that Alloy does not own and cannot authoritatively
  read
- a provider path (`ghl_client.send_conversation_sms`) with no delivery
  telemetry, no preference checking, and no classification
- an SMS-code authentication scheme the platform does not otherwise use

That is a vertical, not a capability. Adopting it would have imported four
foreign models into a runtime we are in the middle of making coherent.

## 3. Evidence that it is dormant

Recorded so the decision is made on facts, not impressions.

| Signal | Observation |
| --- | --- |
| Callers in-repo | No Next.js route, job, or service calls either endpoint |
| Config dependency | Requires `JOB_STORE` / `OFFER_STORE` in-process dicts — **process-local, lost on restart** |
| Custom fields | Depends on `JOBS_*` / `OPP_*` GHL custom-field ids that are environment-specific |
| Platform overlap | Zero. No `communications` row is ever written by these routes |
| Tenant relevance | The certified tenant (Firefly) is childcare, not cleaning |

The process-local `OFFER_STORE` is the strongest signal: an offer does not
survive a backend restart, so this cannot be carrying meaningful production
traffic in its current form.

**Not established:** whether the deployed backend still has these routes exposed
publicly, and whether GHL still has workflows pointed at them. That is an
operational check, not a code check — see §5.

## 4. Recommendation

**Decommission.** In this order:

1. **Confirm no live GHL workflow targets either URL.** Check the GHL workflow
   list for HTTP steps pointing at the backend host. This is the only step that
   requires a system Alloy does not control.
2. **Add deprecation logging** — one audit event per request, retained 30 days.
   If nothing arrives, that is the evidence for step 3.
3. **Return 410 Gone** behind a config flag, leaving the code in place. This is
   reversible in one environment-variable change.
4. **Delete** `backend/app/routes/dispatch.py`, its guard module, its tests, and
   the `JOB_STORE`/`OFFER_STORE`/`JOBS_*`/`OPP_*` settings — once step 3 has been
   quiet for a full billing cycle.

Steps 2–4 are small. Step 1 is the real gate and it is not an engineering task.

## 5. If it is instead revived

Do not revive it as-is. The containment layer is deliberately minimal and has
three properties that are adequate for a dormant integration and **inadequate
for a live one**:

| Containment property | Why it is insufficient if revived |
| --- | --- |
| Lockout / rate-limit / idempotency state is **process-local** (`dict`) | Multi-instance deployment defeats all three: a second worker has its own counters, so lockout is bypassable and a replay can land twice |
| The 5-digit code is still the only contractor credential | ~90k keyspace. Adequate only because a lockout now caps guessing; not adequate as a standing authentication scheme |
| Access details are **omitted**, not relocated | Contractors currently have no authenticated surface to read them on. That is a product gap, and the message says so rather than pretending otherwise |

A revival is therefore a **Conversation Platform onboarding**, not a patch:
durable guard state, a real contractor identity, and an authenticated surface
for job details. Estimate that as a phase, not a commit.

## 6. What commit 7 leaves behind

If the decommissioning is approved, this is what gets deleted:

- `backend/app/services/legacy_dispatch_guard.py` (228 lines)
- `backend/tests/test_legacy_dispatch_containment.py` (31 cases)
- the guard wiring in `backend/app/routes/dispatch.py`

That deletion is the intended end state. The guard module was written to be
disposable, and it is listed in the Code Retirement Ledger on that basis.
