---
title: Conversation Platform V1 — Twelve-Decision Approval Packet
status: awaiting Kelly's decisions
date: 2026-07-30
---

# Conversation Platform V1 — Approval Packet

**Numbering note.** Your direction renumbered the decisions and promoted structured message content to its own decision. This packet uses **your** numbering. Mapping from the discovery plan §7: your D1←my D1, **D2 is new**, D3←D2, D4←D4, D5←D3, D6←D5, D7←D6, D8←D7, D9←D8, D10←D9, D11←D10, D12←D11. My old D12 (hotfix go/no-go) is **resolved** by your authorization and is dropped.

**Doctrine-change column.** "Yes" means the decision alters a canonical platform ownership boundary and needs explicit doctrine sign-off, not just implementation approval.

---

# D1 — Conversation subject / link model

**Phase that depends on it:** Phase 1 (blocking). **Changes doctrine: YES** — it defines what a conversation *is attached to*, which is a platform ownership boundary.

## The problem

Today a thread's entire operational attachment is two columns on `communication_threads`:

```sql
primary_entity_type text NOT NULL,   -- 20260430254100:38  no CHECK
primary_entity_id   uuid NOT NULL,   -- :39                no FK
```

`communication_messages` has **no subject columns at all**. A message's subject is reachable only through `thread_id`.

## Why the polymorphic pair is insufficient — five verified reasons

1. **It is single-valued, and the requirement is not.** Your brief asks that every conversation attach to Organization, Business Process, Record, Operational Subject, Current Work, Timeline, Activity, and BOS. One `(type, id)` pair expresses exactly one of those. There is **no column, FK, or code path anywhere** linking a thread or message to a business process, process instance, participation, or work unit — verified by exhaustive grep across `web/lib/communications/`, `web/lib/adminV2/bos/communication/`, `web/app/api/admin/communications/`.
2. **It is unvalidated and has drifted.** Bare `text`, no CHECK, no FK. Live values include both `opportunities`/`opportunity`, `persons`/`person`, `customers`/`customer`, plus synthetic `communications_unknown`. Read code compensates with case/plural normalization in three separate predicates (`commandCenterConversationEnrichment.ts:44-54`).
3. **It is mutated by arrival order, not by meaning.** `_find_canonical_sms_thread()` reuses any thread with the same `recipient_key` **regardless of anchor** (`communication_inbound.py:184-225`), so the persisted anchor is whatever the *first* message happened to attach to. Later work on other subjects lands on that thread with a stale anchor. (This is D5.)
4. **The real subject is already being re-derived per request and thrown away.** `commandCenterConversationEnrichment.ts:311-413` walks customer→opportunity→person on every read and produces `opportunity_id`, `customer_id`, `scope_status` that are **persisted nowhere**. It even consults `metadata.customer_id`, which **no send or inbound path ever writes**. The platform is already computing the multi-link answer and discarding it.
5. **It cannot express role.** "This conversation is *about* the enrollment process, *with* this guardian, *concerning* this child, *arising from* this work item" is four different relationships. One pair cannot hold them, and conflating them is why reply-target resolution is narrower than drawer resolution today (`REPLY_ENTITY_TYPES` excludes `customers` while the drawer map includes it).

**This was already the intended design and was never built.** `docs/sprints/archive/06_2026/messaging_v2_architecture.md:75-90` proposes `communication_entity_links` with a `link_role`, *"rather than overloading `primary_entity_*` alone."* I am recommending that proposal, not inventing one.

## Recommendation

**Additive `communication_thread_links`, with `primary_entity_*` retained as a denormalized cache of the single `owner` link.**

### Durable ownership vs contextual links — the distinction you asked for

Your instruction not to assume every conversation is owned by a Business Process is correct and load-bearing. The model separates two things:

| | **Ownership** (`owner`) | **Context** (everything else) |
|---|---|---|
| Cardinality | **Exactly one per thread**, enforced by a partial unique index | Zero or many |
| Meaning | *Who this conversation durably belongs to* — the party relationship | *What operational work this conversation currently touches* |
| Lifetime | Effectively permanent; changes only by explicit re-parent | Transient; links accrue and go stale as work moves |
| Typical value | `person`, `customer` (household), or `organization` | `business_process`, `process_instance`, `work_unit`, `opportunity`, `job`, `participation`, `location` |
| Deletion | Thread is meaningless without it | Removing one loses context, not identity |

This preserves the correct instinct already in the code — *"the conversation is the relationship, not the originating business object"* (`communication_inbound.py:192`) — while making per-work attachment truthful. **A conversation is owned by a party and contextually linked to work.** A thread may have no business-process link at all and still be perfectly valid.

### Cardinality and ownership rules

- One thread → **exactly one** `link_role='owner'` row (partial unique index on `(thread_id) WHERE link_role='owner'`)
- One thread → **0..n** context links, unique on `(thread_id, subject_type, subject_id, link_role)`
- One subject → **0..n** threads (a family can have several conversations)
- `org_id NOT NULL` on every row; a trigger asserts `link.org_id = thread.org_id` **and** that the referenced subject belongs to the same org — mirroring the existing `enforce_communication_scheduled_sends_org_matches_entities()` pattern (`20260521103000:130-154`)
- **Canonical owner of the table: the Communications Runtime.** It is not a general relationship registry (see §"avoiding a parallel model" below).

### Supported link types (closed CHECK, extended only by migration)

`subject_type ∈ { organization, location, person, customer, opportunity, job, participation, business_process, process_instance, work_unit }`

`link_role ∈ { owner, subject, context, origin }`
- `owner` — the durable party (exactly one)
- `subject` — what the conversation is *about* right now (e.g. a specific child's enrollment)
- `context` — operational work it touches (process instance, work unit)
- `origin` — what caused it to exist (the work item or rule that triggered the first send); immutable once written

### Per-message subject

`communication_messages.subject_link_id uuid NULL REFERENCES communication_thread_links(id)`. Null means "inherits the thread's current `subject`". This is what makes D5 resolvable without splitting threads.

### How each consumer reads it

| Consumer | Today | After |
|---|---|---|
| **Inbox / drawer resolution** (`inboxEntityDrawerTarget.ts:18-34`) | maps 4 hardcoded anchor types | resolves the `owner` link, falling back to `subject`; `communications_unknown` becomes an *absent* owner rather than a synthetic one, which is what unblocks the operator resolution surface (U7) |
| **Activity / timeline** | `workflow_events.entity_type/entity_id` from the thread anchor | emits one event per **distinct** linked subject, so a message appears on the child's *and* the process's timeline without duplication of the message itself |
| **Current Work / Work Items** (`mapCommunicationThreadToWorkItemRow.ts:77-78`) | falls back through `conversation.opportunity_id → primary_entity_id`, defaulting `entity_type` to `"opportunities"` — a guess | reads the `context` link of type `work_unit`/`process_instance` directly; the guess disappears |
| **BOS** | receives `record_id`/`entity_type` from the launch intent | receives the resolved link set; `Ask BOS` context stops being a single id |
| **Command Center enrichment** | re-derives the ladder per request and discards it | reads links; the ladder collapses to a join. **This is the single biggest read-path simplification in the sprint.** |

### Migration from existing threads

Six threads live, so this is trivial *here* — but the migration must be written for a populated tenant:

1. Add table + indexes (additive, nullable)
2. Backfill one `owner` row per existing thread from `(primary_entity_type, primary_entity_id)`, **normalizing plural→singular** during the copy. `communications_unknown` anchors produce **no** owner row — deliberately, so unresolved senders surface as "needs owner" instead of silently owning a synthetic entity
3. Dual-read: resolution prefers links, falls back to `primary_entity_*`
4. Dual-write on all four anchor writers
5. Switch reads; keep `primary_entity_*` updated by trigger from the `owner` link (denormalized cache, so the existing 5-column thread identity constraint keeps working untouched)
6. Add the CHECK on `subject_type`
7. `primary_entity_*` is **not dropped in this sprint**

### How this avoids a parallel record/relationship model

Three constraints, and they are the reason I am comfortable recommending a new table:

1. **It stores no facts about the subjects.** No names, no status, no dates — only `(thread, subject_type, subject_id, role)`. Every attribute is still read from the owning domain table. It is an *edge list scoped to conversations*, not an entity store.
2. **It is not general-purpose.** `person_relationships`, `customer_persons`, and `person_child_relationships` remain the canonical person/household graph. A thread link never expresses a relationship *between two subjects* — only between a **thread** and a subject. There is no path by which it could become a second relationship model, because it has no subject-to-subject edge.
3. **It replaces derivation, it does not add a layer.** The enrichment ladder already computes this set on every read. We are persisting an answer the platform already computes, which *removes* a source of truth rather than adding one.

## Options and consequences

| Option | Consequence |
|---|---|
| (a) Keep the pair, add a CHECK | Cheapest. Does **not** satisfy the brief — multi-attachment remains impossible; enrichment ladder stays; Current Work keeps guessing. **Rejected.** |
| (b) Add nullable BP / process-instance / work-unit columns to the thread | Cheaper than (c). Fixed arity — every new subject type is a migration and a nullable column. No role semantics. Cannot express two process instances. Recreates the same wall in six months. |
| **(c) `communication_thread_links` (recommended)** | One new table, one trigger, one backfill. Expresses everything the brief asks. Removes the per-request ladder. Cost: a join on the hot Command Center read path — mitigated by an index on `(thread_id, link_role)` and the fact that the ladder it replaces is strictly more expensive. |

**Blocked if deferred:** Phase 1 in full, and therefore every later phase. Interactive actions (Phase 3) need a subject to bind a token to. Inbound routing (Phase 5) needs somewhere to record what a reply advanced.

---

# D2 — Structured message content

**Phase that depends on it:** Phase 1 (blocking for 3, 4). **Changes doctrine: NO** — it is an internal representation, not an ownership boundary.

## The problem

`communication_messages.body` is one `text` column. `body_format` exists and is **never written by any code path**. `executeCommunicationsSend` accepts a single pre-rendered `textRaw: string` and performs **zero interpolation** (`:56`, `:298`). There is no CTA object, no attachment list, no per-channel rendering. The only channel-aware rendering in the repo is dead code (`composerModel.ts:87-98`, whose own header says it is not wired to send).

Consequence: an interactive action can only ever be a URL glued into a string, and there is no record of what was actually delivered.

## Recommended canonical representation

**Three distinct layers. This is the core of the decision — what is authored, what is rendered, what is retained.**

### Layer 1 — AUTHORED (mutable until send; the operator's intent)

Lives on the draft and on `communication_messages` as `content jsonb`:

```jsonc
{
  "version": 1,
  "blocks": [
    { "type": "text",   "text": "Hi {{contact.first_name}}," },
    { "type": "richtext", "html": "<p>…</p>", "text": "…" },      // both forms always carried
    { "type": "action", "action_key": "confirm_tour",
      "label": "Confirm", "payload": { "booking_id": "…" } },
    { "type": "action_group", "prompt": "Available tour times",
      "options": [ { "label": "Mon 9:00", "payload": {...} } ], "max_visible": 3 },
    { "type": "attachment", "document_id": "…", "disposition": "attachment" }
  ],
  "template": { "id": "…", "version": 3 },   // null for inline bodies
  "token_context_ref": "…"                    // how variables were resolved
}
```

- **Plain text** — `blocks[].type="text"`, the only required form
- **Rich text** — `richtext` carries `html` **and** a text fallback; never html-only
- **Template reference** — `{id, version}` pinned at author time, so a later template edit cannot retroactively change what a message claims to be
- **Attachments** — `document_id` references, never bytes
- **Interactive actions** — `action_key` + `payload`, resolved to a token only at render time (D4)

**Inline bodies remain fully supported:** `template` is null and `blocks` is a single `text` block. No operator is forced into templates.

### Layer 2 — RENDERED (derived, per-channel, transient)

Produced at send time by the one canonical renderer. **Not stored as the source of truth** — it is what gets handed to the provider:

```jsonc
{ "channel": "email", "subject": "…", "html": "…", "text": "…" }
{ "channel": "sms",   "text": "…", "segments": 2, "encoding": "GSM-7" }
```

Same authored content → different rendering per channel. An `action` block becomes a styled button in email and a short link in SMS. This is what makes "conversation is the product, transport is detail" real rather than aspirational.

### Layer 3 — RETAINED FOR AUDIT (immutable send snapshot)

On the message row, written once at enqueue and **never updated**:

```
rendered_snapshot jsonb   -- exactly what was handed to the provider
content_hash      text    -- sha256 of (content || rendered_snapshot)
```

This answers "what did we actually send this family?" — a question the platform **cannot answer today**, because `body` is mutable text with no provenance and no `template_id`. The existing `communication_scheduled_sends.subject_snapshot`/`body_snapshot` columns already establish this snapshot precedent; this generalizes it.

`body text` is **retained** and populated with the rendered plain-text form, so every existing reader keeps working unchanged through the whole migration.

## Options

| Option | Consequence |
|---|---|
| (a) Keep `body text`, put structure in `metadata` | No schema change. Unqueryable, unvalidated, and `metadata` is already an unversioned junk drawer. Rejected. |
| (b) Add `body_html` alongside `body` | Solves email formatting only. No actions, no attachments, no audit, no per-channel rendering. Solves the smallest part of the problem. |
| **(c) `content jsonb` + `rendered_snapshot jsonb` (recommended)** | One versioned authored representation, one derived rendering, one immutable audit record. Cost: a JSON schema to maintain and validate. |

**Blocked if deferred:** Phase 3 entirely (interactive actions and attachments have nowhere to live), and the audit half of Phase 4.

---

# D3 — Communication purpose / category

**Phase that depends on it:** Phase 0 (P0-1 cannot be completed without it). **Changes doctrine: YES** — it defines the compliance vocabulary of the platform.

## The problem

**Verified live: `communication_messages` has no `category` column.** `enforceConsentForSend` therefore derives category from *channel* — `sms → sms_transactional`, `email → email_transactional` (`consentEnforcement.ts:14-16,27`) — so absent an explicit caller-supplied category **every send classifies as transactional and is always allowed** (`consentGate.ts:52-54`). No production caller supplies one. The gate is structurally incapable of blocking anything.

## Recommendation

**A closed, platform-owned, two-axis vocabulary. Not tenant-editable. Domain-neutral.**

Your instruction to avoid childcare-specific vocabulary in the shared platform layer is right, and it is the reason for two axes rather than one list.

### Axis 1 — `category` (compliance class) — closed CHECK, platform-owned

| Value | Meaning | Consent | Quiet hours | Unsubscribe required |
|---|---|---|---|---|
| `transactional` | Completing a transaction the recipient initiated or is party to | Cannot be opted out of | Not suppressed | No |
| `operational` | Service delivery about an existing relationship | Opt-out honored | **Suppressed** | Yes |
| `marketing` | Promotion / solicitation | Opt-in required | Suppressed | Yes, prominently |
| `emergency` | Safety / urgent, time-critical | Overrides opt-out | **Never suppressed** | No |
| `internal` | Staff↔staff; never leaves the org | N/A | N/A | N/A |

Five values, all domain-neutral — they would read identically for a logistics or healthcare tenant. This is the axis that governs **consent, quiet hours, compliance, and provider behavior**.

### Axis 2 — `purpose` (operational intent) — free text, tenant-extensible, **compliance-inert**

`tour_reminder`, `enrollment_packet`, `billing_notice`, `waitlist_update`, … Governs **analytics, template categorization, and reporting only**. It may never widen consent — a `purpose` cannot make a `marketing` message sendable.

**Separating these two axes is the whole point.** Childcare vocabulary lives in `purpose` where tenants can extend it; the compliance vocabulary lives in `category` where it is closed, platform-owned, and legally meaningful.

### What each governs

| Concern | Governed by |
|---|---|
| Consent / opt-out | `category` only |
| Quiet hours | `category` (`emergency` exempt, `transactional` exempt) |
| Legal restriction (TCPA/CAN-SPAM) | `category` |
| Unsubscribe footer requirement | `category` |
| Provider selection / throttling | `category` (emergency may bypass rate limits) |
| Analytics, template performance | `purpose` |
| Operational vs marketing boundary | `category` — the boundary *is* the enum |

### Default handling — the trap to avoid

Your direction: existing transactional or legally necessary communication must be **classified explicitly rather than becoming an undocumented default**.

So: ship `DEFAULT 'operational'` (the *safer* class — opt-out honored, quiet hours applied) rather than `transactional`, and require every call site to pass `category` explicitly. A lint/test asserts no production caller relies on the default. Choosing `operational` as the default means a mis-classification **under**-sends rather than over-sends.

**Blocked if deferred:** P0-1 cannot be completed at all — the gate has no input. This is the single highest-leverage decision in the packet.

---

# D4 — Public interactive-action security

**Phase that depends on it:** Phase 3. **Changes doctrine: YES** — it introduces a non-operator actor to the command runtime.

You are directionally aligned with single-action, single-use. Here is the full specification.

## Foundation: the precedent already exists

`api/public/tour-booking/[token]/book/route.ts:90` calls the **same** `createTourBooking` the operator route calls, running the **same** Platform Transaction (`insert_booking → opportunity_integration → lifecycle_event → confirmation_comms`). **There is no shadow path.** This decision generalizes that one proven case; it does not invent a mechanism.

## Specification

| Property | Decision |
|---|---|
| **Token lifetime** | Default **72h**, per-action override, hard ceiling **14d**. Bounded by the *subject's* validity too — a tour-time token dies when the slot is taken, regardless of clock. |
| **Storage** | **SHA-256 hashed at rest**, following `form_public_links.token_hash`. **Never** the plaintext `action_links` pattern. 256-bit mint via the existing `formPublicLinkToken.ts:5`. |
| **One-time consumption** | `consumed_at` + `consumed_by_ip_hash`. Consumption is a **conditional UPDATE** (`WHERE consumed_at IS NULL`) inside the same transaction as the command, so a race cannot double-execute. |
| **Subject + action binding** | Token row carries `action_key`, `subject_type`, `subject_id`, `payload`, `recipient_person_id`. All are **server-side truth**; the request body may supply *nothing* that widens authority. A request parameter can only *select among options the token already enumerates*. |
| **Allowed command** | Only capabilities flagged `externalInvocable: true` on `PlatformCapabilityDefinition`. Enforced server-side at dispatch, never inferred from the request. Default is false; adding the flag is a reviewed change. |
| **Replay protection** | Single-use + short expiry + conditional-update consumption. Replay after consumption returns the **same** terminal outcome page, not an error and not a re-execution. |
| **Idempotency** | The token id **is** the idempotency key. Re-submitting yields the original result. This mirrors `communication_scheduled_sends`' existing claim-token fencing rather than inventing a scheme. |
| **Revocation** | `revoked_at` + reason. Revoked automatically when the subject changes state (slot taken, enrollment withdrawn, opportunity closed), and manually by an operator. |
| **Identity confidence** | The token proves **possession, not identity**. Recorded as `identity_confidence: 'token_possession'`. For low-risk actions that is sufficient. For anything sensitive it is not — see below. |
| **Actor representation** | `actor_type: 'external_recipient'` + resolved `person_id`. **Never null, never an operator.** This is the change to `executeCommandInvocation.ts:163-170`, which today unconditionally overwrites the actor with the server session. |
| **Audit** | Every resolve **and** every execute writes a `workflow_events` row with token id, action, subject, IP hash, user-agent hash, and outcome. Failed and expired attempts are audited too. |
| **Expiration experience** | A plain page: what the link was for, that it expired, and **a way to reach the school** — never a raw 404, never a stack trace. Identical response shape and timing for invalid / expired / consumed / revoked, so tokens cannot be probed. |
| **Rate limiting** | Per token, per IP, and per subject. Reuses the existing limiter on the tour-booking route. |

## Confirmation behavior — your specific question

**Yes, some low-risk actions may complete without an extra confirmation step**, gated by a declared risk class on the capability:

| Risk class | Behavior | Examples |
|---|---|---|
| `low` | **One tap completes.** Result page shows what happened + an undo affordance where the command supports it | RSVP, confirm attendance, select a tour time from the enumerated set, acknowledge |
| `medium` | Renders a **preview** (`mode:"preview"` through the existing command runtime), then an explicit confirm | Reschedule, accept placement, choose classroom |
| `high` | Not `externalInvocable` at all in V1 | Anything financial, anything destructive, anything changing identity or custody |

The preview/confirm split reuses the command runtime's existing `mode: "preview" | "execute"` and `confirmationPolicy` — no new mechanism.

**Requiring confirmation on a one-tap "pick this tour time" would defeat the product goal.** That is precisely the portal friction the brief asks us to eliminate. Bounded by: low-risk only, enumerated options only, single-use, and reversible where possible.

## Execution path — non-negotiable

```
POST /api/public/actions/[token]/execute
  → resolve token (hashed lookup, expiry, revocation, consumption check)
  → load capability; assert externalInvocable
  → build invocation with actor_type='external_recipient', person_id
  → executeCommandInvocation(...)          ← the SAME facade operators use
      → Platform Transaction (validate → persist → business_process → activity → …)
  → conditional consume in the same transaction
  → audit
```

**No parallel mutation path. No portal. No session. No authenticated user record created.** A token grants exactly one command against exactly one subject, once.

## What this explicitly is not

- Not a participant portal — no login, no account, no browsable surface
- Not a general session — the token cannot be exchanged for broader authority
- Not a new command system — it is a new *actor* on the existing one
- Not a way to bypass permission checks — capabilities not marked `externalInvocable` are unreachable, and marking one is a reviewed change

**Blocked if deferred:** Phase 3 in full, which is the first complete vertical slice and the most demonstrable capability in the brief.

---

# D5 – D12 — Compact decision table

| ID | Title | Problem | Options | Recommendation & why | Consequences | Migration | Blocked if deferred | Doctrine? | Phase |
|---|---|---|---|---|---|---|---|---|---|
| **D5** | **Inbound anchor override** | `_find_canonical_sms_thread()` reuses any thread with the same `recipient_key` regardless of anchor (`communication_inbound.py:184-225`), so a long-lived SMS thread's subject is "whatever came first" | (a) keep as-is; (b) re-anchor per message; (c) keep one thread, attach per-message subject via D1 | **(c).** The relationship instinct is *right* — splitting threads per subject would fragment a family's conversation into unusable shards. D1's `subject_link_id` on the message makes the subject truthful without splitting | Threads stay whole; per-message subject becomes accurate; Current Work stops inheriting a stale anchor | Backfill `subject_link_id` = thread owner link for existing messages | D1's value is halved — links exist but inbound still lies about subject | No | 1 |
| **D6** | **Internal conversation placement** | Staff collaboration has no home; 8 competing note mechanisms already exist | (a) Communications channel; (b) BOS; (c) Conversation Runtime presentation | **(c).** BOS is *architecturally* disqualified — `sessionStorage`-only, tab-scoped, single-operator, terminates on command execution, and its own charter (`round-5/README.md:9,79`) forbids it. (a) yields "a message to a parent with a lie flag." (c) reuses `communication_message_reads`, which is already per-user-per-message — the hardest primitive to retrofit, already built | One runtime, three presentations. Requires `direction='internal'` + nullable thread owner + participants table | Collapse the 8 note mechanisms; only `opportunities.metadata.notes` has real data | Phase 5; WS7 has no foundation | **Yes** | 5 |
| **D7** | **Identity grants fail open or closed** | 6 per-identity capability bits exist; **live: 0 grant rows**; nothing anywhere can create one, so all bits are inert | fail-open (current, documented intent) / fail-closed | **Fail-open until the grant UI ships, then flip in the same release.** Flipping first locks every operator out of sending — verified 0 grants live | No behavior change now; a real gate later | Seed default grants at UI launch | Nothing immediately; must resolve before Phase 4 completes | No | 4 |
| **D8** | **Legacy `public.messages` retirement** | Still written and drained in the same request as the canonical queue (`messages_sender.py:78,89`) | now / phased / not this sprint | **Not this sprint. Freeze writes only.** A retirement plan already exists with Phase 5 unscheduled. Dropping it during a safety sprint adds risk for no safety gain | Dual-write continues; one more thing to delete later | Freeze new writers; leave data | Nothing | No | later |
| **D9** | **Realtime / presence in internal conversations** | Presence needs Supabase Realtime, used **nowhere** in Alloy today | in V1 / defer | **Defer.** Read status and unread counts deliver most of the value and need no realtime. Presence is a platform-wide first and should be scoped as its own initiative | Internal threads ship without typing indicators | None | Nothing — WS7 ships without it | No | 5 |
| **D10** | **Announcements: disclose vs wire delivery** | Composes, targets, schedules — **never delivers**, silently. Live: 0 announcements, 0 targets, and the targets API writes columns that don't exist (P0-4) | disclose now / wire now / hide | **Disclose in Phase 0 (one-line banner), wire in Phase 4.** Silently accepting a schedule that will never fire is the worst option and is the current state | Operators stop being misled immediately; delivery lands with the rest of the fan-out work | P0-4 repair is a prerequisite either way | Operators keep scheduling into a void | No | 0 + 4 |
| **D11** | **Brand entity** | WS6 asks Org→**Brand**→Location→Program→Room; **no `brands` table exists** and nothing anticipates one | create entity / configurable brand profile / defer | **Configurable communication-brand profile, not an entity** — per your direction, and the evidence supports it: what WS6 actually needs from "brand" is a *presentation bundle* (sender name, reply-to, signature, logo, colors, footer). That is a config object attachable at any hierarchy level, not a durable entity with identity and lifecycle. A real `brands` entity should be created only when something must *belong to* a brand independently of location | 4 hierarchy levels ship; brand is a profile that any level may own | None — profile rides the D-level rules table | Nothing; WS6 ships 4 levels | No (profile) / **Yes** (entity) | 4 |
| **D12** | **Which program entity** | Two exist: `location_program_categories` (site-scoped, `20260610140001:9`) and `programs` (org-scoped, `20260722020000:9`) | pick one / support both | **Needs your call** — this depends on where Configuration Publication is heading, which is outside what I verified. If forced: `location_program_categories`, because the canonical `resolveConfigRule` scope tuple already uses `program_category_id` and matching it costs nothing | Determines the FK in the hierarchy rules table | Choosing later means an FK change | Phase 4 hierarchy schema | No | 4 |

---

## Decision dependency summary

| Decision | Must be answered before |
|---|---|
| **D3** (category) | **Phase 0 P0-1** — the gate cannot function without it |
| **D1** (links), **D2** (content) | **Phase 1** |
| **D5** (anchor) | Phase 1 (rides D1) |
| **D4** (token security) | Phase 3 |
| **D7, D10, D11, D12** | Phase 4 |
| **D6, D9** | Phase 5 |
| **D8** | Not blocking |

**Phase 0 needs only D3.** D1, D2 and D5 can be decided while Phase 0 is in flight.
