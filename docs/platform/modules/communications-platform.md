---
owner: modules
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Communications platform

**Status:** Canonical platform module doc.

Canonical Communications V1 — threads, messages, provider bindings, scheduled sends.

**Identity platform (Phase 2):** [Communications Identity Platform](./communications-identity-platform.md) — provider accounts, communication identities, canonical sender resolution.

**Runtime contract:** [communications-runtime-contract.md](./communications-runtime-contract.md)

---

## Capabilities

| Area | Status |
|------|--------|
| Canonical threads/messages | Complete |
| Outbound enqueue + worker | Complete |
| Provider webhooks (Twilio/Resend) | Complete |
| Entity-scoped drawer UI | Complete |
| Scheduled sends (tours) | Complete |
| Legacy `messages` table | Compatibility — retirement path documented |

---

## Architecture

- **Threads:** `communication_threads` — org + entity + channel + recipient_key
- **Messages:** `communication_messages` — queued → sent/failed lifecycle
- **Bindings:** `communication_provider_bindings` per org/channel
- **Enqueue:** `canonicalOutboundEnqueue.ts` — server-only writes (service role)

---

## Rules

- No client direct DB writes for outbound
- Stage work may auto-associate contact attempts (enrollment Contacting stage)
- Drawer/inbox warm deferred on work-unit entry for performance

---

## Operator surfaces (Communications V2, July 2026)

| Surface | Entry | Purpose |
|---------|-------|---------|
| **Communications modal** | `/workspace` → top nav **Inbox** | Primary operator hub when `comms_v2_command_center` is enabled |
| **Drawer Communications** | Entity drawer tab | Record-specific conversations only |
| **Configuration → Communications** | `/organization/communications` | Provider bindings / channel setup (also embedded in modal Channels tab) |
| **`/adminV2/communications`** | Direct URL | Deprecated notice — not in nav |
| **`/admin/communications`** | Legacy path | Deprecated / non-primary |

### Modal navigation (Operational Workspace Doctrine V2)

Communications composes `@/components/workspace/doctrine` — same primitive stack as Processing (Digital Mailroom). Presentation only; send/thread/announcement/template runtimes unchanged.

| Mode | Sections |
|------|----------|
| **Work** | Overview · Inbox · Announcements · Scheduled |
| **Studio** | Templates · Channels · Rules |

Default Work tab on open: **Overview**. Header action: **Compose New** (Overview + Inbox).

Implementation: `CommunicationsWorkspaceShell`, `CommunicationsModalTabPanel`, `InboxModal`. Sprint closeout: `../../sprints/archive/07_2026/communications-product-shell-translation/README.md` (historical: `../../sprints/archive/07_2026/communications-product-shell-translation/README.md`).

**Operational health (Doctrine V3):** Work → Inbox, Announcements, and Scheduled (and Studio → Templates) render a flat `WorkspaceOperationalHealth` nav band via `CommunicationsWorkspaceKpiStrip` — same primitive and adapter pattern as Processing and Work Items. Overview omits the nav band. Metrics are operational only (no inventory totals such as Categories or Sent 7d). Each metric reserves a trend placeholder line.

Templates and Announcements inside the modal do not require separate feature flags beyond command center. See `../../sprints/archive/06_2026/communications-v2/operator-surface-consolidation.md`.


### Work Items convergence (Needs Reply — July 2026)

Communications **Needs Reply** threads (`attention_state` ∈ `needs_response`, `awaiting_parent_reply`) may project into Work Items as virtual rows (`communications:{threadId}`) when loadable and not resolved.

- **No** `operational_tasks` row is created.
- Unread alone does not project.
- **View in Work Items** / **Open in Communications** use shared navigation events and command-center pending selection.
- Authoritative resolution or reply through Communications removes the projection after operational refresh.

QA: `../../sprints/archive/08_2026/work-items-v3-platform/qa/slice-6/`.

### Canonical communications runtime (Phase 2, July 2026)

Communications has **one canonical runtime** with multiple presentation surfaces. Activity (`activity_embed`) is the compact presentation; Workspace Inbox (`workspace_inbox`) is the operational presentation. Both consume the same runtime contract for Preview VM hydration, thread selection, composer state, recipient state, send preflight/confirm, stale request protection, post-send refresh, reply collapse, and cache ownership.

Canonical contract: [`communications-runtime-contract.md`](communications-runtime-contract.md).

Workspace Inbox owns only the operational queue and surrounding context controls. It must not maintain a separate family-workspace load/send/thread lifecycle.

---

## Template Library (Communications V2)

**Canonical asset:** `communication_templates` + immutable `communication_template_versions` (`current_version_id` on the template row). Org-scoped list/create/update via `/api/admin/communications/templates`.

### Integration by surface

| Surface | Template integration | Send / schedule behavior |
|---------|---------------------|--------------------------|
| **Template Library** (modal tab) | Authoring + versioning | N/A — registry only |
| **Compose New** (`QuickMessageModal`) | Channel-filtered picker; applies `current_version` to editable subject/body | Outbound send uses composed text only (no `template_id` on message row today) |
| **Announcements** | `announcements.template_id` FK + picker; apply-on-select copies `current_version` into draft fields | Schedule snapshots `announcements.subject` / `announcements.body` at schedule time — not a live re-resolve from `template_id` |
| **Inbox reply / drawer compose** | Not integrated | Free-text compose |
| **Workflow `create_message` / `send_message`** | Inline `body` / `template` strings with payload path tokens | Separate from Template Library — no `communication_template_id` yet |
| **Tour comms / Workflow Assist / BOS copy** | Parallel template/config systems | Do not duplicate bodies into shared modules without migration |

### Doctrine

1. **Templates are the reusable operator-authored asset** for modal Compose and Announcements.
2. **Copy-on-apply, edit freely** — selecting a template fetches `GET …/templates/[id]` → `current_version` and seeds the composer; operators may edit before send/save.
3. **Do not duplicate message bodies** across features when a Template Library entry exists — reference `template_id` where persistence is needed (Announcements today).
4. **Scheduled announcements use saved draft text** — updating a template in the library does not retroactively change already-saved announcement bodies; re-select the template in the picker to refresh from the latest version.

Shared client helper: `web/lib/communications/v2/communicationTemplateDraftSeed.ts` (`fetchCommunicationTemplateCurrentVersion`, `communicationTemplateDraftSeedFromPreview`).

**Next increment (not shipped):** optional `communication_template_id` on workflow communication actions with runtime resolve of `current_version`; keep inline body as override during migration.

---

## Focus Panel Activity embed (July 2026) — **frozen**

**Surface:** `surfaceVariant="activity_embed"` on `FamilyCommunicationWorkspace` inside the Activity cockpit (`OpportunityFocusPanelEmbeddedWorkspace`).

**Operator model:** Conversation **topics** — business context titles (Tour Scheduling, Enrollment Packet, General) — with SMS/Email icons indicating transport only. Transport threads remain per-recipient/channel under the hood (`THREAD_SEMANTICS.md`); the Activity UI presents a topic rail + read/compose pane.

**Load path (canonical embedded workspace doctrine):**

```
Selected record (queue row)
  → Preview VM on drawer/focus payload (first paint)
  → Activity embed renders immediately (channels, recipients, recent threads, composer)
  → Background prefetch → full FamilyCommunicationWorkspace VM
  → Warm cache (`drawerFamilyWorkspacePrefetchCache`) on revisit
```

Full doctrine: `../../sprints/archive/2026-07/communications-preview-vm-doctrine.md` (historical: `../../sprints/archive/2026-07/communications-preview-vm-doctrine.md`).

**Topic rail:** `threadsForActivityTopicRail` hides zero-message threads; titles from `deriveThreadTopicTitle` (email: thread subject → workflow → message subject → metadata → General; SMS: session continuity, no message-subject fallback).

### Activity responsive composition (Adaptive Workspace Presentation)

Composition derives from existing operator state — no parallel load/send/cache lifecycle:

| State | When | Topic rail | Priority |
|-------|------|------------|----------|
| **empty** | No conversations | Hidden | Composer / New affordance |
| **reading** | ≥1 conversation and not composing | Shown | Topic selection + readable timeline |
| **composing** | New message or reply composer expanded | Hidden / collapsed | Timeline + composer width |

Helpers: `deriveActivityCommsCompositionState`, `shouldShowActivityTopicRail` in `adaptiveWorkspacePresentation.ts`. Cancel/send restore prior reading/selection without clearing draft/VM caches beyond existing reply lifecycle.

**Reply vs New Message:**

| Mode | Selection | Composer | Recipients |
|------|-----------|----------|------------|
| **Thread selected** | `selectedThreadId` set | Collapsed Reply → expand; channel locked | Thread transport participants only |
| **+ New** | `selectedThreadId` null | Expanded immediately | Household defaults |

**Post-send lifecycle:** Confirm send keeps thread selected (or opens `createdThreadId` from new message); composer clears; reply bar collapses; timeline reloads.

**Presentation helpers:** `threadTopicPresentation.ts`, `timelinePresentation.ts`.

**Out of scope (next sprint):** attachments, rich editor, Configuration/provider onboarding, compliance UX, inbound email, Test Email/SMS, Announcements/Templates expansion. Command Center modal layout and send runtime unchanged.

Sprint closeout: `../../sprints/archive/2026-07/communications-activity-sprint-closeout.md` (historical: `../../sprints/archive/2026-07/communications-activity-sprint-closeout.md`).

---

## Related

- `../../archive/2026-06-product/communications.md` (transitional expanded reference)
- `../operator/operational-workspace-shell.md` — modal workspace shell + Doctrine V2 primitives
- `../../sprints/archive/06_2026/communications-v2/operator-surface-consolidation.md`
- `../../sprints/archive/07_2026/communications-product-shell-translation/README.md` — Communications Doctrine V2 adoption closeout
- `docs/schema/schema-policies-and-security.md`
- `docs/audits/supabase-schema-alignment-audit.md`
