/**
 * Who is serving this lane's port — the Node-side reader of the ONE primitive.
 *
 * THE RULE THIS EXISTS TO KEEP. Listener discovery has exactly one
 * implementation, `alloy_rc_port_owner` in lib/read-core.sh. This module shells
 * out to it. It does NOT parse `lsof` itself, and nothing downstream — the
 * capacity cohort least of all — may either. A second discovery path is how the
 * toolkit ended up with a hardened resolver in common.sh and an unhardened one
 * in read-core.sh, reporting a port that was serving HTTP 200 as free.
 *
 * THREE STATES, AND UNKNOWN IS NOT FREE. `owned` carries a PID actually read
 * from the probe; `free` means the probe ran and found nothing; `unknown` means
 * the probe could not run. A capacity sample taken while ownership is unknown is
 * not a sample of anything, so it is reported `attributable: false` and the
 * cohort invalidates on it rather than counting a server it could not see.
 */
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const OWNERSHIP_SCHEMA = "vacilando.dev_server_ownership.v1";

/** Explicit outcomes. Semantics, not vibes. */
export const OWNERSHIP_STATES = Object.freeze({
  OWNED_RUNNING: "owned_running",
  FOREIGN_PORT_OWNER: "foreign_port_owner",
  UNMANAGED_LISTENER: "unmanaged_listener",
  UNATTRIBUTABLE: "unattributable_listener",
  STOPPED: "stopped",
});

const LOCAL_DEV_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sh(script, { timeout = 10_000 } = {}) {
  try {
    return String(execFileSync("/bin/bash", ["-c", script], {
      encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"],
    })).trim();
  } catch {
    return null;
  }
}

/**
 * `owned <pid>` | `free` | `unknown`, straight from the shared read core.
 *
 * A failure to invoke the shell is itself `unknown` — never `free`. That is the
 * whole point: the caller must not be able to mistake "I did not manage to ask"
 * for "nothing is there".
 */
export function portOwner(port, { localDevRoot = LOCAL_DEV_ROOT } = {}) {
  const n = Number(port);
  if (!Number.isInteger(n) || n <= 0) return { state: "unknown", pid: null, raw: null };
  const out = sh(
    `ALLOY_LOCAL_DEV_ROOT=${JSON.stringify(localDevRoot)}; ` +
    `source ${JSON.stringify(join(localDevRoot, "lib", "read-core.sh"))}; ` +
    `alloy_rc_port_owner ${n}`,
  );
  if (out === "free") return { state: "free", pid: null, raw: out };
  const m = /^owned\s+(\d+)$/.exec(out || "");
  if (m) return { state: "owned", pid: Number(m[1]), raw: out };
  return { state: "unknown", pid: null, raw: out };
}

/** What kind of process is this, and where does it live? Facts only. */
export function describeListener(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return null;
  const command = sh(`/bin/ps -o command= -p ${n}`) || null;
  const cwd = sh(
    `L=$(command -v lsof || echo /usr/sbin/lsof); ` +
    `"$L" -a -p ${n} -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}'`,
  ) || null;
  const isDevServer = /next-server|next dev|npm run dev/.test(command || "");
  return { pid: n, command, cwd, is_dev_server: isDevServer };
}

/** The worktree a path sits inside, given the worktrees root. Never a guess. */
export function worktreeOfPath(path, worktreesRoot) {
  if (!path || !worktreesRoot) return null;
  const root = resolve(worktreesRoot);
  const p = resolve(path);
  if (p !== root && !p.startsWith(root + sep)) return null;
  const rest = p.slice(root.length + 1);
  const name = rest.split(sep)[0];
  return name || null;
}

/**
 * Observe one expected cohort member.
 *
 * Returns the shape `assessSample` consumes, plus the classification. The
 * `attributable` flag is the load-bearing one: false whenever the probe could
 * not answer, so an unreadable host invalidates a window instead of silently
 * shrinking it.
 */
export function observeMember({ port, worktree = null, worktreesRoot = null, ready = true } = {}) {
  const owner = portOwner(port);
  if (owner.state === "unknown") {
    return {
      port: Number(port), pid: null, attributable: false, ready: false,
      worktree: null, state: OWNERSHIP_STATES.UNATTRIBUTABLE,
    };
  }
  if (owner.state === "free") {
    return {
      port: Number(port), pid: null, attributable: true, ready: false,
      worktree: null, state: OWNERSHIP_STATES.STOPPED,
    };
  }
  const proc = describeListener(owner.pid) || {};
  const holder = worktreeOfPath(proc.cwd, worktreesRoot);
  let state = OWNERSHIP_STATES.UNMANAGED_LISTENER;
  if (holder && proc.is_dev_server) {
    state = !worktree || holder === worktree
      ? OWNERSHIP_STATES.OWNED_RUNNING
      : OWNERSHIP_STATES.FOREIGN_PORT_OWNER;
  }
  return {
    port: Number(port),
    pid: owner.pid,
    // A listener we cannot place in a worktree is not attributable, even though
    // we read its PID: knowing WHO holds the port is the attribution, not that
    // something does.
    attributable: Boolean(holder && proc.is_dev_server),
    ready: state === OWNERSHIP_STATES.OWNED_RUNNING ? ready !== false : false,
    worktree: holder,
    command: proc.command || null,
    cwd: proc.cwd || null,
    is_dev_server: Boolean(proc.is_dev_server),
    state,
  };
}

/**
 * Observe the whole managed port range, not only the expected members.
 *
 * Counting only expected ports is how an extra server hides: the level stops
 * being "N servers" and nobody notices. Every managed port is read, so a
 * listener outside the cohort surfaces as a foreign entry the cohort rejects.
 */
export function observeManagedPorts({ ports = [], expectedByPort = {}, worktreesRoot = null } = {}) {
  return ports.map((port) => observeMember({
    port,
    worktree: expectedByPort[port] || null,
    worktreesRoot,
  }));
}
