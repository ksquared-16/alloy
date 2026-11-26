/**
 * A bounded abuse posture for the one public thing a kiosk exposes: code entry.
 *
 * ── WHY THIS IS NOT A COPY OF THE TOUR LIMITER ──
 *
 * `tourPublicRateLimit` keys its window on the presented TOKEN, which is right
 * there: each token is a distinct legitimate resource, and one family hammering
 * their own link should not slow another's.
 *
 * A kiosk code is the opposite. It is the secret being GUESSED, so keying the
 * window on it would hand every wrong guess its own fresh budget — a limiter that
 * counts to one, forever, and stops nothing. The window is therefore keyed on the
 * DEVICE plus the caller, which is the thing doing the guessing.
 *
 * ── DELIBERATELY SMALL ──
 *
 * Per-process and in-memory, exactly like the tour limiter, with the same honest
 * caveat: on serverless this is per-instance, not global. That is a real limit and
 * it is stated rather than dressed up. It raises the cost of a code-guessing
 * oracle from free to bounded, which is the requirement; a distributed limiter is
 * a platform capability and building one here would be Thread 5 growing an
 * anti-abuse platform it was told not to grow.
 */

import type { NextRequest } from "next/server";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";

type Window = { max: number; windowMs: number };

/**
 * Budgets. A parent mistypes a code once or twice; nobody legitimately submits
 * fifteen wrong codes a minute at a front desk.
 */
export const KIOSK_RATE_LIMIT = {
    /** Code entry — the guessable surface. */
    identify: { max: 10, windowMs: 60_000 },
    /** Authoring attendance, once identified. Higher: a family checks in siblings. */
    capture: { max: 40, windowMs: 60_000 },
} satisfies Record<string, Window>;

export type KioskRateLimitKind = keyof typeof KIOSK_RATE_LIMIT;

const hits = new Map<string, number[]>();

function prune(key: string, windowMs: number, now: number): number[] {
    const arr = hits.get(key) ?? [];
    const next = arr.filter((t) => t > now - windowMs);
    hits.set(key, next);
    return next;
}

/**
 * The window key: the device, and the caller behind it.
 *
 * The presented CODE is deliberately absent — including it is the mistake this
 * module exists to avoid. The device credential is hashed rather than used raw so
 * a secret never becomes a map key.
 */
export function kioskRateLimitKey(
    request: NextRequest | null,
    kind: KioskRateLimitKind,
    deviceProducerKey: string,
): string {
    const ip = (request ? hashClientIp(request) : null) ?? "no-ip";
    return `${kind}:${deviceProducerKey}:${ip}`;
}

/** Null when allowed, or the Retry-After seconds when the budget is spent. */
export function takeKioskRateLimit(
    request: NextRequest | null,
    kind: KioskRateLimitKind,
    deviceProducerKey: string,
): number | null {
    const cfg = KIOSK_RATE_LIMIT[kind];
    const key = kioskRateLimitKey(request, kind, deviceProducerKey);
    const now = Date.now();
    const arr = prune(key, cfg.windowMs, now);
    if (arr.length >= cfg.max) {
        const oldest = arr[0] ?? now;
        return Math.max(1, Math.ceil((oldest + cfg.windowMs - now) / 1000));
    }
    arr.push(now);
    hits.set(key, arr);
    return null;
}

/**
 * Forget a device's identification budget after it succeeds.
 *
 * A family checking in four siblings across two visits should not be throttled
 * because the morning's mistypes are still in the window. Only a SUCCESSFUL
 * identification clears it, so the budget still binds a run of failures — which
 * is the only thing it is defending against.
 */
export function clearKioskIdentifyBudget(request: NextRequest | null, deviceProducerKey: string): void {
    hits.delete(kioskRateLimitKey(request, "identify", deviceProducerKey));
}

/** Test seam only. */
export function resetKioskRateLimitsForTests(): void {
    hits.clear();
}
