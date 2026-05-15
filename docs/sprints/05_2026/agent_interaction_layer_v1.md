# Sprint: Agent UX / Interaction Layer V1 — Universal command surface

**Path:** `docs/sprints/05_2026/agent_interaction_layer_v1.md`  
**Status:** **Interaction Layer V1 complete** (Cards **0–7**). Cards **1–5** shipped universal command surface; Cards **6–7** removed header Assistant, aligned docs, hardened tests.  
**Prerequisite (shipped):** `docs/sprints/05_2026/task_assist_v1_1.md` (Cards **0–9** — Task Assist backend + command bar pivot, entity-search, intent routing).  
**Non-goals (V1 interaction layer):** New backend send/schema routes; autonomous agents; bulk send; **Workflow Assist execution** (Agent #3); LLM-required parsing (optional gated extract-only is a **later** card, not V1 default).

**Problem:** The bottom **`AICommandSurfaceShell`** works but reads like **two products stitched together** — visible **Task Assist / Job layout** tabs, **Find target**, **Preview** language, mode-gated Enter, and a full **`TaskAssistOpportunityWorkspace`** form in the tray. Operators should experience **one persistent assistant** at the bottom: type naturally, see a **thread**, confirm **action cards**, never wonder which “mode” they are in.

**North star:** One command/chat surface; **intent router** picks the right agent capability; **search + deterministic parse** resolve entity + goal; **thread state** holds the conversation; **approval cards** gate all side effects. **No auto-send.**

---

## Card 0 — Audit findings (2026-05-15)

### 0.1 Files inspected

| Area | Path(s) | Finding |
|------|---------|---------|
| **Command shell** | `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` (~1.2k LOC) | **Monolith** — job overview preview/apply + Task Assist resolution + mode tabs + dual buttons (**Preview** / **Find target**). **`taskAssistBarMode`** gates Enter and preview. Tray mounts full **`TaskAssistOpportunityWorkspace`**. |
| **Job layout** | `web/lib/admin/agentLab/overviewLayoutSemanticAssistant.ts`, `aiCommandSurfaceModel.ts` | **Separate pipeline:** `runOverviewLayoutSemanticPreview` → structured JSON → Apply → record overview layout API. Uses **Preview / Apply / Details / Advanced** vocabulary. **No** entity search. Works only when operator is in **job_overview** mode (default tab). |
| **Task Assist parse** | `web/lib/agent/taskAssist/taskAssistCommandIntent.ts`, `taskAssistCommandBarResolution.ts` | **Task Assist–scoped** only. No top-level route to job layout. **`parseTaskAssistCommandIntent`** + **`looksLikeAmbientOnlyCommand`**. Workflow block message: “not Task Assist” (product wants **Workflow Assist coming next**). |
| **Entity search** | `web/lib/agent/taskAssist/taskAssistEntitySearchService.ts`, `web/app/api/admin/ai/task-assist/entity-search/route.ts` | **Read-only**, org-scoped, opportunities + optional customer→opp. **Persons deferred.** Search **`q`** comes from **`search_text_hint`** — quality depends on parser. |
| **Context** | `web/contexts/GlobalAssistantContext.tsx`, `adminV2CommandBarEvents.ts` | **`commandSurfaceMode`**: `job_overview` \| `task_assist` — **leaked to UI** as tabs. **`currentContext`** for opportunities. **`focusCommandBar({ preferMode })`** — mode in focus API. |
| **Drawer** | `web/components/admin/taskAssist/TaskAssistOpportunityLauncher.tsx` | **`openAssistantWithContext`** → sets context + **`task_assist`** mode + focus. Copy still references “bottom assistant bar.” |
| **Header** | `web/app/adminV2/components/TopNavBar.tsx` | **Assistant** button → **`focusCommandBar()`** only; redundant if bar is universal home. |
| **Shell mount** | `web/app/adminV2/components/AdminV2Shell.tsx` | **`GlobalAssistantProvider`** + persistent bottom bar + **`pb-[96px]`** reserve. |
| **Tests** | `web/tests/agent/taskAssist/*`, `web/tests/agent/adminV2AiCommandSurfaceModel.test.ts` | Contract tests **assert mode tabs** and **Find target** — will need rewrite in Card 4+. |
| **Docs** | `docs/sprints/05_2026/task_assist_v1_1.md`, `docs/product/ai-system.md`, `communications.md`, `crm-system.md` | Describe **Card 9** accurately but **mode tabs**, **Find target**, header **Assistant** — stale relative to this sprint goal. |

### 0.2 UX / architecture gaps (summary)

| Gap | Current | Target (Interaction Layer V1) |
|-----|---------|------------------------------|
| **Visible modes** | Tabs: Task Assist \| Job layout | **No tabs** — router picks capability from NL + page context |
| **Primary action** | Preview (job) / Find target (Task Assist) | **Single Send/Go** on one input (or Enter only) |
| **State** | Ephemeral `commandText` + local resolve enum | **Persistent thread** (messages + cards) per session |
| **Task Assist UI** | Full workspace form in tray | **Action cards** in thread (draft / schedule / reminder) with approve |
| **Entity NL** | Weak **`search_text_hint`** (strips **`family`**, brittle **`about`**) | **Structured extract**: entity phrase vs message goal vs timing |
| **Job layout** | Separate code path, mode-gated | Same input; router → layout **proposal card** |
| **Workflow NL** | Hard block | **Inform + stop** — “Workflow Assist — coming next” (no config) |
| **Header** | Assistant link | **Remove** — bottom bar is always the entry |

### 0.3 Entity extraction weakness (concrete)

Example: **`text the Mitchell family about excited for youngest child to start`**

| Field | Desired | Current heuristic risk |
|-------|---------|-------------------------|
| **Intent** | `draft_message` (SMS) | Likely OK (`text` → sms) |
| **Entity search** | `Mitchell family` | **`buildSearchTextHint` removes `family`** → may search **`Mitchell`** only; goal bleed if **`about`** regex fails on long/clausal text |
| **Message goal** | `excited for youngest child to start` | **`ABOUT_RE`** may truncate or miss non-`about` phrasing (“to let them know…”, “saying…”) |

Root causes:

1. **Parser is Task Assist–local**, not a shared **command NL → slots** layer.
2. **Search hint** uses aggressive **`SEARCH_STOP`** and drops **`family`**.
3. **No slot grammar** — order is strip verbs → match `about` → remainder = search (fragile).
4. **No thread** — each Enter is a one-shot; no clarifying follow-up turn.

### 0.4 What to preserve (hard constraints)

- All **existing admin routes** (propose, apply, proposals, entity-search, scheduled-sends, operational-tasks, job layout apply APIs).
- **No auto-send**, **no bulk**, **no workflow config** in Task Assist paths.
- **Org scope + RLS + access dimensions** on search unchanged unless Card 2 explicitly extends persons with security review.
- **Opportunities-first** for Task Assist actions (V1.1 scope).

---

## Card 0 — Design lock (recommended UX architecture)

### UX doctrine

1. **One surface** — The bottom bar is **the** Alloy assistant for AdminV2; not “Task Assist mode” vs “Job mode.”
2. **Conversation, not forms-first** — Operator sees **their message**, then **assistant turns** (text + structured cards). Full workspace controls move **inside cards** or **expand from cards**, not as default chrome.
3. **Confirm before side effects** — Search resolves **candidates**; actions show **proposal cards**; send/schedule/task **only** on explicit approve (existing server gates unchanged).
4. **Progressive disclosure** — Advanced JSON / layout diff / proposal lists **collapsed** behind card expand or “Details,” not default tray layout.
5. **Honest limits** — Workflow-like asks get a **clear future message**, not silent failure or wrong agent.
6. **Not autonomous** — No background execution; thread is **operator-driven** turn-by-turn.

### Architecture (target)

```
AdminV2Shell
└── GlobalAssistantProvider          ← rename/evolve: session + ambient context (optional)
    └── AICommandSurfaceShell        ← thin shell: input + thread viewport
        ├── CommandSurfaceThread     ← NEW: message list + cards (state owner)
        ├── CommandSurfaceInput      ← NEW: single input, always visible
        └── (no mode tabs)

Submit flow:
  Input → commandSurfaceRouter.parseAndRoute(text, ambientContext, pageContext)
        → thread.append(userMessage)
        → thread.append(assistantTurn | candidateList | clarify | workflowNotice)
        → on entity confirmed → thread.append(actionCard)
        → on card approve → existing APIs (propose/apply/schedule/task/layout apply)
```

### Intent routing model (unified router)

**New module (proposed):** `web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts`

| Route | Signals (deterministic V1) | Handler |
|-------|---------------------------|---------|
| **`workflow_future`** | Existing workflow regex family | Assistant message only — no API |
| **`task_assist_*`** | Message/reminder verbs, comms vocabulary, opportunity context | Reuse + extend **`parseTaskAssistCommandIntent`** |
| **`job_layout`** | Layout/overview vocabulary **or** current route is job record overview **and** no comms intent | Reuse **`runOverviewLayoutSemanticPreview`** |
| **`clarify`** | Unknown + no entity + no ambient | Assistant ask one short question |
| **`entity_search`** | Named entity fragment without resolved **`entity_id`** | **`entity-search`** API |

**Precedence (locked for V1):**

1. Workflow block (inform only)  
2. If **`currentContext`** + pronoun-only → skip search, offer confirm card  
3. If comms/reminder intent → Task Assist path  
4. Else if layout intent OR (on job overview surface AND no comms) → job layout path  
5. Else entity search if name-like fragment  
6. Else clarify  

**No `commandSurfaceMode` in UI.** Optional internal **`lastRoute`** for analytics only.

### Command state model (thread)

**Proposed types:** `web/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes.ts`

```typescript
type CommandSurfaceThreadMessage =
  | { id: string; role: "user"; text: string; at: string }
  | { id: string; role: "assistant"; kind: "text"; text: string; at: string }
  | { id: string; role: "assistant"; kind: "entity_candidates"; candidates: TaskAssistEntitySearchCandidate[]; at: string }
  | { id: string; role: "assistant"; kind: "entity_confirm"; candidate: ...; at: string }
  | { id: string; role: "assistant"; kind: "action_card"; card: CommandSurfaceActionCard; at: string }
  | { id: string; role: "assistant"; kind: "workflow_notice"; at: string };

type CommandSurfaceActionCard =
  | { type: "task_assist_draft"; entityId; channel; instruction; proposalPreview?: ... }
  | { type: "task_assist_schedule"; ... }
  | { type: "task_assist_reminder"; ... }
  | { type: "job_layout_preview"; planner: JobOverviewPlannerSuccess; structuredJson: string };
```

**Persistence V1:** In-memory thread in React state + optional **`sessionStorage`** key per AdminV2 tab (no server thread table in V1). Clear on org switch / sign-out.

**Confirmed entity** lives on thread session: `{ entity_type, entity_id, label }` — merges with **`GlobalAssistantContext.currentContext`** (drawer may seed; thread is authoritative after confirm).

### Entity extraction fix (Card 2 design)

**Replace ad-hoc strip pipeline with slot extraction:**

| Slot | Extraction rule (V1 deterministic) |
|------|-------------------------------------|
| **`verb`** | Leading comms/layout verb group |
| **`entity_phrase`** | Pattern after verb: `(the\|a)? {Name} (family\|household)?` **before** goal delimiter |
| **`goal_phrase`** | After delimiter: `about`, `regarding`, `to say`, `saying`, `that`, `—` |
| **`timing_phrase`** | Trailing or embedded timing tokens (moved to schedule slot) |

**Do not strip `family` from entity search.** Pass **`entity_phrase`** trimmed (max 64 chars) to **`entity-search`**.

**Example parse:**

| Input | entity_phrase | goal_phrase | intent |
|-------|---------------|-------------|--------|
| `text the Mitchell family about excited for youngest child to start` | `Mitchell family` | `excited for youngest child to start` | `draft_message`, sms |

**Tests:** Golden table in **`commandSurfaceSlotExtract.test.ts`**.

### Action card model (Card 5)

Cards are **assistant thread items**, not a separate panel.

| Card | Shows | Primary actions | API on approve |
|------|-------|-----------------|----------------|
| **Entity pick** | 1–N rows | Select → confirm card | — |
| **Entity confirm** | Single row + intent summary | Confirm | Sets session entity |
| **Draft message** | Channel, instruction, recipient preview (after propose) | **Draft** → review body → **Send** / Save | `propose`, `apply`, proposals |
| **Schedule send** | Time, channel, body preview | **Save schedule** | `communication-scheduled-sends` |
| **Reminder** | Title, due | **Create task** | `operational-tasks` |
| **Job layout** | Human diff summary | **Apply layout** / Dismiss | existing layout apply |

**Reuse** validators and **`TaskAssistOpportunityWorkspace`** logic by **extracting hooks/services** — workspace becomes implementation detail behind cards, not default tray UI.

### Component plan

| Component / module | Responsibility |
|--------------------|----------------|
| **`AICommandSurfaceShell.tsx`** | Layout: thread + pinned input; wire router submit |
| **`CommandSurfaceThread.tsx`** | Render messages + cards; scroll management |
| **`CommandSurfaceInput.tsx`** | Single textarea + submit; placeholder: natural language |
| **`CommandSurfaceEntityCard.tsx`** | Candidates + confirm |
| **`CommandSurfaceTaskAssistCards.tsx`** | Draft / schedule / reminder cards |
| **`CommandSurfaceJobLayoutCard.tsx`** | Layout preview card (wraps existing OutcomeZone semantics) |
| **`commandSurfaceRouter.ts`** | Unified intent + route |
| **`commandSurfaceSlotExtract.ts`** | Entity / goal / timing slots |
| **`commandSurfaceThreadState.ts`** | Reducer or immutable append helpers |
| **`GlobalAssistantContext.tsx`** | **Evolve:** drop **`commandSurfaceMode`** from public API; keep **`currentContext`**, **`focusCommandBar`** (no preferMode), drawer integration |
| **`TaskAssistOpportunityLauncher.tsx`** | **`seedContext` + focus** — no mode switch |
| **`TopNavBar.tsx`** | **Remove Assistant button** (Card 6) |

### Workflow Assist messaging (design lock)

When workflow regex matches:

> **That sounds like Workflow Assist. This is coming next.**  
> Task Assist can draft messages, schedule sends, and create reminders for an opportunity — try rephrasing without automation rules.

No route execution; no workflow table writes.

---

## Implementation cards (preferred order)

| Card | Name | Exit criteria |
|------|------|----------------|
| **0** | **Audit + design lock** | **This doc** approved; Card 0 checklist signed. **No product code.** |
| **1** | **Command intent router cleanup** | **`commandSurfaceRouter.ts`**; unified precedence; workflow notice copy; job vs Task Assist routing tests; **no UI tabs removed yet**. |
| **2** | **Entity extraction / search query** | **`commandSurfaceSlotExtract.ts`**; fix Mitchell-family case; **`family` preserved**; golden tests; wire to **`entity-search`** `q`. |
| **3** | **Thread state model** | Types + reducer + in-memory session; user/assistant messages; candidate + confirm items; tests without full UI. |
| **4** | **Unified command bar UI** | Remove mode tabs, **Find target**, dual Preview button; single input; thread viewport; Enter → router → thread append. |
| **5** | **Task Assist action cards** | Replace tray **`TaskAssistOpportunityWorkspace`** default with cards; approve → existing APIs; no auto-send. |
| **6** | **Header + stale doc cleanup** | **Done** — removed **`TopNavBar`** Assistant; updated sprint + product docs; launcher copy; **`commandSurfaceMode`** internal-only in docs. |
| **7** | **Tests + docs hardening** | **Done** — **`commandSurfaceInteractionLayerContract.test.ts`**, updated **`topNavBarAssistantTrigger.test.tsx`**, router/slot/thread tests; manual QA checklist below. |

**Explicitly deferred (post–Interaction Layer V1):** LLM slot extract; persons search; thread persisted server-side; right-column layout; Workflow Assist execution.

---

## Test plan

| Area | Tests |
|------|--------|
| **Router** | `commandSurfaceRouter.test.ts` — job vs Task Assist vs workflow vs clarify |
| **Slots** | `commandSurfaceSlotExtract.test.ts` — Mitchell family + goal; pronoun ambient |
| **Thread** | `commandSurfaceThreadState.test.ts` — append, confirm entity, card lifecycle |
| **Entity search** | Existing **`taskAssistEntitySearchRoute.test.ts`** — unchanged contracts |
| **Task Assist APIs** | Existing **`tests/agent/taskAssist/**`** — regression |
| **UI contracts** | Replace **`data-adminv2-command-surface-mode-tabs`** assertions with **`data-command-surface-thread`** |
| **Top nav** | Remove **`data-global-assistant-header-trigger`** expectation |

**Manual QA (staging — post Cards 1–7):**

- [ ] No visible Task Assist / Job layout tabs; no header **Assistant** link.
- [ ] One **Ask** input; Enter submits; thread shows user bubble + assistant response.
- [ ] `text the Mitchell family that we're excited for her youngest child to start` → search **Mitchell family** (not full sentence) → confirm → draft action card with goal prefilled.
- [ ] `make the job overview more customer focused` → job layout action card with apply path.
- [ ] `when forms complete move them to ready to enroll` → Workflow Assist coming next notice.
- [ ] Send/schedule/reminder require **Review & approve** + explicit workspace actions; no send on Enter alone.
- [ ] Drawer launcher focuses bottom bar and sets context without mode language.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Monolith refactor** | Cards 1–3 pure lib first; Card 4 UI swap; keep old workspace behind flag until Card 5 done (optional **`NEXT_PUBLIC_COMMAND_SURFACE_THREAD_V1`** sub-gate). |
| **Router misclassification** | Clarify turn + show parsed slots in dev; golden tests; operator can correct entity via pick list. |
| **Job layout on wrong page** | Require layout vocabulary **or** page context (job overview route) before job route. |
| **Thread memory** | Session-only V1; document refresh clears thread. |
| **Test churn** | Card 7 dedicated pass; update contracts in same PR as Card 4. |
| **GlobalAssistantContext consumers** | Grep **`commandSurfaceMode`** / **`preferMode`** before removal (drawer, shell, tests). |

---

## Card 0 exit checklist

- [x] Audit complete (§0.1–0.3).
- [x] UX doctrine + architecture locked (§Card 0 design).
- [x] Component + thread + router + action card models specified.
- [x] Implementation cards 1–7 ordered.
- [x] **Product sign-off** on: no mode tabs, header Assistant removal, action cards vs full workspace tray (Cards 1–7 shipped).
- [x] **Engineering sign-off** on: no new backend routes in V1 interaction layer; persons search deferred.

---

## References

- `docs/sprints/05_2026/task_assist_v1_1.md` (Card 9 shipped behavior — baseline)
- `docs/product/ai-system.md`
- `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx`
- `web/lib/agent/taskAssist/taskAssistCommandIntent.ts`
- `web/lib/agent/taskAssist/taskAssistEntitySearchService.ts`

---

## Shipped modules (Cards 1–7)

| Module | Path |
|--------|------|
| Unified router | `web/lib/adminV2/aiCommandSurface/commandSurfaceRouter.ts` |
| Slot extract | `web/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract.ts` |
| Thread state | `web/lib/adminV2/aiCommandSurface/commandSurfaceThreadState.ts`, `commandSurfaceThreadTypes.ts` |
| Thread UI | `web/app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx` |
| Shell | `web/app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx` |
| Tests | `web/tests/adminV2/commandSurface*.test.ts`, `web/tests/agent/taskAssist/aiCommandSurfaceTaskAssistContract.test.tsx`, `topNavBarAssistantTrigger.test.tsx` |
