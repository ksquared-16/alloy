import { createHash } from "crypto";
import type { NextRequest } from "next/server";

export function hashClientIp(request: NextRequest): string | null {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const raw = forwarded || request.headers.get("x-real-ip")?.trim() || null;
    if (!raw) return null;
    return createHash("sha256").update(raw, "utf8").digest("hex");
}
