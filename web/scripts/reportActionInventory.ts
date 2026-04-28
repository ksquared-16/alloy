import { createAdminClient } from "@/lib/supabaseAdmin";

type ActionDefinitionRow = {
    id: string;
    org_id: string | null;
    key: string;
    label: string | null;
    entity_type: string;
    action_type: string;
    condition_config: unknown;
    payload_schema: unknown;
    is_active: boolean;
};

type ActionPlacementRow = {
    id: string;
    org_id: string | null;
    surface: string;
    slot: string;
    entity_type: string;
    action_definition_id: string;
    section_key: string | null;
    department_id: string | null;
    work_unit_id: string | null;
    order_index: number | null;
    is_active: boolean;
};

function pickArg(name: string): string | null {
    const i = process.argv.findIndex((a) => a === name);
    if (i < 0) return null;
    const v = process.argv[i + 1];
    if (!v || v.startsWith("--")) return null;
    return v;
}

function json(v: unknown): string {
    try {
        return JSON.stringify(v ?? null);
    } catch {
        return "null";
    }
}

async function main() {
    const orgId = pickArg("--org") || process.env.ORG_ID || "";
    if (!orgId.trim()) {
        // eslint-disable-next-line no-console
        console.error("Missing org id. Usage: tsx web/scripts/reportActionInventory.ts --org <org_id>");
        process.exit(2);
    }

    const supabase = createAdminClient();

    const [{ data: defs, error: defsErr }, { data: placements, error: plErr }] = await Promise.all([
        supabase
            .from("action_definitions")
            .select("id, org_id, key, label, entity_type, action_type, condition_config, payload_schema, is_active")
            .eq("org_id", orgId),
        supabase
            .from("action_placements")
            .select("id, org_id, surface, slot, entity_type, action_definition_id, section_key, department_id, work_unit_id, order_index, is_active")
            .eq("org_id", orgId),
    ]);

    if (defsErr) throw new Error(defsErr.message);
    if (plErr) throw new Error(plErr.message);

    const defsById = new Map((defs ?? []).map((d) => [String((d as any).id), d as unknown as ActionDefinitionRow]));

    const rows = (placements ?? [])
        .map((p) => p as unknown as ActionPlacementRow)
        .sort((a, b) => {
            const s = `${a.surface}:${a.slot}:${a.section_key ?? ""}:${a.order_index ?? 0}:${a.action_definition_id}`;
            const t = `${b.surface}:${b.slot}:${b.section_key ?? ""}:${b.order_index ?? 0}:${b.action_definition_id}`;
            return s.localeCompare(t);
        })
        .map((p) => {
            const d = defsById.get(p.action_definition_id) ?? null;
            return {
                key: d?.key ?? null,
                label: d?.label ?? null,
                surface: p.surface,
                slot: p.slot,
                section_key: p.section_key,
                entity_type: p.entity_type,
                action_type: d?.action_type ?? null,
                condition_config: d?.condition_config ?? null,
                payload_schema: d?.payload_schema ?? null,
                is_active: Boolean(d?.is_active) && Boolean(p.is_active),
                placement: {
                    department_id: p.department_id,
                    work_unit_id: p.work_unit_id,
                    order_index: p.order_index,
                },
            };
        });

    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify(
            {
                org_id: orgId,
                counts: {
                    definitions: (defs ?? []).length,
                    placements: (placements ?? []).length,
                    inventory_rows: rows.length,
                },
                rows,
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
});

