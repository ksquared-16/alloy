/**
 * A limiter that is actually shared, because a per-process one is not a limiter.
 *
 * `kioskRateLimit` keeps its window in module memory and says so honestly: "on
 * serverless this is per-instance, not global… a distributed limiter is a
 * platform capability." For a lobby tablet that is a reasonable bound. For a
 * public API it is disqualifying — the real budget becomes the configured budget
 * multiplied by an instance count nobody knows, which rises exactly when load
 * rises, which is exactly when the limit was supposed to hold.
 *
 * So the counter lives in Postgres, and the increment and the decision happen in
 * ONE statement (`consume_rate_limit`). Two instances racing the same bucket
 * cannot both read "under the limit" and both proceed.
 *
 * ── KEYS ARE NEVER SECRETS ──
 *
 * A bucket key is a hash. Keying on a presented secret would make the limiter
 * table a place credentials accumulate, and keying on a GUESSED secret would give
 * every wrong guess its own fresh budget — a limiter that counts to one forever.
 * That second point is `kioskRateLimit`'s insight and it is the one worth
 * keeping: key on the thing doing the work, not on the thing being presented.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitDecision = {
    allowed: boolean;
    limit: number;
    remaining: number;
    /** Seconds until the window resets. */
    resetSeconds: number;
};

export type RateLimitPolicy = { limit: number; windowSeconds: number };

/**
 * Conservative platform defaults. Deliberately not per-application yet: a quota
 * a partner can negotiate is a product decision, and inventing one now would
 * mean inventing the negotiation too.
 */
export const RATE_LIMIT_POLICY = {
    /** Token exchange. The guessable surface, so the tightest budget. */
    tokenExchange: { limit: 30, windowSeconds: 60 },
    /** Authenticated reads. A partner paging a collection is normal traffic. */
    authenticatedRead: { limit: 600, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>;

function bucket(parts: readonly string[]): string {
    // Hashed so that no identifier — client_id, IP, token id — is stored in
    // plaintext in a table whose whole job is to be written on every request.
    return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/** Key for the unauthenticated token endpoint: who is asking, and as whom. */
export function tokenExchangeBucket(clientId: string, clientIpHash: string): string {
    return bucket(["token_exchange", clientId.trim(), clientIpHash]);
}

/** Key for authenticated traffic: the installation, not the token. */
export function installationBucket(installationId: string): string {
    return bucket(["api_read", installationId]);
}

/**
 * Consume one unit.
 *
 * FAILS CLOSED. If the limiter cannot be reached the request is refused, because
 * an unavailable limiter that admits everything is indistinguishable from no
 * limiter at the exact moment one is needed.
 */
export async function consumeRateLimit(
    supabase: SupabaseClient,
    bucketKey: string,
    policy: RateLimitPolicy,
): Promise<RateLimitDecision> {
    const denied: RateLimitDecision = {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetSeconds: policy.windowSeconds,
    };

    try {
        const { data, error } = await supabase.rpc("consume_rate_limit", {
            p_bucket_key: bucketKey,
            p_window_seconds: policy.windowSeconds,
            p_limit: policy.limit,
        });
        if (error) return denied;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return denied;

        const count = Number((row as { current_count?: number }).current_count ?? policy.limit + 1);
        const allowed = Boolean((row as { allowed?: boolean }).allowed);
        const resetAt = (row as { reset_at?: string }).reset_at;
        const resetSeconds = resetAt
            ? Math.max(0, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1000))
            : policy.windowSeconds;

        return {
            allowed,
            limit: policy.limit,
            remaining: Math.max(0, policy.limit - count),
            resetSeconds,
        };
    } catch {
        return denied;
    }
}
