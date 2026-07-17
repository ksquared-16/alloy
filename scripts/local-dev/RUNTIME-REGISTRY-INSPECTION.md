# Runtime Registry & Inspection V1

> **Runtime Registry & Inspection V1 does not orchestrate runtimes.**
> It gives the toolkit authoritative, **read-only** knowledge of the backing
> Supabase/Docker runtimes that already exist. It observes and reports. It never
> starts, stops, restarts, removes, prunes, provisions, attaches, leases, or
> reclaims anything. Roadmap phases R0 (registry + discovery) and R1 (`alloy-ro`
> inspection) only.

## Architecture (one owner, one truth, many interfaces)

```
Docker/runtime discovery
        ↓
lib/runtime-core.sh   ← Shared Read Core runtime primitives (the single owner)
        ↓
Runtime Registry (<runtime-root>/runtimes/*.env, parsed — never sourced)
        ↓
alloy-ro runtime-*    ← read-only inspection interface
        ↓
future Director consumers
```

`lib/runtime-core.sh` is a member of the Shared Read Core family: it sources
`lib/read-core.sh` and reuses its safe parser and JSON helpers. There is no second
runtime-reading implementation.

## Registry schema

One record per runtime at `<runtime-root>/runtimes/<sanitized-namespace>.env`,
written **only** by `alloy-runtime-register` and **parsed, never sourced**.

| Field | Meaning |
|---|---|
| `ALLOY_RT_SCHEMA_VERSION` | metadata version (currently `1`) |
| `ALLOY_RT_RUNTIME_ID` | logical identity `rt:<owner>:<class>` |
| `ALLOY_RT_OWNER_MISSION_KEY` | persisted mission owner, or `unknown` |
| `ALLOY_RT_RUNTIME_CLASS` | `unknown` \| `shared-readonly` \| `shared-mutable` \| `dedicated-disposable` \| `dedicated-certified` |
| `ALLOY_RT_PROVIDER` | `supabase` |
| `ALLOY_RT_PROJECT_NAMESPACE` | Supabase project namespace (the reconciliation join key) |
| `ALLOY_RT_SOURCE` | `registered` |
| `ALLOY_RT_DISCOVERED_AT` / `REGISTERED_AT` / `LAST_SEEN_AT` | ISO-8601 timestamps |
| `ALLOY_RT_STATUS` | `registered` |
| `ALLOY_RT_EXPECTED_SERVICES` / `OBSERVED_SERVICES` | canonical vs snapshot-observed |
| `ALLOY_RT_ASSOCIATED_WORKTREES` / `ASSOCIATED_PORTS` | inferred worktrees; published host ports |
| `ALLOY_RT_HEALTH` | `healthy` \| `partial` \| `stopped` \| `unknown` (at snapshot) |
| `ALLOY_RT_CAPACITY_CONTAINERS` | container count at snapshot |
| `ALLOY_RT_OWNER_PROVENANCE` | `explicit-arg` or `undeclared` (never inferred) |
| `ALLOY_RT_ASSOCIATION_PROVENANCE` | `name-inference` or `none` |

### Three reconciliation categories
- **registered** — a registry record **and** observed backing containers.
- **discovered** — observed containers, **no** registry record.
- **orphaned** — registry record, **no** observed backing containers.

## Discovery rules

Read-only `docker ps -a` (field-restricted) groups containers into runtime stacks:
- **Namespace** precedence: `com.supabase.cli.project` label → `supabase_<svc>_<project>` name parse → `com.docker.compose.project` label (only when the container looks supabase-ish).
- Containers with no recognizable stack are **unrelated** — reported as a count, **never** promoted to runtimes of their own.
- **Service** per container: `com.docker.compose.service` label → name parse → image basename.
- Names are not hardcoded; grouping is general.

### Runtime status definitions
- `container_state`: `active` (running, none exited) · `partial` (running + exited) · `exited` (all exited) · `absent` (no containers).
- `health`: `healthy` (all core services `db kong auth rest` running) · `partial` (some running) · `stopped` (all exited) · `unknown` (Docker unavailable or no containers).
- Health and capacity are **independent** — a healthy runtime still counts against the budget.

## Inference & provenance rules

Association to a worktree/mission is **conservative** — *evidence, not truth*:
- A namespace is normalized (lowercase, strip `alloy-`/`wtN-`/`-vN`) and compared to managed worktree names.
- A match records `associated_worktrees` + `association=inferred` with provenance (`exact-`/`substring-normalized-name-match`).
- Inference **never** sets `owner_mission_key`. Owner is `unknown` until declared explicitly via `alloy-runtime-register --owner`.

## Capacity observation

`ALLOY_MAX_ACTIVE_RUNTIMES` (default **2**) joins the `ALLOY_MAX_*` family. In V1 it is **observational only** — nothing is blocked, stopped, or provisioned. `alloy-ro runtime-capacity` reports: configured max, observed active runtimes, remaining capacity, over-budget status, active container total, and aggregate memory/CPU when `docker stats` is available (degrades to `unknown` otherwise).

## alloy-ro verbs (read-only; safe under `Bash(alloy-ro *)`)

| Verb | Output |
|---|---|
| `runtime-list` | registered + discovered runtimes, reconciled |
| `runtime-status <id\|namespace>` | one runtime: services (expected/observed/missing), health, ports, association |
| `runtime-capacity` | configured vs observed + aggregate memory/CPU |
| `runtime-discover` | live Docker discovery (registry not consulted) |
| `runtime-containers <id\|namespace>` | redacted per-container list |

All support `--json`; exit codes `0` ok · `2` usage/unknown-flag · `3` not-found. Docker-unavailable degrades gracefully (`docker_available:false`, exit 0).

## Redaction guarantees (hard requirement)

Secrets are **physically unreachable** — the inspection path only ever runs
`docker ps`/`docker stats` with a **field-restricted format** and reads only:
container id, name, image, state, status string, published ports, the three
grouping labels, `MemUsage`, `CPUPerc`. It **never** runs `docker inspect`,
`top`, `logs`, `exec`, or reads `.Command`/`.Args`/`.Entrypoint`/`.Env`/arbitrary
labels. Therefore container commands, environment variables, Supabase service
keys, JWTs, certificates, private keys, authorization headers, and mount paths
are never read and cannot appear in output. Proven by test (static grep + a
docker-shim runtime guard confirming only `ps`/`stats` are ever invoked).

## Registration (the only mutation — outside alloy-ro)

`alloy-runtime-register <namespace> [--owner <key>] [--class <class>] [--force]`
writes one registry record from a read-only discovery snapshot. It never touches
containers, never infers ownership, and refuses to overwrite without `--force`.
`alloy-ro` itself writes nothing.

## Current limitations

- Association is name-inference only (evidence); no authoritative owner mapping yet.
- Registration is manual/explicit; there is no automatic reconciliation writer.
- Aggregate CPU/memory depend on `docker stats` availability.
- Supabase is the only recognized provider.
- Runtime identity for unregistered runtimes is provisional (`rt:unregistered:<namespace>`).

## Boundary: observation vs orchestration

This sprint is the **observe** phase of *observe → declare → actuate*. It does
**not** provision, shut down, attach, detach, lease, renew, reclaim, share, pool,
allocate from posture, integrate with sprint-start/finish, or actuate via
Director. Those are later phases (R2+). The control plane established here is
read-only and authoritative; the data plane remains untouched.
