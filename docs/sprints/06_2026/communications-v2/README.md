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
