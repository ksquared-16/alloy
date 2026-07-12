---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# TypeScript performance and typecheck operating doctrine

**Status:** Canonical infrastructure guidance (July 2026).

This document captures the root cause of TypeScript OOMs and slow typechecks in Alloy, the canonical commands agents and developers must use, and hygiene practices for Cursor/worktree environments.

---

## Root cause (summary)

Alloy's `web/` package typechecks as a **single monolithic TypeScript program** with **no project references**:

- **~6,800 files** in the production/build graph
- **~1.3M types** and **~7.7M instantiations**
- **~4.2–4.5 GB** TypeScript checker memory for the production graph
- **>4 GB** for the full graph (includes ~2,000 test files)

Node's default heap limit is **~4 GB**. Running `tsc` without an explicit heap override therefore exits with code **134** (OOM) on the full graph, and can OOM on the production graph under memory pressure.

**Check time dominates** (~95%+ of `tsc` wall time). Parse/bind are comparatively cheap.

Secondary factors that inflate wall time without changing program size:

- Multiple git worktrees each with their own `node_modules` and Cursor extension hosts
- System swap thrashing when several `tsc` / tsserver processes run concurrently
- Absence of warm incremental cache on cold worktrees

This is **not** caused by giant generated Supabase `Database` types or recursive Zod inference in the current codebase.

---

## Canonical commands

Run all commands from `web/`.

| Command | Graph | When to use |
|---------|-------|-------------|
| `npm run typecheck` | **Production/build** (`tsconfig.build.json`) | **Default pre-merge check** for app, API, `lib/`, components changes |
| `npm run typecheck:build` | **Production/build** (alias) | Same as `typecheck` |
| `npm run typecheck:tests` | **Full** (`tsconfig.json`) | Test files, scripts, Playwright, or shared types consumed by tests |

### Heap requirements

All three scripts invoke:

```text
node --max-old-space-size=8192 node_modules/typescript/bin/tsc …
```

This sets an **8 GB Node heap** cross-platform (macOS, Linux, Windows) without shell-specific `NODE_OPTIONS` syntax.

**Do not weaken** `strict`, `skipLibCheck`, or other correctness compiler options to improve performance.

---

## Production vs test graph

| Config | Includes | Excludes | Aligns with |
|--------|----------|----------|-------------|
| `tsconfig.build.json` | `app/`, `components/`, `lib/`, `hooks/`, `contexts/` | `tests/`, `scripts/`, `playwright/`, `**/*.test.*` | `next build` (`next.config.ts` → `typescript.tsconfigPath`) |
| `tsconfig.json` | Everything in build graph **plus** tests, scripts, Playwright | Artifact dirs only | Full strict validation |

**CI** (`.github/workflows/web-typecheck.yml`) runs **both** jobs on every `web/**` pull request:

1. `npm run typecheck` — production graph
2. `npm run typecheck:tests` — full graph

Neither job replaces the other. Merge protection is not weakened.

---

## Incremental cache

Both configs set explicit, gitignored build-info files:

| Config | `tsBuildInfoFile` |
|--------|-------------------|
| `tsconfig.json` | `tsconfig.tsbuildinfo` |
| `tsconfig.build.json` | `tsconfig.build.tsbuildinfo` |

`*.tsbuildinfo` is gitignored at repo root. The two configs **do not overwrite** each other's cache.

**Warm runs** after a small edit should be significantly faster than cold runs. Delete `*.tsbuildinfo` only when diagnosing stale incremental state.

---

## Node version parity

CI and local development target **Node 20**, declared in `web/.nvmrc`.

```bash
cd web && nvm use   # or fnm/mise equivalent
```

Do not add contradictory `engines` or `.node-version` files without reconciling them with `web/.nvmrc`.

---

## Why `npx tsc --noEmit` is prohibited

Raw `npx tsc --noEmit`:

1. Uses Node's **default ~4 GB heap** → OOM on full graph (exit 134)
2. Defaults to `tsconfig.json` (full graph) even when a production-only check is intended
3. Bypasses the repo's canonical script wiring documented in CI and agent rules

**Agents and developers must use `npm run typecheck`** (production) or **`npm run typecheck:tests`** (full).

---

## Diagnosing OOM vs real TypeScript errors

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Exit **134**, `FATAL ERROR: … heap out of memory`, no error list | OOM — heap too small or system memory pressure | Use `npm run typecheck` scripts; close extra worktrees; reduce concurrent `tsc` |
| Exit **2**, numbered `TS####` errors printed | Real type errors | Fix the reported errors |
| Very slow wall time, low CPU %, high swap | System thrashing | Close Cursor windows/worktrees; wait for other `tsc` to finish |
| Fast failure with `Cannot find module` | Missing `npm ci` / wrong cwd | `cd web && npm ci` |

### Profiling commands (investigation only)

```bash
cd web
node --max-old-space-size=8192 node_modules/typescript/bin/tsc \
  -p tsconfig.build.json --noEmit --extendedDiagnostics
```

Capture: `Files`, `Memory used`, `Check time`, `Total time`.

---

## Worktree and Cursor memory hygiene

Alloy commonly uses **many git worktrees** for parallel feature work. Each worktree typically has:

- Its own `web/node_modules` (~650 MB)
- Its own Cursor extension host + file watcher when opened
- Its own tsserver graph when the workspace is active

**Recommendations:**

- Keep **≤2 active worktrees** open in Cursor when running typechecks
- Run `npm run typecheck` in **one worktree at a time**
- Prune stale worktrees: `git worktree list` / `git worktree remove`
- Kill stray background `tsc` before starting a new typecheck

---

## Remaining structural bottlenecks (not addressed here)

These require dedicated engineering sprints — not script changes:

- TypeScript **project references** (split `lib` / `app` / `tests`)
- Decomposition of megaf files (e.g. `AdminEntityDrawerLegacy.tsx` at ~20k lines)
- Shared `node_modules` strategy across worktrees

See the July 2026 TypeScript performance investigation for measurements and ranked recommendations.

---

## Related docs

- `web/README.md` — command quick reference
- `docs/platform/governance/testing-and-quality.md` — merge gates
- `.cursor/rules/alloy-development-guardrails.mdc` — agent verification rules
