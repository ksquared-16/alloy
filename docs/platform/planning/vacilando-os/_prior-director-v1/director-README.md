# Alloy Director — application (V1)

The local, dark **command center** for the Alloy engineering organization. It is
a dependency-free single-page app plus a loopback-only API/SSE surface. The UI is
a **projection + command surface** over the existing Engineering Runtime state
under `~/.local/state/alloy-dev` — it owns no parallel model.

## Run

```bash
# Launch on the required route (localhost:3020), projecting live runtime state:
node scripts/local-dev/alloy-director

# Or point at a specific runtime root:
node scripts/local-dev/alloy-director --runtime-root /path/to/runtime --port 3020
```

Open http://localhost:3020. The server binds strictly to `127.0.0.1` and exposes
no externally reachable interface. Stop with Ctrl-C.

## Operator navigation

| Route | Screen | Shows |
|-------|--------|-------|
| `#/missions` | Missions | Mission list with the selected mission as the operating center |
| `#/mission/<key>` | Mission workspace | Operator state, phase, current task, worker health, next action, review access, timeline, launch configuration, evidence, and approvals |
| `#/review/<key>` | Product Review | Exact commit/branch/worktree/localhost target, reachability, authentication readiness, implementation/review evidence, risks, and structured multi-finding feedback |
| `#/decisions` | Decision Queue | Product, architecture, QA, release, and failure decisions with mission context |
| `#/history` | History | Meaningful lifecycle events with routine infrastructure noise hidden |
| `#/settings` | Settings | Resource limits, bounded provider adapters, and local safety boundaries |

Live updates arrive over SSE (`GET /api/events`); no screen needs a full-page
refresh. Operator intent is routed through the fixed command allowlist
(`POST /api/commands`): pause/resume, prioritize, launch, resolve decision,
submit product review, approve QA, and approve promotion. Consequential commands
use the pure preview endpoint before an explicit confirmation. Illegal
transitions, incomplete structured feedback, and release-before-QA fail closed.

`GET /api/review-access?mission_key=<key>` performs a bounded loopback
reachability check over the exact projected review target. It never exposes
credentials, cookies, raw prompts, terminal output, or unrestricted host paths.
Managed worktree identity is the narrow absolute-path exception required to
prove the localhost URL, branch, and commit refer to the same review target.

## Files

- `public/` — the SPA shell (`index.html`), dark tokens (`styles.css`), controller (`app.js`).
- `seed-demo.mjs` — materialize nine representative missions for deterministic tests/screenshots; fixture-backed review evidence is labeled in the UI.
- `capture-screenshots.mjs` — seed → serve → drive Playwright → write UI evidence PNGs.

The API/SSE surface and static serving live in `../../lib/director-server.mjs`;
projections, the scheduler, and the command boundary live in `../../lib/director.mjs`.

## Screenshots (evidence)

```bash
node scripts/local-dev/apps/director/capture-screenshots.mjs \
  --out reports/screenshots --web-dir web --port 3020
```
