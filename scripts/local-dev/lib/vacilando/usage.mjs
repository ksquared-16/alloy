/**
 * Vacilando Runtime — provider usage & cost (Slice 3 · dashboard).
 *
 * Aggregates AUTHORITATIVE usage from real Director round-trips (recorded in the
 * director logs). Cursor reports tokens; Claude reports tokens + cost when
 * authenticated. Cost is shown ONLY when a provider reports it (authoritative)
 * or when a configured pricing table can compute it; otherwise "unavailable".
 * Nothing is invented.
 */
import { readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { resolveCivilDayWindow, withinCivilDay } from "./civil-day.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "director");

// Config-owned pricing table (USD per 1M tokens). Only providers listed here
// get a *calculated* cost estimate; others show cost as authoritative-or-none.
const PRICING = {
  // claude reports authoritative cost directly, so no estimate needed.
  // cursor does not report cost; no public authoritative per-token price → estimate unavailable.
};

/*
 * "TODAY" IS THE OPERATOR'S CIVIL DAY, NOT UTC'S.
 *
 * This counted a round trip as "today" when its UTC date matched, so from
 * 17:00 Pacific every call landed in tomorrow and `calls_today` reset seven
 * hours early. The caller passes the window it is already using for the rest
 * of the response, so no two counters in one payload can mean different days.
 *
 * When the day cannot be named - no configured zone - the counts are NULL and
 * the reason is stated. They are not zero, and they are certainly not a UTC
 * day wearing the operator's label.
 */
export function collectUsage({ civilDay = null } = {}) {
  const win = civilDay || resolveCivilDayWindow();
  const dayKnown = win?.ok === true;
  const byProvider = {};
  let files = [];
  try { files = readdirSync(DIR).filter((f) => f.endsWith(".jsonl")); } catch { /* none */ }
  for (const f of files) {
    let lines = [];
    try { lines = readFileSync(join(DIR, f), "utf8").split("\n").filter(Boolean); } catch { continue; }
    for (const line of lines) {
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (r.delivery !== "provider-round-trip") continue;
      const p = r.provider || "unknown";
      const b = (byProvider[p] ||= { provider: p, calls: 0, calls_today: 0, input_tokens: 0, output_tokens: 0, cost_usd_authoritative: 0, has_cost: false, durations: [], failures: 0, last_ok: null, auth_state: "unknown" });
      b.calls++;
      if (dayKnown && withinCivilDay(win, r.occurred_at)) b.calls_today++;
      if (r.usage) {
        b.input_tokens += r.usage.input_tokens || 0;
        b.output_tokens += r.usage.output_tokens || 0;
        if (r.usage.cost_usd != null) { b.cost_usd_authoritative += r.usage.cost_usd; b.has_cost = true; }
      }
      if (r.duration_ms) b.durations.push(r.duration_ms);
      if (r.response_ok === false) { b.failures++; if (/oauth|auth|expired|log ?in/i.test(r.response_error || "")) b.auth_state = "needs_auth"; }
      else { b.last_ok = r.occurred_at; if (b.auth_state !== "needs_auth") b.auth_state = "authenticated"; }
    }
  }
  const providers = Object.values(byProvider).map((b) => {
    const avg = b.durations.length ? Math.round(b.durations.reduce((a, c) => a + c, 0) / b.durations.length) : null;
    // Optional estimate from PRICING (none configured → estimate unavailable).
    const est = PRICING[b.provider] ? ((b.input_tokens / 1e6) * PRICING[b.provider].in + (b.output_tokens / 1e6) * PRICING[b.provider].out) : null;
    return {
      provider: b.provider, calls: b.calls, calls_today: dayKnown ? b.calls_today : null,
      input_tokens: b.input_tokens, output_tokens: b.output_tokens,
      cost: b.has_cost ? { value_usd: Math.round(b.cost_usd_authoritative * 1e4) / 1e4, kind: "authoritative" }
        : est != null ? { value_usd: Math.round(est * 1e4) / 1e4, kind: "estimate" }
          : { value_usd: null, kind: "unavailable" },
      avg_duration_ms: avg, failures: b.failures, last_ok: b.last_ok, auth_state: b.auth_state,
    };
  }).sort((a, b) => b.calls - a.calls);
  return {
    providers,
    total_calls: providers.reduce((a, p) => a + p.calls, 0),
    total_calls_today: dayKnown ? providers.reduce((a, p) => a + (p.calls_today || 0), 0) : null,
    civil_day: dayKnown
      ? { day: win.day, timezone: win.timezone, window_start: win.start, window_end: win.end }
      : { day: null, timezone: null, reason: win?.reason ?? "timezone_not_configured", setting: "VACILANDO_REPORT_TIMEZONE" },
    cost_note: "Cost is authoritative only when the provider reports it (Claude when authenticated). Cursor reports tokens but no cost; no pricing table is configured → cost unavailable, never estimated blindly.",
  };
}
