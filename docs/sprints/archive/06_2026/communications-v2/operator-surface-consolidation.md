# Communications V2 — Operator surface consolidation (June 2026)

**Status:** Shipped on `staging`.

## Primary operator model

Communications for operators lives in the **Inbox / Command Center modal** opened from AdminV2 top nav **Inbox**. The modal title is **Communications**.

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Inbox** | `CommandCenterShell` | Org-wide queue, conversation workspace, composer |
| **Templates** | `TemplatesWorkspace` | Template authoring and preview |
| **Announcements** | `AnnouncementsWorkspace` | Announcement authoring and delivery planning |

Implementation: `web/app/adminV2/components/InboxModal.tsx` → `CommunicationsModalTabPanel.tsx`.

## Feature flag gate

- **Single gate for modal tabs:** `comms_v2_command_center` (core flag; defaults ON on staging).
- **Templates and Announcements do not require separate feature flags** (`comms_v2_templates`, `comms_v2_announcements`) to render inside the modal.
- When `comms_v2_command_center` is **off**, the modal falls back to legacy **`InboxPanel`** (folder list + thread detail only).
- **Preferences** is not a modal tab yet; reserved for a follow-on.

## Non-primary / scoped surfaces

| Surface | Entry | Role |
|---------|-------|------|
| **Settings → Communications** | `/adminV2/settings/communications` | Provider bindings and channel setup **only** — not template/announcement authoring |
| **Drawer Communications** | Entity drawer tab | **Record-specific** conversation history and reply — not org-wide inbox |
| **`/adminV2/communications`** | Direct URL only | **Deprecated** — shows a notice pointing operators to the Inbox modal; not in nav |
| **`/admin/communications`** | Legacy path | **Deprecated / non-primary** — not the operator hub |

Do not resurrect `/admin/communications` or `/adminV2/communications` as the primary Communications entry.

## What did not change

- Provider auth, send execution, scheduler, and inbound pipeline paths.
- Drawer Communications tab semantics (record-scoped only).
- Settings → Communications (provider setup only).

## Tests

- `web/tests/adminV2/communicationsModalTabs.test.ts` — modal tab contracts
- `web/tests/adminV2/commsV2CommandCenterDark.contract.test.ts` — command center shell wiring
- `web/tests/adminV2/announcementsWorkspace.test.ts` — announcements workspace
- `web/tests/communications/**` — flags and comms helpers
