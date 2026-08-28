/**
 * The provider prompt → governed action bridge.
 *
 * ── WHAT V1 LEFT OPEN ──
 *
 * Decision Delivery V1 classifies a provider's native permission modal and, for
 * anything it does not positively recognise, refuses to answer and surfaces it.
 * That is safe and it is where the Trust Runtime sat: blocked on
 *
 *   docker exec -i supabase_db_alloy-cert psql ... -f - < migrations/…h1_person_health_facts.sql
 *
 * classified `unsafe_or_unknown_provider_prompt`, correctly un-answered, and
 * then left to the operator as a PROMPT. But Vacilando already owns database
 * migration authority. The attempted operation had a registered home; nobody
 * carried it there.
 *
 * ── THE GOVERNING IDEA ──
 *
 * A provider-native permission prompt is never itself the governance object. It
 * is EVIDENCE that a provider is attempting an action. This module resolves the
 * attempted action into the canonical system that already owns it, so the
 * operator decides about the work — "Apply Health & Safety migrations" — and
 * never about someone else's modal.
 *
 * ── WHY THE PROVIDER MUST NOT RUN IT ──
 *
 * The dangerous shortcut is to treat approval as permission to answer "yes".
 * Where a registered capability declares a trusted-host executor, the credential
 * lives in the trusted host and nowhere else; answering the provider's modal
 * would run the raw `docker exec … psql` under the agent's own ambient
 * environment instead — a different executor, a different credential path, and
 * no execution evidence. So the executor is selected from the REGISTRY, and the
 * provider's raw command is authorized only where the registered action
 * explicitly declares the managed provider as its legitimate executor. Nothing
 * does today, and a test holds that.
 *
 * ── RESOLUTION IS STRUCTURAL, NEVER PROSE ──
 *
 * Every matcher below is a command SHAPE. A prompt is never renamed into a
 * known capability because its description reads like one: "apply the health
 * migration" is not a migration, and treating text as authority is how a
 * classifier becomes an attack surface.
 *
 * ── AND IT REFUSES TO INVENT CONTENT ──
 *
 * A migration request is filed only when the migration content resolves at a
 * canonical repository SHA. This program has already been burned by a request
 * whose content existed nowhere the executor could reach.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { getActionDefinition, listRegisteredActions } from "./trusted-host-action-registry.mjs";
import { normalizeEnvironmentId, assertEnvironmentAuthority } from "./executor-authority.mjs";

export const PROVIDER_BRIDGE_SCHEMA = "vacilando.provider_governed_bridge.v1";

/**
 * The second-stage outcomes for a prompt V1 refused to auto-answer.
 *
 * `still_unknown` is not a failure state to be minimised. It is the honest
 * answer whenever the attempted operation cannot be read off the command, and
 * it must stay reachable — a resolver that always resolves is a resolver that
 * guesses.
 */
export const CAPABILITY_RESOLUTIONS = Object.freeze([
  "registered_governed_capability",
  "unsupported_privileged_action",
  "still_unknown",
]);

/**
 * The bridge's own lifecycle, stated so each transition has a testable
 * postcondition. `executing_elsewhere` is the state V1 had no name for and the
 * whole reason a provider could sit behind a modal whose work had already been
 * done somewhere else.
 */
export const BRIDGE_STATES = Object.freeze([
  "captured",
  "governed",
  "waiting_decision",
  "executing_elsewhere",
  "resolved",
  "dismissed",
  "stale",
  "failed",
]);

/** Terminal bridge states: nothing further is owed to the provider. */
export const TERMINAL_BRIDGE_STATES = Object.freeze(["resolved", "dismissed", "stale", "failed"]);

/**
 * How a governed decision reaches the provider.
 *
 * Two genuinely different things, and collapsing them is the defect this slice
 * exists to prevent: one AUTHORIZES the provider's own command, the other
 * REPLACES it. Only a registered action that names the managed provider as its
 * executor may take the first.
 */
export const CONTINUATION_MODES = Object.freeze([
  "governed_action_replaces_command",
  "governed_approval_authorizes_provider",
]);

// ── Attempted operation ──────────────────────────────────────────────────────

/**
 * Command shapes that correspond to a registered capability.
 *
 * Order matters only where one shape is a refinement of another: a deleting
 * push is matched before a plain push, because `git push --delete` is both.
 */
const OPERATION_MATCHERS = Object.freeze([
  {
    kind: "delete_remote_branch",
    actionKey: "repository.delete_remote_branch",
    test: (c) => /\bgit\s+push\b/.test(c) && (/--delete\b/.test(c) || /\s:\S+/.test(c)),
  },
  { kind: "push", actionKey: "repository.push", test: (c) => /\bgit\s+push\b/.test(c) },
  { kind: "merge_pull_request", actionKey: "repository.merge_pull_request", test: (c) => /\bgh\s+pr\s+merge\b/.test(c) },
  { kind: "close_pull_request", actionKey: "repository.close_pull_request", test: (c) => /\bgh\s+pr\s+close\b/.test(c) },
  { kind: "open_pull_request", actionKey: "promotion.open_pr", test: (c) => /\bgh\s+pr\s+create\b/.test(c) },
  {
    kind: "apply_migration",
    actionKey: "database.apply_migration",
    // psql in any wrapper, or the Supabase migration verbs. `supabase start` is
    // deliberately NOT here: starting a stack is not applying a migration, and
    // folding it in would be the prose-similarity failure in another costume.
    test: (c) => /\bpsql\b/.test(c) || /\bsupabase\s+(db\s+push|migration\s+up|db\s+reset)\b/.test(c),
  },
]);

/**
 * Privileged shapes with NO registered home. Named so the answer can be
 * "Vacilando has no governed capability for this", which is a different and
 * more useful statement than "unknown".
 */
const UNSUPPORTED_PRIVILEGED = Object.freeze([
  { kind: "arbitrary_sudo", test: (c) => /\bsudo\b/.test(c) },
  { kind: "recursive_delete", test: (c) => /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/.test(c) },
  { kind: "remote_shell", test: (c) => /\bssh\b/.test(c) },
  { kind: "package_publish", test: (c) => /\bnpm\s+publish\b/.test(c) },
  { kind: "credential_read", test: (c) => /\.env(\.|\b)|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL/.test(c) },
  { kind: "container_control", test: (c) => /\bdocker\s+(rm|kill|stop|prune|system)\b/.test(c) },
]);

/** Every path-looking token in a command. */
function tokensIn(command) {
  return String(command || "").match(/[^\s"'`;|&()<>]+/g) || [];
}

/**
 * The migration files a command names.
 *
 * Only paths that look like a migration are returned — the `-f -` heredoc form
 * the Trust Runtime used puts the real file on the redirect, so the whole line
 * is scanned rather than just the psql arguments.
 */
export function migrationPathsIn(command) {
  return tokensIn(command)
    .filter((t) => /\.sql$/i.test(t))
    .filter((t) => /(^|\/)(supabase\/)?migrations\//.test(t) || /\/supabase\/migrations\//.test(t))
    .map((t) => t.replace(/^\.\//, ""));
}

/**
 * The environment a database command actually targets.
 *
 * Read off the command, never off the prompt's prose. A local docker container
 * is `development_certification`: it is a real environment with a real name,
 * and calling it `certification` — which on this host resolves to the ambient
 * hosted DATABASE_URL — would point an operator's approval at a different
 * database than the one on the card.
 */
export function environmentFromCommand(command) {
  const c = String(command || "");
  const container = c.match(/\bdocker\s+exec\b[^|]*?\b(\S*supabase_db_\S+)/);
  if (container) {
    const name = container[1];
    if (/alloy-cert|_cert\b|-cert\b/.test(name)) return { environment: "development_certification", evidence: { container: name } };
    return { environment: "development_certification", evidence: { container: name } };
  }
  if (/--linked\b|--project-ref\b/.test(c)) return { environment: "staging", evidence: { flag: "linked_project" } };
  if (/\blocalhost\b|127\.0\.0\.1|\b--local\b/.test(c)) return { environment: "development_certification", evidence: { host: "local" } };
  return { environment: null, evidence: {} };
}

/**
 * Read the attempted operation off a provider command.
 *
 * Returns null when no registered shape matches, which is what keeps
 * `still_unknown` reachable.
 */
export function extractAttemptedOperation({ command = null, tool = null } = {}) {
  const c = String(command || "").trim();
  if (!c) return null;
  const match = OPERATION_MATCHERS.find((m) => m.test(c));
  if (!match) return null;
  const op = { kind: match.kind, action_key: match.actionKey, command: c, tool: tool || null };
  if (match.kind === "apply_migration") {
    op.migration_paths = migrationPathsIn(c);
    const env = environmentFromCommand(c);
    op.environment = env.environment;
    op.environment_evidence = env.evidence;
  }
  return op;
}

// ── Capability resolution ────────────────────────────────────────────────────

/**
 * Second stage for a prompt V1 refused to auto-answer: does the attempted
 * operation correspond to a REGISTERED governed capability?
 *
 * The registry is the canonical one. There is deliberately no provider-only
 * capability catalog: a second list is a second governance system, which is the
 * thing this whole slice exists to remove.
 */
export function resolveProviderCapability({ classification = null, command = null, tool = null } = {}) {
  const cls = String(classification || "");
  if (cls && cls !== "unsafe_or_unknown_provider_prompt" && cls !== "governed_operator_decision") {
    return { resolution: "still_unknown", reason: `second-stage resolution does not apply to ${cls}` };
  }
  const c = String(command || "").trim();
  if (!c) return { resolution: "still_unknown", reason: "no command to resolve" };

  const op = extractAttemptedOperation({ command: c, tool });
  if (!op) {
    const unsupported = UNSUPPORTED_PRIVILEGED.find((u) => u.test(c));
    if (unsupported) {
      return {
        resolution: "unsupported_privileged_action",
        attempted_kind: unsupported.kind,
        reason: `${unsupported.kind} is privileged and Vacilando registers no governed capability for it`,
      };
    }
    return { resolution: "still_unknown", reason: "the command matches no registered capability shape" };
  }

  // The registry, not this module, decides whether the key is real and live.
  const definition = getActionDefinition(op.action_key);
  if (!definition) {
    return {
      resolution: "unsupported_privileged_action",
      attempted_kind: op.kind,
      attempted_action_key: op.action_key,
      reason: `${op.action_key} is not a registered trusted-host action on this host`,
    };
  }

  return {
    resolution: "registered_governed_capability",
    action_key: op.action_key,
    attempted_operation: op,
    required_capability: definition.requiredCapability,
    required_inputs: definition.inputSchema?.required || [],
    title: definition.title,
    risk_class: definition.riskClass,
  };
}

// ── Executor selection ───────────────────────────────────────────────────────

/**
 * WHO executes, once a capability is resolved.
 *
 * A registered action whose capability belongs to the trusted host is executed
 * by the trusted host. The provider's raw command is not an alternative route to
 * the same effect — it is a different executor with a different credential path
 * and no execution evidence — so it is never authorized. A definition may opt
 * in with `providerLocalExecution: true`; none does, and a test holds that so
 * the exception cannot appear by accident.
 */
export function selectExecutor(actionKey) {
  const definition = getActionDefinition(actionKey);
  if (!definition) {
    return { ok: false, error: "unregistered_action_key", action_key: actionKey || null };
  }
  const providerLocal = definition.providerLocalExecution === true;
  const trustedHost = String(definition.requiredCapability || "").startsWith("trusted_host.");
  if (providerLocal && !trustedHost) {
    return {
      ok: true,
      executor: "managed_provider",
      continuation_mode: "governed_approval_authorizes_provider",
      provider_raw_command_authorized: true,
      reason: `${actionKey} declares the managed provider as its legitimate executor`,
    };
  }
  return {
    ok: true,
    executor: "trusted_host",
    continuation_mode: "governed_action_replaces_command",
    provider_raw_command_authorized: false,
    required_capability: definition.requiredCapability,
    reason: `${actionKey} executes through ${definition.requiredCapability}; the provider's raw command is a different executor and is never authorized`,
  };
}

// ── Canonical identity ───────────────────────────────────────────────────────

function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

const defaultGit = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 20000 }).trim();

/**
 * Build the canonical governed-action inputs for an attempted operation.
 *
 * REFUSES RATHER THAN APPROXIMATES. A migration whose content does not resolve
 * at a repository SHA produces `migration_content_unresolvable` and no request
 * at all. Filing one anyway is exactly the false state this program has already
 * paid for: an approval granted for content the executor could never read.
 */
export function canonicalIdentityFor(operation, {
  repoRoot = null,
  ref = "origin/staging",
  git = null,
  readFile = null,
} = {}) {
  if (!operation) return { ok: false, code: "no_operation" };
  if (operation.action_key !== "database.apply_migration") {
    // Other capabilities carry their identity in the command's own arguments and
    // are resolved by their registered validators; only the migration case needs
    // content resolution, which is the case that has burned us.
    return { ok: true, action_key: operation.action_key, inputs: null, needs_operator_inputs: true };
  }

  const paths = operation.migration_paths || [];
  if (!paths.length) {
    return { ok: false, code: "migration_path_unreadable", detail: "the command names no migration file" };
  }

  const root = repoRoot || process.env.VACILANDO_CHECKOUT || process.cwd();
  const runGit = git || ((args) => defaultGit(args, root));
  const read = readFile || ((rel) => {
    const abs = join(root, rel);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  });

  // Canonical paths, whatever the provider's cwd-relative form looked like.
  const canonical = paths.map((p) => {
    const name = basename(p);
    return p.includes("supabase/migrations/") ? p.slice(p.indexOf("supabase/migrations/")) : `supabase/migrations/${name}`;
  });

  let sha = null;
  try {
    sha = runGit(["rev-parse", ref]);
  } catch {
    return { ok: false, code: "reference_unresolvable", detail: `${ref} could not be resolved in ${root}` };
  }

  const contents = [];
  for (const rel of canonical) {
    let body = null;
    try {
      body = runGit(["show", `${sha}:${rel}`]);
    } catch {
      body = null;
    }
    if (body == null) body = read(rel);
    if (body == null) {
      return {
        ok: false,
        code: "migration_content_unresolvable",
        detail: `${rel} does not exist at ${ref} (${String(sha).slice(0, 12)}); a migration request must name content the executor can read`,
        expected_sha: sha,
        migration_path: rel,
      };
    }
    contents.push({ path: rel, version: (basename(rel).match(/^(\d{8,})/) || [])[1] || null, body });
  }

  const environment = normalizeEnvironmentId(operation.environment || "") || operation.environment || null;
  const fingerprint = sha256(JSON.stringify({
    schema: PROVIDER_BRIDGE_SCHEMA,
    action_key: operation.action_key,
    environment,
    migrations: contents.map((c) => ({ path: c.path, sha: sha256(c.body) })),
  }));

  return {
    ok: true,
    action_key: operation.action_key,
    content_fingerprint: fingerprint,
    inputs: {
      environment,
      expectedSha: sha,
      migrations: contents.map((c) => ({ path: c.path, version: c.version })),
    },
    evidence: {
      repository: "ksquared-16/alloy",
      reference: ref,
      expected_sha: sha,
      migrations: contents.map((c) => ({ path: c.path, version: c.version, content_sha256: sha256(c.body) })),
      environment,
      environment_evidence: operation.environment_evidence || {},
    },
  };
}

/**
 * May this identity execute at all, on this host, right now?
 *
 * Separated from filing so a bridge can be truthful about a capability it
 * RECOGNISES but cannot execute: the operator is told the prerequisite instead
 * of being offered an approval that would fail.
 */
export function assertBridgeExecutable(identity) {
  if (!identity?.ok) return { ok: false, refusal: identity?.code || "identity_unresolved", detail: identity?.detail || null };
  if (identity.action_key !== "database.apply_migration") return { ok: true };
  const definition = getActionDefinition(identity.action_key);
  return assertEnvironmentAuthority({
    environment: identity.inputs?.environment,
    capability: definition?.requiredCapability,
    mode: "write",
  });
}

// ── Bridge records ───────────────────────────────────────────────────────────

export function bridgeStorePath(root) {
  return join(root, "provider-prompts", "bridges.json");
}

function readBridgeStore(root) {
  try {
    const j = JSON.parse(readFileSync(bridgeStorePath(root), "utf8"));
    return { schema_version: PROVIDER_BRIDGE_SCHEMA, bridges: Array.isArray(j.bridges) ? j.bridges : [] };
  } catch {
    return { schema_version: PROVIDER_BRIDGE_SCHEMA, bridges: [] };
  }
}

function writeBridgeStore(root, store) {
  const p = bridgeStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  store.bridges = store.bridges.slice(-400);
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

export function listBridges({ root } = {}) {
  return readBridgeStore(root).bridges;
}

export function getBridge({ root, fingerprint }) {
  return readBridgeStore(root).bridges.find((b) => b.prompt_fingerprint === fingerprint) || null;
}

/** A bridge is live while it still owes the provider something. */
export function isLiveBridge(b) {
  return Boolean(b) && !TERMINAL_BRIDGE_STATES.includes(String(b.state || ""));
}

/**
 * Open (or re-open) the bridge for one prompt.
 *
 * At most ONE live bridge per exact prompt identity. A second observation of the
 * same modal returns the existing record rather than filing again — a re-read is
 * how the adapter works, and it must never manufacture a duplicate request.
 */
export function openBridge({
  root,
  promptFingerprint: fp,
  laneId = null,
  runId = null,
  sessionId = null,
  attemptedOperation = null,
  resolution = null,
  identity = null,
  executor = null,
  nowMs = Date.now(),
} = {}) {
  if (!fp) return { ok: false, error: "missing_prompt_fingerprint" };
  const store = readBridgeStore(root);
  const existing = store.bridges.find((b) => b.prompt_fingerprint === fp && isLiveBridge(b));
  if (existing) return { ok: true, bridge: existing, reused: true };

  const bridge = {
    schema_version: PROVIDER_BRIDGE_SCHEMA,
    prompt_fingerprint: fp,
    lane_id: laneId,
    run_id: runId,
    session_id: sessionId,
    attempted_operation: attemptedOperation,
    capability_resolution: resolution?.resolution || null,
    governed_action_key: resolution?.action_key || null,
    governed_request_id: null,
    content_fingerprint: identity?.content_fingerprint || null,
    resolution_mode: executor?.continuation_mode || null,
    provider_raw_command_authorized: executor?.provider_raw_command_authorized === true,
    state: resolution?.resolution === "registered_governed_capability" ? "governed" : "captured",
    continuation_state: "pending",
    created_at: new Date(nowMs).toISOString(),
    resolved_at: null,
  };
  store.bridges.push(bridge);
  writeBridgeStore(root, store);
  return { ok: true, bridge, reused: false };
}

const ALLOWED_TRANSITIONS = Object.freeze({
  captured: ["governed", "dismissed", "stale", "failed"],
  governed: ["waiting_decision", "executing_elsewhere", "dismissed", "stale", "failed"],
  waiting_decision: ["executing_elsewhere", "resolved", "dismissed", "stale", "failed"],
  executing_elsewhere: ["resolved", "failed", "stale"],
  resolved: [],
  dismissed: [],
  stale: [],
  failed: [],
});

/**
 * Advance one bridge.
 *
 * Transitions are enumerated rather than free, because the postcondition that
 * matters — "no resolved governed action leaves a provider stuck behind its
 * original modal" — is only testable if the states cannot be skipped.
 */
export function advanceBridge({ root, fingerprint, to, patch = {}, nowMs = Date.now() } = {}) {
  const store = readBridgeStore(root);
  const idx = store.bridges.findIndex((b) => b.prompt_fingerprint === fingerprint);
  if (idx < 0) return { ok: false, error: "unknown_bridge" };
  const from = String(store.bridges[idx].state || "");
  if (!BRIDGE_STATES.includes(to)) return { ok: false, error: "unknown_bridge_state", to };
  if (from !== to && !(ALLOWED_TRANSITIONS[from] || []).includes(to)) {
    return { ok: false, error: "illegal_bridge_transition", from, to };
  }
  const next = { ...store.bridges[idx], ...patch, state: to };
  if (TERMINAL_BRIDGE_STATES.includes(to)) next.resolved_at = new Date(nowMs).toISOString();
  store.bridges[idx] = next;
  writeBridgeStore(root, store);
  return { ok: true, bridge: next };
}

// ── Dedupe ───────────────────────────────────────────────────────────────────

const PENDING = new Set(["requested", "awaiting_director", "awaiting_operator", "awaiting_control_plane_refresh"]);

/**
 * What to do about an identity that may already have a governed action.
 *
 * A failed prior action deliberately does NOT become "file another one": a
 * migration that failed is a failure to surface, not an approval still owed.
 * Re-filing it would let a provider retry its way past a real refusal.
 */
export function dedupeDecision({ identity, governedActions = [] } = {}) {
  const fp = identity?.content_fingerprint || null;
  if (!fp) return { action: "file_new", reason: "no content fingerprint to match" };
  const exact = governedActions.filter((a) => a?.content_fingerprint === fp);
  if (!exact.length) return { action: "file_new", reason: "no governed action carries this exact content fingerprint" };

  const pending = exact.find((a) => PENDING.has(String(a.status || "")));
  if (pending) return { action: "attach_pending", request_id: pending.request_id, status: pending.status };

  const executing = exact.find((a) => String(a.status || "") === "executing");
  if (executing) return { action: "attach_and_wait", request_id: executing.request_id, status: "executing" };

  const complete = exact.find((a) => ["complete", "completed"].includes(String(a.status || "")));
  if (complete) {
    // Complete is not the same as effective. Reuse is offered only where the
    // capability's own verification says the effect is real.
    return {
      action: complete.effective === true ? "reuse_result" : "await_verification",
      request_id: complete.request_id,
      status: complete.status,
      effective: complete.effective === true,
    };
  }

  const failed = exact.find((a) => ["failed", "denied", "cancelled"].includes(String(a.status || "")));
  if (failed) return { action: "surface_failure", request_id: failed.request_id, status: failed.status };

  return { action: "file_new", reason: "no live or terminal match" };
}

// ── Continuation ─────────────────────────────────────────────────────────────

/**
 * What the provider is told, once the governed action resolves.
 *
 * NEVER a bare affirmative by default. Where the trusted host executed the work,
 * the provider's modal is exited WITHOUT approving its raw command and the
 * result is delivered as context — the action already happened, and answering
 * "yes" would run it a second time by a different route.
 */
export function planProviderContinuation({ bridge = null, governedAction = null, executor = null } = {}) {
  if (!bridge) return { ok: false, error: "missing_bridge" };
  const mode = executor?.continuation_mode || bridge.resolution_mode || "governed_action_replaces_command";
  const status = String(governedAction?.status || "");
  const effective = governedAction?.effective === true;

  if (status === "denied" || status === "cancelled") {
    return {
      ok: true, mode, provider_answer: "decline",
      dismissal: "cancel_without_affirmative",
      bridge_state: "dismissed",
      continuation: "The governed action was denied. The requested command was not authorized and was not run.",
      run_outcome: "denied",
    };
  }
  if (status === "failed") {
    return {
      ok: true, mode, provider_answer: "decline",
      dismissal: "cancel_without_affirmative",
      bridge_state: "failed",
      continuation: "The governed action failed during execution. The requested command was not authorized and was not run.",
      run_outcome: "execution_failed",
    };
  }
  if (["complete", "completed"].includes(status) && !effective) {
    // The truth ladder's last rung. A clean exit code is not an effect.
    return {
      ok: true, mode, provider_answer: "none",
      dismissal: null,
      bridge_state: "executing_elsewhere",
      continuation: "The governed action reported completion but its effect is not yet verified; the provider stays blocked on the real dependency state.",
      run_outcome: "awaiting_verification",
    };
  }
  if (["complete", "completed"].includes(status) && effective) {
    if (mode === "governed_approval_authorizes_provider") {
      return {
        ok: true, mode, provider_answer: "narrow_affirmative",
        dismissal: null,
        bridge_state: "resolved",
        continuation: "Approved for provider-local execution. Answer the narrowest affirmative only.",
        run_outcome: "authorized",
      };
    }
    return {
      ok: true, mode, provider_answer: "decline",
      dismissal: "cancel_without_affirmative",
      bridge_state: "resolved",
      continuation: "The trusted host performed this action and its effect is verified. Do not run the command; continue the mission from the next step.",
      run_outcome: "completed_elsewhere",
      result: governedAction?.result ?? null,
      evidence: governedAction?.evidence ?? null,
    };
  }
  return {
    ok: true, mode, provider_answer: "none", dismissal: null,
    bridge_state: PENDING.has(status) ? "waiting_decision" : "governed",
    continuation: "A governed decision is pending. The provider remains blocked and no answer is sent.",
    run_outcome: "awaiting_decision",
  };
}

/**
 * A continuation is only ever delivered to the session and run it was minted for.
 *
 * The bridge outlives the provider process it was opened for: a seat can be
 * reclaimed, a session replaced, a run superseded, all while a governed action
 * is still executing elsewhere. Delivering an old outcome into a new session
 * would tell a provider that work it never attempted has completed — so identity
 * is re-asserted at delivery time, not assumed from the fact that a bridge
 * exists.
 */
export function assertBridgeSession({ bridge = null, observed = null } = {}) {
  if (!bridge) return { ok: false, refusal: "missing_bridge" };
  if (!observed) return { ok: false, refusal: "no_observed_session" };
  if (bridge.session_id && observed.session_id !== bridge.session_id) {
    return { ok: false, refusal: "session_mismatch", expected: bridge.session_id, observed: observed.session_id };
  }
  if (bridge.run_id && observed.run_id !== bridge.run_id) {
    return { ok: false, refusal: "run_mismatch", expected: bridge.run_id, observed: observed.run_id };
  }
  if (observed.prompt_fingerprint && observed.prompt_fingerprint !== bridge.prompt_fingerprint) {
    return { ok: false, refusal: "prompt_fingerprint_mismatch", expected: bridge.prompt_fingerprint, observed: observed.prompt_fingerprint };
  }
  return { ok: true };
}

/**
 * The governed request's inputs, built ONLY from canonical evidence.
 *
 * The provider's command is what told us an action was attempted; it is not a
 * source of parameters. Anything the command carried that the registered action
 * did not ask for is dropped here, so a prompt cannot widen a request into
 * something the operator did not read on the card.
 */
export function governedInputsFor({ identity = null, actionKey = null } = {}) {
  const key = actionKey || identity?.action_key || null;
  const definition = key ? getActionDefinition(key) : null;
  if (!definition) return { ok: false, error: "unregistered_action_key", action_key: key };
  const required = definition.inputSchema?.required || [];
  const source = identity?.inputs || {};
  const inputs = {};
  const dropped = [];
  for (const field of required) {
    if (source[field] === undefined) return { ok: false, error: "missing_canonical_input", field };
    inputs[field] = source[field];
  }
  for (const field of Object.keys(source)) {
    if (!required.includes(field)) dropped.push(field);
  }
  return { ok: true, action_key: key, inputs, dropped, content_fingerprint: identity?.content_fingerprint || null };
}

// ── Operator surface ─────────────────────────────────────────────────────────

/**
 * The card the operator actually sees.
 *
 * The WORK is the headline. "Claude asks: Do you want to proceed?" is a
 * provider implementation detail and belongs in diagnostics, not in the
 * governance object — an operator approving a modal is approving a sentence,
 * not an action.
 */
export function bridgeApprovalCard({ bridge = null, identity = null, executable = null, laneName = null } = {}) {
  if (!bridge) return null;
  const blocked = executable && executable.ok === false;
  const title = identity?.action_key === "database.apply_migration"
    ? migrationHeadline(identity)
    : (getActionDefinition(bridge.governed_action_key)?.title || "Governed action");
  return {
    schema_version: PROVIDER_BRIDGE_SCHEMA,
    headline: blocked ? `${title} — blocked` : title,
    context: [laneName, identity?.inputs?.environment, "database change"].filter(Boolean).join(" · "),
    why_this_needs_you: blocked
      ? null
      : "This operation changes database schema.",
    prerequisite: blocked ? prerequisiteFor(executable) : null,
    decision: blocked ? null : ["Approve", "Deny"],
    requested_by: laneName || bridge.lane_id || null,
    diagnostics: {
      provider_command: bridge.attempted_operation?.command || null,
      prompt_fingerprint: bridge.prompt_fingerprint,
      governed_action_key: bridge.governed_action_key,
      content_fingerprint: bridge.content_fingerprint,
      executor: bridge.resolution_mode,
    },
  };
}

function migrationHeadline(identity) {
  const versions = (identity?.inputs?.migrations || []).map((m) => m.version).filter(Boolean);
  const n = identity?.inputs?.migrations?.length || 0;
  if (!n) return "Apply migration";
  const names = (identity.inputs.migrations || []).map((m) => basename(m.path).replace(/^\d+_/, "").replace(/\.sql$/, ""));
  const subject = names[0]?.split("_").slice(0, 3).join(" ") || versions[0] || "migration";
  return n === 1 ? `Apply ${subject} migration` : `Apply ${n} migrations (${subject}, …)`;
}

function prerequisiteFor(executable) {
  if (!executable) return null;
  if (executable.refusal === "environment_unprovisioned") {
    return {
      refusal: executable.refusal,
      environment: executable.environment,
      steps: executable.must_be_provisioned || [],
    };
  }
  return { refusal: executable.refusal || executable.code || "unknown", detail: executable.detail || null };
}

// ── Health ───────────────────────────────────────────────────────────────────

/**
 * Control-plane failures a bridge can produce.
 *
 * Every one of these is a state where the system's own story is inconsistent —
 * work that is governed but unfiled, a decision that resolved while its provider
 * stayed blocked, two bridges for one prompt. They are reported, never repaired
 * here: repair belongs to the canonical owners.
 */
export function reconcileProviderBridges({ bridges = [], governedActions = [], nowMs = Date.now(), staleAfterMs = 6 * 60 * 60 * 1000 } = {}) {
  const violations = [];
  const byPrompt = new Map();

  for (const b of bridges) {
    if (isLiveBridge(b)) byPrompt.set(b.prompt_fingerprint, (byPrompt.get(b.prompt_fingerprint) || 0) + 1);

    if (b.state === "governed" && !b.governed_request_id) {
      violations.push({
        kind: "governed_prompt_without_governed_request",
        prompt_fingerprint: b.prompt_fingerprint, lane_id: b.lane_id ?? null,
        detail: "a provider prompt resolved to a registered capability but no governed action was filed for it",
      });
    }

    const action = b.governed_request_id
      ? governedActions.find((a) => a.request_id === b.governed_request_id)
      : null;

    if (action && ["complete", "completed"].includes(String(action.status || "")) && action.effective === true && isLiveBridge(b) && b.state !== "resolved") {
      violations.push({
        kind: "governed_request_complete_provider_still_blocked",
        prompt_fingerprint: b.prompt_fingerprint, request_id: action.request_id,
        detail: "the governed action completed and took effect while its provider remains blocked on the original prompt",
      });
    }

    if (b.state === "dismissed" && b.continuation_state !== "delivered") {
      violations.push({
        kind: "prompt_dismissed_without_continuation",
        prompt_fingerprint: b.prompt_fingerprint, run_id: b.run_id ?? null,
        detail: "the provider modal was exited but the parent run was never given the outcome",
      });
    }

    if (isLiveBridge(b) && b.created_at) {
      const age = nowMs - Date.parse(b.created_at);
      if (Number.isFinite(age) && age > staleAfterMs) {
        violations.push({
          kind: "stale_bridge", prompt_fingerprint: b.prompt_fingerprint, age_ms: age,
          detail: "a live bridge has been open past its staleness bound with no resolution",
        });
      }
    }
  }

  for (const [fp, n] of byPrompt) {
    if (n > 1) {
      violations.push({ kind: "duplicate_active_bridges", prompt_fingerprint: fp, count: n,
        detail: "more than one live bridge exists for the same provider prompt" });
    }
  }

  return {
    schema_version: PROVIDER_BRIDGE_SCHEMA,
    bridge_count: bridges.length,
    live_count: bridges.filter(isLiveBridge).length,
    violations,
    consistent: violations.length === 0,
  };
}

/** Every registered action key, for tests and discovery. Never a second catalog. */
export function registeredActionKeys() {
  return listRegisteredActions().map((a) => a.actionType);
}
