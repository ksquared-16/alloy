---
owner: modules
status: canonical
last_reviewed: 2026-07-28
supersedes: []
---

# AI platform

**Status:** Canonical platform module doc.

BOS (Business Orchestration System) — assistive, human-in-the-loop intelligence layer.

---

## Maturity

| Capability | Status |
|------------|--------|
| Orchestrator command bar | Complete |
| Task Assist (comms drafts) | Complete |
| Workflow Assist | Complete (narrow) |
| Needs-attention enrich | Complete (gated) |
| Config/Layout Assist foundation | Complete (partial apply) |
| Autonomous agents | **Future — explicitly paused** |

---

## Rules (frozen)

- BOS is **not** a parallel platform — routes through existing records, permissions, audit
- **Propose → human approve → apply** — no autonomous side effects
- Org `ai_policy` + RBAC permission keys gate features
- Visual identity frozen: `../../system/bos-identity-doctrine.md`

### BOS presentation states (Adaptive Workspace System — July 2026)

**BOS is not a permanent right rail.** It is a persistent assistant: always available, not always consuming width.

| State | Behavior |
|-------|----------|
| **closed** | Floating launcher only; full operational canvas |
| **floating** | Operator-movable/resizable window — **default**; conversation + context persist; not modal; geometry persists in session preference |
| **pinned** | Optional right rail; workspace reflows; horizontally resizable; preference persists |

One BOS runtime/conversation across states. Unpin → restores last floating geometry; close → launcher; Reset → default floating size/position. **Context pills** show live Business Process / Work View / Subject; `context_boundary` chat notices are suppressed at render.

BOS presentation does **not** own workspace/Work Unit action chrome — Actions remain on their operational surfaces regardless of assistant state.

Layout ownership: `../core/navigation-and-workspace-doctrine.md` § Adaptive Workspace Presentation Contract. Code: `web/lib/presentation/adaptiveWorkspaceSystem.ts`, `web/lib/bos/bosFloatingGeometry.ts`.

---

## Action execution path

**BOS suggests/proposes; the user confirms; the server executes.** Confirmed BOS Commands
use the shared client bridge `executePlatformCommandViaActionsApi` →
`POST /api/admin/actions/execute` → `executeCommandInvocation` → the capability’s canonical
executor. BOS never invents executable behavior or mutates directly: it prepares inputs and
invokes Runtime once; the server remains authoritative for validation, eligibility,
authorization, mutation, audit, and result. See `actions-and-workflows.md` and the frozen
closeout `../milestones/bos-command-runtime-convergence-closeout.md`.

BOS is a **placement**, not a separate command system. Context resolution is `bos_proposal`
(BOS proposes a subject/payload; the operator confirms — never a silent assumption). Live
slash discovery is gated by process-effective Command keys
(`resolveBosProcessEffectiveCommandKeys`) ∩ `bosCommandAdapterRegistry` — BOS cannot invent
an unselected process Command; authorization remains deferred to invocation.

BOS is the eventual primary interface, but it must use the same runtime as manual UI.
Manual UI matters because it teaches the command model:

- **Work Unit Actions** = "what can I do from this operational context?"
- **Focus Panel Manage** = "what can I do to this selected record?"
- **BOS** = propose/complete the same commands conversationally.

**BOS progressively removes flow stages.** A command is a flow of reusable stages
(`commandFlow.ts`); BOS is an entry point that arrives with more stages already resolved, so
fewer remain — the runtime stays identical:

```
Manual:        resolve_subject → resolve_inputs → preview → execute
Focus Panel:                     resolve_inputs → preview → execute
BOS:                                              preview → execute
BOS (resolved):                                             execute
```

BOS never skips eligibility, confirmation policy, audit, or refresh — it only pre-resolves
subject and inputs conversationally. See
`docs/sprints/archive/06_2026/operational_command_runtime_v3.md`.

**Create Lead (first visible flow, V4).** BOS Create Lead is not a separate flow — it builds
on the existing parse/proposal behavior and feeds the parsed values into the shared command
view-model (`deriveCreateLeadCommandFromBosProposal`). Complete parsed values arrive at
preview/confirm; missing values surface in operator language ("I still need a last name and a
phone or email"). BOS confirms and executes through the **same** registered `create_lead`
action and execute route as manual entry. See
`docs/sprints/archive/06_2026/create_lead_command_flow_audit.md`.

**BOS command session.** Slash discovery or Actions entry opens a **scoped BOS command session**
over Command Runtime — not a parallel mutation engine. Adapter registry keys include
representative families (`create_lead`, `update_lead_status`, `add_parent_guardian`,
`cancel_tour`); Create Lead remains the richest conversation/form draft reference
(`ConversationIntakeAdapter`). Other BOS-ready Commands use thin preparation adapters + a
generic session body. Confirmed execution always goes through
`executePlatformCommandViaActionsApi`. Universal Conversation Runtime is a **separate**
mission; Participant/packet Runtime is orthogonal.

**BOS uses the platform Command Surface concepts, not a separate mutation runtime.**
BOS must not own a private mutation lifecycle or bypass server authority. Canonical path:
Business Process → effective Commands → BOS preparation → shared bridge → Command Runtime →
domain executor.

**Automations (dependency direction only).** Commands emit domain events that Automations may
consume. Automations may invoke Commands through the shared Command Runtime under the same
authorization and validation. Automations do not own domain mutation execution (including Tour
booking writes). The Automation product is not implemented in Commands P5.

**Prior wiring notes (V2–V3).** Earlier Command Surface / modal-host wiring documented that
`adminv2:open-create-lead` mounted `CreateLeadCommandSurface`. That remains the **compatibility
fallback**. Primary operator entry is now the V6 command session above. See
`docs/sprints/archive/06_2026/command_surface_v3.md` for historical surface anatomy.

**BOS intake field parity (Create Lead reliability thread).** BOS intake is parse-and-fill over
the **same** field model as manual Create Lead — the BOS path must never present a different
source than the dropdown the operator would otherwise use:

- **Field sources match the standard gather fields** (`createLeadPlatformGather.ts`). Location,
  Program, Room are canonical `placement_select` dropdowns (`site`, `site_program`, `site_room`);
  Schedule is the `childcare_schedule_type` option set; Desired Start is a date; Parents are
  text/email/phone. Program previously fell back to free text because the `child:program_interest`
  rule binds `desired_program_category_id` — `placementSelectForInquiryChildField` now maps that
  key to `site_program`. A parity test (`createLeadBosFieldSourceParity.test.ts`) locks this so a
  configured field never silently regresses to text.
- **One canonical location source.** Free-text location ("South Campus") resolves through the
  same `useInquiryChildPlacementCascade().siteOptions` the dropdown uses (with the locations-hierarchy
  fallback), fed to `parseCreateLeadIntakeText` — not a second `siteFilter.bootstrap.sites`-only
  source. Program filtering then follows the resolved location.
- **Multiple parent emails preserved.** The extractor captures every email (multi-email scan), and
  household grouping distributes emails to the matching parent (source line, then name local-part)
  instead of collapsing them onto the primary — Jason→jason@…, Alex→alex@…, neither overwriting the
  other.

---

## Capabilities registry

`web/lib/bos/bosCapabilityRegistry.ts` — stable `capability_key` entries.

---

## Related

- `../../product/bos-foundation.md` (transitional expanded reference)
- `../foundation/product-roadmap.md` (Paused section)
