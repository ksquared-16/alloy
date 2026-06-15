# UI-5B — Real Family Thread Aggregation + Message Timeline

**Commit:** `2b45a9b` (UI-5A) → `8d19075`. Bundle: `communications-v2-ui5b-thread-aggregation.bundle`.
**Scope honored:** family on `customers`, children from `customer_members`, parent/guardian from `customer_persons → persons` (UI-5A). New in 5B: real thread aggregation + message timeline. Composer stays inert. **No visual redesign, no consent enforcement, no send-path changes, no migrations.**

## 1. Implementation

- **Types** (`familyWorkspace/types.ts`): real `ThreadVM` + `TimelineEventVM` replace the 5A stubs. VM now carries `threads[]`, `selectedThread`, `messages[]` (selected thread), `timelineEvents[]` (aggregated, chronological asc).
- **Aggregation (pure)** `aggregateFamilyTimeline.ts`: dedups threads, sorts by last activity, tags each thread with `childId` (via `customer_members.person_id → member id`) / `opportunityId`, counts messages per thread, builds the chronological timeline, and picks the selected thread (newest by default, or an explicit `thread_id`).
- **Load (I/O)** `loadFamilyThreadsData.ts`: pulls `communication_threads` for the family across **three entity scopes** — `customer` (the household), `person`/`child` (all family persons), `opportunity` (the family's opportunities) — dedups, then loads recent `communication_messages` for those threads (caps: 50 threads / 300 messages).
- **Resolver**: loads family data (5A) + threads/messages, passes both to the pure assembler.
- **Adapter** `resolveCustomerIdFromWorkspaceEntry.ts`: queue entry → customer id (explicit → thread `customer` primaryEntity → opportunity.customer_id).
- **UI** (`CommandCenterShell.tsx`): behind **`comms_v2_live_workspace` (default OFF)** — when on, the conversation column fetches the workspace VM and renders **real messages** (maps `timelineEvents` → the existing chat), children come from the VM, and **clicking a message opens/selects its thread** (re-fetches that thread's messages via `?thread_id=`). Flag OFF ⇒ UI-4H render is byte-identical (fixtures).

## 2. Tests

New (vitest, `web/tests/communications/v2/`): `aggregateFamilyTimeline.test.ts` (timeline order, dedup/sort, child/opportunity tagging, per-thread counts, default + explicit selection), `resolveCustomerIdFromWorkspaceEntry.test.ts`. Plus the 5A suites still apply.

Sandbox verification (can't run vitest here): all modules strip-type-check; two Node logic harnesses pass **39/39** assertions (23 roster/eligibility + 16 aggregation/adapter/assemble-with-comms). `CommandCenterShell.tsx` is JSX (not strip-checkable) — braces/geometry verified; live path is flag-gated.

Run on the gate: `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/`

## 3. API contract changes

`GET /api/admin/communications/family-workspace` (dark behind `comms_v2_command_center`):

- **New query param** `thread_id` (optional) — selects a thread; its messages populate `workspace.messages`.
- **Response `workspace`** now returns populated `threads: ThreadVM[]`, `selectedThread`, `messages: TimelineEventVM[]` (selected thread), `timelineEvents: TimelineEventVM[]` (aggregated). `healthSummary` still stub (5C).
- **`meta`** adds `thread_count`, `message_count`, `selected_thread_id`.
- **Unchanged:** auth, envelope shape, 400/404/500 behavior. Per-thread message detail still uses the existing `GET /api/admin/communications/threads/[threadId]/messages`.

`ThreadVM` = `{ id, subject, channel, primaryEntity{type,id}, childId, opportunityId, lastActivityAt, messageCount, unread, slaState, attentionState }`.
`TimelineEventVM` = `{ id, threadId, direction, channel, body, createdAt, kind, deliveredAt, openedAt, repliedAt }`.

New flag: `comms_v2_live_workspace` → `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE`.

## 4. Migration requirements

**None.** UI-5B is read-only aggregation over existing tables (`communication_threads`, `communication_messages`, `customer_members`, `customer_persons`, `opportunities`). No schema, no migrations, no seeds.

Note: `opened_at`/`replied_at` live on `communication_message_recipients` (not on `communication_messages`), so 5B leaves those `null` in `TimelineEventVM` (receipts join is a later, additive step — no schema needed). Per-thread `unread` is `0` for now (read-state join deferred).

## 5. Manual QA (staging)

Prereq: a Firefly **customer** with `customer_members` (children), `customer_persons` (parents), and at least one `communication_thread` (+ messages) keyed to the customer / a family person / an opportunity.

1. Import: `git fetch <bundle> refs/heads/communications-v2-reroot && git merge --ff-only FETCH_HEAD`; `cd web`.
2. `npx tsc --noEmit` and `npm run test -- tests/communications/v2/` → green.
3. **API:** `curl '/api/admin/communications/family-workspace?customer_id=<firefly customer id>'` → `workspace.threads` lists the family's threads (newest first), `timelineEvents` is the merged chronological history, `meta.thread_count`/`message_count` non-zero. Add `&thread_id=<one thread>` → `workspace.messages` = that thread's messages; `meta.selected_thread_id` set.
4. **UI (live):** in `web/.env.local` set `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1`, `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE=1`, and put the real customer id on a fixture in `fixtures.ts` (`FIXTURE_FAMILY_DETAILS["fx-rivera"].customerId = "<id>"`) — or wire the queue to customers. `npm run dev`, open the modal, select that family → the conversation column shows **real messages**; click a message → it selects/opens that thread (column shows that thread's messages). Composer remains inert.
5. **Lock check:** unset `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE` → the conversation column is byte-identical to UI-4H (fixtures).

## Deviations / notes

- The live UI path needs a **customer id per queue entry**; the queue is still fixtures, so the demo requires pasting a real customer id into one fixture (or wiring the queue to customers — a separate step). The `resolveCustomerIdFromWorkspaceEntry` adapter is in place for that.
- `fixtures.ts` and `CommandCenterShell.tsx` (locked UI) were edited **additively and behind the OFF-by-default flag**; the default UI-4H render is unchanged.
