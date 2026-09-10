/**
 * Whether an integration is working, derived rather than stored.
 *
 * ── DERIVED, BECAUSE STORED HEALTH GOES STALE ──
 *
 * A persisted status is a second source of truth that drifts the moment anything
 * changes without going through the writer. Every input here is already a durable
 * fact, so health is computed on read and cannot disagree with reality.
 *
 * ── IDLE IS NOT UNHEALTHY ──
 *
 * The tempting rule — "no requests recently, therefore a problem" — is wrong.
 * A nightly integration is silent for twenty-three hours by design, and an
 * installation created five minutes ago has never been used because nobody has
 * used it yet. `no_recent_activity` is reported as its own state, distinct from
 * `needs_attention`, so an operator is never told to fix something that is
 * working exactly as intended.
 *
 * No score, no model, no inference. Four states and stated rules.
 */

export type InstallationHealth = "healthy" | "needs_attention" | "inactive" | "no_recent_activity";

export type HealthInputs = {
    installationStatus: "active" | "suspended" | "revoked";
    /** Credentials that can currently authenticate. */
    activeCredentialCount: number;
    /** Earliest expiry among active credentials, if any. */
    nextCredentialExpiry?: string | null;
    /** A rotation overlap currently running. */
    rotationOverlapUntil?: string | null;
    lastSuccessAt?: string | null;
    recentFailureCount: number;
    recentSuccessCount: number;
    recentRateLimitCount: number;
};

export type HealthVerdict = {
    state: InstallationHealth;
    /** Stable, machine-readable, and the reason shown to an operator. */
    reasons: string[];
};

const CREDENTIAL_EXPIRY_WARNING_DAYS = 7;

/**
 * The rules, in order. The first block that matches decides the state; reasons
 * accumulate so an operator sees everything that is true, not only the first.
 */
export function evaluateInstallationHealth(inputs: HealthInputs, now: Date = new Date()): HealthVerdict {
    const reasons: string[] = [];

    // 1. Deliberately off is not a fault. It is reported as inactive, never as
    //    something to repair.
    if (inputs.installationStatus === "revoked") {
        return { state: "inactive", reasons: ["installation_revoked"] };
    }
    if (inputs.installationStatus === "suspended") {
        return { state: "inactive", reasons: ["installation_suspended"] };
    }

    // 2. Conditions that will stop it working, whether or not it is being used.
    if (inputs.activeCredentialCount === 0) reasons.push("no_active_credential");

    if (inputs.nextCredentialExpiry) {
        const days = (new Date(inputs.nextCredentialExpiry).getTime() - now.getTime()) / 86_400_000;
        if (days <= 0) reasons.push("credential_expired");
        else if (days <= CREDENTIAL_EXPIRY_WARNING_DAYS) reasons.push("credential_expiring_soon");
    }

    if (inputs.rotationOverlapUntil) {
        const ends = new Date(inputs.rotationOverlapUntil).getTime();
        // An overlap is normal while it runs and a problem once it lapses with the
        // old secret still deployed — which is what a failure spike alongside it
        // would mean.
        if (ends > now.getTime()) reasons.push("rotation_in_progress");
    }

    if (inputs.recentFailureCount > 0 && inputs.recentSuccessCount === 0) {
        reasons.push("recent_requests_all_failing");
    }
    if (inputs.recentRateLimitCount > 0) reasons.push("rate_limited_recently");

    const blocking = reasons.some((r) =>
        ["no_active_credential", "credential_expired", "recent_requests_all_failing"].includes(r),
    );
    if (blocking) return { state: "needs_attention", reasons };

    // 3. Working, or simply not yet used. Both are fine; they are different.
    if (inputs.recentSuccessCount > 0) {
        return { state: "healthy", reasons };
    }
    if (!inputs.lastSuccessAt) {
        return { state: "no_recent_activity", reasons: [...reasons, "never_used"] };
    }
    return { state: "no_recent_activity", reasons: [...reasons, "idle"] };
}
