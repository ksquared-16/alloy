% Alloy Communications V2 — V1 Activation Phase Plan
% Turn the dark build (172e8bc0) into a locally testable UI

# Alloy Communications V2 — V1 Activation Phase

**Baseline:** `communications-v2` @ `172e8bc0` (build phase complete, dark, green).
**Goal:** turn the flag-gated build into a **locally testable UI experience**, one surface at a time.

**Rules (carried from the program):** no architecture change; no scope broadening; everything stays flag-gated; each surface is enabled, wired to live data, and shipped with a UI QA sheet; same Model B + bundle/gate cadence (build in an isolated clone → substitute-verify → bundle → you run the local gate).

**What activation is NOT:** no new tables, no new providers, no auto-send, no Google/Microsoft (V1.5). It only *mounts* the existing dark components into routes and *feeds* them live data via the existing canonical `communication_*` path.

---

# 1. Local env & flag matrix (ACT-0 deliverable)

All flags are `NEXT_PUBLIC_*` booleans (truthy = `1`/`true`/`yes`), default **off**. Put them in `web/.env.local`. Enable **only** the row(s) for the package you are testing; everything else stays off so unrelated surfaces remain dark.

| Surface | Env flag | Enabled in package |
|---|---|---|
| Command Center | `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER` | ACT-1 |
| Assignment | `NEXT_PUBLIC_COMMS_V2_ASSIGNMENT` | ACT-1 |
| SLA | `NEXT_PUBLIC_COMMS_V2_SLA` | ACT-1 |
| Record tab | `NEXT_PUBLIC_COMMS_V2_RECORD_TAB` | ACT-2 |
| Composer | `NEXT_PUBLIC_COMMS_V2_COMPOSER` | ACT-3 |
| Compliance | `NEXT_PUBLIC_COMMS_V2_COMPLIANCE` | ACT-3 |
| Preferences | `NEXT_PUBLIC_COMMS_V2_PREFERENCES` | ACT-3 |
| Templates | `NEXT_PUBLIC_COMMS_V2_TEMPLATES` | ACT-4 |
| Announcements | `NEXT_PUBLIC_COMMS_V2_ANNOUNCEMENTS` | ACT-5 |
| BOS | `NEXT_PUBLIC_COMMS_V2_BOS` | ACT-6 |
| Deliverability | `NEXT_PUBLIC_COMMS_V2_DELIVERABILITY` | ACT-7 |

**Baseline check (do this first):** `cd web && npm run dev` with **no** comms flags set → confirm the existing app is unchanged and `/adminV2/communications` returns 404 (dark). That is the "flags off = no behavior change" guarantee.

**Seed data:** ACT-0 also delivers a dev seed (idempotent) that inserts a handful of `communication_threads` + `communication_messages` (mixed channels/directions, some opened/replied), a couple `communication_preferences` rows (one opted-out), and 1–2 `communication_templates`, so every surface has something to render locally without providers.

---

# 2. Dependency-ordered activation packages

Each package: **objective · wires · env flags · routes to visit · what you should see · what is still intentionally not ready.** Build order respects dependencies (ACT-0 → ACT-1 → …).

## ACT-0 — Local environment & flag matrix
- **Objective:** dev environment + flag matrix + seed data so surfaces can be lit one-by-one.
- **Wires:** `web/.env.local` template; idempotent dev seed script (`scripts/dev/seedCommsV2Demo.ts`); README of the matrix above.
- **Flags:** none on (this is the off-baseline).
- **Visit:** `/adminV2/...` as normal.
- **Expect:** app unchanged; `/adminV2/communications` → 404.
- **Not ready:** everything (intentionally).

## ACT-1 — Command Center live data
- **Objective:** the Command Center renders real conversations, queues, metrics, and assignment from seeded data.
- **Wires:** new `GET /api/admin/communications/conversations` (list, org+location scoped, returns the `ConversationSummary` shape the existing `commandCenterViewModel` already consumes — reuses `inboxThreadsService` query style); `CommandCenterShell` populated via `groupConversationsByQueue` / `computeCommandCenterMetrics` / `applyQueueFilters`; workspace timeline via the existing messages API; claim/assign buttons call the existing `POST /conversations/[id]/assign`.
- **Flags:** `COMMAND_CENTER=1`, `ASSIGNMENT=1`, `SLA=1`.
- **Visit:** `/adminV2/communications`.
- **Expect:** three-column shell inside the AdminV2 chrome; left queue grouped by operational state (Awaiting Parent Reply, Needs Follow-Up, …) with counts; metrics strip (New / Requires Response / SLA At Risk / Messages Sent / Response Rate); filter by channel/owner/location/search; click a conversation → workspace shows its timeline + family header; **Claim / Assign** updates the row and writes an audit event.
- **Not ready:** composer send (ACT-3), BOS rail cards (ACT-6), real provider delivery (ACT-7).

## ACT-2 — Drawer Communications tab live mount/data
- **Objective:** the dark `RecordCommunicationsTab` renders real threads/messages/health/consent in the Lead/Person/Child drawers.
- **Wires:** feed the drawer's existing fetched threads/messages (and unread/consent) into `RecordCommunicationsTab` via `buildRecordCommunicationsModel`; pass entity context. (The flag-gated wrapper from PKG-18B already chooses tab vs legacy.)
- **Flags:** `RECORD_TAB=1`.
- **Visit:** open a Lead, a Person, and a Child drawer → **Communications** tab.
- **Expect:** chronological timeline (messages + internal notes), last-contact / unread / consent header, quick-reply slot. With `RECORD_TAB` **off** → the unchanged legacy section.
- **Not ready:** quick-reply send (ACT-3); receipts beyond what's seeded (ACT-7).

## ACT-3 — Composer live send QA path
- **Objective:** compose + send through the canonical path from the record tab and Command Center workspace, with consent enforcement observable.
- **Wires:** mount `ComposerV2` in the record-tab quick reply and the Command Center workspace with a `sendContext` (entity + recipient person); the click-only send POSTs to the existing `/api/admin/communications/send`; turning on `COMPLIANCE` activates the already-wired `enforceConsentForSend` guard.
- **Flags:** `COMPOSER=1`, `COMPLIANCE=1`, `PREFERENCES=1`.
- **Visit:** record tab quick reply / Command Center workspace.
- **Expect:** channel toggle (SMS disabled without binding/phone), validation, desktop/mobile preview, **Send** on click. With `COMPLIANCE=1` and the seeded opted-out recipient → send is **blocked** (`consent_blocked`, 403); a transactional recipient → allowed (no provider needed to see the gate decision).
- **Not ready:** actual email/SMS delivery (ACT-7 — no provider yet); template insertion (ACT-4).

## ACT-4 — Template CRUD / approval
- **Objective:** create, version, preview, and approve templates locally.
- **Wires:** mount `TemplateBuilder` + a simple list at `/adminV2/communications/templates`, wired to the existing `GET/POST /communications/templates` and `PATCH /templates/[id]`; optional "insert template" into the composer (variable render via `templateRender`).
- **Flags:** `TEMPLATES=1`.
- **Visit:** `/adminV2/communications/templates`.
- **Expect:** create a template (channel email/sms, category), see referenced variables, live desktop/mobile preview with sample values; set approval draft→pending→approved; list reflects status; only **approved** templates are sendable where required.
- **Not ready:** template-driven announcement sends (ACT-5).

## ACT-5 — Announcement draft / send / classification
- **Objective:** build an announcement, target an audience, classify it, and execute a (consent-gated) delivery plan.
- **Wires:** mount `AnnouncementBuilder` at `/adminV2/communications/announcements`, wired to `POST /communications/announcements` (draft) + a new `POST /announcements/[id]/send` that resolves audience (`resolveAudience` against a DB candidate query), applies classification + the consent gate per recipient (`planAnnouncementDeliveries`), and writes `announcement_deliveries` rows. **No provider dispatch** in this package — it plans + records deliveries only.
- **Flags:** `ANNOUNCEMENTS=1`, `COMPLIANCE=1`.
- **Visit:** `/adminV2/communications/announcements`.
- **Expect:** create a draft, pick targeting (audience count updates), choose classification (emergency/marketing); **Send** → `announcement_deliveries` rows created for permitted recipients, opted-out skipped, classification recorded; tracking counts show queued.
- **Not ready:** actual provider dispatch of the planned deliveries (ACT-7).

## ACT-6 — BOS rail card hookup
- **Objective:** the deterministic communication intelligence appears in the existing BOS command rail when viewing a conversation.
- **Wires:** register `buildCommsRailCards(...)` output through the existing `DrawerCommandRailActionsRegistrar` so summary/risk/follow-up/likelihood/missing-info cards render in the rail; review-first; no auto-send.
- **Flags:** `BOS=1` (with `COMMAND_CENTER=1`).
- **Visit:** Command Center workspace (or a drawer with the rail) on a seeded conversation.
- **Expect:** rail cards — Conversation summary, Communication risk (if flagged), Suggested follow-up, Response likelihood, Missing information — in the BOS rail, not embedded in content.
- **Not ready:** LLM-authored summary/draft (reuses existing BOS infra; out of activation scope — review-first only).

## ACT-7 — Provider credentials + delivery-event ingestion
- **Objective:** make send/receive/receipts real with Resend + Twilio; light up the deliverability dashboard.
- **Wires:** configure `communication_provider_bindings` (Resend email, Twilio SMS); extend the existing `/api/webhooks/resend` + `/api/webhooks/twilio/sms-status` handlers to write `communication_delivery_events` (and advance `opened_at/clicked_at/replied_at`) using the PKG-06 adapter `mapStatusEvent`; wire SMS STOP/START/HELP (`smsKeywords` → `preferenceMutations`) into the inbound SMS handler; mount `DeliverabilityDashboard` at `/adminV2/communications/deliverability`.
- **Flags:** `DELIVERABILITY=1` (+ the surface flags already on).
- **Visit:** send from the composer; `/adminV2/communications/deliverability`.
- **Expect:** real email (Resend) / SMS (Twilio) send; delivered/opened/replied receipts flow back; STOP updates preferences and blocks marketing; dashboard shows delivery/bounce/complaint rates + domain (SPF/DKIM/DMARC) + carrier (10DLC) status.
- **Not ready:** inbound **email** (needs a chosen receiving provider — an infra decision, not in this plan); Google/Microsoft (V1.5).

## ACT-8 — Live UI QA sheets
- **Objective:** one UI QA sheet per activated surface — steps, expected result, pass/fail, tester/date.
- **Wires:** the `Alloy_Comms_V2_UI_QA_Sheets.xlsx` workbook (delivered with this plan) — a tab per surface (Command Center, Record Tab, Composer, Templates, Announcements, BOS Rail, Deliverability) plus a sign-off tab.
- **Flags:** as per the surface under test.
- **Expect:** every row Pass before that surface's flag is considered locally validated.
- **Not ready:** production enablement (flags-on launch) until all sheets pass + ACT-7 providers live + external prerequisites + legal sign-off.

---

# 3. Provider credential checklist (ACT-7)

| Item | Needed for | Owner |
|---|---|---|
| Resend API key + verified sending domain | email send | infra |
| SPF / DKIM / DMARC on the sending domain | email deliverability | infra/DNS |
| `RESEND_WEBHOOK_SECRET` (Svix) | email receipts | infra |
| Twilio account SID + auth token | SMS | infra |
| Twilio Messaging Service + phone number | SMS send/receive | infra |
| 10DLC brand + campaign registration | SMS deliverability | infra/legal |
| `TWILIO_AUTH_TOKEN` for webhook signature | SMS status callbacks | infra |
| Test sender identity + test recipient email | email QA | QA |
| Test mobile numbers (to/from) | SMS QA | QA |
| Legal sign-off on consent posture/defaults | compliance enablement | legal |
| (Deferred) inbound-email receiving provider | inbound email | infra decision |
| (V1.5) Google OAuth / Azure app | Google/MS email | later |

---

# 4. Recommended sequence & gates

ACT-0 → ACT-1 → ACT-2 → ACT-3 → ACT-4 → ACT-5 → ACT-6 → ACT-7 → ACT-8.

Each package is delivered as an isolated-clone bundle + a UI QA sheet; you import, set the package's flags in `.env.local`, run `npm run dev`, walk the QA sheet, and confirm before the next package. ACT-7 (providers) can run in parallel with ACT-1–6 since it only adds delivery realism; the UI surfaces are testable on seed data without it.

# 5. What stays intentionally not ready after activation

- Inbound **email** (no receiving provider chosen).
- **Google Workspace / Microsoft 365** email (V1.5, off the critical path).
- LLM-authored BOS summary/draft autonomy (review-first only; reuses existing infra).
- Any **production** flag-on launch — gated on all UI QA sheets passing, ACT-7 providers live, external prerequisites, and legal sign-off.
- The pre-existing repo-wide `tests/adminV2` baseline drift (out of scope; owned elsewhere).
