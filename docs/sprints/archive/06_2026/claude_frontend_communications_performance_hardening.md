# Claude Sprint 1 — Frontend + Communications Performance Hardening

**Path:** `docs/sprints/06_2026/claude_frontend_communications_performance_hardening.md`
**Status:** Planning (Card 0 complete — document only, no application code changed)
**Owner:** Claude
**Created:** 2026-06-03
**Goal:** Address the frontend/render and client-fetch performance issues uncovered in the communications + messaging audit, before moving on to layout configuration work.

**Related context:**
- `docs/system/adminv2-runtime-performance-doctrine.md` (locked runtime/reveal baseline — must not be regressed)
- `docs/sprints/06_2026/messaging_v2_audit.md`, `messaging_v2_design.md`, `messaging_v2_architecture.md`
- `docs/sprints/06_2026/adminv2_backend_query_payload_optimization_phase.md` (backend payload phase — out of scope here)

---

## 1. Audit summary

A focused performance audit was run over the communications + messaging frontend rooted at `web/`, excluding protected/owned surfaces (see § 5). The communications component tree is **~57 files / ~8,000 LOC**, dominated by a single monolith:

| File | LOC | Note |
|------|-----|------|
| `web/components/admin/communications/CommunicationsDrawerSection.tsx` | 1,318 | Monolithic drawer section — threads, messages, composer, recipients, bindings, filters, expansion all in one component |
| `web/components/adminV2/messaging/DrawerMessagingComposer.tsx` | 197 | Composer + recipient toggles |
| `web/components/adminV2/messaging/MessagingThreadMessageBubble.tsx` | 44 | Per-message bubble, rendered 50–200×, not memoized |
| `web/components/admin/communications/CommunicationsDrawerBackgroundLoader.tsx` | 27 | Always-mounted hidden prefetch wrapper, not memoized |

**Headline problem:** the communications drawer renders long message lists (50–200+ bubbles) inside a single 1,300-line component. Small, frequent state updates (filter toggle, message expansion, mark-read, unread-badge recount) re-render the entire tree, and per-message child components are not memoized. On top of this, message loading is an unbatched per-thread fetch (N+1) with no in-flight cancellation on filter change, so switching filter tabs re-fires all thread fetches.

The issues are **render-cost and client-fetch** problems — they do **not** touch the AdminV2 reveal/loading-gate contracts, which remain the locked baseline. Nothing in this sprint changes reveal behavior, cache keys, or known-empty semantics.

---

## 2. Prioritized findings

Severity is the audit's assessment of user-perceived impact. Each finding lists the anchor file:line.

### High

| # | Finding | Anchor |
|---|---------|--------|
| H1 | **Per-message bubble not memoized.** `MessagingThreadMessageBubble` is a plain function rendered 50–200×; any parent re-render (e.g. unread badge recount) re-renders every bubble. | `web/components/adminV2/messaging/MessagingThreadMessageBubble.tsx:16` |
| H2 | **Unread count recomputed every render.** `inboundUnreadCountForFilter()` is called inline (not memoized) for 3 filter tabs, fully scanning `msgs` 3× per render cycle. | `web/components/admin/communications/CommunicationsDrawerSection.tsx:1127` |
| H3 | **Monolithic component.** A single 1,318-line component owns threads, messages, composer, recipients, bindings, and UI filter state; every `setState` re-renders the whole tree (e.g. toggling one message expansion re-renders the composer + thread list). | `web/components/admin/communications/CommunicationsDrawerSection.tsx:286` |
| H4 | **Recipient lookup maps rebuilt on any recipient change / parent re-render.** Memoized but keyed on whole `recipients`; any edit (or new array reference from parent) rebuilds both maps. | `web/components/admin/communications/CommunicationsDrawerSection.tsx:351` |

### Medium

| # | Finding | Anchor |
|---|---------|--------|
| M1 | **N+1 message fetch with no cancellation.** Messages load one HTTP request per thread; switching filter tabs re-fires all of them with no `AbortController` (the prefetch path does this correctly; the drawer does not). | `web/components/admin/communications/CommunicationsDrawerSection.tsx:549` |
| M2 | **O(n²) mark-read merge.** After marking read, the full `msgs` array is mapped while checking each id against `inboundUnreadIds.includes()` (array, not Set). | `web/components/admin/communications/CommunicationsDrawerSection.tsx:620` |
| M3 | **Mark-read effect re-entry.** Effect deps include `msgs`; every `setMsgs` re-runs it and re-evaluates filter logic (guarded by a ref, but still runs). | `web/components/admin/communications/CommunicationsDrawerSection.tsx:602` |
| M4 | **Broad load-messages effect deps.** `loadConversationMessages` depends on `filteredThreadsByView`; every filter change rebuilds the callback and re-fetches all threads. | `web/components/admin/communications/CommunicationsDrawerSection.tsx:584` |

### Low / Medium-Low

| # | Finding | Anchor |
|---|---------|--------|
| L1 | **Background loader not memoized.** Always-mounted hidden wrapper re-renders on sibling updates and re-arms prefetch. | `web/components/admin/communications/CommunicationsDrawerBackgroundLoader.tsx:12` |
| L2 | **`Date.parse()` in sort comparator.** ~400 `Date.parse()` calls per 200-message sort, run on load and after each send. | `web/components/admin/communications/CommunicationsDrawerSection.tsx:944` |
| L3 | **Inline handlers in recipient buttons.** `() => onToggleRecipient(...)` created per render, defeating child memoization. | `web/components/adminV2/messaging/DrawerMessagingComposer.tsx:121` |
| L4 | **Heavy `emptyThreadsBody` memo.** 70-line memo with 7 deps including frequently-changing `recipients`. | `web/components/admin/communications/CommunicationsDrawerSection.tsx:987` |

---

## 3. Sprint cards

Cards are ordered to be **small and independently reviewable**. Each later card is gated on Card 0 (this document). **Only Card 0 is in flight; do not start application cards until the sprint owner approves.**

### Card 0 — Sprint document _(this card)_
- Create this document. No application code changes.
- Run `git status`, summarize changed files. **Done when** the doc exists and the only change is this file.

### Card 1 — Memoize the per-message bubble (H1)
- Wrap `MessagingThreadMessageBubble` in `React.memo` with an explicit comparator (`id`, `direction`, `channel`, `body`, `created_at`, read state).
- Touches: `MessagingThreadMessageBubble.tsx` only.
- Smallest, highest-leverage change; ship first.

### Card 2 — Memoize unread counts + Set-based mark-read merge (H2, M2)
- Compute the three filter unread counts once via `useMemo` keyed on `msgs`.
- Replace `inboundUnreadIds.includes()` with a `Set` lookup in the mark-read merge.
- Touches: `CommunicationsDrawerSection.tsx` (localized, no structural change).

### Card 3 — Cancel in-flight message fetches on filter change (M1, M4)
- Add an `AbortController` to the conversation-message load path; abort previous requests when the thread set / filter changes (mirror the prefetch path's existing pattern).
- Narrow the load effect's dependencies; bail out early when the current thread-id set is unchanged.
- Touches: `CommunicationsDrawerSection.tsx`. **No change to API contracts or reveal gates.**

### Card 4 — Cheap render-hygiene fixes (L1, L2, L3)
- `React.memo` on `CommunicationsDrawerBackgroundLoader` with an id/type comparator.
- Pre-compute timestamps before sorting instead of `Date.parse()` in the comparator.
- Stabilize recipient-button handlers (`useCallback` / data-attr delegation).
- Touches: `CommunicationsDrawerBackgroundLoader.tsx`, `CommunicationsDrawerSection.tsx`, `DrawerMessagingComposer.tsx`.

### Card 5 — Decompose the monolith (H3, H4, M3, L4) _(largest; may split or defer)_
- Extract `<ConversationPane>`, `<ComposerPane>`, `<ThreadFilters>` sub-components with local state; keep shared state (bindings, recipients) lifted.
- Split the mark-read effect (narrow deps) and the `emptyThreadsBody` memo into precomputed flags.
- This is the only structural card. If it grows beyond a reviewable diff, split per sub-component into 5a/5b/5c. **Behavior must be unchanged** — pure refactor.

---

## 4. Files in scope

Edited only within the approved cards above:

- `web/components/adminV2/messaging/MessagingThreadMessageBubble.tsx`
- `web/components/admin/communications/CommunicationsDrawerSection.tsx`
- `web/components/admin/communications/CommunicationsDrawerBackgroundLoader.tsx`
- `web/components/adminV2/messaging/DrawerMessagingComposer.tsx`
- New extracted sub-components under `web/components/admin/communications/` or `web/components/adminV2/messaging/` (Card 5 only)

Read-only reference (not edited): `web/lib/admin/communications/communicationsDrawerPrefetch.ts` (correct AbortController pattern to mirror).

---

## 5. Files out of scope

Hard boundaries for this sprint — **not touched without explicit approval**:

- **Lifecycle files** — anything with `lifecycle` in the path (`web/**/lifecycle/**`, `web/lib/lifecycle*`, etc.).
- **Cursor-owned files** — any file owned by Cursor. (No mechanical marker exists in-repo; confirm ownership before editing any file not listed in § 4.)
- **AdminV2 runtime reveal files** — `web/lib/adminV2/**/*RevealGate.ts`, `*PageLoadingGate*`, `web/lib/adminV2/runtime/contract/`, composed-drawer payload modules. Protected per `adminv2-runtime-performance-doctrine.md`; edit only with explicit approval.
- **`AdminEntityDrawer`** — no refactor.
- **Work-unit page** — `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/**` — no refactor.
- **Migrations** — `supabase/migrations/**` and any DB migration — not touched without explicit approval.
- **Backend** — `backend/**` and API route contracts. This sprint is frontend-render + client-fetch only; the backend payload phase is tracked separately in `adminv2_backend_query_payload_optimization_phase.md`.

---

## 6. Test plan

Per card, before requesting review:

1. **Type + lint:** `npm run lint` / `tsc` (or repo equivalent) clean on touched files.
2. **Existing communications tests:** run `web/tests/communications` and `web/tests/adminV2/bos/communication` suites; all green.
3. **Render-behavior parity (manual):** open the communications drawer on a person/entity with a populated thread and verify, before vs. after:
   - Threads, messages, composer, recipients, and bindings render identically.
   - Filter tabs (All / Email / SMS) switch correctly; unread badges match.
   - Mark-as-read still clears unread badges; sending a message appends + sorts correctly.
   - Empty / no-recipient / unconfigured-outbound states unchanged.
4. **Reveal-contract guard:** confirm the AdminV2 loading gate / reveal behavior is unchanged (no new above-fold skeletons, no shell-first assembly) — see doctrine § Required tests; run determinism tests if a card touches anything cache-key adjacent (none planned).
5. **Render-count spot check (Cards 1–5):** with React DevTools Profiler, confirm toggling one message expansion or filter tab no longer re-renders all message bubbles.
6. **Network spot check (Card 3):** in the Network panel, confirm rapid filter switching cancels prior in-flight message requests instead of completing all of them.

A card is not "review-ready" until items 1–3 pass and the card's own targeted item (5 or 6) is demonstrated.

---

## 7. Rollback plan

- Each card is a **separate, small commit** on the sprint branch (`claude/objective-haslett-1b7957`), independently revertable.
- Cards 1–4 are localized and low-risk; rollback = `git revert <card commit>`.
- Card 5 (decomposition) is the only structural change and is behavior-preserving; if a regression appears, revert the Card 5 commit(s) to restore the monolith with Cards 1–4 still in place.
- No migrations, no API contract changes, no reveal-gate changes — so there is **no data or runtime-contract rollback surface**; all rollback is pure frontend code revert.
- If a regression is found post-merge, revert the offending card commit on `main` and re-open that card; earlier cards remain shipped.

---

## 8. Definition of done

**Card 0 (this card):**
- [x] This document exists at the specified path.
- [x] No application code modified.
- [x] `git status` run and changed files summarized.

**Sprint (all approved cards):**
- [ ] High findings H1–H4 resolved; Medium M1–M4 resolved or explicitly deferred with rationale.
- [ ] No regression in communications drawer behavior (test plan § 6 items 1–4 pass on every card).
- [ ] Measurable render reduction demonstrated on Cards 1 and 5 (Profiler spot check); in-flight fetch cancellation demonstrated on Card 3.
- [ ] AdminV2 reveal/loading-gate contracts unchanged; no out-of-scope file touched.
- [ ] Each card landed as its own reviewable commit with passing checks.
- [ ] No lifecycle, Cursor-owned, AdminEntityDrawer, work-unit, migration, or backend files modified.
