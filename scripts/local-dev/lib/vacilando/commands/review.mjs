/**
 * Vacilando Runtime — review dispositions (Slice 6).
 *
 * A governed, audited record of a human review outcome (approve /
 * request-changes) for an initiative that is in a "reviewing" gate. This does
 * NOT force the toolkit's initiative state machine (the toolkit owns that);
 * it records the Director's decision + rationale as an authoritative, replayable
 * disposition, and (for request-changes) is paired with a routed instruction.
 * Recorded reviews surface in Work History and clear the item from Needs You.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando");
const PATH = join(DIR, "reviews.jsonl");

export function recordReview({ initiative_key, disposition, note, actor = "operator", occurredAtMs }) {
  const occurred_at = new Date(occurredAtMs ?? Date.now()).toISOString();
  const rec = {
    schema_version: "vacilando.review.v1",
    occurred_at, initiative_key, disposition, note: note || null, actor,
  };
  rec.id = "rev_" + createHash("sha256").update(occurred_at + initiative_key + disposition).digest("hex").slice(0, 18);
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  appendFileSync(PATH, JSON.stringify(rec) + "\n", "utf8");
  return rec;
}

/** Map of initiative_key → latest disposition, so resolved reviews clear. */
export function reviewDispositions() {
  const map = {};
  try {
    for (const line of readFileSync(PATH, "utf8").split("\n").filter(Boolean)) {
      try { const r = JSON.parse(line); map[r.initiative_key] = r; } catch { /* skip */ }
    }
  } catch { /* none */ }
  return map;
}

export function readReviews(limit = 50) {
  try {
    const lines = readFileSync(PATH, "utf8").split("\n").filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) { try { out.push(JSON.parse(lines[i])); } catch {} }
    return out;
  } catch { return []; }
}
