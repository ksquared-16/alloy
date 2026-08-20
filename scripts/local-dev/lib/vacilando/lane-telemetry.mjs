/**
 * Provider-neutral Development Lane agent telemetry.
 *
 * The lane object stays independent of any Claude session id. Adapters are
 * isolated under providers/<id>/telemetry. Missing/malformed data fails soft.
 */
import { collectClaudeSessionTelemetry } from "./providers/claude/telemetry.mjs";

export const LANE_TELEMETRY_SCHEMA = "vacilando.lane.agent_telemetry.v1";
export const TELEMETRY_TTL_MS = 15_000;

const ttlCache = new Map();
const inflight = new Map();

export function resetLaneTelemetryCacheForTests() {
  ttlCache.clear();
  inflight.clear();
}

/** Return a TTL-fresh sample without resolving tmux or scanning transcripts. */
export function peekLaneTelemetryCache(lane_id, { nowMs = Date.now(), ttlMs = TELEMETRY_TTL_MS } = {}) {
  if (!lane_id) return null;
  const prefix = `${lane_id}::`;
  for (const [key, hit] of ttlCache) {
    if (!key.startsWith(prefix)) continue;
    if ((nowMs - hit.at) < ttlMs) return hit.value;
  }
  return null;
}

export function unavailableTelemetry({ lane_id = null, provider = null, error = "unavailable", nowMs = Date.now() } = {}) {
  return {
    ok: true,
    available: false,
    schema_version: LANE_TELEMETRY_SCHEMA,
    lane_id,
    provider,
    error,
    source: null,
    agent: {
      session_id: null,
      model: null,
      started_at: null,
      last_usage_at: null,
    },
    context: {
      used_tokens: null,
      max_tokens: null,
      max_source: null,
      percent_used: null,
    },
    usage: {
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      assistant_turns: null,
    },
    cost: {
      reported_usd: null,
      estimated_usd: null,
      billing_mode: null,
      extra_usage_enabled: null,
    },
    observed_at: new Date(nowMs).toISOString(),
  };
}

export function normalizeTelemetry(raw, { lane_id, nowMs = Date.now() } = {}) {
  if (!raw || raw.available === false) {
    return unavailableTelemetry({
      lane_id,
      provider: raw?.provider || null,
      error: raw?.error || "unavailable",
      nowMs,
    });
  }
  const agent = raw.agent || {};
  const context = raw.context || {};
  const usage = raw.usage || {};
  const cost = raw.cost || {};
  return {
    ok: true,
    available: true,
    schema_version: LANE_TELEMETRY_SCHEMA,
    lane_id: lane_id || null,
    provider: raw.provider || null,
    error: null,
    source: raw.source || null,
    agent: {
      session_id: agent.session_id || null,
      model: agent.model || null,
      started_at: agent.started_at || null,
      last_usage_at: agent.last_usage_at || null,
    },
    context: {
      used_tokens: context.used_tokens ?? null,
      max_tokens: context.max_tokens ?? null,
      max_source: context.max_source || null,
      percent_used: context.percent_used ?? null,
    },
    usage: {
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      cache_read_tokens: usage.cache_read_tokens ?? null,
      cache_write_tokens: usage.cache_write_tokens ?? null,
      assistant_turns: usage.assistant_turns ?? null,
    },
    cost: {
      reported_usd: cost.reported_usd ?? null,
      estimated_usd: cost.estimated_usd ?? null,
      billing_mode: cost.billing_mode || null,
      extra_usage_enabled: cost.extra_usage_enabled ?? null,
    },
    observed_at: raw.observed_at || new Date(nowMs).toISOString(),
  };
}

function cacheKey(lane) {
  return `${lane?.lane_id || ""}::${lane?.worktree?.path || ""}`;
}

export async function getLaneAgentTelemetry(lane, {
  nowMs = Date.now(),
  ttlMs = TELEMETRY_TTL_MS,
  collectClaude = collectClaudeSessionTelemetry,
} = {}) {
  const lane_id = lane?.lane_id || null;
  if (!lane_id) return unavailableTelemetry({ error: "invalid_lane_id", nowMs });
  const cwd = lane?.worktree?.path || lane?.tmux?.cwd || null;
  if (!cwd) return unavailableTelemetry({ lane_id, provider: "claude", error: "no_cwd", nowMs });
  if (lane?.claude?.presence !== "present" && lane?.tmux?.alive === false) {
    return unavailableTelemetry({ lane_id, provider: "claude", error: "offline", nowMs });
  }

  const key = cacheKey(lane);
  const hit = ttlCache.get(key);
  if (hit && (nowMs - hit.at) < ttlMs) return hit.value;

  if (inflight.has(key)) return inflight.get(key);

  const job = Promise.resolve()
    .then(() => collectClaude({ cwd, nowMs }))
    .then((raw) => {
      const value = normalizeTelemetry(raw, { lane_id, nowMs });
      ttlCache.set(key, { at: nowMs, value });
      return value;
    })
    .catch(() => unavailableTelemetry({ lane_id, provider: "claude", error: "telemetry_failed", nowMs }))
    .finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}
