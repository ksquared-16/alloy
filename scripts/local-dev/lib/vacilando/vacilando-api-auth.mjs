/**
 * Vacilando V2 API authorization (server-side).
 *
 * Loopback bind is not authorization. When VACILANDO_API_TOKEN is set
 * (or VACILANDO_REQUIRE_API_AUTH=1), mutation and sensitive read routes
 * require Authorization: Bearer <token>.
 *
 * Org multi-tenancy: Vacilando control plane is single-tenant/local —
 * missionId is the isolation boundary (tested). Cross-org is N/A.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const TOKEN_FILE = join(RUNTIME_ROOT, "vacilando", "api-token");

function ensureTokenFile() {
  const dir = join(RUNTIME_ROOT, "vacilando");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(TOKEN_FILE)) {
    const token = "vac_" + randomBytes(24).toString("hex");
    writeFileSync(TOKEN_FILE, token + "\n", { mode: 0o600 });
  }
  return readFileSync(TOKEN_FILE, "utf8").trim();
}

export function getVacilandoApiToken() {
  if (process.env.VACILANDO_API_TOKEN?.trim()) {
    return process.env.VACILANDO_API_TOKEN.trim();
  }
  try {
    return ensureTokenFile();
  } catch {
    return null;
  }
}

export function apiAuthRequired() {
  if (process.env.VACILANDO_REQUIRE_API_AUTH === "0") return false;
  if (process.env.VACILANDO_REQUIRE_API_AUTH === "1") return true;
  // Default: enforce when an explicit token is configured; otherwise open
  // (loopback). Integration tests set VACILANDO_REQUIRE_API_AUTH=1.
  return Boolean(process.env.VACILANDO_API_TOKEN?.trim());
}

/**
 * Authorize a V2 request from headers.
 * @returns {{ ok: true, actor: string } | { ok: false, status: number, error: string }}
 */
export function authorizeV2Request(headers = {}, { mutation = false } = {}) {
  const required = apiAuthRequired();
  if (!required && !mutation) return { ok: true, actor: "operator", mode: "open" };
  // Always require auth for deliverable-review mutations when token exists.
  if (!required) return { ok: true, actor: "operator", mode: "open" };

  const token = getVacilandoApiToken();
  if (!token) {
    return { ok: false, status: 503, error: "api_auth_unconfigured" };
  }

  const raw = headers.authorization || headers.Authorization || "";
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  const presented = m?.[1]?.trim() || headers["x-vacilando-token"] || headers["X-Vacilando-Token"];
  if (!presented || presented !== token) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const actor = headers["x-vacilando-actor"] || headers["X-Vacilando-Actor"] || "operator";
  return { ok: true, actor: String(actor), mode: "bearer" };
}

/** Paths that require auth for GET as well as POST. */
export const V2_AUTH_PROTECTED_PREFIXES = [
  "/api/v2/deliverable-reviews",
  "/api/v2/director/messages",
];

export function pathRequiresV2Auth(path, method) {
  if (!apiAuthRequired()) return false;
  const protectedPath = V2_AUTH_PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  if (!protectedPath) return false;
  if (method === "POST") return true;
  // Sensitive reads: conversation / messages / open review
  if (path.includes("/conversation") || path.includes("/messages") || path.endsWith("/open") || path.includes("deliverable-reviews")) {
    return true;
  }
  return false;
}

export function tokenFingerprint(token) {
  if (!token) return null;
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}
