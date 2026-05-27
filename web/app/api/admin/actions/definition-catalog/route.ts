import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { filterSettingsActionCatalogDefinitions } from "@/lib/admin/actions/actionDefinitionRegistry";
import { requireAdminOrOps } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export type ActionDefinitionCatalogRow = {
    id: string;
    key: string;
    label: string;
    action_type: string;
    entity_type: string | null;
    org_id: string | null;
    is_active: boolean;
};

/** GET — action definitions this org may place as new buttons (platform + org-owned). */
export async function GET() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("action_definitions")
        .select("id, key, label, action_type, entity_type, org_id, is_active")
        .eq("is_active", true)
        .or(`org_id.is.null,org_id.eq.${ctx.orgId}`)
        .order("key", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const definitions: ActionDefinitionCatalogRow[] = filterSettingsActionCatalogDefinitions(
        (data ?? []).map((row) => {
            const r = row as ActionDefinitionCatalogRow;
            return {
                id: String(r.id),
                key: String(r.key),
                label: String(r.label),
                action_type: String(r.action_type),
                entity_type: r.entity_type ? String(r.entity_type) : null,
                org_id: r.org_id ? String(r.org_id) : null,
                is_active: Boolean(r.is_active),
            };
        })
    ) as ActionDefinitionCatalogRow[];

    return NextResponse.json({ definitions });
}
