# Processing Identity Resolution — Migration & Rollout Strategy (V1, refined)

**Status:** **Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.**

**Design baseline:** `origin/staging` @ `65afc8527`. Decision I was executed in order: public-form comparison → Manual Create Lead first reviewed commit → public-form reviewed commit. The local migration chain was replayed from a fresh database and certified.

**Doctrine.** Additive-first (no destructive schema until parity proven); shadow before authority; **the first executor cutover is the lowest-risk source (Create Lead), not the highest-volume**; deterministic automation last. Direct writes are wrapped then retired — never cut cold. **No indefinite dual-write:** every dual-write window has a named exit gate.

---

## Explicit gates (must pass in order)

| Gate | Definition | Blocks |
|---|---|---|
| **G1 Normalization** | `lib/identity` is the single normalizer (**B1a**) and single candidate generator/classifier (**B1b**); intake call sites delegate; parity green | any uniqueness or resolver work |
| **G2 Security** | `persons.org_id` FK; `admin_ops_full_access` org-scoped; RLS tests green | any engine identity read/write |
| **G3 Durable facts/evidence** | `processing_facts` populated with lineage; immutable; corrections append | resolver persistence |
| **G4 Resolver persistence** | real `RecordResolver` writes `processing_resolutions` (proposals only) | shadow |
| **G5 Recommendation → plan** | plan builder produces versioned `processing_commit_plans` + `_plan_operations` (built, not executed) | approval/executor |
| **G6 Approval** | `processing_approvals` binds to version+hash; edit voids | reviewed commit |
| **G7 Command registration** | semantic record commands registered + idempotent + constraint-backed | reviewed commit |
| **G8 Shadow parity** | forms shadow: `would-create-duplicate == 0`; agreement ≥ target | reviewed commit |
| **G9 Reviewed commit (Create Lead)** | executor commits Create Lead via commands, no dup regression | forms commit |
| **G10 Legacy retirement** | per-source direct writer removed after its adapter is authoritative | phase exit |

---

## Implemented V1 sequence

| Phase | Implemented result | Authority / rollback boundary |
|---|---|---|
| A | Contracts, decisions, source inventory frozen | Documentation-only |
| B1a/B1b | Canonical normalization, candidate generation, confidence bands, signals, contradictions | Library revert only |
| B0 | Org-scoped identity RLS and `persons.org_id` FK | Restore prior policies only if staging apply is rolled back before traffic |
| B2/B3 | Durable immutable facts, resolution generations, real resolver seam | Additive tables may remain inert; do not drop after data exists |
| C1 | Public-form comparison harness | Historical audit tooling; not an authority path |
| D0 | Registered semantic identity commands | Server-only command registry |
| D1 | Immutable versioned Commit Plans and exact approval binding | Superseding plans invalidate approvals |
| D2 | Atomic identity RPC, attempts, exceptions, retry/compensation semantics | Stop executor entry points before schema rollback |
| D3 | Digital Mailroom review, correction, plan, approval, explicit commit | Remove UI/API exposure before runtime rollback |
| D4 | Manual Create Lead authoritative Processing adapter | No direct-write fallback or source flag |
| D5 | Public forms authoritative Processing adapter | No direct-write fallback or source flag |
| E1 | D4/D5 direct-write replay retired | Deployment/Git rollback only; data is preserved |

The V1 runtime has **no Processing Identity feature flag, source flag, org toggle, or environment toggle.** Certification-only environment variables are restricted to local test scripts and are not runtime requirements.

## Deferred Phase E — Additional source adapters (not V1)
- **Order:** document/packet → book-v2 quote-start (share ambiguity-aware matcher) → gutters + backend cleaning leads (**retire**) → vendor. Each future adapter requires its own reviewed rollout and must retire its legacy writer at phase exit; retire global `contacts` uniques only after person-first parity.
- **Authoritative:** engine per source as cut over. **Dual-write:** none (flag switches path). **Prohibited:** leaving both writers live past the exit gate (risk R-LEGACY-SURV). **Exit:** each source flag defaulted on; retired path unreachable (regression test).

## Deferred Phase F — Broader graph & merge
- **Scope:** multi-household split; import adapter (batch envelopes); comms-derived/portal; **merge execution** (privileged, Decision H) with `identity_merges` + alias redirect.
- **Authoritative:** engine. **Prohibited:** automatic merge in intake commit. **Flags:** `PROCESSING_MERGE_ENABLED`, `PROCESSING_IMPORT_ADAPTER`. **Exit:** merge in privileged use; import proven at scale.

## Deferred Phase G — Controlled policy automation
- **Scope:** `processing_policies` (versioned, org-scoped); enable narrow deterministic automation (trusted-identity preselect+auto-link on Confirmed; no-op auto-complete) only on measured accuracy. **Prohibited:** any policy overriding hard protections; auto-commit of create/link/merge/contact-change. **Flags:** per-policy, off by default. **Exit:** measured auto-accuracy ≥ threshold, false-match below bound.

---

## Promotion order
1. Reconcile onto latest staging.
2. Replay the complete migration chain on a fresh isolated database.
3. Re-run local certification and broad regression.
4. Apply to staging.
5. Validate D4/D5 intake creates zero identity writes before approval.
6. Validate explicit commit, retry, stale-plan, exception, and cross-tenant behavior.

## Cross-phase guarantees
- Additive until parity; no destructive schema before the replacing path is proven.
- Every source gains an idempotency key at/before cutover.
- One resolver, one normalizer — no phase reintroduces a source-specific matcher.
- Reversible commits (compensation); merge alias-reversible.
- No dual-write ambiguity: D4/D5 each have one authoritative path.
- No runtime feature flags or environment toggles are required for V1.
