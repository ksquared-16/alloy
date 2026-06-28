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

---

## Action execution path

**BOS suggests/proposes; the user confirms; the server executes.** When BOS applies a
registered action, it uses the same `POST /api/admin/actions/execute` route as manual UI
(`runRegisteredAction` → validate → eligibility gate → invariant-owning mutation). BOS
never invents executable behavior or mutates directly: it can only invoke *registered*
action keys, and the server remains authoritative for validation, eligibility, required
inputs, mutation, audit, and result. Reference implementation: `create_lead` (dedicated
BOS rail apply UI is follow-up). See `actions-and-workflows.md` § Action Runtime contract.

BOS is a **placement**, not a separate command system. A BOS recommendation invokes the
same registered Operational Command as any other surface; its context resolution is
`bos_proposal` (BOS proposes a subject/payload, the operator confirms — never a silent
assumption). One capability, many placements, one runtime — see `invocationContext.ts`.

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
`docs/sprints/06_2026/operational_command_runtime_v3.md`.

**Create Lead (first visible flow, V4).** BOS Create Lead is not a separate flow — it builds
on the existing parse/proposal behavior and feeds the parsed values into the shared command
view-model (`deriveCreateLeadCommandFromBosProposal`). Complete parsed values arrive at
preview/confirm; missing values surface in operator language ("I still need a last name and a
phone or email"). BOS confirms and executes through the **same** registered `create_lead`
action and execute route as manual entry. See
`docs/sprints/06_2026/create_lead_command_flow_audit.md`.

**BOS uses the platform Command Surface, not a separate UI runtime (V5).** A BOS proposal is
just a command snapshot fed to the same platform-owned Command Surface
(`surface/deriveCommandSurfaceState.ts`) as manual/Work Unit/Focus Panel — the `bos` variant.
The shell anatomy, preview/confirm/success patterns, and execution path are identical; only the
entry point (and how much context arrives pre-resolved) differs.

**Operator-visible wiring (V2).** BOS renders the same `CommandSurfaceShell` driven by
`useCommandSurfaceController`: it parses lead info → known inputs → the shared Create Lead
command model → surface preview/missing-inputs → confirm. Confirm executes through the existing
`/api/admin/actions/execute` registered `create_lead` (injected into the controller). BOS must
not create leads through a private path, own its own command lifecycle, or bypass surface state.

**End-to-end wiring (V3).** In the live runtime, BOS Create Lead is the same `CreateLeadModal`
workspace (launched via the `adminv2:open-create-lead` listener) now hosted by the platform
`CreateLeadCommandSurface`. So a BOS-launched Create Lead confirms through the **same** shared
client adapter `executeCreateLeadCommand` → registered `create_lead` as manual/Work Unit, with
standardized success. The command model still derives BOS preview (complete parse) vs missing
required inputs (incomplete parse) in operator language. BOS remains an entry point, not its own
mutation path. See `docs/sprints/06_2026/command_surface_v3.md`,
`command_surface_v2.md`, `command_surface_v1.md`.

---

## Capabilities registry

`web/lib/bos/bosCapabilityRegistry.ts` — stable `capability_key` entries.

---

## Related

- `../../product/bos-foundation.md` (transitional expanded reference)
- `../foundation/product-roadmap.md` (Paused section)
