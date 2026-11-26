/**
 * Input validation for `platform.register_developer_application`.
 *
 * WHY THE CALLER SUPPLIES NO SQL. The census takes a query artifact because a
 * census is a question nobody can enumerate in advance. A registration is the
 * opposite: one statement with seven parameters, all drawn from closed
 * vocabularies the schema already declares. So the executor builds the statement
 * and the caller supplies values only — there is no artifact to hash, and no
 * path by which a caller could reach any other table.
 *
 * The invariants themselves are NOT re-implemented here. They live in
 * `public.register_developer_application`, and this file checks only what must
 * be refused before a privileged connection is opened at all: an unsupported
 * ownership mode, an unknown database target, and values outside the schema's
 * own CHECK vocabularies. A refusal here costs nothing; a refusal there costs a
 * round trip to a deployed database.
 */

const DEFAULT_TARGET = "alloy_deployed_primary";

/** V1 registers global, platform-managed identities only. */
export const V1_OWNERSHIP_MODE = "alloy_managed";

/**
 * Reserved schema vocabulary that V1 refuses BY NAME.
 *
 * Refusing by name rather than ignoring the field is the whole point: a caller
 * who asks for `tenant_private` is asking a question Alloy cannot answer —
 * the table has no owner column, and an installation cannot exist before the
 * application does. Accepting it silently as `alloy_managed` would invent an
 * ownership semantics by accident and record the wrong provenance forever.
 */
export const RESERVED_OWNERSHIP_MODES = Object.freeze(["tenant_private", "partner_managed"]);

const ENVIRONMENTS = Object.freeze(["sandbox", "production"]);
const DISTRIBUTION_MODES = Object.freeze(["private", "listed"]);
const STATUSES = Object.freeze(["active", "disabled"]);

/** Matches the shape a slug can take without quoting surprises anywhere downstream. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function validateRegisterDeveloperApplicationInputs(inputs = {}) {
  const slug = str(inputs.slug || inputs.applicationKey || inputs.application_key);
  const name = str(inputs.name || inputs.displayName || inputs.display_name);
  const publisher = str(inputs.publisher);
  const ownershipMode = str(inputs.ownershipMode || inputs.ownership_mode) || V1_OWNERSHIP_MODE;
  const environment = str(inputs.applicationEnvironment || inputs.application_environment) || "sandbox";
  const distributionMode = str(inputs.distributionMode || inputs.distribution_mode) || "private";
  const status = str(inputs.status) || "active";
  const target = str(inputs.databaseTarget || inputs.database_target);

  // The ownership decision is the first gate, so the refusal names the product
  // boundary rather than whichever field happens to be checked first.
  if (ownershipMode !== V1_OWNERSHIP_MODE) {
    return {
      ok: false,
      code: RESERVED_OWNERSHIP_MODES.includes(ownershipMode)
        ? "reserved_ownership_mode"
        : "unsupported_ownership_mode",
      detail: `V1 registration supports ownership_mode = ${V1_OWNERSHIP_MODE} only. `
        + `${RESERVED_OWNERSHIP_MODES.join(" and ")} are reserved until an explicit publisher/application `
        + "ownership model exists.",
    };
  }
  if (!slug) return { ok: false, code: "missing_application_key", detail: "slug required" };
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      code: "invalid_application_key",
      detail: "slug must be 3-64 characters of lowercase letters, digits and hyphens, "
        + "starting and ending alphanumeric.",
    };
  }
  if (!name) return { ok: false, code: "missing_name", detail: "name required" };
  if (!publisher) return { ok: false, code: "missing_publisher", detail: "publisher required" };
  if (!ENVIRONMENTS.includes(environment)) {
    return { ok: false, code: "unsupported_environment", detail: `Unsupported environment: ${environment}` };
  }
  if (!DISTRIBUTION_MODES.includes(distributionMode)) {
    return {
      ok: false,
      code: "unsupported_distribution_mode",
      detail: `Unsupported distribution_mode: ${distributionMode}`,
    };
  }
  if (!STATUSES.includes(status)) {
    return { ok: false, code: "unsupported_status", detail: `Unsupported status: ${status}` };
  }

  // THE DATABASE IS NAMED, NEVER ASSUMED — the same rule the census learned the
  // hard way. A registration writes, so silence picking the deployed primary
  // would be strictly worse here than it was there.
  if (!target) {
    return { ok: false, code: "missing_database_target", detail: "databaseTarget required" };
  }
  if (target !== DEFAULT_TARGET && target !== "certification") {
    return { ok: false, code: "wrong_database_target", detail: `Unsupported target: ${target}` };
  }

  return {
    ok: true,
    normalized: {
      slug,
      name,
      publisher,
      ownershipMode: V1_OWNERSHIP_MODE,
      applicationEnvironment: environment,
      distributionMode,
      status,
      databaseTarget: target,
      registeredBy: str(inputs.registeredBy || inputs.registered_by) || null,
    },
  };
}

/**
 * The one statement this action may run, built from validated values.
 *
 * Values are single-quoted with doubled quotes rather than interpolated raw.
 * Every value has already passed a closed vocabulary or `SLUG_RE`, so this is
 * defence in depth rather than the only guard — but "the validator upstream
 * makes it safe" is precisely the reasoning that ages badly when someone adds a
 * free-text field later.
 */
export function buildRegistrationSql(n) {
  const lit = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  return "SELECT public.register_developer_application("
    + [
      lit(n.slug),
      lit(n.name),
      lit(n.publisher),
      lit(n.ownershipMode),
      lit(n.applicationEnvironment),
      lit(n.distributionMode),
      lit(n.status),
      lit(n.registeredBy),
      "'{}'::jsonb",
    ].join(", ")
    + ") AS result";
}
