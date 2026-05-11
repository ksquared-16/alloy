import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";

type Window = { max: number; windowMs: number };

/** Best-effort per-process limits (serverless: not global across instances). */
export const TOUR_PUBLIC_RATE_LIMIT: Record<"resolve" | "slots" | "book", Window> = {
    resolve: { max: 120, windowMs: 60_000 },
    slots: { max: 120, windowMs: 60_000 },
    book: { max: 30, windowMs: 60_000 },
};

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
