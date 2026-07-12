# Messaging V2 — Phase 1 UX & Product Design

**Path:** `docs/sprints/archive/06_2026/messaging_v2_design.md`  
**Status:** Design specification (June 2026) — **planning only; no implementation**  
**Depends on:** [messaging_v2_audit.md](./messaging_v2_audit.md)

**North star:** Evolve messaging into a **Communications Platform** — one operational inbox for SMS, email, internal comms (future), scheduling, and BOS-assisted actions — without replicating Outlook or Gmail.

**Reference products (patterns only, not clones):** [Front](https://front.com), [Missive](https://missiveapp.com), [HubSpot Conversations](https://www.hubspot.com/products/conversations) — shared inbox, conversation-centric list, record context sidebar, channel badges.

---

## 1. Naming and entry

| Today | Target |
|-------|--------|
| Header **Messages** button → Quick Message modal | Header **Inbox** icon → `/adminV2/inbox` (route rename from `/adminV2/messages` TBD in implementation) |
| Quick send only | Inbox primary; compose as panel/modal from Inbox |

**Unread:** Inbox icon shows badge from `unread_count` (extend API as needed). Polling or SSE — implementation detail; target ≤60s freshness.

---

## 2. Inbox layout

Three-column workspace (collapse to two on tablet, single on mobile):

```
┌──────────────┬─────────────────────┬──────────────────────┐
│  Left rail   │  Conversation list  │  Conversation detail   │
│  (folders)   │  (threads)          │  (thread + context)    │
└──────────────┴─────────────────────┴──────────────────────┘
```

### 2.1 Left rail

| Folder | Definition | Badge |
|--------|------------|-------|
| **Inbox** | All active threads with inbound or assigned-to-me activity | Total unread (optional) |
| **Unread** | Threads with ≥1 unread inbound for current user | Count |
| **Sent** | Threads where last message is outbound by org users | — |
| **Scheduled** | Rows from `communication_scheduled_sends` status pending/claimed | Count of due soon |
| **Drafts** | Unsent composer drafts (new store — see architecture) | Count |
| **Archived** | Threads/messages user or org archived | — |

**Future placeholders (disabled with tooltip "Coming soon"):**

- **Email** — filter channel=email
- **SMS** — filter channel=sms
- **Internal** — channel=in_app when product ships

Placeholder folders educate operators without implying broken functionality.

### 2.2 Conversation list

Each row displays:

| Field | Source (conceptual) |
|-------|---------------------|
| **Contact** | Resolved person name from `recipient_key` / last message addresses / household primary |
| **Family** | Customer/household label when thread anchor or related entity maps to customer |
| **Record** | Primary entity chip (Opportunity · Child name, Job #, Person) |
| **Last activity** | Preview snippet (existing `last_message_preview` pattern) |
| **Timestamp** | `updated_at` or last message `created_at`, viewer timezone |
| **Unread indicator** | Blue dot (existing `#2563eb` pattern) when thread has unread inbound |

**Interaction patterns:**

- Single click → load detail pane; mark thread viewed (not necessarily all messages read).
- Keyboard: ↑/↓ navigate list; Enter open; `e` archive; `/` focus search.
- Search filters list by contact name, phone, email, record title, message body (server-side — new API).
- Sort: **Most recent activity** default; optional **Unread first**.
- Empty states per folder with single CTA ("Compose message", "Connect email" settings link).

**Do not:** Thread tree by arbitrary labels; folder rules requiring operator Gmail knowledge; separate apps per channel.

### 2.3 Conversation detail

**Main column:**

- Chronological message stream (reuse delivery state adapter from drawer).
- Channel badge per message (SMS / Email).
- Expand/collapse long bodies (existing Show more/less pattern).
- Optimistic append on send (existing drawer behavior).

**Header:**

- Participant chips (from + to addresses resolved to persons where possible).
- Record link(s) — primary anchor + quick open drawer.
- Actions: Archive, Mark unread, Schedule follow-up (future).

**Right sidebar (context panel):**

| Section | Content |
|---------|---------|
| **Associated records** | Primary entity + related opportunity/customer/job |
| **Participants** | Person list with roles (guardian, contact) |
| **Related activity** | Recent workflow events / tasks / forms (read-only links) |
| **Communication history** | Cross-channel timeline summary (same thread + related person threads optional toggle) |

---

## 3. Drawer communications experience

**Principle:** All drawer types use the **same** communications module via entity abstraction — no hardcoded opportunity-only compose.

### 3.1 Entity coverage matrix

| Entity | Drawer comms | Compose | Thread anchor |
|--------|--------------|---------|---------------|
| Lead / Opportunity | Yes | Yes | `opportunities` |
| Person (parent/guardian) | Yes | Yes | `persons` |
| Child | Yes | Yes (via household persons) | `persons` or opportunity context |
| Customer (household) | Yes | Yes | `customers` (extend send API) |
| Job | Yes | Yes | `jobs` |
| Vendor | Yes (future) | Yes | `vendors` or generic entity registry |
| Future entities | Via `RecordCommunicationsSection` | Via shared composer | `primary_entity_type` from resolver |

**Implementation pattern (design):**

```typescript
// Conceptual — not production code
<RecordCommunicationsSection
  entityRef={{ type: resolvedEntityType, id: entityId }}
  layoutVariant="drawerTab" | "embedded"
/>
```

Drawer tab label: **Communications** (keep); embedded overview blocks use lighter chrome per visual refresh.

**Context handoff:** Opening Inbox from drawer pre-filters list to that entity's threads (`?entity_type=&entity_id=`).

---

## 4. Visual refresh

### 4.1 Problem

Current drawer uses **heavy dark outbound bubbles** (`bg-alloy-midnight/[0.92]`) on a mixed surface — high contrast, "chat app" weight inconsistent with Admin V2 workspace.

### 4.2 Target — Bend Pine palette workspace feel

Align with `web/app/globals.css` brand roles:

| Role | Token | Use in comms |
|------|-------|--------------|
| Surfaces | River Stone / white | Panel backgrounds, list rows |
| Text | Alloy Midnight | Body copy, timestamps |
| Primary CTA | Alloy Blue | Send, primary actions |
| Life / accent | **Bend Pine** `#00A283` | Success sent state, active folder, subtle inbound accent border |
| Depth | Midnight Forge | Header only — not message bubbles |

**Direction:**

- **Light background** for comms panels (`bg-white/95`, `border-alloy-stone/15`).
- Outbound messages: light gray bubble (`bg-alloy-stone/8`) with midnight text — not inverted dark pills.
- Inbound messages: white bubble + subtle left border Bend Pine (2px) for "customer spoke".
- Composer: white card, reduced uppercase micro-label weight (keep accessibility).
- Unread dot: Bend Pine or existing blue — pick one system-wide in implementation.
- Spacing: match drawer pipeline cards (rounded-xl, shadow-sm).

**Reference within Alloy:** Person drawer summary save bar (Bend Pine primary), global search status pills, Admin V2 workspace cards.

---

## 5. Composer V2

Shared component: **Inbox compose**, **drawer compose**, **Quick Message** (eventually merged).

### 5.1 Layout

```
┌─────────────────────────────────────────┐
│ [Email ▼] [SMS]     Recipient selector  │  ← Top
├─────────────────────────────────────────┤
│ Subject (email only)                    │
│ Rich text editor                        │  ← Middle
│                                         │
├─────────────────────────────────────────┤
│ [Send]  [Schedule ▼]  [BOS Action]      │  ← Bottom
└─────────────────────────────────────────┘
```

### 5.2 Top bar

- **Channel toggle:** Email | SMS (disable SMS when bindings unavailable — existing pattern).
- **Recipient selector:**
  - Single person search
  - Household mode: all guardians checkboxes (existing drawer recipient pattern)
  - Multi-select for multiple contacts
  - Show resolved email/phone per channel with validation icons

### 5.3 Middle — rich editor

**V2 scope:**

| Format | Support |
|--------|---------|
| Bold, Italic, Underline | Yes |
| Link | Yes |
| Image | Inline embed (storage via documents pipeline — architecture) |
| Bulleted / numbered lists | Yes |

**Email:** HTML body (`body_format: html` — architecture). **SMS:** Plain text with auto-strip formatting on send.

**Future-ready (UI stubs disabled):**

- Templates dropdown
- Merge fields picker (`{{parent_name}}`, etc.)
- Variables from record resolver

### 5.4 Bottom bar

| Action | Behavior |
|--------|----------|
| **Send** | Immediate `executeCommunicationsSend` |
| **Schedule** | Opens datetime picker → `communication_scheduled_sends` (extend entity scope) |
| **BOS Action** | Opens Task Assist / draft synthesis with composer content as seed |

**Validation blockers (inline):** missing binding, missing recipient channel address, opt-out (when enforced), empty body.

---

## 6. Multi-recipient support

### 6.1 V2 modes

| Mode | UX | Send semantics |
|------|-----|----------------|
| **Single recipient** | One person selected | One message, one thread |
| **Household** | "Send to all guardians" toggle | N messages or one thread per recipient (match existing thread uniqueness) |
| **Multiple guardians** | Checkbox list | Same as household |
| **Multiple contacts** | Multi-select with role hints | One enqueue per selected person |

**Operator clarity:** Show "Will send 3 messages" before confirm when N > 1.

### 6.2 Future

- **Campaigns** — segment + template + schedule batch (out of V2 initial sprints).
- **Bulk messaging** — requires consent enforcement + rate limits + new queue — not V2 A.

---

## 7. Notification center (future convergence)

**Goal:** Single operational inbox experience merging:

| Stream | Today | Future home |
|--------|-------|---------------|
| Inbound/outbound messages | Drawer + unused unread API | Inbox |
| System notifications | None | Inbox / Notifications folder |
| Assignments | Operational tasks badge | Inbox sidebar section or unified feed |
| Mentions | None | Inbox (@user) |
| BOS alerts | Review Assist cards | Inbox actionable items |

**Design principles:**

- **Actionable vs informational** — two sub-filters or visual weight, not separate apps.
- **Deep link** — every item opens record drawer + relevant tab.
- **Do not implement in Phase 1** — document API convergence in architecture; ship in Sprint D.

**Header evolution:**

```
[Search] [Tasks badge] [Inbox badge] [Profile]
```

Tasks may remain separate badge initially; converge when notification model exists.

---

## 8. Settings and onboarding touchpoints

| Surface | Purpose |
|---------|---------|
| Settings → Communications (`/adminV2/settings/communications`) | Provider bindings, channel readiness — extend for OAuth connect (future) |
| Inbox empty state | Link to settings when no bindings |
| Composer blocker | Same copy as drawer today + settings deep link |

---

## 9. Accessibility and performance

- List virtualisation for >100 threads.
- Composer focus trap in modal; Esc closes.
- Screen reader: announce unread counts on badge update.
- Respect `AdminViewerTimezoneContext` for all timestamps.
- Preserve drawer prefetch pattern for embedded comms.

---

## 10. Out of scope (design)

- Outlook/Gmail clone (folders like Junk, Rules engine).
- Customer-facing portal messaging.
- Voice/call logging ( `call_parent` remains tel: link).
- Full campaign builder UI.

---

## 11. Acceptance criteria (design review)

- [ ] Header renamed to Inbox with unread badge spec
- [ ] Left rail folders defined with data sources
- [ ] Conversation list fields and interactions documented
- [ ] Detail + sidebar sections specified
- [ ] Entity abstraction covers all drawer types without hardcoding
- [ ] Visual direction references Bend Pine / light workspace
- [ ] Composer V2 layout and formatting scope agreed
- [ ] Multi-recipient UX modes documented
- [ ] Notification convergence documented as future sprint

**Related:** [messaging_v2_architecture.md](./messaging_v2_architecture.md), [messaging_v2_implementation_plan.md](./messaging_v2_implementation_plan.md)
