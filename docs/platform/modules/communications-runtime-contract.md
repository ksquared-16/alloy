---
owner: modules
status: canonical
last_reviewed: 2026-10-09
supersedes: []
---

# Communications runtime contract

**Status:** Canonical runtime doctrine (July 2026).

All Communications operator surfaces consume one runtime. Activity is the compact presentation; the Communications Workspace is the operational presentation. Runtime behavior must not be forked by surface.

## Ownership

| Owner | Responsibilities |
|-------|------------------|
| Communications runtime | Preview VM hydration, warm cache, thread selection, topic selection, composer draft, recipient selection, reply lifecycle, new-message lifecycle, send preflight/confirm, post-send refresh, stale request protection |
| Compact / Activity surface (`activity_embed`) | Compact layout, in-panel topic rail density, reduced metadata |
| Standard / Drawer surface (`default`) | Standard record-scoped presentation (`RecordCommunicationsTab`) |
| Expanded / Workspace surface (`workspace_inbox`) | Queue, larger layout, operational context panels, existing notes/tasks/triage controls |

### Workspace-only ownership

The Workspace surface — and only the Workspace surface — owns: the operational queue, queue selection, triage, assignment context, notes/tasks context, and (when later added) search, filters, announcements, and operational context panels. None of these belong to the runtime.

Applying a template is not Workspace-only: **Template ▾** is a composer presentation affordance in `FamilyCommunicationWorkspaceView`'s editor toolbar (every variant). It copies the Template Library's current version into the draft through `setSubjectDraft` / `setBodyDraft` and sends nothing; it is not runtime state.

### Non-fork rule

No surface may independently implement any of the following — they belong to the runtime alone:

- thread selection lifecycle
- draft lifecycle
- reply lifecycle
- new-message lifecycle
- send lifecycle (preflight, confirm, execution)
- hydration
- cache invalidation
- stale request handling

Presentation may differ (e.g. Activity exposes an in-panel topic rail and New Message button, while the Workspace switches conversations via the queue and composes new messages via the shell Compose action). Those are layout affordances that still drive the *same* runtime actions — they are not lifecycle forks.

**Temporary legacy exceptions:**

- `QuickMessageModal` (shell **Compose New** with person search and no record; and record-scoped launches when `comms_v2_command_center`, `comms_v2_record_tab` or `comms_v2_live_workspace` is off) keeps its own per-recipient `/api/admin/communications/send` (`quick_message`) lifecycle. Record-scoped launches against an opportunity no longer reach it while those flags are on (see *Record New Message composer*). Removal path: `ComposeNewCommunicationModal` already runs person-search compose on this runtime (`InboxModal`); retire `QuickMessageModal` once TopNav and the legacy `InboxPanel` use it.

## Record New Message composer (one composer, two entry points)

`FamilyNewMessageComposer` (`components/admin/communications/`) is the ONE record-scoped New Message composer. It is rendered by:

| Entry point | Host | `entryContext` | `workConsequence` | On Done |
|---|---|---|---|---|
| Current Work → Contact Family / Send Message / Tour Invitation | `CurrentWorkActionPanel` | `current_work` | `contact_family_work` | returns to the Focus Panel |
| Manage → Send Message / Email / SMS / Tour Invitation (any record-scoped `launchContextualQuickMessage` with an opportunity) | `RecordMessageComposerModal` (opened by the shell `TopNavBar`) | — | — | `onSendAcknowledged` closes the modal |

Both use this runtime and `family-send` (preview → confirm → send). What differs is passed in, never inferred:

- **`workConsequence`** — sent as `work_consequence`; `family-send` attempts the Contact Family association only when it is `contact_family_work`.
- **Tour invitation** — a prepared invitation id (`draftSeed.tourInvitationId`, or Insert ▾ Tour Invitation Link) is activated with `send_tour_invitation` `mode: "mark_sent"` after a confirmed send with at least one accepted recipient, from any host.
- **`onSendAcknowledged`** — a host that owns the acknowledgement keeps the success dialog and is called on Done instead of the runtime navigating into the created thread.

Presentation rules for this composer key on `[data-family-new-message-composer]` (never on a host), and its popovers/dialogs are registered in `escapeLayerOwnership.ts` (`COMPOSER_LAYER_SELECTOR`) so one Escape closes one layer.

## Inputs

| Input | Meaning |
|-------|---------|
| `customerId` or `{ entityType, entityId }` | Runtime scope |
| `channel` | Initial composer channel (`email` or `sms`) |
| `initialThreadId` | Optional thread to open immediately, used by Workspace queue selection |
| `initialPreviewVm` | Capped truthful first-paint VM |
| `surfaceVariant` | Presentation mode (`default`, `activity_embed`, `workspace_inbox`) |
| `composeIntent` / `draftSeed` | Command-driven New Message and its prefill (recipients, channel, subject/body, Tour invitation id) |
| `entryContext` | `current_work`: Done returns to the Focus Panel |
| `workConsequence` | Business Process consequence of a confirmed send, declared by the caller (`contact_family_work`); absent = none |
| `onSendAcknowledged` | Host callback on Done; the runtime then does not navigate into the created thread |

## State

The runtime owns:

- Current full `FamilyCommunicationWorkspaceVM`
- Loading/error/warm-cache indicators
- Selected thread id
- Composer mode/channel
- Selected recipients
- Subject and body drafts
- Send preflight/result/error state
- Sending state
- Post-send completion token

## Outputs

The runtime returns the canonical view state required by `FamilyCommunicationWorkspaceView`:

- Family, children, detail, health labels
- Thread list and selected thread
- Timeline messages and family timeline previews
- Recipient groups and selected recipients
- Workspace mode availability
- Send result and post-send token

## Actions

The runtime exposes:

- `openThread(threadId)`
- `startNewMessage()`
- `showAllMessages()`
- `setWorkspaceMode(mode)`
- `toggleRecipient(id)`
- `setSubjectDraft(value)`
- `setBodyDraft(value)`
- `send(confirm)`
- `dismissSendResult()`
- `refreshCurrent()`

## Lifecycle

1. Resolve first paint from shared warm cache, then Preview VM, then network.
2. Hydrate the full VM in the background without clearing valid displayed state.
3. On thread switch, increment the request sequence and apply only the latest response for the current selection.
4. On reply send confirmation, invalidate the shared runtime cache, reload the selected or created thread, clear the body draft, collapse reply mode, and scroll to the latest message.
5. On New Message confirmation, open the created thread when available (unless a host owns the acknowledgement), refresh the conversation, clear subject/body, and keep the selection deterministic.

## Events

| Event | Required behavior |
|-------|-------------------|
| Scope changes | Reset drafts, send result, selected thread, and stale request sequence |
| Thread opens | Reset body/send result and lock recipients to thread participants when resolvable |
| New Message starts | Clear selected thread, expand composer, restore default recipients |
| Send preflight | Show review result without mutating timeline |
| Send confirm | Refresh authoritative VM and emit post-send token |

## Cache contract

Runtime cache keys are `{customerId | entityType+entityId, composerChannel, threadId}`. The Workspace queue may warm the first selected conversation, but it must seed/read the same runtime cache used by Activity so the same conversation is not fetched twice across surfaces.

## Surface configuration

| Surface | Variant | Runtime behavior | Presentation |
|---------|---------|------------------|--------------|
| Activity | `activity_embed` | Auto-select first message-bearing thread, collapsed reply, Preview VM first paint | Compact topic rail and read pane |
| Workspace Inbox | `workspace_inbox` | Queue-selected thread, same reply/new-message/send lifecycle | Wider read pane and composer/context area |
| Default | `default` | Aggregate family timeline unless a thread is opened | Legacy full-width presentation |
