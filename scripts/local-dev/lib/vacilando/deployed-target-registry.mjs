/**
 * THE CANONICAL OWNER OF DEPLOYED BROWSER TARGETS.
 *
 * WHY THIS EXISTS. A managed browser session could only ever be minted for a
 * managed SLOT, and a slot is a port on loopback. Three separate assumptions
 * enforced that, each independently sufficient:
 *
 *   1. validateBrowserAuthRequest refuses any base that is not loopback —
 *      "only a loopback base may be driven".
 *   2. the base URL is derived as `http://127.0.0.1:${SLOT_PORTS[slot]}`.
 *   3. the mint writes cookies for the literal domains "localhost" and
 *      "127.0.0.1", hard-coded.
 *
 * So a governed action labelled `target = alloy_deployed_primary` could
 * complete and verify while producing cookies that can never authenticate a
 * deployed host. The target was an AUTHORIZATION label; it never reached the
 * session destination at all. That is the whole defect, and it is why fixing
 * only one of the three would still have produced a loopback session.
 *
 * WHAT THIS MODULE MAY NOT BECOME. The security property being preserved is
 * that a worker cannot say "mint me a session for https://whatever.example".
 * A caller names a KEY, never a URL. Every dimension a session needs — base
 * URL, cookie domain, expected QA identity, which trusted env holds the
 * project credentials — is resolved here, from a frozen table that ships with
 * the toolkit and is reviewed like any other promoted code.
 *
 * PRODUCTION IS ABSENT BY CONSTRUCTION. There is no production entry to
 * disable, mis-key or accidentally enable, in the same way
 * DIRECTOR_ELIGIBLE_ENVIRONMENTS omits production rather than listing and
 * excluding it. Adding one would be a visible, reviewable change to this table.
 */

/** Storage lives beside the slot sessions but can never be mistaken for one. */
export const DEPLOYED_STORAGE_NAMESPACE = "deployed";

/**
 * Every deployed target a managed session may be minted for.
 *
 * `trusted_env_key` names WHICH trusted env file holds that deployment's
 * Supabase credentials. It is a pointer, never a value: no secret, project
 * ref or key is stored here, and this module never reads one.
 */
export const DEPLOYED_TARGETS = Object.freeze({
  alloy_staging_web: Object.freeze({
    key: "alloy_staging_web",
    environment: "staging",
    base_url: "https://staging.workwithalloy.com",
    host: "staging.workwithalloy.com",
    // The managed identity this target's sessions belong to. A session minted
    // for a different account is not this target's session.
    qa_identity: "qa-slot1-product@example.com",
    trusted_env_key: "ALLOY_STAGING_ENV_SOURCE",
    storage_key: "alloy_staging_web",
  }),
});

export const DEPLOYED_TARGET_KEYS = Object.freeze(Object.keys(DEPLOYED_TARGETS));

/** Refusals, named so a caller learns the boundary rather than guessing. */
export const DEPLOYED_TARGET_REFUSALS = Object.freeze({
  UNKNOWN_TARGET: "unknown_deployed_target",
  CALLER_SUPPLIED_TARGET_FIELD: "caller_supplied_deployed_target_field",
  BASE_MISMATCH: "deployed_base_mismatch",
  IDENTITY_MISMATCH: "deployed_identity_mismatch",
  NOT_HTTPS: "deployed_base_not_https",
});

/**
 * Fields a caller may never supply for a deployed session.
 *
 * Same doctrine as the slot restore action: the refusal is explicit rather
 * than a silently ignored field, because a caller that learns nothing from
 * being ignored will try again in a way that eventually works.
 */
export const FORBIDDEN_DEPLOYED_INPUTS = Object.freeze([
  "baseUrl", "base_url", "url", "host", "domain", "cookieDomain", "cookie_domain",
  "identity", "email", "expectedIdentity", "expected_identity",
  "supabaseUrl", "supabase_url", "projectRef", "project_ref", "anonKey", "serviceRoleKey",
  "storagePath", "storage_path", "storage", "envSource", "env_source",
]);

/**
 * Resolve a trusted deployed target by key.
 *
 * The ONLY input is a key that must already be in the table. An unknown key is
 * refused; there is no default target, for the same reason there is no default
 * census query — picking one on the caller's behalf is how an unnamed request
 * becomes a privileged one.
 */
export function resolveDeployedTarget(key, { targets = DEPLOYED_TARGETS } = {}) {
  const k = String(key ?? "").trim();
  if (!k || !Object.prototype.hasOwnProperty.call(targets, k)) {
    return {
      ok: false,
      error: DEPLOYED_TARGET_REFUSALS.UNKNOWN_TARGET,
      detail: `no deployed target named "${k || "(empty)"}"; known: ${Object.keys(targets).join(", ") || "(none)"}`,
    };
  }
  const t = targets[k];
  // Defence in depth against a bad table edit: a deployed session that is not
  // https cannot carry a Secure cookie, and would silently be a downgrade.
  let host;
  try {
    const u = new URL(t.base_url);
    if (u.protocol !== "https:") {
      return { ok: false, error: DEPLOYED_TARGET_REFUSALS.NOT_HTTPS, detail: `${t.base_url} is not https` };
    }
    host = u.hostname;
  } catch {
    return { ok: false, error: DEPLOYED_TARGET_REFUSALS.NOT_HTTPS, detail: `${t.base_url} is not a URL` };
  }
  if (host !== t.host) {
    return {
      ok: false,
      error: DEPLOYED_TARGET_REFUSALS.BASE_MISMATCH,
      detail: `base_url host ${host} does not match declared host ${t.host}`,
    };
  }
  return { ok: true, target: { ...t } };
}

/**
 * Refuse a caller that tried to name any dimension of the target itself.
 *
 * A key is a choice among reviewed options. A URL is an arbitrary destination.
 * Only the first is delegable.
 */
export function rejectCallerSuppliedTargetFields(inputs = {}) {
  const offending = FORBIDDEN_DEPLOYED_INPUTS.filter(
    (f) => inputs[f] !== undefined && inputs[f] !== null && String(inputs[f]).trim() !== "",
  );
  if (!offending.length) return { ok: true };
  return {
    ok: false,
    error: DEPLOYED_TARGET_REFUSALS.CALLER_SUPPLIED_TARGET_FIELD,
    detail: offending.join(", "),
  };
}

/**
 * Where a deployed session's storage lives.
 *
 * Namespaced away from the slot sessions so a deployed session can never
 * overwrite, or be mistaken for, `slot<N>/storage-state.json`. The two are
 * different authorities against different origins, and the failure mode of
 * sharing a path is that a localhost session gets presented as deployed proof.
 */
export function deployedAuthStoragePath(key, { authRoot }) {
  const resolved = resolveDeployedTarget(key);
  if (!resolved.ok) return null;
  return `${authRoot}/${DEPLOYED_STORAGE_NAMESPACE}/${resolved.target.storage_key}/storage-state.json`;
}

/** True only for a path inside the deployed namespace. */
export function isDeployedStoragePath(path) {
  return new RegExp(`/${DEPLOYED_STORAGE_NAMESPACE}/[^/]+/storage-state\\.json$`).test(String(path || ""));
}

/**
 * Does the trusted env this target points at actually back this deployment?
 *
 * WHY THIS IS A GATE AND NOT AN ASSUMPTION. The registry says which trusted env
 * holds a target's credentials, but nothing in the registry can prove that env
 * belongs to that deployment — the two are configured in different places by
 * different people. Minting from the wrong project fails in one of two ways,
 * and the second is worse: either the session simply does not authenticate, or
 * it authenticates against a DIFFERENT environment that happens to share the
 * identity, and a tester then certifies the wrong system.
 *
 * So the project is compared explicitly. The comparison uses the project ref
 * only — the subdomain of the Supabase URL, which is public by design and
 * appears in every browser bundle. No key, no secret, and the value is never
 * logged by this function.
 *
 * `observedProjectRef` must be read from the DEPLOYMENT (its public config),
 * and `envProjectRef` from the trusted env. Passing the same source for both
 * would make this check vacuous, which is why they are separate parameters and
 * why a null on either side refuses rather than passes.
 */
export function verifyDeployedProjectMatch({ envProjectRef = null, observedProjectRef = null } = {}) {
  const a = String(envProjectRef ?? "").trim().toLowerCase();
  const b = String(observedProjectRef ?? "").trim().toLowerCase();
  if (!a || !b) {
    return {
      ok: false,
      error: "deployed_project_unverified",
      detail: "both the trusted env project and the deployment's own project must be observed; an unmeasured match is not a match",
    };
  }
  if (a !== b) {
    return {
      ok: false,
      error: "deployed_project_mismatch",
      detail: "the trusted env's Supabase project is not the one backing this deployed target",
    };
  }
  return { ok: true, project_ref: a };
}

/** The public project ref inside a Supabase URL, or null. Never a secret. */
export function projectRefFromSupabaseUrl(url) {
  try {
    const host = new URL(String(url)).hostname;
    const ref = host.split(".")[0];
    return /^[a-z0-9]{16,32}$/.test(ref) ? ref : null;
  } catch {
    return null;
  }
}
