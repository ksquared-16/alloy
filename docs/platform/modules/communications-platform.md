# Communications platform

**Status:** Canonical platform module doc.

Canonical Communications V1 — threads, messages, provider bindings, scheduled sends.

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

## Operator surfaces (Communications V2, June 2026)

| Surface | Entry | Purpose |
|---------|-------|---------|
| **Communications modal** | AdminV2 top nav **Inbox** | Primary: **Inbox**, **Templates**, **Announcements** tabs (`comms_v2_command_center`) |
| **Drawer Communications** | Entity drawer tab | Record-specific conversations only |
| **Settings → Communications** | `/adminV2/settings/communications` | Provider bindings / channel setup only |
| **`/adminV2/communications`** | Direct URL | Deprecated notice — not in nav |
| **`/admin/communications`** | Legacy path | Deprecated / non-primary |

Templates and Announcements inside the modal do not require separate feature flags beyond command center. See `../../sprints/06_2026/communications-v2/operator-surface-consolidation.md`.

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

## Focus Panel Activity embed (July 2026)

**Surface:** `surfaceVariant="activity_embed"` on `FamilyCommunicationWorkspace` inside the Activity cockpit (`OpportunityFocusPanelEmbeddedWorkspace`).

**Operator model:** Conversation **topics** — business context titles (Tour Scheduling, Enrollment Packet, General) — with SMS/Email icons indicating transport only. Transport threads remain per-recipient/channel under the hood (`THREAD_SEMANTICS.md`); the Activity UI merges them into a topic rail + read/compose pane.

**Load path (canonical embedded workspace doctrine):**

```
Selected record (queue row)
  → Preview VM on drawer/focus payload (first paint)
  → Activity embed renders immediately (channels, recipients, recent threads, composer)
  → Background prefetch → full FamilyCommunicationWorkspace VM
  → Warm cache (`drawerFamilyWorkspacePrefetchCache`) on revisit
```

**Topic rail:** `threadsForActivityTopicRail` hides zero-message threads; titles from `deriveThreadTopicTitle` (thread subject → workflow → message subject → metadata → General).

**Reply vs New Message:**

| Mode | Selection | Composer channel | Recipients |
|------|-----------|------------------|------------|
| **Thread selected** | `selectedThreadId` set | Defaults to thread channel | Thread transport participants only |
| **+ New** | `selectedThreadId` null | Operator choice | Household defaults |

**Presentation helpers:** `web/lib/communications/v2/familyWorkspace/threadTopicPresentation.ts`, `timelinePresentation.ts`.

**Out of scope for Activity embed:** provider onboarding, compliance enforcement UI, inbound email setup, Settings bindings, Command Center modal layout, send runtime changes.

Sprint closeout: `docs/sprints/2026-07/communications-activity-sprint-closeout.md`.

---

## Related

- `../../product/communications.md` (transitional expanded reference)
- `../../sprints/06_2026/communications-v2/operator-surface-consolidation.md`
- `docs/schema/schema-policies-and-security.md`
- `docs/audits/supabase-schema-alignment-audit.md`
