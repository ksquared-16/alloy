# Commands Architecture & Migration Strategy

| Field | Value |
|-------|-------|
| Mission | Commands Architecture & Migration Strategy |
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slot | 1 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-commands-system-inventory` |
| Foundations (approved) | `qa/missions/commands-system-inventory-msn_188e8bea6fb6de28dd21.md`, `qa/missions/commands-product-definition-msn_188e8bea6fb6de28dd21.md` |
| Date | 2026-07-27 |
| Scope | **Architecture only** — no implementation, migrations, runtime edits, schema changes, or doctrine edits |

**Primary question answered:** The smallest durable evolution is **converge invoke paths onto an expanded Capability Registry + shared Command Runtime**, while **retaining Domain Executors as mutation owners**, **extending `action_definitions` / `action_placements` as catalog + availability storage**, and **phasing out parallel public execute surfaces** without a rewrite.

---

## 0. Architectural thesis

```text
Do not replace Domain Executors.
Do not invent a second catalog.
Do not make Processes own execution.

Expand today's RegisteredAction contract into the Platform Capability Registry.
Route all operator Commands through one Command Runtime facade.
Keep domain services (tours, relationships, lead status, delete graph) behind adapters.
Use action_definitions + action_placements as the org catalog / availability store under Command product semantics.
Migrate keys off executeAdminAction and off raw REST operator UX in sequenced slices.
```

**What survives:** Domain booking/relationship/status/delete services; Mutation Runtime handlers; Relationship wizard; event spine; BOS confirm→execute pattern; eligibility/preview contracts already on RegisteredAction; `action_placements` as availability rows.

**What converges:** Multiple public execute APIs and UI bypasses → one Command Runtime invoke path; multiple key catalogs → one Capability Registry + org catalog projection.

**What disappears (eventually):** Operator-facing Action Buttons product; `executeAdminAction` as majority path; silent tour cancel; Manage stubs without capabilities; unsupported catalog stubs presented as enableable Commands.

---

## 1. Current architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ CONFIG / PRODUCT SURFACES                                                    │
│  /admin/settings/actions (Action Buttons)                                    │
│  /settings/processes · lifecycle · enrollment-process editors                │
│  Layout / Experience builders                                                │
└─────────────┬───────────────────────────────┬────────────────────────────────┘
              │ writes                        │ writes candidate keys /
              ▼                               │ recommendation JSON
┌─────────────────────────┐         ┌─────────▼──────────────────────────────┐
│ action_definitions      │◄────────│ Process / stage metadata               │
│ action_placements       │         │ stage action_catalog_v1                │
└─────────────┬───────────┘         │ LIFECYCLE_BASE_ACTIONS (code)          │
              │ resolve             └─────────┬──────────────────────────────┘
              ▼                               │
┌─────────────────────────────────────────────▼────────────────────────────────┐
│ OPERATOR / BOS CONTEXTS                                                      │
│ Workspace · Work Unit rail · Focus Panel · relationship rows · BOS · Tours UI│
└─────────────┬────────────────────────────────────────────────────────────────┘
              │ invoke (fragmented)
     ┌────────┼────────┬──────────────┬───────────────┬────────────────┐
     ▼        ▼        ▼              ▼               ▼                ▼
┌────────┐┌────────┐┌──────────┐┌───────────┐┌──────────────┐┌──────────────┐
│Action  ││execute ││Mutation  ││Relationship││Tour REST /   ││Direct CRUD   │
│Runtime ││Admin   ││Runtime   ││execute API ││booking svc   ││delete/archive│
│(4 keys)││Action  ││(5 keys)  ││(8 keys)    ││              ││cancel routes │
└───┬────┘└───┬────┘└────┬─────┘└─────┬──────┘└──────┬───────┘└──────┬───────┘
    │         │          │            │              │               │
    └─────────┴──────────┴────────────┴──────────────┴───────────────┘
                                   │
                                   ▼
                    Domain tables · emitEvent · workflows · projections

Parallel: Processing Identity Commands (commit plans) — mostly separate namespace
```

### Ownership today (overlapping)

| Box | Owns today | Overlap / problem |
|-----|------------|-------------------|
| **Registered Action Runtime** | Full lifecycle for 4 keys | Too small to be the product runtime |
| **executeAdminAction** | Majority operator keys via switch + DB `action_type` | De-facto runtime; duplicates RegisteredAction for some keys |
| **Mutation Runtime** | Lead/enrollment status domain commits | Second public API; aliases for verbs |
| **Relationship Runtime** | Guided relationship writes | Parallel stack to `add_family_member` |
| **Tour services + REST** | Booking truth | Bypass Command Runtime; weak confirm on cancel |
| **REST delete/archive/cancel** | Destructive/soft ops | Not Commands; uneven audit/preview |
| **Processing Identity** | Inbound commit plans | Name collision (`create_lead`); not org Commands UI |
| **action_definitions / placements** | Labels + surface slots | Placement product ≠ Command product |
| **Process builder** | Multi-source candidate lists | Duplicates catalog sources |
| **BOS** | Propose / prefill | Must hit same execute path when confirmed |
| **Automation** | Event→effects | Correct boundary; polluted by inconsistent events |

---

## 2. Target architecture

```text
┌─────────────────────────────────────────────┐
│ Platform Capability Registry (code)         │  identity, schema, hooks, family,
│  capabilityKey → Domain Executor binding    │  destructive class, support status
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│ Organization Command Catalog (DB + services)│  enabled, expression, variants,
│  extends action_definitions semantics       │  template refs, support honesty
└─────────────────────┬───────────────────────┘
                      │ process selects subset
┌─────────────────────▼───────────────────────┐
│ Business Process                            │  command set, journey structure
│  Stage Evaluation + Outcomes (distinct)     │  recommendation, order, blockers UX
└─────────────────────┬───────────────────────┘
                      │ context resolves subject
┌─────────────────────▼───────────────────────┐
│ Operational Context (Workspace, Work Unit,  │  subject, process/stage, host chrome
│ Focus Panel, relationship row, BOS, Manage) │
└─────────────────────┬───────────────────────┘
                      │ single invoke
┌─────────────────────▼───────────────────────┐
│ Command Runtime (shared lifecycle)          │  auth, inputs, eligibility, preview,
│  facade over Capability hooks               │  confirm gate, audit envelope, refresh
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│ Domain Executor                             │  atomic writes, integrity, domain events
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│ Events → Automation / Projections / BOS read│
└─────────────────────────────────────────────┘

Configuration product: /configuration/commands
Process product:       /configuration/processes
Availability storage:  action_placements (implementation) + process selection records
```

### Ownership of every box

| Box | Owns | Does not own |
|-----|------|--------------|
| **Platform Capability Registry** | Keys, contracts, hooks, executor binding, support status, destructive class | Org labels, process selection |
| **Organization Command Catalog** | Org expression, enablement, variants, template refs | Mutation semantics |
| **Business Process** | Selected Commands, stage recommendation/order, Outcomes | Executors |
| **Stage Evaluation** | Ready/Warning/Blocked/Unavailable/Recommended | Hiding blocked Commands |
| **Operational Context** | Subject + host resolution; availability filter | Semantics |
| **Command Runtime** | Shared lifecycle + confirmation minimums + audit envelope | Domain write rules |
| **Domain Executor** | Truth writes + domain events + dependency checks | Chrome / org config UI |
| **Events / Automation** | Reactions | Operator primary mutations |
| **BOS** | Propose, prefill, explain | Private execute / weaker confirm |

---

## 3. Capability Registry

### Decision

**Today’s `RegisteredAction` contract becomes the core of the Platform Capability Registry — expanded, not replaced.**

`REGISTERED_ACTION_LIST` (4 keys) is the **seed set**, not the ceiling. Every operator Command key must eventually appear as a Capability with hooks. Domain logic stays in Domain Executors; Capabilities are **adapters + contracts**.

Canonical/metadata registries (`CANONICAL_ACTION_REGISTRY`, library, platform catalog) **fold into Capability metadata** over time (single code source for “known keys”).

### Capability record (logical schema)

| Field | Purpose |
|-------|---------|
| `capabilityKey` | Stable identity (today’s `action_key` / mutation `command_key`) |
| `family` | Tours, Relationships, Destructive, Enrollment, … |
| `supportStatus` | `production` \| `partial` \| `unsupported` \| `internal` \| `retired` |
| `subjectTypes` / grains | Allowed subjects |
| `inputSchema` | Platform-required payload (code-owned) |
| `configurationSchema` | Allow-list of org-overridable fields (required overlays, reasons, copy slots, template slots) |
| `confirmationClass` | `none` \| `required` \| `destructive` \| `typed_destructive` |
| `destructiveKind` | null \| delete \| archive \| cancel \| remove \| revoke \| withdraw \| void \| … |
| `variantSupport` | Whether org variants allowed; which overlay fields |
| `runtimeHooks` | `validatePayload`, `resolveEligibility`, `buildPreview`, `execute`, `auditMeta` |
| `executorBinding` | Domain Executor id + adapter module |
| `processCompatibility` | Which process types / grains may select it |
| `defaultContexts` | Default operational contexts (product enums) |
| `eventTypes` | Domain events this capability emits |

### Relationship to Mutation / Relationship registries

| Today | Target |
|-------|--------|
| Mutation `COMMAND_DOMAIN_MAP` | Domain Executor adapters registered as Capabilities (`close_lead`, …) |
| `RELATIONSHIP_ACTION_REGISTRY` | Capability metadata source for relationship family; execute via Command Runtime → relationship executor |
| Processing Identity keys | **Remain separate registry** unless a key is explicitly promoted to operator Capability |

---

## 4. Command Catalog

### Decision

**Extend `action_definitions` (and related org overlay columns/JSON) as the Organization Command Catalog — do not replace the table in v1.**

Rationale: already org-scoped, keyed, labeled, activatable; Settings/inventory APIs already read it; least disruption.

### Logical org Command model

| Concern | Storage approach (v1 architecture) |
|---------|--------------------------------------|
| **Identity** | `action_definitions.key` = `capabilityKey`; org row or global+org overlay |
| **Configuration** | label, description, icon, style, `is_active`; extend `metadata` / dedicated overlay for reasons, confirmation copy, template refs, required-field overlays (validated against Capability `configurationSchema`) |
| **Variants** | Child rows or `metadata.variants[]` keyed by variant id; same `capabilityKey`; availability may pin a variant |
| **Availability** | `action_placements` rows + process selection (see §5) |
| **Versioning** | Capability code version + optional `metadata.config_version`; no org-authored executor versions |
| **References** | template ids, workflow ids (references only) |
| **Retirement** | Capability `supportStatus=retired` → catalog shows retired; cannot enable; existing placements resolve disabled |
| **Compatibility** | Unknown keys fail closed in process editor; runtime refuses execute if Capability missing |

### What changes semantically

| Old meaning | New meaning |
|-------------|-------------|
| Definition ≈ button type | Definition ≈ Configured Command expression |
| `action_type` drives executeAdminAction | `action_type` becomes legacy; Capability binding drives execute |
| Stub definitions look placeable | `supportStatus` gates enablement in `/configuration/commands` |

---

## 5. Availability architecture

### Product concepts → implementation mapping

| Product concept | Runtime meaning | Implementation mapping (v1) |
|-----------------|-----------------|-----------------------------|
| **Business Process availability** | Command in process’s selectable set | Process config: selected `capabilityKey`s (migrate off free-typed multi-source lists). Optionally mirrored by builder-tagged placements for compatibility |
| **Stage availability / recommendation** | Recommended / optional / manage-only + order | Stage `candidate_actions` **becomes projection of process selection + recommendation** — single writer path from process editor |
| **Operational context availability** | Where chrome may show the Command | `action_placements.surface` / `slot` / `entity_type` / `section_key` / `order_index` / `is_active` — **API/UI speak “contexts”** |
| **Surface rendering** | Host chooses chrome (button, manage item, BOS card) | Existing resolve bundles (`resolveActionsForContext`, rail bundles) filtered by Capability + catalog + process + context |
| **Runtime filtering** | Final list = enabled ∩ process-selected ∩ context-available ∩ subject-resolvable ∩ not unsupported | Shared resolver service used by all hosts |

### Availability resolution order

```text
Capability.supportStatus ∈ {production, partial}
∧ Org Command enabled
∧ Process selected (if host is process-scoped)
∧ Context availability row matches host
∧ Subject type compatible
∧ (optional) Variant scope matches
→ Candidate for Stage Evaluation / chrome
→ Eligibility may Block but not remove when process-selected
```

### Explicit non-goal

Do not introduce a second availability store beside `action_placements` in v1. Introduce a **semantic Availability API** that reads/writes placements (+ process selection) so the product never says “placement.”

---

## 6. Runtime architecture

### Single invoke facade

```text
POST /api/admin/commands/execute   (target public name)
  │  (migration: keep /api/admin/actions/execute as alias)
  ▼
Command Runtime
  1. Resolve Context (host, process, stage, actor, org)
  2. Resolve Subject
  3. Load Configured Command + Variant overlay
  4. Authorization (platform permission + scope)
  5. validatePayload (Capability + org required overlays)
  6. resolveEligibility (Domain Executor via Capability)
  7. Collect Warnings / Blockers
  8. buildPreview (required by confirmationClass)
  9. Enforce Confirmation (server re-check; typed for destructive)
 10. execute → Domain Executor
 11. Audit envelope + ensure domain events
 12. Refresh signals
 13. Success / failure contract
```

### Reusable infrastructure

| Piece | Reuse |
|-------|-------|
| `RegisteredAction` hooks | **Become** Capability hooks |
| `runRegisteredAction` / `actionExecutor.ts` | Grow into Command Runtime core |
| Mutation evaluate/commit | Domain Executor behind Capabilities |
| Relationship execute + wizard | Domain Executor + input host |
| Tour booking service | Domain Executor |
| `deleteOpportunityLead` + preview | Destructive Domain Executor |
| Preflight/eligibility APIs | Fold under Command Runtime |
| BOS confirm → execute | Keep; point at facade |
| `resolveActionsForContext` | Evolve to Command candidate resolver |

### Gaps to close (architecture, not product)

| Gap | Target |
|-----|--------|
| Only 4 registered keys | Adapter Capabilities for tours, relationships, mutations, destructive |
| `executeAdminAction` majority path | Shrink to zero operator keys |
| Dual mutations execute API | Operator path via Command Runtime; mutations API becomes internal or alias |
| Tour cancel no confirm/preview | Capability `confirmationClass=required` + preview hook |
| Coarse auth only | Capability declares permission key; Runtime enforces (incremental) |
| Uneven audit | Runtime audit envelope mandatory |

---

## 7. Domain executors

| Domain | Current owner | Decision | Justification |
|--------|---------------|----------|---------------|
| **Lead create** | create-lead modules + RegisteredAction | **Retain + keep Capability** | Already reference path |
| **Lead status / Close** | Mutation `leadStatusHandler` | **Retain; wrap as Capability** | Correct domain grain; stop parallel UX umbrellas |
| **Lead delete / archive** | `deleteOpportunityLead` (+ archive stub) | **Adapt into Destructive Capabilities** | Service has preview/guards; needs Runtime + product Commands |
| **Enrollment status / waitlist / enroll** | Mutation `enrollmentStatusHandler` | **Retain; wrap as Capability** | Domain verbs stay |
| **Tours** | `tourBookingService` + REST | **Retain service; wrap all tour Commands as Capabilities**; deprecate direct operator REST UX | Booking truth is solid; invoke path is the problem |
| **Relationships** | Relationship framework + add_family_member path | **Retain framework as executor; converge entry hub onto one Capability family**; deprecate duplicate capture stack over time | Framework matches product; dual stacks are migration debt |
| **Processing Identity** | Identity command registry | **Retain separate**; do not fold into org Commands unless promoted | Different trust boundary (commit plans) |
| **Scheduling (non-tour)** | `schedule.create` RegisteredAction + schedule cancel API | **Retain create Capability; wrap cancel as Capability** | Partial today |
| **Communications (operator send)** | Composer / quick_message paths | **Adapt**: Capability opens composer host or sends via platform rules | Not a raw DB write Command |
| **Future Billing** | Mostly CRUD / stubs | **New Capabilities only when Domain Executor exists** | No stub-as-enabled |
| **Configuration maintenance deletes** | Settings DELETE/void | **Remain outside operator Command catalog** (Configuration product) | Approved split |

**Replace:** none of the healthy domain services.  
**Replace eventually:** `executeAdminAction` switch and unsupported stub “executors.”

---

## 8. Business Process integration

```text
Org Command Catalog
    → Process.commandSet = ordered subset of capabilityKeys
        → Stage.recommendation[key] + order/group
            → Outcomes (separate list; stage-owned)
                → At runtime:
                   candidates = commandSet ∩ contextAvailability ∩ enabled
                   evaluation = Capability.eligibility(subject, stage)
                   chrome shows Recommended / Ready / Warning / Blocked
                   execute → Command Runtime
                   Outcome picker remains for stage completion confirmation
```

### Anti-duplication rules

| Rule | Detail |
|------|--------|
| One catalog | Process editor lists only Org Command Catalog keys with compatible Capability |
| No lifecycle base parallel list | `LIFECYCLE_BASE_ACTIONS` becomes a **seed suggestion**, not a second source of truth |
| Outcomes ≠ Commands | Editors show two panels; Outcomes never execute Domain Executor writes except through their own outcome runtime |
| Recommendation ≠ availability | Recommendation orders/highlights; context availability controls hosts |
| Evaluation ≠ selection | Selection is config; evaluation is runtime |

---

## 9. `/configuration/commands` architecture

### Mapping product sections → owners

| Product section | Service / API | Storage | Validation |
|-----------------|---------------|---------|------------|
| Overview | `CommandCatalogService.summary` | definitions + capability supportStatus | — |
| Commands list | `listConfiguredCommands` | `action_definitions` ⋈ Capability Registry | Filter unsupported unless advanced |
| Families | Capability `family` grouping | code taxonomy | — |
| Command detail | `getConfiguredCommand` / `updateConfiguredCommand` | definition metadata overlays | `configurationSchema` allow-list |
| Variants | `upsertVariant` | metadata.variants or child table (later) | same schema |
| Availability | `AvailabilityService` | `action_placements` + process selection | context enum ↔ surface/slot map |
| Automation | read-only event→workflow links | workflow defs by event type | references only |
| Audit | audit query by capabilityKey | audit / mutation_events / domain events | — |

### Runtime ownership

- **Read path (operator chrome):** Context host → Candidate Resolver → Stage Evaluator → UI  
- **Write path (admin config):** `/configuration/commands` UI → Catalog/Availability APIs → DB  
- **Execute path:** never from config UI except “test invoke” if ever added (not required v1)

### Dependency graph

```text
Capability Registry (code deploy)
    ↑ validates
Command Catalog writes
    ↑ selected by
Process commandSet
    ↑ filtered by
Availability (placements + contexts)
    ↑ consumed by
Candidate Resolver → Command Runtime → Domain Executor
```

### API naming (target)

| Target | Migration alias |
|--------|-----------------|
| `/api/admin/commands/*` (inventory, catalog, availability, execute, eligibility, preview) | Keep `/api/admin/actions/*` as compatibility aliases until clients migrate |
| `/api/admin/mutations/execute` | Internal Domain Executor entry or alias to commands execute for mapped keys |

---

## 10. Migration strategy

**Principle:** each phase ships with production behavior preserved; feature flags only for **new chrome**, not forked executors.

### Phase map

| Phase | Name | Goal | Depends on | Exit criteria |
|-------|------|------|------------|---------------|
| **P0** | Capability spine | Expand Capability Registry types; document adapter interface; `supportStatus` on all known keys; no behavior change | — | Registry lists keys with status; tests for known-key partition |
| **P1** | Catalog honesty | `/configuration/commands` read model over definitions+registry; block enabling `unsupported`; dual-run with Action Buttons read-only or linked | P0 | Admins see true support status |
| **P2** | Runtime facade | Command Runtime = grown `runRegisteredAction`; `/commands/execute` aliases `/actions/execute`; confirmation gate centralized | P0 | All **already-registered** keys use facade unchanged |
| **P3** | Mutation wrap | `close_lead`, `waitlist_child`, `enroll_child`, status keys as Capabilities → Mutation Domain Executor | P2 | Operator status verbs only via Command Runtime; mutations route aliased |
| **P4** | Relationship wrap | Relationship keys + Add Family Member hub Capability → relationship executor | P2 | One invoke path; wizard remains UI host |
| **P5** | Tour wrap | Schedule/Reschedule/Cancel/Confirm/Complete/No-show/(Reopen) Capabilities → booking service; UI stops calling cancel REST without Runtime | P2 | Cancel requires preview+confirm; Confirm stays single-path |
| **P6** | Destructive wrap | Delete/Archive Lead, Remove/Revoke relationship, etc. as Capabilities | P2, policy matrix | Manage menu wired to Capabilities with preview |
| **P7** | Process convergence | Process editor reads Org Catalog only; retire multi-source merge as authority; stage candidates written from process selection | P1 | Single source for process command lists |
| **P8** | Configuration convergence | Ship `/configuration/commands` as primary; Action Buttons redirects/deprecated; Availability UI replaces placement editor metaphor | P1, P7 | No admin primary path to Action Buttons |
| **P9** | executeAdminAction drain | Migrate remaining keys or mark unsupported; delete dead branches | P3–P6 | No operator key left only on switch |
| **P10** | Legacy concept removal | Stop operator “Action” copy; archive stubs; optional later rename tables | P8–P9 | Product language Commands-only |

### Sequencing diagram

```text
P0 Capability spine
 └─ P1 Catalog honesty ──────────────┐
 └─ P2 Runtime facade ─┬─ P3 Mutation ┼─ P7 Process convergence ─ P8 Config UI
                       ├─ P4 Relationship ┘         │
                       ├─ P5 Tours ─────────────────┤
                       └─ P6 Destructive ───────────┘
                            └─ P9 Drain executeAdminAction ─ P10 Legacy removal
```

### Production continuity rules

1. **No dual execute for the same key** after that key’s wrap phase (alias OK; two semantics forbidden).
2. Placements continue to work; Availability API is additive.
3. Tour REST may remain for internal/adapter use; operator chrome must not bypass Runtime after P5.
4. Processing Identity untouched throughout unless a promotion project starts.

---

## 11. Compatibility strategy

| Legacy piece | During migration | End state |
|--------------|------------------|-----------|
| `action_definitions` | Extended as catalog | Remains |
| `action_placements` | Remains availability store | Remains (possibly renamed later — not required) |
| `RegisteredAction` | Expanded to Capability | Remains as registry entry type |
| `executeAdminAction` | Frozen for unmigrated keys only; no new keys | Drained / removed from operator path |
| Mutation Runtime | Domain Executor; public API aliased | Internal executor |
| Relationship Runtime | Domain Executor via Capability | Remains |
| `/api/admin/actions/execute` | Alias to Command Runtime | Deprecate after clients move |
| Action Buttons page | Read-only bridge → Commands | Removed from nav |
| Canonical / library / platform catalogs | Generate from Capability Registry or thin facades | Collapse |
| Stub seed keys | `unsupported`; hidden from enable | Retired or implemented deliberately |

### Anti-patterns to avoid

| Anti-pattern | Instead |
|--------------|---------|
| Feature flag per Command executor fork | Wrap behind one Runtime; flag only new UI |
| “Compat mode” that skips preview for tours | Same confirmationClass for all hosts |
| Process editor still accepting free keys | Catalog-only picker |
| New placements UI plus new availability UI | One Availability service, two skins max during bridge |

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Architectural:** Capability Registry becomes another parallel catalog | M | H | Make it the **only** code authority for known keys; generate facades |
| **Migration:** Long-lived executeAdminAction + Runtime dual path | H | H | Per-key drain checklist; forbid new switch cases |
| **Product:** Admins confuse Availability with Process selection | M | M | Clear IA copy; process deep-links |
| **Runtime:** Preview/eligibility expensive on rails | M | M | Cache eligibility per subject+key; lazy preview on confirm |
| **Authorization:** Still coarse admin/ops after wrap | H | H | Add permission keys incrementally on Destructive + financial-adjacent first |
| **Destructive:** Delete Lead exposed without UI readiness | M | H | Ship Capability + Manage wiring together; typed confirm mandatory |
| **Performance:** Candidate resolver fans out | M | M | Batch resolve; reuse rail bundle patterns |
| **Compatibility:** Org placements reference stub keys | H | M | Resolve as disabled + admin cleanup report |
| **Tours:** REST clients external to UI | L | M | Keep REST as adapter internals; document operator path |
| **Relationships:** Hub vs old add_family_member dual UX during P4 | M | M | Temporary redirect of old key → hub Capability |

---

## 13. Open decisions (architecture only)

Product decisions are closed. Remaining **architecture** approvals:

| Decision | Why it matters | Options |
|----------|----------------|---------|
| **A1. Variants storage** | Affects catalog schema work | (1) `metadata.variants[]` on definition v1 (2) child table now |
| **A2. Process selection persistence** | Single catalog feed | (1) New process JSON field `command_set` as authority (2) Builder-tagged placements remain authority with stricter loader |
| **A3. Public API rename timing** | Client churn | (1) Alias-first, rename later (2) Dual paths with deprecation window |
| **A4. Permission model v1** | Security debt | (1) Keep admin/ops + tighten Destructive only (2) Introduce per-Capability permission keys in P2 |
| **A5. Reopen Tour executor** | Product requires Command; code lacks operator path | Implement as new Capability in P5 vs defer Reopen to P5.1 |
| **A6. Configuration maintenance Commands** | Boundary clarity | Confirm they stay **out** of org Command catalog (recommended) vs appear under Administration family |

**Recommended defaults if owner wants zero meeting:** A1→(1), A2→(1), A3→(1), A4→(1) then Destructive keys in P6, A5→include in P5, A6→out of catalog.

---

## 14. Engineer cheat sheet (what to build later)

| Question | Answer |
|----------|--------|
| What survives? | Domain services, placements table, definitions table, event spine, BOS confirm pattern, Mutation/Relationship executors as domains |
| What converges? | Invoke path, known-key registry, process candidate source, config UI |
| What disappears? | Action Buttons product framing; executeAdminAction majority; stub enablement; multi-source process authority |
| What is `/configuration/commands`? | Catalog + expression + variants + availability + honesty over definitions⋈registry |
| How do Processes consume Commands? | Select from org catalog; stage recommends; evaluate at runtime; Outcomes separate |
| How does execution converge? | Capability hooks → one Runtime → Domain Executor |
| How do Destructive Commands work? | Capabilities with destructiveKind + typed/required confirm + preview + audit |
| How does migration happen? | P0–P10 sequenced wraps; no rewrite; no dual semantics per key |

---

## Appendix — Traceability

| Architecture choice | Product / audit basis |
|---------------------|----------------------|
| Expand RegisteredAction | Product Platform Capability; audit §1 tiny registry |
| Extend action_definitions | Product Configured Command; audit settings read path |
| Keep action_placements | Product availability; owner constraint |
| Wrap tours/relationships/mutations | Product families; audit bypasses |
| Process single catalog | Product §6; audit §7 multi-source |
| Phased drain executeAdminAction | Continuity; audit catch-all risk |

---

*End of architecture blueprint. No implementation performed.*
