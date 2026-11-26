# Alloy Autonomous Inspection Surface V1 (`alloy-ro`)

A single, genuinely read-only entrypoint for autonomous agents, designed so that
one operator permission —

```
Bash(alloy-ro *)
```

— can be granted **without** authorizing any mutation.

## Why this exists

The toolkit's ~63 `alloy-*` commands are opaque custom executables that share one
namespace. Safe inspection (`alloy-worker-status`) and dangerous mutation
(`alloy-worktree-remove`) look identical to a permission engine, so a broad
`Bash(alloy-* *)` grant would be unsafe, and every inspection call otherwise
prompts. `alloy-ro` carves the safe reads into their own namespace and their own
trust class, so the safe surface can be allow-listed once while every mutating
command keeps prompting exactly as before.

This is **not** a cosmetic wrapper. `alloy-ro` does not forward to the existing
inspection commands (which source executable config, create runtime directories,
and expose mutation flags). It re-implements the reads against a non-executing
config parser and a read-only subprocess allowlist.

## The constitution (what `alloy-ro` will never do)

Every verb is one trust class. An `alloy-ro` invocation never:

- writes or modifies repository files or toolkit runtime state;
- creates directories;
- modifies git refs, branches, worktrees, index, or working tree;
- fetches from the network or installs packages;
- launches, stops, signals, or recovers processes;
- opens applications or browsers;
- loads credentials into a process;
- deletes files;
- invokes arbitrary commands;
- executes user-controlled configuration as shell code;
- exposes a flag or subcommand that converts the operation into a mutation.

Unknown verbs and unsupported flags **fail closed** (exit 2).

## Verbs (V1)

| Verb | Args | What it reports |
|------|------|-----------------|
| `root` | `[path]` | Classifies a directory: `canonical` \| `managed-worktree` \| `retired` \| `unmanaged` \| `outside`, and whether it is sanctioned. |
| `runtime-paths` | – | Resolved runtime path **names** (never secrets). Creates no directories. |
| `worker-status` | – | The canonical six-slot managed-sprint status table. Never fetches. |
| `agent-status` | `[slot\|name]` | Managed agent/slot detail — all slots, or one target. |
| `dev-status` | `[slot\|name]` | Dev-server / tracked-port listener status. |
| `agent-evidence` | `<slot\|name>` | Lists evidence artifact names/sizes/mtimes (never contents). |
| `capabilities` | – | Emits the machine-readable capability declaration. |

Global options: `--json` (on every verb), `-h`/`--help`, `--version`.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | success |
| `2` | usage error — unknown verb or unsupported flag (fail closed) |
| `3` | not found — requested slot/worktree/target does not exist |

## Configuration safety

`alloy-ro` **parses** configuration; it never `source`s it. Files read:

- `<toolkit>/alloy-config.example` (repo-trusted)
- `${ALLOY_CONFIG_FILE:-$HOME/.config/alloy-dev/config}` (user-writable)
- `<runtime>/metadata/*.env` (toolkit-written)

Only an allowlist of keys is read (see `lib/ro-capabilities.json` →
`config_access`). Any value containing command substitution `$(...)`, backticks,
`;`, `|`, `&`, `<`, `>`, backslash, a newline, or an unresolved `$` is **refused**
and the caller falls back to a safe default. A hostile value such as
`ALLOY_REPO="$(rm -rf ~)"` is therefore inert — it is never executed.

Secret values, credentials, and `.env` value contents are never read.

## Read-only subprocess allowlist

`alloy-ro` shells out only to read-only inspection:

- **git** (via `alloy_ro_git`, which asserts the subcommand): `rev-parse`,
  `status --porcelain`, `rev-list --count`, `remote get-url`, `config --get`,
  `symbolic-ref`, `show-ref`, `for-each-ref`, `cat-file`, `describe`. Any other
  git subcommand aborts — this makes "cannot mutate git" structural, not merely
  intended. Optional locks and terminal prompts are disabled so a read can never
  fetch, lock, or block.
- **other**: `lsof`/`ps` (inspection), `stat`, `find` (listing), `awk`,
  `basename`, `cut`, `sort`, `seq`, and `kill -0` (existence check only —
  delivers no signal).

## Missing state reads as "no state"

If the runtime directory or a metadata file is absent, read verbs report empty /
not-found. They never create a directory or initialize state to answer a query.

## Verification

`bash scripts/local-dev/tests/test-alloy-ro.sh` proves, in an isolated sandbox:

- unknown verbs and mutation-style flags fail closed;
- dangerous commands (`clean`, `worktree-remove`, `validate`, …) are unreachable;
- read invocations create no files/dirs, modify no git state, perform no fetch;
- the git wrapper refuses every mutating subcommand;
- user configuration is parsed, not executed (adversarial canary config);
- `--json` is valid JSON for every verb with stable exit codes;
- the declared capabilities match the implemented verb set and are all-false on
  every mutation-sensitive key.

## Permission grant

Add to **project** `.claude/settings.json` (reviewed, shared) — not to a personal
`settings.local.json`:

```json
{ "permissions": { "allow": ["Bash(alloy-ro *)"] } }
```

Because the surface satisfies the constitution above and fails closed, this grant
authorizes inspection only. Every mutating `alloy-*` command keeps its own name
and continues to require explicit approval.

## Out of scope for V1

Deferred pending safe read-only extraction: `health`, `audit`, `ai-health`,
`agent-ready`, `initiative-status`, `product-status`, `product-decisions`
(originals do broad scans, `mkdir`, or node-backed reads that need a write-free
re-implementation). Rejected from the surface entirely: anything with a mutation
path — `clean`, `manifest --set`, `worker-doctor --recover`, `cert-leak-clean`,
and any `--refresh` that fetches. These land under the same `Bash(alloy-ro *)`
grant only once a future sprint proves each satisfies the constitution.
