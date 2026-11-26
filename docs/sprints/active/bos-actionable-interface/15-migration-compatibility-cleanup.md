---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 15 — Migration, Compatibility, and Cleanup

## Compatibility strategy

1. **Phase 4–5 bridge:** `adminv2:open-create-lead` may start BOS session *or* fall back to `CreateLeadCommandSurface` behind a temporary flag `BOS_CREATE_LEAD_SESSION_ENABLED` (default true in implementation branch; keep escape hatch one release).
2. **Do not** maintain two execute paths — both UIs must call `executeCreateLeadCommand`.
3. Public lead capture / Processing sources untouched.
4. `ActionWorkspaceBosShell` modal chrome retained until BOS host certified; then demote to fallback.

## Cleanup (Phase 8)

- Remove dead `AICommandBar` path if still unreachable.
- Delete or archive unused modal-only entry after flag removal.
- Align docs that still claim direct person/opportunity create.
- Resolve Command Surface “wired in docs” language to match reality post-wire.
- Consider registering `create_lead` in `BOS_CAPABILITY_REGISTRY` as operational capability with `human_approved_operational_api` — **only if** it clarifies policy gating without duplicating action registry (prefer thin pointer capability).

## Migrations

**None for V1.**

## Documentation owners to update at ship

| Doc | Change |
|---|---|
| `docs/platform/modules/ai-platform.md` | BOS command session; Create Lead conversational entry; V6 note |
| `docs/platform/modules/actions-and-workflows.md` | Placement opens BOS; bos variant maturity |
| `docs/platform/modules/documents-and-forms.md` | Clarify BOS prepares payload; Processing still gate |
| `docs/product/bos-foundation.md` | Capability/status; move toward canonical framing |
| `docs/platform/foundation/platform-capabilities.md` | Status bump |
| `docs/platform/foundation/product-roadmap.md` | Distinguish from paused autonomous agents |
| `docs/platform/foundation/platform-decisions.md` | New decision: BOS universal command interface binds to Operational Command Runtime |
| `docs/api/ai-bos-api.md` | Note reuse of actions/execute; no parallel API |
| `docs/platform/foundation/release-history.md` | On promotion only |

Do **not** create parallel doctrine files.

## Runtime docs

Update `alloy-runtime-specification.md` / navigation doctrine **only** if interaction contract for assistant region changes materially (command-session mode). Prefer minimal amendment.
