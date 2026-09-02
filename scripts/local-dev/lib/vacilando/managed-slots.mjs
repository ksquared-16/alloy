/**
 * ONE OWNER FOR HOW MANY MANAGED SLOTS EXIST.
 *
 * THE DEFECT. The shell already treats the managed slot count as configuration:
 * ALLOY_MAX_AGENTS drives slot validation, agent enumeration and port loops, and
 * lib/common.sh derives every port as ALLOY_FIRST_AGENT_PORT + slot - 1. The JS
 * control plane does not. It re-encodes the same fact as the literal six, in ten
 * files and twenty-four places:
 *
 *   lane-worktree-lifecycle   MANAGED_SLOTS = [1,2,3,4,5,6]
 *   vacilando-server          freeSlots = [1,2,3,4,5,6], plus six `slot > 6`
 *                             bad_slot guards on separate routes
 *   scheduler                 its own [1,2,3,4,5,6]
 *   commands/registry         its own [1,2,3,4,5,6]
 *   alloy-dev-adapter         two `slot < 1 || slot > 6`
 *   lanes                     `slot < 1 || slot > 6`
 *   day-ops                   `slot >= 1 && slot <= 6`
 *   presentation/slot-mission-rail  `slot < 1 || slot > 6`
 *   capacity-policy           dev_server_slots: 6
 *   capacity-precedence       max: 6
 *
 * So the answer to "how many slots are there" is configuration on one side of
 * the process boundary and a constant on the other. Today they agree at six by
 * coincidence, which is exactly the shape of the capacity-override defect this
 * lane already fixed: four call sites, four implementations, all returning 3,
 * agreeing by accident while the reasoning did not.
 *
 * The practical consequence is that a bounded experiment cannot raise the pool.
 * Setting ALLOY_MAX_AGENTS=12 would move the shell and leave the control plane
 * insisting on six — a Gateway that will not allocate slot 7, a census that
 * skips it, a lane that cannot bind it, and a health view that cannot see it.
 * That is not a topology change; it is a split brain.
 *
 * CANONICAL OWNER: ALLOY_MAX_AGENTS, the value the shell already uses. This
 * module reads that same value rather than declaring a second one, so shell
 * truth and Gateway truth cannot diverge. There is no new registry, no new
 * config key, and nothing here is written anywhere.
 *
 * Ports stay derived, never stored: port = ALLOY_FIRST_AGENT_PORT + slot - 1.
 *
 * FAIL-SAFE. Every resolution failure lands on the production default of six.
 * A missing config, a malformed value, zero, a negative, a non-integer, or an
 * absurd value all resolve to six rather than to something unbounded — a
 * topology resolver that fails open would hand out slots the host has no ports,
 * registrations or memory for.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** What the fleet ships with, and where every failure lands. */
export const DEFAULT_MANAGED_SLOT_COUNT = 6;

/**
 * The absolute bound on any configured topology.
 *
 * Not a capacity judgement — capacity-policy decides what is SAFE to run. This
 * only stops a typo or a stray environment value from claiming a pool the port
 * range cannot express. Twelve slots from 3011 reach 3022, comfortably clear of
 * the canonical app port and of the 3911+ certification fixture range.
 */
export const MANAGED_SLOT_HARD_MAX = 24;

export const DEFAULT_FIRST_AGENT_PORT = 3011;

function configPath(env) {
  return env.ALLOY_CONFIG_FILE || join(homedir(), ".config", "alloy-dev", "config");
}

/** Read one numeric assignment from the host config the shell already reads. */
function configuredNumber(name, env) {
  try {
    const p = configPath(env);
    if (!existsSync(p)) return null;
    const m = readFileSync(p, "utf8").match(new RegExp(`^[ \\t]*${name}=["']?(\\d+)`, "m"));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve, and say WHY it is that number.
 *
 * The environment is honoured here — unlike the capacity ceilings, where an
 * ambient export must never move a production limit. Topology is different in
 * kind: it says which slots EXIST, it is what a bounded experiment legitimately
 * varies, and a wrong value fails closed onto six rather than over-committing
 * the host.
 */
export function resolveManagedSlotCount(env = process.env) {
  const raw = env.ALLOY_MAX_AGENTS ?? configuredNumber("ALLOY_MAX_AGENTS", env);
  const n = Number(raw);
  if (raw == null || raw === "" || !Number.isFinite(n)) {
    return { count: DEFAULT_MANAGED_SLOT_COUNT, source: raw == null ? "default" : "malformed_default" };
  }
  if (!Number.isInteger(n) || n < 1) {
    return { count: DEFAULT_MANAGED_SLOT_COUNT, source: "invalid_default" };
  }
  if (n > MANAGED_SLOT_HARD_MAX) {
    return { count: DEFAULT_MANAGED_SLOT_COUNT, source: "above_hard_max_default", requested: n, hard_max: MANAGED_SLOT_HARD_MAX };
  }
  return {
    count: n,
    source: env.ALLOY_MAX_AGENTS != null && env.ALLOY_MAX_AGENTS !== "" ? "environment" : "host-config",
  };
}

/** How many managed slots exist. */
export function managedSlotCount(env = process.env) {
  return resolveManagedSlotCount(env).count;
}

/** The managed slots themselves: [1..N]. Replaces every literal array. */
export function managedSlots(env = process.env) {
  const n = managedSlotCount(env);
  return Array.from({ length: n }, (_, i) => i + 1);
}

/** Replaces every `slot < 1 || slot > 6`. */
export function isManagedSlot(slot, env = process.env) {
  return Number.isInteger(slot) && slot >= 1 && slot <= managedSlotCount(env);
}

export function firstAgentPort(env = process.env) {
  const raw = env.ALLOY_FIRST_AGENT_PORT ?? configuredNumber("ALLOY_FIRST_AGENT_PORT", env);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_FIRST_AGENT_PORT;
}

/** The shell's rule, not a second one: FIRST + slot - 1. */
export function portForSlot(slot, env = process.env) {
  return isManagedSlot(slot, env) ? firstAgentPort(env) + slot - 1 : null;
}

export function slotForPort(port, env = process.env) {
  const slot = Number(port) - firstAgentPort(env) + 1;
  return isManagedSlot(slot, env) ? slot : null;
}

/**
 * SHRINKING TOPOLOGY MUST NOT ORPHAN ANYTHING.
 *
 * Reducing the slot count is not symmetric with raising it. A slot above the new
 * ceiling may still hold a registration, a port, a running server and a bound
 * lane, and simply narrowing the range would make all of that invisible to the
 * census — resources still consuming the host that nothing can see or reclaim.
 * That is precisely the stale-registration class of defect this lane has spent
 * the session removing, so this reports rather than truncates.
 */
export function assessTopologyChange({ from, to, occupiedSlots = [] } = {}) {
  const previous = Number(from) || DEFAULT_MANAGED_SLOT_COUNT;
  const next = Number(to) || DEFAULT_MANAGED_SLOT_COUNT;
  const stranded = [...new Set(occupiedSlots.map(Number).filter(Number.isInteger))]
    .filter((s) => s > next)
    .sort((a, b) => a - b);
  if (next >= previous) {
    return { ok: true, direction: next === previous ? "unchanged" : "grow", from: previous, to: next, stranded: [] };
  }
  if (stranded.length) {
    return {
      ok: false,
      direction: "shrink",
      error: "live_slots_above_new_ceiling",
      from: previous,
      to: next,
      stranded,
      detail: `slot${stranded.length > 1 ? "s" : ""} ${stranded.join(", ")} still hold${stranded.length > 1 ? '' : 's'} live ownership above a ceiling of ${next}; release or retire them first`,
    };
  }
  return { ok: true, direction: "shrink", from: previous, to: next, stranded: [] };
}

/** What health should say about topology. */
export function managedSlotTopology(env = process.env) {
  const r = resolveManagedSlotCount(env);
  const first = firstAgentPort(env);
  return {
    slot_count: r.count,
    source: r.source,
    slots: managedSlots(env),
    first_port: first,
    last_port: first + r.count - 1,
    hard_max: MANAGED_SLOT_HARD_MAX,
    ...(r.requested ? { requested: r.requested } : {}),
  };
}
