# Commands Product Definition

| Field | Value |
|-------|-------|
| Mission | Commands Product Definition & Architecture (definition-only) |
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slot | 1 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-commands-system-inventory` |
| Foundation | `qa/missions/commands-system-inventory-msn_188e8bea6fb6de28dd21.md` |
| Date | 2026-07-27 |
| Scope | **Product definition only** — no implementation, migrations, renames, doctrine edits, or runtime changes |
| Central question | **What is `/configuration/commands`, and how should it work?** |

**Owner-approved direction (locked for this definition):**

1. Commands are the operator-facing concept; “Action” may remain internal during migration.
2. The product is `/configuration/commands` — not Actions, Action Buttons, or Placements.
3. Organizations configure platform-provided Commands; they do not author arbitrary executable mutations.
4. Business Processes consume Commands; stages evaluate Commands; stages do not invent executable behavior.
5. Delete is a Command family with distinct destructive verbs (Archive, Cancel, Remove, …).
6. Existing `action_placements` are an implementation detail, not the product model.

---

## 0. Product thesis (one paragraph)

A **Command** is a named, platform-owned operator capability that Alloy can run safely against a resolved subject in an operational context. Organizations **enable and shape** Commands (labels, required information, warnings, confirmation, availability across processes and contexts, allowed option sets, linked templates) inside platform guardrails. Business Processes **select and recommend** Commands for stages of a journey; the Command Runtime **evaluates and executes** them through Domain Executors that own mutation truth, authorization, audit, and events. `/configuration/commands` is the organization’s catalog and policy console for that system — not a button-placement editor and not a mutation builder.

---

## 1. Canonical vocabulary

| Term | Facing | Ownership | Meaning | Product language | Internal language (migration) |
|------|--------|-----------|---------|------------------|-------------------------------|
| **Command** | Operator | Platform defines; org configures expression | A durable operator verb Alloy can invoke (e.g. Schedule Tour, Close Lead, Add Emergency Contact) | Command | May map to today’s `action_key` / RegisteredAction / mutation `command_key` |
| **Platform Capability** | Implementation | Platform code | The registered executable unit behind one Command key: contracts, eligibility, executor binding | Rarely spoken to operators; “platform capability” in admin advanced views | `RegisteredAction`, domain handler, relationship executor |
| **Configured Command** | Operator (admin) | Organization | An org’s enabled/shaped instance of a Platform Capability (display, availability, confirmation, options) | Configured Command / “our Commands” | Org rows over `action_definitions` + availability records (today’s placements) |
| **Command Family** | Operator | Platform taxonomy | Group of related Commands sharing subject domain and UX patterns (Tours, Relationships, Destructive) | Family | Catalog category / module boundary |
| **Command Variant** | Operator (admin) | Org configures within platform bounds | Bounded configuration of a Command for a context (e.g. Cancel Tour with org reason list + template) — **same capability key**, different expression | Variant | Not a new executor; config overlay / optional secondary key only if platform ships it |
| **Composite Command** | Mixed | Platform only | A Command whose **platform-owned** execute path performs multiple domain writes as one operator intent | Composite Command (when necessary) | Orchestrated executor — **not** org-authored workflow graphs |
| **Operational Intent** | Operator | Product / BOS UX | Human phrasing (“move this family forward”) that may resolve to one or more Commands | Intent / recommendation language | `operationalIntent` vocabulary; BOS proposals |
| **Subject** | Operator | Platform | The record(s) the Command acts on (Lead, Child enrollment, Tour booking, Person, …) | Subject / record | `entity_type` + id / grain |
| **Context** | Operator | Platform + org availability | Where and why the Command is offered (Workspace, Work Unit, Focus Panel, relationship row, BOS, …) | Context / operational surface | Today’s `surface`/`slot` in `action_placements` — **implementation only** |
| **Required Input** | Operator | Platform schema + org-required extras | Fields the operator must supply before execute | Required information | Payload schema + lifecycle `record_creation` / stage rules where applicable |
| **Eligibility** | Operator | Platform Domain Executor | Whether this Command may run on this subject now | Available / Ready | `resolveEligibility` |
| **Warning** | Operator | Platform (+ org copy) | Non-blocking caution | Warning | Evaluation warning |
| **Blocker** | Operator | Platform | Hard stop with reason; Command remains visible when process-relevant | Blocked | Eligibility blocker |
| **Preview** | Operator | Platform Domain Executor | Dry-run summary of what will change | Preview | `buildPreview` |
| **Confirmation** | Operator | Platform policy + org wording | Explicit operator assent before execute | Confirmation | `confirmationPolicy` |
| **Execution** | Implementation | Command Runtime → Domain Executor | Authoritative server commit | Run / Confirm & run | `execute` / domain commit |
| **Consequence** | Operator | Platform Domains | Durable effects of a successful Command (status, links, bookings, messages queued) | What happens | Side effects / domain writes |
| **Outcome** | Operator | Business Process | Human-confirmed **stage completion** that advances process membership / durable stage state | Outcome (process) | Stage outcome definitions — **distinct from Commands** though a Command may contribute to reaching an Outcome |
| **Automation** | Operator (admin) | Workflows module | Event-driven side effects after Commands/events | Automation | Workflows / effects — consumes Command events; does not replace Commands |
| **Domain Executor** | Implementation | Platform domain modules | Code that owns mutation semantics for a family | — | Tour booking service, lead status handler, relationship execute, … |
| **Destructive Command** | Operator | Platform policy per subject | Any Command in the Destructive family (Delete, Archive, Cancel, Remove, …) | Destructive Command | Manage/delete/archive routes today — future: same runtime as other Commands |

### Explicit non-product terms

| Term | Status |
|------|--------|
| Action / Action Button / Placement | **Implementation / legacy UI** — not used in `/configuration/commands` product copy |
| `action_placements` | Storage/implementation for Command **availability** |
| Workflow Action | Automation module noun — not a Command |
| Processing Identity command | Processing commit-plan noun — may share keys; not configured in `/configuration/commands` as operator Commands unless explicitly promoted |

---

## 2. Ownership model

```text
Platform Capability
        ↓
Organization Command Configuration
        ↓
Business Process
        ↓
Stage Evaluation
        ↓
Operational Context
        ↓
Command Runtime
        ↓
Domain Executor
        ↓
Events / Automation
```

| Layer | Owns | Does not own |
|-------|------|--------------|
| **Platform Capability** | Command key, subject types, payload contract, authorization rules, eligibility logic, preview builder, executor binding, idempotency, invariants, audit schema, event types | Org labels, org availability, org reason lists |
| **Organization Command Configuration** | Enabled/disabled, display name, help text, icon, confirmation/warning copy, required-information overlays (within platform allow-list), allowed option/reason sets, default values, linked communication templates, automation **references**, availability across processes/contexts, variants | Mutation semantics, inventing new keys, arbitrary SQL/payloads, bypassing auth |
| **Business Process** | Which Configured Commands are in-scope for the process; stage recommendation levels; ordering/grouping for journey UX; interaction with Outcomes | Executable behavior; private mutation paths |
| **Stage Evaluation** | Ready / Warning / Blocked / Unavailable / Recommended for a subject at a stage; surfacing blockers | Hiding Commands silently when blocked; inventing Commands |
| **Operational Context** | Resolving current subject(s), process membership, UI host (rail, manage menu, BOS, relationship row) | Changing Command semantics |
| **Command Runtime** | Shared lifecycle: context → subject → inputs → auth → eligibility → warnings → preview → confirmation → execute → audit → refresh → success | Domain-specific write rules |
| **Domain Executor** | Atomic domain writes, referential integrity, domain events, recovery rules for that domain | Cross-cutting chrome; org configuration UI |
| **Events / Automation** | Reacting to emitted events (messages, tasks, follow-ups) | Being the primary operator mutation path |

**Rule:** Configuration steers *expression and availability*. Code owns *truth*. Processes *select and evaluate*. Automation *reacts*.

---

## 3. Command configuration model

### 3.1 Organization-configurable

| Area | What orgs may configure | Guardrail |
|------|-------------------------|-----------|
| **Enabled** | On/off for the organization | Disabled Commands never appear in operator UI |
| **Display name** | Operator-facing label | Does not change key |
| **Help text** | Short description / guidance | — |
| **Icon** | From platform icon set | — |
| **Required information** | Mark platform-optional fields as required; choose from platform allow-list | Cannot remove platform-required fields; cannot invent fields |
| **Allowed options** | Subset/order of platform option sets (reasons, outcomes, roles where editable) | Cannot invent status keys or illegal transitions |
| **Warnings** | Custom warning copy when platform warning codes fire | Cannot invent new warning codes |
| **Confirmation wording** | Title/body/confirm button labels within policy class | Cannot downgrade platform `destructive` → `none` |
| **Reasons** | Org reason lists for Cancel / Close / Withdraw where platform supports reasons | Stored as config; validated against schema |
| **Communication templates** | Bind org templates to Command consequence slots (e.g. tour canceled) | Template must exist; channel rules still platform |
| **Automation references** | Point to workflows that should listen / be recommended — **not** embed workflow graphs in the Command | Automation remains in Automations product |
| **Default values** | Defaults for optional inputs (location, reminder preference) | Validated |
| **Variant definitions** | Named variants for different processes/contexts (same capability) | Bounded; see §4 |
| **Availability** | Which Business Processes, stages (recommendation), and operational contexts offer the Command | See §6 and §12 |

### 3.2 Platform-owned

| Area | Why |
|------|-----|
| Mutation semantics | Prevent data corruption and vertical hardcoding in config |
| Payload contracts | Stable API / BOS / process contracts |
| Subject types & grains | Correct operational truth |
| Authorization & scope | Security |
| Audit schema | Compliance |
| Idempotency & atomicity | Safe retries |
| Event emission | Automation and projections |
| Referential integrity & dependency checks | Especially Destructive family |
| Protected invariants | e.g. never delete lead with forbidden dependents without explicit admin Command |
| Eligibility algorithms | Deterministic Ready/Blocked |
| Preview computation | Trustworthy dry-run |
| Minimum confirmation class | Destructive cannot be silent |

### 3.3 What orgs cannot do

- Create a new Command key with custom mutation code
- Point a Command at arbitrary tables or RPC
- Author composite graphs of other Commands as org config (see §5)
- Use `/configuration/commands` as a workflow builder

---

## 4. Command families

Commands are organized into **Families**. Families are the primary navigation in `/configuration/commands` and the grouping language in process editors.

| Family | Purpose | Bounded variants? |
|--------|---------|-------------------|
| **Record Creation** | Create Lead and similar capture-first entry | Yes — intake field overlays, defaults |
| **Tours** | Schedule through reopen | **Yes — primary validation case** |
| **Relationships** | Add/link/change/remove people and authority | Yes — default roles, scopes, copy |
| **Enrollment** | Waitlist, enroll, withdraw, related enrollment verbs | Yes — reasons, required docs hooks |
| **Communications** | Message / send form (operator-initiated) | Yes — templates, composer defaults |
| **Scheduling** | Non-tour schedules/visits | Yes |
| **Attendance** | Check-in / attendance verbs when platform ships them | Later |
| **Billing** | Fee/deposit/payment operator verbs when platform ships them | Later |
| **Documents** | Packets, uploads, form send | Yes — template bindings |
| **Processing** | Only Commands explicitly promoted from Processing into operator catalog | Rare |
| **Status** | Domain verbs (`Close Lead`, `Waitlist Child`) — **not** generic “Update Status” as operator product | Limited variants (reason lists) |
| **Destructive Commands** | Delete, Archive, Deactivate, Remove, Revoke, Cancel, Withdraw, End, Void | Yes — confirmation copy, reasons; **never** weaker safety class |
| **Administration** | Org-admin maintenance Commands (config void/retire may live under Configuration product, not here) | Split: operator Destructive vs Configuration maintenance |

### 4.1 Variants are first-class (bounded)

**Decision:** Command Variants are a first-class **configuration** concept, not first-class new executors.

- A Variant = Platform Capability key + org expression overlay + availability scope.
- Example: “Cancel Tour — Waitlist stage” may require a reason and bind a specific SMS template; “Cancel Tour — Qualification” may use different copy — **same** Cancel Tour capability.
- Variants must not fork mutation semantics.

### 4.2 Tours as validation case for families

The Tours family proves the model:

- One family, multiple Commands (Schedule, Reschedule, Cancel, Confirm, Complete, No-show, Reopen).
- Shared Domain Executor (tour booking).
- Org configures availability, confirmation, reasons, templates — not booking state machine.
- Process stages recommend Schedule vs Confirm differently; they do not redefine “what cancel means.”

---

## 5. Composite Commands

### Decision: **Platform-owned composites only; no org-authored composites**

| Example | Product treatment |
|---------|-------------------|
| **Enroll Child** | **Single Command** in Enrollment family. Platform executor may perform multiple domain writes (status, stage contribution, follow-up work). Org does **not** assemble assign_room + contract + documents as a configurable graph in v1. Future fan-out stays platform-versioned inside the capability. |
| **Add Family Member** | **Not a composite executor.** It is an **entry chooser / family hub** that routes to first-class relationship Commands (Add Parent/Guardian, Add Emergency Contact, …) or a single “Add household adult” Command with a **role input**. See §10. |
| **Cancel Tour** | **Single Command.** Consequences (status, comms, process attention) are platform consequences + org template bindings — not a composite of Cancel + Send Message. |
| **Delete Lead** | **Single Destructive Command** with preview of graph effects — not a composite of archive + unlink + … |

**Simplest durable model:**

1. Operators always invoke **one Command key**.
2. If multiple writes are required for correctness, the **Domain Executor** owns that orchestration atomically.
3. If the operator must choose among distinct operational meanings, ship **separate Commands** (or one Command with a required role/outcome input) — do not invent an org “composite builder.”
4. Operational Intents / BOS may *suggest* a Command; they do not create a new composition layer in configuration.

---

## 6. Business Process integration

### Clean product model (replaces multi-source conceptual model)

```text
Organization Command Catalog
        ↓
Process selects subset (“Commands available in this process”)
        ↓
Stage sets recommendation + order/group
        ↓
Runtime evaluates eligibility for subject at stage
        ↓
Operational Context filters by availability + subject resolution
        ↓
Command Runtime executes
```

| Step | Product rule |
|------|--------------|
| **Organization command catalog** | Single source: Configured Commands from `/configuration/commands` (enabled platform capabilities). |
| **Process command selection** | Process picks from the org catalog only. No parallel “lifecycle base list,” no free-typed keys, no stub browsing. |
| **Stage recommendation** | Recommended / Optional / Manage-only (or equivalent). Recommendation is UX priority, not a second catalog. |
| **Eligibility** | Stage + subject + Domain Executor. Blocked Commands stay visible with reason when process-selected. |
| **Ordering / grouping** | Stage configures order within recommendation groups; family may provide default groups. |
| **Disabled commands** | Org-disabled → absent everywhere. Process-unselected → absent from that process’s operator journey (may still appear in admin Destructive contexts if separately available). |
| **Unsupported commands** | Platform marks capability unsupported for a grain/process type → cannot be selected in process editor. |
| **Context availability** | Configured on the Command (and optionally narrowed per process): Workspace, Work Unit, Focus Panel Manage, relationship row, BOS, etc. |
| **Outcome interaction** | Outcomes remain the process mechanism for **confirming stage completion** and durable stage moves. Domain Commands (Waitlist Child, Close Lead, Complete Tour) may *produce* state that Outcomes also reflect, but Outcomes are not a second command catalog. Process editors clearly separate **Commands** vs **Outcomes**. |

### `/configuration/processes` vs `/configuration/commands`

| Belongs in Commands | Belongs in Processes |
|---------------------|----------------------|
| What the org’s Commands are and how they’re shaped | Which Commands this process uses |
| Confirmation, reasons, templates, variants | Stage recommendation and journey order |
| Cross-process availability defaults | Stage Outcomes and transitions |
| Destructive policies expression (where org-allowed) | Readiness / required information timing for stages |

---

## 7. Command Runtime

### Shared contract

```text
Resolve Context
→ Resolve Subject
→ Resolve Inputs
→ Authorization
→ Eligibility
→ Warnings
→ Preview
→ Confirmation
→ Execute
→ Audit
→ Refresh
→ Success
```

| Step | Platform Runtime | Domain Executor | Business Process | BOS |
|------|------------------|-----------------|------------------|-----|
| Resolve Context | Yes — surface, process, stage, actor | — | Supplies process/stage identity | May pre-supply context |
| Resolve Subject | Yes — from selection / focus / capture-none | Validates subject type | — | May propose subject |
| Resolve Inputs | Collects/validates against schema + org required | Domain defaults | Stage may add required-info gates for *progression*, not redefine payload | May fill draft inputs |
| Authorization | Enforces permission + scope | May assert domain rules | — | Never elevates privilege |
| Eligibility | Orchestrates | **Owns** domain eligibility | Stage membership informs evaluation | Explains; does not override |
| Warnings / Blockers | Surfaces uniformly | Emits codes + data | Recommendation level | Explains blockers |
| Preview | Requires when policy says so | **Owns** preview content | — | May show draft preview |
| Confirmation | Enforces minimum class | — | — | Same confirm before execute |
| Execute | Single invoke path | **Owns** writes | — | Same path after confirm |
| Audit | Requires audit record | Emits domain events | — | Attribution as actor assist |
| Refresh | Signals projections/UI | Domain invalidation hints | — | — |
| Success | Standard result contract | Domain result payload | May unlock Outcome UI | Summarizes |

**BOS rule (product):** BOS recommends, pre-fills, and explains. BOS never private-path mutates and never softens Destructive confirmation.

---

## 8. Destructive Command policy

Destructive Commands are a **first-class family**. Each cell is a product rule for the future system (informed by audit gaps).

Legend: **N** = not offered · **Op** = standard operator · **Adm** = administrator · **Maint** = configuration/maintenance only · **—** = N/A

### 8.1 Policy matrix

| Subject | Delete | Archive | Deactivate | Remove | Cancel | Withdraw | Void |
|---------|--------|---------|------------|--------|--------|----------|------|
| **Person** | N (prefer deactivate/archive identity policy) | Adm soft archive if platform supports | Adm/Op deactivate participation flags where defined | — | — | — | — |
| **Household** | N hard delete | Adm archive household | Adm | Remove member = **Remove** Command | — | — | — |
| **Child (person)** | N | Adm | Adm | — | — | — | — |
| **Child enrollment (OCM)** | N | Rare Adm | — | — | — | **Op Withdraw Child** | — |
| **Lead (opportunity)** | **Adm Delete Lead** (hard, gated) | **Adm/Op Archive Lead** (soft) | — | — | — | — | — |
| **Tour booking** | N | N | — | — | **Op Cancel Tour** | — | — |
| **Enrollment agreement** | N | — | — | — | **Op/Adm Cancel agreement** (before start rules) | — | — |
| **Communications thread** | N | Op Archive thread | — | — | Cancel scheduled announcement | — | — |
| **Processing case** | N | Op/Adm Archive case | — | — | — | — | — |
| **Financial artifact (payment, invoice)** | N hard delete posted | — | — | — | — | — | **Adm Void** (status) |
| **Configuration objects** | Maint delete/archive-if-unused | Maint | Maint deactivate | — | — | — | Maint void/retire versions |

### 8.2 Cross-cutting destructive rules

| Rule | Product requirement |
|------|---------------------|
| **Allowed operators** | Matrix above; Destructive Commands declare minimum role |
| **Confirmation** | Always required; typed confirmation for hard Delete and Void of financial truth |
| **Dependency analysis** | Preview must list blockers and cascade graph |
| **Preview** | Mandatory for Delete, Void, Withdraw, Archive Lead, Cancel Tour |
| **Audit** | Mandatory structured audit + domain event |
| **Recovery** | Archive/Cancel/Withdraw should define reopen/restore Commands where operationally needed; hard Delete has **no undo** — only controlled recreate |
| **Visibility** | Prefer Manage / Administrative contexts for Delete; journey rails prefer Cancel/Close/Withdraw domain verbs |

### 8.3 Semantic distinctions (product glossary)

| Verb | Meaning |
|------|---------|
| **Delete** | Permanent removal of a record graph; irreversible |
| **Archive** | Soft removal from active work; recoverable |
| **Deactivate** | Stop active use without removing history (flags/`is_active`) |
| **Remove** | End a **relationship or membership link**, not the person |
| **Revoke** | End a **specific authority** (pickup, emergency) while link may remain |
| **Cancel** | Terminate an **operational commitment** (tour, visit, announcement) |
| **Withdraw** | End enrollment participation with enrollment semantics |
| **End** | Close a time-bounded relationship/role with end date |
| **Void** | Invalidate a financial/config versioned artifact |

---

## 9. Tour Command family

**Subject grain:** Tour booking (created under a Lead/opportunity).  
**Domain Executor:** Tour booking domain (today’s booking service — product-owned binding).

### 9.1 Schedule Tour

| Dimension | Definition |
|-----------|------------|
| Subject | Lead (opportunity); creates Tour booking |
| Required information | Location, start/end (or slot), timezone; org may require notes |
| Eligibility | No conflicting active booking; location allowed; slot available |
| Preview | Date/time/location, family, reminder plan |
| Confirmation | Required |
| Consequences | Booking created; optional pending→confirmed path; process mirror; reminders scheduled |
| Automation | On `tour_*` events — org template bindings |
| Audit | Lifecycle + Command audit |
| Recovery | Reschedule or Cancel; not Delete |
| Availability | Process stages where tours are in-journey; Work Unit; Focus Panel; Workspace as configured |

### 9.2 Reschedule Tour

| Dimension | Definition |
|-----------|------------|
| Subject | Active Tour booking |
| Required information | New slot/time; optional reason (org-configurable) |
| Eligibility | Status ∈ requested / pending / confirmed / rescheduled |
| Preview | Old → new time; reminder replacement |
| Confirmation | Required |
| Consequences | Times updated; reminders replaced; BP mirror; comms |
| Automation | Reschedule templates |
| Audit | `tour_rescheduled` + Command audit |
| Recovery | Reschedule again or Cancel |
| Availability | Same family contexts when an active booking exists |

### 9.3 Cancel Tour

| Dimension | Definition |
|-----------|------------|
| Subject | Non-terminal Tour booking |
| Required information | Org may require cancel reason |
| Eligibility | Non-terminal statuses |
| Preview | Booking summary; comms that will send; process attention impact |
| Confirmation | **Required** (product fix vs today’s silent cancel) |
| Consequences | Status canceled; suppress reminders; BP attention; cancel comms |
| Automation | Cancel templates |
| Audit | Mandatory |
| Recovery | **Reopen Tour** when eligible (see §9.7) |
| Availability | Manage + journey contexts with active booking |

### 9.4 Confirm Tour

| Dimension | Definition |
|-----------|------------|
| Subject | Booking in pending approval |
| Required information | None beyond confirm (org optional note) |
| Eligibility | `pending_approval` only |
| Preview | Confirmed time/location |
| Confirmation | Required |
| Consequences | Confirmed; mirror; confirm comms |
| Automation | Confirm pack |
| Audit | Mandatory |
| Recovery | Reschedule / Cancel |
| Availability | Journey + Manage + BOS |

### 9.5 Complete Tour

| Dimension | Definition |
|-----------|------------|
| Subject | Confirmed/rescheduled booking |
| Required information | Optional outcome notes (org) |
| Eligibility | confirmed / rescheduled |
| Preview | Mark completed |
| Confirmation | Required |
| Consequences | Completed; BP completed signal; completed comms if configured |
| Automation | Optional follow-up |
| Audit | Mandatory |
| Recovery | No-show mistaken → admin correction path (platform); not casual reopen to confirmed without rules |
| Availability | Post-tour stages / Manage |

### 9.6 No-show

| Dimension | Definition |
|-----------|------------|
| Subject | Confirmed/rescheduled booking |
| Required information | Optional reason |
| Eligibility | Same as Complete |
| Preview | Mark no-show + follow-up comms |
| Confirmation | Required |
| Consequences | `no_show`; BP signal; follow-up template |
| Automation | No-show follow-up |
| Audit | Mandatory |
| Recovery | Reopen only under admin policy if platform supports correction |
| Availability | Post-tour / Manage |

### 9.7 Reopen Tour

| Dimension | Definition |
|-----------|------------|
| Subject | Canceled (and optionally no_show under admin policy) booking |
| Required information | Reason |
| Eligibility | Platform rules: canceled → prior non-terminal equivalent; time window / admin role as configured by platform |
| Preview | Restored status; whether reminders recreate |
| Confirmation | Required |
| Consequences | Restore operational booking status; BP mirror; optional notify |
| Automation | Optional |
| Audit | Mandatory |
| Recovery | N/A (this is recovery) |
| Availability | **Administrative / Manage** by default; not a primary journey rail Command |

**Reminders & calendar:** platform consequences of Schedule/Reschedule/Confirm — configured under Tours family settings (offsets, templates), not separate operator Commands.

---

## 10. Relationship Command family

### Decision: **Family of first-class Commands; “Add Family Member” is an entry hub, not one opaque composite**

| Command | Role |
|---------|------|
| **Add Family Member** | **Entry Command / hub**: capture or select a person and choose household role (Parent/Guardian default). Product label for the common path. Internally one capability with **required role input**, or a chooser that routes to role-specific Commands — **same family, no second mutation stack**. |
| **Add Parent** / **Add Guardian** | First-class if org wants distinct labels; otherwise roles under Add Family Member |
| **Add Emergency Contact** | Child-scoped authority Command |
| **Add Authorized Pickup** | Child-scoped authority Command |
| **Add Billing Contact** | Billing responsibility Command |
| **Link Existing Person** | Link without creating; role selectable |
| **Link Existing Child** / **Add Child** | Child membership Commands (household vs opportunity enrollment child — platform distinguishes subjects) |
| **Make Primary Contact** | Designation Command |
| **Change Relationship** | Change role / scope on an existing edge |
| **Remove Relationship** | End household/opportunity membership link (**Remove**, not Delete Person) |
| **Revoke Authority** | Soft-end EC/pickup/billing authority on child scope |

### Product rules

- **Person search vs create** is an input pattern shared by the family, not separate Commands.
- **Household membership** and **child-specific authority** stay distinct subjects/scopes (do not flatten).
- **Duplicate detection** is platform eligibility/warning.
- **Remove** and **Revoke** are Destructive-adjacent relationship Commands with preview and confirmation — not raw DELETE buttons.
- Org configures labels, default roles, allowed scopes, confirmation copy — not write targets.

---

## 11. Lead lifecycle

| Command | Class | Definition |
|---------|-------|------------|
| **Close Lead** | **Operational** | Domain verb: move Lead to a closed/lost status via allowed transitions; reason configurable. Primary journey Command for ending active pursuit. |
| **Archive Lead** | **Administrative / operational soft-exit** | Soft-remove from active queues; recoverable via **Reopen Lead** or Unarchive. Prefer Archive over Delete for normal cleanup. |
| **Delete Lead** | **Administrative Destructive** | Hard-delete graph with mandatory preview, dependency blockers (jobs, redemptions, etc.), typed confirmation, audit. **No undo.** Offered only in Manage/Admin contexts when platform eligibility passes. |
| **Reopen Lead** | **Operational / admin** | Restore from closed/archived to an allowed open status per transition rules. |

### Policies

| Topic | Rule |
|-------|------|
| Operational vs admin | Close/Reopen on journey; Archive/Delete in Manage |
| Hard delete | Allowed only when dependency analysis passes; never silent |
| Recovery | Archive/Close → Reopen; Delete → none |
| Audit | All four mandatory |
| Status umbrellas | Generic “Update Lead Status” is **not** the primary operator product; advanced/internal only if retained for power users |

---

## 12. `/configuration/commands`

### 12.1 Purpose

**Job to be done:** Let an organization administrator see every platform Command available to them, shape how those Commands behave within guardrails, and control where they appear across Business Processes and operational contexts — without building mutations.

It answers: *What can our operators do, how carefully, and where?*

### 12.2 Information architecture

Suggested IA:

| Area | Contents |
|------|----------|
| **Overview** | Counts by family; disabled Commands; destructive policy summary; links to Processes |
| **Commands** | Searchable catalog of Configured Commands (grouped by Family) |
| **Families** | Family landing pages (Tours, Relationships, Destructive, …) with shared settings (e.g. tour reminder defaults) |
| **Variants** | Named variants for a Command (optional advanced) |
| **Availability** | Process + context matrix for a Command (or deep-link from Processes) |
| **Automation** | Read-only map of events → suggested Automations; links out to Automations product |
| **Audit** | Recent Command executions / destructive audit trail (or link to audit explorer) |

**URL product name:** `/configuration/commands`  
(Implementation may redirect from `/admin/settings/actions` during migration.)

### 12.3 Command detail (single Command)

A Command detail page exposes:

**Identity (platform, read-only)**  
Key, family, subject types, confirmation class, capability description.

**Expression (org)**  
Enabled, display name, help text, icon.

**Inputs (org within allow-list)**  
Required overlays, defaults, allowed options/reasons.

**Safety (org within class)**  
Warning copy, confirmation wording (cannot weaken class).

**Consequences (org bindings)**  
Communication templates per event slot; automation references.

**Availability (org)**  
- Business Processes included  
- Stage recommendation defaults (overridable in process editor)  
- Operational contexts: Workspace, Work Unit, Focus Panel, relationship row, BOS, Manage, …  

**Variants (org)**  
List/create bounded variants.

**Runtime status (platform)**  
Supported / Partial / Unavailable — honesty about capability readiness (replaces silent stubs).

### 12.4 Availability (product language)

Operators configure **where a Command is available**:

- **In which Business Processes**
- **At which stages** (via process editor recommendation)
- **In which operational contexts** (Workspace, Work Unit rail, Focus Panel Manage, relationship contexts, BOS, …)

**Implementation note:** Storage may continue to use `action_placements` (surface/slot/order/active). The product never asks admins to “create a placement” as the primary metaphor; it asks them to set **availability**.

### 12.5 Relationship to the current Action Buttons page

| Today (`/admin/settings/actions`) | Future (`/configuration/commands`) |
|-----------------------------------|-------------------------------------|
| Title: Action buttons | Title: Commands |
| Job: add/reorder enable buttons on surfaces | Job: catalog + shape + availability + safety |
| Library of button cards | Family-organized Command catalog |
| System defaults as placements | Platform Commands with org configuration |
| No destructive policy | Destructive family first-class |
| No process-centric model | Deep integration with `/configuration/processes` |
| Stubs appear as placeable | Unsupported capabilities cannot be enabled as if complete |

**Evolution stance:** The current page **does not survive unchanged**. It is a transitional placement editor. The Commands product **absorbs** its real job (availability) and **replaces** its framing. Migration may keep a temporary “Button availability” advanced panel that writes the same implementation tables, but the primary IA is Commands.

---

## 13. Answers to success criteria

| Question | Answer |
|----------|--------|
| What is a Command? | Operator-facing, platform-owned capability org configures and processes consume. |
| What belongs in `/configuration/commands`? | Catalog, expression, safety, variants, availability, family settings, honesty about support, destructive policy expression. |
| What belongs in `/configuration/processes`? | Journey structure, stage Outcomes/transitions, which Commands are selected/recommended for stages, readiness timing. |
| What is configurable? | Enablement, labels, help, icons, required overlays, options/reasons, warning/confirm copy, templates, automation refs, defaults, variants, availability. |
| What is platform-owned? | Semantics, contracts, auth, audit, eligibility, preview, integrity, events, confirmation minimum class. |
| How do Commands become available? | Org enables → Process selects → Stage recommends → Context resolves subject → Runtime evaluates → Execute. |
| How should destructive Commands behave? | Family with distinct verbs; matrix by subject; preview + confirmation + audit + recovery rules; no generic CRUD. |
| What implementation decisions remain after approval? | Executor consolidation path; storage mapping (`action_definitions` / `action_placements`); permission model granularity; migration of Action Buttons UI; promotion of tour/relationship/delete onto shared runtime; stub retirement; Outcome↔Command boundary in editors. |

---

## 14. Implementation decisions deferred (explicitly out of scope here)

These are **not** product-open questions; they wait for an architecture sprint after owner approval of this definition:

1. How many code registries collapse into one capability registry.
2. Whether `/api/admin/actions/execute` and `/api/admin/mutations/execute` merge.
3. Schema changes vs reuse of `action_placements` for availability.
4. Permission key model beyond coarse admin/ops.
5. Exact migration sequence from Action Buttons.
6. Whether Processing identity keys are ever shown in `/configuration/commands`.

---

## 15. Owner approval checklist

Approve or amend:

- [ ] Vocabulary table (§1), especially Command vs Outcome vs Automation  
- [ ] Configure-not-author rule (§3)  
- [ ] Variants first-class as config overlays (§4)  
- [ ] No org-authored composites (§5)  
- [ ] Single org catalog → process select model (§6)  
- [ ] Destructive matrix (§8)  
- [ ] Tour family including mandatory Cancel confirmation + Reopen (§9)  
- [ ] Relationship family + Add Family Member as hub (§10)  
- [ ] Lead Close / Archive / Delete / Reopen split (§11)  
- [ ] `/configuration/commands` IA and retirement of Action Buttons framing (§12)  

---

## Appendix — Traceability to audit

| Product claim | Audit evidence |
|---------------|----------------|
| Multi-runtime today → need single product model | Audit §1, §3, §8 |
| Settings is placement-only | Audit §6 |
| Process multi-source list | Audit §7 |
| Tour cancel unsafe / no reopen | Audit §11 |
| Relationship fragmentation | Audit §12 |
| Delete Lead API without command UX | Audit §10 |
| Decision register items resolved by owner direction | Audit §17 |

---

*End of product definition. Definition-only; no implementation performed.*
