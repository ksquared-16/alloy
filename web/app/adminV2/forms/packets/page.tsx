import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import PacketSessionsHubClient, {
    type PacketSessionListRow,
} from "@/app/admin/forms/PacketSessionsHubClient";

export const dynamic = "force-dynamic";

type SessionRow = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string | null;
    completed_at: string | null;
    packet_definition_id: string;
    operator_review_status: string | null;
    operator_review_warnings: unknown;
    launch_context: unknown;
    crm_snapshot: unknown;
    current_sequence_index: number | null;
    form_packet_definitions: { name: string } | { name: string }[] | null;
};

type SessionItemRow = {
    packet_session_id: string;
    status: string;
};

function parseRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseWarnings(value: unknown): { kind?: string; message?: string }[] {
    return Array.isArray(value) ? (value as { kind?: string; message?: string }[]) : [];
}

function parseCrmSnapshot(value: unknown): PacketSessionListRow["crm_snapshot"] {
    const snap = parseRecord(value);
    return {
        opportunity_id: typeof snap.opportunity_id === "string" ? snap.opportunity_id : null,
        customer_id: typeof snap.customer_id === "string" ? snap.customer_id : null,
        person_id: typeof snap.person_id === "string" ? snap.person_id : null,
        customer_member_id: typeof snap.customer_member_id === "string" ? snap.customer_member_id : null,
    };
}

function buildStepCounts(items: SessionItemRow[]): Map<string, { step_count: number; submitted_step_count: number }> {
    const map = new Map<string, { step_count: number; submitted_step_count: number }>();
    for (const item of items) {
        const current = map.get(item.packet_session_id) ?? { step_count: 0, submitted_step_count: 0 };
        current.step_count += 1;
        if (item.status === "submitted") current.submitted_step_count += 1;
        map.set(item.packet_session_id, current);
    }
    return map;
}

export default async function AdminV2PacketSessionsPage() {
    const auth = await getAdminAuth();
    if (!auth?.user?.id || !auth.orgId) {
        redirect("/unauthorized");
    }

    const supabase = createAdminClient();
    const { data: sessions, error } = await supabase
        .from("form_packet_sessions")
        .select(
            `
      id,
      status,
      created_at,
      updated_at,
      completed_at,
      packet_definition_id,
      operator_review_status,
      operator_review_warnings,
      launch_context,
      crm_snapshot,
      current_sequence_index,
      form_packet_definitions ( name )
    `
        )
        .eq("org_id", auth.orgId)
        .order("created_at", { ascending: false })
        .limit(100);

    const sessionIds = (sessions ?? []).map((s) => (s as SessionRow).id);
    const { data: rawItems } =
        sessionIds.length === 0 ?
            { data: [] as SessionItemRow[] }
        :   await supabase
                .from("form_packet_session_items")
                .select("packet_session_id, status")
                .eq("org_id", auth.orgId)
                .in("packet_session_id", sessionIds);

    const stepCounts = buildStepCounts((rawItems ?? []) as SessionItemRow[]);

    const rows: PacketSessionListRow[] = (sessions ?? []).map((s) => {
        const row = s as SessionRow;
        const def = row.form_packet_definitions;
        const defName = Array.isArray(def) ? def[0]?.name : def?.name;
        const counts = stepCounts.get(row.id);
        const warnings = parseWarnings(row.operator_review_warnings);

        return {
            id: row.id,
            status: row.status,
            created_at: row.created_at,
            completed_at: row.completed_at,
            packet_definition_id: row.packet_definition_id,
            packet_name: defName ?? null,
            operator_review_status: row.operator_review_status,
            operator_review_warnings: warnings,
            warning_count: warnings.length,
            launch_context: parseRecord(row.launch_context),
            crm_snapshot: parseCrmSnapshot(row.crm_snapshot),
            step_count: counts?.step_count,
            submitted_step_count: counts?.submitted_step_count,
        };
    });

    return <PacketSessionsHubClient sessions={rows} errorMessage={error?.message ?? null} />;
}
