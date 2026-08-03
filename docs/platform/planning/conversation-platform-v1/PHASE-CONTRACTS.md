---
title: Conversation Platform V1 — Phase Contracts
status: proposal — Phase 0 authorized, Phases 1–5 awaiting approval
date: 2026-07-30
---

# Conversation Platform V1 — Phase Contracts

Each phase is an independently approvable contract. **No phase requests approval for a later phase.**

Phase 0's detailed implementation contract is a separate document: [`PHASE-0-CONTRACT.md`](PHASE-0-CONTRACT.md). Live evidence: [`PHASE-0-LIVE-VERIFICATION.md`](PHASE-0-LIVE-VERIFICATION.md).

---

## Challenge to the proposed sequencing — one refinement, with evidence

Your cadence is right in shape and I am adopting it. **Moving attachments from 3 to 4 is an improvement over my plan** — it makes Phase 3 a genuinely single vertical slice instead of two.

**One evidence-based refinement: Phase 2 must also carry the send *pipeline*, not just provider *setup*.**

Your Phase 2 is "composer convergence and production provider setup." Provider setup alone is insufficient to make Phase 3 executable, because of three verified facts:

1. **There is no scheduler.** No `pg_cron` in any migration, no `vercel.json` crons, no scheduled GitHub Action (`.github/workflows/` is docs-lint, operational-expectations-gates, web-typecheck only), no Python scheduler. Nothing in-repo drives `process-due` or `/internal/messages/process`. **Live: 2 `communication_scheduled_sends` rows exist and nothing would drain them.** Phase 3's flagship scenario is a *tour reminder chain* — a 24h reminder cannot fire without a scheduler. Phase 3 would be undemonstrable.
2. **Queue B has no lease.** `communication_message_sender.py:120-135` polls `status=queued` with no `FOR UPDATE`, no `SKIP LOCKED`, no claim step. Concurrent workers double-send. In Phase 3 a double-send means a family receives two "pick your tour time" links — and with single-use tokens (D4), the second is dead on arrival. That is a visibly broken product moment, not a background inefficiency.
3. **`failed` is terminal with no retry and no operator remediation.** A transient provider blip permanently loses an interactive invitation, with no UI listing it and no endpoint to resend.

**Recommendation:** rename Phase 2 to **"Composer convergence and production send pipeline"** and include scheduler + queue lease + retry/DLQ + failed-send remediation. This is a scope *addition* to Phase 2, not a reordering, and it is what makes Phase 3 provable in production rather than only in a test.

Everything else in your cadence I accept as proposed.

---

# Phase 0 — Production safety and schema repair

**Status: authorized. Detailed contract in [`PHASE-0-CONTRACT.md`](PHASE-0-CONTRACT.md).**

| | |
|---|---|
| **Product outcome** | No latent compliance, authorization, or schema defect remains that would become a violation or an outage under production volume. |
| **Included** | P0-1 eligibility gate + keyword processing; P0-2 signed-URL authorization + path repair; P0-3 server-authoritative rendering; P0-4 `announcement_targets` repair; three missing send-permission gates; middleware webhook bypass; announcements disclosure banner. |
| **Excluded** | Any feature work. Any storage redesign (**live verification demonstrates it is not necessary**). Legacy `public.messages` retirement. Composer convergence. Anything in Phases 1–5. |
| **Dependencies** | **D3 (category vocabulary) only.** Nothing else blocks. |
| **Risk** | Medium — it touches the send path, which has no test coverage today. Mitigated by building the test harness first. |
| **Stop conditions** | A repair would change a canonical ownership boundary; the eligibility gate cannot be made unbypassable without a Python-side change not covered by the contract; or the `announcement_targets` repair is not idempotent across both schema shapes. |

---

# Phase 1 — Foundational message model, purpose, rendering, and links

| | |
|---|---|
| **Product outcome** | A message knows **what it is** (category/purpose), **what it is about** (links), and **what was actually sent** (content + snapshot). Every send is classifiable, attributable, and auditable. |

**Included**
- `communication_messages.category` + `purpose` (D3), NOT NULL with `operational` default, closed CHECK on category
- `communication_thread_links` + `subject_link_id` (D1), with owner/context roles and org-consistency trigger
- `content jsonb` + `rendered_snapshot jsonb` + `content_hash` (D2); `body text` retained and populated
- The canonical renderer promoted from Phase 0's P0-3 into the block model
- Per-message subject resolution (D5)
- Scheduled-send entity generalization — `persons`/`customers` accepted, non-`task_assist` sources allowed
- Dual-write and dual-read for links; backfill from `primary_entity_*` with plural→singular normalization

**Excluded** — interactive actions (3); attachments (4); per-channel *rendering variants* beyond text/html (2); hierarchy (4); inbound (5); template approval (4)

**Dependencies** — Phase 0 complete; **D1, D2, D3, D5 answered**

**Database** — as §8.2 of the plan, plus `content`/`rendered_snapshot`/`content_hash`. All additive-nullable-first.

**APIs / workers / providers** — `/send` and `/family-send` accept `category` (required), `purpose`, `content`; `/family-send` becomes canonical and `/send` a thin adapter; `communication-scheduled-sends` POST accepts new entity types; no provider change.

**UI** — composer gains a category selector (defaulted from template `purpose`, overridable); template editor blocks `active` on unresolved tokens; Send-later becomes available on person-anchored threads.

**Migration / compatibility** — every existing reader of `body` keeps working (`body` is still written). Links dual-read with fallback to `primary_entity_*`, which is **not dropped**. `category` ships with a safe default, then a lint asserts no production caller relies on it.

**Security** — category is server-authoritative; a client may not set `emergency`. Link writes assert org consistency by trigger. `content` is schema-validated before persist.

**Acceptance**
- [ ] Every new `communication_messages` row has an explicit non-default `category`
- [ ] A thread carries exactly one `owner` link and 0..n context links; a thread can link to a business process **and** a record simultaneously
- [ ] `rendered_snapshot` is written once and never updated; `content_hash` is stable
- [ ] Send-later works from every composer for `persons`- and `customers`-anchored threads
- [ ] The Command Center enrichment ladder reads links instead of re-deriving

**Automated tests** — category×channel×preference matrix; link cardinality and org-consistency (including a cross-org attempt); backfill idempotency run twice; snapshot immutability; scheduled-send entity acceptance.

**Manual QA** — open a real child, send from each composer, confirm category recorded and links correct; schedule a send from the Family Workspace.

**Evidence for approval** — migration replay clean on a fresh DB; backfill run twice with identical result; the category matrix green; a screenshot of a real message row showing category, links, and snapshot.

**Risk** — Medium. **Stop conditions:** the `primary_entity_type` live audit reveals values outside the expected set that cannot be mapped deterministically; or the links join materially regresses Command Center load time.

---

# Phase 2 — Composer Convergence and Production Send Pipeline

*(renamed and rescoped per Kelly's decision §5 — sequencing challenge accepted)*

| | |
|---|---|
| **Product outcome** | One composer runtime across every surface, and a send pipeline that can **schedule and deliver one message exactly once from Alloy's perspective** — proven, not asserted. |

> **Gating rule, as decided:** the interactive-tour implementation (Phase 3) **does not begin** until this phase proves exactly-once scheduling and delivery.

**Included — composer convergence**
- Composer Runtime: contract, capability registry, presentation variants, Preview VM seed (§10.1 of the plan)
- **Every rendered control is capability-gated** — inert buttons become impossible to write
- Deletion: `ComposerV2`, `TemplateBuilder`, `AnnouncementBuilder`, `CommunicationsDrawerSectionLegacy` — **unique capabilities ported first** (optimistic rows, activity invalidation, contact-attempt notes)

**Included — production provider onboarding**
- Identity/provider **write path**: account + identity CRUD, verification workflow, location bindings, grants (D7 stays fail-open until the UI ships, then flips **in the same release**)
- Remove the cross-tenant credential fallback (`communication_message_sender.py:329-334`) — an `unconfigured` tenant must fail closed, as the SMS branch already does

**Included — production send pipeline** *(the rescope)*
- **Scheduled execution infrastructure** — a committed scheduler for both drains, with a runbook. Nothing in-repo drives either today.
- **Dequeue leasing / atomic claim** on Queue B — `FOR UPDATE SKIP LOCKED` + claim token, matching Queue A's already-proven pattern (`claim_due_communication_scheduled_sends`)
- **Idempotent provider dispatch** — a dispatch key so a retried or concurrent attempt cannot produce a second provider call
- **Duplicate-send prevention** — enforced at the claim, not by convention
- **Retry behavior** — attempts, backoff, `next_attempt_at`, dead-letter; `failed` ceases to be terminal
- **Stale lease recovery** — `releaseStaleClaims` actually invoked (today it exists and is self-documented as never called in production)
- **Provider-result persistence** — provider response and error persisted, not just logged
- **Worker observability** — drain runs, claim counts, blocked counts, retry counts, DLQ depth
- **Safe handling of single-use interactive links** — a retried send must not mint a second token, and a token minted for a message that later fails must be revoked. This is the specific interaction that makes Phase 3 safe.
- **Proof** that concurrent workers cannot send the same message twice

**Excluded** — interactive actions (3); attachments (4); delivery telemetry to timeline (4); inbound (5); hierarchy (4)

**Dependencies** — Phase 1 complete; **D7**

**Database** — retry + lease columns on `communication_messages`; dispatch-key column; no new tables.

**APIs / workers / providers** — identity CRUD routes; retry + failures routes; the Python sender gains a claim step and an idempotency key; scheduler invokes `process-due` and `/internal/messages/process`.

**UI** — one composer across all surfaces; identity/provider admin; failed-send queue with retry.

**Migration / compatibility** — composer surfaces migrate one at a time behind the capability registry; each surface's old implementation is deleted as it migrates, not after. The lease is added to Queue B without changing Queue A.

**Security** — identity CRUD requires a real permission (not `requireAdminOrOps` alone); grants flip to fail-closed in the same release as the grant UI; scheduler endpoint uses a rotated internal token and logs all-org runs explicitly; the credential fallback removal is a tenant-isolation fix.

**Acceptance**
- [ ] One composer runtime serves all surfaces; **no rendered control lacks a handler**
- [ ] An operator creates a provider account and sender identity in the UI with **no SQL**
- [ ] A committed scheduler drives both drains; a runbook exists
- [ ] **Concurrent workers cannot send the same message twice — proven by a DB-backed concurrency test running N workers against one queued row**
- [ ] **One message scheduled for T is delivered exactly once at T**, proven end to end
- [ ] A deliberately-failed send retries with backoff and lands in the DLQ; an operator sees and retries it
- [ ] A stale lease is recovered without duplicating the send
- [ ] A retried send does not mint a second interactive token
- [ ] An `unconfigured` tenant fails closed rather than sending on platform credentials
- [ ] The four orphaned/legacy surfaces are deleted

**Automated tests** — DB-backed concurrency on both queues (N workers, one row, assert exactly one provider call); retry/backoff/DLQ; stale-lease recovery; idempotent dispatch under duplicate invocation; composer capability-registry validation (a surface declaring a capability it cannot perform fails the build); identity CRUD permission matrix.

**Manual QA** — send from every surface; kill the provider mid-send and confirm retry → DLQ → operator retry; run two drains simultaneously and confirm one delivery.

**Evidence for approval** — concurrency test output showing exactly one provider call under N concurrent workers; a scheduled message delivered once at its scheduled time; a DLQ row with its retry history; screenshots of every migrated composer surface; `git log` showing the deletions.

**Risk** — **High** (largest phase; touches every send surface and the worker). **Stop conditions:** a legacy composer capability cannot be ported without a new architectural decision; the scheduler cannot be committed to the repo (hosting constraint); or exactly-once cannot be proven — in which case **stop**, because Phase 3 is gated on that proof.

---

# Phase 3 — Interactive tour action: the first complete vertical slice

| | |
|---|---|
| **Product outcome** | **A parent receives an email listing tour times, taps one, and the tour is booked through the canonical Platform Transaction — with no portal, no login, and no operator intervention.** One capability, end to end, production-grade. |

**Included**
- Recipient action tokens per D4: hashed, expiring, single-use, subject+action bound, revocable, audited
- `externalInvocable` + `riskClass` on `PlatformCapabilityDefinition`
- `actor_type: 'external_recipient'` in the command runtime — **the change to `executeCommandInvocation.ts:163-170`**
- `POST /api/public/actions/[token]` (resolve) and `/execute`
- `action` / `action_group` content blocks (D2) rendering as email buttons and SMS short links
- Recipient-facing action page: mobile-first, single-purpose, accessible expiry and terminal states
- **Exactly one capability marked `externalInvocable` in this phase: tour time selection.** Nothing else.
- Composer support for authoring an interactive action

**Excluded** — every other interactive action (confirm/decline, upload, forms, checklists, pay, classroom, placement, RSVP); attachments; external document upload; inbound; internal conversations

**Dependencies** — Phases 1 and 2 complete (**scheduler and lease are prerequisites**); **D4**

**Database** — `communication_message_actions` (§8.4 of the plan).

**APIs** — two public routes; capability definition change; no provider change.

**UI** — composer action builder; the public action page.

**Migration** — purely additive. The existing `/tour-booking/[token]` route continues to work unchanged; the new path does not replace it in this phase.

**Security — the phase's dominant concern**
- Hashed at rest; never the plaintext `action_links` pattern
- Consumption is a conditional UPDATE inside the command transaction
- Capability allowlist enforced server-side; request body may never widen authority
- Identical response shape **and timing** for invalid / expired / consumed / revoked
- Rate limited per token, per IP, per subject
- Every resolve and execute audited, including failures
- **No portal, no session, no parallel mutation path**

**Acceptance**
- [ ] The flagship scenario works end to end, certified in a browser against a real record
- [ ] The same action completes via SMS short link
- [ ] A consumed token replayed returns the original outcome and does **not** re-execute
- [ ] A capability without `externalInvocable` is rejected server-side
- [ ] The action is recorded with an `external_recipient` actor and resolved `person_id` — never null, never an operator
- [ ] Expired/revoked tokens render a helpful page with a way to reach the school
- [ ] Token probing cannot distinguish invalid from expired from consumed

**Automated tests** — token lifecycle (valid/expired/consumed/revoked/wrong-subject/wrong-capability); concurrent double-submit proves single execution; enumeration timing; rate limit; capability allowlist bypass attempts.

**Manual QA** — send to a real inbox and a real handset; tap; verify the booking, the activity entry, and the audit rows. Verify rendering in at least Gmail web, Gmail iOS, Apple Mail, and Outlook web — **and document, not promise, what degrades.**

**Evidence** — a recorded end-to-end run; the audit trail for one token; the email-client rendering matrix with known degradations stated plainly.

**Risk** — **High** (net-new external attack surface). **Stop conditions:** the external-actor representation requires changing the command runtime's authorization invariant rather than extending it; or `riskClass` cannot be enforced server-side without trusting request input.

---

# Phase 4 — Tracking, preferences, attachments, and template completion

| | |
|---|---|
| **Product outcome** | Operators can see what happened to a communication, configure who gets contacted how and when at the right hierarchy level, attach documents, and manage templates with approval and inheritance. |

**Included**
- **Tracking:** delivery/open/click/bounce/complaint each emit `workflow_events` in the `communications` category; the optimistic fake `message_delivered` removed; `communication_message_recipients` actually INSERTed; `template_id` + `sender_user_id` for attribution; OIP metrics scope-corrected and extended
- **Preferences:** `contact_methods` (preferred email/phone); person language + timezone; quiet hours generalized out of tours onto the canonical rule pattern; preferred-guardian policy
- **Hierarchy:** `communication_identity_rules` on the canonical `resolveConfigRule` shape (Org→Site→Program→Room), with **provenance display**; configurable communication-brand profile (D11) — reply-to, signature, sender name, footer
- **Attachments:** `communication_message_attachments`; composer drag/drop reusing `ProcessingImportAction`; provider attachment support; size limits and MIME allowlist
- **Templates:** approval workflow, publishing transition, inheritance across levels, snippets or their deletion, token catalog gaps (billing, staff, date formatting, defaults)
- **Announcements:** delivery wired (D10)
- **Automation:** `send_communication` rule target; the tour→reminder→no-show→task→Current Work chain closed **by configuration**

**Excluded** — inbound email; internal conversations; realtime; additional interactive actions beyond Phase 3's one

**Dependencies** — Phases 1–3; **D7, D10, D11, D12**

**Security** — attachment size/MIME/scanning decision; recipient-facing document links need a **longer-lived, revocable** token distinct from the 10-minute operator signed URL; metric scope enforcement.

**Acceptance**
- [ ] Delivery telemetry reaches the timeline in the right category; no fabricated events remain
- [ ] Quiet hours suppress a non-emergency send and defer it; an `emergency` message is **not** suppressed
- [ ] Identity resolution reports **which level bound and why**
- [ ] Tour-booked → 24h → 2h → no-show → follow-up task → Current Work fires from configuration, not code
- [ ] Response time, template performance, and operator responsiveness are computable and location-scoped
- [ ] A parent receives a document as an attachment or a revocable link

**Risk** — Medium-High (broad). **Stop conditions:** attachment provider limits force a hosting decision not covered here; or hierarchy resolution requires deviating from `resolveConfigRule`.

---

# Phase 5 — Inbound email and internal operational conversations

| | |
|---|---|
| **Product outcome** | A family's email reply lands on the right conversation and advances the right work; and staff hold operational conversations attached to real context — with no second messaging platform. |

**Included**
- Inbound email: receiving provider, webhook, MIME parsing, `message_id`/`in_reply_to`/`references` storage, threading
- Identity-resolution convergence — inbound adopts the confidence-tiered `intake/resolve` engine; the crude Python phone lookup is retired
- Unknown/ambiguous sender resolution surface
- Inbound → business-process advancement (a `communication` domain signal)
- Internal conversations (D6): `direction='internal'`, nullable thread owner, participants table, mentions, read state
- **Notifications substrate** (platform-wide prerequisite)
- Collapse of the eight note mechanisms

**Excluded** — presence/realtime (D9); phone/voice (**design only, per boundary**); WhatsApp/Apple Messages; general chat

**Dependencies** — Phases 1–4; **D6**; **a receiving-provider decision** (procurement, not engineering)

**Security** — inbound is an unauthenticated ingress: signature verification, size limits, MIME safety, no auto-execution of anything from an inbound message. Internal threads must not widen family-facing visibility.

**Acceptance**
- [ ] A parent's reply threads correctly via message-id headers
- [ ] Ambiguous senders reach an operator resolution surface rather than a dead end
- [ ] An inbound reply advances a configured business process
- [ ] Staff hold an internal thread on a record with mentions, read state, and assignment — **no second messaging store**
- [ ] The eight note mechanisms are migrated or deleted

**Risk** — **High**, and lowest confidence of any phase. **Stop conditions:** no receiving provider is selected; or internal conversations cannot ship without realtime, which would make this two phases rather than one.

---

## Cross-cutting requirements — every phase

- No second conversation, message, composer, inbox, timeline, identity, workflow, action, notification, or analytics runtime
- No new free-text column where a vocabulary is intended
- No new `GRANT ALL … TO anon`
- Every new route: auth gate + org scoping + permission gate, asserted by a **route-level** test that imports the handler
- Dead code identified in a phase is **deleted in that phase**
- Browser certification via authed Playwright on port 3012 against the real app, entered by opening a real record — never a `/dev` harness, never seeded fake data
- No implementation weakens org scope, relationship scope, audit, consent, or permission enforcement
- Configuration steers; **code owns security and executable invariants**
- BOS stays human-in-the-loop; Operational Intelligence owns analytics; phone stays design-only
