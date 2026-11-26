# Mac mini arrival-day cutover runbook

Frozen 2026-08-21. Execute top to bottom. Do not skip ahead: every section assumes the
previous one passed.

Each step carries one of four markers:

| Marker | Meaning |
|---|---|
| 🤖 **AUTO** | Runs unattended. Safe to re-run; idempotent. |
| 🔑 **OPERATOR** | Requires a human: an interactive login, or placing a secret by hand. Cannot be automated, and is not a defect. |
| ✅ **CERTIFY** | A check that produces evidence. Must show operator-visible or end-to-end proof, never "the process is running". |
| ⛔ **APPROVAL** | Destructive or consequential. Stop and get explicit approval before running. |

**Blocking precondition.** PR #487 must be merged to `staging` before the mini's Gateway is
installed. Canonical `staging` without it abandons live Execution Runs on Gateway boot
reconcile and treats `ABANDONED` as terminal — reproduced on this lane's own run during
Phase A. Installing a pre-#487 Gateway on the mini means the first restart kills whatever is
running. Verify with:

```bash
git -C "$ALLOY_REPO" fetch -q origin && \
  git -C "$ALLOY_REPO" log --oneline origin/staging | grep -q "make ABANDONED recoverable" \
  && echo "GATEWAY DURABILITY FIX PRESENT" || echo "STOP — do not install the Gateway yet"
```

---

## 1. Machine bootstrap

🔑 **OPERATOR — first boot.** macOS setup, the operator account, FileVault, and network. Set
the node's operator-readable name; it becomes the Vacilando node name and appears in every
notification:

```bash
sudo scutil --set ComputerName  "Alloy Mac mini"
sudo scutil --set LocalHostName "alloy-mini"
```

🔑 **OPERATOR — install the toolchain.** `vacilando-node-bootstrap.sh` *verifies* these and
warns; it does **not** install them. Do this by hand first:

```bash
# Homebrew (interactive sudo), then:
brew install node git gh tmux
brew install --cask docker tailscale
# Claude Code per its own installer
```

Node must be **20 or newer** — the bootstrap script hard-fails below that.

🤖 **AUTO — node bootstrap.** What the script actually does: hard-fails on missing
git/node/tmux or Node < 20, writes `~/.config/alloy-dev/config`, installs canonical `web`
dependencies, installs the local-dev toolkit, warns on missing Docker/Tailscale/Claude/gh,
mints the execution-node identity, ensures the permanent Vacilando lane, and installs the
Gateway launchd job from the versioned toolkit installation:

```bash
bash "$ALLOY_REPO/scripts/local-dev/vacilando-node-bootstrap.sh"
```

It refuses to install the Gateway from any path under `alloy-worktrees/`.

✅ **CERTIFY — bootstrap floor.** Every line must pass before continuing:

```bash
sw_vers -productVersion                       # macOS
scutil --get ComputerName                     # operator-readable node name
brew --version
node --version                                # must be >= 20
git --version && gh --version && tmux -V
claude --version
docker info >/dev/null && echo "docker ok"
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```

⚠️ **The canonical checkout is not automatically current.** On the MacBook it sat 512 commits
behind `origin/staging` with staged uncommitted work. Being in the right repository is not
being on the right base:

```bash
git -C "$ALLOY_REPO" fetch origin
git -C "$ALLOY_REPO" status --short          # expect empty
git -C "$ALLOY_REPO" rev-list --count HEAD..origin/staging   # expect 0
```

🤖 **AUTO — toolkit, from canonical only.** Never install the toolkit or the Gateway from a
sprint worktree. `alloy-toolkit` reads the git object store, so it does not depend on the
working tree being current:

```bash
alloy-toolkit install origin/staging
alloy-toolkit verify      # asserts nothing resolves through a worktree
alloy-toolkit status
```

🤖 **AUTO — Gateway, from the versioned toolkit installation.** Pin the Node binary explicitly
so the launchd job does not capture whatever `node` a login shell happened to resolve:

```bash
NODE_BIN="$(command -v node)" \
  "$HOME/.local/share/alloy/toolkit/current/install-vacilando-gateway.sh"
```

✅ **CERTIFY — installation provenance.** `WorkingDirectory` must resolve to the toolkit
installation, never to `…/alloy-worktrees/…`:

```bash
/usr/libexec/PlistBuddy -c 'Print :WorkingDirectory' \
  ~/Library/LaunchAgents/com.alloy.vacilando-gateway.plist
/usr/libexec/PlistBuddy -c 'Print :ProgramArguments' \
  ~/Library/LaunchAgents/com.alloy.vacilando-gateway.plist
```

---

## 2. Secrets placement

**A Vacilando backup is not a machine image.** It carries lanes, runs and node identity, and
carries no credentials by design. Everything in this section is 🔑 **OPERATOR** work. Do not
automate it, and do not treat it as a defect when it is required.

Place by hand:

| Item | Where | Note |
|---|---|---|
| `web/.env.local` | canonical checkout only | Privileged values. **Never** into a worktree. |
| Gateway API token | minted at first Gateway start | No action unless preserving the existing token. |
| `web-push.json` | `~/.local/state/alloy-dev/gateway/vacilando/` | Keep the existing VAPID keypair — regenerating it silently invalidates every existing iPhone subscription. |
| Trusted-host secrets | `…/vacilando/trusted-secrets/` | Only if the mini runs staging certification. |
| Provider auth | interactive | `claude` login on the node. |
| GitHub auth | interactive | `gh auth login`. |
| Tailscale auth | interactive | Sign in to the tailnet. |
| Database credentials | trusted host only | Only where the trusted host legitimately owns them. |

**Do not broaden credential access to Development Lanes.** Lanes get the agent-safe
`web/.env.local.agent`; privileged values reach the app through trusted-server injection and
never enter a worktree.

✅ **CERTIFY — fail-closed preflight.** Prints presence, key names and exit statuses only; it
never prints a secret value, so its output is safe to paste anywhere:

```bash
node "$ALLOY_REPO/scripts/local-dev/vacilando-secret-preflight.mjs"        # exit 0 required
node "$ALLOY_REPO/scripts/local-dev/vacilando-secret-preflight.mjs" --json # for evidence
```

Exit 1 means at least one required item is missing; each failure names its remedy. Optional
items warn and never fail the run.

---

## 3. Durable-state restore

🤖 **AUTO — on the MacBook, take the backup.**

```bash
node -e '
const {backupDurableState, verifyBackup} = await import("./lib/vacilando/durable-state.mjs");
const b = backupDurableState({});
console.log(b.ok, b.backupPath);
console.log(JSON.stringify(verifyBackup(b.backupPath)));
' --input-type=module
```

🔑 **OPERATOR.** Move the backup to the mini (it is durable state — treat it as sensitive).

⛔ **APPROVAL — restore onto the mini.** Restoring writes the mini's durable store and mints a
new node identity. Get explicit approval before running it against a non-empty runtime root.

```bash
node -e '
const {restoreDurableState, laneIdentitySnapshot, assertLaneIdentitiesPreserved} =
  await import("./lib/vacilando/durable-state.mjs");
const r = restoreDurableState({ backupPath: process.env.BAK, destRoot: process.env.DEST });
console.log(r.ok, r.node_id, "bindings invalidated:", r.bindings);
' --input-type=module
```

✅ **CERTIFY — restore.** Rehearsed non-destructively on the MacBook (`git_mutated:false`,
`worktree_mutated:false`, `live_gateway_written:false`). On the mini, all of these must hold:

* permanent lane IDs unchanged — `assertLaneIdentitiesPreserved` → `{ok:true, missing:[], renamed:[]}`
* lane names unchanged (7 lanes as of freeze)
* Execution Run history preserved
* Agent Session history preserved where durable
* MacBook host bindings now **stale**, not deleted
* mini node identity **differs** from MacBook `node_4e96a4a65bbc`
* no lane recreated merely because its host changed

**Expected, not a defect:** immediately after restore, `/api/v2/lanes` shows lanes as unbound.
That view composes host bindings (tmux, worktree, git); durable identity is unaffected. Lanes
repopulate as section 4 rebinds them.

---

## 4. Execution rebinding

**Never equate "new worktree" with "new Development Lane."** The lane is durable and keeps its
ID; only its execution binding moves. Do not copy worktree directories blindly — prefer
creating a fresh worktree from durable Git state, and preserve dirty or unpublished work
deliberately where it exists.

🤖 **AUTO — classify every lane before moving anything:**

```bash
for wt in "$HOME/Code/alloy-worktrees"/*; do
  [ -d "$wt/.git" ] || [ -f "$wt/.git" ] || continue
  printf '%s\n' "$(basename "$wt")"
  git -C "$wt" status --porcelain | wc -l                       # dirty files
  git -C "$wt" log --oneline @{u}..HEAD 2>/dev/null | wc -l     # unpushed commits
done
```

Classification at freeze time:

| Lane | Binding | Dirty | Unpushed | Class |
|---|---|---|---|---|
| Access & Identity | `wt1-access-identity-v2` | 0 | 0 | **Clean rebind** — recreate from Git |
| Communications | `wt3-communications-inbound-sms` | 0 | 0 | **Clean rebind** — recreate from Git |
| Vacilando | `wt1-vacilando-mac-mini-readiness` | 0 | 0 (pushed as PR #487) | **Clean rebind** — recreate from Git |
| Runtime Performance | `wt5-runtime-performance-ux-completion` | 0 | **7** | ⛔ **Publish or transfer first** |
| Trust Runtime | `wt4-enrollment-phase2-participant-anchor` | 0 | **1** | ⛔ **Publish or transfer first** |
| Processing | none | — | — | Nothing to rebind |
| Lifecycle Cert | none | — | — | Nothing to rebind |

⛔ **APPROVAL — lanes with unpushed commits.** A lane carrying unpublished commits is **not**
safely reconstructable from Git. Either push its branch, or move the worktree deliberately.
Recreating its worktree from `origin` first would destroy that work silently.

🚨 **Separately: the `wt5-vacilando-gateway-v2` worktree is not a lane binding, but it holds
~1,625 lines of Gateway code committed nowhere** — it is what the MacBook Gateway ran before
Phase A. Preserved at `~/.local/state/alloy-dev/gateway/backups/phase-a-preserved/`. It must
be resolved before that worktree is deleted or the MacBook is wiped.

🤖 **AUTO — rebind a clean lane** with `alloy-sprint-start` against canonical, then bind the
existing lane ID. The lane keeps its identity, history and name; only the binding is new.

---

## 5. Service certification

Certify on the physical mini. **Do not infer success from process existence.** A live PID is
not proof.

| # | Check | Proof required |
|---|---|---|
| 1 | Gateway launchd startup | `launchctl list \| grep vacilando` **and** `/api/health` → `ok:true, hydrated:true` |
| 2 | Gateway restart | `launchctl kickstart -k`, then health returns and durable lane count is unchanged |
| 3 | Canonical WorkingDirectory | PlistBuddy shows the toolkit path, not a worktree |
| 4 | Captured Node binary | `ProgramArguments[0]` is the intended Node ≥ 20 |
| 5 | Tailscale connectivity | mini appears in `tailscale status` from another device |
| 6 | Tailscale HTTPS Serve | `curl -o /dev/null -w '%{http_code}' https://<mini>.<tailnet>.ts.net/api/health` → `200` |
| 7 | Desktop access | Gateway UI loads in a browser and lists the restored lanes |
| 8 | **Physical iPhone PWA** | Open on the actual phone, not a desktop viewport |
| 9 | Notification subscription | Subscription registered against the mini's VAPID key |
| 10 | **Notification delivery** | A notification **arrives on the phone** — delivery, not dispatch |
| 11 | Claude authentication | A real Claude turn completes in a lane |
| 12 | tmux persistence | Session survives detach, and survives a Gateway restart |
| 13 | GitHub authentication | `gh auth status` clean; a real fetch against the repo succeeds |
| 14 | Trusted-host governed actions | One governed action executes end to end and is recorded |
| 15 | Docker | `docker info` clean |
| 16 | `alloy-stack` | `alloy-stack use` takes a lease; `alloy-stack status` shows it |
| 17 | Alloy dev server | `alloy-dev-start` serves the assigned port and answers a request |
| 18 | Worktree creation | `alloy-sprint-start` produces a worktree on the mini's disk |
| 19 | Resource governor | A validation lease is acquired **and released** |

⛔ **APPROVAL — `alloy-stack`.** One shared local Supabase stack per machine. Never run
`supabase start`. Never `alloy-certify reset` — it destroys the shared cert stack.

---

## 6. Execution proof, cutover, capacity

Phases C, D and E run only after section 5 is green. Summarised here so the runbook is
self-contained:

* **Proof 1 — Vacilando lane.** A bounded unit of work through the permanent Vacilando lane on
  the mini: lane → mini binding → agent session → tmux/worktree → run → validation → COMPLETE,
  with no manual terminal intervention for routine mechanics.
* **Proof 2 — one Alloy product lane.** A real approved unit of product work on a lane that
  does not need machine-exclusive timing. **Not** Runtime timing certification. Prove lane
  identity unchanged, source isolation, resource acquire/release, validation, completion
  notification reaching the operator, coherent Git posture, and that the MacBook was not needed.
* **Proof 3 — controlled concurrency.** Two independent lanes at once: admission works,
  contention behaves, one lane cannot corrupt another, notifications stay attributable, the
  Gateway stays responsive, recovery stays bounded. Functional proof, not capacity.
* ⛔ **APPROVAL — Phase D cutover.** Mark the mini primary only on an explicit GO. Do not
  delete or invalidate the MacBook node; it becomes fallback and operator capacity.
* **Phase E — capacity.** Empirical measurement of representative *combinations* (2 agents +
  tests; 3 agents + dev server; agents + Docker + suite; build during other lanes; browser
  certification during ordinary work; Runtime timing with everything else drained). Record
  conservative limits as Node/runtime policy using existing governor concepts. The goal is
  maximum useful parallelism, not maximum process count. Runtime timing may stay
  machine-exclusive even with spare CPU.

---

## Rollback

Phase A's rollback is preserved and is one command:

```bash
~/.local/state/alloy-dev/gateway/backups/phase-a-preserved/rollback-gateway.sh
```

The mini's equivalent is to keep the MacBook node intact until GO is declared. Because lane
identity is machine-independent and host bindings go stale rather than corrupting, rebinding
lanes back to the MacBook is a supported operation, not a recovery hack.
