# Runtime Intent & Admission Contract V1 (R2)

> **Admission is not provisioning.** This is the **DECLARE** phase of
> *observe → declare → actuate*. Given a sprint's manifest posture and the
> observed runtime capacity, it produces a deterministic control-plane
> **decision**: does the sprint need a runtime, of what isolation class, and may
> that request be admitted under current capacity? It records and reports that
> decision. **An admitted runtime may not yet exist.** R2 does **not** start,
> stop, attach, detach, lease, reclaim, pool, or mutate any runtime, and it does
> **not** touch Docker or Supabase. Realizing a decision is a later phase (R3+).

R0/R1 (Runtime Registry & Inspection V1) gave the toolkit authoritative,
read-only *observation* of the backing runtimes. R2 turns runtime **need** into a
deterministic decision derived from posture and observed capacity — no heuristics,
no hidden fallback, no silent downgrade. The same posture and the same observed
capacity always produce the same result.

## Architecture (one owner, one truth, many interfaces)

```
Sprint manifest posture (JSON; PARSED via lib/manifest-io.mjs, never sourced)
        ↓
lib/admission-core.sh   ← Shared Read Core member: isolation resolver + admission
        │                  evaluator (builds on read-core.sh + runtime-core.sh)
        ↓
Intent / admission contract
   ├── admission decision  (ephemeral; recomputed live)
   └── intent record       (<runtime-root>/intents/<worktree>.env; optional, immutable)
        ↓
alloy-ro runtime-{policy,admission,intent,explain}   ← read-only inspection
        ↓
future Director actuator (R3+)
```

`lib/admission-core.sh` is a member of the Shared Read Core family: it sources
`lib/read-core.sh` (safe parser, JSON helpers) and `lib/runtime-core.sh`
(capacity, registry, discovery). There is **no** second implementation of posture,
capacity, or compatibility interpretation. Policy lives in exactly one place; the
read-only surface and the mutating writer are both interfaces over it.

## Posture (authoritative inputs)

Posture is read from the **canonical sprint manifest** (`lib/manifest-io.mjs`), the
same schema `alloy-sprint-start` writes. R2 introduces **no** parallel posture
vocabulary.

| Field | Values |
|---|---|
| `posture.mutation` | `read-only` \| `shared-read-only` \| `isolated-mutable` |
| `posture.tenant_class` | `none` \| `shared` \| `disposable` \| `production-like` |

Absent, undeclared, malformed, or unreadable posture is a **value**, surfaced as
such (`manifest-absent` / `manifest-malformed` / `manifest-declared` /
`node-unavailable`) and treated as fail-closed input — never guessed.

## Canonical isolation resolver (one owner)

The single resolver maps posture to an isolation class. **Any** combination not
listed fails closed to `invalid` — never guessed, never coerced, never downgraded
to a cheaper class.

| mutation | tenant_class | isolation_class | notes |
|---|---|---|---|
| `read-only` | `none` | `none` | consumes zero runtime capacity |
| `read-only` | `shared` | `shared-readonly` | |
| `shared-read-only` | `shared` | `shared-readonly` | |
| `isolated-mutable` | `disposable` | `dedicated-disposable` | |
| `isolated-mutable` | `production-like` | `dedicated-certified` | |
| `shared-read-only` | `production-like` | `dedicated-certified` | |
| `isolated-mutable` | `shared` | `shared-mutable` | **discouraged; coordination required** |
| *anything else* | | `invalid` | **fail closed** → `refused-invalid-posture` |

The `isolated-mutable + shared → shared-mutable` mapping matches the manifest's own
`declarationGaps` treatment of that pair as discouraged (a warning, not a hard
schema error): the combination resolves, but admission demands an explicit
coordination declaration (below).

## Admission algorithm (deterministic)

Admission evaluates: the resolved isolation class, the observed active-runtime
count, the configured `ALLOY_MAX_ACTIVE_RUNTIMES`, whether an appropriate shared
runtime is already discoverable, whether the request would consume additional
capacity, whether certification prohibits sharing, whether coordination was
declared, and whether the posture is valid.

```
if posture invalid            → refused-invalid-posture
isolation = resolve(posture)
case isolation:
  none                        → admitted-none                     (capacity 0)
  shared-readonly:
    compatible shared exists  → admitted-shared-existing          (capacity 0)
    else capacity ≥ 1         → admitted-shared-new               (capacity 1)
    else                      → refused-capacity
  shared-mutable:
    coordination != declared  → refused-coordination-required
    compatible shared exists  → admitted-shared-existing          (capacity 0)
    else                      → refused-no-compatible-shared-runtime
  dedicated-disposable:
    capacity ≥ 1              → admitted-dedicated                (capacity 1)
    else                      → refused-capacity
  dedicated-certified:
    coordination == declared  → refused-certification-requires-dedicated
    capacity ≥ 1              → admitted-dedicated                (capacity 1)
    else                      → refused-capacity
```

### Capacity semantics

1. `none` consumes **zero** runtime capacity.
2. Attaching to an existing compatible shared runtime consumes **zero additional**
   capacity.
3. Creating a **new** shared runtime consumes **one** runtime unit.
4. Creating a **dedicated** runtime consumes **one** runtime unit.
5. Capacity is **fail-closed**: `remaining = max(0, configured_max − active)`;
   it never goes negative.
6. An **over-budget** current state (`active > max`) authorizes **no** additional
   allocation. A zero-runtime (`none`) posture is still admitted while over budget.
7. Admission is **not** provisioning.
8. Admission **reserves no capacity** in V1. An optional immutable *intent record*
   (below) captures a declaration and an audit snapshot, but reserves nothing;
   `runtime-admission` is always recomputed live against current capacity.

### Shared-runtime compatibility (conservative / fail-closed)

A runtime is compatible shared capacity for a requested class **only** when it is a
**registered** record whose declared class **matches**, whose owner is **explicitly
known** (`ALLOY_RT_OWNER_MISSION_KEY != unknown` and
`ALLOY_RT_OWNER_PROVENANCE == explicit-arg`), and whose containers are **observably
active**. Consequences:

9. A shared runtime can **never** satisfy `dedicated-certified` (certified work is
   never admitted to a shared runtime).
10. `shared-mutable` is **never** admitted without an explicit coordination
    declaration, and V1 will **not** unilaterally create a new shared-mutable
    runtime — coordination attaches to an already-agreed one.
11. **Unknown** runtime ownership or **unknown** runtime class is **not** treated as
    compatible capacity. A discovered-but-unregistered runtime therefore never
    counts as an attachable shared runtime.
12. There is **no fallback** from a dedicated class to a shared runtime.

## Decisions and reason codes

Decisions (designed for future Director consumption):

`admitted-none` · `admitted-shared-existing` · `admitted-shared-new` ·
`admitted-dedicated` · `refused-invalid-posture` · `refused-capacity` ·
`refused-no-compatible-shared-runtime` · `refused-certification-requires-dedicated`
· `refused-coordination-required`

Stable reason-code slugs (finer-grained than the decision):

`posture-requires-no-runtime` · `compatible-shared-runtime-available` ·
`new-shared-runtime-within-capacity` · `dedicated-runtime-within-capacity` ·
`capacity-exhausted` · `coordination-required` · `no-compatible-shared-runtime` ·
`certification-forbids-shared` · `invalid-posture-combination` ·
`posture-undeclared` · `posture-malformed`

### Allowed next actions (declarative — R2 executes none)

Every decision carries `allowed_next_actions`: declarative tokens for a future
Director (e.g. `provision-dedicated-runtime`, `use-existing-shared-runtime`,
`declare-coordination`, `await-capacity`, `correct-manifest-posture`). R2 **does
not** execute them and does not touch Docker or Supabase.

## The admission record

`alloy-ro runtime-admission <worktree> --json` emits the full, deterministic
record. Minimum fields: `schema_version`, `mission_key`, `posture`,
`isolation_class`, `runtime_required`, `shared_candidate_required`,
`capacity_required`, `current_active_runtimes`, `configured_max_runtimes`,
`remaining_capacity`, `over_budget`, `decision`, `reason_code`, `human_reason`,
`allowed_next_actions`, `evaluated_at`, and `input_provenance` (posture source,
manifest path, coordination source, capacity source, registry directories).

`evaluated_at` is provenance, not part of the decision; the decision and reason
code are a pure function of posture + observed capacity. (`ALLOY_AD_EVAL_NOW` pins
the stamp for byte-reproducible output.)

## Intent record (persistence — conservative)

**Admission is ephemeral by default** — recomputed live, so it never goes stale and
never reserves capacity. Persistence is opt-in: `alloy-runtime-intent` writes one
**immutable** intent record per worktree at `<runtime-root>/intents/<worktree>.env`
(a kv `.env`, parsed by the Shared Read Core safe parser — **never sourced**, like
the runtime registry). It records the declaration (identity, posture, isolation,
coordination), the decision **at declaration time** (audit), and provenance
(manifest path, base SHA, declared_by, timestamp). It **reserves no capacity** and
touches **no** runtime.

Lifecycle & invalidation:

- **Immutable / no silent overwrite.** Recording over an existing intent is refused
  unless `--supersede`, which archives the prior record under
  `intents/superseded/` with provenance and increments `supersedes_count`.
- **Staleness.** `runtime-intent` recomputes current posture and flags `stale=true`
  when the manifest posture (or the class it now resolves to) has drifted from the
  recorded declaration. Detection only — no auto-mutation.

## Identity safety (the mutating writer)

`alloy-runtime-intent` is the **only** mutating command in R2 and lives **outside**
`alloy-ro`. Given the prior slot-targeting incident, it **fails closed unless all
expected identities match**:

- The target must be a **worktree name** — a bare **slot number is refused
  outright** (a slot is never sufficient authority).
- `--mission <key>` is **required** and must equal the mission key **derived from
  the manifest**.
- Worktree **metadata** must exist and its name must match; the **manifest**
  identity (`worktree_name`, `slot`) must match the metadata.
- `--expect-branch` / `--expect-path`, when given, must match; live branch drift
  vs. recorded metadata is refused.
- An `invalid`/undeclared posture cannot be declared.

It writes exactly one file (the intent record; plus an archive on `--supersede`),
never touches Docker or Supabase, and never invokes a sprint lifecycle command.

## Read-only inspection (`alloy-ro`)

All verbs are read-only and safe under `Bash(alloy-ro *)`; all support `--json`.

| Verb | Output |
|---|---|
| `runtime-policy` | Canonical posture→isolation mapping, decisions, reason codes, capacity/certification/coordination rules, configured max (static). |
| `runtime-admission <target>` | Live, ephemeral admission decision for a worktree. Declares; never provisions. |
| `runtime-intent <target>` | The recorded intent (or none), with staleness vs. current posture. A declaration, not a runtime. |
| `runtime-explain <target>` | Three explicitly separated views: **(1)** posture resolution, **(2)** admission decision, **(3)** actual observed runtime state. |

`runtime-explain` keeps observation, declaration, and actuation distinct: it never
implies an admitted runtime exists, and never implies provisioning occurred.

## Boundary: observation vs declaration vs actuation

- **Observe (R0/R1):** the toolkit reads runtimes, capacity, and health.
- **Declare (R2 — this):** posture + observed capacity → a deterministic admission
  decision, optionally recorded as an immutable intent. **Reserves nothing.**
- **Actuate (R3+):** realizing a decision — provisioning, attaching, leasing,
  reclaiming, Director actuation. **Not in R2.**

## Current limitations

- Admission does not reserve capacity; between evaluation and any future actuation,
  observed capacity can change. This is intentional — the decision is always live.
- Shared compatibility requires an **explicitly registered** runtime (class + owner
  declared via `alloy-runtime-register`); inferred association is never treated as
  ownership.
- V1 will not create a new shared-mutable runtime; coordination attaches to an
  existing one.
- Posture reading depends on `node` (the canonical manifest reader); when `node` is
  unavailable, posture reads as `node-unavailable` and admission fails closed.
- Supabase is the only backing provider recognized by the observe layer.

## Verification

- `tests/test-runtime-admission.sh` — every decision and reason code; invalid and
  malformed posture; unknown class/owner not treated as compatible; over-budget and
  zero-runtime-over-budget; deterministic JSON; stable reason codes; provenance;
  proof (docker/supabase/lifecycle shims) that evaluation and intent recording
  invoke **no** `docker start/stop/rm/prune/...`, **no** Supabase, and **no** sprint
  lifecycle command; `alloy-ro` writes nothing; writer identity safety
  (slot-only/mission/branch/manifest mismatches all fail closed); redaction; and
  Shared Read Core parity.
- `tests/test-read-core-parity.sh` — the verb set is single-sourced across
  `read-core.sh`, `ro-capabilities.json`, and the `alloy-ro` dispatcher.
- `tests/test-alloy-ro.sh` — the inspection constitution (all mutation-sensitive
  capabilities false, `--json` valid for every no-arg verb).
- `tests/run-phase4-tests.sh` — full toolkit certification.
