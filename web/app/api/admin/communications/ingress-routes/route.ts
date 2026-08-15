import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";

/**
 * GET /api/admin/communications/ingress-routes — the ADMINISTRATOR'S setup detail.
 *
 * A SEPARATE endpoint on purpose. The ordinary bindings projection deliberately
 * carries no delivery destination: it feeds the channel cards, the composer's
 * From line and the operator's own identity display, and a transport address
 * reaching any of those would be shown to someone as an email address they might
 * then give to a parent.
 *
 * But an administrator setting up address-level routing genuinely needs the
 * destination — it is the value they paste into their own mail provider's
 * forwarding rule. So it is served here, from a route whose name says what it is,
 * rather than by widening the projection everything else reads.
 *
 * That split is the whole point: "never rendered in ordinary operator or parent
 * UX" stays true because ordinary UX cannot obtain it, not because each surface
 * remembers to omit it.
 */
export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_ingress_routes")
        .select("id, communication_provider_binding_id, destination, verification_state, last_inbound_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        routes: (data ?? []).map((raw) => {
            const row = raw as {
                id: string;
                communication_provider_binding_id: string;
                destination: string;
                verification_state: string;
                last_inbound_at: string | null;
            };
            return {
                id: row.id,
                binding_id: row.communication_provider_binding_id,
                destination: row.destination,
                verification_state: row.verification_state,
                last_inbound_at: row.last_inbound_at,
                /**
                 * Whether inbound has actually been observed here. Reported as its
                 * own boolean rather than left for a caller to infer from
                 * `verification_state`, so the UI cannot accidentally treat
                 * "configured" as "working" — the exact substitution this whole
                 * model exists to prevent.
                 */
                inbound_observed: row.last_inbound_at !== null,
            };
        }),
    });
}
