---
owner: engineering
status: handoff
last_reviewed: 2026-07-24
supersedes: []
---

# Handoff → Firefly Operational Acceptance

Phase 5 is closed. The platform is trustworthy and configuration‑driven: the transaction contract,
stage integrity, and referential integrity are complete and live‑certified. The next sprint is
**acceptance, not construction** — prove Firefly can run its real lead→enrollment journey on the
certified platform, and close the tenant‑configuration gaps.

## What you inherit (done, certified)
- One transaction contract every capability runs through — commit or provably nothing changed.
- Configured Business Process stages are the only authoritative stage vocabulary; the runtime
  cannot expose, write, navigate, report, or display a stage that isn't configured (live‑certified,
  A1–A4 + B). Qualification leakage is closed.
- What's Next, hosts, outcomes, transitions, and requirement ownership derive from configuration.
- Evidence: `phase-5-engineering-closeout.md`, `configured-stage-referential-integrity-fix.md`,
  and `docs/sprints/active/assets/configured-stage-integrity/`.

## Start here (highest value first)
1. **Enable comms certification.** The blocker is data, not code: the QA fixture (Wenc) holds a
   real email/phone, so Message / Send Form / tour transitions were never live‑dispatched. Point
   the QA identity at an operator‑owned recipient (or confirm the tenant's comms bindings are
   disabled in dev), then certify the 7 remaining capabilities live.
2. **Apply the Firefly remediation migration** (`20260724000000_firefly_remediate_dangling_stage_references.sql`)
   in a controlled window, and reset the Wenc QA artifacts (attempt_count 3, one demo tour) via a
   service‑role cleanup. Both are packaged; neither is a platform blocker (the dangling refs are
   inert).
3. **Close the Firefly operating‑config gaps** (all tenant configuration — do not "fix" in code):
   `left_message` never escalates; several tour outcomes have no rule; booking a tour advances
   nothing (author the `{tour_booking, scheduled}` rule if Product wants it). Detail in
   `firefly-config-certification-report.md`.

## Guardrails
- Do **not** author new stage transitions or Business Process behaviour without Product sign‑off —
  that is a configuration decision, made in the builder, not code.
- The publish guard now rejects dangling stage references (422). When correcting tenant config,
  land changes in **both** the tenant metadata and the code default where a default is involved —
  published plans shadow code defaults.
- Comms send toward a real recipient is prohibited without an operator‑owned address.

## Environment notes that will bite you
- Managed slot 1 caps at 3 concurrent dev servers; identify a genuinely idle sibling (0 requests
  over ~40 s) before reclaiming, and restore it after. The machine thrashes under 3 servers + a
  browser — API‑only Playwright checks are stable; UI checks may need one sibling paused for
  headroom.
- QA auth is a Supabase ~1 h session. Refresh needs a **manual operator** `alloy-agent-login 1`;
  a failed login deletes the storage‑state. Run authenticated live specs promptly after sign‑in.
- Branch is 96 behind `origin/staging`; rebase before promotion and re‑validate.

## First command
```bash
cd web && npx vitest run tests/lifecycle/configuredStageReferentialIntegrity.test.ts \
  tests/lifecycle/qualificationVisibility.test.ts tests/platform/platformTransaction.test.ts
```

The platform is ready. The remaining work is proving the tenant operates on it, and correcting the
tenant's own configuration — acceptance, not architecture.
