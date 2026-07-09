# Communications Activity Sprint — Closeout (July 2026)

**Status:** Complete — merged and frozen on `staging` (`7773bec43`).  
**Branch:** `promote/comms-pr2-staging` → `origin/staging`  
**Scope:** Focus Panel Activity `activity_embed` communications only. Command Center modal, send runtime, provider setup, compliance, and inbound email **unchanged**.

---

## Objective

Make Communications Activity a production-ready operator workspace inside the Focus Panel Activity cockpit — instant first paint, obvious conversation topics, reading-first reply flow, and thread continuity after send — without redesigning the platform send path or Command Center modal.

---

## Completed work

| Area | Outcome |
|------|---------|
| **Activity activation** | Communications tab renders real family workspace on record select |
| **Preview VM (Path C)** | `communicationsPreviewVm` on Focus Panel payload for first paint |
| **Warm cache** | `drawerFamilyWorkspacePrefetchCache` — instant revisit |
| **Topic rail** | Gmail-style thread browser; zero-message threads hidden |
| **Conversation topics** | Business titles (Enrollment Packet, General, …); channel icon = transport only |
| **Thread header** | Topic, participants, channel, delivery state, relative time |
| **Reply vs New Message** | Collapsed reply composer; post-send thread retention; new message opens created thread |
| **Recipients** | Thread-accurate participants (Kelly-only SMS fixed); compact To row + overflow |
| **Sender labeling** | "Sent by you" / "Sent from Alloy" — not drawer assignment |
| **Button doctrine** | Unified Activity primary/secondary buttons (Send, Later, BOS) |
| **Formatting toolbar** | Bold, italic, underline, lists, link (lightweight) |
| **Cockpit layout** | Flex height chain — topic rail \| read pane \| composer |
| **Staging cleanup** | Orphan zero-message thread migration |

---

## Architecture

### Embedded workspace load (canonical)

```
Selected Record
        ↓
Preview VM (communicationsPreviewVm)
        ↓
Immediate render (activity_embed)
        ↓
Background hydrate (prefetch full VM)
        ↓
Full Workspace VM
        ↓
Warm cache on revisit
```

Full doctrine: [`communications-preview-vm-doctrine.md`](./communications-preview-vm-doctrine.md).

### Ownership

| Concern | Owner |
|---------|-------|
| Activity layout / flex chain | `OpportunityFocusPanelEmbeddedWorkspace.tsx`, `alloyOsRuntime.css` |
| Activity **presentation** | `FamilyCommunicationWorkspaceView.tsx` (`activity_embed` only) |
| Activity **data + send** | `FamilyCommunicationWorkspace.tsx`, `family-send` API |
| Topic / participant derivation | `threadTopicPresentation.ts` |
| Preview VM | `resolveFamilyCommunicationWorkspacePreview.ts` |
| Warm cache | `drawerFamilyWorkspacePrefetchCache.ts` |

See `docs/platform/governance/runtime-ownership-migration-map.md`.

---

## Preview VM

- **Type:** `FamilyCommunicationWorkspacePreviewVM`
- **Attached at:** Row select → drawer/focus VM compose
- **Bootstrap:** `workspaceFromPreview()` in `FamilyCommunicationWorkspace.tsx`
- **Caps:** Recent threads + timeline events (truthful minimum for first paint)
- **Not included:** Full message history per thread, send confirmation, provider state

---

## Thread model

**Operator model:** Conversation topics in a topic rail — business meaning first.  
**Transport model:** `communication_threads` keyed by org + entity + channel + recipient_key (one thread per recipient/channel session).

| Channel | Topic source | Grouping |
|---------|--------------|----------|
| **Email** | Email subject line | By subject (thread subject → message subject → metadata → General) |
| **SMS** | Conversation session | By transport thread continuity — **not** by day/week |

Activity UI merges transport threads into a topic rail via `threadsForActivityTopicRail` (filters `messageCount > 0`).

Detail: `web/lib/communications/v2/familyWorkspace/THREAD_SEMANTICS.md`.

---

## Conversation lifecycle

### Reply (thread selected)

1. Operator selects topic in rail
2. Timeline shows full thread history (reading primary)
3. Collapsed **Reply** bar at bottom
4. Click Reply → composer expands; channel + recipients locked to thread transport
5. Send → message appears in timeline; composer clears; reply bar collapses; **thread stays selected**

### New Message

1. Operator clicks **+ New**
2. Header: "New Message" — recipients, subject (email), body, Send
3. Composer expanded immediately; household default recipients
4. Send → lands in newly created thread; no longer in New Message mode

---

## Performance

| Path | Behavior |
|------|----------|
| **First Activity paint** | Preview VM — no blank shell |
| **Background hydrate** | Full VM fetch while preview visible |
| **Warm load** | Cache hit on same family + thread signature |
| **Timing infrastructure** | `markDrawerFamilyWorkspaceTiming` — dev-only `performance.mark` (retained) |

Protected: `docs/system/adminv2-runtime-performance-doctrine.md` — no section-owned above-fold skeletons; no false empty queue states.

---

## Testing

### Automated (executed at closeout)

```bash
cd web && npm run test -- \
  tests/communications/familyWorkspaceActivityEmbed.contract.test.ts \
  tests/communications/threadTopicPresentation.test.ts \
  tests/communications/timelinePresentation.test.ts \
  tests/communications/activityEmbedTextFormatting.test.ts \
  tests/communications/drawerFamilyWorkspacePrefetchTiming.contract.test.ts \
  tests/communications/drawerFamilyWorkspacePrefetchCache.test.ts
```

### Manual QA (staging operator workflow)

| Scenario | Expected |
|----------|----------|
| **New Email** | + New → email mode → subject + body → Send → created/open thread |
| **New SMS** | + New → SMS mode → no subject → Send → new SMS session thread |
| **Reply Email** | Select email thread → Reply → send → stays in thread; subject hidden |
| **Reply SMS** | Select SMS thread → Reply → SMS channel locked; Kelly-only recipients |
| **Thread selection** | Topic rail shows avatars, preview, count, channel icon |
| **Post-send** | Thread remains selected; timeline scrolls to latest |
| **Recipients** | Kelly only / Kelly+Kristi / reply vs new message defaults |
| **Channels** | Email/SMS default from thread on reply; operator choice on new |
| **Performance** | Preview first paint; warm second load |
| **Layout** | Thread browser, read pane, collapsed composer, Work Items, Documents |
| **Command Center** | Modal layout unchanged (`grid-cols-[minmax(0,1fr)_minmax(380px,1.35fr)]`) |

---

## Validation

| Check | Status |
|-------|--------|
| Merge to `origin/staging` | `7773bec43` |
| Orphan thread migration committed | `20260709120000_delete_orphan_empty_communication_threads.sql` |
| Focused comms tests | Pass |
| Typecheck | Run locally — `cd web && npm run typecheck` |
| Vercel staging deploy | Triggered on push to `staging` |

---

## Deferred — next Communications sprint

**Do not implement on this branch.** These become the next sprint scope:

| Item | Notes |
|------|-------|
| Attachments | Composer attach flow |
| Rich editor | Beyond lightweight formatting toolbar |
| Communications Settings | Provider bindings UI |
| Provider onboarding | Self-service setup |
| Diagnostics | Operator-facing deliverability tools |
| Test Email | Settings test panel |
| Test SMS | Settings test panel |
| Compliance | Enforcement UX |
| Inbound Email | Configuration UI |
| Announcements / Templates | Product expansion |

---

## Major commits (staging)

| Commit | Summary |
|--------|---------|
| `4772dd094` | Warm family-workspace cache |
| `63e212a16` | Preview VM on Focus Panel payload |
| `fdf7f5d7a` | Thread-first Activity embed |
| `0d87198ea` | Conversation topic rail |
| `a01921be5` | Participants, sender, channel defaults |
| `ef39c610f` | Final operator polish — collapsed reply, send lifecycle |
| `7773bec43` | Merge to staging (includes focus-panel polish) |

---

## Related docs

- [`communications-preview-vm-doctrine.md`](./communications-preview-vm-doctrine.md)
- `docs/platform/modules/communications-platform.md`
- `docs/platform/foundation/architecture.md`
- `docs/platform/governance/runtime-ownership-migration-map.md`
- `web/lib/communications/v2/familyWorkspace/THREAD_SEMANTICS.md`

---

**Sprint frozen.** Next Communications work starts on a new branch as a separate sprint.
