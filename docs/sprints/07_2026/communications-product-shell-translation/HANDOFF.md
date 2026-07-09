# Communications Product Shell - Handoff

**Sprint:** Communications shell translation (Processing parity)  
**Reviewer:** Kelly  
**Agent branch:** `cursor/66605932`  
**Commit status:** Not committed - awaiting review

---

## Summary

Communications now uses the same product shell grammar as Digital Mailroom:

- **Header:** icon + title + subtitle ("Where conversations happen.") + Compose New + Close
- **Mode rail:** Work | Studio (`AlloyModeSwitch`)
- **Section tabs:** underline Bend Pine active state (`CommsModalTabBar` via `OperationalWorkspaceModeNav`)
- **Execution:** white workspace on stone BOS backdrop; no external Studio settings link

Every existing capability is preserved. This is presentation only.

---

## How to review

1. Check out branch `cursor/66605932`
2. `cd web && npm install && npm run dev`
3. Log into staging/local and open **`/workspace`** (or a **`/workspace/work-unit/:slug`** queue)
4. Click **Inbox** in top nav (opens Communications modal)
5. Walk every tab:

| Tab | Verify |
| --- | --- |
| **Overview** | Three action cards, Today's activity, continue conversations, recent announcements, quick nav links |
| **Inbox** | Queue + conversation + composer unchanged |
| **Announcements** | Audience builder, schedule, draft unchanged |
| **Scheduled** | Lists scheduled sends (inbox API) + scheduled announcements |
| **Templates** | Folder/category filters, builder, tokens unchanged |
| **Channels** | Channel list; Email/SMS drill into existing bindings setup |
| **Branding** | Branding list; detail panels show binding-derived values |

6. Confirm modal **feels identical** to Digital Mailroom shell spacing, typography, borders, and card treatment.

---

## Automated checks

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

Agent run results:

- PASS: Communications modal contract tests (`14 passed`)
- PASS: Focused ESLint on touched UI/test files
- PASS: `typecheck:build`
- BLOCKED: Full `npm run typecheck` hung without diagnostics after 10+ minutes in this local agent environment
- BLOCKED: Browser screenshot pass. Dev server starts on `127.0.0.1:3002`, but `/workspace` redirects to `/login?error=config` because local auth/config is unavailable

---

## Screenshot checklist

Capture and drop into `docs/sprints/07_2026/communications-product-shell-translation/screenshots/`:

- [ ] `01-work-overview.png`
- [ ] `02-work-inbox.png`
- [ ] `03-work-announcements.png`
- [ ] `04-work-scheduled.png`
- [ ] `05-studio-templates.png`
- [ ] `06-studio-channels.png`
- [ ] `07-studio-branding.png`

Reference mockups: approved Communications Work/Studio screens (Overview, Inbox, Announcements, Templates, Channels, Branding).

---

## Risk notes

- **Branding tab** surfaces read-only values from provider bindings - not a new branding API.
- **Channels tab** embeds the full settings client for Email/SMS - same PATCH paths as `/settings/communications`.
- **Default tab** is now Overview (was Inbox) - matches Digital Mailroom; Inbox one click away via tab or action cards.

---

## Suggested commit message (when approved)

```
Translate Communications into Processing product shell (presentation only).

Add Work Overview/Scheduled and Studio Channels/Branding tabs; reuse
OperationalModalHeader, mode nav, and execution surface grammar from
Digital Mailroom without changing routes, APIs, or comms engine behavior.
```
