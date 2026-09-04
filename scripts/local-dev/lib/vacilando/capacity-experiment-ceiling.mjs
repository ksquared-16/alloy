/**
 * THE NARROWEST POSSIBLE WAY TO MOVE ONE CAPACITY NUMBER.
 *
 * The provider experiment needed to change exactly one line of host config and
 * change it back. The only tools available for that were general-purpose file
 * mutation, and a general file-writing capability is not something a
 * measurement lane should hold — it can reach every other setting on the
 * machine, and nothing about it records why the number moved or what it should
 * return to.
 *
 * So this is the opposite of a general capability. It can write ONE key, in ONE
 * file, within ONE range, only when the current value is what the caller
 * expected, and only while naming the value it must be restored to. Everything
 * else it refuses.
 *
 * WHY COMPARE-AND-SET. An experiment that has lost track of the current ceiling
 * is exactly the one that must not write. A blind write is how an interrupted
 * run leaves 10 behind while its report says 4, and the whole reason this
 * module exists is that a previous run could not prove which value was live.
 *
 * WHY A RANGE. The bound is not decoration: the authorised experimental window
 * is 4 to 8, so 12 is refused even if someone believes in it. Raising the
 * production ceiling beyond the tested range is a policy decision, and policy
 * decisions do not belong in an experiment's tooling.
 *
 * The rollback value is REQUIRED rather than optional, because the failure this
 * guards against is not a bad write — it is a good write nobody undid.
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const EXPERIMENT_CEILING_SCHEMA = "vacilando.capacity_experiment_ceiling.v1";

/** The ONLY key this capability may write. Not a parameter — a constant. */
export const MANAGED_KEY = "ALLOY_MAX_ACTIVE_PROVIDERS";

/** The authorised experimental window. Outside it, this refuses. */
export const MIN_CEILING = 4;
export const MAX_CEILING = 8;

const CONFIG_PATH = () => process.env.ALLOY_DEV_CONFIG
  || join(homedir(), ".config", "alloy-dev", "config");

const AUDIT_PATH = () => join(
  process.env.VACILANDO_GATEWAY_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway"),
  "vacilando", "capacity-experiment", "ceiling-changes.jsonl",
);

const LINE_RE = new RegExp(`^${MANAGED_KEY}="?(\\d+)"?\\s*$`, "m");

/** The value the config file currently holds, or null when absent/unreadable. */
export function readCeiling({ configPath = CONFIG_PATH() } = {}) {
  let text = "";
  try { text = readFileSync(configPath, "utf8"); } catch { return null; }
  const m = text.match(LINE_RE);
  return m ? Number(m[1]) : null;
}

function audit(record) {
  try {
    const p = AUDIT_PATH();
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, `${JSON.stringify(record)}\n`);
  } catch { /* an unwritable audit must not silently become a skipped guard */ }
}

/**
 * Set the experimental provider ceiling.
 *
 * Refuses, in this order, and each refusal is named rather than merged into a
 * generic failure — a caller that cannot tell "out of range" from "someone else
 * changed it underneath me" will retry the wrong one.
 */
export function setExperimentalProviderCeiling({
  expected,
  requested,
  rollbackTo,
  reason = null,
  experimentId = null,
  actor = "capacity-experiment",
  configPath = CONFIG_PATH(),
  nowMs = Date.now(),
} = {}) {
  const fail = (code, detail) => {
    const rec = { at: new Date(nowMs).toISOString(), ok: false, code, detail, expected, requested, actor, experiment_id: experimentId };
    audit(rec);
    return { ok: false, error: code, detail, ...rec };
  };

  if (!Number.isInteger(requested)) return fail("requested_not_integer", `requested=${JSON.stringify(requested)}`);
  if (requested < MIN_CEILING || requested > MAX_CEILING) {
    return fail("outside_experimental_range",
      `requested ${requested} is outside the authorised window ${MIN_CEILING}-${MAX_CEILING}; raising beyond the tested range is a policy decision, not an experiment`);
  }
  if (!Number.isInteger(rollbackTo) || rollbackTo < MIN_CEILING || rollbackTo > MAX_CEILING) {
    return fail("rollback_required",
      "a rollback ceiling inside the authorised window is required: the failure this guards against is a good write nobody undid");
  }

  const current = readCeiling({ configPath });
  if (current == null) return fail("key_absent", `${MANAGED_KEY} not found in ${configPath}`);
  if (!Number.isInteger(expected)) return fail("expected_required", "compare-and-set needs the value the caller believes is live");
  if (current !== expected) {
    return fail("unexpected_current_value",
      `config holds ${current} but the caller expected ${expected}; something else moved it, so this write is refused`);
  }

  let text;
  try { text = readFileSync(configPath, "utf8"); } catch (e) { return fail("config_unreadable", e.message); }

  // Exactly one line may change. The replacement is anchored to the managed key
  // and the count is asserted, so a malformed config cannot turn one intended
  // edit into several.
  const before = text;
  const replaced = text.replace(LINE_RE, `${MANAGED_KEY}="${requested}"`);
  if (replaced === before) return fail("no_line_replaced", "the managed key line did not match for replacement");
  const changedLines = before.split("\n").filter((l, i) => l !== replaced.split("\n")[i]).length;
  if (changedLines !== 1) return fail("multiple_lines_changed", `${changedLines} lines would change; only the managed key may move`);

  try {
    const tmp = `${configPath}.tmp.${process.pid}`;
    writeFileSync(tmp, replaced);
    renameSync(tmp, configPath);
  } catch (e) { return fail("write_failed", e.message); }

  // Read back rather than trust the write. A previous run could not prove which
  // ceiling was live, and that uncertainty is the thing being engineered away.
  const after = readCeiling({ configPath });
  if (after !== requested) {
    return fail("verify_failed", `wrote ${requested} but config reads back ${after}`);
  }

  const rec = {
    at: new Date(nowMs).toISOString(), ok: true, key: MANAGED_KEY,
    from: current, to: requested, rollback_to: rollbackTo,
    reason, experiment_id: experimentId, actor, config_path: configPath,
  };
  audit(rec);
  return { ok: true, ...rec };
}
