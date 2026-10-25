/**
 * Public document ingestion: the size and rate gates in front of every unauthenticated or tokenized
 * upload (D1b.4).
 *
 * The three public upload routes are the vendor application, the enrollment attachment and the drawn
 * signature. Each one writes to the document bucket on the service role. Before D1b none of them had a
 * rate limit, the enrollment routes only learned a body's size after decoding all of it, and the vendor
 * application had no size or type check at all.
 *
 * ── RATE LIMIT ──
 *
 * This reuses the platform's shared Postgres limiter (`consume_rate_limit`), because a per-instance
 * counter on serverless is not a limit. It is keyed on the hashed caller address and the surface, NEVER
 * on the presented token: keying on a guessed token would give every wrong guess a fresh budget. The
 * gate runs BEFORE token resolution and before the body is read, so refused and malformed requests
 * spend the budget too. That is what makes it a brake on guessing and on flooding.
 *
 * It FAILS CLOSED, like the external API: an unreachable limiter refuses rather than admits.
 */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { consumeRateLimit, type RateLimitPolicy } from "@/lib/platform/external/rateLimit";
import { clientIpHash } from "@/lib/platform/external/requestContext";

export type PublicUploadSurface = "vendor_application" | "enrollment_upload" | "enrollment_signature_asset";

/**
 * Budgets per caller address.
 *
 * A family completes an enrollment packet with a handful of attachments and one or two signatures, and a
 * retry or two each. A vendor applies once.
 */
export const PUBLIC_UPLOAD_RATE_POLICY: Readonly<Record<PublicUploadSurface, RateLimitPolicy>> = Object.freeze({
    vendor_application: { limit: 5, windowSeconds: 600 },
    enrollment_upload: { limit: 30, windowSeconds: 600 },
    enrollment_signature_asset: { limit: 20, windowSeconds: 600 },
});

/** Request-body ceilings, checked from Content-Length before any byte is read. */
export const PUBLIC_UPLOAD_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Base64 inflates by 4/3, and the JSON envelope adds a little. */
export const PUBLIC_UPLOAD_MAX_JSON_BODY_BYTES = Math.ceil((PUBLIC_UPLOAD_MAX_FILE_BYTES * 4) / 3) + 64 * 1024;
/** Two files of up to 10 MiB each, plus the form fields. */
export const PUBLIC_VENDOR_APPLICATION_MAX_BODY_BYTES = 2 * PUBLIC_UPLOAD_MAX_FILE_BYTES + 256 * 1024;

export function publicUploadBucketKey(surface: PublicUploadSurface, headers: Headers): string {
    return createHash("sha256").update(["public_document_upload", surface, clientIpHash(headers)].join("|"), "utf8").digest("hex");
}

/** 429 with Retry-After when the caller's budget is spent; null when the request may proceed. */
export async function enforcePublicUploadRateLimit(
    supabase: SupabaseClient,
    surface: PublicUploadSurface,
    headers: Headers,
): Promise<NextResponse | null> {
    const policy = PUBLIC_UPLOAD_RATE_POLICY[surface];
    const decision = await consumeRateLimit(supabase, publicUploadBucketKey(surface, headers), policy);
    if (decision.allowed) return null;
    return NextResponse.json(
        { ok: false, error: "Too many uploads. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
        { status: 429, headers: { "retry-after": String(Math.max(1, decision.resetSeconds)) } },
    );
}

/**
 * 413 when a declared Content-Length exceeds the ceiling, so an oversized body is refused before it is
 * buffered. A missing or unparseable length is allowed through here, and the decoded size is still
 * checked by the route.
 */
export function refuseOversizedPublicBody(headers: Headers, maxBytes: number): NextResponse | null {
    const declared = Number(headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
        return NextResponse.json(
            { ok: false, error: "That file is too large. Please attach a file under 10MB.", code: "TOO_LARGE" },
            { status: 413 },
        );
    }
    return null;
}
