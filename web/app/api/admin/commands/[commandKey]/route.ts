import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    getOrganizationCommandCatalogEntry,
} from "@/lib/platform/commands/organizationCommandCatalog";
import { parseCommandConfigVariants } from "@/lib/platform/commands/commandConfigVariants";
import { listProcessCommandUsage } from "@/lib/platform/commands/processCommandUsage";

export const dynamic = "force-dynamic";

type DefRow = {
    id: string;
    org_id: string | null;
    key: string;
    label: string;
    entity_type: string | null;
    is_active: boolean;
    metadata: unknown;
};

type PlacementRow = {
    id: string;
    org_id: string | null;
    action_definition_id: string;
    surface: string;
    slot: string;
    entity_type: string | null;
    section_key: string | null;
    is_active: boolean;
    order_index: number;
};

/**
 * GET /api/admin/commands/[commandKey]
 * Organization Commands detail: catalog honesty + org overlays + process usage.
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ commandKey: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { commandKey: rawKey } = await context.params;
    const commandKey = decodeURIComponent(rawKey ?? "").trim();
    if (!commandKey) {
        return NextResponse.json({ error: "commandKey required" }, { status: 400 });
    }

    const command = getOrganizationCommandCatalogEntry(commandKey);
    if (!command) {
        return NextResponse.json({ error: "Command not found in catalog" }, { status: 404 });
    }

    const keys = new Set<string>([
        command.canonicalCommandKey,
        command.capabilityKey,
        ...command.aliases,
    ]);

    const supabase = createAdminClient();
    const { data: defsRaw, error: defErr } = await supabase
        .from("action_definitions")
        .select("id, org_id, key, label, entity_type, is_active, metadata")
        .or(`org_id.is.null,org_id.eq.${ctx.orgId}`)
        .in("key", [...keys]);

    if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });

    const definitions = ((defsRaw ?? []) as DefRow[]).map((d) => ({
        id: String(d.id),
        orgId: d.org_id ? String(d.org_id) : null,
        key: String(d.key),
        label: String(d.label),
        entityType: d.entity_type ? String(d.entity_type) : null,
        isActive: Boolean(d.is_active),
        orgOwned: Boolean(d.org_id),
    }));

    const defIds = definitions.map((d) => d.id);
    let placements: Array<{
        id: string;
        orgId: string | null;
        orgOwned: boolean;
        definitionId: string;
        surface: string;
        slot: string;
        entityType: string | null;
        sectionKey: string | null;
        isActive: boolean;
        orderIndex: number;
    }> = [];

    if (defIds.length > 0) {
        const { data: placeRaw, error: pErr } = await supabase
            .from("action_placements")
            .select(
                "id, org_id, action_definition_id, surface, slot, entity_type, section_key, is_active, order_index"
            )
            .or(`org_id.is.null,org_id.eq.${ctx.orgId}`)
            .in("action_definition_id", defIds)
            .order("surface", { ascending: true })
            .order("order_index", { ascending: true });

        if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

        placements = ((placeRaw ?? []) as PlacementRow[]).map((p) => ({
            id: String(p.id),
            orgId: p.org_id ? String(p.org_id) : null,
            orgOwned: Boolean(p.org_id),
            definitionId: String(p.action_definition_id),
            surface: String(p.surface),
            slot: String(p.slot),
            entityType: p.entity_type ? String(p.entity_type) : null,
            sectionKey: p.section_key ? String(p.section_key) : null,
            isActive: Boolean(p.is_active),
            orderIndex: Number(p.order_index) || 0,
        }));
    }

    const variants = parseCommandConfigVariants(
        ((defsRaw ?? []) as DefRow[]).find((d) => d.org_id === ctx.orgId)?.metadata ??
            ((defsRaw ?? []) as DefRow[])[0]?.metadata
    );

    const { data: depts, error: deptErr } = await supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true);

    if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 500 });

    const processUsage = listProcessCommandUsage({
        capabilityKey: command.canonicalCommandKey,
        departments: (depts ?? []).map((d) => ({
            id: String((d as { id: string }).id),
            name: String((d as { name: string }).name ?? ""),
            metadata: (d as { metadata?: unknown }).metadata,
        })),
    });

    return NextResponse.json({
        command,
        definitions,
        placements,
        variants,
        processUsage,
    });
}
