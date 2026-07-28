---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-01c
---

# Round 5 — Product decisions (binding)

Incorporated **before** further F5-02+ product code. These supersede the premature Placement / BOS-only Location approach.

---

## 1. Form section ownership

Do **not** introduce or preserve **Placement & preferences** as a BOS-owned section.

Group fields by **canonical effective intake entity/subject ownership**.

Each effective entity group renders:

| Block | Rules |
|---|---|
| **Required to create this lead** | All hard-blocking effective `record_creation` fields for that entity; visible and editable without further disclosure |
| **Additional fields** | Collapsed by default; every other available field for that same entity; **no silent omissions** |

Likely groups: lead/opportunity · parent/person · child/enrollment participant · household **only** when the effective spec contains household-owned fields.

- Use **configured entity labels** where available.
- Do **not** move location/program/room/schedule into a synthetic Placement section — render under canonical owner.
- A **blocking field may never** be hidden under Additional fields.

---

## 2. Effective spec is the content contract

The Form must **not** maintain a curated field subset.

For every field in the effective Create Lead intake specification:

1. Assign to canonical entity group  
2. Blocking vs additional from effective requirement policy  
3. Editable control with canonical type + option source  
4. Shared-draft storage  
5. Review + execution mapping  

Required → expanded. All other → Additional fields for that entity.

---

## 3. Do not redefine process binding in BOS

Parallel lane `claude/create-lead-constraint-form-0f0dae` was re-inspected (F5-01c). Tip carries **no** Create Lead constraint/process resolver work — see [`evidence/command-authority-comparison.md`](./evidence/command-authority-comparison.md).

Before changing process / stage / requirement resolution / server eligibility / Location enforcement / execute constraints:

- Re-inspect that lane (or the SHA Kelly names)
- Prefer consuming the **command-owned** effective intake contract
- **Do not** merge/cherry-pick wholesale
- **Do not** create a BOS-specific process resolver

Today’s consumption target: `resolveCreateLeadActionIntakeSpec` via action-intake-spec API + shared `buildCreateLeadEligibility`.

Temporary: BOS may keep fetch `stage_key: "lead"` until a command-owned resolver replaces that assumption.

---

## 4. Client/server requiredness parity

Authoritative requirement set:

1. Code-owned Create Lead **command** minimum  
2. Plus effective **`record_creation`** requirements from command-resolved process/stage intake  

Same result must drive: Form · Conversation missing state · Review eligibility · Processing intake · server preflight · execution.

**Do not** preserve a BOS-only required Location rule.

### Location (accepted durable decision)

| Claim | Result |
|---|---|
| Code-owned Create Lead minimum | first name, last name, phone **or** email — **no Location** |
| Config `record_creation` | Location (and other fields) required **only** when on resolved intake `required` |
| Server | `resolveCreateLeadEligibilityForInvocation` merges those into `buildCreateLeadEligibility`; `runRegisteredAction` gates execute |
| BOS-only Location rule | **Removed** |

See [`evidence/requiredness-realignment.md`](./evidence/requiredness-realignment.md).

---

## 5. Stage and product language

- Technical resolution may use stage key **`lead`** until command-owned resolver replaces it.
- Do **not** describe requirements resolution as `new_lead` or `new_inquiry` internally.
- Operator-facing BOS copy: **Create Lead** · **Lead details** · **Required to create this lead** · **Additional fields** · **Review lead** · **Lead created**.
- When a stage label is shown, use the **configured Business Process stage label**.

---

## 6. Repeater model

Parents/guardians and children remain **repeaters within** their canonical entity sections.

Each row: stable identity · required fields visible · Additional fields collapsed · add another · remove where allowed · independent values/evidence · shared-draft sync across Conversation, Form, Review, restore.

---

## 7. Integration order (after this doc)

1. Accept F5-01c decisions + command-authority comparison  
2. Kelly/command-owner Location ownership call (server code-owned vs config-only)  
3. Realign Form to entity groups; remove Placement section + BOS-only Location force  
4. F5-02 repeaters under entity sections  
5. Shared eligibility parity across modes  
6. Authenticated QA  
7. F5-05+ Review → Processing → Confirm → Success → retirement  
