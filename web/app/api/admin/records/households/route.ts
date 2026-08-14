import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { allowListIsImpossible, resolveSearchAccessEnvelope } from "@/lib/search/searchAccessEnvelope";

/**
 * Records → Add Child, step 1: WHICH household.
 *
 * Household is chosen, never inferred. The path this replaces resolved a child's
 * household from a name match, which is how "Emma Chen" landed in whichever
 * family happened to sort first. A picker is the whole point: the operator makes
 * the household explicit before any identity question is asked.
 *
 * Read-only, org-scoped, and restricted by the same access envelope the rest of
 * Records uses — an operator who cannot see a household cannot add a child to it.
 */

const PAGE_LIMIT = 25;
/**
 * Over-fetch before applying a restricted allow-list in memory.
 *
 * The allow-list is NOT pushed into `.in()`: PostgREST puts filters in the URI,
 * so a large allow-list produces a request too long to send (proven in Search
 * V2). Fetching a wider slab and narrowing here keeps the boundary exact without
 * that failure mode.
 */
const RESTRICTED_SCAN_LIMIT = 400;

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("q") ?? "").trim();

    const supabase = createAdminClient();

    try {
        const envelope = await resolveSearchAccessEnvelope(
            supabase,
            ctx.orgId,
            scopeDimensionsFromAccess(access)
        );
        // The operator can reach nothing: an empty list is the honest answer.
        if (envelope.impossible) return NextResponse.json({ ok: true, households: [] });
        if (envelope.restricted && allowListIsImpossible(envelope.allowedCustomerIds)) {
            return NextResponse.json({ ok: true, households: [] });
        }

        const restricted = envelope.restricted && envelope.allowedCustomerIds !== null;
        let query = supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", ctx.orgId)
            .order("name")
            .limit(restricted ? RESTRICTED_SCAN_LIMIT : PAGE_LIMIT);
        if (search) query = query.ilike("name", `%${search}%`);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const allowed = restricted ? new Set(envelope.allowedCustomerIds ?? []) : null;
        const households = ((data ?? []) as { id: string; name: string | null }[])
            .filter((h) => (allowed ? allowed.has(h.id) : true))
            .slice(0, PAGE_LIMIT)
            .map((h) => ({ id: h.id, name: (h.name ?? "").trim() || "Untitled household" }));

        return NextResponse.json({ ok: true, households });
    } catch (e) {
        console.error("[records-households]", e);
        return NextResponse.json(
            {
                ok: false,
                error: "LOAD_FAILED",
                message: e instanceof Error ? e.message : "Could not load households",
            },
            { status: 500 }
        );
    }
}
