---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 12 — Implementation Work Packages

Execute **serially** WP-01 → WP-12 for V1. WP-13/14 optional stubs after WP-01. Each package is one coherent local commit boundary.

---

## WP-01 — Registry + planning lock

| | |
|---|---|
| **Purpose** | Align `bosProposalSupport` for `create_lead`; ensure planning package is the source of truth. |
| **Preconditions** | On implementation worktree based on current staging. |
| **Changes** | Set `canonicalActionRegistry` create_lead `bosProposalSupport: true` (or derive from `allowedSourceSurfaces` including bos). Add/adjust unit assertion. |
| **Search targets** | `canonicalActionRegistry.ts`, `createLeadAction.ts`, `enrichResolvedActionWithCanonical.ts` |
| **Acceptance** | Both catalogs agree; tests pass. |
| **Tests** | `web/tests/adminV2/actions/actionRegistry.test.ts` (+ new assertion if needed) |
| **Live QA** | n/a |
| **Evidence** | Test output |
| **Commit** | `fix(actions): align create_lead bosProposalSupport across registries` |
| **Do not change** | Execute path, Processing, UI |

---

## WP-02 — Command session core types + reducer

| | |
|---|---|
| **Purpose** | Introduce `BosCommandSession` model and pure transitions. |
| **Preconditions** | WP-01 |
| **Changes** | New `web/lib/bos/commandSession/` — types, `createSession`, `reduceSession`, fingerprint helpers. |
| **Acceptance** | Unit tests cover phase transitions and discard. |
| **Tests** | New `web/tests/bos/commandSession/*.test.ts` |
| **Commit** | `feat(bos): add command session state model` |
| **Do not change** | AICommandSurfaceShell yet |

---

## WP-03 — Session persistence + stale request guards

| | |
|---|---|
| **Purpose** | sessionStorage persist/restore; `requestSeq` for parser responses. |
| **Preconditions** | WP-02 |
| **Changes** | Persist helpers; size caps; clear on discard/complete. |
| **Acceptance** | Reload restores unfinished session in unit/jsdom tests. |
| **Tests** | Persistence tests |
| **Commit** | `feat(bos): persist command sessions in sessionStorage` |
| **Do not change** | Server schemas |

---

## WP-04 — Create Lead adapter (parse → draft → resolution)

| | |
|---|---|
| **Purpose** | Implement `BosCommandAdapter` for create_lead reusing existing parsers/eligibility. |
| **Preconditions** | WP-03 |
| **Changes** | `web/lib/bos/commandSession/adapters/createLeadAdapter.ts` wrapping platform modules. |
| **Acceptance** | Same required blockers as modal for identical inputs; option resolution parity. |
| **Tests** | Adapter tests + reuse `createLeadBosFieldSourceParity` patterns |
| **Live QA** | n/a |
| **Commit** | `feat(bos): create lead command adapter over existing intake` |
| **Do not change** | `ingestCreateLeadThroughProcessing` |

---

## WP-05 — Mode sync (Conversation ↔ Form draft API)

| | |
|---|---|
| **Purpose** | Form setters and conversation applyParse share one draft API. |
| **Preconditions** | WP-04 |
| **Changes** | `applyOperatorFieldEdit`, `applyParseResult`, evidence state transitions. |
| **Acceptance** | Scenarios 10–12 in unit form. |
| **Tests** | Mode sync tests |
| **Commit** | `feat(bos): shared draft edits for conversation and form` |

---

## WP-06 — BOS session host shell (ack + toggle)

| | |
|---|---|
| **Purpose** | Visible host in BOS with Conversation/Form toggle and ack turn. |
| **Preconditions** | WP-05 |
| **Changes** | Components under `web/app/adminV2/components/aiCommandSurface/commandSession/`; mount from shell when session active. |
| **Acceptance** | Opening session shows immediate ack; toggle switches modes. |
| **Tests** | Component tests; presentation still respects BOS identity doctrine |
| **Live QA** | Open via temporary debug or Actions stub |
| **Commit** | `feat(bos): mount command session host in orchestrator` |
| **Do not change** | Runtime reveal gates, Focus Panel ownership |

---

## WP-07 — Conversation gather UX

| | |
|---|---|
| **Purpose** | Paste/type → parse → summary + follow-ups for missing required. |
| **Preconditions** | WP-06 |
| **Changes** | Composer handlers; assistant summary cards; evidence chips. |
| **Acceptance** | Scenarios 1–2, 6 |
| **Tests** | Conversation reducer + parser integration |
| **Commit** | `feat(bos): conversational gather for create lead` |

---

## WP-08 — Form gather UX (embed intake)

| | |
|---|---|
| **Purpose** | Form mode embeds existing intake field/household UI bound to draft. |
| **Preconditions** | WP-06 |
| **Changes** | Extract/bind `CreateLeadOperationalIntake` pieces as needed; avoid forking validation. |
| **Acceptance** | Scenarios 3–5, 10 |
| **Tests** | Form bind tests; household parity |
| **Commit** | `feat(bos): form mode bound to shared create lead draft` |
| **Do not change** | Second field schema |

**Parallel note:** WP-07 and WP-08 may proceed in parallel after WP-06 if two agents share the draft API contract — prefer serial in one agent.

---

## WP-09 — Preview + confirm + execute wiring

| | |
|---|---|
| **Purpose** | Preview fingerprint, confirm, call `executeCreateLeadCommand`. |
| **Preconditions** | WP-07 + WP-08 |
| **Changes** | Use command model preview; CommandSurfaceShell footer patterns; wire execute. |
| **Acceptance** | Scenarios 17–19 (pre-Processing) |
| **Tests** | `executeCreateLeadCommand` integration; stale fingerprint |
| **Commit** | `feat(bos): preview confirm execute for create lead session` |
| **Do not change** | New execute API routes |

---

## WP-10 — Processing review host + success/recovery

| | |
|---|---|
| **Purpose** | Host IdentityReviewPanel; map commit to success; recovery turns. |
| **Preconditions** | WP-09 |
| **Changes** | Phase `processing_review`; success via `buildCreateLeadSuccess`; refresh dispatch. |
| **Acceptance** | Scenarios 7–9, 20–21 |
| **Tests** | Processing boundary tests still green; success UX tests |
| **Live QA** | Full create with ambiguous parent |
| **Commit** | `feat(bos): processing review and success in command session` |
| **Do not change** | Processing commit executor internals |

---

## WP-11 — Placement convergence (Actions → BOS)

| | |
|---|---|
| **Purpose** | Replace modal-primary open with BOS session start. |
| **Preconditions** | WP-10 |
| **Changes** | `applyRegistryResolvedActionClient`, `CreateLeadEventHost`; keep compatibility flag if needed. |
| **Acceptance** | Scenario Actions path; wiring tests updated |
| **Tests** | `createLeadCommandSurfaceWiring.test.ts` updated |
| **Live QA** | Click Create Lead from Work Unit + Workspace |
| **Commit** | `feat(bos): route create lead actions into BOS command session` |
| **Do not change** | Unrelated actions |

---

## WP-12 — V1 certification pass + doc touchpoints

| | |
|---|---|
| **Purpose** | Run certification checklist; fix blockers; draft doctrine updates (land at promote). |
| **Preconditions** | WP-11 |
| **Changes** | Test gaps; Playwright smoke if feasible; update this package’s certification evidence index |
| **Acceptance** | Checklist in `14` green for V1 scenarios |
| **Commit** | `test(bos): certify actionable create lead session` / docs commits as needed |
| **Stop** | Do not start slash menu or briefing product work |

---

## WP-13 — Slash foundation stub (optional)

Types + catalog filter function + tests. Flag off. Commit: `feat(bos): slash catalog stub for registered commands`

## WP-14 — Briefing message stub (optional)

Reserve ambient message kind + CTA factory hook. Commit: `feat(bos): reserve operational briefing message kind`

---

## Parallelization matrix

| Package | Parallel with |
|---|---|
| WP-01..06 | Serial |
| WP-07 ∥ WP-08 | Only if draft API frozen |
| WP-13/14 | After WP-02, parallel to WP-03+ |
| WP-09..12 | Serial |

## Global do-not-change guardrails

- No `POST /api/admin/mutations/execute` integration
- No service-role client writes
- No new identity tables
- No BOS visual identity redesign
- No Presentation Runtime reopen
- No auto-open lead on success
- No Processing Case on first paste
- No push / PR without Kelly
