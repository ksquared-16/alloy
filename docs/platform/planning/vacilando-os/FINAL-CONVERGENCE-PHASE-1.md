---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# Final Convergence — Phase 1

**Status.** Train composed and certified except for one gate. **BLOCKED_ON_FINAL_TRAIN.**

**Starting staging.** `5c7b100bcd645f4ed65a082591582456d92bdfad`
**Starting toolkit.** `5c7b100bcd64` — identical to staging; Gateway pid 76699 / server 76759, stable across the run.

---

## 1. Deployment hold: the canonical owner existed and was not consulted

Audited rather than invented. `gateway_host_mutation` is already a **capacity-1
exclusive resource** on the ordinary governor, and `install-vacilando-gateway.sh`
has honoured it since two lanes silently undid each other's Gateway installs.

**The governed action did not.** `host.install_toolkit` relinks `toolkit/current`
and converges the Gateway onto it without ever asking who holds the host — which
is exactly how, at 03:42Z, the Surfaces lane completed `gar_338624523cda6d` and
invalidated an authoritative 24-hour soak another lane was in the middle of. **No
rule was broken, because nothing asked.**

The minimum extension is one guard call in the existing executor, before the
install: the holder's own run passes, an unheld host installs exactly as before,
and every other run is refused with the holder named. No parallel lock, no new
store — a control asserts the module keeps neither.

This makes the requested law expressible: normal development continues, and no
other toolkit install may replace the running Gateway while a convergence holds
the host.

## 2. Ancestry, against current staging

| Candidate | In staging? | Ahead | Merge base |
|---|---|---|---|
| `2bc2411cf` control-plane chain | no | 24 | `5c7b100bc` (current staging) |
| `16601e54f` Governance + Async Ack | no | 4 | `66908d699` |
| `25c85997d` Thread 5 cert-auth | no | 1 | `65a1db927` |
| `9e4f57c199` Thread 5 **product** | no | 36 | `ac407dd41` — **excluded by instruction** |

**Candidates dropped as ancestors:** none at top level — the chain already
absorbed DevOps 1–10 and the three debt-closure missions, so its ancestors were
not offered separately.

**Overlaps, measured:**

- `16601e54f` ∩ chain → `governed-action-request.mjs`, `director-evidence.mjs`
- `25c85997d` ∩ chain → `browser-auth.mjs`, `alloy-config.example`

**Both merged clean, no conflicts**, and both missions' guarantees verified
present afterwards in each overlapping file: `async_execution` and
`scheduleAcceptedExecution` (Async Ack) alongside `artifactContractFor`,
`missing_canonical_artifact_reference` and `defaultTargetForAction` (the chain);
`qaEnvSourceForSlot` (Thread 5) alongside `qaCapabilityForSlot` and
`qaIdentityForSlot` (DevOps 2). No "ours/theirs" resolution was needed or used.

**Final train SHA: `3edb7ccf6643763b771fd065a3f1f3ece0b452a8`**, composed by
merge so every certified candidate SHA remains an ancestor.

## 3. Aggregate regression: green, and one debt closed

```
convergence-hold 8/0        lane-resume 27/0          maintenance-activation 41/0
host-maintenance 50/0       artifact-filing 19/0      migration-outcome 24/0
resilience 46/0             toolchain-canary 49/0     agent-configuration 31/0
promotion-train 63/0        critical-invariants 23/0  lane-knowledge 22/0
director-approval-reliability 23/0   async-acknowledgement-latency 15/0
qa-session-env-source 10/0           governed-approval 38/0
exact-authorization 6/0              governed-action-handoff 15/0
migration-parity 37/0                production-apply-owner 28/0
health 30/0   worktree-lifecycle 27/0   lane-freshness 22/0   bootstrap 17/0
mac-mini-residuals 18/0
```

**`governed-action-request` is now 20 passed / 0 failed.** It was **15/5 on
staging** — the known-red baseline DevOps 5 recorded in `MEASURED_BASELINE`. The
Governance candidate carries the fixture corrections, so composing the train
**closes that debt** rather than inheriting it.

`development-gateway-ui` is **90/1** — `browser-auth routes answer POST`.
Verified identical on **pristine current staging** by extracting `origin/staging`
to a temp tree and running it there. Pre-existing, unrelated, not laundered.

## 4. Critical Invariants: BLOCKED, and why

```
ok  INV-RUNTIME-001/002/003   INV-GOV-001/002   INV-WORKTREE-001
????  INV-ACCESS-001  INV-ACCESS-002  INV-FIN-001  INV-ATTEND-001
      web/node_modules absent; run from a provisioned worktree

UNMEASURED  passed 6/10  unmeasured 4  4672ms
```

Step 6 says UNMEASURED stops, and it does.

**The train touches zero files under `web/`** — 73 under `scripts/`, 17 under
`docs/`, one `CLAUDE.md` — so those four product-domain suites would behave
against the train exactly as they do against the installed build. That is an
argument, not a measurement, and DevOps 5's law is explicit that "we could not
check" is not "it is fine". So it is recorded as reasoning and **not** used to
claim a pass.

### The provisioning gap, precisely

Step 5 directs provisioning through the canonical owner. It cannot serve this:

1. `alloy-worktree-adopt` only resolves names under `ALLOY_WORKTREE_ROOT`, so a
   promotion worktree under `alloy-promotions/` is invisible to it — *"worktree
   path does not exist"*.
2. Placing the train under the lane root and adopting `--no-slot` **succeeds**:
   the worktree is registered, owned and dispatchable with no port and no server.
3. `alloy-worktree-provision` then refuses it: **`metadata missing
   ALLOY_WORKTREE_SLOT`**.

So the two halves of the canonical provisioning path disagree — an identity-only
worktree can be **registered and dispatched but not provisioned** — and all
**12 slots are held by live lanes** (slot 8 is `documentation-api`, Thread 5's
protected certification environment). Freeing one is another lane's environment
and not this mission's to take.

This is sharper than the debt DevOps 5 recorded and DevOps 9 restated. DevOps 6
named `alloy-worktree-provision` as the train's provisioning owner without
proving it could reach a promotion worktree. **It cannot.**

Running `npm ci` directly would be the second-provisioner mistake this codebase
names explicitly, so it was not done.

**Host left exactly as found:** the temporary registration was removed, the
temporary worktree deleted, 13 slot records unchanged.

## 5. What was not reached

Steps 7–15 depend on Step 6. Not attempted: staging integration, toolkit
install, running-build certification, host activation manifest, the new
authoritative soak, and the Thread 5 / Attendance handoffs.

**Nothing was installed, merged, restarted, rebooted or configured on the host.**

## Status

**BLOCKED_ON_FINAL_TRAIN** — composition succeeded and certification cannot
complete.

### The exact unblock

One of:

- **extend `alloy-worktree-provision` to serve a slotless registered worktree**
  (it installs dependencies; it has no need of a port), which is the narrow owner
  fix and the one this mission recommends; or
- **free one slot** for the duration of a train, which costs a live lane its
  environment; or
- **an operator-run provisioning** of the train worktree, which sidesteps the
  owner rather than fixing it.

Until then no promotion train can reach READY_FOR_STAGING with a complete
Level-2 pack, because four invariants are structurally unmeasurable where trains
are composed.

## Remaining debt

- The hold extension is committed and **not installed** — it protects the *next*
  convergence, not this run's window.
- The previous `14b0e01dcd06` soak remains superseded; its samples are interim
  evidence only and criterion 12 is not claimed from it.
- No new authoritative soak was started, because no new build was installed.
