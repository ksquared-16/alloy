# DevOps 10 — Control Plane Resilience & Host Failover V1

**Status.** Design and code certified. **Live failover NOT activated** — the
infrastructure it requires does not exist yet, and this document says exactly
what is missing.

**Baseline.** `origin/staging` @ `d90215ed1`, with DevOps 9 (`da3369c57`,
carrying DevOps 8–1) merged in.

---

## 1. The problem, stated exactly

`claimControlPlaneOwnership` writes `control-plane-owner.json` into the runtime
root **of the machine that wrote it**. It is a good answer to "which process on
this host owns the control plane" and no answer at all to "which *host* owns it"
— because the file and the host fail together.

Losing the Mac mini therefore loses both Vacilando and the record of who was
running it.

## 2. The durable-state inventory, measured

The gateway state root is **281 MB**: `execution-runs` 44 MB, `audit.jsonl`
42 MB, `trusted-host-actions` 13 MB, `attachments` 11 MB, `governed-actions`
7.9 MB.

| Disposition | State |
|---|---|
| **REPLICATE** | lane registry · lane memory · execution runs · governed requests · governed grants · host config · audit log |
| **REBUILD** | worktrees · repository knowledge · toolkit identity · instruction baseline |
| **RECONCILE** | recovery episodes · promotion candidates |
| **RECREATE** | runtime generation · provider sessions |
| **DO NOT RESTORE** | secrets · browser profiles · owned process records |

**Filesystem mirroring is the tempting failover architecture and the wrong one.**
It copies 281 MB of which most is reconstructible, it copies processes' leavings
as though they were authority, and it makes the standby a photograph of a machine
rather than a host that can do the work.

The one honest caveat is recorded on the `worktrees` row: **unpushed commits**
are the thing rebuilding loses, and the drill must detect them rather than let
them vanish quietly.

## 3. Fencing: why an off-host compare-and-swap, and why it is enough

Audited before choosing. The only authorities here that survive the loss of the
Mac mini are the **GitHub remote** and the **hosted database**. Tailscale is
connectivity, not arbitration; there is no etcd or consul. The remote git ref is
the better of the two — already the promotion authority this system trusts,
always-on, and a ref update is atomic server-side, so exactly one claimant can
move the epoch from N to N+1.

**The insight that makes this sufficient:** every mutation Vacilando must not
duplicate — a merge, a push, a hosted migration, a message send, a toolkit
install — *requires the network*. A partitioned old primary cannot perform any of
them, whatever it believes about its own role. Fencing the remote fences the
entire destructive class; the local writes a partitioned host keeps making are
reconciled as an older epoch rather than trusted.

**Explicitly refused as evidence of death**, and enumerated in code so it cannot
be smuggled in: `ping_timeout`, `pid_absent`, `local_heartbeat_stale`,
`wall_clock_timeout`, `operator_impatience`. None distinguishes a dead host from
an unreachable one.

`mayMutate` is the single guard: no lease, a lease held by another host, an epoch
behind the authority, an expired lease, or an authority of `NONE` all produce the
same refusal.

## 4. V1 is MANUAL_FENCED_FAILOVER, deliberately

Fencing is *provable*, and V1 still requires a human to confirm the takeover. The
mission's own instruction is the reason: **safety before automation**. Two facts
support it — the only second host on the tailnet is a laptop that was **offline,
last seen 12 minutes ago**, and not every mutation path has been retrofitted
behind `mayMutate` yet. Automatic takeover is one flag away and should not be
turned on until both change.

## 5. Three identities, kept apart

```
host_id             durable, survives reboots and reinstalls   WHICH MACHINE
runtime_generation  minted per control-plane incarnation       WHICH BOOT
pid                                                            WHICH PROCESS
```

DevOps 5 separated the last two after PID reuse let a stranger inherit ownership.
A failover adds the first, and collapsing it into generation is the same mistake
one level up: **a standby that reused the primary's generation would make every
stale ownership record in the replicated state read as current.**

## 6. In-flight work

`STARTED_UNKNOWN` is the class that must never be got wrong. An action that began
and whose outcome cannot be determined is **never replayed** — replaying a merge,
a migration or a message is how one operation becomes two. This host has already
produced a migration that applied while its ledger row did not, which is exactly
the state that looks like "it failed, run it again".

Every reconciliation domain delegates: migrations to `migration-parity` (partial
success is a real state), merges to GitHub's own truth, messages to durable
acceptance, the train to DevOps 6, provider turns to the session lifecycle, slots
to the registry.

## 7. Old primary rejoin: no last-boot-wins

A returning primary sees an epoch newer than its own, becomes `STANDBY`, fenced,
reconciling read-only, with its prior generation invalidated. It does not get
authority back by having been primary yesterday, by having the larger state
directory, or by booting most recently.

## 8. The restore drill — run against live state, read-only

```
ok  snapshot manifest is complete                    7 stores
ok  no secret-bearing store is in the snapshot       none
ok  restore completed into an isolated root          97.7 MB in 52 ms
ok  lane identities survive the restore              13 lane record(s)
ok  lane memory survives the restore                 1 record(s)
ok  governed action history survives the restore     200 request(s), 0 non-terminal
ok  no process, profile or secret state crossed      excluded: secrets, browser_profiles,
                                                     owned_processes, runtime_generation,
                                                     provider_sessions
ok  takeover mints a new runtime generation          …b95d904a → …4501bf68
ok  prior-generation ownership is not current        stale ownership refused
ok  the old primary is fenced                        epoch 1 vs authority 2 — superseded
ok  exactly one host may mutate                      epoch 2 → host_standby_drill
ok  certification blocks while a proof is unmeasured takeover unproven: critical_invariants

DRILL PASSED — nothing on the primary was modified.
```

The last line is the important one: the drill deliberately does **not** run the
invariant pack, so certification comes back `UNMEASURED` and blocks. A drill that
reported a certified takeover it had not proven would be the exact failure this
programme refuses.

> **Two evidence defects I had to fix in my own drill.** It first reported
> "1 lane record" for a registry holding **thirteen** lanes in one `lanes.json` —
> it counted files, not records. And it printed both runtime generations
> truncated to a shared 14-character prefix, so two genuinely different values
> rendered identically and the line contradicted the check that had just passed.
> The restore was correct both times; the evidence was not, and for a drill that
> *is* the defect — a check whose number does not demonstrate its claim certifies
> nothing.

## 9. RPO and RTO, measured or null

- **RPO = the snapshot interval** (15 min default). Anything written between
  snapshots is lost with the disk; that is the honest bound, not a target.
- **RTO = restore + provision + certification.** Measured in the drill: 97.7 MB
  restored in 52 ms, so restore is negligible and RTO is dominated by
  provisioning (2 min warm / 30 min cold) and certification (5 min) ≈ **7 min
  warm**.
- With no timed restore, `recoveryObjectives` returns **`rto_ms: null`** and says
  *"unmeasured: no restore has been timed, so an RTO would be a guess"*.

## 10. Observability

`host.resilience`, in the existing framework. The measurement that matters is not
"are we HA" but **what stops us** — a boolean tells an operator nothing they can
act on. Severity is chosen so the check survives being true: one host and no
replication is a `watch`, the condition this subsystem exists to describe. The
`problem` is reserved for an **incomplete snapshot**, which is worse than none
because somebody may be counting on it.

Live: `watch · primary vacilando-mac-mini · standby null · fencing none ·
"no standby host is registered"`.

## Certification

`control-plane-resilience` — **46 passed, 0 failed**, covering all twenty
required proofs including the full split-brain matrix: heartbeat-only refusal, a
partitioned live primary fenced on its next authority check, two hosts unable to
both believe they may mutate, old-primary rejoin, accepted-not-started survival,
started-unknown never replayed, incompatible standby refusal, missing secret
authority, stale generation ownership, and design-certified ≠ activation-ready.

Regression green: `toolchain-canary` 49/0, `agent-configuration` 31/0,
`host-maintenance` 50/0, `promotion-train` 63/0,
`development-migration-parity` 37/0, `development-health` 30/0,
`development-governed-approval` 38/0, `governed-action-handoff` 15/0, and the
DevOps 1–5 contracts (17/22/27/22/23, all 0 failed).

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. No toolkit altered, no Gateway
restarted, no reboot, no failover activated, no lease claimed, no ref pushed,
Host Lifecycle lane and soak evidence untouched.

## Live activation readiness: **NOT READY**

`activationReadiness` names exactly what is missing, and on this host that is:

1. **A continuously available second host.** `macbook-air-2` exists on the
   tailnet and was **offline, last seen 12m ago**. A standby that is usually
   asleep is not a standby.
2. **Configured state replication.** Nothing currently copies the seven
   must-replicate stores off this machine. The drill proves a restore *works*; no
   snapshot is being *taken*.
3. **An external fencing authority, configured.** The design names remote-ref
   compare-and-swap; no leadership ref exists and none was created, because
   creating it means pushing during the soak.
4. **Secret grants held by the standby in its own right.** Secrets are never
   replicated by design, so the standby must be independently authorized or it
   must refuse the affected operations.
5. **One controlled failover test.** Never performed.

**No high availability is faked on one machine.** The contracts are certified;
the infrastructure is enumerated.

## Remaining debt

- **`mayMutate` is not yet called by every mutation path.** The guard exists and
  is proven; retrofitting the governed-action executor, the merge path and the
  migration path behind it is what turns fencing from a contract into an
  enforcement. Until then, automatic mode must stay off — which is why V1 is
  manual.
- **Snapshot-taking is not implemented**, only snapshot *manifesting* and
  restoring. The mechanism should reuse an existing trusted store rather than
  introduce one.
- **Unpushed worktree commits** are detected as a risk class but no takeover path
  yet enumerates them; DevOps 3's branch-durability measurement is the owner.
- **`audit.jsonl` is 42 MB and growing**; replicating it whole is feasible now
  and will not stay so. Retention bounds it before replication does.
