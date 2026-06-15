% Alloy Communications V2 — Final QA Report (PKG-19)
% Gated tree: communications-v2 @ 172e8bc0

# Alloy Communications V2 — Final QA Report (PKG-19)

**Tree under QA:** `communications-v2` @ `172e8bc0` (Integration Gate accepted: comms suites PASS — 28 files / 153 tests; module import verification PASS — 4647 files; `npm run build` PASS).

**Scope of this QA:** the integrated, **flag-gated** Communications V2 tree. Every surface is dark behind a `comms_v2_*` flag (all default OFF) — with all flags off, existing platform behavior is unchanged. This report QAs what exists, maps it to the approved QA exit criteria, and surfaces remaining work **as QA findings, not new architecture**.

**What "PASS" means here.** This program was built and verified under Model B with a substitute gate (pure-logic harnesses + structural contract tests) plus your real `vitest`/`build` at named gates. There is **no live-runtime/browser/provider QA** in this environment. So each criterion is scored:

- **✅ Verified** — deterministic logic + contract tests prove correctness; nothing further needed to trust the unit.
- **🟡 Built / needs live verification** — code exists, is flag-gated, compiles, and is structurally verified; end-to-end behavior (DB / provider / browser render) must be exercised in a running environment with credentials before enabling the flag.
- **⛔ Deferred (documented follow-on)** — intentionally not wired in V1; a known activation item, not a defect.

---

# 1. Tree inventory (what is in scope)

- **Schema (additive, RLS-scoped):** 4 migrations — conversation core (assignment/SLA/attention + audit), delivery events + receipts, recipients + per-person preferences + audit, templates + announcements.
- **Pure logic (22 modules + 6 provider files):** provider abstraction (Resend/Twilio; Google/MS deferred), inbound normalization, consent gate + enforcement, SMS keywords, preference mutations, communication health, assignment/SLA, command-center view-model, composer model, template render, announcement model, deliverability, BOS intelligence + rail cards.
- **Dark routes (6):** health, deliverability, conversations/[id]/assign, templates (+[id]), announcements.
- **Dark UI (8):** Command Center shell + page, composer, record tab, template builder, announcement builder, deliverability dashboard, BOS rail intelligence.
- **Send-path consent enforcement:** wired into `executeCommunicationsSend`, gated behind `comms_v2_compliance` (no-op when off).
- **Flags (11):** command_center, record_tab, composer, preferences, compliance, assignment, sla, templates, announcements, deliverability, bos.

---

# 2. QA results by exit-criteria area

| Area | Criterion | Implementation in tree | Status | Finding |
|---|---|---|---|---|
| **Email** | Send | Canonical `executeCommunicationsSend` + Resend adapter; composer wired (dark) | 🟡 | Live send needs Resend creds + runtime. |
| | Receive | `inboundNormalization` (pure) | ⛔ | Inbound-email **route + receiving provider not wired** (no inbound-email mechanism exists in the repo). |
| | Reply | `selectOutboundToMarkReplied` (pure) ✅ | 🟡 | Live reply→`replied_at` depends on the inbound route above. |
| | Read receipt | `communication_delivery_events` + `deliveryReceipts` adapter ✅ | 🟡 | Webhook→`delivery_events`→message columns **ingestion not wired** (schema + adapter only). |
| | Bounce handling | delivery-events + `aggregateDeliverability` ✅ | 🟡 | Same ingestion-wiring dependency. |
| **SMS** | Send | Twilio adapter + canonical path | 🟡 | Needs Twilio + 10DLC creds + runtime. |
| | Receive | Python inbound SMS (pre-existing) + normalization | 🟡 | Live receive path exists; normalization not yet joined to it. |
| | STOP / START / HELP | `smsKeywords` + `preferenceMutations` (pure) ✅ | ⛔ | Keyword→preference **wiring into the inbound SMS handler not done**. |
| **Communications Tab** | Lead / Person / Child | `RecordCommunicationsTab` mounted via flag-gated wrapper in `CommunicationsDrawerSection` (all 3 drawers); `recordTabModel` ✅ | 🟡 | Mounts dark; **live data wiring** into the tab is a follow-on (renders empty until fed). Legacy preserved when off. |
| **Command Center** | Assignment | `assignmentSla` ✅ + dark assign route + audit | 🟡 | Route needs runtime. |
| | SLA | `computeSlaState` ✅ | 🟡 | Live timers/surfacing need data. |
| | Filters / Search | `commandCenterViewModel` (group/metrics/filters) ✅ | ⛔ | **No conversations-list API** built — queue/workspace render from real data is a follow-on. |
| | Layout / shell | 3-column shell in AdminV2 shell; real `CommandRailBosMount` host | 🟡 | Renders dark; visual QA needs a browser. |
| **Templates** | Preview / Variables / Rendering | `templateRender` ✅ (resolve, graceful missing, no broken tokens, approval); builder + CRUD routes | 🟡 | Builder/route need runtime; rendering logic fully verified. |
| **Announcements** | Targeting / Delivery / Tracking | `announcementModel` ✅ (audience, plan, tracking); builder + create-draft route | ⛔ | **Delivery execution** (DB audience resolution + per-recipient consent-gated enqueue) deferred. |
| **Compliance** | Opt-in / Opt-out | `consentGate` ✅ + `consentEnforcement` wired into send path (flag-gated) | 🟡 | Live enforcement needs runtime + preference data. |
| | Audit trail | `communication_preference_events` + builders ✅ | 🟡 | Schema + builders verified; live write path via UI/keyword pending. |
| | Lifecycle classification | `evaluateConsent` (Lead→Marketing, Enrolled→Transactional, safer default, override) ✅ | ✅ | Fully verified; lifecycle source resolution at send time is the runtime piece. |
| **BOS** | Summary | `buildConversationSignals` ✅ (deterministic) | 🟡 | LLM summary reuses existing BOS infra (not newly wired). |
| | Draft response | reuses existing `bos/communication` drafting | ⛔ | Rail draft action wiring deferred. |
| | Follow-up recommendations | `recommendFollowUp` + `buildCommsRailCards` ✅ | ⛔ | **Rail registrar hookup** (cards into the live rail) deferred. |
| **Performance** | No blank shells / single reveal | Dark surfaces; no eager mounts | 🟡 | Needs live render to confirm. |
| | Drawer doctrine maintained | Legacy section preserved when flag off ✅ | ✅ | Verified structurally (wrapper). |
| | BOS rail maintained | Real `CommandRailBosMount` host used; no embedded panel ✅ | ✅ | Verified (doctrine guardrail green). |

---

# 3. Final QA checklist

- [x] Schema is additive, RLS-scoped, no destructive DDL (4 migrations; contract tests assert additive-only).
- [x] All new surfaces are flag-gated; flags default OFF; off = no behavior change (verified: send path byte-for-byte unchanged with `comms_v2_compliance` off).
- [x] No provider-specific branching escapes the adapter layer (leakage guardrail green).
- [x] No auto-send anywhere; BOS review-first (doctrine guardrail green; composer sends on click only).
- [x] No embedded BOS panel in content; real rail host used (doctrine guardrail green).
- [x] Drawer doctrine preserved (legacy Communications tab intact when flag off).
- [x] Provider abstraction supports future Google/Microsoft with no schema/UX change (declared, deferred).
- [x] `vitest` (comms suites) + `npm run build` PASS at `172e8bc0`.
- [ ] Live email send/receive/reply/receipt/bounce (needs Resend creds + ingestion wiring).
- [ ] Live SMS send/receive/STOP/START/HELP (needs Twilio + 10DLC + keyword wiring).
- [ ] Command Center renders real conversations (needs list API + data wiring).
- [ ] Record tab renders real data in the drawers.
- [ ] Announcement delivery executes (audience + consent-gated enqueue).
- [ ] BOS cards appear in the live rail (registrar hookup).
- [ ] Consent-field → `communication_preferences` backfill.
- [ ] Browser pass: no blank shells / single reveal / visual parity with mocks.

---

# 4. Known deferred items (V1 activation backlog)

These are documented follow-ons surfaced during the build, **not** new architecture. They are what stands between "code-complete + dark" and "flags-on operational."

1. **Inbound email** — route + a chosen receiving provider (none exists in the repo today; an architecture decision for whoever owns provider infra).
2. **Delivery-event ingestion** — extend the Resend/Twilio webhooks to write `communication_delivery_events` → message receipt columns (open/click/reply/bounce).
3. **SMS keyword wiring** — connect `smsKeywords`/`preferenceMutations` to the Python inbound SMS handler.
4. **Command Center data** — conversations-list API + live queue/workspace rendering.
5. **Record tab data** — feed live threads/messages into `RecordCommunicationsTab`.
6. **Announcement delivery** — DB audience resolution + per-recipient consent-gated enqueue.
7. **BOS rail hookup** — register `buildCommsRailCards` output via `DrawerCommandRailActionsRegistrar`; wire LLM summary/draft to existing BOS infra.
8. **Consent backfill** — migrate the existing per-person consent field into `communication_preferences`.
9. **External prerequisites** (not engineering) — Twilio account + messaging service + 10DLC; SPF/DKIM/DMARC; legal sign-off on consent posture; test sender identities / numbers / inbound routing. (Google/Microsoft remain V1.5, off the critical path.)
10. **Out-of-scope note:** the repo-wide `tests/adminV2` red (PersonsDrawerVmRuntime, bos/recommendations, etc.) is **pre-existing baseline drift**, proven unrelated to this program; it belongs to whoever owns that baseline.

---

# 5. Go / No-Go recommendation

**GO — to merge the dark, flag-gated tree.** It is additive, behavior-preserving with all flags off, and green on the comms suites + build. Merging ships **nothing live** and lands the entire V1 foundation (schema, services, routes, UI, BOS intelligence) safely behind flags.

**NO-GO — to enable the flags for a customer-facing launch.** V1 is **code-complete and dark, not launch-ready**: the activation items in §4 (data/provider/keyword/rail wiring) and live provider QA + external prerequisites are required before any `comms_v2_*` flag is turned on in production.

**Recommended path:**
1. Merge `communications-v2` @ `172e8bc0` (dark) to the comms baseline / staging.
2. Open a scoped **"V1 Activation"** phase for §4 items 1–8, each flag-gated, each with live-runtime QA — same Model B + gate cadence.
3. Run the external prerequisites (§4.9) in parallel (non-blocking for activation engineering).
4. Flip flags per-surface only after that surface's live QA passes.

Communications V2 (build phase) is **complete**. The remaining work is **activation + live QA**, clearly bounded above.
