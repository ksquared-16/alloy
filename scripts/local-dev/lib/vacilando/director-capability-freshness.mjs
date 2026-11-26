/**
 * Director capability freshness — Vacilando owns control-plane currency.
 *
 * A long-lived Director process can hold an ES-module snapshot of the
 * governed-action registry that is older than the on-disk catalog. That is
 * not "unsupported" and not the operator's job to diagnose (no PIDs,
 * no launchctl, no "restart the Director").
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

import {
  classifyActionAvailability,
  directorRegistryFreshness,
  loadedRegistrySnapshot,
  setLoadedRegistryForTests,
} from "./trusted-host-action-registry.mjs";

export const DIRECTOR_REFRESH_EXIT_CODE = 78;
export const DIRECTOR_CAPABILITY_STATUS_FILE = "vacilando/director-capabilities.json";

export const DIRECTOR_FRESHNESS_STATES = Object.freeze([
  "current",
  "stale",
  "refreshing",
  "refresh_failed",
]);

let refreshHandlerForTests = null;
let exitTimer = null;

function runtimeRoot(root = null) {
  return root
    || process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

function statusPath(root) {
  return join(runtimeRoot(root), DIRECTOR_CAPABILITY_STATUS_FILE);
}

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

function emptyStatus() {
  const loaded = loadedRegistrySnapshot();
  return {
    schema_version: "vacilando.director_capabilities.v1",
    state: "current",
    loaded_fingerprint: loaded.fingerprint,
    disk_fingerprint: loaded.fingerprint,
    loaded_action_keys: loaded.actionKeys,
    disk_action_keys: loaded.actionKeys,
    process_started_at: loaded.startedAt,
    last_refresh_at: null,
    last_refresh_reason: null,
    last_refresh_mode: null,
    last_refresh_error: null,
    operator_action: null,
    updated_at: iso(),
  };
}

export function readDirectorCapabilityStatus(root = null) {
  try {
    const raw = JSON.parse(readFileSync(statusPath(root), "utf8"));
    if (!raw || typeof raw !== "object") return emptyStatus();
    return { ...emptyStatus(), ...raw };
  } catch {
    return emptyStatus();
  }
}

function writeStatus(rec, root = null) {
  const path = statusPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

export function persistDirectorCapabilityStatus(patch = {}, { root = null, nowMs = Date.now() } = {}) {
  const prev = readDirectorCapabilityStatus(root);
  const next = {
    ...prev,
    ...patch,
    updated_at: iso(nowMs),
  };
  return writeStatus(next, root);
}

export function operatorDirectorCopy(state = "current") {
  if (state === "refreshing" || state === "stale") {
    return {
      mission_label: "Updating Director",
      lane_label: "Waiting on Director — updating governed capabilities",
      headline: "Updating Director",
      detail: "Vacilando is updating Director so it can run the requested governed action. You do not need to restart anything.",
    };
  }
  if (state === "refresh_failed") {
    return {
      mission_label: "Director update needed",
      lane_label: "Waiting on Director — update needed",
      headline: "Vacilando needs to refresh Director",
      detail: "A newly available governed capability is not loaded yet. Refresh Director to continue. You do not need a terminal.",
      action_label: "Refresh Director",
    };
  }
  return {
    mission_label: null,
    lane_label: "Waiting on Director",
    headline: null,
    detail: null,
  };
}

export function directorCapabilitiesDiagnostics(root = null) {
  const live = directorRegistryFreshness();
  const stored = readDirectorCapabilityStatus(root);
  const state = stored.state === "refreshing"
    ? "refreshing"
    : (stored.state === "refresh_failed" ? "refresh_failed" : (live.stale ? "stale" : "current"));
  const copy = operatorDirectorCopy(state);
  return {
    kind: "director_capabilities",
    state,
    healthy: state === "current",
    stale: state === "stale" || live.stale,
    loaded_fingerprint: live.loaded.fingerprint,
    current_fingerprint: live.disk.fingerprint,
    loaded_action_keys: live.loaded.actionKeys,
    current_action_keys: live.disk.actionKeys,
    missing_from_loaded: live.missingFromLoaded,
    process_started_at: live.processStartedAt,
    process_age_ms: live.processAgeMs,
    last_refresh_at: stored.last_refresh_at,
    last_refresh_reason: stored.last_refresh_reason,
    last_refresh_mode: stored.last_refresh_mode,
    operator_action: state === "refresh_failed"
      ? { kind: "refresh_director", label: copy.action_label }
      : null,
    copy,
  };
}

export function setDirectorRefreshHandlerForTests(fn) {
  refreshHandlerForTests = typeof fn === "function" ? fn : null;
}

export function resetDirectorFreshnessForTests(root = null) {
  refreshHandlerForTests = null;
  if (exitTimer) {
    clearTimeout(exitTimer);
    exitTimer = null;
  }
  setLoadedRegistryForTests(null);
  try {
    writeStatus(emptyStatus(), root);
  } catch { /* */ }
}

function canExitRefresh() {
  return process.env.VACILANDO_GATEWAY_HOST === "1"
    || process.env.VACILANDO_DIRECTOR_REFRESH === "exit78";
}

function canLaunchdRefresh() {
  return process.env.VACILANDO_DIRECTOR_REFRESH === "launchd";
}

function launchdKickstart() {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid == null) return { ok: false, error: "no_uid" };
  const label = process.env.VACILANDO_LAUNCHD_LABEL || "com.alloy.vacilando-gateway";
  const target = `gui/${uid}/${label}`;
  return new Promise((resolve) => {
    const child = spawn("launchctl", ["kickstart", "-k", target], { stdio: "ignore" });
    child.on("exit", (code) => resolve({ ok: code === 0, code }));
    child.on("error", (e) => resolve({ ok: false, error: String(e.message || e) }));
  });
}

/**
 * Refresh Director so the loaded governed-action catalog matches disk.
 * Tests inject a handler. The Gateway host respawns on exit 78.
 * launchd kickstart is explicit opt-in so tests never bounce the live Gateway.
 */
export async function refreshDirectorCapabilities({
  reason = "director_registry_stale",
  requestId = null,
  root = null,
  nowMs = Date.now(),
  allowExit = true,
} = {}) {
  const live = directorRegistryFreshness();
  persistDirectorCapabilityStatus({
    state: "refreshing",
    loaded_fingerprint: live.loaded.fingerprint,
    disk_fingerprint: live.disk.fingerprint,
    loaded_action_keys: live.loaded.actionKeys,
    disk_action_keys: live.disk.actionKeys,
    last_refresh_reason: reason,
    last_refresh_error: null,
    operator_action: null,
    request_id: requestId,
  }, { root, nowMs });

  if (typeof refreshHandlerForTests === "function") {
    const out = await refreshHandlerForTests({ reason, requestId, root, nowMs });
    const after = directorRegistryFreshness();
    persistDirectorCapabilityStatus({
      state: after.stale ? "stale" : "current",
      loaded_fingerprint: after.loaded.fingerprint,
      disk_fingerprint: after.disk.fingerprint,
      loaded_action_keys: after.loaded.actionKeys,
      disk_action_keys: after.disk.actionKeys,
      last_refresh_at: iso(nowMs),
      last_refresh_reason: reason,
      last_refresh_mode: "test_handler",
      last_refresh_error: after.stale ? (out?.error || "still_stale") : null,
    }, { root, nowMs });
    return { ok: !after.stale, mode: "test_handler", ...out, stale: after.stale };
  }

  if (canLaunchdRefresh()) {
    const out = await launchdKickstart();
    persistDirectorCapabilityStatus({
      last_refresh_mode: "launchd",
      last_refresh_error: out.ok ? null : (out.error || "launchd_refresh_failed"),
      state: out.ok ? "refreshing" : "refresh_failed",
      operator_action: out.ok ? null : { kind: "refresh_director", label: "Refresh Director" },
    }, { root, nowMs });
    return { ok: out.ok, mode: "launchd", scheduled: out.ok };
  }

  if (allowExit && canExitRefresh()) {
    persistDirectorCapabilityStatus({
      last_refresh_mode: "host_child_refresh",
      last_refresh_at: iso(nowMs),
    }, { root, nowMs });
    if (!exitTimer) {
      exitTimer = setTimeout(() => {
        process.exit(DIRECTOR_REFRESH_EXIT_CODE);
      }, 50);
      exitTimer.unref?.();
    }
    return { ok: true, mode: "host_child_refresh", scheduled: true };
  }

  persistDirectorCapabilityStatus({
    state: "refresh_failed",
    last_refresh_mode: "unavailable",
    last_refresh_error: "refresh_unavailable",
    operator_action: { kind: "refresh_director", label: "Refresh Director" },
  }, { root, nowMs });
  return {
    ok: false,
    mode: "unavailable",
    error: "refresh_unavailable",
    operator_action: { kind: "refresh_director", label: "Refresh Director" },
  };
}

export function markDirectorCapabilitiesCurrent({ root = null, nowMs = Date.now(), reason = "boot" } = {}) {
  const live = directorRegistryFreshness();
  return persistDirectorCapabilityStatus({
    state: live.stale ? "stale" : "current",
    loaded_fingerprint: live.loaded.fingerprint,
    disk_fingerprint: live.disk.fingerprint,
    loaded_action_keys: live.loaded.actionKeys,
    disk_action_keys: live.disk.actionKeys,
    last_refresh_at: reason === "boot" ? readDirectorCapabilityStatus(root).last_refresh_at : iso(nowMs),
    last_refresh_reason: reason,
    last_refresh_error: live.stale ? "registry_still_stale" : null,
    operator_action: live.stale ? { kind: "refresh_director", label: "Refresh Director" } : null,
  }, { root, nowMs });
}

export function classifyGovernedActionFailure(actionKey, { loadedMissing = false } = {}) {
  const avail = classifyActionAvailability(actionKey);
  if (avail.code === "available" && !loadedMissing) return { code: "available" };
  if (avail.code === "director_registry_stale" || (loadedMissing && avail.onDisk)) {
    return { code: "director_registry_stale", actionKey };
  }
  if (avail.code === "unsupported_action_key") {
    return { code: "unsupported_action_key", actionKey };
  }
  return avail;
}

export { classifyActionAvailability, directorRegistryFreshness };
