# TypeScript Architecture Roadmap — Runtime V1 (task TS-2)

> Design doc for the TypeScript-experience certification (category **TypeScript Architecture**, C → B+ now,
> A later). It separates **immediate in-repo wins** (achievable without restructuring) from the
> **project-reference initiative** (the A-grade lever). No code is implemented here; this is the plan.

## 1. Current state (measured baseline)

- **One monolithic project**: `web/tsconfig.build.json` (extends `tsconfig.json`), **no `references`**, so
  every type change re-checks the whole ~15k-file program.
- Cold full typecheck: **156 s / 3.27 GB RSS**, single process. Incremental (warm `.tsbuildinfo`): **15 s /
  1.15 GB**. `incremental: true`, `skipLibCheck: true` already set.
- The "4×8 GB storm" is **only** `next build`'s in-build checker (avoided in the loop via
  `SKIP_BUILD_TYPECHECK=1`; expected in CI where memory is larger). The canonical `npm run typecheck` is
  one process and healthy.
- **Verdict:** not a config defect and not an architectural ceiling — the cost is **graph size**, and it
  grows monotonically as domains are added. That is the scaling liability the A-grade fixes.

## 2. Immediate wins — no restructure (raises C → B+)

Do these first; each is independently measurable (`/usr/bin/time -l npm run typecheck`, before/after):

1. **Guarantee the incremental cache is warm in the normal loop** — document/verify `.tsbuildinfo` is not
   deleted by clean scripts; the normal dev/CI-PR typecheck should be incremental (15 s), full cold only on
   first checkout. Evidence: PR typecheck time.
2. **Remove pathological inferred types on hot runtime modules** — audit `lib/runtime/**`,
   `lib/adminV2/viewModel/drawer/**` for deep conditional/mapped-type inference and give the worst offenders
   explicit return types. Target: the files that dominate a `--extendedDiagnostics` / `--generateTrace`
   run. Evidence: trace hot-spot count down.
3. **Tighten a few over-broad public surfaces** — modules re-exporting large unions or `any`-adjacent
   shapes across the graph; narrow them so a change's blast radius shrinks. Evidence: fewer files rechecked
   on a representative edit (`tsc --incremental` file-count).

**These get to B+** — a healthy single-project graph with contained inference cost. They do NOT need the
project-reference initiative and should ship in the normal loop.

## 3. The project-reference initiative (the A lever) — larger, still Runtime V1

Goal: bounded TypeScript projects (`composite: true` + `references`) so a change re-checks a *bounded*
project, not the whole app. This is a build-tooling initiative **inside** Runtime V1 (no runtime change,
Decision D-008 / D-010) — TypeScript project references exist precisely for this.

### Extraction order (most stable / fewest inbound deps first)

1. **`@runtime/kernel`** — `lib/runtime/kernel/**` (attention, provisioning, focus). The stable core;
   depends on almost nothing app-specific. Highest leverage: a kernel edit stops re-checking the app.
2. **`@runtime/provisioning`** — `lib/runtime/provisioning/**` (the Provisioning Answer + composer). Depends
   on kernel types only.
3. **`@runtime/presentation`** — `lib/presentation/runtime/**` + `components/presentation/**` (Surface Host
   render path). Depends on kernel + provisioning.
4. **App** — `app/**` + the remaining `components/**`, referencing the three projects above.

### Guardrails (non-negotiable)

- `composite: true` + `declaration: true` + per-project `tsBuildInfoFile`; `tsc -b` for the workspace.
- **No circular project references** — extraction #1→#4 must stay a DAG. Enforce with a lint/CI check
  (`madge --circular` or a `tsc -b` failure) before merging each extraction.
- Each extraction is **one PR, individually measured** (cold/warm typecheck time + RSS, before/after) and
  reverted if it does not reduce recheck scope.
- Do NOT change runtime behavior in an extraction PR — moves + `references` only; a behavior change rides a
  separate PR.
- Next.js/Turbopack must still resolve the `@/` alias — verify `paths` + project layout keep the app build
  green after each step.

### Risk / effort

- **Risk:** medium — path-alias resolution across projects, and the discipline to keep the DAG acyclic.
  Mitigated by one-project-per-PR + the circular-ref gate + build cert each step.
- **Effort:** multi-session (4 extractions). This is the "larger initiative, still V1" bucket — not a
  ceiling, not a quick win.

## 4. A-grade definition (exit criteria)

- A representative runtime edit re-checks only its owning project (measured: `tsc -b` rechecks 1 project,
  not 15k files); incremental typecheck of the kernel/provisioning projects is single-digit seconds.
- No circular project references (CI-enforced).
- Cold full-workspace typecheck materially below the 156 s baseline and, more importantly, **decoupled**
  (a domain added to the app project does not slow a kernel edit's typecheck).
- Normal-loop and CI typecheck stay single-process and within workstation memory.

## 5. Sequencing vs the rest of certification

Section 2 (immediate wins → B+) can run anytime and is not blocked. Section 3 (→ A) should follow the
higher-leverage runtime tasks (CP-1, RA-2, CQ-2) so the module boundaries are extracted against a
*decomposed* Focus Panel (CQ-2) rather than the current monolith — extracting projects around a monolith
would bake the monolith's coupling into the project graph. **Do CQ-2 before the presentation-project
extraction (#3).**
