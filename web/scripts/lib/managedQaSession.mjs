/**
 * MANAGED QA SESSION CONTINUITY for the certification harnesses.
 *
 * The managed session's access token lives one hour. A Phases 5–7 certification outlives that, so a
 * run would reach the expiry mid-flight, every subsequent navigation would bounce to `/login`, and
 * the remaining samples would be silently wrong rather than loudly absent — the worst outcome for a
 * measurement.
 *
 * This detects expiry, refreshes through the CANONICAL managed path (`vac browser-auth restore`, the
 * same one an operator would use), verifies the identity that came back, and reports how long the
 * refresh took so the caller can exclude it. Nothing here mints a session, reads a token, or holds a
 * credential: it shells out to the governed command and reads its verdict.
 *
 * ── WHY THE REFRESH INTERVAL IS NOT A SAMPLE ──
 *
 * A refresh is harness overhead, not application latency. Folding it into a timing observation would
 * publish a ~seconds-long outlier as though the product had produced it. `ensureManagedSession`
 * therefore returns `refreshMs`, and the caller's contract is to exclude any observation that spans
 * one — the sink already records admission per observation for the same reason.
 *
 * ── FAIL CLOSED ──
 *
 * A refresh that comes back as a DIFFERENT identity is a hard stop, never "close enough": one slot's
 * certification asserting against another slot's data is exactly the corruption the identity check
 * exists to prevent. A genuine IdP challenge is likewise surfaced, not papered over — this path can
 * only ever re-run the managed machine flow.
 */
import { spawnSync } from "node:child_process";

/** Session states this harness distinguishes. `unknown` is never treated as healthy. */
export const SESSION_STATE = Object.freeze({
    VALID: "valid",
    EXPIRED: "expired",
    ABSENT: "absent",
    UNKNOWN: "unknown",
});

/**
 * Read a `vac browser-auth status` transcript into a state.
 *
 * Parsing text is not the nicest contract, but it is the one the governed command publishes, and
 * duplicating its logic here would create a second definition of "authenticated" — the precise
 * defect that made every restore verify as unauthenticated in the first place.
 */
export function readSessionState(text) {
    const t = String(text || "");
    if (/blocks execution:\s*false/i.test(t)) return SESSION_STATE.VALID;
    if (/session_expired|session expired|Re-authentication required/i.test(t)) return SESSION_STATE.EXPIRED;
    if (/storage:\s*absent|auth not ready/i.test(t)) return SESSION_STATE.ABSENT;
    return SESSION_STATE.UNKNOWN;
}

/** The identity the command reported, or null. Never parsed out of the storage file. */
export function readReportedIdentity(text) {
    const m = String(text || "").match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
    return m ? m[1] : null;
}

/** Does a refreshed session satisfy the mission? Identity must match exactly, case-insensitively. */
export function refreshSatisfies({ state, identity, expectedIdentity }) {
    if (state !== SESSION_STATE.VALID) return { ok: false, reason: `session_${state}` };
    if (!expectedIdentity) return { ok: true };
    if (!identity) return { ok: false, reason: "identity_not_reported" };
    if (identity.toLowerCase() !== String(expectedIdentity).toLowerCase()) {
        return { ok: false, reason: "wrong_identity" };
    }
    return { ok: true };
}

function run(vac, args, timeoutMs) {
    const r = spawnSync(vac, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
    return `${r.stdout || ""}\n${r.stderr || ""}`;
}

/**
 * Ensure a usable managed session, refreshing through the governed path when it has lapsed.
 *
 * Returns `{ state, identity, refreshed, refreshMs }`. `refreshMs` is > 0 only when a refresh
 * actually ran, and the caller must exclude any observation spanning it.
 */
export function ensureManagedSession({
    vac,
    lane,
    expectedIdentity = null,
    timeoutMs = 180_000,
    waitMs = 15_000,
    attempts = 8,
    sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
} = {}) {
    const status = () => run(vac, ["browser-auth", "status", "--lane", lane], timeoutMs);

    let text = status();
    let state = readSessionState(text);
    if (state === SESSION_STATE.VALID) {
        return { state, identity: readReportedIdentity(text), refreshed: false, refreshMs: 0 };
    }

    const startedAt = Date.now();
    // The canonical managed path — the same command an operator would run. Machine identity only.
    run(vac, ["browser-auth", "restore", "--lane", lane], timeoutMs);
    for (let i = 0; i < attempts; i++) {
        text = status();
        state = readSessionState(text);
        if (state === SESSION_STATE.VALID) break;
        sleep(waitMs);
    }
    const refreshMs = Date.now() - startedAt;

    const identity = readReportedIdentity(
        `${text}\n${run(vac, ["browser-auth", "verify", "--lane", lane], timeoutMs)}`,
    );
    const verdict = refreshSatisfies({ state, identity, expectedIdentity });
    if (!verdict.ok) {
        const err = new Error(`managed QA session unusable after refresh: ${verdict.reason}`);
        err.code = verdict.reason;
        err.refreshMs = refreshMs;
        throw err;
    }
    return { state, identity, refreshed: true, refreshMs };
}
