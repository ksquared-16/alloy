/**
 * Vacilando Gateway — bounded per-lane operator interaction state.
 *
 * Stores only instructions actually delivered through Vacilando. Not a Claude
 * transcript, not a chat history, not operational truth for the session.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { LANE_ID_RE, LANE_INSTRUCTION_MAX } from "./lanes.mjs";
import { canonicalLaneStoreId } from "./development-lane.mjs";

export const LANE_RUNTIME_SCHEMA = "vacilando.lane.runtime.v1";
export const LANE_RUNTIME_MAX_LANES = 32;
export const SEND_BASELINE_WINDOW_MS = 30_000;
export const OUTPUT_QUIESCE_MS = 20_000;

function runtimeRoot() {
  return process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(homedir(), ".local", "state", "alloy-dev");
}

export function laneRuntimeStorePath(root = runtimeRoot()) {
  return join(root, "vacilando", "lane-runtime", "sends.json");
}

function emptyStore() {
  return { schema_version: LANE_RUNTIME_SCHEMA, lanes: {} };
}

export function readLaneRuntimeStore(root = runtimeRoot()) {
  const path = laneRuntimeStorePath(root);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    const lanes = raw.lanes && typeof raw.lanes === "object" ? raw.lanes : {};
    return { schema_version: LANE_RUNTIME_SCHEMA, lanes };
  } catch {
    return emptyStore();
  }
}

function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function pruneLanes(lanes) {
  const ids = Object.keys(lanes);
  if (ids.length <= LANE_RUNTIME_MAX_LANES) return lanes;
  const ranked = ids
    .map((id) => ({ id, at: Date.parse(lanes[id]?.delivered_at) || 0 }))
    .sort((a, b) => b.at - a.at)
    .slice(0, LANE_RUNTIME_MAX_LANES);
  const next = {};
  for (const { id } of ranked) next[id] = lanes[id];
  return next;
}

export function publicLastInstruction(rec) {
  if (!rec || rec.status !== "delivered") return null;
  const instruction = String(rec.instruction || "");
  if (!instruction) return null;
  return {
    instruction,
    delivered_at: rec.delivered_at || null,
    status: "delivered",
    instruction_size: Number.isInteger(rec.instruction_size) ? rec.instruction_size : instruction.length,
    output_fingerprint_at_send: rec.output_fingerprint_at_send || null,
  };
}

export function readLaneInstruction(laneId, root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  if (!LANE_ID_RE.test(id) && !LANE_ID_RE.test(requested)) return null;
  const store = readLaneRuntimeStore(root);
  return publicLastInstruction(store.lanes[id] || store.lanes[requested]);
}

/**
 * Record a successful Vacilando delivery. Failed / duplicate / refused sends
 * must not call this.
 */
export function recordDeliveredInstruction(laneId, rec, root = runtimeRoot()) {
  const id = canonicalLaneStoreId(laneId, root);
  if (!LANE_ID_RE.test(id)) return { ok: false, error: "invalid_lane_id" };
  const instruction = String(rec?.instruction || "");
  if (!instruction.trim()) return { ok: false, error: "instruction_empty" };
  if (instruction.length > LANE_INSTRUCTION_MAX) return { ok: false, error: "instruction_too_large" };
  if (rec?.status && rec.status !== "delivered") return { ok: false, error: "not_delivered" };

  const store = readLaneRuntimeStore(root);
  store.lanes[id] = {
    instruction,
    delivered_at: rec.delivered_at || new Date().toISOString(),
    status: "delivered",
    instruction_size: Number.isInteger(rec.instruction_size) ? rec.instruction_size : instruction.length,
    output_fingerprint_at_send: rec.output_fingerprint_at_send || null,
    activity_fingerprint: null,
    activity_at: null,
    notification_emitted_at: null,
  };
  store.lanes = pruneLanes(store.lanes);
  atomicWrite(laneRuntimeStorePath(root), store);
  return { ok: true, last_instruction: publicLastInstruction(store.lanes[id]) };
}

/**
 * First output capture shortly after a send becomes the baseline fingerprint.
 * Later captures with a different fingerprint are "activity after instruction".
 */
export function maybeSetSendBaseline(laneId, fingerprint, nowMs = Date.now(), root = runtimeRoot()) {
  const requested = String(laneId || "");
  const id = canonicalLaneStoreId(requested, root);
  const fp = fingerprint ? String(fingerprint) : "";
  if ((!LANE_ID_RE.test(id) && !LANE_ID_RE.test(requested)) || !fp) return null;
  const store = readLaneRuntimeStore(root);
  const rec = store.lanes[id] || store.lanes[requested];
  if (!rec || rec.status !== "delivered") return publicLastInstruction(rec);
  if (rec.output_fingerprint_at_send) return publicLastInstruction(rec);
  const deliveredMs = Date.parse(rec.delivered_at);
  if (!Number.isFinite(deliveredMs) || nowMs - deliveredMs > SEND_BASELINE_WINDOW_MS) {
    return publicLastInstruction(rec);
  }
  rec.output_fingerprint_at_send = fp;
  atomicWrite(laneRuntimeStorePath(root), store);
  return publicLastInstruction(rec);
}

export function attachLaneInstructions(lanes, root = runtimeRoot()) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const store = readLaneRuntimeStore(root);
  return list.map((lane) => {
    const last = publicLastInstruction(
      store.lanes[lane?.lane_id]
      || store.lanes[canonicalLaneStoreId(lane?.lane_id, root)]
      || (lane?.aliases || []).map((a) => store.lanes[a]).find(Boolean)
    );
    return last ? { ...lane, last_instruction: last } : lane;
  });
}

export function enrichOutputRuntime(output, root = runtimeRoot()) {
  if (!output || !output.lane_id) return output;
  const last = output.fingerprint
    ? maybeSetSendBaseline(output.lane_id, output.fingerprint, Date.now(), root)
    : readLaneInstruction(output.lane_id, root);
  if (!last) return output;
  return { ...output, last_instruction: last };
}

/**
 * Server-side V1: one notification per delivered instruction, the first time
 * the output fingerprint differs from the post-send baseline.
 */
export function noteOutputAfterInstruction(laneId, fingerprint, nowMs = Date.now(), root = runtimeRoot()) {
  const id = String(laneId || "");
  const fp = fingerprint ? String(fingerprint) : "";
  if (!LANE_ID_RE.test(id) || !fp) {
    return { ok: false, notify: false, reason: "invalid" };
  }
  const store = readLaneRuntimeStore(root);
  const rec = store.lanes[id];
  if (!rec || rec.status !== "delivered") {
    return { ok: true, notify: false, reason: "no_instruction" };
  }
  if (!rec.output_fingerprint_at_send) {
    const deliveredMs = Date.parse(rec.delivered_at);
    if (Number.isFinite(deliveredMs) && nowMs - deliveredMs <= SEND_BASELINE_WINDOW_MS) {
      rec.output_fingerprint_at_send = fp;
      atomicWrite(laneRuntimeStorePath(root), store);
      return { ok: true, notify: false, reason: "baseline_set", last_instruction: publicLastInstruction(rec) };
    }
    return { ok: true, notify: false, reason: "no_baseline" };
  }
  if (fp === rec.output_fingerprint_at_send) {
    return { ok: true, notify: false, reason: "unchanged" };
  }
  if (rec.notification_emitted_at) {
    return { ok: true, notify: false, reason: "already_emitted" };
  }
  if (rec.pending_fingerprint !== fp) {
    rec.pending_fingerprint = fp;
    rec.pending_fingerprint_at = new Date(nowMs).toISOString();
    rec.activity_fingerprint = fp;
    rec.activity_at = rec.pending_fingerprint_at;
    atomicWrite(laneRuntimeStorePath(root), store);
    return { ok: true, notify: false, reason: "output_still_changing", last_instruction: publicLastInstruction(rec) };
  }
  const pendingMs = Date.parse(rec.pending_fingerprint_at || "");
  if (!Number.isFinite(pendingMs) || nowMs - pendingMs < OUTPUT_QUIESCE_MS) {
    return { ok: true, notify: false, reason: "output_settling", last_instruction: publicLastInstruction(rec) };
  }
  rec.activity_fingerprint = fp;
  rec.activity_at = new Date(nowMs).toISOString();
  rec.notification_emitted_at = new Date(nowMs).toISOString();
  atomicWrite(laneRuntimeStorePath(root), store);
  return {
    ok: true,
    notify: true,
    reason: "activity_after_instruction",
    lane_id: id,
    delivered_at: rec.delivered_at || null,
    last_instruction: publicLastInstruction(rec),
  };
}

export function pendingNotificationWatches(nowMs = Date.now(), root = runtimeRoot(), maxAgeMs = 30 * 60 * 1000) {
  const store = readLaneRuntimeStore(root);
  const ids = [];
  for (const [id, rec] of Object.entries(store.lanes || {})) {
    if (!rec || rec.status !== "delivered") continue;
    if (rec.notification_emitted_at) continue;
    const deliveredMs = Date.parse(rec.delivered_at);
    if (!Number.isFinite(deliveredMs) || nowMs - deliveredMs > maxAgeMs) continue;
    ids.push(id);
  }
  return ids;
}
