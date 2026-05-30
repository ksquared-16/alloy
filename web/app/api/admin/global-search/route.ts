import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { CRM_ENTITY_SEARCH_UUID_RE, sanitizeCrmSearchToken } from "@/lib/admin/forms/crmEntitySearchShared";
import { runGlobalRecordSearch } from "@/lib/admin/globalSearch/globalRecordSearchService";
import {
    GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT,
    GLOBAL_RECORD_SEARCH_MIN_Q_LEN,
} from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET `/api/admin/global-search?q=&limit=`
 *
 * Phase 1 — deterministic org-scoped record lookup (people, leads, households, campuses).
 * Not BOS / semantic search.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: access.status });
    }

    const url = new URL(request.url);
    const rawQ = (url.searchParams.get("q") ?? "").trim();
    const limitRaw = Number(url.searchParams.get("limit") ?? GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT);
    const limit = Math.min(
        Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT, 1),
        GLOBAL_RECORD_SEARCH_DEFAULT_LIMIT
    );

    if (rawQ.length === 0) {
        return NextResponse.json(
            { ok: false, error: "Q_REQUIRED", message: "Query parameter q is required." },
            { status: 400 }
        );
    }

    const token = sanitizeCrmSearchToken(rawQ);
    if (token.length < GLOBAL_RECORD_SEARCH_MIN_Q_LEN && !CRM_ENTITY_SEARCH_UUID_RE.test(rawQ)) {
        return NextResponse.json(
            {
                ok: false,
                error: "Q_TOO_SHORT",
                message: `q must be at least ${GLOBAL_RECORD_SEARCH_MIN_Q_LEN} characters (after sanitizing), or a valid record UUID.`,
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const t0 = Date.now();

    try {
        const { q, results } = await runGlobalRecordSearch({
            supabase,
            orgId: ctx.orgId,
            accessDim: scopeDimensionsFromAccess(access),
            rawQ,
            limit,
        });

        const totalMs = Date.now() - t0;
        if (totalMs > 250) {
            console.warn("[admin-timing] GET /api/admin/global-search", {
                total_ms: totalMs,
                q_len: q.length,
                result_count: results.length,
            });
        }

        return NextResponse.json({ ok: true, q, results });
    } catch (e) {
        console.error("[global-search]", e);
        return NextResponse.json(
            { ok: false, error: "SEARCH_FAILED", message: e instanceof Error ? e.message : "Search failed" },
            { status: 500 }
        );
    }
}
