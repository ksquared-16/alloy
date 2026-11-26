/**
 * Provider health — stale login and update-required, for Claude and Cursor.
 *
 * A lane can be perfectly healthy by every durable signal Vacilando tracks —
 * tmux alive, worktree clean, run EXECUTING — while the agent inside it is
 * sitting on a login prompt or refusing to start until it updates. Nothing then
 * moves, and Vacilando has no way to say why.
 *
 * WHAT THIS IS. A bounded read of already-captured pane text for a small set of
 * distinctive, anchored provider phrases. It is NOT a TUI parser: it never reads
 * spinner or prompt glyphs, never infers run state, and never influences
 * abandonment classification. Its only outputs are an operator-facing banner and
 * one notification.
 *
 * WHY IT IS ALLOWED TO READ TEXT. Execution Run state is decided exclusively
 * from durable JSON facts (see execution-stale.mjs). This module decides
 * nothing about a run. A false positive here shows the operator a banner they
 * can dismiss; it cannot terminalize work.
 */

export const PROVIDER_HEALTH_KINDS = Object.freeze(["login_required", "update_required", "usage_limit"]);

/** Anchored phrases. Deliberately narrow — a near-miss must produce nothing. */
const SIGNATURES = Object.freeze([
  {
    kind: "login_required",
    provider: "claude",
    patterns: [
      /invalid api key[^\n]{0,40}(please run|run)\s*\/login/i,
      /please run\s*\/login\s*to (log ?in|authenticate)/i,
      /your session has expired[^\n]{0,40}\/login/i,
      /oauth token (has )?expired/i,
      /not (logged in|authenticated)[^\n]{0,30}\/login/i,
    ],
  },
  {
    kind: "login_required",
    provider: "cursor",
    patterns: [
      /cursor-agent\s+login/i,
      /run\s+`?cursor-agent login`?\s+to (log ?in|authenticate)/i,
      /you are not (logged in|signed in) to cursor/i,
      /cursor[^\n]{0,30}(session|token) (has )?expired/i,
    ],
  },
  {
    kind: "update_required",
    provider: "claude",
    patterns: [
      /please (update|upgrade)[^\n]{0,30}claude code/i,
      /a new version of claude code is required/i,
      /restart claude code to (apply|finish) the update/i,
      /this version of claude code is no longer supported/i,
    ],
  },
  {
    kind: "update_required",
    provider: "cursor",
    patterns: [
      /please (update|upgrade)[^\n]{0,30}cursor[- ]agent/i,
      /restart cursor[- ]agent to (apply|finish) the update/i,
      /this version of cursor[- ]agent is no longer supported/i,
    ],
  },
  {
    kind: "usage_limit",
    provider: null,
    patterns: [
      /usage limit reached[^\n]{0,40}resets? at/i,
      /you have (reached|hit) your (usage|rate) limit/i,
    ],
  },
]);

/** How the operator fixes it, per provider. Commands only — no prose padding. */
export function providerHealthFix(kind, provider) {
  const p = String(provider || "").toLowerCase();
  if (kind === "login_required") {
    if (p === "cursor") {
      return { command: "cursor-agent login", detail: "Run this in the lane's tmux session, then resend the instruction." };
    }
    return { command: "/login", detail: "Type this in the lane's Claude session, then resend the instruction." };
  }
  if (kind === "update_required") {
    if (p === "cursor") {
      return { command: "cursor-agent upgrade", detail: "Update, then restart the lane's session." };
    }
    return { command: "claude update", detail: "Update, then restart the lane's session." };
  }
  if (kind === "usage_limit") {
    return { command: null, detail: "Wait for the limit to reset, or switch this lane to another provider." };
  }
  return { command: null, detail: null };
}

function titleFor(kind, who) {
  if (kind === "login_required") return `${who} needs you to sign in again`;
  if (kind === "update_required") return `${who} needs to update and restart`;
  if (kind === "usage_limit") return `${who} hit a usage limit`;
  return `${who} needs attention`;
}

/**
 * @param {string} text captured pane output
 * @param {{provider?: string|null}} opts the lane's known provider, when any
 * @returns {null|{kind,provider,title,detail,fix_command,signal}}
 */
export function detectProviderHealth(text, { provider = null } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  // Only the tail matters: these prompts are what the agent is showing NOW.
  // Scanning the whole scrollback would resurrect a login prompt the operator
  // already cleared.
  const tail = raw.length > 4000 ? raw.slice(-4000) : raw;
  const laneProvider = String(provider || "").toLowerCase() || null;

  for (const sig of SIGNATURES) {
    // A provider-specific signature never fires on a lane known to be the other
    // provider: a Cursor lane must not be told to run /login.
    if (sig.provider && laneProvider && sig.provider !== laneProvider) continue;
    for (const re of sig.patterns) {
      const m = tail.match(re);
      if (!m) continue;
      const resolved = sig.provider || laneProvider || null;
      const who = resolved === "cursor" ? "Cursor" : (resolved === "claude" ? "Claude" : "The agent");
      const fix = providerHealthFix(sig.kind, resolved);
      return {
        kind: sig.kind,
        provider: resolved,
        title: titleFor(sig.kind, who),
        detail: fix.detail,
        fix_command: fix.command,
        signal: String(m[0]).slice(0, 120),
      };
    }
  }
  return null;
}

/** Stable key so one condition notifies once per lane, not once per poll. */
export function providerHealthKey(laneId, health) {
  if (!health?.kind) return null;
  return `${String(laneId || "")}:${health.kind}:${health.provider || "unknown"}`;
}

export function providerHealthPushPayload(laneId, health) {
  if (!health?.kind) return null;
  const id = String(laneId || "").trim();
  return {
    type: `provider_health.${health.kind}`,
    lane_id: id || null,
    title: health.title,
    body: health.fix_command
      ? `${health.detail} Run: ${health.fix_command}`
      : String(health.detail || "Open the lane to continue."),
    state: health.kind.toUpperCase(),
    path: id ? `/#/lanes/${encodeURIComponent(id)}` : "/#/lanes",
  };
}
