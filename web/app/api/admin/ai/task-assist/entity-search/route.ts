import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { sanitizeCrmSearchToken } from "@/lib/admin/forms/crmEntitySearchShared";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { runTaskAssistEntitySearch } from "@/lib/agent/taskAssist/taskAssistEntitySearchService";
import { createAdminClient } from "@/lib/supabaseAdmin";

const MIN_Q_LEN = 2;

/**
 * GET `/api/admin/ai/task-assist/entity-search?q=&entity_type=&limit=&include_customers=`
 *
 * Card 9b — org-scoped, permission-aware lookup for Task Assist command bar (no send, no LLM).
 *
 * - **`entity_type`**: `opportunities` (name/title only) | `all` (default: opportunities + customer→opportunity when scope is org-wide).
 * - **`include_customers`**: `false` to skip customer bridge even when scope allows.
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
    const entityType = (url.searchParams.get("entity_type") ?? "all").trim().toLowerCase();
    const includeCustomersParam = url.searchParams.get("include_customers");
    const includeCustomers =
        includeCustomersParam == null ? true : !["0", "false", "no"].includes(includeCustomersParam.trim().toLowerCase());

    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20, 1), 20);

    if (rawQ.length === 0) {
        return NextResponse.json(
            { ok: false, error: "Q_REQUIRED", message: "Query parameter q is required." },
            { status: 400 },
        );
    }

    const token = sanitizeCrmSearchToken(rawQ);
    if (token.length < MIN_Q_LEN && !/^[\da-f-]{36}$/i.test(rawQ.trim())) {
        return NextResponse.json(
            { ok: false, error: "Q_TOO_SHORT", message: `q must be at least ${MIN_Q_LEN} characters (after sanitizing), or a valid opportunity UUID.` },
            { status: 400 },
        );
    }

    if (entityType !== "all" && entityType !== "opportunities") {
        return NextResponse.json(
            { ok: false, error: "ENTITY_TYPE_INVALID", message: "entity_type must be all or opportunities." },
            { status: 400 },
        );
    }

    const supabase = createAdminClient();
    const dim = scopeDimensionsFromAccess(access);

    try {
        const { q, candidates } = await runTaskAssistEntitySearch({
            supabase,
            orgId: ctx.orgId,
            accessDim: dim,
            rawQ,
            limit,
            includeCustomers: includeCustomers && entityType === "all",
        });

        return NextResponse.json({ ok: true, q, candidates });
    } catch (e) {
        console.error("[task-assist/entity-search]", e);
        return NextResponse.json(
            { ok: false, error: "SEARCH_FAILED", message: e instanceof Error ? e.message : "Search failed" },
            { status: 500 },
        );
    }
}
