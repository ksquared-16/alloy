# Alloy Shared Read Core

`lib/read-core.sh` is the **single implementation of read interpretation** for
the whole toolkit. Both runtimes are interfaces over it:

- **Mutation runtime** — `lib/common.sh` and the commands that source it. Its
  read helpers delegate to the core; its side effects (config sourcing, `mkdir`,
  git mutation, process control) are layered *above* the core.
- **Inspection runtime** — `alloy-ro`, via the thin adapters `lib/ro.sh` and
  `lib/ro-config.sh`.

There is **one runtime state** (the single `~/.local/state/alloy-dev` tree,
written only by the mutation commands). The core only reads and interprets it, so
no second runtime is introduced. One implementation, many interfaces.

## Constitution (platform invariant)

`read-core.sh` is pure, deterministic, and read-only. It never sources config or
metadata as shell, writes files, creates directories, fetches, installs, signals
processes, mutates git, or executes arbitrary/user-controlled strings. A git
wrapper (`alloy_rc_git`) asserts a read-only subcommand allowlist, so "the core
cannot mutate git" is structural.

## Primitive ownership map

| Primitive | Function(s) | Consumed by |
|---|---|---|
| Config defaults (single constants) | `ALLOY_RC_DEFAULT_*`, `alloy_rc_default_runtime_root` | `common.sh` (`alloy_load_config`), inspection |
| Non-executing config parse | `alloy_rc_kv_raw` / `_is_safe_value` / `_expand_value` / `_config_get` / `_config_init` | inspection (mutation runtime keeps its own sourcing layer above) |
| Runtime path derivation | `alloy_rc_config_init` (path names) | both |
| Metadata schema (single list) | `ALLOY_RC_METADATA_REQUIRED_FIELDS` / `_OPTIONAL_FIELDS` | `common.sh` (`ALLOY_OPTIONAL_METADATA_FIELDS`), inspection |
| Metadata parse / list / slot-resolve | `alloy_rc_meta_get`, `alloy_rc_list_metadata`, `alloy_rc_resolve_slot` | `common.sh` (`alloy_list_metadata_names`, `alloy_find_metadata_by_slot`), inspection |
| Git read (dirty rule, ahead/behind, branch, toplevel) | `alloy_rc_dirty_porcelain`, `alloy_rc_dirty_classification`, `alloy_rc_ahead_behind`, `alloy_rc_git_branch`, `alloy_rc_git_toplevel` | `common.sh` (`alloy_worktree_dirty_*`), inspection |
| Process / port inspection | `alloy_rc_port_pid`, `alloy_rc_pid_alive` | `common.sh` (`alloy_port_listener_pid`), inspection |
| Formatting (bytes / human size) | `alloy_rc_file_bytes`, `alloy_rc_human_bytes` | `common.sh` (`alloy_file_byte_size`, `alloy_human_bytes`), inspection |
| Root classification | `alloy_rc_classify_root` | `alloy-root`, `alloy-ro` |
| JSON emission | `alloy_rc_json_escape` / `_kv` / `_kv_raw` | inspection |
| Capability / verb set | `ALLOY_RC_RO_VERBS`, `ALLOY_RC_CAPABILITY_KEYS` | `ro-capabilities.json`, `alloy-ro` dispatcher (parity-tested) |

## Dependency graph

```
                 lib/read-core.sh   (pure read primitives; the one owner)
                   ▲            ▲
     sources │            │ sources
   lib/common.sh          lib/ro.sh + lib/ro-config.sh
   (mutation runtime:     (inspection adapters)
    delegates reads,          ▲
    layers mutation)          │ sources
        ▲                  alloy-ro   (dispatcher)
        │ sources
   every alloy-* command      alloy-root  ── calls alloy_rc_classify_root ──┐
   (worktree/sprint/agent/…)                                                │
        └───────────────── alloy_rc_classify_root ◄─────────────────────────┘
```

## Formatting note (intentional, per-interface)

`mtime` is presented differently by design — the mutation runtime formats a human
table string (`alloy_file_mtime_human`, `YYYY-MM-DD HH:MM`); the inspection
runtime emits ISO-8601 for JSON (`alloy_rc_file_mtime`). Both read the same
`stat`; only presentation differs. This is a formatting choice, not divergent
interpretation, so it is not forced into one shape.

## Remaining, documented duplication (future sprint)

The deeper mutation runtime contains *distinct, related* rules that were left
untouched this sprint (they are broader ignore-sets, not copies of the basic
rule): `alloy_sprint_dirty_classification` (`lib/sprint-ops.sh`, ignores sprint
marker files + node_modules) and the dirty count in `lib/agent.sh`. Direct
`*.env` iterations in `lib/sprint-ops.sh` and `alloy-cert-leak-report` could
later adopt `alloy_rc_list_metadata`. These are candidates to rebuild on the core
primitives in a follow-up; they are not the review-identified alloy-ro ↔ common
duplication (which this sprint eliminated).

## Verification

- `tests/test-read-core-parity.sh` — asserts the unified boundary re-implements
  nothing (drift guards), the metadata schema / default constants / verb set are
  single-sourced, and dirty classification is identical across runtimes.
- `tests/test-alloy-ro.sh` — the inspection constitution suite, unchanged (48
  checks), now running through the core.
- `tests/run-phase4-tests.sh` — full toolkit certification (phase 1–3 regression
  + engineering-certify) proves the mutation runtime behaves identically.
