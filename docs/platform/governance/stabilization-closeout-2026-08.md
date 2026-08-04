# Development Platform Stabilization — Closeout

**Status: complete.** Final staging authority: `ecfb0974c5e0934e7fa1b96f9571d9a11aa93366`.

## Objective

Leave Alloy's development platform in a state where normal product development resumes and
this stabilization effort never has to be repeated.

## Original failure modes

| Failure | Evidence at the time |
|---|---|
| Sessions replicated Docker stacks | 35 containers across 3+ stacks; a session could not start work |
| Sessions replicated dev servers | 3 concurrent `next dev` + Playwright fleets; a certification run OOM-killed at 124M free |
| Work lived only on one machine | 880 local-only commits; slot 4 was 265 commits behind, slot 6 was 230 |
| The toolkit lived inside a worktree | Deleting a worker's worktree would have broken machine-wide commands |
| Dependency artifacts were tracked | `web/node_modules` symlink into another worktree; `backend/.venv` 2,719 files; 1,185 `__pycache__` |
| Typecheck baseline was red | 65 full-graph errors across 23 files, carried as a permanent "baseline exception" |
| Certification could not execute honestly | Teardown stopped the shared stack under other holders; leases expired seconds after being granted |

## Merged work

| PR | Subject | Merge SHA |
|---|---|---|
| #310 | Promotion 5 — certification executes on the shared stack | `cd93302863117d010203045f3b0087140e6f4252` |
| #311 | Promotion 6 — POS geometry, source-document rendering, highlights | `7233e9adf8898c1f53b48cd837720ee7b7f0cc08` |
| #312 | Slice 9 — participant identity is the resolving link | `e47c4b7ac50ebcdf01c31f2a84cf0538246878f0` |
| #313 | Day-boundary operations | `6a95ad06a0dd99b9c71684e6d6fb144eec537a2c` |
| #314 | Compute arbitration | `1b9ecbd86adfd7a259b9cfac7e2d36208d5898e2` |
| #315 | Untrack `backend/.venv` and Python build artifacts | `38422487b79e1ffaef1f1e77c755667ab0dde845` |
| #316 | Full graph debt 65 → 0 | `ecfb0974c5e0934e7fa1b96f9571d9a11aa93366` |

Earlier in the same effort: Docker containment, toolkit durability, fleet stabilization, the
recovery rollback, and Promotions 1–4.

## Certification matrix

| Area | Result | Evidence |
|---|---|---|
| A. Git durability | PASS | 0 tracked `node_modules` / `.venv` / `__pycache__`; 0 cross-worktree symlinks; bundle verifies "complete history"; sha256 matches `2f8d039d…5966cd`; off-device copy present |
| B. Toolkit independence | PASS | Resolves to `~/.local/share/alloy/toolkit/ecfb0974c5e0`, outside every worktree; no command escapes; 79 commands |
| C. Six-slot lifecycle | PASS | All six slots enumerated with worktree, branch, port, git state, ahead/behind, agent and server status |
| D. Day boundary | PASS | day-end **fails closed** on a dirty tree (`DURABILITY_VERDICT=fail`); day-start reported genuine 13-commit divergence, smoke, push, `ready` |
| E. Docker + shared stack | PASS | 10 containers, one stack; exclusive refused while a neighbour holds; release with a holder left keeps it up; last-out stops it; volumes 2 → 2 preserved; reacquired in 27s; 307/307 migrations; `org_documents` present; 0 fixture residue |
| F. Compute arbitration | PASS | Second browser fleet refused; second exclusive-db refused; third `heavy-next-dev` refused at capacity; capacity honoured against a genuinely held permit; 0 permits after release |
| G. Push safety | PASS | `test-guard-push` 29/29 on local bare remotes; no Vercel triggered |
| H. Type + test integrity | PASS | Production graph green; **Full graph green**; baseline exception retired |
| I. Promotion lifecycle | PASS | Exercised end-to-end 7 times (#310–#316) |
| J. Trust boundary | PASS (verify only) | Trust branch durable at `69abdd7d4f6b`; merges cleanly against staging; 0 Trust leases |

### Guard suites — 100 assertions, all green

```
test-guard-push               29/29
test-git-durability           21/21
test-lease-reclaim            12/12
test-tracked-artifact-guard   12/12
test-compute-arbitration      18/18
test-exclusive-lease           8/8
```

## Known limits

- **Three pre-existing runtime test failures** remain on staging, unrelated to typecheck debt
  and not introduced here: two BOS slash-eligibility cases in
  `processRuntimeCommandConsumption`, one Add-Field-picker case in
  `childrenNamesAndInquiryCatalog`. Verified identical before and after, file by file.
- **Local full-graph typecheck exits 144** in this harness. CI is the authoritative source.
- **Trust Runtime** owns its own final certification in a separate session.

## Operating rules for future sessions

1. **Never `supabase start`.** Use `alloy-stack use` / `release`. The PreToolUse hook blocks it.
2. **Take a compute permit** before a browser fleet, an exclusive DB rebuild, a full typecheck,
   or a dev server: `alloy-compute acquire <resource>`.
3. **A destructive tenant rebuild needs an exclusive lease.** There is deliberately no bypass.
4. **Start the day with `alloy-day-start`**; end it with `alloy-day-end`. Slot 4 needed six
   promotions because it skipped this for a quarter.
5. **Certification is serial.** `CERT_WORKERS=1`; use `alloy-certify journey`, which resets only
   before the spec files that demand a pristine tenant.
6. **Never commit dependency artifacts.** `test-tracked-artifact-guard` fails the build; a
   `.gitignore` rule cannot retire something already tracked.
7. **Full graph is green — keep it there.** No `ts-ignore`, no `ts-expect-error`, no `any`.
   Fix by canonical contract.
