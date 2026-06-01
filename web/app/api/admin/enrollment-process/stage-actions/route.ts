import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { buildEnrollmentProcessStageActionRows } from "@/lib/lifecycle/enrollmentProcessStageActions";

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

/** GET ?stage= — opportunity actions associated with an enrollment operator stage. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const stage = new URL(request.url).searchParams.get("stage")?.trim() || "";
    if (!isStageKey(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });

    const supabase = createAdminClient();

    const { data: placementsRaw, error: pErr } = await supabase
        .from("action_placements")
        .select(
            [
                "action_definition_id",
                "surface",
                "slot",
                "entity_type",
                "department_id",
                "work_unit_id",
                "is_active",
            ].join(",")
        )
        .or(`org_id.is.null,org_id.eq.${ctx.orgId}`)
        .eq("is_active", true);

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    type PlacementRow = {
        action_definition_id: string;
        surface: string;
        slot: string;
        entity_type: string | null;
        department_id: string | null;
        work_unit_id: string | null;
        is_active: boolean;
    };

    const placements = (placementsRaw ?? []) as unknown as PlacementRow[];
    const defIds = [...new Set(placements.map((p) => String(p.action_definition_id)).filter(Boolean))];

    type DefRow = {
        id: string;
        key: string;
        label: string;
        entity_type: string | null;
        is_active: boolean;
        payload_schema: unknown;
    };

    const { data: defsRaw, error: dErr } = await supabase
        .from("action_definitions")
        .select("id, key, label, entity_type, is_active, payload_schema")
        .in("id", defIds.length ? defIds : ["00000000-0000-0000-0000-000000000000"])
        .or(`org_id.is.null,org_id.eq.${ctx.orgId}`);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

    const defs = (defsRaw ?? []) as unknown as DefRow[];
    const defsById = new Map(defs.map((d) => [String(d.id), d]));

    const byDefId = new Map<
        string,
        {
            definition: DefRow;
            placements: PlacementRow[];
        }
    >();

    for (const p of placements) {
        const def = defsById.get(String(p.action_definition_id));
        if (!def) continue;
        const entry = byDefId.get(def.id) ?? { definition: def, placements: [] };
        entry.placements.push(p);
        byDefId.set(def.id, entry);
    }

    const actions = buildEnrollmentProcessStageActionRows(stage, [...byDefId.values()]);

    return NextResponse.json({ stage, actions });
}
