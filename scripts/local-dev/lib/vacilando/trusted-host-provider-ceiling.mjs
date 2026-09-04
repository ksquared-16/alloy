/**
 * THE GOVERNED ROUTE FOR ONE CAPACITY NUMBER.
 *
 * Capacity V2 spent several runs unable to change a single provider setting,
 * and every diagnosis of that came back the same: the permission boundary was
 * right to refuse. What it was being asked to allow was "write to a host config
 * file", which is indistinguishable from writing anything else in that file —
 * or any other file — and no amount of good intent in the caller changes what
 * the capability actually grants.
 *
 * The fix is not a broader permission. It is a NARROWER EFFECT that can be
 * named. This action authorises exactly one thing: move
 * ALLOY_MAX_ACTIVE_PROVIDERS, within the experimental range, from a value the
 * caller correctly predicted, while naming what it must be restored to. That is
 * a sentence a governance system can approve or refuse on its merits. "Edit a
 * file" is not.
 *
 * It deliberately does NOT implement the write. It invokes the canonical
 * `vac capacity set-provider-ceiling`, so the guards live in one place and this
 * layer cannot drift into a second, more permissive implementation of the same
 * operation.
 *
 * Direct edits to the same file should REMAIN refused after this exists. That
 * is the point: the governed route is not a loophole around the boundary, it is
 * the reason the boundary can stay closed.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The experimental window this action may move within. Not caller-supplied. */
export const CEILING_MIN = 4;
export const CEILING_MAX = 8;

/** The one key this action may touch, restated here so the schema is readable. */
export const MANAGED_KEY = "ALLOY_MAX_ACTIVE_PROVIDERS";

function asInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/**
 * Validate a governed request to move the provider ceiling.
 *
 * Every refusal is named. A caller that cannot tell "out of range" from
 * "someone else moved it" will retry the wrong one, and retrying a
 * compare-and-set failure blindly is how an experiment loses track of the
 * value it is supposed to be controlling.
 */
export function validateProviderCeilingInputs(inputs = {}) {
  const expected = asInt(inputs.expected_ceiling ?? inputs.expectedCeiling);
  const requested = asInt(inputs.requested_ceiling ?? inputs.requestedCeiling);
  const rollbackTo = asInt(inputs.rollback_ceiling ?? inputs.rollbackCeiling);
  const reason = String(inputs.reason ?? "").trim();
  const experimentId = String(inputs.experiment_id ?? inputs.experimentId ?? "").trim();

  if (expected == null) {
    return { ok: false, code: "expected_ceiling_required",
      detail: "compare-and-set needs the value the caller believes is live; a blind write is how an experiment loses the ceiling" };
  }
  if (requested == null) {
    return { ok: false, code: "requested_ceiling_required", detail: "requested_ceiling must be an integer" };
  }
  for (const [name, value] of [["requested_ceiling", requested], ["expected_ceiling", expected]]) {
    if (value < CEILING_MIN || value > CEILING_MAX) {
      return { ok: false, code: "outside_experimental_range",
        detail: `${name} ${value} is outside the authorised window ${CEILING_MIN}-${CEILING_MAX}; moving production beyond the tested range is a policy decision, not an experiment` };
    }
  }
  if (rollbackTo == null || rollbackTo < CEILING_MIN || rollbackTo > CEILING_MAX) {
    return { ok: false, code: "rollback_ceiling_required",
      detail: "a rollback ceiling inside the authorised window is required: the failure this guards against is a good write nobody undid" };
  }
  if (!reason) {
    return { ok: false, code: "reason_required",
      detail: "a capacity ceiling that moved without a recorded reason cannot be reviewed later" };
  }
  return {
    ok: true,
    normalized: {
      key: MANAGED_KEY,
      expected, requested, rollbackTo, reason,
      experimentId: experimentId || null,
      // Bound into the request so approval pins the exact transition, not just
      // "some ceiling change".
      dedupeKey: `provider_ceiling:${expected}->${requested}:${experimentId || reason.slice(0, 40)}`,
    },
  };
}

function installedVac() {
  const explicit = process.env.VACILANDO_INSTALLED_VAC;
  if (explicit && existsSync(explicit)) return explicit;
  const current = join(homedir(), ".local", "share", "alloy", "toolkit", "current", "vac");
  if (existsSync(current)) return current;
  return null;
}

/**
 * Execute the transition by invoking the canonical command.
 *
 * This layer adds authority, not behaviour. Every guard — the constant key, the
 * range, compare-and-set, readback verification, the audit line — belongs to
 * `vac capacity set-provider-ceiling`, and duplicating any of it here would
 * create a second implementation that could drift more permissive than the one
 * the tests cover.
 */
export function executeProviderCeiling(normalized, { vacPath = null, runner = null } = {}) {
  const bin = vacPath || installedVac();
  if (!bin) {
    return { ok: false, error: "installed_vac_not_found",
      detail: "the governed action invokes the canonical vac capacity command and could not locate it" };
  }
  const args = [
    "capacity", "set-provider-ceiling",
    "--expected", String(normalized.expected),
    "--to", String(normalized.requested),
    "--rollback-to", String(normalized.rollbackTo),
    "--reason", normalized.reason,
  ];
  if (normalized.experimentId) args.push("--experiment", normalized.experimentId);

  let raw = "";
  try {
    raw = String((runner || execFileSync)(bin, args, { encoding: "utf8", timeout: 30_000 }));
  } catch (e) {
    // The command prints its refusal as JSON and exits non-zero; that refusal
    // is the useful answer, not the exit code.
    raw = String(e?.stdout || "");
    if (!raw.trim()) {
      return { ok: false, error: "command_failed", detail: String(e?.message || "").slice(0, 300) };
    }
  }
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* fall through */ }
  if (!parsed) return { ok: false, error: "unparseable_result", detail: raw.slice(0, 300) };
  if (parsed.ok !== true) {
    return { ok: false, error: parsed.error || "refused", detail: parsed.detail || null, result: parsed };
  }
  return {
    ok: true,
    key: parsed.key,
    previous_value: parsed.from,
    new_value: parsed.to,
    rollback_value: parsed.rollback_to,
    readback_verified: parsed.to === normalized.requested,
    reason: parsed.reason ?? normalized.reason,
    experiment_id: parsed.experiment_id ?? normalized.experimentId,
    audited_at: parsed.at,
  };
}
