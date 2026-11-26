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
  categories: Object.freeze({
    needs_you: true,
    failures: true,
    completions: false,
  }),
});

/**
 * THE CATEGORIES, AND WHY COMPLETIONS START OFF.
 *
 * Measured on the 500-record store: of the 252 events the policy makes
 * push-eligible, 185 are completions — 73%. The automation everyone suspected
 * pushes nothing at all. So "too many phone notifications" was, all along,
 * almost entirely the sound of work finishing.
 *
 * A completion is worth knowing and rarely worth waking up for: the work is
 * done, nothing is blocked, and it will still be done in the morning. It stays
 * in Needs You, Activity and the lane exactly as before — only the phone stops
 * buzzing for it. The two categories that remain on are the ones where NOT
 * telling someone has a cost: a decision that is blocking work, and a failure
 * that needs recovering.
 *
 * An operator who wants completions back gets them with one checkbox.
 */
export const NOTIFICATION_CATEGORIES = Object.freeze(["needs_you", "failures", "completions"]);

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
      categories: normalizeCategories(raw.categories),
      updated_at: raw.updated_at || null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, categories: { ...DEFAULT_PREFERENCES.categories } };
  }
}

/** An unknown or malformed category map falls back per-key, never wholesale. */
function normalizeCategories(raw) {
  const out = { ...DEFAULT_PREFERENCES.categories };
  if (raw && typeof raw === "object") {
    for (const key of NOTIFICATION_CATEGORIES) {
      if (typeof raw[key] === "boolean") out[key] = raw[key];
    }
  }
  return out;
}

/**
 * Which preference governs this push?
 *
 * Derived from the payload TYPE, which every push path already sets, so a new
 * path cannot accidentally arrive uncategorised and bypass the preference.
 * Anything unrecognised is treated as needs_you — the safe direction, because
 * the failure mode is a notification the operator did not need rather than a
 * blocked decision they never heard about.
 */
export function categoryForPush(payload = {}) {
  const type = String(payload.type || "").toLowerCase();
  const state = String(payload.state || "").toUpperCase();
  if (type.startsWith("governed_action.")) return "needs_you";
  if (state === "NEEDS_INPUT") return "needs_you";
  if (state === "FAILED" || state === "ABANDONED") return "failures";
  if (state === "COMPLETE") return "completions";
  return "needs_you";
}

export function pushAllowedForCategory(category, root = runtimeRoot()) {
  const prefs = readNotificationPreferences(root);
  if (prefs.push_enabled === false) return false;
  const cats = prefs.categories || DEFAULT_PREFERENCES.categories;
  return cats[category] !== false;
}

export function pushEnabled(root = runtimeRoot()) {
  return readNotificationPreferences(root).push_enabled !== false;
}

export function setPushEnabled(enabled, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const current = readNotificationPreferences(root);
  const next = {
    schema_version: NOTIFICATION_PREFS_SCHEMA,
    push_enabled: Boolean(enabled),
    categories: current.categories || { ...DEFAULT_PREFERENCES.categories },
    updated_at: new Date(nowMs).toISOString(),
  };
  atomicWrite(notificationPreferencesPath(root), next);
  return next;
}

/** Set one or more category preferences, leaving the others as they were. */
export function setNotificationCategories(patch = {}, { nowMs = Date.now(), root = runtimeRoot() } = {}) {
  const current = readNotificationPreferences(root);
  const categories = { ...(current.categories || DEFAULT_PREFERENCES.categories) };
  for (const key of NOTIFICATION_CATEGORIES) {
    if (typeof patch[key] === "boolean") categories[key] = patch[key];
  }
  const next = {
    schema_version: NOTIFICATION_PREFS_SCHEMA,
    push_enabled: current.push_enabled !== false,
    categories,
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
    categories: prefs.categories || { ...DEFAULT_PREFERENCES.categories },
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
