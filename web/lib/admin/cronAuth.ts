import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Validates `x-cron-token` against `INTERNAL_CRON_TOKEN`. */
export function isInternalCronAuthorized(request: NextRequest): boolean {
    const envTok = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    if (!envTok) return false;
    const headerTok = (request.headers.get("x-cron-token") ?? "").trim();
    if (!headerTok || headerTok.length !== envTok.length) return false;
    try {
        return timingSafeEqual(Buffer.from(headerTok, "utf8"), Buffer.from(envTok, "utf8"));
    } catch {
        return false;
    }
}
