# Commands P6.S1 — Business Process Command Set Authority

Mission: `msn_188e8bea6fb6de28dd21`  
Worktree: Slot 1 Commands (`agent/cursor/1-commands-system-inventory`)  
Date: 2026-07-27

---

## Outcome

Typed `command_set_v1` is the **sole target** Business Process authority for process-wide Command selection.

```text
Organization Command Catalog (existing action_definitions / availability)
→ Business Process command_set_v1
→ Stage action_catalog_v1 (recommendation / evaluation only)
→ Effective Commands (read-only resolver)
→ Command Runtime (invocation; unchanged)
```

No Automation product. No `/configuration/commands`. No Surface redesign. No schema migration.

---

## Authority inventory (P6 target roles)

| Current source | Current role | P6 target role | Migration phase |
| -------------- | ------------ | -------------- | --------------- |
| Stage `action_catalog_v1.candidate_actions` | Current authority (peer in editor merge) | Stage recommendation/evaluation | P6.S2–S3 |
| Lifecycle-builder `action_placements` | Current authority (peer merge) | Compatibility → availability | P6.S2–S3 |
| `LIFECYCLE_BASE_ACTIONS` | Editor seed / activation list | Compatibility seed only (not selection authority) | P6.S2–S4 |
| Work Template primary/helpful refs | Derived projection | Stay presentation; must ∈ command_set later | P6.S3+ |
| `resolveCanonicalWorkTemplateActionOptions` merge | Current effective editor set | Switch to command_set (P6.S3) | P6.S3 |
| Capability Registry | Honesty filter | Gate existence/maturity | Soft dep (done) |
| `action_definitions` / placements | Org catalog + chrome availability | Org catalog / availability (P7 product later) | P7 |
| `ENROLLMENT_STAGE_ACTION_KEYS` | Legacy MVP map | Collapse | P10 |
| Doctrine process `candidate_actions` | Placeholder | Realized as `command_set_v1` | P6.S1 |

**Conflicting authorities today:** stage catalog ∪ builder placements treated as equal peers in `collectCandidateActionKeys`. P6.S1 does not silently union them with V1 — V1 wins when present; otherwise one deterministic legacy migrate produces a single compatibility set.

---

## Contract

**Files:**

- `web/lib/lifecycle/processCommandSetV1.ts`
- Host field: `LifecycleBuilderProcessRecord.command_set_v1` in `lifecycleBuilderConfig.ts`

Shape (snake_case JSON; camelCase accepted on parse):

```ts
{
  version: 1,
  commands: Array<{
    capability_key: string;
    enabled: boolean;
    variant_key?: string;
    availability?: { contexts?: string[] };
    process_policy?: { required?: boolean; recommended?: boolean };
  }>;
}
```

Rejected on entries (diagnosed, not stored as authority): executor, mutation payload, automation, permissions.

---

## Compatibility precedence

```text
1. command_set_v1 when present (including empty → no selected Commands)
2. legacy_compatibility via migrateLegacyProcessCommands
   - stage action_catalog_v1 candidates (all stages)
   - then lifecycle-builder configured placement keys (when provided)
3. never a silent V1 ∪ legacy union
```

**File:** `resolveBusinessProcessCommandSelection.ts` + `migrateLegacyProcessCommands.ts`

---

## Effective resolver

**File:** `resolveEffectiveBusinessProcessCommands.ts`

Returns process-selected Commands with:

- canonical Capability identity (aliases resolved)
- stage recommended / required flags (required not invented from recommendation)
- capability honesty status
- organization availability status (optional lookup; unchecked when omitted)
- invocation readiness (`runnable` still carries `authorization_deferred_to_invocation`)
- stage orphans (catalog refs not process-selected) as configuration errors

Read-only. No execution.

---

## Boundaries

| Boundary | Behavior |
|----------|----------|
| Stage | Recommend/evaluate only; cannot create selection; cannot re-enable disabled process Command |
| Org catalog | Optional `OrganizationCommandCatalogLookup` over existing definitions — no P7 UI |
| Variants | Optional `variant_key`; missing variant diagnosed; executor unchanged |
| Automation | Documented dependency only — not implemented |
| Authorization | Always deferred to invocation |

---

## Proof process

**Enrollment Lead** (bounded fixture):

- `enrollmentLeadProcessCommandAuthority.ts`
- Keys: `quick_message`, `schedule_tour`, `send_form`, `close_lead` (+ tour stage keys when migrating whole process)
- Derived `command_set_v1` ≡ legacy migrate for same process
- Operator chrome / `resolveCanonicalWorkTemplateActionOptions` **unchanged** (authority switch = P6.S3)

---

## Staging reconciliation

Incoming (merged): focus-panel card visibility / Household circular import (`9c92ce240` family). **No** BP/Command Runtime overlap. Merge commit on branch before P6.S1 edits.

Pre-edit Commands suite: mostly green; known unrelated fail: `resolveCanonicalWorkTemplateActionOptions` waitlist alternate-path grouping (pre-existing on Commands branch; not touched in P6.S1).

---

## Tests

`web/tests/lifecycle/processCommandSetAuthority.test.ts` — **20 passed**.

Regression:

- Focused P6 + lifecycle + P0/P5 Commands: **8 files / 115 passed**
- Full `tests/platform/commands/`: **20 files / 219 passed**

Known unrelated pre-existing: `resolveCanonicalWorkTemplateActionOptions` waitlist alternate-path test (not in P6.S1 scope).

Production `npm run typecheck`: **pass**. `typecheck:tests`: deferred (machine pressure).

---

## Remaining P6

| Slice | Focus |
|-------|-------|
| P6.S2 | Derive `command_set_v1` for live processes from union |
| P6.S3 | Switch `resolveCanonicalWorkTemplateActionOptions` to command_set authority; orphan rejection |
| P6.S4 | Process editor UX bound to Org Catalog ∩ Capability ∩ command_set |

---

## Confirmations

- No schema / migration
- No API rename
- No Command execution change
- No Automation product
- No Surface redesign
- No operator behavior change (proof is additive)
- No push
