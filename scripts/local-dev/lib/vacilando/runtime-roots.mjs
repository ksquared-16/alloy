/**
 * THE ROOTS, TOLD APART.
 *
 * S3's first job was to find out what `ALLOY_RUNTIME_ROOT` actually means, and
 * the answer is not what its name says. Across 104 executable resolutions, every
 * single one falls back to `~/.local/state/alloy-dev` — a directory under the
 * OPERATOR'S HOME. It has never once meant "the Alloy checkout". It means
 * "where Vacilando keeps its own control-plane state", which is Vacilando's
 * concept wearing Alloy's name.
 *
 * That matters because a rename would have been the wrong repair twice over: it
 * would have preserved the real defect, which is that FIVE DIFFERENT ROOTS were
 * being resolved by hand, in 119 files, with nothing naming them apart.
 *
 *   STATE ROOT          where Vacilando keeps control-plane state.
 *                       ~/.local/state/alloy-dev. Not a repository.
 *   GATEWAY STATE ROOT  <state>/gateway. A REAL hazard: 83 callers resolve the
 *                       parent and 26 the child, from the same variable, and a
 *                       gate handed the wrong depth reads null rather than
 *                       failing — which has already happened here once.
 *   REPOSITORY ROOT     where a registered project's repository lives. The
 *                       registry owns it. prj_alloy and prj_vacilando resolve
 *                       different answers and neither is a default.
 *   EXECUTION CHECKOUT  the worktree a lane runs in. Lane + repository own it.
 *   RUNTIME SOURCE ROOT the Vacilando source tree THIS PROCESS is executing
 *                       from. Deliberately distinct from every root above: once
 *                       Vacilando develops Vacilando while operating Alloy, "the
 *                       project I am acting on" and "the source I am running"
 *                       are different questions with different answers.
 *   INSTALLED TOOLKIT   the immutable installed copy serving the Gateway. A
 *                       distribution concern, not a semantic one.
 *
 * NOTHING HERE GUESSES A REPOSITORY. Absence resolves to absence, and no
 * function in this module can return Alloy for a caller that did not name it.
 */
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { listRepositories, projectScope } from "./repository-registry.mjs";

/**
 * The canonical input for the state root.
 *
 * New code sets this. It names the concept honestly and carries no project's
 * name, because the state root belongs to no project.
 */
export const STATE_ROOT_INPUT = "VACILANDO_STATE_ROOT";

/**
 * The deprecated input, and exactly what has to be true before it is deleted.
 *
 * It is READ IN ONE PLACE — `stateRoot()`, below — and is compatibility only.
 * `development-runtime-roots` enumerates every remaining reader in the tree and
 * fails when a new one appears, so this cannot quietly spread again.
 *
 * DELETION CRITERIA, all three:
 *   1. every host that runs Vacilando exports VACILANDO_STATE_ROOT, or accepts
 *      the default, verified by a host census rather than assumed;
 *   2. no shell entry point under scripts/local-dev exports ALLOY_RUNTIME_ROOT
 *      into a child process;
 *   3. the enumerated reader list in the S3 suite is down to this module.
 * Assigned to S5 — after source extraction, when the shell layer moves.
 */
export const DEPRECATED_STATE_ROOT_INPUT = Object.freeze({
  name: "ALLOY_RUNTIME_ROOT",
  reason: "it names Alloy but has only ever meant Vacilando's own state directory",
  replaced_by: STATE_ROOT_INPUT,
  slice: "S5",
  deletion_criteria: Object.freeze([
    "every host exports VACILANDO_STATE_ROOT or accepts the default, by census",
    "no scripts/local-dev shell entry point exports ALLOY_RUNTIME_ROOT to a child",
    "the enumerated reader list is down to runtime-roots.mjs alone",
  ]),
});

/** The default state location. The `alloy-dev` spelling is branding debt, recorded and deferred. */
const DEFAULT_STATE_ROOT = () => join(homedir(), ".local", "state", "alloy-dev");

const clean = (v) => String(v || "").trim().replace(/\/+$/, "");

/**
 * The directory every owner here appends, and the one the probe looks for.
 *
 * NOT one of its children. The first version probed `vacilando/governed-actions`,
 * which is narrower than the invariant and wrong for the same reason the
 * incident was: a host whose Gateway root holds `vacilando/lanes` but has not
 * yet written a governed action resolved one level too deep.
 */
const GATEWAY_MARKER = "vacilando";

/** The value an operator (or the shipped config) supplied, canonical input first. */
function suppliedRoot() {
  return clean(process.env[STATE_ROOT_INPUT])
    || clean(process.env[DEPRECATED_STATE_ROOT_INPUT.name])
    || "";
}

/**
 * The Gateway's state root — resolved by PROBE, because the supplied value's
 * depth is not knowable from its text.
 *
 * THIS IS THE DEFECT S3 EXISTS TO END, and it has already cost a real outage.
 * One variable carries two incompatible meanings: 19 executable sites treat it
 * as the state root and append "gateway", and 19 treat it as the Gateway root
 * already. Both readings are defensible and neither is checkable, because the
 * shipped config sets it to the PARENT on some hosts and this host currently
 * runs it set to the CHILD — including in the live Gateway process.
 *
 * `trusted-host-merge` was bitten and defended itself alone: reading the parent
 * named a store file that did not exist, `existsSync` was false, and the parity
 * gate evaluated against ZERO census records for every merge, permanently. The
 * failure mode is the cruel one — not a crash, but `unknown`. PR #848 was denied
 * by it while a completed census sat in the store 42 minutes old.
 *
 * So the depth is MEASURED rather than assumed: whichever level actually holds
 * the store is the Gateway state root. One file having solved this privately is
 * what made it invisible to the other eighteen; the probe lives here now, and
 * `development-runtime-roots` fails if a new caller writes its own.
 */
export function gatewayStateRoot() {
  const supplied = suppliedRoot();
  if (!supplied) return join(DEFAULT_STATE_ROOT(), "gateway");
  /*
   * THE DEEPER CANDIDATE FIRST, and this host is why.
   *
   * `vacilando/` exists at BOTH depths here: ten entries under the parent and
   * sixty-three under the Gateway, and only the deeper one holds `lanes/`. A
   * probe that accepted the first match it found would take the shallow decoy
   * whenever the variable named the parent -- which is the shipped
   * configuration on some hosts, and is precisely the depth that reported
   * thirteen live lanes as zero.
   *
   * So the nested level is tested first and the supplied level second. Whichever
   * actually holds `vacilando/` is the Gateway state root; when neither does,
   * this is a fresh host and the first write lands where every later read looks.
   */
  const nested = join(supplied, "gateway");
  if (existsSync(join(nested, GATEWAY_MARKER))) return nested;
  if (existsSync(join(supplied, GATEWAY_MARKER))) return supplied;
  return nested;
}

/**
 * Where Vacilando keeps its control-plane state: the PARENT of the Gateway's.
 *
 * Derived from the probed Gateway root rather than read independently, so the
 * two can no longer disagree about one variable. Clearing both inputs resolves
 * the operator's own state directory — never a repository, and never Alloy's.
 */
export function stateRoot() {
  return dirname(gatewayStateRoot());
}

/**
 * Where a REGISTERED PROJECT's repository lives.
 *
 * The registry is the authority. A project that is not registered resolves
 * null — it does not fall through to Alloy, to the process's cwd, or to a
 * literal path in somebody's home directory.
 */
export function repositoryRootFor(repositoryId) {
  const scope = projectScope(repositoryId);
  return scope.known ? scope.root : null;
}

/**
 * The checkout a lane actually executes in.
 *
 * A lane states its worktree; that is the answer. Failing that, the lane's
 * repository answers with its own root. A lane belonging to no known repository
 * resolves null rather than the incumbent's checkout.
 */
export function executionCheckoutFor(lane) {
  if (!lane) return null;
  const stated = clean(lane.worktree_path || lane.worktree || "");
  if (stated) return stated;
  return lane.repository_id ? repositoryRootFor(lane.repository_id) : null;
}

/**
 * The Vacilando source tree THIS PROCESS is executing from.
 *
 * Derived from this module's own location, not from cwd and not from any
 * project record: the answer must stay correct when Vacilando operates Alloy
 * from an installed toolkit, and when Vacilando develops Vacilando from a
 * checkout, in the same process on the same host.
 *
 * It is deliberately NOT "the Alloy repository". Today the source happens to
 * live inside Alloy; after extraction it will not, and nothing that asks this
 * question should have to change when that happens.
 */
export function runtimeSourceRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  // <root>/scripts/local-dev/lib/vacilando -> <root>
  return resolve(here, "..", "..", "..", "..");
}

/**
 * The installed toolkit currently serving the Gateway, or null when running
 * from source.
 *
 * A DISTRIBUTION concern. Its path contains Alloy's name today; that is
 * branding debt, recorded and deliberately not moved in this slice, and no
 * semantic decision anywhere may depend on the spelling.
 */
export function installedToolkitRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const marker = `${sep}.local${sep}share${sep}alloy${sep}toolkit${sep}`;
  if (!here.includes(marker)) return null;
  // <...>/toolkit/<sha>/lib/vacilando -> <...>/toolkit/<sha>
  return resolve(here, "..", "..");
}

/** Is this process executing an installed toolkit, or a source checkout? */
export function runtimeDistribution() {
  return installedToolkitRoot() ? "installed_toolkit" : "source_checkout";
}

/**
 * Paths a managed session is EXPECTED to read, derived rather than written down.
 *
 * This was four literals under `/Users/Kelly/...` — another operator's home
 * directory, in a security authority. On any host but that one the positive
 * authority matched NOTHING, which is worse than a wrong rule: a trust list
 * that silently covers nothing reads as if it covers everything it was meant to.
 *
 * Every entry now comes from a root this module owns, so the list is true on
 * whatever machine is running, and a registered project contributes its own
 * repository root instead of the incumbent's.
 */
export function instructedPathPrefixes({ repositoryIds = null } = {}) {
  const out = [];
  const add = (p) => { const c = clean(p); if (c && !out.includes(`${c}/`)) out.push(`${c}/`); };
  add(join(homedir(), ".local", "share", "alloy", "toolkit"));
  add(stateRoot());
  const ids = repositoryIds || knownRepositoryIds();
  for (const id of ids) {
    const scope = projectScope(id);
    if (!scope.known) continue;
    add(scope.root);
    if (scope.worktree_parent) add(scope.worktree_parent);
  }
  return Object.freeze(out);
}

/** Registered repository ids, or an empty list when the registry cannot be read. */
function knownRepositoryIds() {
  try {
    return listRepositories({ includeRetired: true }).map((r) => r.repository_id);
  } catch { return []; }
}
