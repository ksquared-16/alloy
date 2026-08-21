# Phase 3 — Automatic resource-grant resume

**Status:** Gateway-owned continuation after Governor grant. Stop before Phase 4 quiescence.
**Sprint:** `vacilando-gateway-v2` slot 5

## Trigger

```text
Resource Request → GRANTED
  → ensure continuation (one per grant episode)
  → deliver to the same Development Lane
  → on confirmed delivery, run WAITING_RESOURCE → registry.resume_state
```

`browser_certification.resume_state = VALIDATING`.

Grant itself does **not** change run state.

## Continuation

Durable on the Resource Request (`continuation_id`, `kind: resource_granted`, `delivery_state`, `grant_episode`).

Exactly-once: same `request_id` + `granted_at` → same continuation. `DELIVERED` / `DELIVERING` do not resend. Ambiguous `DELIVERING` after crash is skipped (duplicate is worse than waiting).

Not an operator instruction. `YOUR LAST INSTRUCTION` is unchanged. Send uses `sendLaneInstruction` with `actor: governor` and a server-resolved pane.

## Browser-cert lifecycle

Two layers, not duplicates:

1. **Governor grant** holds `alloy-compute browser-certification` as `vac-erun_*` so the next Execution Run may proceed.
2. **Script wrapper** `withBrowserCertLease` still acquire→run→finally release around the actual Chromium command.

Claude should re-acquire the **same holder** (`ALLOY_BROWSER_CERT_HOLDER=vac-erun_*`) so the wrapper does not fight the Governor. Wrapper `finally` may release the permit when the cert command exits. Governor also releases on:

- `VALIDATING` → `EXECUTING` (cert step finished, more work remains)
- `COMPLETE` / `FAILED`
- explicit `resource_event=released`
- failed resume to a dead target

Do not infer release from TUI silence.

## Host toolkit split

Do **not** promote this worktree globally. Reporting seams:

1. `POST /api/lanes/:id/run/report` (Gateway; preferred for active Claude lanes)
2. Worktree-local `vac run-status` if PATH is this worktree
3. Later staging promotion of the toolkit

Recommended: Gateway report API now; promote toolkit through normal staging later.
