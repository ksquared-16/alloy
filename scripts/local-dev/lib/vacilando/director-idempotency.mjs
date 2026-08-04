/**
 * Mission-scoped idempotency keys for operator↔Director mutations.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(os.homedir(), ".local", "state", "alloy-dev");
const IDEM_DIR = join(RUNTIME_ROOT, "vacilando", "director-idempotency");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureIdemDir() {
  if (!existsSync(IDEM_DIR)) mkdirSync(IDEM_DIR, { recursive: true });
}

function idemFile(missionId) {
  return join(IDEM_DIR, `${missionId}.jsonl`);
}

export function lookupIdempotency(missionId, idempotencyKey) {
  if (!missionId || !idempotencyKey) return null;
  try {
    const lines = readFileSync(idemFile(missionId), "utf8").split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const row = JSON.parse(lines[i]);
      if (row.idempotencyKey === idempotencyKey) return row;
    }
  } catch { /* none */ }
  return null;
}

export function recordIdempotency(missionId, idempotencyKey, result = {}) {
  if (!missionId || !idempotencyKey) return;
  ensureIdemDir();
  appendFileSync(idemFile(missionId), JSON.stringify({
    idempotencyKey,
    missionId,
    at: iso(),
    messageId: result?.messageId || result?.message?.messageId || null,
    directorResponseId: result?.directorResponseId || null,
    trigger: result?.trigger || null,
  }) + "\n");
}
