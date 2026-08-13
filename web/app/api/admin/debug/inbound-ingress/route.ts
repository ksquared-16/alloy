import { NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    projectIngressDiagnosticRow,
    type IngressDiagnosticSource,
} from "@/lib/communications/ingress/ingressDiagnosticProjection";

/**
 * Read-only diagnostic: inbound provider messages Alloy could not attribute to a tenant.
 *
 * `communication_inbound_ingress` holds verified inbound messages whose owning
 * organization is unknown — no active binding matched the destination, or bindings
 * in several organizations did. The table is RLS-enabled with zero policies, so
 * only service_role reaches it and no tenant operator can see another tenant's
 * possibly-owned message.
 *
 * That correctness has a cost: without this endpoint the only way to find a stuck
 * message, or a STOP holding sends on an endpoint pair, is to query raw tables by
 * hand. This is the narrowest fix for that — the existing `/api/admin/debug`
 * convention (env-gated, admin-authenticated, read-only), not a new surface.
 *
 * NOT a tenant Inbox, and deliberately unable to become one:
 *   - message bodies are never returned; a parent's words are not diagnostic data
 *   - candidate ORG ids are never returned, so a cross-org ambiguity cannot leak
 *     one tenant's configuration to another
 *   - addresses are reduced to their last four digits
 *   - there is no mutation, no assignment, and no reply
 */

function ingressDiagnosticsEnabled(): boolean {
    return (
        process.env.COMMUNICATIONS_INGRESS_DIAGNOSTICS === "1" ||
        process.env.ADMIN_PERF_TRACE === "1"
    );
}

export async function GET(req: Request) {
    if (!ingressDiagnosticsEnabled()) {
        return NextResponse.json({ error: "Not enabled" }, { status: 404 });
    }
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const url = new URL(req.url);
    // Compliance first: an unresolved STOP is holding real sends and outranks
    // ordinary unattributed traffic.
    const complianceOnly = url.searchParams.get("compliance_only") === "1";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

    const supabase = createAdminClient();
    let query = supabase
        .from("communication_inbound_ingress")
        .select(
            "id, provider, channel, provider_message_id, from_address, to_address, received_at, routing_disposition, compliance_keyword, compliance_hold_active, candidate_binding_ids, candidate_org_ids"
        )
        .is("resolved_at", null)
        .order("received_at", { ascending: false })
        .limit(limit);

    if (complianceOnly) query = query.eq("compliance_hold_active", true);

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as IngressDiagnosticSource[];
    return NextResponse.json({
        unresolved_count: rows.length,
        compliance_hold_count: rows.filter((r) => r.compliance_hold_active === true).length,
        items: rows.map(projectIngressDiagnosticRow),
    });
}
