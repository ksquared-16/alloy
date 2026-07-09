# Communications Activity Sprint — Closeout (July 2026)

**Status:** Complete — merged to `staging`.  
**Scope:** Focus Panel Activity `activity_embed` communications; Command Center modal and send runtime unchanged.

---

## Objectives

| Objective | Outcome |
|-----------|---------|
| Communications activation in Activity cockpit | Communications tab renders real workspace on record select |
| SMS enablement (display/eligibility) | SMS channel tab + eligibility from existing VM rules |
| Thread / transport model | Per-recipient transport threads; UI topic rail filters `messageCount > 0` |
| Preview VM (Path C) | `communicationsPreviewVm` on selected Focus Panel payload for first paint |
| Activity runtime performance | Preview → warm cache → background full VM; flex height chain for cockpit fill |
| Thread-first UX | Topic rail \| read pane + pinned reply composer |
| Composer improvements | Compact To row, formatting toolbar, BOS header button, taller new-message body |
| Conversation topics | Business titles (General, Tour Scheduling, …); channel icon = transport only |

---

## Architectural decisions

### Embedded workspace load doctrine

```
Selected Record (queue row)
        ↓
Preview VM (communicationsPreviewVm on drawer/focus payload)
        ↓
Immediate render (Activity embed — no blank shell)
        ↓
Background hydrate (prefetch full FamilyCommunicationWorkspace VM)
        ↓
Full Workspace VM (threads, timeline, consent tail, tasks)
```

**Why this became canonical:** Activity is a **selection surface** inside an already-loaded record context. Operators expect instant channel/recipient/thread visibility when switching to Communications — not a second loading shell. Preview VM carries the minimum truthful roster + recent threads; full VM revalidates without clearing valid warm state.

### Key concepts

| Concept | Implementation |
|---------|----------------|
| **Preview VM** | `FamilyCommunicationWorkspacePreviewVM` — capped threads/timeline, composer defaults |
| **Warm cache** | `drawerFamilyWorkspacePrefetchCache` — keyed by customer/entity + thread + channel |
| **Focus Panel preload** | Row select prefetches family-workspace; preview attached in drawer VM compose |
| **Activity embed** | `surfaceVariant="activity_embed"` — two-pane topic workspace only |
| **Thread model** | Transport threads per person/channel; merged family timeline for modal |
| **Conversation topics** | `deriveThreadTopicTitle` — subject → workflow → message subject → metadata → General |
| **Reply** | Keeps `selectedThreadId`; channel + recipients sync to thread transport |
| **New Message** | Clears `selectedThreadId`; household default recipients; distinct compose pane |

Pure presentation: `web/lib/communications/v2/familyWorkspace/threadTopicPresentation.ts`.

---

## Major commits (staging)

| Commit | Summary |
|--------|---------|
| `4772dd094` | Warm family-workspace cache for Focus Panel Activity |
| `63e212a16` | Activity communications preview in selected Focus Panel payload |
| `fdf7f5d7a` | Thread-first Activity embed layout |
| `ccee67362` | Two-pane comms workspace + cockpit proportions |
| `5694d491c` | Hide empty threads; cockpit flex height chain |
| `da5535ef8` | Activity thread workspace + composer polish |
| `0d87198ea` | Conversation topic rail + read pane |
| `a01921be5` | Correct participants, sender, channel defaults |
| *(final)* | Conversation topics + rich thread header + sprint closeout |
| *(final polish)* | Collapsed reply composer; post-send thread lifecycle; unified activity buttons; email subject topics / SMS session titles; orphan thread cleanup migration |

---

## Final operator polish (July 2026)

| Requirement | Implementation |
|-------------|----------------|
| **Thread lifecycle after send** | Confirm send keeps `selectedThreadId` (or opens `createdThreadId` for new message); clears composer; reloads timeline; `sendCompleteToken` collapses reply bar |
| **Email vs SMS topics** | Email: subject line as topic; SMS: session continuity, no day/week grouping, no message-subject fallback |
| **Thread rows** | Gmail-style: avatars, topic, participant names, preview, activity time, channel icon, unread dot, message count |
| **Thread header** | Topic, participants, channel, delivery state, relative time |
| **Composer** | Selected thread: timeline primary, collapsed Reply affordance; expand to compose; collapse after send. New Message: composer expanded immediately |
| **New Message mode** | Header + recipients + subject (email) + body + Send only — no empty-state panel |
| **Button doctrine** | `COMMS_ACTIVITY_PRIMARY_BTN_CLASS` / `COMMS_ACTIVITY_SECONDARY_BTN_CLASS` — Send, Later, BOS same height/radius |
| **Recipients** | First two chips + overflow; email CC/BCC; reply uses thread recipients only |
| **Staging cleanup** | `20260709120000_delete_orphan_empty_communication_threads.sql` removes zero-message orphan threads |

---

## Validation

| Area | Validated |
|------|-----------|
| SMS | Thread to single recipient; SMS default on reply; delivery labels; read hint |
| Email | Email default on reply; Opened when provider data present |
| Activity performance | Preview first paint; warm cache hit; flex fill height |
| Preview VM | Attached on row select; `workspaceFromPreview` bootstrap |
| Thread browsing | Topic rail; zero-message hidden; meaningful titles |
| Reply | Stays in thread; collapsed Reply → expand → Send reply → collapse; transport recipients |
| New Message | + New clears selection; Send; household recipients; opens created thread after first send |

**Automated:** `familyWorkspaceActivityEmbed.contract.test.ts`, `threadTopicPresentation.test.ts`, `timelinePresentation.test.ts`, `activityEmbedTextFormatting.test.ts`, `drawerFamilyWorkspacePrefetchTiming.contract.test.ts`, `npx tsc --noEmit`.

**Manual staging checklist:** Activity Focus Panel → Communications → verify topic titles, Kelly-only SMS thread, rich header (title / participants / SMS / Delivered / time), reply + new message flows.

---

## Deferred (next sprint)

- Attachments
- Rich editor (beyond lightweight formatting toolbar)
- Communications Settings / provider onboarding UI
- Test Email / Test SMS panel
- Compliance enforcement UX
- Inbound email configuration
- Announcements / Templates product improvements

---

## Related docs

- `docs/platform/modules/communications-platform.md` — Activity embed section
- `docs/platform/governance/runtime-ownership-migration-map.md` — Activity comms ownership
- `web/lib/communications/v2/familyWorkspace/THREAD_SEMANTICS.md` — transport vs operator model
