# Communications Product Shell - Handoff

**Sprint:** Communications Operational Workspace Doctrine V2 adoption  
**Reviewer:** Kelly  
**Certification:** Communications consumes the same primitive stack as Processing (Digital Mailroom)

---

## Certification statement

Alloy Operational Workspace Doctrine V2 is frozen. Processing (Digital Mailroom) is the certified reference implementation. Communications now composes `WorkspaceShell`, `WorkspaceHeader`, `WorkspaceModeTabs`, `WorkspaceSubTabs`, `WorkspaceMetricTiles`, `WorkspaceSurface`, `WorkspaceCard`, `WorkspaceZonePanel`, and `WorkspaceDivider` from `@/components/workspace/doctrine` — supplying data and tab content only. No parallel shell chrome, no Communications-specific header/nav/KPI implementations.

**Presentation only.** Routes, APIs, inbox runtime, thread runtime, announcements runtime, and template runtime are unchanged.

---

## Tab map (Processing parity)

| Mode | Sections |
| --- | --- |
| **Work** | Overview · Inbox · Announcements · Scheduled |
| **Studio** | Templates · Channels · Rules |

---

## How to review

1. `cd web && npm install && npm run dev`
2. Log into staging/local and open **`/workspace`**
3. Click **Inbox** (Communications modal)
4. Walk every tab — behavior must match pre-doctrine sprint; only chrome should match Processing

| Tab | Verify |
| --- | --- |
| **Overview** | WorkspaceCard action tiles, metric tiles, zone panels |
| **Inbox** | Queue + conversation + composer unchanged |
| **Announcements** | Audience builder, schedule, draft unchanged |
| **Scheduled** | Scheduled sends + announcements lists |
| **Templates** | Three-column builder unchanged |
| **Channels** | Channel list; Email/SMS embed setup client |
| **Rules** | Signatures, reply-to, branding rules list |

---

## Validation

```bash
cd web && npm run test -- tests/adminV2/communicationsModalTabs.test.ts tests/adminV2/communicationsWorkspaceDoctrine.test.ts tests/adminV2/commsV2CommandCenterDark.contract.test.ts
cd web && npx tsc --noEmit
```

---

## Changed files (doctrine adoption)

**New doctrine primitives:** `web/components/workspace/doctrine.ts` (barrel) + certified components under `web/components/workspace/`

**Communications:** `CommunicationsWorkspaceShell.tsx`, `CommunicationsModalTabPanel.tsx`, `CommunicationsOverviewLanding.tsx`, `CommunicationsWorkspaceKpiStrip.tsx`, `CommsModalTabBar.tsx`, `RulesWorkspace.tsx` (replaces Branding)

**Shared:** `OperationalWorkspaceModeNav.tsx`

**Tests:** `communicationsModalTabs.test.ts`, `communicationsWorkspaceDoctrine.test.ts`
