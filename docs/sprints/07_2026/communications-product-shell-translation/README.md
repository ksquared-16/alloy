# Communications Product Shell Translation - Sprint Closeout

**Date:** 2026-07-08  
**Branch:** `cursor/66605932`  
**Status:** Ready for review (not committed)

Presentation-only sprint. Translates Communications into the canonical Processing / Digital Mailroom product shell without changing routes, APIs, workflows, or communication engine behavior.

---

## What shipped

| Slice | Outcome |
| --- | --- |
| **Product shell** | Subtitle, Work \| Studio mode switch, secondary nav, white execution surface, `workspace-inc2c` version marker |
| **Work -> Overview** | `CommunicationsOverviewLanding` - action cards, Today's activity KPIs, continue conversations, recent announcements, quick navigation |
| **Work -> Inbox** | Existing `CommandCenterShell` unchanged (queue, timeline, composer, family context, current work) |
| **Work -> Announcements** | Existing `AnnouncementsWorkspace` unchanged |
| **Work -> Scheduled** | `ScheduledWorkspace` - scheduled outbound sends + scheduled announcements via existing APIs |
| **Studio -> Templates** | Existing `TemplatesWorkspace` unchanged |
| **Studio -> Channels** | `ChannelsWorkspace` - mockup list + embedded `CommunicationsSetupClient` for Email/SMS |
| **Studio -> Branding** | `BrandingWorkspace` - org communication branding list from existing binding hints |

---

## Navigation model

| Mode | Tabs |
| --- | --- |
| **Work** | Overview, Inbox, Announcements, Scheduled |
| **Studio** | Templates, Channels, Branding |

Default Work tab on open: **Overview** (parity with Digital Mailroom).

---

## Files changed

### New
- `web/app/adminV2/communications/CommunicationsOverviewLanding.tsx`
- `web/app/adminV2/communications/ScheduledWorkspace.tsx`
- `web/app/adminV2/communications/ChannelsWorkspace.tsx`
- `web/app/adminV2/communications/BrandingWorkspace.tsx`
- `web/app/adminV2/communications/CommunicationsStudioListRow.tsx`

### Updated
- `web/app/adminV2/communications/CommunicationsWorkspaceShell.tsx`
- `web/app/adminV2/communications/CommunicationsModalTabPanel.tsx`
- `web/app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx`
- `web/app/adminV2/components/InboxModal.tsx`
- `web/tests/adminV2/communicationsModalTabs.test.ts`
- `web/tests/adminV2/commsV2CommandCenterDark.contract.test.ts`

---

## Validation

```bash
cd web && npm run test -- \
  tests/adminV2/communicationsModalTabs.test.ts \
  tests/adminV2/commsV2CommandCenterDark.contract.test.ts

cd web && npx eslint \
  app/adminV2/communications/CommunicationsModalTabPanel.tsx \
  app/adminV2/communications/CommunicationsWorkspaceKpiStrip.tsx \
  app/adminV2/communications/CommunicationsWorkspaceShell.tsx \
  app/adminV2/communications/CommunicationsOverviewLanding.tsx \
  app/adminV2/communications/ScheduledWorkspace.tsx \
  app/adminV2/communications/ChannelsWorkspace.tsx \
  app/adminV2/communications/BrandingWorkspace.tsx \
  app/adminV2/communications/CommunicationsStudioListRow.tsx \
  app/adminV2/components/InboxModal.tsx \
  tests/adminV2/communicationsModalTabs.test.ts \
  tests/adminV2/commsV2CommandCenterDark.contract.test.ts

cd web && NODE_OPTIONS="--max-old-space-size=8192" npm run typecheck:build
```

Results:

- PASS: Communications modal contract tests (`14 passed`)
- PASS: Focused ESLint on touched UI/test files
- PASS: `typecheck:build`
- BLOCKED: Full `npm run typecheck` hung without diagnostics after 10+ minutes in this local agent environment
- BLOCKED: Browser screenshot pass. Dev server starts on `127.0.0.1:3002`, but `/workspace` redirects to `/login?error=config` because local auth/config is unavailable

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
| Branding self-service editing | Read-only in Studio today; full edit surface deferred |
| Channels KPI strip values | Placeholder dashes until binding summary helper exists |
| Scheduled workspace actions | View-only; cancel/reschedule stays in existing composer/announcement flows |
