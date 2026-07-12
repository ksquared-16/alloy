# Communications V2 — Sprint (canonical source)

**Branch:** `communications-v2` (sole implementation branch for Communications V2; rooted at the approved baseline).
**Status:** Implementation mode. Building package-by-package, one at a time.

## Ownership

- **Kelly / Cursor** — primary Alloy development, unrelated platform work, doctrine + UX approvals, QA sign-off.
- **Cowork** — governance, package tracking, backlog maintenance, QA workbook maintenance, escalation management.
- **Claude** — implementation, tests, migrations, documentation updates, package reports.

## Canonical artifacts (this folder)

| Artifact | File |
|---|---|
| Architecture & Scope Freeze (r2, approved) | `Alloy_Comms_V2_Architecture_Scope_Freeze.docx` |
| Kickoff & Governance Charter | `Alloy_Comms_V2_Kickoff_Governance_Charter.docx` |
| Package Tracker (Cowork-owned) | `Alloy_Comms_V2_Package_Tracker.xlsx` |
| QA Workbook | `Alloy_Comms_V2_QA_Workbook.xlsx` |
| Sprint Backlog | `Alloy_Comms_V2_Sprint_Backlog.xlsx` |
| Program Plan & Doctrine | `Alloy_Comms_V2_Plan.docx` |
| PKG-01 Work Order | `Alloy_Comms_V2_PKG01_Work_Order.docx` |

## Package sequence (V1)

01 Foundation → 02 Conversation core schema → 03 Delivery events + receipts → 04 Recipients + preferences → 05 Templates/announcements schema → 06 Provider abstraction → 07 Inbound pipeline → **08 Preferences & compliance** → 09 Communication Health → **10 Assignment & SLA** → 11 Command Center shell → 12 Composer V2 → 13 Record tab → 14 Templates → 15 Announcements → 16 Deliverability → 17 BOS intelligence → 18 QA hardening.

**V1.5 (in architecture, off the critical path):** 19 Google Workspace adapter · 20 Microsoft 365 adapter.

## Per-package loop

Build → Test → Lint → Build verification → Documentation update → Commit → Package report.

## Escalation (only)

Doctrine conflict · security concern · compliance concern · destructive migration · external credential requirement · approved-UX conflict. Everything else: reasonable repo-grounded decision, documented in the package report.

## Package log

| PKG | Status | Commit | Notes |
|---|---|---|---|
| PKG-01 Foundation (flags, guardrail tests, telemetry) | In review | see branch | Flags default off; doctrine contract tests; telemetry shim. No product/schema/provider change. |
| PKG-02 Conversation core schema (assignment/SLA/attention) | Built — bundle | see branch | Additive migration + constants + schema contract test. No UI/provider/send. |
| PKG-03 Delivery events + read receipts | Built — bundle | see branch | Additive migration (receipt cols + provider-neutral events table) + constants + receipt adapter + contract/unit tests. No UI/send/provider. |
| PKG-04 Recipients + per-person preferences + audit | Built — bundle | see branch | Additive: 3 tables (recipients, preferences, preference_events) + taxonomy classifiers + contract/unit tests. No enforcement/backfill/UI/provider. |
| PKG-05 Templates + announcements schema | Built — bundle | see branch | Additive: 6 tables (templates/versions/snippets, announcements/targets/deliveries) + constants + contract/unit tests. No UI/render/send/provider. |
| PKG-06 Provider abstraction (Resend/Twilio; Google/MS deferred) | Built — bundle | see branch | Additive: ProviderAdapter interface + adapters + registry + leakage contract test. No send-path rewrite. |
| PKG-07 Inbound normalization (pure) | Built — bundle | see branch | Additive: provider-neutral inbound draft builder + reply matcher + tests. Route/persistence deferred. |
| PKG-08 Preferences + compliance engine (pure) | Built — bundle | see branch | Additive: consent gate + STOP/START/HELP + preference/audit builders + tests. Live send wiring staged (flagged). |
| PKG-09 Communication health (service + dark API) | Built — bundle | see branch | Pure health compute + flag-gated GET /health + unit/route-guard tests. Read-only, dark. |
| PKG-10 Assignment + SLA (logic + dark API) | Built — bundle | see branch | Pure assignment transitions + SLA compute + flag-gated assign route + tests. Dark, audited. |
| PKG-11 Command Center shell (dark) | Built — bundle | see branch | Pure queue/metrics/filter view-model + flag-gated three-column shell + tests. Dark; data + rail wiring follow-on. |
| PKG-12 Composer V2 (model + dark UI) | Built — bundle | see branch | Pure composer model (channels/validation/sms-strip/payloads/preview) + dark self-gated component + tests. No live send. |
| PKG-13 Record Communications tab (model + dark UI) | Built — bundle | see branch | Pure record-tab model + dark shared component + scope contract test. Drawer mount deferred. |
| PKG-14 Templates (render engine + dark builder) | Built — bundle | see branch | Pure variable extract/render/missing/approval/preview + dark builder + tests. CRUD API deferred. |
| PKG-15 Announcements (model + dark builder) | Built — bundle | see branch | Pure audience/delivery-plan/tracking + dark operator-first builder + tests. Send/classification deferred. |
| PKG-16 Deliverability (model + dark API/dashboard) | Built — bundle | see branch | Pure metrics/domain/carrier/alerts + dark GET route + dark dashboard + tests. Read-only. |
| PKG-17 BOS communication intelligence (deterministic) | Built — bundle | see branch | Pure signals/missing-info/risk/receipts/likelihood/follow-up + tests. No new UI (rail reuse); review-first. |
| PKG-18A Consent enforcement wiring | Built — bundle | see branch | enforceConsentForSend + guarded call in executeCommunicationsSend behind comms_v2_compliance. No-op when off. |
| PKG-18B/C/D Integration (record-tab mount, CC rail host, dark routes + composer send) | Built — bundle | see branch | Flag-gated; legacy preserved; no auto-send. .tsx validated by real build. |
| PKG-18E BOS rail intelligence (cards + dark component) | Built — bundle | see branch | Pure rail-card builder + dark comms_v2_bos component + tests. Review-first; registrar hookup follow-on. |

## Integration Gate repair (PKG-18 repair pass)

The Integration Gate vitest run was red. Investigation outcome:
- **Bulk (55 files / 112 tests): pre-existing baseline drift, NOT caused by 18B–18E.** Proof: the integration diff `e11e1cce..HEAD` touches none of the failing files (PersonsDrawerVmRuntime, vmDrawerTransitionCoordinator, AdminEntityDrawer, bos/recommendations, etc.), and those files are byte-identical at `e11e1cce` and HEAD — so they fail identically before and after the integration. (e.g. `AdminEntityDrawer.tsx` does not contain `rightColumnModel ??`, which `bosFinalQualityPass` expects, at the unchanged baseline.)
- **3 comms-v2 guardrails tripped by the approved 18C/18D designs (fixed here):** composer-dark (canonical send is allowed on click, no direct enqueue / no auto-send); doctrine no-BOS-in-content (the real `CommandRailBosMount` rail host is allowed; only embedded *panels* are forbidden); doctrine no-auto-send (now scans code with comments stripped, so descriptive "no auto-send" prose no longer false-trips). No product behavior changed; no unrelated test weakened or removed.

## PKG-19 Final QA

Final QA report: `FINAL_QA_REPORT.md`. Outcome: build phase complete (dark, flag-gated, green). GO to merge dark; NO-GO to enable flags until the V1 Activation backlog + live provider QA + external prerequisites are done.

## V1 Activation Phase (draft)

Activation plan: `V1_ACTIVATION_PLAN.md`; UI QA sheets: `Alloy_Comms_V2_UI_QA_Sheets.xlsx`. Dependency-ordered ACT-0 → ACT-8: light each dark surface behind its flag, wire live data on the existing canonical path, validate with the per-surface UI QA sheet. No architecture change. Production flag-on remains gated on all sheets + providers + prerequisites + legal.

## ACT-0A + ACT-1 (activation)

ACT-0A: flag matrix env block, idempotent synthetic dev seed, runbook, smoke tests. ACT-1: dark read-only `GET /communications/conversations` + `CommandCenterShell` wired to live data (queues, metrics, filters, unread, claim/assign, thread timeline). Enable with `COMMAND_CENTER+ASSIGNMENT+SLA`, seed, then open **TopNav → Inbox** (Communications modal → **Inbox** tab). **`/adminV2/communications` is deprecated** — not the primary operator entry. See `ACTIVATION_RUNBOOK_ACT1.md` and **`operator-surface-consolidation.md`** for the consolidated modal IA (Inbox · Templates · Announcements).
