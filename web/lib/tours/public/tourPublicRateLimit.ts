import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";

type Window = { max: number; windowMs: number };

/**
 * Best-effort per-process limits (serverless: not global across instances).
 *
 * EVERY public tour route must appear here. A route passing a kind that is
 * absent resolves to `undefined` config and throws on `cfg.windowMs` — a 500 on
 * a parent-facing endpoint, not merely a missing limit. `TourPublicRateLimitKind`
 * is exported so the route guard is typed against this table and a new route
 * cannot be added without a budget.
 */
export const TOUR_PUBLIC_RATE_LIMIT = {
    // Read-only.
    resolve: { max: 120, windowMs: 60_000 },
    slots: { max: 120, windowMs: 60_000 },
    // State-changing. A parent needs a handful of attempts, never dozens.
    book: { max: 30, windowMs: 60_000 },
    decline: { max: 30, windowMs: 60_000 },
    confirm: { max: 30, windowMs: 60_000 },
    /** Parent "Confirm I'm coming" — attendance affirmation, not booking confirm. */
    "confirm-attendance": { max: 30, windowMs: 60_000 },
    reschedule: { max: 30, windowMs: 60_000 },
    cancel: { max: 30, windowMs: 60_000 },
    // Authorises the bounded cancellation step; mints a credential, so it is
    // budgeted like a mutation even though it changes no booking state.
    cancel_intent: { max: 30, windowMs: 60_000 },
} satisfies Record<string, Window>;

export type TourPublicRateLimitKind = keyof typeof TOUR_PUBLIC_RATE_LIMIT;

const hits = new Map<string, number[]>();

function prune(key: string, windowMs: number, now: number): number[] {
    const arr = hits.get(key) ?? [];
    const cut = now - windowMs;
    const next = arr.filter((t) => t > cut);
    hits.set(key, next);
    return next;
}

export function tourPublicRateLimitKey(request: NextRequest, kind: keyof typeof TOUR_PUBLIC_RATE_LIMIT, plaintextToken: string): string {
    const ip = hashClientIp(request) ?? "no-ip";
    const tag = createHash("sha256").update(String(plaintextToken).trim(), "utf8").digest("hex").slice(0, 16);
    return `${kind}:${ip}:${tag}`;
}

/** Returns null if allowed, or HTTP Retry-After seconds if blocked. */
export function takeTourPublicRateLimit(request: NextRequest, kind: keyof typeof TOUR_PUBLIC_RATE_LIMIT, plaintextToken: string): number | null {
    const cfg = TOUR_PUBLIC_RATE_LIMIT[kind];
    const key = tourPublicRateLimitKey(request, kind, plaintextToken);
    const now = Date.now();
    const arr = prune(key, cfg.windowMs, now);
    if (arr.length >= cfg.max) {
        const oldest = arr[0] ?? now;
        const retryAfter = Math.max(1, Math.ceil((oldest + cfg.windowMs - now) / 1000));
        return retryAfter;
    }
    arr.push(now);
    hits.set(key, arr);
    return null;
}

/** Test helper: clear in-memory counters. */
export function resetTourPublicRateLimitForTests(): void {
    hits.clear();
}
