# Commands System Initial Audit & Inventory

| Field | Value |
|-------|-------|
| Mission | Commands System Initial Audit & Inventory |
| Mission ID | `msn_188e8bea6fb6de28dd21` (local; no Vacilando-registered mission found at start) |
| Slot | 1 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-commands-system-inventory` |
| Branch | `agent/cursor/1-commands-system-inventory` |
| Base | `origin/staging` @ `31c710068` |
| Date | 2026-07-27 |
| Scope | **Discovery / specification only** — no implementation, migrations, renames, or runtime changes |
| Evidence class labels | **Doctrine** · **Implementation** · **Historical** · **Inference** · **Unknown** |

---

## 1. Executive summary

### What Alloy’s Commands system is today

**Implementation:** Alloy does **not** currently have one coherent “Commands” runtime. It has several overlapping systems that all claim (or partially implement) operator mutation authority:

1. **Action Runtime (registered handlers)** — `web/lib/adminV2/actions/actionRegistry.ts` — only **4** fully registered executors: `update_status`, `create_lead`, `confirm_tour`, `schedule.create`.
2. **Legacy/admin execute switch** — `web/lib/admin/actions/executeAdminAction.ts` (~1240 lines) — routes most operator keys by DB `action_type` + special-case keys.
3. **Mutation Runtime** — `web/lib/mutations/domainRegistry.ts` — **5** command keys → **2** domain handlers (lead status, enrollment status).
4. **Relationship Action Framework** — `web/lib/admin/relationship/relationshipActionRegistry.ts` — **8** relationship commands with guided wizard + `POST /api/admin/relationship-actions/execute`.
5. **Processing Identity commands** — `web/lib/pos/processingIdentity/commands/commandKeys.ts` — **15** semantic keys for inbound commit plans (parallel namespace; overlaps name `create_lead`).
6. **Domain direct APIs** — tours booking REST, delete-lead, archive/cancel CRUD, PCR role DELETE, commercial/config DELETEs — **bypass** registered command runtimes.
7. **DB catalog** — `action_definitions` + `action_placements` — org-configurable **appearance** (and some definition labels), seeded with many **stubs** (`implementation_status: missing`).

**Doctrine** (`docs/platform/modules/actions-and-workflows.md`) asserts a single path: config places; `RegisteredAction` executes via `POST /api/admin/actions/execute`. **Implementation contradicts this:** the execute route only uses `runRegisteredAction` for the four registered keys; everything else falls through to `executeAdminAction` (see `web/app/api/admin/actions/execute/route.ts`).

### `/settings/actions` (actual route `/admin/settings/actions`)

**Implementation:** Page title is **“Action buttons”** (`web/app/adminV2/settings/actions/page.tsx`). It configures **`action_placements`** (where buttons appear: surface/slot/entity/order/active), sourced from inventory + definition-catalog APIs. It does **not** create new executable capabilities. System-default placements are read-only. Admin+mutate required to add/edit/remove org placements.

Meaningful configurability is real for **placement visibility/order/enable**, but **not** for mutation semantics, permissions, eligibility, or payload schemas. Many library/catalog keys either lack full runtime wiring or are stubs.

### Biggest contradictions

| Tension | Evidence |
|---------|----------|
| Doctrine “every executable action maps to RegisteredAction” vs 4 handlers | `actions-and-workflows.md` § Action Runtime vs `actionRegistry.ts` |
| “Commands” product language vs “Actions” code/UI/DB | Settings title “Action buttons”; tables `action_*`; routes `/api/admin/actions/*` |
| Generic `update_status` still registered while BPEP/status docs say removed | `updateStatusAction.ts` vs `business-process-execution-platform.md` / `status-and-state-system.md` |
| Dual execute APIs | `/api/admin/actions/execute` and `/api/admin/mutations/execute` |
| `quick_message` (library) vs `send_message` (platform catalog) | `actionDefinitionRegistry.ts` vs `platformActionCatalog.ts` |
| Add Family Member vs Add Parent/Guardian dual stacks | `add_family_member` capture path vs `add_parent_guardian` relationship wizard |
| Tour cancel/complete/no-show as direct REST, not Action Runtime | `OpportunityTourBookingLifecycleBar` → `/api/admin/tours/bookings/...` |
| Catalog stubs marked `missing` still in DB | `20260602160000_canonical_action_catalog_v1_stubs.sql` |

### Most important risks

1. **Authorization is coarse** — execute routes gate with `requireAdminOrOps`; `action_definitions.required_permissions` is largely unused in seeds (**Unknown** whether any org populates it meaningfully).
2. **Destructive mutations bypass command discipline** — hard delete lead API, household member DELETEs, many settings DELETEs, tour cancel without confirm dialog.
3. **False sense of catalog completeness** — stubs and placeholders look like product surface area.
4. **Fragmented relationship mutation** — add paths are commands; remove/revoke often CRUD soft-delete.
5. **Doctrine/code drift** — product-definition sessions will fight contradictory docs if not resolved first.

### Foundation reusable or replace?

**Inference:** The **placement + known-key + eligibility/preview contract** and the **Mutation Runtime / Relationship Framework patterns** are reusable foundations. The **current multi-executor fan-out** is not a finished Commands system; it needs consolidation decisions (not necessarily greenfield replacement). Catalog stubs and parallel identity/scheduling namespaces must be explicitly classified before product design.

**Decision areas (not recommendations):** vocabulary; org create vs configure; composite commands; process consumption model; destructive-command policy; fate of `/admin/settings/actions`.

---

## 2. Vocabulary and concept map

| Term | Current meaning | Owner | Implementation | Overlap or conflict | Recommended decision needed |
|------|-----------------|-------|----------------|---------------------|----------------------------|
| **Command** | Emerging product noun for operator intent → registered capability | Doctrine (OCR / BPEP) | Partial: `operationalIntent.ts`, Mutation `command_key`, platform `commands/` | Overlaps “Action”; UI still says Action | Canonical operator term? |
| **Action** | Configured invocation of registered capability; also DB row; also UI button | Doctrine + Settings UI | Dominant code noun | Same as Command in practice | Rename vs dual-label |
| **Capability** | Registered executable unit; also foundation inventory; also BOS `capability_key` | Multiple | `RegisteredAction`, stubs metadata, BOS | Triple overload | Disambiguate scopes |
| **Operational Intent** | Human verb phrase mapped to capability(ies) | `operationalIntent.ts` | Vocabulary only; does not execute | Claims execution via Action Runtime; most intents not registered | Keep / wire / retire |
| **Registered Action** | Code-owned validate/eligibility/preview/execute handler | `actionRegistry.ts` | **4 keys only** | Doctrine says “every executable” | Expand registry or rewrite doctrine |
| **Mutation** | Status-domain commit via Mutation Runtime | `mutations/*` | 5 keys / 2 handlers | Also colloquial for any write | Bound to status domains? |
| **Outcome** | Human-confirmed stage completion → durable state | Stage-membership doctrine | Process/lifecycle config | Parallel to domain verbs | Outcome vs command ownership |
| **Workflow Action** | Effect step in workflow definitions (distinct noun in APIs) | Workflows module | `/api/admin/workflows/[id]/actions` | Not operator Command | Keep separate |
| **Relationship Action** | Guided identity→role→scope→write | Relationship framework | 8 keys + wizards | Overlaps `add_family_member` | Unify family add model |
| **Command Surface** | Shared shell for invoke lifecycle | Doctrine + UI shells | Partial CommandSurface* modules | Placement still `action_placements` | Surface vs placement naming |
| **Delete** | Hard remove graph / row | Domain services + CRUD | Mostly **not** registered commands | Manage-menu stubs | Policy per entity |
| **Archive** | Soft `archived_at` / inactive | Various archive routes | Direct APIs | Manage stubs `archive_*` often unwired | Archive vs deactivate |
| **Cancel** | Terminal status on operational object | Tours, schedules, announcements | Mix of REST + status | Not always a command | Cancel family |
| **Remove** | Unlink / soft-deactivate relationship | PCR role DELETE, vendor unlink | Mostly CRUD | No relationship remove command | Remove as command? |
| **Deactivate** | `is_active: false` | Roles, PCR, config | Soft | Overlaps archive | Vocabulary policy |

---

## 3. Command source-of-truth map

| Source | What it owns | Reads | Writes | Runtime consumer | Authority level | Conflicts |
|--------|--------------|-------|--------|------------------|-----------------|-----------|
| `REGISTERED_ACTION_LIST` (`actionRegistry.ts`) | Full executable handlers | — | via `runRegisteredAction` | `/api/admin/actions/execute` (registered branch) | Highest for those 4 keys | Tiny vs catalog |
| `CANONICAL_ACTION_REGISTRY` | Metadata: labels, placements allowed, executor kind, confirmation | Library + lifecycle + relationship | — | Known-key checks, layout, process options | Metadata / gating | Executor kinds ≠ RegisteredAction |
| `ACTION_BUTTON_LIBRARY` | Settings library cards | — | — | Settings chooser | Presentation | Subset of reality |
| `platformActionCatalog.ts` | Grain + mutation routing metadata | — | — | Stage evaluator / process options | Operator vocabulary (partial) | `send_message` ≠ `quick_message` |
| `COMMAND_DOMAIN_MAP` | Status mutation handlers | subject tables | status + `mutation_events` | `/api/admin/mutations/execute` | Domain truth for 5 keys | Dual API with actions/execute |
| `RELATIONSHIP_ACTION_REGISTRY` | Relationship command contracts | — | via relationship execute | `/api/admin/relationship-actions/execute` | Relationship writes | Parallel to add_family_member |
| `LIFECYCLE_BASE_ACTIONS` | Curated process-editor list | — | — | Enrollment process actions card | Editor UX | Not full catalog |
| `stageActionCatalogV1` / process metadata | Stage candidate_actions + recommendations | process JSON | config APIs | `resolveCanonicalWorkTemplateActionOptions` | Process placement | Can list unsupported keys |
| `action_definitions` (DB) | Org/global definition rows | Settings inventory | definition CRUD APIs | resolve/execute by key | Config appearance + type | Stubs / placeholders |
| `action_placements` (DB) | Surface/slot/order/active | resolveActionsForContext | Settings placements APIs | Rails, Focus Panel, Workspace | **Real** visibility control | Does not create behavior |
| Seed stubs (`…catalog_v1_stubs.sql`) | ~34 catalog intents | — | seed | Mostly none if inactive/missing | Historical product ambition | Inflates perceived surface |
| `IDENTITY_COMMAND_KEYS` | Processing commit plan verbs | — | identity handlers | Processing runtime | Separate system | Name collision `create_lead` |
| `operationalIntent.ts` | Intent→capability map | — | — | Mostly documentation / OCR V3 | Aspirational | Unwired planned intents |
| `executeAdminAction.ts` | Catch-all executor | DB definitions | domain modules | actions/execute fallback | De-facto majority path | Undermines “single RegisteredAction” claim |
| Tour booking service | Tour lifecycle mutations | bookings | status/events/comms | Tour REST routes | Domain truth for tours | Bypasses Action Runtime |
| Workflow action defs | Automation effects | — | workflow run | Event spine | Automation | Distinct from operator Commands |
| Manage menu stubs (`buildRecordManageMenu`) | Archive/delete labels | — | mostly none | Focus Panel manage classification | UI classification | Many `enabled: false` |

**No `action_aliases` table** — aliases live in code (`domainRegistry`, intent catalogs, BOS key maps).

---

## 4. Complete command inventory

Maturity legend: Production · Partial · Duplicate · Placeholder · Config-only · UI-only · Workflow-only · Legacy · Unreachable · Broken · Unknown.

### 4.1 Action Runtime registered (code executors)

| Command/key | Operator label | Family | Subject | Runtime registered | Executor | API | Config record | Process usage | Surfaces | BOS | Automation | Permission | Audit | Maturity |
|-------------|----------------|--------|---------|--------------------|----------|-----|---------------|---------------|----------|-----|------------|------------|-------|----------|
| `update_status` | Update status / Move Forward | Status | opportunity | **Yes** | `updateStatusAction` | `/api/admin/actions/execute` | historical | Internal / intent | Drawer / intents | proposed | via status events | `requireAdminOrOps` | action audit path | **Legacy / Partial** (doctrine wants domain verbs) |
| `create_lead` | Create lead | Record creation | none→opportunity | **Yes** | `createLeadAction` → create-lead modules | same | yes | activation / workspace | Workspace, BOS, forms | yes | workflows on events | admin/ops | yes | **Production** |
| `confirm_tour` | Confirm tour | Tours | opportunity / booking | **Yes** | `confirmTourAction` | same | stub→partial | stage catalogs | Lifecycle bar, execute | yes | tour events→workflows | admin/ops | `tour_confirmed` | **Production** |
| `schedule.create` | Create schedule | Scheduling | schedule | **Yes** | `scheduleCreateAction` | same | scheduling | Unknown | Scheduling surfaces | Unknown | Unknown | admin/ops | schedule path | **Partial** (adjacent product) |

### 4.2 Mutation Runtime command keys

| Command/key | Label | Family | Subject | Registered (Mutation) | Executor | API | Config | Process | Surfaces | Maturity |
|-------------|-------|--------|---------|----------------------|----------|-----|--------|---------|----------|----------|
| `update_lead_status` | Update Lead Status | Status | opportunity | Yes | `leadStatusHandler` | `/api/admin/mutations/execute` | library + seeds | internal umbrella | Drawer command panels | Production (runtime-internal preferred) |
| `close_lead` | Close Lead | Status / destructive-ish | opportunity | Yes (alias) | same | same | yes | lifecycle base | Manage / process | Production |
| `update_child_enrollment_status` | Update Child Enrollment Status | Status | OCM | Yes | `enrollmentStatusHandler` | same | yes | internal | panels | Production (internal) |
| `waitlist_child` | Waitlist Child | Enrollment | OCM | Yes (alias) | same | same | yes | lifecycle base | rails / process | Production / Partial (waitlist mutator roadmap) |
| `enroll_child` | Enroll Child | Enrollment | OCM | Yes (alias) | same | same | yes | lifecycle base | rails / process | Production / Partial |

### 4.3 Settings library / canonical (selected)

| Key | Label | Family | Runtime registered (Action Runtime) | Executor path | Maturity |
|-----|-------|--------|-------------------------------------|---------------|----------|
| `quick_message` | Message | Communications | No | UI composer / admin_execute | Partial |
| `ask_bos` | Ask BOS | Administration | No | opens BOS | UI-only / Partial |
| `update_enrollment_status` | Change Enrollment Status | Status | No | `admin_execute` + form | **Legacy / Contradiction** (docs say removed) |
| `update_status_add_note` | Change Enrollment Status (legacy) | Status | No | legacy placement | Legacy |
| `schedule_tour` | Schedule tour | Tours | No | dedicated modals + booking create API | Production (bypass Action Runtime) |
| `reschedule_tour` | Reschedule tour | Tours | No | booking reschedule API | Production (bypass) |
| `send_form` | Send form | Documents/forms | No | form delivery host | Partial |
| `send_enrollment_packet` | Send enrollment packet | Documents | No | workflow / execute | Partial |
| `mark_lost` | Mark lost | Status | No | admin_execute status | Partial / Duplicate of close paths |
| `mark_won` | Mark won / enrolled | Status | No | admin_execute | Partial / Duplicate |
| `open_record` | Open record | Record | No | `open_drawer` | Production (navigation) |
| `add_family_member` | Add family member | Relationships | No | admin_execute upsert/link | Production / Duplicate stack |
| `add_sibling` | Add sibling | Relationships | No | admin_execute → add_child form | Partial |
| `add_child` | Add child | Relationships | No | relationship_execute **or** inquiry modal | Duplicate |

### 4.4 Relationship Action Framework

| Key | Label | Maturity |
|-----|-------|----------|
| `add_emergency_contact` | Add Emergency Contact | Production |
| `add_authorized_pickup` | Add Authorized Pickup | Production |
| `add_billing_contact` | Add Billing Contact | Production |
| `add_parent_guardian` | Add Parent / Guardian | Production (overlaps Add Family Member) |
| `add_child` | Add Child | Production / Duplicate UI |
| `link_existing_person` | Link Existing Person | Production |
| `link_existing_child` | Link Existing Child | Production |
| `make_primary_contact` | Make Primary Contact | Production (dedicated modal) |

**Missing as commands:** remove/end relationship, revoke authority (PCR DELETE is CRUD), change-role-only command.

### 4.5 Catalog stubs (`implementation_status` missing/partial)

34 stub keys from `20260602160000_canonical_action_catalog_v1_stubs.sql`, including: `call_parent`, `send_email`, `send_sms`, `add_note`, `create_task`, `upload_document`, `move_to_qualification`, `move_to_waitlist`, `record_tour_outcome`, `contact_family`, `remove_from_waitlist`, fee/deposit/classroom/schedule keys, `withdraw_child`, `reopen_lead`, `reenroll_child`, etc.

| Maturity | Notes |
|----------|-------|
| **Config-only / Placeholder** | Many inactive stubs; some keys later gained partial real paths (`schedule_tour`, `send_form`, `confirm_tour`) while stub metadata may still say missing/partial — **org-live truth Unknown without DB query** |

### 4.6 Placeholders / early seeds

| Key | Maturity |
|-----|----------|
| `send_message_placeholder`, `send_paperwork_placeholder`, `add_to_waitlist_placeholder`, `convert_to_enrolled_placeholder` | Placeholder |
| `qualify_opportunity`, `start_quote`, `create_inquiry`, `new_inquiry` (as action) | Legacy / Historical |

### 4.7 Processing Identity (parallel namespace)

15 keys in `IDENTITY_COMMAND_KEYS` — **Workflow-only / Processing-only** relative to operator Commands. Overlap: `create_lead`.

### 4.8 Operational intents (vocabulary layer)

Current: `create_lead`, `move_forward`, `update_status`, `schedule_tour`, `confirm_tour`, `send_message`, `generate_document`.  
Planned: `enroll_child`, `assign_room`, `withdraw_child`, `generate_invoice`, `record_payment`.

| Maturity | Planned intents are **Placeholder / Unreachable** as executors today |

### 4.9 Inventory count (this audit)

| Bucket | Count |
|--------|------:|
| Distinct string identities in primary operator/catalog/relationship/mutation/schedule union (excl. identity + placeholders) | **~58** |
| + Processing Identity keys (unique names beyond overlap) | **+14** |
| + Placeholder / early seed keys | **+~8** |
| + Intent-only / alias-only (`enroll_subject`, `move_family_to_waitlist`, BOS attention maps) | **+~6** |
| **Approximate distinct command identities inventoried** | **~86** |
| Action Runtime registered executors | **4** |
| Mutation Runtime command keys | **5** |
| Relationship registered commands | **8** |
| Catalog stubs (seed) | **34** |
| Config-only / UI-only / placeholder / planned (non-production) | **~45+** (stubs + placeholders + planned intents + unwired library entries) |

Exact org-live activated set: **Unknown** (requires `reportActionInventory.ts --org <id>` against a database).

---

## 5. Command-family inventory

| Family | Shared infrastructure? | Notes |
|--------|------------------------|-------|
| **Record creation** | Partial | `create_lead` is reference RegisteredAction; other creates often domain APIs |
| **Record lifecycle / status** | Split | Mutation Runtime domain verbs + legacy `update_status` + `update_enrollment_status` form + mark_lost/won |
| **Tours** | Domain service shared; command registration **not** shared | Only `confirm_tour` in Action Runtime; schedule/reschedule/cancel/complete/no-show via tour APIs/modals |
| **Enrollment** | Mutation aliases + outcomes | `waitlist_child` / `enroll_child`; financial/placement stubs mostly missing |
| **Relationships** | Framework wizard shared among 8; Add Family Member separate | Remove paths not in framework |
| **Communications** | Composer / templates | `quick_message` / stubs `send_email`/`send_sms`; tour comms orchestrator separate |
| **Documents and forms** | Form delivery host | `send_form` partial; packet partial |
| **Scheduling** | `schedule.create` registered; visits cancel via schedule API | Adjacent to tours |
| **Attendance** | Not inventoried as command family in registries | **Unknown / out of primary catalogs** |
| **Billing/financial** | Mostly config CRUD + payment status PATCH | Stub fee/deposit commands missing |
| **Processing** | Identity command registry | Parallel system |
| **Status/state** | Outcomes + Mutation Runtime | Doctrine forbids generic operator status; code still has it |
| **Destructive** | Almost entirely **direct APIs** | Not modeled as Commands |
| **Administration/configuration** | Settings DELETE/archive | Not operator Commands |

---

## 6. `/settings/actions` current product audit

### Route and navigation

| Item | Evidence |
|------|----------|
| App route file | `web/app/adminV2/settings/actions/page.tsx` |
| Canonical URL | `/admin/settings/actions` (AdminV2 rewritten from `/adminV2`; middleware Phase H1) |
| `/settings/actions` / `/configurations/actions` | **Not found** as separate routes |
| Title | “Action buttons” |
| Subtitle | `SETTINGS_ACTIONS_SUBTITLE`: “Add buttons to queue rows and record drawers…” (`settingsPageSubtitles.ts`) |
| Cross-links | From lifecycle/enrollment process settings to `?entity_type=opportunity` |

**Browser screenshots:** not captured (server not started; audit was code/doctrine evidence). **Unknown** live org placement counts.

### Page hierarchy / data

1. Library chooser — `ActionButtonLibraryPanel` + `ACTION_BUTTON_LIBRARY` filtered against definition-catalog.
2. Guided editor — `ActionPlacementGuidedEditor` (create/edit placement).
3. “Your buttons” — org placements list with enable/reorder/edit/remove.
4. “System defaults” — read-only global placements.

**Reads:** `GET /api/admin/actions/inventory`, `GET /api/admin/actions/definition-catalog`.  
**Writes:** `POST/PATCH/DELETE /api/admin/action-placements…`, definition APIs via guided editor.

### What admins can control

| Control | Editable? | Runtime effect |
|---------|-----------|----------------|
| Add button from library | Yes (admin+mutate) | Creates/uses definition + **placement** → can appear on configured surface |
| Label (placement/definition) | Yes (guided editor) | Cosmetic / display |
| Surface / slot / entity / section | Yes | **Real** — resolveActionsForContext filters |
| Order index | Yes | **Real** ordering among peers |
| Enable/disable (`is_active`) | Yes | **Real** visibility |
| Remove placement | Yes (confirm) | **Real** |
| System defaults | No | Reference only |
| Create novel executable behavior | **No** | Config cannot invent unregistered behavior (doctrine + known-key checks) |
| Permissions per action | Not meaningfully in UI | DB column exists; seeds empty — **cosmetic/dead for most orgs** |
| Payload / mutation semantics | No | Code-owned |

### Misleading / dead aspects

- Page language is **button placement**, not Commands product model.
- Library includes status umbrellas and legacy keys that process doctrine tries to hide.
- Catalog stubs may appear in DB catalogs depending on filters (`filterSettingsActionCatalogDefinitions`) — verify filter excludes placeholders (**Implementation:** `isInternalOrPlaceholderActionKey`).
- Enabling a stub without executor yields disabled/broken runtime behavior rather than new capability.

### Operator vs technical language

Mixed: operator labels (“Schedule tour”, “Message”) with technical placement concepts (surface/slot) and status keys.

---

## 7. Business Process command consumption

### Intended flow (doctrine)

```text
Registered capability
→ org availability (definitions/placements)
→ process/stage candidate set + recommendation
→ surface appearance
→ eligibility evaluation
→ execution
```

### Implemented flow (evidence)

```text
Multiple key sources (canonical / platform / DB / stage catalog / lifecycle base)
→ loadLifecycleBuilderConfiguredActions (placements marked for builder)
   ∪ stage action_catalog_v1.candidate_actions
→ resolveWorkTemplateActionOptions
   → resolveCanonicalWorkTemplateActionOptions
   → mergeByIntent (aliases)
→ editor options / runtime rails via placements
→ execute via actions/execute OR mutations/execute OR relationship OR domain REST
```

**Break points**

1. Source list is a **union**, not a single registry.
2. Inactive/unsupported keys can still be candidates if present in stage catalog JSON.
3. Execution does **not** converge on one runtime.
4. Lifecycle base list (`LIFECYCLE_BASE_ACTIONS`) is a **separate curated set** used by enrollment process UI — can drift from placements.
5. Destructive commands are **not** specially modeled in process consumption (except confirmationPolicy metadata on some catalog entries).

### `/settings/processes` listing behavior

| Question | Finding |
|----------|---------|
| How listed? | `resolveWorkTemplateActionOptions` over configured placements + stage catalogs |
| Compatibility? | Grain checks + intent merge + hide umbrellas/internal keys (see tests under `web/tests/lifecycle/resolve*.test.ts`) |
| Scale? | **Inference:** OK for tens of keys; stub-heavy catalogs will confuse operators |
| Inactive/unsupported appear? | Possible if configured as candidates; unsupported marked via `supported` flags in options |
| Stage config duplicates command config? | **Yes** — placements AND stage `candidate_actions` AND lifecycle base card |
| Label/key drift? | **Yes** — override_label, intent aliases, library vs platform labels |
| Order meaningful? | Placement `order_index` on rails; process option order from merge logic |
| Destructive handled differently? | Confirmation policies in metadata; no dedicated destructive process UX found |

---

## 8. Runtime lifecycle audit

Target lifecycle:

```text
Resolve context → subject → inputs → eligibility → warnings/blockers → preview → confirm → execute → audit → refresh → success/failure
```

| Runtime | Context | Subject | Inputs | Eligibility | Warnings | Preview | Confirm | Execute | Audit | Refresh | Success UX |
|---------|---------|---------|--------|-------------|----------|---------|---------|---------|-------|---------|------------|
| **Action Runtime** (`runRegisteredAction`) | Yes | Yes | schema validate | `resolveEligibility` | blockers | `buildPreview` | policy | handler | metadata | caller-dependent | structured result | **Shared for 4 keys** |
| **executeAdminAction** | Partial | Partial | form-dependent | preflight APIs exist | partial | partial | varies | large switch | `withActionExecutedEmit` often | varies | varies | **Reimplemented per key** |
| **Mutation Runtime** | Yes | domain resolve | intent | evaluate + readiness | warnings block | panel UX | required | domain commit | `mutation_events` | panel | command panels for lead close/update | **Shared for status domains** |
| **Relationship execute** | wizard | identity resolve | role/scope | wizard steps | copy | confirm step | required | `executeRelationshipAction` | `relationship.action_executed` | refresh hooks | modal | **Shared among 8** |
| **Tour REST** | booking bar | booking id | slot/reason | service eligibility | little UI | often none | **cancel: none** | service methods | lifecycle events | UI refetch | bar buttons | **Domain-specific** |
| **Direct DELETE/archive** | route | id | often none | eligibility helpers sometimes | rare | delete-preview for lead only | window.confirm sometimes | CRUD | inconsistent | page reload | inconsistent | **One-off** |
| **Processing Identity** | case plan | plan ops | plan schema | registry forbid list | plan review | approval | commit plan | identity handlers | processing audit | case UI | **Separate** |
| **BOS** | proposal | pre-resolve | fill | enrich preflight | explain | confirm | same execute routes when wired | — | — | **Placement, not executor** |

**Verdict:** Shared lifecycle exists in doctrine and partially in Action Runtime / Mutation / Relationship. Majority of operator mutations still use **command-specific** paths.

---

## 9. Context and surface inventory

Use product term **context/surface**. Implementation table `action_placements` remains the storage noun.

| Surface / context | How availability resolved | Same runtime? |
|-------------------|---------------------------|---------------|
| **Workspace** | placements `surface=workspace` / primary; create_lead | Mixed (registered create_lead + others) |
| **Work Unit** | placements `work_unit` / primary; right-rail bundle APIs | Mixed |
| **Focus Panel / Manage** | `record_header` / overflow; resolved actions + manage-only keys | Mixed; manage stubs often non-executing |
| **Queue-related** | historically `queue_row`; lifecycle deprecated for process editor | Partial / legacy |
| **Current Work / Work Items** | Current Work action surface policy filters | Classification + execute mix |
| **Business Process outcomes** | outcome definitions / transitions — **not** the same as command placements | Outcome execution path |
| **Relationship rows/cards** | layout catalogs + relationship registry contexts | Relationship execute / dedicated modals |
| **Communications** | composer hosts; template archive separate | Mostly not Action Runtime |
| **Processing** | identity commands / case archive | Parallel |
| **BOS** | adapters map recommendations → canonical keys | Confirmed proposals → execute routes when wired |
| **Automation** | workflow effects / event keys | Workflow runtime |
| **Public/tokenized** | `/api/action/[token]/…` | Event→workflow |
| **Settings/config pages** | local CRUD commands (void/retire/delete) | Direct admin APIs |

Canonical process editor placement set (`LIFECYCLE_ACTION_PLACEMENTS`): Focus Panel Manage, Work Unit right rail, Workspace only.

---

## 10. Delete and destructive-command matrix

### Categories observed

| Category | Examples | Command-modeled? |
|----------|----------|------------------|
| Never deletable (guarded) | Some status defs / in-use commercial objects | Eligibility helpers on DELETE routes |
| Archivable only | contacts, jobs, forms, inbox threads, processing cases | Direct archive POST |
| Deactivatable | PCR roles (`is_active: false`), role types | Soft |
| Removable relationship | PCR role remove; vendor contact unlink; customer_member_contacts DELETE | Mostly CRUD |
| Cancellable operational object | tour booking, schedule visit, announcement | Domain cancel APIs |
| Voidable draft / version | financial effective-dated void/retire; draft form hard delete | Config APIs |
| Hard deletable before use | draft forms; some catalog rows | DELETE |
| Administrator-only destructive | customer_members DELETE (admin role); schedules cancel (admin) | Role checks vary |
| System-maintenance-only | **Unknown** explicit maintenance deletes | — |
| Status pseudo-delete | `close_lead`, `mark_lost`, withdrawn statuses | Mutation / admin_execute |

### Representative matrix

| Label | Key | Subject | Surfaces | API / handler | Registered command? | Semantics | Permission | Confirm | Audit | Recovery | Blocked on deps? | Safety |
|-------|-----|---------|----------|---------------|---------------------|-----------|------------|---------|-------|----------|------------------|--------|
| Delete Lead | `delete_lead` | opportunity graph | Manage stub (`enabled: true`) | `POST …/opportunities/[id]/delete` + preview | **No** | Hard delete graph | admin/ops + scope | Preview API; **UI call sites not found** | `logAdminAudit` | No undo | Jobs / discount redemptions | Service intentional; **UI wiring gap** |
| Archive Lead | `archive_lead` | opportunity | Manage stub disabled | none found | No | Intended soft | — | — | — | — | — | **Stub** |
| Mark lost / Close lead | `mark_lost` / `close_lead` | opportunity | drawers / process | execute / mutations | Partial | Status | admin/ops | destructive/required policies | status/mutation events | reopen stub missing | transition rules | Intentional status path |
| Cancel tour | `cancel_tour` (capability) | tour_booking | lifecycle bar | `…/bookings/[id]/cancel` | **No** | Status canceled | admin/ops | **None in bar** | `tour_canceled` + comms | **No reopen** | non-terminal only | Risky UX (no confirm) |
| Complete / No-show | outcomes | tour_booking | lifecycle bar | complete / no-show routes | No (record_tour_outcome partial) | Terminal status | admin/ops | bar click | lifecycle events | No | confirmed/rescheduled | Domain intentional |
| Remove PCR role | — | person_child role | Focus Panel | `DELETE …/roles/[roleKey]` | No | Soft deactivate | admin/ops | Focus UX | none in remove fn | Reactivate? Unknown | — | Soft safer than hard |
| Delete customer_member | — | household member | API | `DELETE …/customer-members/[id]` | No | Hard | **admin only** | — | none in route | No | — | **High risk CRUD** |
| Delete customer_member_contact | — | link | API | DELETE | No | Hard unlink | admin | — | none | No | — | High risk |
| Archive contact/job/form/case | — | various | settings/ops | archive POSTs | No | Soft | admin(/ops) | varies | some events | unarchive often | varies | Generally safer |
| Cancel schedule | — | schedules | API | `…/schedules/[id]/cancel` | No | Status + fee optional | admin | — | status changed | — | — | Domain |
| Void payment (status) | void vocabulary | payments | PATCH | status sync | No | Status | admin/ops | — | emitStatusChanged | — | — | Financial sensitivity |
| Config catalog DELETEs | — | pricing/programs/etc. | settings | many DELETE routes (**43** admin DELETE handlers counted) | No | Hard or archive-if-in-use | admin | varies | varies | varies | `evaluateDeletionEligibility` often | Settings-domain |
| Withdraw child | `withdraw_child` | OCM | intents/stubs | — | Planned only | Planned status | — | — | — | — | — | **Not executable as command** |

**Callouts**

- Unsafe/inconsistent: tour cancel without confirm; hard household DELETEs; delete-lead API without discovered UI.
- Archive vs delete semantics ambiguous in Manage menu stubs.
- Missing audit on several relationship/config DELETEs.

---

## 11. Tour command case study

Shared service: `web/lib/tours/bookings/tourBookingService.ts`.  
Events: `tourLifecycleEvents.ts`. BP mirror: `tourBookingOpportunityIntegration.ts`. Comms: `tourCommsOrchestrator.ts`.

| Capability | Registered command? | Modal/handler | Shared infra | Subject / inputs | Eligibility | Side effects | BP | Comms | Audit | Configurable | Hardcoded | Missing |
|------------|---------------------|---------------|--------------|------------------|-------------|--------------|----|-------|-------|--------------|-----------|---------|
| Schedule Tour | Catalog yes; Action Runtime **no** | Schedule modals + slot panel | booking service | opportunity, location, slot | no active conflicting booking | insert booking, reminders | metadata mirror `scheduled` | confirm/reminder | lifecycle events | availability rules | eligibility | — |
| Reschedule | Catalog yes; Runtime **no** | same panel mode=reschedule | service | booking + new times | active statuses | update + replace reminders | reschedule_mirror | reschedule pack | `tour_rescheduled` | rules | eligibility | — |
| Cancel | Not registry action | lifecycle bar immediate POST | service | booking + optional reason | non-terminal | canceled status | attention, no status flip | canceled pack | `tour_canceled` | — | yes | confirm dialog; reopen |
| Confirm | **Yes** `confirm_tour` | bar + execute/BOS | service + RegisteredAction | pending_approval booking | pending only | confirmed | confirmed_mirror | confirm pack | `tour_confirmed` | — | yes | — |
| Complete | via outcome / REST | bar + outcome modal | service | confirmed/rescheduled | those statuses | completed | completed | completed pack | `tour_completed` | — | yes | — |
| No-show | via outcome / REST | bar | service | same | same | no_show | no_show | follow-up template | `tour_no_show` | templates | yes | — |
| Reopen/restore | **No** | — | restoreBooking rollback only | — | — | — | — | — | — | — | — | **Operator reopen** |
| Reminders | Not operator command | scheduled sends | reminder scheduler | booking | eligible + non-terminal | send schedule | — | channels/offsets | `tour_reminder` | quiet hours/offsets | — | — |
| Calendar/ICS | Support libs | attached in packs | ICS helpers | booking | — | links/attachments | — | yes | — | templates | — | — |

**Process work intents** (confirm_tour_date, complete_tour_process, etc.) appear in lifecycle tests as **work template** concepts layered on booking truth — not substitutes for booking CRUD.

---

## 12. Relationship command case study

### Verdict

**Add Family Member is not one command.** It is fragmented:

1. **`add_family_member` / `add_related_person`** — capture-first modal → `upsertAndLinkPersonForAdmin` via `executeAdminAction`.
2. **`add_parent_guardian`** (+ EC/pickup/billing) — Relationship Action Framework wizard.
3. **`add_child` / `add_sibling` / `link_existing_child`** — inquiry modal **and/or** relationship wizard.
4. **`link_existing_person`** — link with editable role.
5. **`make_primary_contact`** — dedicated modal / external executor.
6. **Remove/revoke** — **not** a relationship command; Focus Panel PCR soft-remove or hard DELETE APIs.

### Runtime topics

| Topic | Behavior |
|-------|----------|
| Person search vs create | Framework: household candidates or create; Add Family Member: find-or-create identity |
| Household membership | `customer_persons` / members writes |
| Child-specific responsibility | EC/pickup scopes `this_child` / selected / all_children |
| Multiple children | supported in child_scoped_contact scopes |
| Relationship scopes | enumerated on registry entries |
| Duplicate detection | findOrCreate person/child helpers |
| Role vocabulary | defaultRoleKey + editable roles list |
| Required information | wizard steps + confirmation copy |
| Confirmation | required policies / wizard confirm |
| Permissions | `requireAdminOrOps` on execute |
| Audit | `relationship.action_executed`; make_primary emits `household.primary_contact_changed`; Add Family Member via action_executed emit |
| Removal | PCR soft-deactivate; hard deletes exist outside framework |

Canonical identity/relationship ownership is **respected in doctrine and partially in framework**; Add Family Member path is a parallel capture stack and must not be mistaken for the sole model.

---

## 13. Authorization and security matrix

Representative commands (coarse gate dominates):

| Command | UI visibility | Client guard | API assertion | Permission key | Scope | RLS | Audit | Risk |
|---------|---------------|--------------|---------------|----------------|-------|-----|-------|------|
| Create Lead | placements / workspace | auth context | `requireAdminOrOps` + registered path | not per-action | accessScope on runtime | service role server | yes | Medium (capture) |
| Schedule Tour | placements / modals | admin client | tour create route admin/ops | coarse | org + location rules | server | lifecycle | Medium |
| Reschedule Tour | lifecycle bar | — | reschedule route | coarse | booking org | server | yes | Medium |
| Cancel Tour | lifecycle bar | — | cancel route | coarse | booking org | server | yes | **High UX** (no confirm) |
| Add Family Member | header/placements | modal | actions/execute → admin_execute | coarse | opportunity/customer | server | action_executed | Medium |
| Make Primary Contact | contact row | modal | relationship/dedicated | coarse | household/opportunity | server | primary_changed event | Medium |
| Update lead/enrollment state | panels/rails | command panel | mutations/execute | coarse | domain subject org | server | mutation_events | Medium–High |
| Delete Lead | manage stub | **call sites missing** | delete route admin/ops + graph guards | coarse | opportunity access | server | logAdminAudit | **High** if wired carelessly |
| Archive contact/job | settings/ops | — | archive routes | admin | org | server | some events | Medium |
| Delete customer_member | API | — | **admin role** | role===admin | org | server | **none in route** | **High** |
| PCR role remove | Focus Panel | — | DELETE roles | admin/ops | org | server | weak | Medium |

**Cross-cutting:** `action_definitions.required_permissions` is **not** the effective authorization model today. RLS applies to user-scoped clients; privileged admin routes use service role with explicit org checks — **must not** be treated as RLS-enforced alone.

---

## 14. Contradictions and drift

| # | Doctrine | Code / schema / UI | Evidence |
|---|----------|--------------------|----------|
| 1 | Every executable action is RegisteredAction | Only 4 registered; fallback `executeAdminAction` | `actions-and-workflows.md`; `actionRegistry.ts`; `actions/route.ts` |
| 2 | Single execute API | Also `/api/admin/mutations/execute` | BPEP vs actions-and-workflows |
| 3 | Operator generic `update_status` removed | Still registered + operational intents | status-and-state / BPEP vs `updateStatusAction.ts` / `operationalIntent.ts` |
| 4 | Create Lead status `open` / no `new_inquiry` | Other docs retain `new_inquiry` display/key | status-and-state vs actions-and-workflows Create Lead section |
| 5 | Commands language | Settings “Action buttons”; DB `action_*` | page.tsx; schema |
| 6 | `send_message` platform | `quick_message` library | platformActionCatalog vs actionDefinitionRegistry |
| 7 | Enrollment Alignment removed Change Enrollment Status | Still in ACTION_BUTTON_LIBRARY | BPEP vs `update_enrollment_status` entry |
| 8 | Config cannot invent behavior | Stub catalog seeds imply capabilities | stubs migration |
| 9 | Tours as commands | Most tour mutations are REST | lifecycle bar routes |
| 10 | Relationship designations as actions | Remove/revoke not actions | relationship registry vs PCR DELETE |
| 11 | Outcome only durable-state path | Many non-outcome writes (create_lead, relationships, tours) | stage-membership vs reality |
| 12 | Tests | Some tests lock dual paths / legacy keys | lifecycle + action registry tests |

---

## 15. Dead, duplicate, and bypass paths

| Kind | Examples |
|------|----------|
| Duplicate executors | `confirm_tour` RegisteredAction **and** `executeConfirmTourAction`; `add_child` inquiry modal **and** relationship wizard; close via `close_lead` **and** `mark_lost` **and** `update_status` |
| Direct API bypasses | Tour booking REST; delete-lead; archive/*; schedules cancel; PCR DELETE; customer_members DELETE; commercial DELETEs; payment void via PATCH |
| UI-only | `ask_bos`; manage `archive_*` stubs enabled:false; layout-only keys `runtimeWired: false` |
| Config-only | Catalog stubs `implementation_status: missing` |
| Orphaned definitions | Early `qualify_opportunity`, `start_quote`, placeholders |
| Stale aliases | `update_status_add_note`; BOS catalog→canonical maps |
| Placeholder commands | `*_placeholder` keys |
| Unreachable | Planned operational intents (`withdraw_child`, `assign_room`, …) |
| Legacy mutation paths | `update_enrollment_status` open_form; `update_status` |
| Tests protecting obsolete behavior | **Inference:** tests asserting legacy keys/paths — review before removal |
| Commands lacking fine-grained auth | Nearly all operator executes (coarse admin/ops) |
| Server execution without operator path | delete-lead API; possibly others |

**Admin DELETE route count (bypass-ish settings/ops):** **43** `export async function DELETE` under `web/app/api/admin/**`.  
**Archive-related route files:** **11** matched.

---

## 16. Initial gap classification

| Class | Examples |
|-------|----------|
| Vocabulary/product | Command vs Action; Capability overload; Delete vs Archive vs Cancel vs Remove |
| Configuration | Settings is placement-only; no org-authored executors; stub inflation |
| Runtime | Multi-executor; incomplete RegisteredAction coverage; dual mutation APIs |
| Process integration | Multi-source candidate lists; lifecycle base vs placements; outcome vs command |
| Surface/context | Deprecated queue_row; manage stubs; Command Surface incomplete |
| Security | Coarse auth; weak audit on some DELETEs; destructive without confirm |
| Data/schema | `action_placements` naming; unused `required_permissions`; no aliases table |
| Destructive-command | Not modeled as commands; inconsistent semantics |
| UX | Tour cancel no confirm; dual Add Parent flows; misleading Settings title |
| Documentation | Doctrine internal contradictions; Commands rename incomplete |
| Test/QA | Coverage skewed to registries; org-live inventory not automated in this mission |

---

## 17. Decisions required before design

| Decision | Why it matters | Evidence | Options | Consequence of delay |
|----------|----------------|----------|---------|----------------------|
| Canonical **Command vs Action** vocabulary | Every doc/UI/API | Dual naming everywhere | Rename product-only; rename code; keep dual with glossary | Permanent confusion in settings/process |
| Configured **variants** of platform commands? | Settings today only places | placements vs stubs | Place-only vs variant labels/inputs vs full forks | Wrong Settings redesign |
| Orgs **create** commands or only **configure** platform ones? | Doctrine: cannot invent behavior | stubs tempt creation | Configure-only vs limited composition | Scope explosion |
| **Composite commands** first-class? | Intents claim fan-out | `operationalIntent.ts` planned enroll | Defer vs design composites | Ad-hoc workflows fill gap |
| How **processes consume** org commands | Multi-source today | resolve*ActionOptions | Single catalog feed vs stage overlays | Unscalable process UI |
| **Destructive command** model | Safety | delete/cancel/archive matrix | First-class family with preview/confirm/audit | Continued unsafe CRUD |
| **Delete vs archive** policy per entity | Lead delete hard; archive stub | deleteOpportunityLead vs archive_lead stub | Matrix by entity class | Data-loss incidents |
| Keep **status-change** operator-visible? | Doctrine conflict | update_status vs domain verbs | Hide umbrellas; migrate; keep advanced | Operator confusion |
| Commands vs **Automation** boundary | Workflows separate | workflow actions API | Strict split vs shared keys | Double implementation |
| What `/admin/settings/actions` **becomes** | Current = button placements | ActionPlacementsSettingsClient | Placements console vs Commands catalog vs split pages | Mis-scoped sprint |

Do **not** unilaterally decide these; doctrine already leans configure-not-invent and domain verbs over generic status, but code has not finished that migration.

---

## 18. Recommended next discovery step

**Next step (product-definition, not implementation):** hold a Commands product-definition session that:

1. Locks vocabulary (Command / Action / Capability / Intent / Outcome) with a one-page glossary.
2. Walks **three concrete journeys** against this audit: Schedule→Cancel Tour, Add Family Member vs Add Parent/Guardian, Close/Delete Lead.
3. Decides the **Settings** job-to-be-done (placements vs catalog vs both).
4. Produces an owner-approved **destructive-command policy** matrix (entity classes × allowed operators).
5. Only then commission an architecture brief for consolidating executors (Action Runtime vs Mutation vs Relationship vs domain REST).

Do **not** start a Commands implementation sprint until those decisions exist.

---

## Appendix A — Key evidence index

| Area | Path |
|------|------|
| Doctrine spine | `docs/platform/modules/actions-and-workflows.md` |
| BPEP | `docs/platform/modules/business-process-execution-platform.md` |
| Registered actions | `web/lib/adminV2/actions/actionRegistry.ts` |
| Execute route | `web/app/api/admin/actions/execute/route.ts` |
| Admin execute switch | `web/lib/admin/actions/executeAdminAction.ts` |
| Canonical registry | `web/lib/admin/actions/canonicalActionRegistry.ts` |
| Settings library | `web/lib/admin/actions/actionDefinitionRegistry.ts` |
| Settings page | `web/app/adminV2/settings/actions/page.tsx` |
| Settings client | `web/components/adminV2/settings/ActionPlacementsSettingsClient.tsx` |
| Mutation domains | `web/lib/mutations/domainRegistry.ts` |
| Relationship registry | `web/lib/admin/relationship/relationshipActionRegistry.ts` |
| Platform catalog | `web/lib/platform/actions/platformActionCatalog.ts` |
| Process options | `web/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions.ts` |
| Lifecycle base | `web/lib/lifecycle/lifecycleStageBaseActions.ts` |
| Operational intents | `web/lib/platform/commands/operationalIntent.ts` |
| Identity commands | `web/lib/pos/processingIdentity/commands/commandKeys.ts` |
| Stub seeds | `supabase/migrations/20260602160000_canonical_action_catalog_v1_stubs.sql` |
| Tables | `action_definitions`, `action_placements` |

## Appendix B — Mission provenance

- Vacilando missions.jsonl contained prior Access & Roles / Communications inventories only; **no pre-registered Commands mission ID**.
- Local mission ID `msn_188e8bea6fb6de28dd21` assigned for artifact naming.
- Audit performed read-only in Slot 1 worktree; **no application code, migrations, or doctrine modified**.

---

*End of audit.*
