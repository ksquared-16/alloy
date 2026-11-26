/**
 * QA session bootstrap — the missing final branch of browser-auth recovery.
 *
 * `sign-in` requires a human who knows the password. Machine QA identities have no human who
 * should ever know one, so that branch cannot complete for them. This branch restores a session
 * for a REGISTERED slot QA identity without any password existing anywhere.
 *
 * It reuses the canonical mechanism already in this repository
 * (`web/scripts/captureCommunicationsConvergenceQa.ts`): mint a single-use magic link with the
 * service-role client, redeem it immediately with the anon client, and keep the resulting session.
 * No parallel auth system is introduced, and no password is created, rotated, stored or shown.
 *
 * The split matters. THIS module decides whether a bootstrap may happen and never touches a secret;
 * the minting child does the Supabase work inside the trusted boundary and returns metadata only.
 * Because the guards live here, they are unit-testable without credentials — which is the only way
 * the positive controls below can be honest.
 *
 * Trust boundary, stated once: the agent may START a bootstrap and may CANCEL it. The agent never
 * sees the link, the token, the session or the cookie. The minting child writes the storage file
 * itself at 0600 outside the worktree and prints metadata.
 */
import { BROWSER_AUTH_STATES, isLoopbackBase, qaIdentityForSlot } from "./browser-auth.mjs";

/** Refusal codes. Every one fails CLOSED — an unrecognised condition never becomes "allowed". */
export const QA_BOOTSTRAP_REFUSALS = {
    NOT_LOOPBACK: "not_loopback_base",
    UNREGISTERED_IDENTITY: "unregistered_qa_identity",
    ARBITRARY_IDENTITY: "arbitrary_identity_refused",
    SLOT_MISMATCH: "slot_mismatch",
    BOOTSTRAP_IN_FLIGHT: "bootstrap_in_flight",
    NOT_ALLOWED_PROFILE: "repository_profile_not_alloy",
    NO_OPERATOR_APPROVAL: "operator_approval_required",
    EXPIRED: "bootstrap_artifact_expired",
    REPLAYED: "bootstrap_artifact_replayed",
};

/** A bootstrap artifact is deliberately short-lived; a long-lived one is a credential. */
export const BOOTSTRAP_TTL_MS = 120_000;

const inFlight = new Map();

/** Test seam — the in-flight map is module state, so suites must be able to clear it. */
export function resetQaBootstrapsForTests() {
    inFlight.clear();
}

export function qaBootstrapInFlight(slot) {
    return inFlight.get(Number(slot)) || null;
}

/**
 * Decide whether this exact request may bootstrap, without performing it.
 *
 * `requestedIdentity` exists ONLY so an arbitrary email can be rejected loudly. It is never the
 * source of the address used: that always comes from the slot registry, so a caller cannot steer
 * the bootstrap at some other account by passing one in.
 */
export function authorizeQaBootstrap({
    validated,
    requestedIdentity = null,
    operatorApproved = false,
    repositoryProfile = "alloy",
    nowMs = Date.now(),
} = {}) {
    if (!validated || typeof validated.slot !== "number") {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.SLOT_MISMATCH };
    }
    if (String(repositoryProfile).toLowerCase() !== "alloy") {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.NOT_ALLOWED_PROFILE };
    }
    // The real target URL is known here, so this is the boundary that must refuse a non-loopback
    // or production target. Refusing later would be refusing after the link already existed.
    if (!isLoopbackBase(validated.base_url)) {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.NOT_LOOPBACK };
    }
    const registered = qaIdentityForSlot(validated.slot);
    if (!registered || !String(registered).includes("@")) {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.UNREGISTERED_IDENTITY };
    }
    if (String(registered).toLowerCase() !== String(validated.expected_identity || "").toLowerCase()) {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.SLOT_MISMATCH };
    }
    if (requestedIdentity != null && String(requestedIdentity).toLowerCase() !== String(registered).toLowerCase()) {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.ARBITRARY_IDENTITY };
    }
    if (operatorApproved !== true) {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.NO_OPERATOR_APPROVAL };
    }
    const active = inFlight.get(validated.slot);
    if (active && active.expires_at_ms > nowMs) {
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.BOOTSTRAP_IN_FLIGHT, started_at: active.started_at };
    }
    return { ok: true, identity: registered, base_url: validated.base_url, slot: validated.slot };
}

/** Claim the single active bootstrap slot. Returns a handle whose id is meaningless to an attacker. */
export function openQaBootstrap({ slot, nowMs = Date.now(), ttlMs = BOOTSTRAP_TTL_MS }) {
    const record = {
        slot: Number(slot),
        started_at: new Date(nowMs).toISOString(),
        expires_at_ms: nowMs + ttlMs,
        consumed: false,
    };
    inFlight.set(Number(slot), record);
    return record;
}

/**
 * Consume the artifact exactly once.
 *
 * Single-use is enforced HERE rather than trusted to Supabase alone, so a replay is refused by
 * this host even if a provider ever became lenient about redeeming a link twice.
 */
export function consumeQaBootstrap({ slot, nowMs = Date.now() }) {
    const record = inFlight.get(Number(slot));
    if (!record) return { ok: false, error: QA_BOOTSTRAP_REFUSALS.EXPIRED };
    if (record.consumed) return { ok: false, error: QA_BOOTSTRAP_REFUSALS.REPLAYED };
    if (record.expires_at_ms <= nowMs) {
        inFlight.delete(Number(slot));
        return { ok: false, error: QA_BOOTSTRAP_REFUSALS.EXPIRED };
    }
    record.consumed = true;
    inFlight.delete(Number(slot));
    return { ok: true };
}

/**
 * The durable record for a bootstrap attempt. Metadata only.
 *
 * Deliberately has no field that could carry a link, token, cookie or session — a shape that cannot
 * express a secret cannot leak one by a future careless edit.
 */
export function publicBootstrapOutcome({ validated, state, detail = null, nowMs = Date.now() }) {
    return {
        schema_version: "vacilando.qa_session_bootstrap.v1",
        state,
        lane_id: validated.lane_id,
        slot: validated.slot,
        port: validated.port,
        base_url: validated.base_url,
        expected_identity: validated.expected_identity,
        mechanism: "single_use_magiclink",
        password_involved: false,
        secrets_recorded: false,
        attempted_at: new Date(nowMs).toISOString(),
        detail: detail == null ? null : String(detail).slice(0, 500),
    };
}

/** States this branch can end in; `RESTORED` is still only reachable through a fresh live verify. */
export const QA_BOOTSTRAP_STATES = {
    MINTING: "minting",
    VERIFYING: BROWSER_AUTH_STATES.VERIFYING,
    RESTORED: BROWSER_AUTH_STATES.RESTORED,
    FAILED: BROWSER_AUTH_STATES.VERIFICATION_FAILED,
};
