/**
 * Vacilando V2 API authorization (server-side).
 *
 * Loopback bind is not authorization. When VACILANDO_GATEWAY_REMOTE=1,
 * VACILANDO_API_TOKEN is set, or VACILANDO_REQUIRE_API_AUTH=1, API routes
 * require Authorization: Bearer <token> or the HttpOnly session cookie.
 *
 * Tokens never belong in query strings. Org multi-tenancy: single-tenant/local.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const TOKEN_FILE = join(RUNTIME_ROOT, "vacilando", "api-token");
export const GATEWAY_SESSION_COOKIE = "vacilando_gw";
export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

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

export function gatewayRemoteMode() {
  return process.env.VACILANDO_GATEWAY_REMOTE === "1";
}

export function apiAuthRequired() {
  // Remote Gateway cannot be opened by VACILANDO_REQUIRE_API_AUTH=0.
  if (gatewayRemoteMode()) return true;
  if (process.env.VACILANDO_REQUIRE_API_AUTH === "0") return false;
  if (process.env.VACILANDO_REQUIRE_API_AUTH === "1") return true;
  // Default: enforce when an explicit token is configured; otherwise open
  // (loopback Electron). Integration tests set VACILANDO_REQUIRE_API_AUTH=1.
  return Boolean(process.env.VACILANDO_API_TOKEN?.trim());
}

export function tokensEqual(presented, expected) {
  if (!presented || !expected) return false;
  const a = Buffer.from(String(presented));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function tokenFromCookieHeader(cookieHeader) {
  const raw = String(cookieHeader || "");
  const parts = raw.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== GATEWAY_SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/** Bearer / cookie only. Never reads query strings. */
export function tokenFromHeaders(headers = {}) {
  const raw = headers.authorization || headers.Authorization || "";
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  const x = headers["x-vacilando-token"] || headers["X-Vacilando-Token"];
  if (x) return String(x).trim();
  return tokenFromCookieHeader(headers.cookie || headers.Cookie);
}

export function isPublicApiPath(path, method) {
  const m = String(method || "GET").toUpperCase();
  if (path === "/api/health" && m === "GET") return true;
  if (path === "/api/gateway/session" && (m === "GET" || m === "POST" || m === "DELETE")) return true;
  return false;
}

/**
 * Authorize a request from headers (Bearer, x-vacilando-token, or session cookie).
 */
export function authorizeV2Request(headers = {}, { mutation = false } = {}) {
  const required = apiAuthRequired();
  if (!required) return { ok: true, actor: "operator", mode: "open" };

  const token = getVacilandoApiToken();
  if (!token) {
    return { ok: false, status: 503, error: "api_auth_unconfigured" };
  }

  const presented = tokenFromHeaders(headers);
  if (!tokensEqual(presented, token)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const actor = headers["x-vacilando-actor"] || headers["X-Vacilando-Actor"] || "operator";
  const mode = (headers.cookie || headers.Cookie) && tokenFromCookieHeader(headers.cookie || headers.Cookie)
    ? "cookie"
    : "bearer";
  return { ok: true, actor: String(actor), mode };
}

export const authorizeRequest = authorizeV2Request;

/** Paths that require auth for GET as well as POST. */
export const V2_AUTH_PROTECTED_PREFIXES = [
  "/api/v2/deliverable-reviews",
  "/api/v2/director/messages",
];

export function pathRequiresV2Auth(path, method) {
  if (!apiAuthRequired()) return false;
  if (gatewayRemoteMode() && String(path || "").startsWith("/api/")) {
    return !isPublicApiPath(path, method);
  }
  const protectedPath = V2_AUTH_PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  if (!protectedPath) return false;
  if (method === "POST") return true;
  if (path.includes("/conversation") || path.includes("/messages") || path.endsWith("/open") || path.includes("deliverable-reviews")) {
    return true;
  }
  return false;
}

export function tokenFingerprint(token) {
  if (!token) return null;
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

export function sessionCookieHeader(token, { secure = false, maxAgeSec = 30 * 24 * 3600 } = {}) {
  const parts = [
    `${GATEWAY_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader({ secure = false } = {}) {
  const parts = [
    `${GATEWAY_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestWantsSecureCookie(headers = {}, { encrypted = false } = {}) {
  const xf = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  // Secure only for actual HTTPS. VACILANDO_COOKIE_SECURE must not override this:
  // browsers drop Secure cookies on http://<tailnet-host> (not localhost).
  if (xf === "http") return false;
  if (xf === "https" || encrypted) return true;
  return false;
}

export function isTailscaleIPv4(host) {
  const m = String(host || "").trim().match(/^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const oct = m.slice(1).map(Number);
  if (oct.some((n) => n > 255)) return false;
  return oct[0] >= 64 && oct[0] <= 127;
}

export function assertPrivateBindHost(host) {
  const h = String(host || "127.0.0.1").trim();
  const publicBind = new Set(["0.0.0.0", "::", "[::]", "*", "::0", "0:0:0:0:0:0:0:0"]);
  if (publicBind.has(h)) {
    return { ok: false, error: "public_bind_forbidden", host: h };
  }
  if (LOOPBACK_HOSTS.has(h)) {
    return { ok: true, host: h === "localhost" ? "127.0.0.1" : h };
  }
  if (isTailscaleIPv4(h)) {
    return { ok: true, host: h, tailscale: true };
  }
  return {
    ok: false,
    error: "non_loopback_bind_forbidden",
    host: h,
    message: "Vacilando binds loopback or a Tailscale CGNAT address only.",
  };
}
