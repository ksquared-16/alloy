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
    completed_at: string | null;
    packet_definition_id: string;
    form_packet_definitions: { name: string } | { name: string }[] | null;
};

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
      completed_at,
      packet_definition_id,
      form_packet_definitions ( name )
    `
        )
        .eq("org_id", auth.orgId)
        .order("created_at", { ascending: false })
        .limit(100);

    const rows: PacketSessionListRow[] = (sessions ?? []).map((s) => {
        const row = s as SessionRow;
        const def = row.form_packet_definitions;
        const defName = Array.isArray(def) ? def[0]?.name : def?.name;
        return {
            id: row.id,
            status: row.status,
            created_at: row.created_at,
            completed_at: row.completed_at,
            packet_definition_id: row.packet_definition_id,
            packet_name: defName ?? null,
        };
    });

    return <PacketSessionsHubClient sessions={rows} errorMessage={error?.message ?? null} />;
}
