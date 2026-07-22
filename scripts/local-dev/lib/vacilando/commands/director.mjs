/**
 * Vacilando Runtime — Director routing (Slice 4).
 *
 * There is NO governed way to inject a message into a live Claude/Cursor
 * session (the toolkit only offers clipboard + manual paste). So Director
 * routing is honest: it records the interaction and puts the composed
 * instruction on the clipboard, ready for the operator to paste. It NEVER
 * claims to have sent the message into the session.
 *
 * Records live under <runtime-root>/vacilando/director/<slot>.jsonl — an
 * interaction log, not a parallel worker-state store.
 */
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "director");

function logPath(slot) { return join(DIR, `${String(slot)}.jsonl`); }

/** Copy text to the macOS clipboard. Returns true on success. */
export function copyToClipboard(text) {
  return new Promise((res) => {
    const p = execFile("pbcopy", [], (err) => res(!err));
    try { p.stdin.write(text); p.stdin.end(); } catch { res(false); }
  });
}

/**
 * Record a Director interaction and stage the instruction to the clipboard.
 * Returns { id, occurred_at, clipboard, delivery }.
 */
export async function routeInstruction({ slot, worktree, provider, message, occurredAtMs, actor = "operator" }) {
  const occurred_at = new Date(occurredAtMs ?? Date.now()).toISOString();
  const clipboard = await copyToClipboard(message);
  const rec = {
    schema_version: "vacilando.director.v1",
    occurred_at, slot, worktree: worktree || null, provider: provider || null,
    actor, message,
    delivery: "clipboard+manual-paste",
    delivery_note: "Recorded and copied to the clipboard. Programmatic injection into a live Claude/Cursor session is not available — paste it into the session.",
    clipboard_ok: clipboard,
  };
  rec.id = "dir_" + createHash("sha256").update(occurred_at + slot + message).digest("hex").slice(0, 18);
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  appendFileSync(logPath(slot), JSON.stringify(rec) + "\n", "utf8");
  return { id: rec.id, occurred_at, clipboard, delivery: rec.delivery };
}

/** Read the Director interaction log for a slot (newest first). */
export function readDirectorLog(slot, limit = 40) {
  try {
    const lines = readFileSync(logPath(slot), "utf8").split("\n").filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try { out.push(JSON.parse(lines[i])); } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}
