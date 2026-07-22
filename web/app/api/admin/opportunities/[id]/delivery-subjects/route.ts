import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/**
 * Eligible RELATED SUBJECTS for a form delivery on an opportunity.
 *
 * Generic by design: returns `{ id, label, entity_type }` rows so the form-delivery surface can
 * offer subject targeting without branching on the entity type. v1 sources the opportunity's
 * children (customer_members linked via opportunity_customer_members); other entity types can be
 * unioned in here later without any presentation change.
 */
export type FormDeliverySubject = {
    id: string;
    label: string;
    entity_type: string;
};

function subjectLabel(row: { display_name?: string | null; first_name?: string | null; last_name?: string | null }): string {
    const display = row.display_name?.trim();
    if (display) return display;
    const composed = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return composed || "Child";
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: rawId } = await context.params;
    const opportunityId = parseUuidParam(rawId, "id");
    if (opportunityId instanceof NextResponse) return opportunityId;

    const supabase = createAdminClient();

    // Which customer_members are related to this opportunity.
    const { data: ocmRows, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id")
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", opportunityId);
    if (ocmErr) return jsonError(ocmErr.message, 500);

    const memberIds = Array.from(
        new Set((ocmRows ?? []).map((r) => (r as { customer_member_id: string }).customer_member_id).filter(Boolean)),
    );
    if (memberIds.length === 0) return jsonData({ subjects: [] as FormDeliverySubject[] });

    const { data: members, error: memErr } = await supabase
        .from("customer_members")
        .select("id, display_name, first_name, last_name, is_active")
        .eq("org_id", ctx.orgId)
        .in("id", memberIds);
    if (memErr) return jsonError(memErr.message, 500);

    const subjects: FormDeliverySubject[] = (members ?? [])
        .filter((m) => (m as { is_active?: boolean }).is_active !== false)
        .map((m) => ({
            id: (m as { id: string }).id,
            label: subjectLabel(m as { display_name?: string | null; first_name?: string | null; last_name?: string | null }),
            entity_type: "customer_member",
        }));

    return jsonData({ subjects });
}
