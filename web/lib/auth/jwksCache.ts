/**
 * Process-scoped JWKS cache for local JWT verification.
 *
 * WHY THIS EXISTS
 *
 * `supabase.auth.getClaims()` verifies the access token's signature locally with WebCrypto instead
 * of asking the Auth server who the user is. That is the fast path, and the canonical route-layer
 * resolver (`lib/admin/cachedAuthSession.ts`) already takes it — this tenant resolves
 * `source: "claims"` on every request.
 *
 * But the key set it verifies against is cached on the GoTrueClient INSTANCE (`this.jwks`), and a
 * fresh client is constructed per request by `createServerClient` / `createClient`. So every
 * request refetched `/auth/v1/.well-known/jwks.json` from the remote Auth server, and "local
 * verification" still cost a full network round trip — measured at ~200ms per request, on every
 * authenticated request in the product.
 *
 * `getClaims(jwt, { jwks })` consults a supplied key set BY `kid` before touching its own cache or
 * the network. Supplying a process-cached JWKS therefore makes the common path genuinely local,
 * while a `kid` miss (key rotation) falls straight through to auth-js's own fetch — so rotation
 * still works without us implementing invalidation.
 *
 * SECURITY. This caches PUBLIC verification keys, nothing else. Signature verification and `exp`
 * validation still run per request inside auth-js. The TTL bounds how long a rotated-out key can
 * still be offered; a token signed by a NEW key simply misses the cache and triggers a refetch.
 */

import type { JWK } from "@supabase/auth-js";

/** Exactly the shape `getClaims(jwt, { jwks })` accepts — do not widen it. */
export type JwksKeySet = { keys: JWK[] };

/** Matches auth-js's own JWKS_TTL (10 minutes). Rotation is handled by kid-miss, not by expiry. */
const JWKS_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { keys: JwksKeySet; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
/** De-duplicates concurrent misses so a cold process makes ONE fetch, not one per in-flight request. */
const inflight = new Map<string, Promise<JwksKeySet | null>>();

function jwksUrl(supabaseUrl: string): string {
    return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
}

/**
 * Returns a cached JWKS for the project, or null if it cannot be fetched.
 *
 * Never throws: a null result means "pass no jwks", and auth-js resolves the key itself exactly as
 * it did before this cache existed. Failing to warm the cache must never fail a request.
 */
export async function getCachedJwks(supabaseUrl: string, anonKey: string): Promise<JwksKeySet | null> {
    if (!supabaseUrl || !anonKey) return null;
    const url = jwksUrl(supabaseUrl);
    const now = Date.now();

    const hit = cache.get(url);
    if (hit && now - hit.fetchedAt < JWKS_TTL_MS) return hit.keys;

    const pending = inflight.get(url);
    if (pending) return pending;

    const task = (async (): Promise<JwksKeySet | null> => {
        try {
            const res = await fetch(url, {
                headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            });
            if (!res.ok) return hit?.keys ?? null;
            const body = (await res.json()) as JwksKeySet;
            if (!body?.keys?.length) return hit?.keys ?? null;
            cache.set(url, { keys: body, fetchedAt: Date.now() });
            return body;
        } catch {
            // Serve a stale key set rather than forcing every request back onto the network.
            return hit?.keys ?? null;
        } finally {
            inflight.delete(url);
        }
    })();

    inflight.set(url, task);
    return task;
}
