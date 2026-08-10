import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { runSearch } from "@/lib/search/runSearch";
import { SEARCH_DEFAULT_LIMIT, SEARCH_MIN_Q_LEN } from "@/lib/search/searchContracts";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET `/api/admin/global-search?q=&limit=`
 *
 * Alloy Search Platform V2 — subject-centred discovery.
 *
 * Returns canonical SUBJECTS with recognition context, relevant operational
 * contexts, and navigable destinations. This is the one search system: there is
 * no separate enrollment/schedule/staff search, and no BOS/semantic path here.
 *
 * Authorization is enforced BEFORE retrieval — see `searchAccessEnvelope`. A
 * subject the operator may not know about is never retrieved, so it can never be
 * revealed and then blocked on click.
 *
 * Results are previews/selections. They are never authoritative truth and must
 * never be used as mutation input.
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
    const limitRaw = Number(url.searchParams.get("limit") ?? SEARCH_DEFAULT_LIMIT);

    if (rawQ.length === 0) {
        return NextResponse.json(
            { ok: false, error: "Q_REQUIRED", message: "Query parameter q is required." },
            { status: 400 }
        );
    }

    if (rawQ.length < SEARCH_MIN_Q_LEN) {
        return NextResponse.json(
            {
                ok: false,
                error: "Q_TOO_SHORT",
                message: `q must be at least ${SEARCH_MIN_Q_LEN} characters.`,
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const t0 = Date.now();

    try {
        const { q, intent, results } = await runSearch({
            supabase,
            orgId: ctx.orgId,
            dimensions: scopeDimensionsFromAccess(access),
            rawQ,
            limit: Number.isFinite(limitRaw) ? limitRaw : SEARCH_DEFAULT_LIMIT,
        });

        const totalMs = Date.now() - t0;
        if (totalMs > 250) {
            console.warn("[admin-timing] GET /api/admin/global-search", {
                total_ms: totalMs,
                q_len: q.length,
                result_count: results.length,
                subject_terms: intent.subject_terms.length,
                context_terms: intent.context_terms.length,
            });
        }

        return NextResponse.json({ ok: true, q, intent, results });
    } catch (e) {
        console.error("[global-search]", e);
        return NextResponse.json(
            { ok: false, error: "SEARCH_FAILED", message: e instanceof Error ? e.message : "Search failed" },
            { status: 500 }
        );
    }
}
