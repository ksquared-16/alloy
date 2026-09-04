/**
 * Vacilando notification preferences — the operator's own switch.
 *
 * WHAT THIS IS FOR. Push is the only channel that reaches the operator when
 * they are not looking at Vacilando, which is exactly why it is the only
 * channel they need to be able to switch off. Everything else — Needs You, the
 * Activity feed, lane state, the audit log — is something they went and looked
 * at, and turning the phone off must never make a record disappear from a
 * surface they deliberately opened.
 *
 * WHERE THE SWITCH LIVES. At delivery, not at recording. `lane-notifications`
 * writes the durable record first and treats delivery as a projection of it;
 * the preference gates the projection. That ordering is what makes the
 * guarantee below true by construction rather than by discipline:
 *
 *   OFF suppresses DELIVERY. It never suppresses a record.
 *
 * WHY THERE IS NO BACKLOG. A suppressed push is dropped, not queued. The
 * record it would have announced is already durable and already visible in the
 * app, so replaying a week of pushes when the operator switches the phone back
 * on would announce things they have long since read. Turning notifications on
 * means "tell me about what happens NEXT", which is what anyone means by it.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const NOTIFICATION_PREFS_SCHEMA = "vacilando.notification-preferences.v1";

/**
 * Push starts ON.
 *
 * The default has to preserve what the operator already experiences — an
 * upgrade that silently stops notifying is a worse failure than a noisy one,
 * because nothing tells you it happened.
 */
export const DEFAULT_PREFERENCES = Object.freeze({
  push_enabled: true,
});

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function notificationPreferencesPath(root = runtimeRoot()) {
  return join(root, "vacilando", "notification-preferences.json");
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

/**
 * Read the preferences, tolerating every shape a file on disk can be in.
 *
 * A missing, empty, truncated or hand-edited file must not silence the
 * operator's phone — an unreadable preference is not evidence that they asked
 * for silence, so every failure path falls back to the default.
 */
export function readNotificationPreferences(root = runtimeRoot()) {
  try {
    const raw = JSON.parse(readFileSync(notificationPreferencesPath(root), "utf8"));
    if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
    return {
      push_enabled: typeof raw.push_enabled === "boolean"
        ? raw.push_enabled
        : DEFAULT_PREFERENCES.push_enabled,
      updated_at: raw.updated_at || null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function pushEnabled(root = runtimeRoot()) {
  return readNotificationPreferences(root).push_enabled !== false;
}

export function setPushEnabled(enabled, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const next = {
    schema_version: NOTIFICATION_PREFS_SCHEMA,
    push_enabled: Boolean(enabled),
    updated_at: new Date(nowMs).toISOString(),
  };
  atomicWrite(notificationPreferencesPath(root), next);
  return next;
}

/** The shape the client renders the toggle from. */
export function publicNotificationPreferences(root = runtimeRoot()) {
  const prefs = readNotificationPreferences(root);
  return {
    push_enabled: prefs.push_enabled !== false,
    updated_at: prefs.updated_at || null,
  };
}

export function resetNotificationPreferencesForTests(root = runtimeRoot()) {
  try {
    atomicWrite(notificationPreferencesPath(root), {
      schema_version: NOTIFICATION_PREFS_SCHEMA,
      ...DEFAULT_PREFERENCES,
      updated_at: null,
    });
  } catch { /* tests may run without a writable root */ }
}
