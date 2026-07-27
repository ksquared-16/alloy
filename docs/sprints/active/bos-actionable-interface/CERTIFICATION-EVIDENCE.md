---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# Certification evidence index — BOS Actionable Interface V1

## Branch / commits

| Item | Value |
|------|-------|
| Branch | `agent/cursor/2-bos-actionable-interface-plan` |
| Planning | `0cc288c65` |
| WP-01 | `5e335e4d9` |
| WP-02 | `5ac495125` |
| WP-03 | `d7f87cd6b` |
| WP-04 | `53cbb36b0` |
| WP-05 | `5aa94eeab` |
| WP-06 | `a313a132c` (Bend Pine header + white mark) |
| WP-07 / WP-08 | `446e599bb` |
| WP-09 | `ed7ccfec2` |
| WP-10 | `b41c39218` |
| WP-11 | `b409497a8` |
| WP-12 | (this certification commit) |
| Push | **local only — not pushed** |

## Automated suites (WP-12)

```bash
cd web && npm run test -- \
  tests/adminV2/actions/createLeadAction.test.ts \
  tests/adminV2/actions/createLeadCommandModel.test.ts \
  tests/adminV2/actions/executeCreateLeadCommand.test.ts \
  tests/adminV2/actions/createLeadCommandSurfaceWiring.test.ts \
  tests/lifecycle/createLeadBosFieldSourceParity.test.ts \
  tests/processing/processingIdentityD4CreateLead.test.ts \
  tests/processing/processingIdentityE1Boundaries.test.ts \
  tests/bos/commandSession \
  tests/presentation/rightRail/createLeadEventHost.test.tsx
```

**Result (2026-07-27):** 16 files, **79 passed**.

Additional: `npm run typecheck` (**green** after WP-12 adapter/host fixes).

`npm run typecheck:tests`: **fails on unrelated** queue-layout fixture types under `tests/adminV2/runtime/**`, `tests/layout/**`, `tests/presentation/runtime/**` (missing `scope` / `display` / column width). **No errors** under `tests/bos/**` or Create Lead BOS files. Contained as pre-existing platform drift — not introduced by this sprint.

## Certification checklist (V1)

- [x] WP-01..11 local commits (WP-12 certification commit lands with this evidence)
- [x] Processing identity guarantees covered by D4/E1 suites
- [x] No auto-open regression (WP-10 success path + tests)
- [x] Queue refresh seam covered in processing/success tests
- [x] Actions entry opens BOS (WP-11 wiring + event host tests)
- [x] BOS header Bend Pine + white mark (WP-06)
- [x] Canonical docs updated per `15-migration-compatibility-cleanup.md`
- [ ] Live authenticated scenarios 1–22 — product-owner / slot-2 server QA (server was stopped during certification; see live QA notes)

## Live QA notes

**Automated substitute for placement/session/adapter/Processing boundaries:** protected suites green (79 tests).

**Authenticated UI QA status (2026-07-27):** Blocked in this agent session.

- Slot 2 `alloy-dev-start` briefly serves `/login` (200) then the Next process exits; Playwright smoke hits `ERR_CONNECTION_REFUSED` on `:3012`.
- Cursor IDE browser cannot reach worktree localhost (`chrome-error://chromewebdata/`).
- Auth storage for QA identity `qa-slot2-architecture@example.com` is present at the slot auth path (do not print contents).
- Playwright smoke added: `web/playwright/tests/bos-create-lead-command-session-smoke.spec.ts` — run after a stable `alloy-dev-start wt2-bos-actionable-interface-plan`:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3012 \
PLAYWRIGHT_STORAGE_STATE="$HOME/.local/state/alloy-dev/auth/slot2/storage-state.json" \
npx playwright test playwright/tests/bos-create-lead-command-session-smoke.spec.ts
```

Screenshots land under `docs/sprints/active/bos-actionable-interface/evidence/`.

### Product-owner sign-off checklist (localhost:3012)

1. Actions → Create Lead → BOS session ack + Conversation/Form tabs
2. Complete paste → Review → Processing review → Confirm → success (no auto Focus Panel)
3. Explicit Open Lead + queue/Work View refresh
4. Conversation → Form → Conversation draft preservation
5. Multi-parent / multi-child
6. Flag off (`NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0`) → modal fallback
7. Visual: Bend Pine header, white BOS mark, accessible chrome


## Deferred (Horizons 2–3)

- Slash-command productization (WP-13 stub optional only)
- Daily briefing productization (WP-14 stub optional only)
- Additional command adapters beyond Create Lead
- Flag removal / modal demotion after one release soak
