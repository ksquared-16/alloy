# Sprint: Task Assist V1 (Agent #2)

**Path:** `docs/sprints/archive/05_2026/task_assist_v1.md`  
**Status:** **V1 shipped** (Cards 0–7 complete as of 2026-05-14). Ephemeral proposals, **opportunities-only** drawer UI behind **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`**, **`POST /api/admin/ai/task-assist/propose`** + **`POST /api/admin/ai/task-assist/apply`**, canonical send via **`executeCommunicationsSend`** (same stack as **`POST /api/admin/communications/send`**). No migrations for core path. **Durable proposals, scheduled sends, and operational tasks** ship in **`docs/sprints/archive/05_2026/task_assist_v1_1.md`** (Task Assist V1.1).  
**Prerequisites:** `docs/sprints/archive/05_2026/task_assist_v1_step0_audit.md`, `docs/sprints/archive/05_2026/ai_agents_v1.md` (§6.1 Agent #2 ownership, §8 historical sketch — **canonical contract is §3 below**).

**Sources of truth (behavior):** `docs/product/communications.md` (canonical comms system — there is no `docs/system/communications.md` in-repo; use this file), `docs/archive/2026-06-superseded-system/actions-and-workflows.md`, `docs/execution/operating-doctrine.md`, `web/app/api/admin/communications/send/route.ts`, `web/lib/communications/canonicalOutboundEnqueue.ts`.

**Non-goal:** This document is **not** Workflow Assist (Agent #3). No `workflows` / `workflow_actions` / NL→workflow.

---

## Card 0 — Locked decisions (2026-05-14)

Execution constraint: **Cards 1+ must not contradict this section without a new Card 0 amendment.**

| Decision | Locked choice |
|----------|----------------|
| **Primary entity** | **`opportunities` only** for Task Assist V1. **`jobs`** are supported by `POST /api/admin/communications/send` but **deferred** to V1.1+ to reduce scope and duplicate validation paths. |
| **Scheduled send** | **Deferred** (no `scheduled_for_iso` usage in V1; validators reject non-null). |
| **Durable proposal storage** | **Deferred** (Option A — ephemeral proposals only). |
| **Workflow configuration** | **Out of scope** (Agent #3). No workflow fields on proposals; parsed JSON must not carry workflow graph keys (validators include a `Record` guard for future routes). |
| **Bulk / mass send** | **Out of scope** — single `selected_recipient` for send apply. |
| **Reminder / follow-up** | **Deferred** — `task_type` `set_opportunity_follow_up` and `apply_intent` `set_opportunity_follow_up` are **rejected** in V1 validators; opportunity `metadata.next_follow_up_at` PATCH may ship in V1.1 with its own card. |
| **Canonical apply path** | **`executeCommunicationsSend`** (`web/lib/communications/executeCommunicationsSend.ts`) — shared with **`POST /api/admin/communications/send`** — calls **`enqueueCanonicalOutboundMessage`**. Task Assist **apply** must call this helper only (no direct `communication_messages` inserts, no legacy **`public.messages`** / **`messages_outbox`**). |
| **`draft_in_app` / `in_app` channel** | **Not in V1** — validators reject `in_app` channel and `draft_in_app` task type for apply/send. |

---

## 1. V1 product scope (narrowest useful ship)

### 1.1 In scope (V1)

| Capability | Detail |
|------------|--------|
| **Single-recipient draft** | SMS **or** email body (and email subject when channel is email), anchored to an **`opportunities`** row (**`jobs` deferred** per Card 0). |
| **Human-editable draft** | All outbound text is shown in UI and editable **before** any server-side enqueue. |
| **Explicit approval** | **Send now** only after operator confirms a final payload; server runs **full deterministic validation** again on apply (never trust client-only checks). |
| **Context-aware generation** | Proposal `draft_body` / `draft_subject` may be produced from **read-only** record context (entity GET fields, activity summary, drawer recipients list) — deterministic templates first; optional gated LLM **only** behind same class of policy gates as Agent #1 enrichment (`docs/product/bos-foundation.md`). |
| **Recipient transparency** | `recipient_candidates` + operator-**selected** single recipient; no hidden BCC, no multi-send in V1. |

### 1.2 Explicitly out of scope (V1)

| Exclusion | Rationale |
|-----------|-----------|
| **Bulk / mass send** | Compliance and abuse risk; single recipient only. |
| **Autonomous send** | Violates doctrine; no cron-from-model without human step. |
| **Reusable workflow configuration** | Agent #3 only. |
| **Legacy stack** | No apply path through `public.messages` / `messages_outbox` for Task Assist (`docs/product/communications.md` — new work extends `communication_*` only). |
| **Direct DB writes from model output** | Model fills **proposal JSON only**; **apply** uses HTTP APIs that already enforce org, permissions, and canonical enqueue. |
| **Scheduled one-time send (canonical)** | No `scheduled_at` on `communication_messages` today; adding clean scheduling requires **schema + worker** contract — **deferred to V1.1+** (see §2.3). |

### 1.3 Optional / gated (only if Card 0 approves “minimal reminder”)

| Capability | Safe path |
|------------|-----------|
| **Reminder / follow-up** | **Only** if implemented as **`metadata.next_follow_up_at`** (or equivalent existing field) on **`opportunities`** via the **existing** admin `PATCH` opportunity route and **`normalizeOpportunityWritePayload`** — no new `tasks` table in V1. **Jobs** / other entities: **out of scope** unless an existing PATCH contract exists — default **opportunities only** for reminder apply. |

If Card 0 decides reminder scope is too fuzzy, **ship comms-only V1** and defer reminder to V1.1.

---

## 2. Schema posture

### 2.1 Options (recap)

| Option | Description |
|--------|-------------|
| **A — Ephemeral proposal** | Server returns `TaskAssistSuggestionV1`; UI holds draft; **Apply** POSTs to **`/api/admin/communications/send`** (and optional opportunity PATCH for follow-up). **No** proposal rows. |
| **B — Durable proposal table** | DB rows for draft/review/approve/reject/audit/expiry; enables async review and future scheduler consumption. |
| **C — Scheduling table** | Rows representing “send at T” tied to canonical enqueue path; requires worker and **single truth** with `communication_messages`. |

### 2.2 Recommendation for V1: **Option A (ephemeral proposal)**

**Why:**

- Satisfies **human approval before send** with the **least** new surface area and **no migrations** for the core path.
- **Apply** reuses **`POST /api/admin/communications/send`** → **`enqueueCanonicalOutboundMessage`** — already the canonical stack (`docs/product/communications.md`).
- Aligns with **operating doctrine**: ship behavior-changing work with minimal reversible scope; add tables when product requires **durable** audit of *proposed* (not sent) content or deferred execution.

**When to move to B:** Operator must **leave and return** to the same proposal, compliance requires **stored AI artifacts**, or **accept/reject** analytics — then add `task_assist_proposals` (+ RLS) mirroring `agent_v1_*` proposal shape (see `docs/sprints/archive/05_2026/ai_enrichment_and_agent_actions_v1.md` Phase 3).

**When to add C:** After **Option A** ships, add migration for `scheduled_send_at` (or dedicated queue table) **only** if worker contract is written to dequeue **without** creating a second “truth” for message bodies (e.g. row stays `queued` with `metadata.send_after` reviewed by security — **design separately**; not V1 default).

### 2.3 Migrations for V1?

| Migration need | V1 decision |
|------------------|-------------|
| **Core Task Assist (draft + send)** | **No** — ephemeral proposal + existing send API. |
| **Reminder via opportunity metadata** | **No** if fields already exist on `opportunities.metadata`; only route + validation code. |
| **Scheduled send** | **Yes, deferred** — requires column or table + worker; **not** V1 unless Card 0 explicitly spins a “V1b scheduling” track with its own migration card. |

---

## 3. `TaskAssistSuggestionV1` — proposal contract (strict)

**This object is not operational truth.** Sent messages are **`communication_messages`** rows created only after approved apply through **`executeCommunicationsSend`** (same path as **`POST /api/admin/communications/send`**).

```ts
export const TASK_ASSIST_AGENT_KEY = "task_assist" as const;

/** Catalog-owned; server maps to validation + apply branches. */
export type TaskAssistTaskTypeV1 =
  | "draft_sms"
  | "draft_email"
  | "draft_in_app" // reserved if product enables; may be unused in V1
  | "set_opportunity_follow_up"; // optional; opportunities only

export type TaskAssistRecipientCandidateV1 = {
  person_id: string;
  display_label: string;
  /** Hints for UI only — apply path re-resolves phone/email server-side. */
  has_sms: boolean;
  has_email: boolean;
};

export type TaskAssistSelectedRecipientV1 = {
  person_id: string;
};

/** What the operator confirmed Apply should do — re-validated server-side. */
export type TaskAssistApplyIntentV1 =
  | { kind: "send_communication_now" }
  | { kind: "set_opportunity_follow_up"; follow_up_at_iso: string }
  | { kind: "none" }; // review-only / cancelled

export type TaskAssistConfidenceV1 =
  | { mode: "deterministic" }
  | { mode: "model_assisted"; score?: number; notes?: string | null };

export type TaskAssistSuggestionV1 = {
  version: 1;
  agent_key: typeof TASK_ASSIST_AGENT_KEY;

  /** Deterministic id for ephemeral proposals (hash of org + entity + task_type + content hash + time bucket), or future DB id. */
  suggestion_id: string;
  generated_at_iso: string;

  org_id: string;
  actor_user_id: string;

  /** Where the proposal was built, e.g. `opportunity_drawer`, `job_drawer`, `command_surface`. */
  source_surface: string;

  task_type: TaskAssistTaskTypeV1;

  /** Primary anchor entity — V1: `opportunities` only (see Card 0). */
  entity_type: "opportunities";
  entity_id: string;

  /** Short non-PII summary for UI header / logs (no child names in structured logs if policy forbids). */
  context_summary: string;

  recipient_candidates: TaskAssistRecipientCandidateV1[];

  /** Null until user selects exactly one candidate in UI. */
  selected_recipient: TaskAssistSelectedRecipientV1 | null;

  channel: "sms" | "email" | "in_app";

  draft_subject: string | null;
  draft_body: string;

  /** V1.1+ scheduling; MUST be null in V1 core ship unless Card 0 approves scheduling track. */
  scheduled_for_iso: string | null;

  /** Optional; opportunities only; ISO instant — proposal only until apply with `set_opportunity_follow_up`. */
  reminder_due_at_iso: string | null;

  assumptions: string[];
  missing_inputs: string[];
  warnings: string[];
  validation_errors: string[];

  confidence: TaskAssistConfidenceV1;

  /** Always true for mutating apply intents; server may reject if false. */
  approval_required: boolean;

  apply_intent: TaskAssistApplyIntentV1;
};
```

**Invariants:**

- `task_type` **draft_*** implies `apply_intent.kind === "send_communication_now"` when sending.
- `recipient_candidates.length >= 0`; for send, operator must set `selected_recipient` to exactly one `person_id` that passes **`assertRecipientPersonEligibleForDrawerSms` / `...Email`** on apply.
- `channel` must match `task_type` (`draft_sms` → `sms`, etc.) — validated deterministically.

---

## 4. Validation model (deterministic, before apply)

Run **after** operator clicks Apply, on **server**, on the **final** body (post-edit), independent of proposal generation:

| Check | Rule |
|-------|------|
| **Org / actor** | `getAdminContextCached` org matches `proposal.org_id`; `actor_user_id` matches session user (or service rejects). |
| **Access scope** | `assertEntityDrawerRecordReadable` (or equivalent) for `entity_type` / `entity_id` when CRM scope dimensions apply. |
| **No bulk** | Reject if more than one recipient intent detected (e.g. multiple `to` in email body parsing if ever added — **V1: single `selected_recipient` only**). |
| **Channel allowed** | `availableComposerChannels` / bindings for org + entity context (mirror send route). |
| **Recipient eligibility** | Same helpers as send route: `assertRecipientPersonEligibleForDrawerSms` / `...Email` for `selected_recipient.person_id`. |
| **Phone/email present** | Resolve phone/email via same code path as send route; empty → `validation_errors`. |
| **Send permission** | `assertCommunicationsSendAllowed` — **must** match `POST /api/admin/communications/send`. |
| **No autonomous send** | Apply route only runs in response to explicit authenticated POST with signed session; no background apply from proposal id alone (no durable id in V1 A). |
| **Content warnings** | Non-blocking warnings (tone, length, missing template variables) vs blocking `validation_errors`. |
| **Follow-up (optional)** | If `apply_intent.kind === "set_opportunity_follow_up"`: `entity_type === "opportunities"`; ISO parseable; not in past (org-local policy); user has opportunity write permission. |
| **scheduled_for_iso** | If non-null in V1 **without** scheduling product: **reject** at validation (or strip in Card 0 decision). |

**Output:** Either HTTP 400 with `{ validation_errors: string[] }` or pass-through to canonical send.

---

## 5. Apply model (no AI → DB)

| Apply intent | Action | API / path |
|--------------|--------|------------|
| **`send_communication_now`** | Enqueue **one** outbound canonical message | **`executeCommunicationsSend`** (shared with **`POST /api/admin/communications/send`**) — **`enqueueCanonicalOutboundMessage`**. Task Assist **`POST /api/admin/ai/task-assist/apply`** is the dedicated validate-then-send route; it does **not** call legacy **`public.messages`** / **`messages_outbox`**. |
| **`set_opportunity_follow_up`** | Patch opportunity metadata date | **`PATCH /api/admin/opportunities/:id`** (or the single admin mutation helper) with **only** allowed keys after `normalizeOpportunityWritePayload` — **no** raw Supabase from model. |
| **`none`** | No-op | Telemetry / UI close only. |

**Forbidden:** Any `insert` into `communication_messages` from Task Assist routes **without** going through `enqueueCanonicalOutboundMessage` + permission checks; any `messages` / `messages_outbox` writes for Task Assist.

---

## 6. UI surface (V1 recommendation)

### 6.1 Primary placement: **record drawer**

- **Why:** `CommunicationsDrawerSection` and prefetch already live in **`AdminEntityDrawer`**; send path is **`drawer_composer`** metadata today (`docs/product/communications.md`).
- **Pattern:** Add a **Task Assist** collapsible region **above** or **beside** the existing composer (not replacing it until stable): shows `context_summary`, warnings, missing inputs, editable `draft_body` / `draft_subject`, recipient picker bound to `recipient_candidates` / `selected_recipient`.

### 6.2 Proposal review + edit-before-send

1. **Generate proposal** → render `TaskAssistSuggestionV1` (or subset) in panel.
2. **Edit** → local React state only (ephemeral).
3. **Warnings / missing inputs** → banner + inline list; block Apply if `validation_errors.length > 0` in **client preview** but **always** re-validate on server.
4. **Apply** → single primary button “Send” (or “Save follow-up” for optional branch) → calls apply route which internally calls **communications send** or **opportunity PATCH**.

### 6.3 Fallback if drawer integration is blocked

- **AdminV2 command / assistant panel** (`AICommandSurfaceShell` pattern): use for **proposal preview + edit** only; **Apply** still hits the same server routes. **Less ideal** for recipient context — second choice.

---

## 7. Safety rules (explicit)

1. **No bulk sends:** At most **one** `selected_recipient`; no CC lists in V1; no CSV import.
2. **No autonomous scheduled send:** `scheduled_for_iso` null in V1 default; no cron applying proposals.
3. **No hidden recipients:** UI must show `to` / person label; server logs must not store full child PII beyond existing comms patterns.
4. **No workflow config:** Reject request bodies containing `workflow_id`, `conditions`, `actions`, `event_type` for automation, etc.
5. **No legacy message stack for apply:** Task Assist code paths must not call `workflowRun` message actions or write `public.messages` for this feature.
6. **No provider bypass:** Use bindings + `enqueueCanonicalOutboundMessage` only.
7. **No child/family over-disclosure:** Grounding redaction policy for any LLM path (`redactObjectForAi`); deterministic drafts avoid sensitive identifiers in templates where possible.
8. **Human-visible review:** Operator must see final channel, recipient, and full body before Apply; no “send in background.”

---

## 8. Implementation cards (Cursor execution order)

**Rule:** Cards are **not** “ready to build” until Card 0 is checked in by product + eng.

| Card | Name | Scope |
|------|------|--------|
| **0** | **Design finalization + schema decision** | Lock V1 scope: **ephemeral proposals (Option A)**; **no migrations** for core; **defer scheduled send**; **reminder = opportunities PATCH only** yes/no. Update `docs/product/communications.md` **Known gaps** if Task Assist is referenced. Exit: written decision in PR + this file checkbox. |
| **1** | **Types + validators** | Add `TaskAssistSuggestionV1` + parse/validate pure functions (`web/lib/agent/taskAssist/` suggested); unit tests for invariants (channel/task_type alignment, single recipient). |
| **2** | **Proposal route (stub / deterministic)** | `POST /api/admin/ai/task-assist/propose` (name TBD): gates = `getAdminContextCached` + `getAdminAccessContextCached` + org `ai_policy` extension (`task_assist_draft` feature key — **design** mirror enrich route); **deterministic** draft from templates first (no LLM required to ship). |
| **3** | **Context grounding service** | Read-only assembler: entity row + `GET` activity slice + `drawer-recipients` data — **no** new DB tables; reuse existing admin client queries; respect access scope. |
| **4** | **Apply route** | `POST /api/admin/ai/task-assist/apply` (or under `/api/admin/communications/task-assist/apply`): validates §4, then **delegates** to shared `send` handler or internal `fetch` to self — **prefer** extracting shared function from `communications/send/route.ts` to avoid drift. **No** migration. |
| **5** | **UI — proposal panel** | **`TaskAssistV1OpportunityPanel`** in **`AdminEntityDrawer`** (communications tab + opportunity overview comms block). Gated by **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`** (`web/lib/agent/taskAssist/taskAssistV1UiGate.ts`). |
| **6** | **Tests** | Route + validation tests under **`web/tests/agent/taskAssist/`**; legacy-stack guard (no `.from('messages')` / `messages_outbox` in Task Assist sources); UI gate + panel source contracts. |
| **7** | **Docs + anti-drift** | This file + cross-links in **`ai_agents_v1.md`**, **`docs/product/bos-foundation.md`**, **`docs/product/communications.md`**. |

**Shipped HTTP routes**

| Method | Path | Role |
|--------|------|------|
| **POST** | **`/api/admin/ai/task-assist/propose`** | Build **`TaskAssistSuggestionV1`** (deterministic stub path today; org policy **`task_assist_draft`** + same portal gates as enrichment). |
| **POST** | **`/api/admin/ai/task-assist/apply`** | Operator-approved send: validates merged payload, **`assertCommunicationsSendAllowed`**, then **`executeCommunicationsSend`**. |

**Feature gates**

| Gate | Purpose |
|------|---------|
| **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`** | Client: show Task Assist panel in the opportunity drawer (`true` / `1`). |
| Org **`metadata.ai_policy.allowed_features`** includes **`task_assist_draft`** | Server: propose (and apply is admin-authenticated; send also requires **`communications.send`** / admin-ops bypass per **`assertCommunicationsSendAllowed`**). |
| Stub path | **`AI_ENRICHMENT_STUB_ENABLED`** when policy provider is **`stub`** (mirrors enrichment stub gating). |
| Portal / OpenAI branch | Same pattern as **`POST /api/admin/ai/enrich-attention-suggestion`** where applicable (`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`, **`ai.enrichment.use`**, etc.). |

**V1 limitations (do not drift)**

- **Entities:** **`opportunities` only** (no **`jobs`** / other anchors in Task Assist routes).
- **Channels:** **SMS and email only** (no **`in_app`** / composer-only drafts in this agent path).
- **Recipients:** **Single** **`selected_recipient`** per apply.
- **No** scheduled send (`scheduled_for_iso` must be null on apply).
- **No** reminders / follow-up apply intents in validators.
- **No** workflow configuration keys on propose/apply bodies.
- **No** durable proposal storage (ephemeral JSON in UI + re-validation on apply).
- **No** bulk send.

**Known follow-ups (explicitly not V1)**

- Live LLM proposal path (OpenAI policy branch may still be deterministic-only in route).
- Durable proposals + audit rows.
- Scheduled send (schema + worker contract).
- Reminders / **`metadata.next_follow_up_at`**-style apply.
- **`jobs`** and other entity drawers.
- Stronger proposal signing / tamper resistance if product requires persistence.

### 8.1 Migration card (explicitly **not** in default V1 chain)

| Card | Name | When |
|------|------|------|
| **M1** | **(Deferred)** Scheduling + schema | Only if Card 0 approves V1b: add `scheduled_send_at` or equivalent on `communication_messages` **or** side table + worker dequeue contract + docs in same PR. |

---

## 9. Risks and follow-ups

| Risk | Mitigation |
|------|------------|
| **Apply route drifts from send route** | Extract **`executeCommunicationsSend`** shared module used by both. |
| **LLM prompt leakage** | Reuse enrichment redaction + policy gates; default off. |
| **Reminder PATCH bypasses invariants** | Use **`normalizeOpportunityWritePayload`** only; mirror existing admin PATCH tests. |
| **Product expects scheduling** | Communicate **V1.1**; do not half-ship `metadata` hacks on `communication_messages` without worker support. |

---

## 10. References

- `docs/sprints/archive/05_2026/task_assist_v1_step0_audit.md`
- `docs/sprints/archive/05_2026/ai_agents_v1.md`
- `docs/sprints/archive/05_2026/ai_agents_v1_step1_design.md` (four-layer pattern; Agent 2 sketch superseded by §3 here)
- `docs/product/communications.md`
- `docs/archive/2026-06-superseded-system/actions-and-workflows.md` (boundary: Task Assist does **not** create workflows)
- `docs/execution/operating-doctrine.md`
- `docs/product/bos-foundation.md`
- `web/app/api/admin/communications/send/route.ts`
- **`web/lib/communications/executeCommunicationsSend.ts`**
- `web/lib/communications/canonicalOutboundEnqueue.ts`

---

## Card 0 exit checklist (copy into PR)

- [x] **Card 0** — Locked 2026-05-14 (this doc §Card 0).
- [x] Scheduled send = **deferred** (validators reject `scheduled_for_iso`; M1 only if Card 0 amended).
- [x] Reminder / follow-up = **deferred** (validators reject follow-up `task_type` / `apply_intent`; opportunity PATCH may land in V1.1).
- [x] No `public.messages` / `messages_outbox` **code path** for Task Assist propose/apply (canonical **`executeCommunicationsSend`** only; comments in routes may name legacy tables for clarity).
- [x] Shared validation / send stack between communications send and Task Assist apply (**`executeCommunicationsSend`**).
