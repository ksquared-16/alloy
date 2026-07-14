---
owner: platform
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Operational Expectations — P1 · Wave C: Authority → Standing & Ratification (implementation checkpoint)

**Status:** Canonical implementation record for **P1 Wave C**, 2026-07-14. Introduces **no
architecture, no ontology, no new package, no new gate**.

```
P1 Wave C: BLOCKED ON CONTRACT
G-Standing authoring half: NOT GREEN
P1 overall: IN PROGRESS / UNCERTIFIED
```

> **Authority.** P1 scope, gates, and completion criteria are authoritative in the
> [Engineering Realization §13 · X0](./operational-expectations-engineering-realization.md); the frozen
> Standing/Authority/Ratification doctrine is [System Design §5 · §12](../core/operational-expectations-system-design.md).
> Waves are implementation sequencing only; **P1 certifies once, after all waves complete.** See the
> [Wave A](./operational-expectations-p1-wave-a-ledger-substrate.md) and
> [Wave B](./operational-expectations-p1-wave-b-authoring-intake.md) records.

---

## 1. What Wave C is

Wave C realizes the P1 **standing half** (X0): Authority → Standing resolution and ratification. It is
delivered in slices: **C1** the pure Authority→Standing resolver; **C2** the immutable ratification path;
**C3** security negative proofs + certification (this record).

## 2. C1 — Authority → Standing resolver (pure)

`resolveAuthorityToStanding(input)` (`web/lib/operationalExpectations/standing/`) — a PURE function that
computes effective Standing from author class + modality + the actor's held authority (System Design §5
author-class table + §12): `predicted → model`; AI → `proposed` (never binding, never self-ratifies);
`human` → `binding` only when holding the claimed authority (self-ratifying within authority), else
`proposed`; `policy`/`process` → `binding` only via the definition's configured-authority ratification;
`external` → `binding` only high-trust + holding the authority; a deontic `proposed` carries
`requiresRatification`. It writes nothing and is not wired into the intake — **C1 makes nothing binding.**

## 3. C2 — Immutable ratification path

- **Dedicated capability `operational_expectations.ratify`** (RBAC-seeded, admin-default) — **distinct**
  from `operational_expectations.author`. Authoring permission does not grant ratification; `workflows.write`
  does not; service-role possession is DB infrastructure, never authority.
- **Append-only `operational_expectation_ratifications`** — immutable (prevent-mutation trigger), lineage-
  linked, server-assigned `ratified_at`, org-scoped RLS, **no client INSERT**; one ratification per
  `(org_id, expectation_id)`; `new_standing` CHECK = `binding`. The authored expectation row is **never
  mutated** (append-only).
- **Atomic `ratify_operational_expectation` RPC** (`SECURITY DEFINER`, `search_path`, service-role only):
  ratification record + `mutation_events` **Ratification Act** in one transaction; insert-with-conflict-
  catch → idempotent re-ratify (no second act). No duplicate `workflow_events` authority.
- **Ratification is NOT a sixth verb** — the five-verb set stays closed; ratification is a distinct,
  related append-only act.

## 4. Effective-standing derivation (`resolveEffectiveStanding`)

Because the ledger is append-only, **binding is never a mutated column** — it is derived:

| Authored state | Ratification | Effective standing |
|---|---|---|
| `proposed` | absent | `proposed` |
| `proposed` | valid ratification act | `binding` |
| `model` (predicted) | absent | `model` |
| `model` | any (rejected upstream) | `model` — **never binding** |
| `binding` (authored) | — | `binding` **only if author-time binding is canonically supported** (see §7 — currently NOT wired, so no such row can arise) |
| unknown | any | fail-closed |

## 5. Ratifiable modality matrix

"Deontic/commissive" in this codebase maps **exactly** to the four non-predicted frozen modality keys.
Enforced identically in TS (`ratifyOperationalExpectation`) and the DB trigger:

| Modality | Ratifiable to binding? | Why |
|---|---|---|
| `required` | **Yes** | deontic — binds only when ratified (§12) |
| `prohibited` | **Yes** | deontic — binds only when ratified |
| `intended` | **Yes** | obligation-bearing recommendation (§5) — binds only when ratified |
| `committed` | **Yes** | commissive — binds only when ratified |
| `predicted` | **No — never** | imposes no obligation; stands at `model` (§12) |

## 6. Permission separation, AI prohibition, tenancy, audit

`.ratify` ≠ `.author` ≠ `workflows.write` (tested). The RPC is service-role only; `anon`/`authenticated`
cannot invoke it directly; service-role alone does not pass **application** authorization (enforced in TS
before the RPC). **AI cannot self-ratify** — the ratify path requires the human-granted `.ratify`
capability from a human session; AI never holds it and cannot pass as a human actor (no actor identity is
a caller input). Cross-org ratification is rejected (service + DB trigger). Each accepted ratification
emits exactly one authoritative Ratification Act carrying actor · authority · expectation · prior→new
standing · server-assigned time; failed/invalid ratifications emit none; retry emits no duplicate.

## 7. Architecture-governance escalation — held-authority mapping (BLOCKER)

**Missing contract.** The frozen doctrine requires **authority-holding gating** and **authority
sufficiency**:
- §12: *"an author may assert only expectations whose Authority they hold (a room lead cannot author a
  licensing requirement)"*; *"Revision/correction authority ≥ original author's authority."*
- §5: *"Human — Binding if the operator holds the Authority; self-ratifying within authority."*

**Affected frozen requirement.** Author-time self-ratification (§5) and ratifier authority sufficiency
(§12) both require resolving *"does the actor hold `authority_key` X"* and *"is authority A ≥ B"*.

**Why C1/C2 cannot resolve it safely.** No canonical held-authority representation exists in the
substrate: `operational_expectations.authority_key` is free text with **no FK** to any catalog (a claim);
there is **no** authority catalog, **no** actor→authority mapping, and **no** authority hierarchy; the
trusted access context carries `roleKeys` + `permissionKeys` (command capabilities), **not** domain
authorities over `authority_key` values. Implementing sufficiency would require **inventing** an authority
registry / role-mapping / hierarchy — which the corpus does not define and this wave must not fabricate.

**Current C2 behavior.** Ratification enforces the `.ratify` **capability** + org + proposed + deontic; it
does **not** compare the ratifier's held authority against the expectation's `authority_key`. So a
`.ratify` holder can currently ratify an expectation of any `authority_key`.

**Classification (Phase 2 & Phase 5):** **C — the corpus requires it, but no canonical held-authority
mapping exists.**

**Minimum decision required (governance):** define the canonical held-authority model — one of:
(a) `authority_key` maps to RBAC permission keys / role grants; (b) a governed authority catalog +
actor→authority assignments; (c) authority derives from Policy/Process definition identity (§5). No
recommendation is made here; each is a design decision, not an implementation choice.

**Effect on certification.** Until this lands, **self-ratification-at-intake is intentionally NOT wired**
(binding is produced only by an explicit ratification act), and **ratifier authority sufficiency is NOT
enforced** (capability-only). Therefore **G-Standing authoring half is NOT GREEN.**

## 8. G-Standing (authoring half) — verdict

Question: *Can any authored expectation become effectively binding without canonical Authority resolution
or an authorized immutable ratification?* **No** — binding requires an authorized immutable ratification
act. Also proven: AI cannot self-ratify; authoring ≠ ratification authority; service-role is not
Authority; effective standing is deterministic + auditable; ratification preserves append-only history;
predicted stays `model`; no consumer evaluates yet; no downstream behavior has begun.

**But** the frozen §12 authority-holding / §5 self-ratification-within-authority requirements are **not**
enforced (no canonical held-authority mapping — §7). Per the certification rule, that unresolved required
contract makes the gate:

```
G-Standing authoring half: NOT GREEN
```

## 9. Static vs live evidence

DB behavior (append-only, service-role-only RPC, atomic record + Ratification Act, one-per-expectation,
same-org+proposed+deontic guard, server-assigned time) is **statically proven** (migration scan) — **no
live Postgres in CI**; orchestration is proven through the fake gateway. **No live-database concurrency or
RLS certification is claimed.**

## 10. What Wave C does not do

No evaluation/Judgment/Gap (P3); no recurrence/replay/fan-out (P4); no effectors/consumers (P5–P7); no AI
(P8); no Wave D revision/correction propagation; no self-ratification-at-intake and no authority
sufficiency (blocked — §7). No P1 gate is certified.

## Cross-references
- [Engineering Realization §13 · X0](./operational-expectations-engineering-realization.md)
- [System Design §5 · §12](../core/operational-expectations-system-design.md)
- [P1 Wave A](./operational-expectations-p1-wave-a-ledger-substrate.md) · [P1 Wave B](./operational-expectations-p1-wave-b-authoring-intake.md)
