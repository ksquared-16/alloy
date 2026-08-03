# Conversation Runtime Architecture

**Canonical runtime reference. Describes what exists on 2026-07-31, not what is planned.**

Where something is aspirational it is marked **[PLANNED]**. Where two
implementations exist, both are named — this document does not pretend at
convergence that has not happened.

---

## 0. The two-runtime fact

The Conversation Runtime spans two processes that cannot import each other.

```
   AUTHORING (TypeScript / Next.js)          DISPATCH (Python / FastAPI)
   ─────────────────────────────────         ──────────────────────────────
   composes, classifies, renders,            claims work, revalidates,
   evaluates eligibility, persists           calls providers, records receipts
              │                                          ▲
              └──────────  communication_messages  ──────┘
                           (the row IS the handoff)
                                     │
                        contracts/communications/*.json
                     (shared vocabulary, parity-tested both sides)
```

**The seam is the database row plus versioned JSON contracts.** There is no RPC
between the runtimes. A message is handed over by being written with
`status='queued'`; the Python side claims it.

This is why the classification vocabulary lives in `contracts/communications/`
rather than in either codebase: it is the one thing both sides must agree on, and
neither side can be the source of truth for the other.

## 1. Entity model

### Conversation / Thread

**Today `communication_threads` is the only conversation entity.** There is no
separate "conversation" record. The words are used interchangeably in the code,
and the UI calls the same object a "conversation" in the Command Center and a
"thread" in the drawer.

| Concern | Owner |
| --- | --- |
| Thread persistence | `communication_threads` |
| Loading / listing | `lib/communications/inboxThreadsService.ts` |
| Identity of a thread's counterparty | `lib/communications/inboxThreadIdentity.ts` |
| Person context attached to a thread | `lib/communications/inboxThreadPersonContext.ts` |
| Display labels | `lib/communications/inboxThreadDisplayLabels.ts` |
| Triage / assignment | `app/api/admin/communications/conversations/[id]/{triage,assign}` |

**[PLANNED]** A distinct Conversation entity above Thread — grouping threads
across channels for one counterparty — does not exist. WS1/WS2 propose it.

### Message

`communication_messages` is the spine. Every outbound message is a row here
before a provider sees it, and the row is what every gate operates on.

Columns that matter to this architecture:

| Column | Meaning | Added by |
| --- | --- | --- |
| `audience` | `external` \| `internal` | Phase 0 |
| `category` | `transactional` \| `operational` \| `marketing` \| `emergency` | Phase 0 |
| `purpose` | free text, tenant-extensible, **compliance-inert** | Phase 0 |
| `eligibility_snapshot` | immutable authoring facts | Phase 0 |
| `eligibility_decision` | the evaluator's verdict | Phase 0 |
| `rendered_snapshot` | what was actually rendered | Phase 0 |
| `deferred_until` | dispatch deferral | Phase 0 |
| `status` | `pending` \| `queued` \| `sent` \| `skipped` \| `failed` | pre-existing |

`audience` and `category` carry CHECK constraints. `purpose` deliberately does
not — it is domain vocabulary, and constraining it would make tenant extension a
migration.

### Recipient kinds — DECIDED 2026-07-31, **[PLANNED]** implementation in Phase 1

The runtime recognises exactly **three** recipient kinds. There is no fourth and
no untyped fallback.

| Kind | Resolves to | Audience | Consent semantics |
| --- | --- | --- | --- |
| **Person** | canonical Person → channel identity | external | full — preferences + eligibility |
| **Internal** | Alloy User/Person identity | `internal` | external consent N/A; permissions, org scope, audit and identity validity still apply |
| **External operational** | bounded recipient object (name + address/phone) | external-operational | `operational` \| `transactional` only; **marketing prohibited**; purpose is **server-owned** |

Canonical external path:

```
Person → channel identity → communication preferences → eligibility
       → conversation/thread → message
```

**A free-text address or phone number alone is never sufficient for family or
customer communication.** External-operational exists for vendors, contractors,
inspectors, attorneys and other-org contacts — it requires an explicit recipient
type, a recorded organization and authorizing actor, and an audited reason.

**Invariant: no silent fallback.** A failed Person resolution must fail the send.
It may never downgrade to external-operational. That downgrade would recreate the
exact defect Phase 0 closed — a recipient no consent check can evaluate. An
external-operational recipient may later be *promoted* to a canonical Person, but
never auto-created to rescue a failed send.

### Participants

Three separate tables, and they are **not** the same concept:

| Table | Concept |
| --- | --- |
| `communication_message_recipients` | who a specific message went to (`to`/`cc`/`bcc`) |
| `communication_identities` | an addressable endpoint (an email, a phone) and who owns it |
| `communication_message_reads` | who has read what |

Identity resolution — mapping an inbound address to a person — is
`lib/communications/identity/`, notably `inboundResolveIdentity.ts`,
`normalizeAddress.ts` and `resolveSenderIdentity.ts`. Grants and location
bindings (`communication_identity_grants`,
`communication_identity_location_bindings`) scope which identities an operator
may send *as*.

## 2. The four classification axes

Decided in D3. These are **authoring facts**: fixed when the message is written,
never recomputed.

```
audience   external | internal          ← who it is for
channel    email | sms | in_app         ← how it travels
category   transactional | operational  ← compliance meaning
           | marketing | emergency
purpose    <domain string>              ← why, in tenant vocabulary
```

**Only `category` × `channel` determines compliance behaviour.** `purpose` exists
so tenants can describe intent without touching the compliance model, and it is
explicitly inert — a rule that keyed off `purpose` would let a tenant configure
their way out of consent law.

The mapping from `(category, channel)` to a preference key is a **contract table**
in `contracts/communications/dispatch-decisions.json`, not code, because both
runtimes must resolve it identically. Both sides drive their real functions
through that table in tests.

## 3. Eligibility — two layers, deliberately

This is the part most likely to be misunderstood, so it is stated plainly.

```
AUTHORING TIME                          DISPATCH TIME
──────────────                          ─────────────
classification            snapshot      recipient's CURRENT consent
authorization       ───►  frozen  ───►  current suppression state
sender identity           onto the      time-of-day / quiet hours
consent AT THIS MOMENT    row           channel health

evaluateEligibility()                   revalidate_for_dispatch()
lib/communications/eligibility/         backend/app/services/
                                        dispatch_eligibility.py
```

**Why both.** The snapshot answers "was this message allowed to be written?" —
an audit question whose answer must never change retroactively. Revalidation
answers "is it allowed to leave *now*?" — a question whose answer legitimately
changes between enqueue and dispatch, because a person can opt out in between.

A single layer cannot do both. Snapshot-only would send to someone who opted out
after enqueue. Live-only would lose the record of what was authorized and why.

**Ownership:**

| Piece | File | Property |
| --- | --- | --- |
| Types + snapshot shape | `eligibility/types.ts` | includes `snapshotVersion` |
| The evaluator | `eligibility/evaluateEligibility.ts` | **pure**, versioned (`ELIGIBILITY_POLICY_VERSION`) |
| All I/O | `eligibility/loadEligibilityContext.ts` | the only file that reads |
| Live revalidation | `backend/.../dispatch_eligibility.py` | six checks |

The evaluator is pure and separately versioned so a policy change is a diffable,
testable, replayable artifact rather than a behavioural drift.

## 4. Rendering and snapshot

**`renderOutboundMessage` is the canonical renderer** and is server-authoritative:
the client cannot supply rendered output.

Two properties worth knowing:

- `previewOutboundMessage` is an **alias of the same function**, not a parallel
  implementation. Parity is identity, not agreement.
- It owns its own token substitution (`substituteTokens`) rather than delegating
  to the older engine. This was originally a bug fix, but it also removed
  arbitrary object traversal from the render path — a token can no longer walk
  into an unintended field.

`rendered_snapshot` stores what was actually produced, so a delivered message can
be reconstructed exactly, independent of later template edits.

**Known divergence — do not assume convergence.** The template *preview*
endpoint (`/api/admin/communications/templates/[id]/preview`) uses
`buildTemplatePreview` → `templateTokens.ts` → `renderCommunicationTemplate`,
which is a **different engine**. A template can preview differently from how it
sends. See the Debt Register, D-1.

## 5. Dispatch

```
enqueueCanonicalOutboundMessage        ← THE choke point (TS)
   ├─ render (canonical)
   ├─ evaluate eligibility
   ├─ freeze snapshot + decision
   └─ INSERT communication_messages (status='queued')
                    │
                    ▼
   process_communication_messages       ← claims queued rows (Python)
   backend/app/services/communication_message_sender.py
   ├─ revalidate_for_dispatch()         ← live checks
   ├─ provider adapter
   └─ receipt → communication_delivery_events
```

**`enqueueCanonicalOutboundMessage` covers 10 of 14 send paths.** Direct callers:

- `app/api/admin/opportunities/[id]/enrollment-packet-launch/route.ts`
- `lib/tours/comms/tourCommsOrchestrator.ts`
- `lib/communications/mirrorQueuedMessage.ts`
- `lib/communications/executeCommunicationsSend.ts` (which routes into it)

**`executeCommunicationsSend` is a wrapper, not the floor.** Its own gate is
inert for four independent reasons; the most direct is that
`/api/admin/communications/send` accepts a free-text `to` with no
`recipient_person_id`, so there is no person whose consent could be checked.
Treat it as a compatibility surface.

**Scheduled sends** are a second queue: `communication_scheduled_sends`, driven by
`communicationScheduledSendsService.ts`. It carries the same
`audience`/`category`/`purpose` columns. **[PLANNED]** It has no lease, so
concurrent processing can double-send — a Phase 2 concern, recorded in the Debt
Register.

## 6. Provider boundary

```
lib/communications/v2/providers/
   registry.ts          ← selects an adapter
   resendEmailAdapter.ts
   twilioSmsAdapter.ts
   deferredAdapters.ts
   types.ts
```

Provider accounts and their bindings to orgs/locations live in
`communication_provider_accounts` and `communication_provider_bindings`, cached by
`communicationsBindingsCache.ts`.

**Inbound** is a separate path: Twilio webhooks are signature-verified
(`twilioWebhookSignature.ts`, `twilio_inbound_signature.py`) and normalized by
`inboundNormalization.ts` / `communication_inbound.py`. Keyword handling
(STOP/START/HELP) is `sms_keywords.py` + `inbound_keyword_handler.py`, driven by
`contracts/communications/sms-keywords.json`.

Note on that contract: `"yes"` was deliberately **removed** from the START
vocabulary. "Yes" is a common reply to an unrelated question and treating it as
consent restoration would manufacture consent.

**Outside the platform:** `backend/app/routes/dispatch.py` sends SMS through
`ghl_client.send_conversation_sms` and **writes no message row at all**. It is
therefore invisible to every row-level gate described above. It is contained, not
converged — see the decommissioning recommendation.

## 7. Timeline, tracking, activity, Current Work, BOS

These are **read models over the runtime**, not part of the send path. Documented
here because they are frequently mistaken for it.

| Surface | Owner | Relationship to the runtime |
| --- | --- | --- |
| **Timeline** | `familyWorkspace/timelinePresentation.ts` | presentation over messages + threads |
| **Tracking** | `communication_delivery_events`, `deliveryStateAdapter.ts`, `providerDeliveryPersistence.ts` | receipts written by dispatch |
| **Activity** | platform activity stream (outside `lib/communications`) | the Platform Transaction Contract writes activity; communications is one producer |
| **Current Work** | Command Center queue projection — `commandCenterQueueProjection.ts`, `commandCenterViewModel.ts` | derived view; does not own state |
| **BOS** | `bosIntelligence.ts`, `bosRailCards.ts`, `identity/bosDiscoverySignals.ts` | advisory only — **BOS does not send** |
| **Inbox** | `inboxThreadsService.ts`, folder/thread caches | read model over threads |
| **Announcements** | `announcementService.ts`, `announcementFanout.ts`, `audienceResolver.ts` | fan-out producer into the send path |

**Boundary rule that matters:** BOS and Current Work are advisory. Neither may
send, and neither may be the authority for whether a message is allowed. If a
future change gives an intelligence surface send authority, the eligibility model
above is bypassed.

## 8. Documents and attachments

Not strictly conversation, but Phase 0 changed it and messages reference it.

- **`assertDocumentAccess`** is the single authorization decision:
  `allowed` | `blocked` | `not_found`. It is **row-driven** — the `documents` row
  is authority and the storage path must match it.
- Signed URLs are capped at **15 minutes** (`signedUrlExpirySeconds`).
- **Authorization precedes minting**, not merely disclosure. This is enforced by
  `tests/documents/signerConvergence.test.ts`, because a route once satisfied the
  weaker property while violating the stronger one.
- Profile photos resolve **per request, per actor** (`resolveProfilePhotosForActor`).
  Signed URLs are never persisted into `persons.metadata`.

**Trust rule, stated because it is subtle:** a resolver-produced signed URL is
trustworthy; the *same shape* read out of storage or metadata is not. Trust is by
**provenance**, not by shape. That is why resolved URLs travel on a distinct key
(`RESOLVED_PHOTO_URL_KEY`) rather than being shape-matched.

## 9. Invariants — do not violate without a decision

1. Every outbound message is a `communication_messages` row **before** a provider
   sees it. A send path that skips the row is invisible to every gate.
2. Classification is decided at authoring and never recomputed.
3. `purpose` is compliance-inert. No rule may key off it.
4. The eligibility evaluator stays **pure**; all I/O lives in the loader.
5. Shared vocabulary lives in `contracts/communications/`, parity-tested on both
   sides. Neither runtime may hard-code the other's vocabulary.
6. The document row is authority; the storage path is not.
7. Authorization precedes minting of any credential.
8. BOS and Current Work never send.
9. A recipient is one of exactly three typed kinds. A failed Person resolution
   fails the send — it never silently downgrades to a free-text or
   external-operational recipient.
