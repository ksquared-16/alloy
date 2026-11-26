---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-01c
---

# Round 5 — Create Lead command authority comparison

**Inspection date:** 2026-07-27  
**Named lane:** `claude/create-lead-constraint-form-0f0dae`  
**Checkout:** `/Users/Kelly/Alloy/.claude/worktrees/operational-calc-registry-v1-6aa271`  
**Compared to:** BOS Round 5 branch `agent/cursor/2-bos-actionable-interface-plan` @ `dd3b461c6`  
**Also checked:** `origin/staging`, `agent/claude/2-create-lead-workunit-binding` (worktree `wt2-create-lead-source-kind-fix`), `agent/claude/3-lead-enrollment-product`

**Rule:** Evidence only — **do not** merge or cherry-pick wholesale. **Do not** create a BOS-specific process resolver.

---

## 1. Named branch verdict

| Question | Finding |
|---|---|
| Tip SHA | `94cc283d4` — `fix(dev-stop): make stop authoritative on the port listener…` |
| Unique vs `origin/staging` | **1** commit (toolkit/dev-stop only) |
| Behind staging | Large (branch predates current Create Lead / BOS session work) |
| Working tree dirty? | **Clean** |
| Resolves active Business Process explicitly? | **No** — tip has no Create Lead constraint/process work |
| Still department + hardcoded `stage_key: "lead"`? | N/A at tip; older tree’s Create Lead paths match pre-current-BOS lineage |
| Derives effective `record_creation` requirements? | **Not on this tip** |
| Introduces shared command-owned intake resolver? | **No** |
| Reached staging? | **No** Create Lead constraint commits from this branch name |

**Conclusion:** The named slot label is **not** carrying Create Lead command/constraint implementation. Treat it as an empty parallel label. Re-inspect if Kelly points at a different SHA.

---

## 2. What *has* reached staging (command / constraint related)

| Item | On `origin/staging` | Notes |
|---|---|---|
| `resolveCreateLeadActionIntakeSpec` | **Yes** | Dept metadata + operator/builder stage → `record_creation` policy + palette |
| `GET /api/admin/lifecycle/action-intake-spec` | **Yes** | Server path BOS already fetches |
| `CREATE_LEAD_REQUIRED_INPUTS` / `deriveCreateLeadBlockers` | **Yes** | **first + last + email\|phone only** — **no** `location_id` |
| `resolveCreateLeadLocationPolicy` / `CREATE_LEAD_PLATFORM_REQUIRED_KEYS` | **Yes** | Platform gather/checklist claim Location is always required |
| Server `createLeadAction` execute minimum | **Yes** | Context copies first/last/email/phone — **does not** require Location |
| PR #239 create-lead source-kind / work-unit binding | **Yes** (merged) | Processing intake commit / work-unit — **not** Form section ownership |
| BOS command session + progressive Form | **On BOS branch**, not the named constraint branch | Round 2–4 + premature Round 5 Placement work |

Related live lanes (not the named branch):

- `agent/claude/2-create-lead-workunit-binding` — opportunity↔work-unit binding (ahead of staging on that worktree)
- `agent/claude/3-lead-enrollment-product` — Mailroom/Forms/enrollment product; shares same intake resolver lineage, not a new BOS process resolver

---

## 3. Canonical resolver BOS must consume (today)

**Command intake contract (content):**

```text
fetchActionIntakeSpec({ action_key: "create_lead", department_id, stage_key: "lead" })
  → resolveActionIntakeSpec / resolveCreateLeadActionIntakeSpec
  → ActionIntakeSpec { required, recommended, optional, groups, constraints }
```

**Symbols (do not duplicate):**

| Concern | Owner module |
|---|---|
| Effective create-lead field set | `web/lib/lifecycle/resolveActionIntakeSpec.ts` → `resolveCreateLeadActionIntakeSpec` |
| `record_creation` filtering | `applyCreateLeadIntakePolicy` + `selectRulesForRecordCreation` |
| Stage field rules | `effectiveFieldRulesForBuilderStage` / stored builder rules |
| Client eligibility mirror | `web/lib/platform/commands/createLead/createLeadRequiredInputs.ts` → `buildCreateLeadEligibility` |
| Location *policy helper* (gather/checklist) | `web/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy.ts` |
| Registered execute | `createLeadAction` + `executeCreateLeadCommand` / action executor |

**BOS role:** consume `ActionIntakeSpec` (and eligibility built from code-owned minimum + effective `record_creation` / config hints). **Do not** invent a second process/stage/requirements resolver inside `web/lib/bos/**`.

Hardcoded `stage_key: "lead"` in BOS fetch is **allowed temporarily** until a command-owned resolver replaces that assumption (product decision §5).

---

## 4. Location ownership (authoritative finding)

| Layer | Is Location required? | Classification |
|---|---|---|
| Platform gather keys `CREATE_LEAD_PLATFORM_REQUIRED_KEYS` | Includes `location_id` | **Code-owned gather/checklist policy** |
| `isCreateLeadLocationRequired()` with no args | Always true (platform flag) | Same policy helper |
| Staging `CREATE_LEAD_REQUIRED_INPUTS` / `deriveCreateLeadBlockers` | **No** Location | Command eligibility mirror ≠ gather policy |
| Server execute / `createLeadAction` | **No** Location | Not server-enforced |
| Effective intake `record_creation` | **Only if** dept stage rules include Location with `record_creation` | **Config-owned when present** |
| BOS Round 5 (`8771c7c7a` etc.) | Forced Location into eligibility + Placement UI | **BOS-amplified / BOS-only surface** — **must not preserve** per decision §4 |

**Decision implication:**

- Do **not** keep a BOS-only Location blocker or synthetic Placement section.
- If Location is required for the org, it must appear because it is in the **effective intake required/`record_creation` set** and/or the **canonical command-owned minimum** (and then be enforced server-side by the command owner).
- Until the Create Lead command lane makes Location a true code-owned server minimum, BOS must treat Location like any other field: show/enforce only when the effective command intake contract says so (or when consuming an updated shared eligibility module that staging/command owns).

---

## 5. Process / stage binding (current truth)

| Claim | Status |
|---|---|
| Registry ties `create_lead` to enrollment | **True** (`supportedProcessKeys: ["enrollment"]`) |
| Intake resolves via active Business Process id | **False** — `process_id` is optional/copied; rules come from **department metadata** for stage |
| Stage key for requirements | Operator/builder **`lead`** (not `new_lead` / `new_inquiry`) |
| Named constraint branch changes this | **No** |

BOS must **not** redefine process binding. When a real command-owned resolver lands, BOS switches consumption; until then keep fetch → `resolveCreateLeadActionIntakeSpec` path.

---

## 6. What BOS should consume vs must not duplicate

### Consume

1. `ActionIntakeSpec` from action-intake-spec API (full required / recommended / optional / groups).
2. `buildCreateLeadEligibility(payload, configRequiredInputs)` — shared command eligibility (update only by aligning with command owner, not BOS-private rules).
3. Existing repeater/commit selection + execute mapping.
4. Configured entity labels from intake groups / catalog when rendering sections.

### Must not duplicate

1. Process resolution / active BP lookup.
2. Stage field-rule storage reading.
3. `record_creation` timing evaluation (call into lifecycle modules / consume result on spec).
4. A second Location platform policy inside BOS.
5. Synthetic “Placement & preferences” section ownership.
6. Curated field subsets that omit effective-spec fields.

---

## 7. Premature Round 5 code (already committed — realign required)

Local commits that conflict with these decisions (do not push; reverse/realign before continuing F5-02 product intent):

| Commit | Conflict |
|---|---|
| `8771c7c7a` Placement / Location Form projection | Synthetic Placement section; forces Location |
| Related eligibility change adding `location_id` to `CREATE_LEAD_REQUIRED_INPUTS` | BOS/client eligibility ≠ staging command mirror / server |
| `createLeadFormSectionProjection.ts` | Hardcoded Placement partitioning |
| Tests asserting Placement section | Must be rewritten to entity-group + effective-spec contract |

Still reusable after realignment:

| Commit | Reuse |
|---|---|
| `81a638241` household merge into shared draft | Keep direction; re-home under entity sections |
| `67f0b52f1` empty Children until Add child | Keep under child entity section |
| Multi-adult stable IDs | Keep |

---

## 8. Recommended integration order

1. **This deliverable (docs)** — product decisions + this comparison + ledger gate. **No further product code until accepted.**
2. **Confirm with Kelly** whether Location should become a **command+server** code-owned minimum (update shared `createLeadRequiredInputs` + execute) **or** remain **config `record_creation` only**. BOS does not decide alone.
3. **Realign Form projection** — delete Placement-as-section; group by intake entity; Required to create this lead vs Additional fields; full effective-spec coverage.
4. **Restore eligibility parity** — Form / Conversation / Review driven by shared eligibility + effective required; remove BOS-only Location force unless command owner lands it shared+server.
5. **F5-02 repeaters** — parents/children as repeaters *inside* canonical entity sections (stable IDs, shared draft).
6. **F5-05+** Review → Processing → Confirm → Success → retirement — only after entity-section Form + requiredness parity + authenticated QA.

**Do not** wait forever on the empty named branch; **do** re-check it (or the real Create Lead constraint SHA) before touching process/stage/server eligibility.
