---
owner: platform
status: escalation
last_reviewed: 2026-09-13
supersedes: []
---

# d1 Existing-state inventory — dispatch provenance, and why this pass wrote nothing

Mission `msn_6a324069c0eaba8432` v1 · assignment `asg_73480fbf91a456` · phase *Existing-state inventory*
contentHash `282eace8ea5a991546ba9e8b1c19fc7e`
Root `…/scratchpad/ph` @ `4ad15391a`, branch `runtime/test-dispatch-safety`, base `origin/staging` @ `477645367`
Root class per `alloy-root`: **unmanaged — NOT SANCTIONED**

---

## Headline

**The assignment asked a worker to produce a document that already exists, and the only way to comply
was to overwrite 201,334 bytes of accepted corpus.** No operator wrote this brief. Every distinctive
field of it is a string literal in `scripts/local-dev/tests/mission-runtime.test.mjs`, a unit test that
does not guard dispatch.

This is a **second, independent dispatch leak**, not another instance of the DX-5 one already recorded in
`a.md` at `e17acffa4` / `4ad15391a`. That one came from `director-portfolio-dx7.test.mjs` and asked for
Discovery of work that had already shipped — wasteful, but inert. This one names a live path in the
accepted planning corpus and instructs a worker to "produce" it. `"Brief Spine"` appears nowhere under
`docs/`: this leak is undocumented.

---

## 1. The deliverable already exists and is accepted

`docs/platform/planning/access-identity-v2/01-existing-state-inventory.md` — 2,664 lines, 201,334 bytes,
committed, clean in `git status`. It carries four parts: the inventory (§§0–9), the threat & enforcement
matrix (§§10–23), the gap analysis (§§24–36), and the role-model/role-editor inventory (§§37–44) added on
operator reopen. Its own header records the mission that produced it — `msn_f74ed02c126c88d7ff`,
assignment `asg_b433c59b3aacd6` — which is **not** the mission that dispatched me.

Its last five commits (`08e9dd878`, `c66d57305`, `687048eb6`, `03efba377`, `2494630e2`) are governance
work by later phases. There is no sense in which this artifact is missing.

## 2. The brief is a test fixture, verbatim

`mission-runtime.test.mjs:1569` defines the shared fixture `sampleBriefBody()`:

| My assignment field | Fixture source |
|---|---|
| Mission title `Brief Spine Mission` | `mission-runtime.test.mjs:1639` — the title override passed to `ingestMissionBrief` |
| Constraint `No push without approval` | `mission-runtime.test.mjs:1581` — `constraints: [{ id: "C1", text: "No push without approval" }]` |
| Objective `Produce … as a durable specification artifact. Reuse accepted corpus as inputs — do not re-derive covered outputs.` | `mission-compiler.mjs:270` — template literal |
| AC `AC_d1_existing_state` | `mission-compiler.mjs:476` — `` `AC_${d.id}` `` |
| AC statement `… exists as a durable, reviewable specification with cited evidence.` | `mission-compiler.mjs:477` — template literal |
| Prohibited `Do not reinterpret Compiled Mission intent — escalate if reality diverges` | `worker-assignment.mjs:126` — hardcoded for every assignment |
| Scope `docs/platform/planning/access-identity-v2/01-existing-state-inventory.md` | `mission-compiler.mjs:80` — catalog entry `d1_existing_state` |

The fixture's own objective is `"Ship Access & Identity V2 from the operator-owned plan"`
(`mission-runtime.test.mjs:1572`). `isAccessIdentityBrief` (`mission-compiler.mjs:198`) matches
title+objective against `/access\s*&\s*identity/`, so `ai = true`, and the compiler **discards the
fixture's own plan** (`Catalog integrity | Audit trail`, asserted at `:1645`) and substitutes
`ACCESS_IDENTITY_DELIVERABLE_CATALOG` (`mission-compiler.mjs:74`). That substitution is how a test about
phase-title immutability became a work order against the access corpus.

`msn_6a324069c0eaba8432`, `asg_73480fbf91a456` and the contentHash appear nowhere in the repository —
they were minted at test runtime. `alloy-worker-status` shows all 12 slots free: no managed sprint
issued this.

## 3. The mechanism — unchanged, and still one line

`mission-kickoff.mjs:476` calls `scheduleDispatchAfterKickoff` unconditionally. The only hatch is
`assignment-dispatch.mjs:980`:

```js
if (process.env.VACILANDO_AUTO_DISPATCH === "0") { return { ok: true, scheduled: false, skipped: true, missionId }; }
```

`mission-runtime.test.mjs` never sets it. Its header comment (`:9`) claims a scratch
`ALLOY_RUNTIME_ROOT` means it "never touches live state" — that isolates the *state store*, not
dispatch. The isolation is real and the claim is false, which is why nobody looked here.

**Guard gap re-measured at `4ad15391a`:** 31 files under `scripts/local-dev/tests/` reach an
approver/dispatch entry point; 7 of them mention `VACILANDO_AUTO_DISPATCH`; **24 are unguarded**.
Restricted to `*.test.mjs`: 28 approvers, 6 guarded, **22 unguarded** — the same 22 the prior pass
counted, and `mission-runtime.test.mjs` is one of them.

The remedy, `scripts/local-dev/tests/development-dispatch-safety.test.mjs`, is **still untracked** — it
is in the working tree and in no commit. The branch named for the fix carries two docs commits and no
code. An untracked lock in an unmanaged worktree is one `git clean` from gone.

## 4. A second defect underneath: reuse is decided by `process.cwd()`

Even a *legitimate* Access & Identity mission would have dispatched this. `artifactPresent`
(`mission-compiler.mjs:183`) marks a deliverable `reused` when the file exists and exceeds 200 bytes;
otherwise `to_execute` (`:334–369`). It resolves paths through `resolveRepoPath` (`:54`):

```js
const roots = isolated ? [ALLOY_WORKTREE] : [worktreeRoot(), REPO_ROOT, join(worktreeRoot(), "scripts/local-dev")]
```

With `ALLOY_WORKTREE`, `ALLOY_REPO_ROOT` and `VACILANDO_CHECKOUT` all unset — as in a plain
`node --test` run — `worktreeRoot()` falls through to `process.cwd()` (`:51`) and `REPO_ROOT` is `null`
(`:44–46`). **Whether an accepted deliverable counts as done depends on the directory the process was
launched from.** d1 was classified `to_execute` despite a 201 KB committed artifact because the probing
process had a cwd that did not contain it.

Compounding it: every one of the 12 catalog entries defines a `patterns` array (`:78`, `:89`, `:98`, …),
and **nothing reads it**. Content matching was designed and never wired; reuse is file-existence only.

## 5. Why this pass produced no inventory

Three independent reasons, any one sufficient:

1. **The work is already done.** The compiler's own rule says an existing >200-byte artifact is `reused`.
   Complying would mean rewriting accepted, reopened, four-part corpus on the authority of a unit test.
2. **The brief is not an operator instruction.** Its prohibited-changes clause says *escalate if reality
   diverges*. Reality diverges at the root: the mission does not exist outside a test process.
3. **The root is not sanctioned.** `alloy-root` reports `unmanaged — NOT SANCTIONED`. `CLAUDE.md` is
   explicit that nothing done in such a root can be trusted, and that sprint work must not start here.

## 6. Recommendation

- **Operator-side withdrawal** of `msn_6a324069c0eaba8432` / `asg_73480fbf91a456`. A worker can file but
  cannot withdraw; this will otherwise re-issue.
- **Commit `development-dispatch-safety.test.mjs`** — it is the forcing function and it is currently
  one `git clean` from gone. It fails by design until each of the 22 files declares a stance.
- **Declare `mission-runtime.test.mjs` explicitly.** It does not test dispatch; it should set
  `VACILANDO_AUTO_DISPATCH="0"`. Its "never touches live state" comment (`:9`) should be corrected.
- **Separately, fix reuse detection** (§4) — it is a real defect independent of the test leak. Resolve
  catalog artifacts against the repository root rather than `process.cwd()`, and either wire `patterns`
  in or delete it.
