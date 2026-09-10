# Work Items V3 — Phase 1 Platform Freeze

**Status:** FROZEN / SPECIFICATION ONLY (July 2026)  
**Sprint type:** Canonical doctrine + architecture contract — **no implementation**  
**Baseline:** `origin/staging` @ `db027659143e833ed4b4e9148ffb9a73bf87baae`  
**Predecessor:** [Work Items V3 Platform sprint](../work-items-v3-platform/README.md) (exploratory spec)  
**Sibling freeze:** [`docs/platform/operational-expansion-phase1-architecture-rfc.md`](../../../platform/operational-expansion-phase1-architecture-rfc.md) (Operational Expansion Wave 1)

---

## Ground truth verification

| Check | Result |
|-------|--------|
| Fetch `origin/staging` | ✅ `db0276591` (2026-07-10) |
| Latest staging commit | `docs(platform): freeze operational expansion wave 1 contracts` |
| Prior V3 baseline | `79eff4b52` — superseded by `db0276591` |
| Sprint worktree branch | `feat/work-items-doctrine-v2` |
| Merge-base with staging | `431676c9e385665a9cc3e5481febea5941b446e2` |
| Working tree | Clean except **untracked** freeze docs in this folder |
| Runtime changes | **None** — documentation only |

> **Note:** Implementation engineers should branch from **`origin/staging` @ `db0276591` or later**, not from this feature branch. This sprint produces contracts only.

---

## Objective

Freeze Work Items as a **canonical Alloy platform**. The deliverable is a **platform contract**. Everything implemented after this sprint must conform to these documents.

Work Items is **not** a task manager. Work Items is Alloy's **operational execution platform** — it answers: *What work must actually get done?*

---

## Hard constraints (frozen)

1. **Do not** invent another workflow engine, lifecycle engine, process engine, or task system.
2. **Business Process chain remains canonical:**

```
Business Process → Stage → Operating Plan → Generated Work → Current Work → Operator
```

3. Work Items **expands execution**; it does **not** replace Business Processes.
4. **One Work Item creation runtime** — all entry points share intent → draft → validation → approval → commit.
5. **BOS never silently creates work** — propose → operator approves → commit.
6. **No production code, schema, migrations, or API changes in this sprint.**

---

## Deliverables

| # | Document | Path |
|---|----------|------|
| 1 | Platform audit | [01-platform-audit.md](./01-platform-audit.md) |
| 2 | Canonical platform doctrine | [02-canonical-platform-doctrine.md](./02-canonical-platform-doctrine.md) |
| 3 | Architecture contract | [03-architecture-contract.md](./03-architecture-contract.md) |
| 4 | Domain model | [04-domain-model.md](./04-domain-model.md) |
| 5 | Queue doctrine | [05-queue-doctrine.md](./05-queue-doctrine.md) |
| 6 | Creation runtime contract | [06-creation-runtime-contract.md](./06-creation-runtime-contract.md) |
| 7 | BOS contract | [07-bos-contract.md](./07-bos-contract.md) |
| 8 | Current Work integration | [08-current-work-integration.md](./08-current-work-integration.md) |
| 9 | Business Process integration | [09-business-process-integration.md](./09-business-process-integration.md) |
| 10 | Information architecture | [10-information-architecture.md](./10-information-architecture.md) |
| 11 | UI compositions | [11-ui-compositions.md](./11-ui-compositions.md) |
| 12 | Implementation roadmap | [12-implementation-roadmap.md](./12-implementation-roadmap.md) |
| 13 | Open questions (product decisions) | [13-open-questions.md](./13-open-questions.md) |
| 14 | Frozen architectural decisions | [14-frozen-decisions.md](./14-frozen-decisions.md) |

---

## Module roles (frozen)

| Module | Question |
|--------|----------|
| **Processing** | What information entered the system? |
| **Communications** | What conversations are happening? |
| **Business Processes** | What lifecycle is this record in? |
| **Work Items** | What work must actually get done? |
| **Current Work** | What is this record's active stage work? |

---

## Implementation gate

Implementation may begin when:

- [ ] Product signs [13-open-questions.md](./13-open-questions.md) blockers
- [ ] [14-frozen-decisions.md](./14-frozen-decisions.md) accepted
- [ ] Proposed doctrine updates in [02-canonical-platform-doctrine.md](./02-canonical-platform-doctrine.md) promoted to `docs/platform/**` (separate PR)
