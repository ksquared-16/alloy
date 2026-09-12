---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Thread 5 — certification auth unblock

**Status.** Fix implemented and certified. It cannot take effect on the running
Gateway while the Host Lifecycle soak is active, so the auth gate is **not green**
and Gate 2 Steps 5–8 were **not run**.

**Candidate (Thread 5 product).** `9e4f57c1994de54f54e68b6a9af4d21be2c459d9` —
unchanged, clean tree, still servable. No product code was touched.

**Candidate (this infrastructure fix).** `promote/thread5-cert-auth`, based on
`origin/staging` @ `65a1db927`.

---

## 1. Re-observed, not assumed

| # | Observation | Result |
|---|---|---|
| 1 | Current staging | `65a1db927` |
| 2 | Running Gateway / toolkit | `14b0e01dcd06`, pid 29807 alive |
| 3 | Host Lifecycle soak | ACTIVE, sampling every 60 s, `server_toolkit 14b0e01dcd06` |
| 4 | Slot-8 owner | `documentation-api` (`ALLOY_WORKTREE_SLOT="8"`, port 3018) |
| 5 | Slot-8 runtime target | `web/.env.certification.local` → Supabase `http://127.0.0.1:54421` |
| 6 | Slot 8 serves alloy-cert | cert stack answers `200`; slot 8 answers `200` and `/adminV2` → `/login` |
| 7 | Exact candidate servable | worktree HEAD `9e4f57c19…`, clean |
| 8 | QA mint env-source resolution | `~/Alloy/web/.env.local` — **hosted** |
| 9 | Auth project / cookie namespace | hosted `https://ikaxil….supabase.co` vs server's `127.0.0.1:54421` |

Observations 8 and 9 are the blocker, and they are now measured rather than
inferred.

## 2. The defect

```js
// qa-session-mint-runner.mjs — on the running toolkit AND on current staging
export function trustedEnvSource() {
    return process.env.ALLOY_SERVER_ENV_SOURCE
        || join(process.env.ALLOY_REPO || join(homedir(), "Alloy"), "web", ".env.local");
}
```

One value for the whole host, and `qa-session-restore-action.mjs` never passes an
`envSource`, so this always wins. There is **no per-slot resolution at all**.

Slot 8 therefore serves the certification project and authenticates against the
hosted one. The mint produces a cookie the slot-8 server will not accept, and
authentication fails before any product path runs.

**This is the same defect PR 821 already closed once, elsewhere.** That change
added `ALLOY_CERT_DATABASE_URL` because, in the config's own words, *"reading the
deployed credential for a certification request is the defect PR 821 closed."* It
is wrong here for exactly the same reason; the QA mint never got the same
treatment.

### Why `ALLOY_SERVER_ENV_SOURCE` is not the lever

It is process-wide and is read by the trusted host for **migrations, raw SQL and
production applies** as well as by this mint. Pointing it at certification to fix
one slot would silently repoint every privileged operation on the host. It is not
runtime configuration; it is a global authority switch. Rejected.

Setting it would also require restarting the Gateway to inject it — which the
soak forbids anyway.

## 3. The fix

The runtime target is a property of the **slot**, so the declaration is one too.
It reuses the `ALLOY_SLOT_<N>_*` vocabulary the config already uses for
`ALLOY_SLOT_8_QA_IDENTITY`, and the same reader, rather than inventing a
mechanism.

- `qaEnvSourceForSlot(slot)` in `browser-auth.mjs` — env var, then user config,
  then `alloy-config.example`, exactly as `qaIdentityForSlot` already resolves.
  The two now share one parser, so a future per-slot setting cannot drift.
- `resolveMintEnvSource(slot)` in `qa-session-mint-runner.mjs` — a declared source
  wins; otherwise the host default, **byte-for-byte unchanged**.
- **Declared-but-missing REFUSES** (`qa_env_source_missing`) and refuses *before*
  the privileged child is spawned. Falling back there would put the defect back
  invisibly: a certification slot would quietly mint a hosted cookie again, and
  the only symptom would be an auth failure three layers away that looks like a
  product problem.
- An explicit caller-supplied `envSource` still outranks both — the existing test
  seam and escape hatch keep working.

Nothing else changed. No product code, no slot retarget, no new auth mechanism,
no synthesized cookies, no bypass of the governed QA identity/session path.

### Proved on the real slot

```
RUNNING toolkit 14b0e01dcd06 (what the Gateway executes today)
  slot 8 mint env source -> /Users/vacilando/Alloy/web/.env.local
  per-slot resolver present: false

FIXED candidate (this lane)
  slot 8 -> .../documentation-api/web/.env.certification.local (declared: true)
  slot 3 -> /Users/vacilando/Alloy/web/.env.local              (declared: false)
```

The running toolkit ignores the declaration entirely — the resolver does not
exist in it. That is why this cannot be fixed by configuration alone.

## 4. Certification

`qa-session-env-source` — **10 passed, 0 failed**: a slot that declares nothing
keeps the host default; a declaration resolves from config and from the
environment variable, with the env var winning; one slot's declaration never
leaks to another; a missing declared source refuses rather than falling back; a
refused slot never spawns the mint child; the child is invoked with the slot's own
source; a hosted slot's invocation is unchanged; an explicit caller source still
wins; and `qaIdentityForSlot` still resolves through the shared parser.

Regression green: `development-browser-auth` 27/0, `deployed-browser-auth`,
`development-qa-identity-topology` 10/0, `development-qa-slot-preflight` 18/0,
`deployed-qa-session-restore-governance`, `development-governed-approval`,
`development-agent-session`, `development-idle-session-reuse`,
`development-provider-session-lifecycle`, `governed-action-request`.

Pre-existing failure, verified identical on pristine staging by reverting the
working tree and re-running: `development-session-bootstrap` (11 passed, 4
failed). Untouched, not claimed as fixed.

## 5. Why the auth gate is not green, and Gate 2 did not run

The mint is executed by the **Gateway**, from the **installed toolkit**. The fix
lives in this lane. Making it effective requires a toolkit install, which replaces
the running Gateway and restarts Host Lifecycle soak criterion 12.

The instruction's own rule applies: *"If a required infrastructure code change
cannot become effective without a Gateway/toolkit install: finish implementation
and certification in the isolated lane and stop."*

So the auth verification gate is **not** green, and per Thread 5 product law —
**auth failure ≠ product failure** — Gate 2 Steps 5–8 were not attempted. The
prior blocked walkthrough still counts as **zero mounted coverage**.

## 6. Exactly what must happen after the soak

1. Install a toolkit containing this candidate (ideally promoted together with
   the Governance + Async Acknowledgement candidate `16601e54f`, which is also
   waiting on the same soak).
2. Add one line to `~/.config/alloy-dev/config`:

   ```sh
   ALLOY_SLOT_8_QA_ENV_SOURCE="$ALLOY_WORKTREE_ROOT/documentation-api/web/.env.certification.local"
   ```

   It is deliberately **not** pre-applied: with the current toolkit nothing reads
   it, so it would sit in live host config looking active while doing nothing.

3. Re-run the auth verification gate in full: slot 8 serves alloy-cert; exact
   candidate served; QA session restore succeeds; mint reads
   `.env.certification.local`; the resulting cookie/project ref is certification,
   not hosted; authenticated home succeeds; no login redirect; session survives
   Gate 2 navigation.
4. Only then run Gate 2 Steps 5–8 in one mounted pass against
   `9e4f57c1994de54f54e68b6a9af4d21be2c459d9`.

Slot 8 must remain `alloy-cert` throughout. No restart that loses that target.

## Carry-forward

- **G-14:** CLOSED
- **G5:** CARRIED_FORWARD
- **Classroom Coach / D-1:** BLOCKED_ON_PROVIDER_CONTRACT — no provider contract,
  no adapter, untouched by this work and not solvable through QA/auth.
