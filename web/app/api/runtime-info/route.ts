/**
 * GET /api/runtime-info — the running deploy's identity, so "is staging on the committed fix?" is
 * answerable with a single curl (no authenticated browser required).
 *
 *   builtSha   — inlined at build time (next.config.ts → NEXT_PUBLIC_BUILD_SHA).
 *   runtimeSha — the host's git env read live; if it disagrees with builtSha the deploy is stale.
 */

import { NextResponse } from "next/server";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";

export const dynamic = "force-dynamic";

export function GET() {
    const runtimeSha =
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
        process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
        null;
    return NextResponse.json({
        builtSha: BUILD_SHA,
        runtimeSha,
        matches: runtimeSha == null ? null : runtimeSha === BUILD_SHA,
        builtAtServerTime: new Date().toISOString(),
    });
}
