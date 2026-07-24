---
owner: engineering
status: certified-stage-2-5
last_reviewed: 2026-07-22
sprint: org-runtime-realization
slot: 4
phase: configuration-assignment-capability-certification
---

# Stage 2.5 — Configuration Assignment Capability Certification

## Question

> Can this exact backend capability power every Organization configuration page?

## Answer

**No — and that is correct.**

Not every Organization page needs **Configuration Assignment**.

What Stage 2 built is the first live consumer of a **platform Assignment substrate** (Configuration Publication + Distribution), with a Programs adapter (`make_available`).

Claiming “one capability powers every page” would force Tuition, Access, and Surfaces through the wrong engine.

Smell check passed: **we do not need a second assignment engine for Tuition.**

---

## Certification verdict

**B — Platform-shaped; Programs is the first adapter; thin extraction remains before multi-domain claims.**

| Claim | Status |
|-------|--------|
| Programs Make Available is production-authoritative (Verdict A publish→assign) | ✅ Certified |
| Substrate (`configuration_publications` / `configuration_distribution_*` / delivery plan / evidence) is domain-neutral | ✅ Certified |
| Preview → Commit is a platform operator primitive | ✅ Certified (cross-cutting) |
| Exact Programs command can power Tuition / Fees / Policies without change | ❌ Rejected — wrong kind |
| Named multi-domain “Configuration Assignment Runtime” fully extracted | ⚠️ Partial — contract named; run orchestration still Programs-hosted; command ops still Programs-FK’d |

---

## Domain matrix

| Domain | Uses same Assignment capability? | Operator verb | Correct primitive |
|--------|----------------------------------|---------------|-------------------|
| **Programs** | ✅ Yes (live adapter) | Make available / Add to Locations | Assignment (availability) |
| **Tuition** | ❌ No — must not | Apply / override cells | **Value inheritance + Location override** |
| **Fees / Catalog** | ❌ No | Apply scoped products | Value / scoped rows |
| **Policies** | ❌ No | Apply rules | Value inheritance (most-specific-wins) |
| **Business Processes** | 🟡 Candidate later | Enable | Assignment (activation) — when Location availability exists; today dept lifecycle |
| **Surfaces** | 🟡 Partial / different axis | Publish / Assign | **Process/workspace binding** — not Location distribution |
| **Automation** | 🟡 Candidate later | Activate | Assignment (availability) when product appears |
| **Access** | ❌ Different substrate | Assign roles / scopes | **Authorization assignment** |

### Tuition smell test

If implementation says “we need a second assignment engine for Tuition,” **stop**.

Tuition already has the correct engine:

- Org default (`location_id` null)
- Location override row
- Restore inherit

That is the Override Pattern, not publication distribution.

---

## What Stage 3 wires

```text
Configuration Assignment Runtime (substrate + Preview→Commit)
        ↓
Programs adapter (make_available / LPC deliver / Verdict A)

Later:
        ↓ Tuition adapter          → value inherit/override runtime (NOT assignment)
        ↓ Business Processes       → assignment adapter when Enable-for-Locations exists
        ↓ Surfaces                 → binding/publish adapter (different axis)
        ↓ Automation               → assignment adapter when Activate-for-Locations exists
```

Stage 3 is **not** “wire a Programs feature.”  
Stage 3 is **wire the approved Programs interaction to the certified Assignment adapter**.

---

## Primitive kinds (do not collapse)

| Kind | Question it answers | Example |
|------|---------------------|---------|
| **Assignment / availability** | Where is this definition consumable? | Programs Make available |
| **Value inheritance / override** | What value applies here? | Tuition cells |
| **Authorization assignment** | Who may act / where? | Access site scope |
| **Surface / process binding** | Which chrome binds to which process? | Surfaces |
| **Preview → Commit** | Operator confidence before side effects | All of the above when mutating bulk/state |

Code contract: `web/lib/configPublication/configurationAssignmentRuntime.ts`

---

## What is already platform vs Programs-only

### Platform (reuse)

- `web/lib/configPublication/{types,deliveryPlan,evidenceService,runtimeModel,effectiveResolution}.ts`
- Tables: `configuration_publications`, `configuration_distribution_runs/targets`, consumptions, finalize/failure RPCs
- Preview → Commit re-resolve rule
- Soft site eligibility + scope gate pattern
- `refreshTargets` shape
- `configuration_command_operations` *idea* (idempotent grouped ops)

### Programs adapter (keep)

- `assign_program_publication_target_v1` → LPC
- `makeProgramAvailable*` eligibility + create→validate→publish compound
- Command key `programs.make_available.v1`
- Events `configuration.program.*`

### Extraction still owed (before BP/Automation adapters)

1. Pull run create/finalize/retry loop into `configPublication/distributionRuntime.ts` (inject deliver RPC)
2. Genericize `configuration_command_operations` FKs to `subject_id` + `domain_key` (drop Programs-only FKs)
3. Thin command shell shared by adapters

Do **not** block Stage 3 Programs wiring on full extraction — block only claims that Tuition/Access use this same command today.

---

## Organization implementation strategy (adjusted)

After Stage 3, do not blindly go page-by-page inventing behavior.

For each Organization surface ask:

1. Is this an **Object Collection** or **Configuration Hub**?
2. Does it need **Configuration Assignment** (availability)?
3. Does it need **Configuration Continuity**?
4. Does it support **local overrides** (value kind)?
5. Does it require **Preview → Review → Commit**?

Then implement using the certified primitive — do not invent a parallel engine.

---

## Lifecycle (Programs) — reaffirmed

```text
Draft → Validate → Publish → Make available → Operate
```

Verdict A stands. No half-live unpublished associations.

---

## Stage 3 gate (unchanged intent, clearer framing)

Wire:

```text
Approved Stage 1 UX
  → preview_make_available / make_available
  → Programs adapter only
```

Do not redesign interaction.  
Do not fold Tuition into Assignment.  
Do not start BP/Surfaces adapters until their authority proves Assignment vs Binding vs Activation.

---

CONFIGURATION ASSIGNMENT CAPABILITY CERTIFIED — Programs is the first adapter on a platform Assignment substrate; Tuition and value domains stay on inheritance/override; Preview→Commit is a cross-cutting primitive; Stage 3 wires the Programs adapter only.
