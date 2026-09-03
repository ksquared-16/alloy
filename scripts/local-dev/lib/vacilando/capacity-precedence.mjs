/**
 * WHICH NUMBER IS IN FORCE, AND WHO SAID SO.
 *
 * capacity-policy.mjs derives what this host COULD safely offer from measured
 * hardware. This module answers the different question of what is actually
 * ENFORCED right now, and it exists because four call sites answered it four
 * ways and none of them honoured the documented override.
 *
 * WHAT WAS BROKEN.
 *
 *   lib/sprint-ops.sh          `${ALLOY_MAX_RUNNING_SERVERS:-3}`, evaluated
 *                              AFTER alloy_load_config has already sourced both
 *                              alloy-config.example and ~/.config/alloy-dev/
 *                              config, each of which assigns the name
 *                              unconditionally. An exported override was
 *                              overwritten before the `:-` could ever see it, so
 *                              the documented way to raise a ceiling for an
 *                              experiment silently did nothing. alloy_load_config
 *                              already knows this hazard — it rescues
 *                              ALLOY_RUNTIME_ROOT and ALLOY_FIRST_AGENT_PORT
 *                              across the same sourcing, with a comment saying
 *                              the example "otherwise hard-assigns the production
 *                              default". The capacity ceilings were never given
 *                              that treatment.
 *   commands/registry.mjs      regex-scraped the config file and ignored the
 *                              environment entirely
 *   provider-capacity.mjs      read process.env only and ignored the config file
 *                              — inside the Gateway, which never sources that
 *                              config, the host's configured provider ceiling
 *                              was invisible and it always returned the default
 *   capacity-policy.mjs        derived its own ceilings from hardware that
 *                              nothing compared against the enforced ones
 *
 * All four returned 3 on this host, which is why nobody noticed: the numbers
 * agreed by coincidence while the reasoning did not. The first experiment that
 * tried to move one moved nothing, and read the refusal as a real limit.
 *
 * PRECEDENCE, stated once and implemented once. Later tiers win:
 *
 *   1. canonical derived capacity   what the measured host can safely offer
 *   2. local host config            what the operator has chosen for this host
 *   3. explicit scoped override     one experiment, one process, with a reason
 *
 * A bare ALLOY_MAX_* export deliberately does NOT win. Making it win would turn
 * every inherited environment into a silent production ceiling change — worse
 * than an override that does nothing, because it would be invisible rather than
 * merely ineffective. An override must be deliberate, named, bounded and
 * explained. The reason is required because ceilings get moved during
 * experiments and incidents, which is exactly when nobody remembers afterwards.
 *
 * Nothing here writes anything. An override lives in the environment of a single
 * process and cannot outlive it or leak into a later session.
 */
import { existsSync, readFileSync } from "node:fs";
import { managedSlotCount } from "./managed-slots.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The enforced ceilings, their built-in defaults, their hard bounds, and the
 * derived axis each one corresponds to.
 *
 * An override may move a ceiling, never remove it. Servers and providers are
 * bounded by the six managed slots; there is no seventh place to put one.
 */
export const CAPACITY_LIMITS = Object.freeze({
  // `max` is the FALLBACK bound. The live bound for the two slot-shaped
  // ceilings comes from managed-slots, so an override can never ask for a
  // server or a provider that has no slot to live in — at any topology.
  ALLOY_MAX_RUNNING_SERVERS: { default: 3, max: 6, axis: "dev_server_capacity", bounded_by_slots: true },
  ALLOY_MAX_ACTIVE_PROVIDERS: { default: 3, max: 6, axis: "provider_capacity", bounded_by_slots: true },
  ALLOY_MAX_CONCURRENT_INSTALLS: { default: 1, max: 4, axis: null },
  ALLOY_MAX_CONCURRENT_HEAVY_JOBS: { default: 1, max: 4, axis: null },
});

export const CAPACITY_NAMES = Object.freeze(Object.keys(CAPACITY_LIMITS));

export const OVERRIDE_VAR = "ALLOY_CAPACITY_OVERRIDE";
export const OVERRIDE_REASON_VAR = "ALLOY_CAPACITY_OVERRIDE_REASON";

function hostConfigPath(env) {
  return env.ALLOY_CONFIG_FILE || join(homedir(), ".config", "alloy-dev", "config");
}

/** What the host config assigns, or null when it says nothing about this name. */
export function hostConfigValue(name, env = process.env) {
  try {
    const p = hostConfigPath(env);
    if (!existsSync(p)) return null;
    const m = readFileSync(p, "utf8").match(new RegExp(`^[ \\t]*${name}=["']?(\\d+)`, "m"));
    return m ? Number(m[1]) : null;
  } catch {
    // A config we cannot read is not a licence to invent a bigger number.
    return null;
  }
}

/**
 * Parse the scoped override.
 *
 * Every refusal is reported rather than thrown. A malformed override must not
 * raise a ceiling and must not take the host down either — the safe direction is
 * always the value that was already in force.
 */
export function parseCapacityOverride(env = process.env) {
  const spec = String(env[OVERRIDE_VAR] || "").trim();
  const reason = String(env[OVERRIDE_REASON_VAR] || "").trim();
  const applied = {};
  const refusals = [];
  if (!spec) return { active: false, applied, refusals, reason: null };
  if (!reason) {
    refusals.push({ entry: spec, error: "reason_required" });
    return { active: false, applied, refusals, reason: null };
  }
  for (const raw of spec.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const eq = entry.indexOf("=");
    if (eq < 0) { refusals.push({ entry, error: "expected_name_equals_value" }); continue; }
    const name = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    const limit = CAPACITY_LIMITS[name];
    if (!limit) { refusals.push({ entry, error: "not_a_capacity_name" }); continue; }
    if (!/^\d+$/.test(value)) { refusals.push({ entry, error: "not_a_positive_integer" }); continue; }
    const n = Number(value);
    if (n < 1) { refusals.push({ entry, error: "not_a_positive_integer" }); continue; }
    const hardMax = limit.bounded_by_slots ? managedSlotCount(env) : limit.max;
    if (n > hardMax) { refusals.push({ entry, error: "above_hard_ceiling", max: hardMax }); continue; }
    applied[name] = n;
  }
  return { active: Object.keys(applied).length > 0, applied, refusals, reason };
}

/** The derived ceiling for a name, when a computed policy is available. */
export function derivedCeiling(name, policy = null) {
  const axis = CAPACITY_LIMITS[name]?.axis;
  if (!axis || !policy) return null;
  const n = Number(policy?.axes?.[axis]?.ceiling);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * One ceiling, with the reason it is that number and what every other tier said.
 *
 * `derived` is optional: most callers do not have a computed capacity policy in
 * hand, and its absence must not change what is enforced — the config and the
 * override are the enforcing tiers today. Passing it makes the answer explain
 * itself, and lets health notice a divergence.
 */
export function resolveCapacity(name, { env = process.env, derived = null } = {}) {
  const limit = CAPACITY_LIMITS[name];
  if (!limit) return { name, value: null, source: "unknown_capacity_name" };

  const derivedValue = derivedCeiling(name, derived);
  const configured = hostConfigValue(name, env);
  const override = parseCapacityOverride(env);

  const tiers = {
    derived: derivedValue,
    host_config: configured != null && configured >= 1 ? configured : null,
    override: Object.hasOwn(override.applied, name) ? override.applied[name] : null,
  };

  let value;
  let source;
  if (tiers.override != null) { value = tiers.override; source = "override"; }
  else if (tiers.host_config != null) { value = tiers.host_config; source = "host-config"; }
  else if (tiers.derived != null) { value = tiers.derived; source = "derived"; }
  else { value = limit.default; source = "default"; }

  return {
    name,
    value,
    source,
    tiers,
    reason: source === "override" ? override.reason : null,
    // The host could safely offer more than is enforced. Reported, never acted
    // on: converging the enforced ceiling onto the derived one is a deliberate
    // capacity-policy decision, not a side effect of reading a number.
    derived_exceeds_enforced: derivedValue != null && derivedValue > value ? derivedValue : null,
  };
}

/** Just the number, for call sites that only need the ceiling. */
export function capacityValue(name, env = process.env) {
  return resolveCapacity(name, { env }).value;
}

/**
 * The whole picture, for health.
 *
 * An active override is a fact about the host that an operator must be able to
 * see without reading anyone's environment — otherwise the next person to look
 * at a capacity number has no way to know it was moved, or why.
 */
export function capacityStatus({ env = process.env, derived = null } = {}) {
  const override = parseCapacityOverride(env);
  const limits = {};
  for (const name of CAPACITY_NAMES) limits[name] = resolveCapacity(name, { env, derived });
  return {
    limits,
    override_active: override.active,
    override_reason: override.reason,
    override_applied: override.applied,
    override_refused: override.refusals,
    derived_exceeds_enforced: Object.fromEntries(
      Object.entries(limits)
        .filter(([, r]) => r.derived_exceeds_enforced != null)
        .map(([k, r]) => [k, { enforced: r.value, derived: r.derived_exceeds_enforced }]),
    ),
  };
}
