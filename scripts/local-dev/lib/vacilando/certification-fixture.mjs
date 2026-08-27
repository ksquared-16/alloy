/**
 * Trusted execution of a NAMED certification fixture.
 *
 * THE GAP THIS CLOSES. Privileged local-stack credentials deliberately never
 * enter a worktree, and the toolkit-owned dev server that does receive them
 * exposed no way to run anything. So a lane holding a correct, reversible
 * certification fixture could not execute it, and the only route left was the
 * Director opening a terminal and running the seed by hand — which is precisely
 * what Vacilando exists to remove.
 *
 * WHAT THIS IS NOT. It is not privileged execution with a friendlier name.
 * There is no arbitrary shell, no arbitrary SQL, no arbitrary seed file, no
 * credential forwarding and no open dev endpoint. A caller names a FIXTURE and
 * an OPERATION; both are allowlisted here, and each pair resolves to a fixed
 * npm script and a fixed argument vector that no caller can influence. Nothing
 * a caller supplies is ever concatenated into a command.
 *
 * WHERE THE CREDENTIALS LIVE. Only in the trusted child process. This module
 * never reads them, never receives them and never returns them; the bash runner
 * loads them through the same `alloy_load_trusted_server_env_exports` the dev
 * server uses, so there is one owner of that injection rather than two.
 *
 * WHY NOT A GOVERNED ACTION. A governed action is a request for a DIRECTOR
 * DECISION — it opens an approval card and waits. Creating a certification
 * fixture in a local development stack is not a decision; it is setup, and
 * routing it through an approval would reintroduce the operator step this
 * exists to delete. Governed actions remain the right shape for anything that
 * leaves this machine. An ambiguous identity conflict is the one case here that
 * IS a decision, and it is surfaced as needs_operator rather than executed.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CERTIFY_RUNNER = join(HERE, "..", "..", "alloy-certify-fixture");

/**
 * The allowlist. A fixture that is not named here cannot be run, and an
 * operation that is not listed for it cannot be run either.
 *
 * `args` is the COMPLETE argument vector for that operation. It is a constant:
 * nothing from the caller is appended to it except an identity decision drawn
 * from the closed set below, so "run this fixture" can never widen into "run
 * this command".
 */
export const CERTIFICATION_FIXTURES = Object.freeze({
  operational_cards_certification: Object.freeze({
    fixture: "operational_cards_certification",
    npm_script: "dev:seed:operational-cards-certification",
    // RFC-2606 reserved, so it can never collide with a real address.
    reserved_namespace: "operational-cards-cert.alloy.invalid",
    description: "Operational cards certification household, children Certa and Certb, enrolled.",
    operations: Object.freeze({
      ensure: Object.freeze({ args: [], mutating: true }),
      verify: Object.freeze({ args: ["--verify"], mutating: false }),
      reset: Object.freeze({ args: ["--remove"], mutating: true }),
    }),
  }),
});

/**
 * Identity-resolution decisions the runner may supply.
 *
 * `create_new_person` is permitted ONLY inside the fixture's reserved
 * namespace, and only when canonical resolution has shown there is no existing
 * non-fixture identity to reuse. It is a decision the fixture asks canonical
 * Create Lead to record — Vacilando does not make it and must not reimplement
 * the rule behind it.
 */
export const IDENTITY_DECISIONS = Object.freeze(["create_new_person", "reuse_existing", "refuse_ambiguous"]);

export const ORG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FIXTURE_REFUSALS = Object.freeze({
  BAD_ORG_ID: "org_id_not_a_uuid",
  UNKNOWN_FIXTURE: "fixture_not_allowlisted",
  UNKNOWN_OPERATION: "operation_not_allowlisted",
  BAD_IDENTITY_DECISION: "identity_decision_not_allowlisted",
  LANE_NOT_FOUND: "lane_not_found",
  LANE_NOT_OWNED: "worktree_not_owned_by_lane",
  WORKTREE_MISSING: "worktree_missing",
  SCRIPT_MISSING: "fixture_script_not_present",
  NOT_LOCAL: "non_local_environment_refused",
  TARGET_UNKNOWN: "certification_target_unknown",
  RUNNER_MISSING: "trusted_runner_missing",
});

export function listCertificationFixtures() {
  return Object.values(CERTIFICATION_FIXTURES).map((f) => ({
    fixture: f.fixture,
    description: f.description,
    reserved_namespace: f.reserved_namespace,
    operations: Object.keys(f.operations),
  }));
}

/** Is this a fixture and an operation this host will run at all? */
export function validateFixtureRequest({ fixture, operation, identityDecision = null, orgId = null } = {}) {
  const def = CERTIFICATION_FIXTURES[String(fixture || "")];
  if (!def) {
    return {
      ok: false,
      error: FIXTURE_REFUSALS.UNKNOWN_FIXTURE,
      detail: `${fixture} is not an allowlisted certification fixture`,
      allowlisted: Object.keys(CERTIFICATION_FIXTURES),
    };
  }
  const op = def.operations[String(operation || "")];
  if (!op) {
    return {
      ok: false,
      error: FIXTURE_REFUSALS.UNKNOWN_OPERATION,
      detail: `${operation} is not an operation of ${def.fixture}`,
      allowlisted: Object.keys(def.operations),
    };
  }
  if (orgId != null && orgId !== "" && !ORG_ID_RE.test(String(orgId))) {
    // A bounded fixture PARAMETER, not forwarded environment: canonical UUID
    // form only, so nothing else can ride in on it.
    return { ok: false, error: FIXTURE_REFUSALS.BAD_ORG_ID, detail: "org must be a canonical UUID" };
  }
  if (identityDecision != null && !IDENTITY_DECISIONS.includes(String(identityDecision))) {
    return {
      ok: false,
      error: FIXTURE_REFUSALS.BAD_IDENTITY_DECISION,
      detail: `${identityDecision} is not an identity resolution decision`,
      allowlisted: [...IDENTITY_DECISIONS],
    };
  }
  return { ok: true, definition: def, operation: op };
}

/**
 * Refuse a runtime this process can actually judge.
 *
 * THE CORRECTION. This used to read `process.env.SUPABASE_URL` and report
 * "not this machine's local stack" when it disagreed. In the real path that
 * variable is never set here: the CLI runs BEFORE the trusted env is loaded, so
 * the URL branch could only ever pass. A check that cannot see the thing it
 * judges is not a lenient check, it is a decorative one, and reporting it as
 * proven was wrong.
 *
 * The split is now honest. This function judges only what the CLI genuinely
 * knows — the Node runtime it is executing in. The TARGET is judged by
 * alloy-certify-fixture, which is the first point in the whole path where the
 * Supabase URL exists, using the toolkit's own alloy_is_production_supabase_url
 * so there is one definition of "prohibited target" on this machine.
 *
 * A caller may still supply a URL explicitly, and then it IS judged here — but
 * an absent URL is now `target_unknown` rather than silent approval, so this can
 * never again pass vacuously and be mistaken for enforcement.
 */
export function assertLocalEnvironment({ env = process.env, supabaseUrl = undefined } = {}) {
  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  if (nodeEnv === "production" || String(env.VERCEL || "") === "1") {
    return { ok: false, error: FIXTURE_REFUSALS.NOT_LOCAL, detail: "production runtime refused" };
  }
  if (supabaseUrl === undefined) {
    // Not judged here, and said so. The runner enforces the target.
    return { ok: true, target_judged: false, enforced_by: "alloy-certify-fixture" };
  }
  const url = String(supabaseUrl || "").trim();
  if (!url) {
    return { ok: false, error: FIXTURE_REFUSALS.TARGET_UNKNOWN, detail: "no Supabase target was supplied" };
  }
  if (!/localhost|127\.0\.0\.1|:55321|local\.supabase/i.test(url)) {
    return {
      ok: false,
      error: FIXTURE_REFUSALS.NOT_LOCAL,
      // The host, never the key.
      detail: "the supplied Supabase URL is not this machine's local stack",
    };
  }
  return { ok: true, target_judged: true };
}

function contained(child, parent) {
  const c = String(child || "").replace(/\/+$/, "");
  const p = String(parent || "").replace(/\/+$/, "");
  if (!c || !p) return false;
  const rc = existsSync(c) ? realpathSync(c) : c;
  const rp = existsSync(p) ? realpathSync(p) : p;
  return rc === rp || rc.startsWith(rp + sep);
}

/**
 * May THIS caller run a fixture here?
 *
 * Knowing a lane id is not authority. The process has to be running inside the
 * worktree the lane is bound to, which is the same ownership test the run
 * reporter uses — one rule for "this really is that lane", not two.
 */
export function authorizeFixtureCaller({ lane, cwd } = {}) {
  if (!lane?.lane_id) return { ok: false, error: FIXTURE_REFUSALS.LANE_NOT_FOUND };
  const worktree = lane.binding?.worktree_path || null;
  if (!worktree) {
    return { ok: false, error: FIXTURE_REFUSALS.LANE_NOT_OWNED, detail: "the lane has no worktree" };
  }
  if (!existsSync(worktree)) {
    return { ok: false, error: FIXTURE_REFUSALS.WORKTREE_MISSING, detail: worktree };
  }
  if (!contained(cwd, worktree)) {
    return {
      ok: false,
      error: FIXTURE_REFUSALS.LANE_NOT_OWNED,
      detail: "this process is not running inside the lane's worktree",
    };
  }
  return { ok: true, worktree_path: existsSync(worktree) ? realpathSync(worktree) : worktree };
}

/** The fixture's own script must actually be present in that worktree. */
export function fixtureScriptPresent(worktreePath, definition) {
  const pkg = join(worktreePath, "web", "package.json");
  if (!existsSync(pkg)) return { ok: false, error: FIXTURE_REFUSALS.SCRIPT_MISSING, detail: "web/package.json missing" };
  try {
    const raw = JSON.parse(readFileSync(pkg, "utf8"));
    const has = Boolean(raw?.scripts?.[definition.npm_script]);
    if (!has) {
      return {
        ok: false,
        error: FIXTURE_REFUSALS.SCRIPT_MISSING,
        detail: `web/package.json has no "${definition.npm_script}" script`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: FIXTURE_REFUSALS.SCRIPT_MISSING, detail: "web/package.json unreadable" };
  }
}

/**
 * The structured result a lane receives.
 *
 * The point of the contract is that the Director never reads terminal stdout to
 * relay an id. Canonical ids are parsed out of the fixture's own reporting
 * lines; anything unparsed is still returned as bounded raw output so nothing
 * is silently lost.
 */
export function parseFixtureResult(operation, stdout, { limit = 20000 } = {}) {
  const text = String(stdout || "");
  const ids = {};
  const grab = (label, re) => {
    const m = text.match(re);
    if (m) ids[label] = m[1];
  };
  // The fixture names the household two ways depending on the operation:
  // `= household  customer=<id>` on ensure, `household: <id>` on verify. Both
  // are the canonical customer id, and a contract that caught only one would
  // send the lane back to reading stdout for the other.
  grab("customer_id", /customer=([0-9a-f-]{8,})/i);
  if (!ids.customer_id) grab("customer_id", /household:\s*([0-9a-f-]{8,})/i);
  grab("opportunity_id", /opportunit\w*=([0-9a-f-]{8,})/i);
  const members = [...text.matchAll(/member=([0-9a-f-]{8,})/gi)].map((m) => m[1]);
  const agreements = [...text.matchAll(/agreement=([0-9a-f-]{8,})/gi)].map((m) => m[1]);
  const placements = [...text.matchAll(/placement=([0-9a-f-]{8,})/gi)].map((m) => m[1]);
  const assignments = [...text.matchAll(/assignment=([0-9a-f-]{8,})/gi)].map((m) => m[1]);

  const checks = [...text.matchAll(/^\s*([✓✗x])\s+(.+)$/gim)].map((m) => ({
    ok: m[1] === "✓",
    check: m[2].trim().slice(0, 200),
  }));

  return {
    ids: {
      ...ids,
      customer_member_ids: members,
      enrollment_agreement_ids: agreements,
      placement_ids: placements,
      schedule_assignment_ids: assignments,
    },
    checks,
    // Bounded, so a pathological run cannot grow the record without limit.
    output: text.length > limit ? `${text.slice(0, limit)}\n…[truncated]` : text,
    truncated: text.length > limit,
  };
}

function runRunner(argv, { cwd, timeout = 300_000 } = {}) {
  return new Promise((resolveP) => {
    execFile(CERTIFY_RUNNER, argv, { cwd, timeout, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        resolveP({
          ok: !err,
          code: err?.code ?? 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: err ? String(err.message || err).split("\n")[0].slice(0, 300) : null,
        });
      });
  });
}

/**
 * Run one allowlisted fixture operation through the trusted boundary.
 *
 * Every refusal happens BEFORE the runner is spawned, so an unauthorized or
 * unrecognised request never reaches a process that holds credentials.
 */
export async function runCertificationFixture({
  fixture,
  operation,
  laneId,
  cwd = process.cwd(),
  identityDecision = null,
  orgId = null,
  root = undefined,
  runner = runRunner,
  loadLane = null,
} = {}) {
  const shape = validateFixtureRequest({ fixture, operation, identityDecision, orgId });
  if (!shape.ok) return shape;

  const local = assertLocalEnvironment();
  if (!local.ok) return local;

  const getLane = loadLane
    || (await import("./development-lane.mjs").then((m) => (id) => m.getDurableLane(id, root)));
  const lane = getLane(laneId);
  const owned = authorizeFixtureCaller({ lane, cwd: resolve(cwd) });
  if (!owned.ok) return owned;

  const present = fixtureScriptPresent(owned.worktree_path, shape.definition);
  if (!present.ok) return present;

  if (!existsSync(CERTIFY_RUNNER)) {
    return { ok: false, error: FIXTURE_REFUSALS.RUNNER_MISSING, detail: CERTIFY_RUNNER };
  }

  // The argument vector is assembled from CONSTANTS plus one enum value. No
  // caller-supplied string is ever placed on a command line.
  const argv = [
    shape.definition.fixture,
    operation,
    owned.worktree_path,
    ...(identityDecision ? ["--identity-decision", identityDecision] : []),
    ...(orgId ? ["--org", orgId] : []),
  ];

  const out = await runner(argv, { cwd: owned.worktree_path });
  const parsed = parseFixtureResult(operation, `${out.stdout}\n${out.stderr}`);

  // An identity conflict is the one outcome here that is a DECISION rather than
  // a failure, so it is reported as needing the operator instead of as an error.
  const conflict = /ambiguous|non-fixture identity|already exists and is not/i.test(parsed.output)
    && /identity/i.test(parsed.output);

  return {
    ok: out.ok,
    fixture: shape.definition.fixture,
    operation,
    reserved_namespace: shape.definition.reserved_namespace,
    worktree_path: owned.worktree_path,
    lane_id: lane.lane_id,
    identity_decision: identityDecision,
    org_id: orgId || null,
    needs_operator: Boolean(!out.ok && conflict),
    exit_code: out.code,
    ...parsed,
    error: out.ok ? null : (out.error || "fixture_failed"),
    credentials_exposed: false,
  };
}
