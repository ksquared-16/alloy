# Communications Product Shell Translation - Sprint Closeout

**Date:** 2026-07-10  
**Status:** Doctrine V2 certified adopter (presentation only)

Presentation-only sprint. Communications consumes `@/components/workspace/operational` — the same primitive stack as Processing (Digital Mailroom). No routes, APIs, workflows, or communication engine behavior changed.

---

## Doctrine V2 certification

Communications composes: `WorkspaceShell`, `WorkspaceHeader`, `WorkspaceModeTabs`, `WorkspaceSubTabs`, `WorkspaceMetricTiles`, `WorkspaceSurface`, `WorkspaceCard`, `WorkspaceZonePanel`, `WorkspaceDivider`.

See [HANDOFF.md](./HANDOFF.md) for the full certification statement.

---

## What shipped

| Slice | Outcome |
| --- | --- |
| **Doctrine primitives** | `web/components/workspace/operational/*` — certified stack extracted from Processing grammar |
| **Product shell** | `CommunicationsWorkspaceShell` composes doctrine components only (`doctrine-v2`) |
| **Work -> Overview** | `WorkspaceCard` action tiles, `WorkspaceZonePanel` continue/recent lists |
| **Work -> Inbox** | Existing `CommandCenterShell` unchanged |
| **Work -> Announcements** | Existing `AnnouncementsWorkspace` unchanged |
| **Work -> Scheduled** | `ScheduledWorkspace` unchanged |
| **Studio -> Templates** | Existing `TemplatesWorkspace` unchanged |
| **Studio -> Channels** | `ChannelsWorkspace` unchanged |
| **Studio -> Rules** | `RulesWorkspace` (formerly Branding) — channels, signatures, rules |

---

## Navigation model

| Mode | Tabs |
| --- | --- |
| **Work** | Overview, Inbox, Announcements, Scheduled |
| **Studio** | Templates, Channels, Rules |

Default Work tab on open: **Overview** (parity with Digital Mailroom).

---

## Files changed

### New
- `web/components/workspace/operational/*` (doctrine primitives)
- `web/app/adminV2/communications/CommunicationsOverviewLanding.tsx`
- `web/app/adminV2/communications/ScheduledWorkspace.tsx`
- `web/app/adminV2/communications/ChannelsWorkspace.tsx`
- `web/app/adminV2/communications/RulesWorkspace.tsx`
- `web/app/adminV2/communications/CommunicationsStudioListRow.tsx`
- `web/tests/adminV2/communicationsWorkspaceDoctrine.test.ts`

### Updated
- `web/app/adminV2/communications/CommunicationsWorkspaceShell.tsx`
- `web/app/adminV2/communications/CommunicationsModalTabPanel.tsx`
- `web/app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx`
- `web/app/adminV2/communications/CommunicationsOverviewLanding.tsx`
- `web/app/adminV2/communications/CommsModalTabBar.tsx`
- `web/app/adminV2/components/OperationalWorkspaceModeNav.tsx`
- `web/app/adminV2/components/InboxModal.tsx`
- `web/tests/adminV2/communicationsModalTabs.test.ts`

---

## Validation

```bash
cd web && npm run test -- \
  tests/adminV2/communicationsModalTabs.test.ts \
  tests/adminV2/communicationsWorkspaceDoctrine.test.ts \
  tests/adminV2/commsV2CommandCenterDark.contract.test.ts

cd web && NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit
```

Results:

- PASS: 20 contract/doctrine tests
- PASS: Full `tsc --noEmit` (8GB heap)
- BLOCKED: Browser screenshots — local `/workspace` requires authenticated Supabase config

Screenshots: `docs/sprints/07_2026/communications-product-shell-translation/screenshots/`

---

## Intentionally unchanged

- All canonical operator routes (`/workspace`, `/workspace/work-unit/*`)
- All `/api/admin/communications/*` and inbox APIs
- Command Center queue semantics (operational queues, not email folders)
- Workflow / send / schedule engine paths
- Settings route `/settings/communications` (still reachable; Channels tab embeds same client)

> **Note:** Implementation files live under `web/app/adminV2/` (Next.js app dir), but public URLs are always `/workspace` or `/settings` - never `/adminV2`.

---

## Follow-ups (post-review)

| Item | Notes |
| --- | --- |
| Rules self-service editing | Read-only in Studio today; full edit surface deferred |
| Channels KPI strip values | Placeholder dashes until binding summary helper exists |
| Scheduled workspace actions | View-only; cancel/reschedule stays in existing composer/announcement flows |
