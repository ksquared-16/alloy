---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 14 — Testing and Certification Plan

## Layers

| Layer | Focus |
|---|---|
| Unit | Session reducer, evidence transitions, fingerprints, slash catalog filter stub |
| Contract | Adapter → execute payload shape matches `executeCreateLeadCommand` expectations |
| Parser | `parseCreateLeadIntakeText` → draft parity with modal extraction |
| Field-source parity | Location/program/room/schedule (`createLeadBosFieldSourceParity`) |
| Processing integration | D4/E1 boundaries; no identity rows pre-commit |
| Action runtime | Registry, eligibility, execute adapter |
| Permissions | Unauthorized / unplaced |
| Idempotency | Double submit → one case |
| UI state machine | Phase transitions, mode toggle |
| Accessibility | Toggle, focus order, labels without raw keys |
| Playwright/E2E | New smoke: Actions → BOS session → paste → preview (Processing commit may stay integration-tested) |
| Live authenticated | Full path including ambiguous match |
| Screenshots | Ack, conversation summary, form mode, preview, success |
| Performance | Parser bounded; no full-workspace teardown; latest input wins |
| Regression | Existing Create Lead modal path during migration; public form intake Processing path |

## Protected suites (must remain green)

```bash
cd web && npm run test -- \
  tests/adminV2/actions/createLeadAction.test.ts \
  tests/adminV2/actions/createLeadCommandModel.test.ts \
  tests/adminV2/actions/executeCreateLeadCommand.test.ts \
  tests/adminV2/actions/createLeadCommandSurfaceWiring.test.ts \
  tests/lifecycle/createLeadBosFieldSourceParity.test.ts \
  tests/processing/processingIdentityD4CreateLead.test.ts \
  tests/processing/processingIdentityE1Boundaries.test.ts
```

Plus new `tests/bos/commandSession/**`.

## Typecheck

```bash
cd web && npm run typecheck
# when tests change:
cd web && npm run typecheck:tests
```

Serialize typecheck machine-wide per workspace orchestration.

## Certification checklist (V1)

- [ ] WP-01..12 commits local only
- [ ] Scenarios 1–22 evidenced
- [ ] Processing identity guarantees intact
- [ ] No auto-open regression
- [ ] Queue refresh works
- [ ] Actions entry opens BOS (not orphan modal-only)
- [ ] BOS identity doctrine intact (visual spot check)
- [ ] Docs list in `15` prepared for closeout

## Evidence to capture

- Screenshot set under sprint `evidence/` (created during implementation sprint)
- Test log excerpts
- Live notes: org, role, work unit, case id, opportunity id
