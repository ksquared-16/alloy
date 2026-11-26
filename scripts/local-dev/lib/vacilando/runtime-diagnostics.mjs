/**
 * Vacilando — runtime / execution diagnostics for Settings and desktop ownership.
 *
 * Reports whether the control plane was launched with a real execution
 * configuration (auto → Claude) and the live Claude availability state.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { precheckProvider } from "./provider-runtime.mjs";
import { readControlPlaneOwner } from "./control-plane-health.mjs";
import { listExecutionSessions } from "./execution-session.mjs";

const HOME = os.homedir();

function whichOnPath(bin) {
  const parts = (process.env.PATH || "").split(":").filter(Boolean);
  for (const d of parts) {
    const p = join(d, bin);
    if (existsSync(p)) return p;
  }
  for (const d of [join(HOME, ".local", "bin"), join(HOME, "bin"), "/opt/homebrew/bin", "/usr/local/bin"]) {
    const p = join(d, bin);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Configured provider mode from env (auto | claude | cursor | mock). */
export function configuredExecutionProvider() {
  const raw = (process.env.VACILANDO_EXECUTION_PROVIDER || "auto").trim() || "auto";
  return raw;
}

export function mockProviderAuthorized() {
  return process.env.VACILANDO_ALLOW_MOCK_PROVIDER === "1"
    || process.env.VACILANDO_EXECUTION_PROVIDER === "mock";
}

export function isDesktopOwnedProcess() {
  return process.env.VACILANDO_DESKTOP_OWNED === "1"
    || process.env.VACILANDO_OWNED === "1";
}

/**
 * Operator-facing Claude availability.
 * @returns {Promise<{state:string,label:string,detail:string,ok:boolean,bin:string|null}>}
 */
export async function diagnoseClaudeAvailability() {
  const bin = whichOnPath("claude");
  if (!bin) {
    return {
      state: "cli_unavailable",
      label: "Claude CLI unavailable",
      detail: "The `claude` binary was not found on PATH (including ~/.local/bin).",
      ok: false,
      bin: null,
    };
  }
  try {
    const auth = await precheckProvider("claude", { force: true });
    if (auth.ok) {
      return {
        state: "available",
        label: "Claude available",
        detail: auth.identity || auth.auth_state || "Authenticated and ready for execution sessions.",
        ok: true,
        bin,
        auth_state: auth.auth_state || "authenticated",
      };
    }
    if (auth.auth_required || /auth|login|credential/i.test(String(auth.error || ""))) {
      return {
        state: "auth_missing",
        label: "Claude authentication missing",
        detail: auth.error || "Claude CLI is present but not authenticated. Run `claude` and /login.",
        ok: false,
        bin,
        auth_state: auth.auth_state || "unauthenticated",
      };
    }
    return {
      state: "startup_failed",
      label: "Provider startup failed",
      detail: auth.error || "Claude precheck failed",
      ok: false,
      bin,
      auth_state: auth.auth_state || null,
    };
  } catch (e) {
    return {
      state: "startup_failed",
      label: "Provider startup failed",
      detail: String(e && e.message || e),
      ok: false,
      bin,
    };
  }
}

/**
 * Full diagnostics payload for Settings → Diagnostics and desktop attach checks.
 */
export async function buildRuntimeDiagnostics() {
  const configured = configuredExecutionProvider();
  const mockOk = mockProviderAuthorized();
  const desktopOwned = isDesktopOwnedProcess();
  const owner = readControlPlaneOwner();
  const claude = await diagnoseClaudeAvailability();

  let resolved = configured;
  if (configured === "auto") {
    resolved = claude.ok ? "claude" : (mockOk ? "mock" : "claude");
  }

  const autoDispatch = process.env.VACILANDO_AUTO_DISPATCH !== "0";
  const sessions = listExecutionSessions({ limit: 20 });
  const activeSessions = sessions.filter((s) =>
    ["queued", "starting", "running", "recovering", "awaiting_decision", "awaiting_operator", "producing_evidence", "retrying"].includes(s.status));

  const desktopCompatible = desktopOwned
    || (configured === "auto" || configured === "claude")
    && !mockOk
    && process.env.VACILANDO_EXECUTION_PROVIDER != null;

  // Finder-launched desktop always sets VACILANDO_DESKTOP_OWNED=1.
  // Bare terminal servers without that flag are not attach-compatible for the app.
  const attachCompatible = Boolean(desktopOwned)
    && (configured === "auto" || configured === "claude" || configured === "cursor")
    && configured !== "mock";

  let directorCapabilities = null;
  try {
    const { directorCapabilitiesDiagnostics } = await import("./director-capability-freshness.mjs");
    directorCapabilities = directorCapabilitiesDiagnostics();
  } catch { /* optional */ }

  const payload = {
    ok: true,
    kind: "vacilando.runtime_diagnostics.v1",
    execution: {
      configuredProvider: configured,
      resolvedProvider: resolved,
      autoDispatch,
      mockAuthorized: mockOk,
      desktopOwned,
      attachCompatible,
      desktopCompatible: attachCompatible,
    },
    claude,
    owner: owner ? {
      pid: owner.pid,
      port: owner.port,
      desktopOwned: owner.desktopOwned || false,
      executionProvider: owner.executionProvider || null,
      claimed_at: owner.claimed_at,
      worktree: owner.worktree,
    } : null,
    sessions: {
      active: activeSessions.length,
      recent: sessions.slice(0, 5).map((s) => ({
        sessionId: s.sessionId,
        status: s.status,
        missionId: s.missionId,
        activity: s.progress?.activity || null,
      })),
    },
    env: {
      VACILANDO_EXECUTION_PROVIDER: process.env.VACILANDO_EXECUTION_PROVIDER || null,
      VACILANDO_ALLOW_MOCK_PROVIDER: process.env.VACILANDO_ALLOW_MOCK_PROVIDER || null,
      VACILANDO_AUTO_DISPATCH: process.env.VACILANDO_AUTO_DISPATCH || null,
      VACILANDO_DESKTOP_OWNED: process.env.VACILANDO_DESKTOP_OWNED || null,
    },
    pid: process.pid,
    port: Number(process.env.VACILANDO_CONTROL_PLANE_PORT || owner?.port || 0) || null,
    at: new Date().toISOString(),
    directorCapabilities,
  };
  return payload;
}
