import { redirect, notFound } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { PacketSessionReviewClient } from "@/components/forms/packets/PacketSessionReviewClient";

export const dynamic = "force-dynamic";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Packet session review console — rollup UI (P2-2); execution truth unchanged. */
export default async function AdminV2PacketSessionDetailPage({
    params,
}: {
    params: Promise<{ packetSessionId: string }>;
}) {
    const auth = await getAdminAuth();
    if (!auth?.user?.id || !auth.orgId) {
        redirect("/unauthorized");
    }

    const { packetSessionId } = await params;
    if (!UUID_RE.test(packetSessionId)) notFound();

    const supabase = createAdminClient();
    const { data: session, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select(
            `
      id,
      launch_context,
      crm_snapshot,
      shared_values,
      opportunity_id,
      customer_id,
      recipient_person_id,
      form_packet_definitions ( key )
    `
        )
        .eq("id", packetSessionId)
        .eq("org_id", auth.orgId)
        .maybeSingle();

    if (sErr) {
        return (
            <div className="p-6 text-sm text-red-700">
                Failed to load session: {sErr.message}
            </div>
        );
    }
    if (!session) notFound();

    const def = session.form_packet_definitions as { key?: string | null } | { key?: string | null }[] | null;
    const defKey = Array.isArray(def) ? def[0]?.key : def?.key;

    const technicalDetails = {
        launch_context: session.launch_context ?? {},
        crm_snapshot: session.crm_snapshot ?? {},
        shared_values: session.shared_values ?? {},
        identifiers: {
            packet_session_id: session.id,
            opportunity_id: session.opportunity_id ?? null,
            customer_id: session.customer_id ?? null,
            recipient_person_id: session.recipient_person_id ?? null,
            packet_definition_key: defKey ?? null,
        },
    };

    return (
        <PacketSessionReviewClient
            packetSessionId={packetSessionId}
            canMutate
            technicalDetails={technicalDetails}
        />
    );
}
