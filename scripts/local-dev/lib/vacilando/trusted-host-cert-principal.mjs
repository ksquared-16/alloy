/**
 * Bounded trusted-host staging certification principal.
 *
 * Vacilando owns lookup, provisioning, credential binding, rotation, and
 * revocation for a dedicated non-human staging certification identity.
 * Secrets stay in a host-local 0600 store. Workers, Mission evidence, Git,
 * and Identity lane env never receive the password.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

export const STAGING_CERT_PRINCIPAL_EMAIL = "cert.operator@northwind.invalid";
export const STAGING_CERT_PRINCIPAL_LABEL = "staging_certification_operator";
export const STAGING_CERT_ORG_SLUG = "demo-childcare-co-c144769f";
export const STAGING_CERT_ROLE_KEY = "admin";
export const STAGING_CERT_PERSONA = "access_admin_read";
export const ENSURE_CERT_PRINCIPAL_SH = join(
  dirname(fileURLToPath(import.meta.url)),
  "trusted-host-ensure-cert-principal.sh",
);

const SECRET_RE = /postgresql:\/\/|postgres:\/\/|DATABASE_URL|CERT_OPERATOR_PASSWORD|service_role|eyJ[A-Za-z0-9_-]{20,}\./i;

function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function envName(value) {
  return String(value || "").trim().toLowerCase();
}

export function runtimeRootFrom(env = process.env) {
  return String(env.ALLOY_RUNTIME_ROOT || "").trim()
    || join(os.homedir(), ".local", "state", "alloy-dev");
}

export function certificationPrincipalSecretDir(runtimeRoot) {
  return join(runtimeRoot || runtimeRootFrom(), "vacilando", "trusted-secrets");
}

export function certificationPrincipalSecretPath(runtimeRoot) {
  return join(certificationPrincipalSecretDir(runtimeRoot), "staging-certification-principal.env");
}

export function certificationPrincipalMetaPath(runtimeRoot) {
  return join(certificationPrincipalSecretDir(runtimeRoot), "staging-certification-principal.json");
}

export function principalPublicId(email = STAGING_CERT_PRINCIPAL_EMAIL) {
  return `certop_${sha256(String(email).trim().toLowerCase()).slice(0, 12)}`;
}

export function payloadContainsPrincipalSecrets(value) {
  const text = typeof value === "string" ? value : (() => {
    try { return JSON.stringify(value); } catch { return String(value); }
  })();
  return SECRET_RE.test(text);
}

export function generateCertificationPassword() {
  return randomBytes(24).toString("base64url");
}

export function validateEnsureCertificationPrincipalInputs(inputs = {}) {
  if (inputs.sql || inputs.statement || inputs.body || inputs.command || inputs.database_url || inputs.databaseUrl || inputs.password || inputs.secret) {
    return {
      ok: false,
      code: "arbitrary_command_rejected",
      detail: "Certification principal ensure is not arbitrary auth administration.",
    };
  }
  const environment = envName(inputs.environment || inputs.env || "staging");
  if (environment === "production" || environment === "prod") {
    return {
      ok: false,
      code: "production_target_rejected",
      detail: "Production certification principals are not admitted.",
    };
  }
  if (environment !== "staging") {
    return {
      ok: false,
      code: "environment_not_allowed",
      detail: "application.ensure_certification_principal is staging-only.",
    };
  }
  const mode = String(inputs.mode || "ensure").trim().toLowerCase();
  if (!["ensure", "rotate", "revoke", "lookup"].includes(mode)) {
    return { ok: false, code: "invalid_mode", detail: "mode must be ensure, rotate, revoke, or lookup." };
  }
  const suiteKey = String(inputs.suite_key || inputs.suiteKey || "access_identity_v2").trim();
  const email = STAGING_CERT_PRINCIPAL_EMAIL;
  const queryHash = `ensure-cert-principal:${environment}:${suiteKey}:${mode}:${email}`;
  return {
    ok: true,
    normalized: {
      actionType: "application.ensure_certification_principal",
      environment: "staging",
      mode,
      suiteKey,
      email,
      orgSlug: STAGING_CERT_ORG_SLUG,
      roleKey: STAGING_CERT_ROLE_KEY,
      persona: STAGING_CERT_PERSONA,
      principalLabel: STAGING_CERT_PRINCIPAL_LABEL,
      queryHash,
      dedupeKey: `ensure-cert-principal:${environment}:${suiteKey}:${email}`,
    },
  };
}

function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1);
  }
  return out;
}

export function readCertificationPrincipalBinding(runtimeRoot, env = process.env) {
  const root = runtimeRoot || runtimeRootFrom(env);
  const path = certificationPrincipalSecretPath(root);
  if (!existsSync(path)) return { ok: false, code: "binding_missing", path };
  let parsed;
  try {
    parsed = parseEnvFile(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, code: "binding_unreadable", path };
  }
  const email = String(parsed.CERT_OPERATOR_EMAIL || parsed.CERT_OPERATOR_EMAIL || "").trim();
  const password = String(parsed.CERT_OPERATOR_PASSWORD || parsed.CERT_OPERATOR_PASSWORD || "").trim();
  if (!email || !password) return { ok: false, code: "binding_incomplete", path };
  return {
    ok: true,
    email,
    password,
    path,
    environment: parsed.CERT_OPERATOR_ENVIRONMENT || "staging",
  };
}

export function writeCertificationPrincipalBinding(runtimeRoot, {
  email,
  password,
  environment = "staging",
} = {}) {
  const dir = certificationPrincipalSecretDir(runtimeRoot);
  mkdirSync(dir, { recursive: true });
  try { chmodSync(dir, 0o700); } catch { /* */ }
  const path = certificationPrincipalSecretPath(runtimeRoot);
  const tmp = `${path}.${process.pid}.tmp`;
  const body = [
    "# Vacilando trusted-host secret. Never copy to a worker lane, Git, or Mission evidence.",
    `CERT_OPERATOR_EMAIL=${email}`,
    `CERT_OPERATOR_PASSWORD=${password}`,
    `CERT_OPERATOR_ENVIRONMENT=${environment}`,
    "",
  ].join("\n");
  writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* */ }
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch { /* */ }
  const meta = {
    environment,
    principal_label: STAGING_CERT_PRINCIPAL_LABEL,
    principal_id: principalPublicId(email),
    email_domain: email.includes("@") ? email.split("@")[1] : null,
    org_slug: STAGING_CERT_ORG_SLUG,
    role_key: STAGING_CERT_ROLE_KEY,
    persona: STAGING_CERT_PERSONA,
    binding_status: "bound",
    updated_at: new Date().toISOString(),
  };
  writeFileSync(
    certificationPrincipalMetaPath(runtimeRoot),
    `${JSON.stringify(meta, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return { ok: true, path, meta };
}

export function deleteCertificationPrincipalBinding(runtimeRoot) {
  const path = certificationPrincipalSecretPath(runtimeRoot);
  const meta = certificationPrincipalMetaPath(runtimeRoot);
  try { if (existsSync(path)) unlinkSync(path); } catch { /* */ }
  try { if (existsSync(meta)) unlinkSync(meta); } catch { /* */ }
  return { ok: true };
}

/**
 * Always re-reads the secret file. File wins over process env so a Director
 * PID does not need a restart after bind/rotate.
 */
export function overlayCertificationPrincipalBinding(env = process.env, runtimeRoot) {
  const merged = { ...env };
  const binding = readCertificationPrincipalBinding(runtimeRoot, env);
  if (binding.ok) {
    merged.CERT_OPERATOR_EMAIL = binding.email;
    merged.CERT_OPERATOR_EMAIL = binding.email;
    merged.CERT_OPERATOR_PASSWORD = binding.password;
    merged.CERT_OPERATOR_PASSWORD = binding.password;
  }
  return merged;
}

export function publicPrincipalEvidence({
  operation,
  environment = "staging",
  email = STAGING_CERT_PRINCIPAL_EMAIL,
  found = false,
  bindingStatus = "unbound",
  loginVerified = false,
  configReloaded = false,
  orgSlug = STAGING_CERT_ORG_SLUG,
  roleKey = STAGING_CERT_ROLE_KEY,
  nowMs = Date.now(),
} = {}) {
  return {
    ok: true,
    environment,
    operation,
    principal_label: STAGING_CERT_PRINCIPAL_LABEL,
    principal_id: principalPublicId(email),
    email_domain: email.includes("@") ? email.split("@")[1] : null,
    org_slug: orgSlug,
    role_key: roleKey,
    persona: STAGING_CERT_PERSONA,
    fixture_owned: true,
    non_human: true,
    production_principal_created: false,
    found,
    binding_status: bindingStatus,
    login_verified: loginVerified,
    config_reloaded: configReloaded,
    updated_at: new Date(nowMs).toISOString(),
  };
}

export function publicEnsureResult(result) {
  const pub = { ...(result || {}) };
  delete pub.password;
  delete pub.secret;
  delete pub.CERT_OPERATOR_PASSWORD;
  delete pub.CERT_OPERATOR_PASSWORD;
  delete pub.token;
  delete pub.access_token;
  if (payloadContainsPrincipalSecrets(pub)) {
    return {
      ok: false,
      code: "result_contained_secrets",
      detail: "Ensure result contained secrets and was discarded.",
      environment: result?.environment || "staging",
    };
  }
  return pub;
}

function defaultHostRun(mode, { email, password, env = process.env } = {}) {
  try { chmodSync(ENSURE_CERT_PRINCIPAL_SH, 0o755); } catch { /* */ }
  const child = spawnSync("bash", [ENSURE_CERT_PRINCIPAL_SH, mode], {
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...env,
      CERT_OPERATOR_EMAIL: email || STAGING_CERT_PRINCIPAL_EMAIL,
      CERT_OPERATOR_PASSWORD: password || "",
      CERT_PRINCIPAL_ORG_SLUG: STAGING_CERT_ORG_SLUG,
      CERT_PRINCIPAL_ROLE: STAGING_CERT_ROLE_KEY,
      ALLOY_CANONICAL_ROOT: env.ALLOY_CANONICAL_ROOT || env.ALLOY_REPO || "/Users/Kelly/Alloy",
    },
  });
  const stdout = String(child.stdout || "").trim();
  const stderr = String(child.stderr || "").trim();
  let parsed = null;
  try { parsed = stdout ? JSON.parse(stdout) : null; } catch { parsed = null; }
  if (child.status !== 0) {
    return {
      ok: false,
      code: parsed?.code || "principal_host_failed",
      detail: parsed?.detail || stderr.slice(0, 400) || `ensure shell exited ${child.status}`,
    };
  }
  return parsed || { ok: true };
}

export function applyEnsureCertificationPrincipal(normalized, {
  lookupPrincipal = null,
  createPrincipal = null,
  setPassword = null,
  assignRole = null,
  verifyLogin = null,
  revokePrincipal = null,
  hostRun = defaultHostRun,
  generatePassword = generateCertificationPassword,
  runtimeRoot = runtimeRootFrom(),
  env = process.env,
  nowMs = Date.now(),
} = {}) {
  if (!normalized?.email || !normalized?.actionType) {
    const validated = validateEnsureCertificationPrincipalInputs(normalized || {});
    if (!validated.ok) {
      return { ok: false, code: validated.code, detail: validated.detail, environment: normalized?.environment };
    }
    normalized = validated.normalized;
  }
  if (normalized.environment !== "staging") {
    return {
      ok: false,
      code: "environment_not_allowed",
      detail: "Staging is the only admitted environment.",
      environment: normalized.environment,
    };
  }

  const lookup = typeof lookupPrincipal === "function"
    ? lookupPrincipal(normalized)
    : hostRun("lookup", { email: normalized.email, env });
  if (!lookup?.ok && lookup?.code && lookup.code !== "principal_missing") {
    return {
      ok: false,
      code: lookup.code || "lookup_failed",
      detail: lookup.detail || "Could not look up the staging certification principal.",
      environment: "staging",
    };
  }
  const found = Boolean(lookup?.found || (lookup?.ok && lookup?.user_id));
  const binding = readCertificationPrincipalBinding(runtimeRoot, env);

  if (normalized.mode === "lookup") {
    return publicEnsureResult(publicPrincipalEvidence({
      operation: found ? (binding.ok ? "found_bound" : "found_unbound") : "missing",
      found,
      bindingStatus: binding.ok ? "bound" : "missing",
      loginVerified: false,
      nowMs,
    }));
  }

  if (normalized.mode === "revoke") {
    const revoked = typeof revokePrincipal === "function"
      ? revokePrincipal({ ...normalized, userId: lookup?.user_id })
      : hostRun("revoke", { email: normalized.email, env });
    if (!revoked?.ok) {
      return {
        ok: false,
        code: revoked?.code || "revoke_failed",
        detail: revoked?.detail || "Revoke failed.",
        environment: "staging",
      };
    }
    deleteCertificationPrincipalBinding(runtimeRoot);
    return publicEnsureResult(publicPrincipalEvidence({
      operation: "revoked",
      found: false,
      bindingStatus: "revoked",
      loginVerified: false,
      configReloaded: true,
      nowMs,
    }));
  }

  let operation = "unchanged";
  let password = binding.ok ? binding.password : null;
  const needsCreate = !found;
  const needsBind = found && (!binding.ok || normalized.mode === "rotate");

  if (needsCreate || needsBind) password = generatePassword();

  if (needsCreate) {
    const created = typeof createPrincipal === "function"
      ? createPrincipal({ ...normalized, password })
      : hostRun("create", { email: normalized.email, password, env });
    if (!created?.ok) {
      return {
        ok: false,
        code: created?.code || "create_failed",
        detail: created?.detail || "Create failed.",
        environment: "staging",
      };
    }
    operation = "created";
  } else if (needsBind) {
    const updated = typeof setPassword === "function"
      ? setPassword({ ...normalized, userId: lookup.user_id, password })
      : hostRun("set-password", { email: normalized.email, password, env });
    if (!updated?.ok) {
      return {
        ok: false,
        code: updated?.code || "bind_failed",
        detail: updated?.detail || "Password bind failed.",
        environment: "staging",
      };
    }
    operation = normalized.mode === "rotate" ? "rotated" : "bound";
  }

  const role = typeof assignRole === "function"
    ? assignRole({ ...normalized, userId: lookup?.user_id })
    : hostRun("assign-role", { email: normalized.email, env });
  if (!role?.ok) {
    return {
      ok: false,
      code: role?.code || "role_assign_failed",
      detail: role?.detail || "Role assignment failed.",
      environment: "staging",
    };
  }

  if (password) {
    writeCertificationPrincipalBinding(runtimeRoot, {
      email: normalized.email,
      password,
      environment: "staging",
    });
  }

  const verified = typeof verifyLogin === "function"
    ? verifyLogin({ email: normalized.email, password: password || binding.password })
    : hostRun("verify", { email: normalized.email, password: password || binding.password, env });
  if (!verified?.ok) {
    return {
      ok: false,
      code: "login_verify_failed",
      detail: verified?.detail || "Password grant did not succeed after bind.",
      environment: "staging",
      operation,
    };
  }

  const evidence = publicPrincipalEvidence({
    operation,
    found: true,
    bindingStatus: "bound",
    loginVerified: true,
    configReloaded: true,
    nowMs,
  });
  return publicEnsureResult({ ...evidence, ok: true });
}
