import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ItemRow = {
    id: string;
    sequence_index: number;
    status: string;
    submitted_at: string | null;
    form_submission_id: string | null;
    form_definition_id: string | null;
    form_name: string | null;
    form_key: string | null;
};

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
    const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(packetSessionId)) notFound();

    const supabase = createAdminClient();

    const { data: session, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select(
            `
        id,
        status,
        created_at,
        completed_at,
        packet_definition_id,
        started_via_public_link_id,
        current_sequence_index,
        launch_context,
        crm_snapshot,
        shared_values,
        form_packet_definitions ( id, name, key )
      `
        )
        .eq("id", packetSessionId)
        .eq("org_id", auth.orgId)
        .maybeSingle();

    if (sErr) {
        return <div className="p-6 text-sm text-red-700">Failed to load session: {sErr.message}</div>;
    }
    if (!session) notFound();

    const { data: items, error: iErr } = await supabase
        .from("form_packet_session_items")
        .select("id, sequence_index, status, submitted_at, form_submission_id, packet_item_id, skip_reason")
        .eq("packet_session_id", packetSessionId)
        .eq("org_id", auth.orgId)
        .order("sequence_index", { ascending: true });

    if (iErr) {
        return <div className="p-6 text-sm text-red-700">Failed to load steps: {iErr.message}</div>;
    }

    const packetItemIds = [...new Set((items ?? []).map((r: { packet_item_id: string }) => r.packet_item_id))];
    const defItemMap: Record<string, { form_definition_id: string }> = {};
    if (packetItemIds.length > 0) {
        const { data: di } = await supabase
            .from("form_packet_items")
            .select("id, form_definition_id")
            .in("id", packetItemIds)
            .eq("org_id", auth.orgId);
        for (const row of di ?? []) {
            const r = row as { id: string; form_definition_id: string };
            defItemMap[r.id] = { form_definition_id: r.form_definition_id };
        }
    }

    const formIds = [...new Set(Object.values(defItemMap).map((d) => d.form_definition_id))];
    const formMeta: Record<string, { name: string; key: string }> = {};
    if (formIds.length > 0) {
        const { data: forms } = await supabase
            .from("form_definitions")
            .select("id, name, key")
            .in("id", formIds)
            .eq("org_id", auth.orgId);
        for (const row of forms ?? []) {
            const r = row as { id: string; name: string; key: string };
            formMeta[r.id] = { name: r.name, key: r.key };
        }
    }

    const enriched: ItemRow[] = (items ?? []).map((it: Record<string, unknown>) => {
        const pid = it.packet_item_id as string;
        const fdid = defItemMap[pid]?.form_definition_id ?? null;
        const fm = fdid ? formMeta[fdid] : undefined;
        return {
            id: it.id as string,
            sequence_index: it.sequence_index as number,
            status: it.status as string,
            submitted_at: (it.submitted_at as string | null) ?? null,
            form_submission_id: (it.form_submission_id as string | null) ?? null,
            form_definition_id: fdid,
            form_name: fm?.name ?? null,
            form_key: fm?.key ?? null,
        };
    });

    const pktDef = session.form_packet_definitions as { name?: string; key?: string } | { name?: string; key?: string }[] | null;
    const pktName = Array.isArray(pktDef) ? pktDef[0]?.name : pktDef?.name;

    const crm = (session.crm_snapshot ?? {}) as Record<string, unknown>;

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6 text-[#31394d]">
            <div className="flex flex-wrap items-center gap-3">
                <Link href="/adminV2/forms/packets" className="text-sm font-medium text-[#59678b] hover:text-[#0f172a]">
                    ← Packet sessions
                </Link>
            </div>

            <div>
                <h1 className="text-xl font-semibold text-[#0f172a]">{pktName ?? "Packet session"}</h1>
                <p className="mt-2 text-sm text-[#59678b]">
                    Status: <span className="font-medium text-[#31394d]">{session.status}</span>
                    {" · "}Started {new Date(session.created_at as string).toLocaleString()}
                    {session.completed_at ?
                        ` · Completed ${new Date(session.completed_at as string).toLocaleString()}`
                    : ""}
                </p>
                <div className="mt-3 rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-3 text-xs text-[#59678b]">
                    <p className="font-medium text-[#31394d]">CRM snapshot</p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-[#31394d]">
                        {JSON.stringify(crm, null, 2)}
                    </pre>
                </div>
            </div>

            <div>
                <h2 className="text-sm font-semibold text-[#0f172a]">Steps</h2>
                <ul className="mt-2 divide-y divide-[#e6e8ec] rounded-lg border border-[#e6e8ec] bg-white">
                    {enriched.map((step) => (
                        <li key={step.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-medium text-[#0f172a]">
                                    Step {step.sequence_index + 1}: {step.form_name ?? step.form_key ?? "Form"}
                                </span>
                                <span className="text-xs uppercase tracking-wide text-[#59678b]">{step.status}</span>
                            </div>
                            {step.form_submission_id && step.form_definition_id ?
                                <Link
                                    href={`/adminV2/forms/${step.form_definition_id}/submissions/${step.form_submission_id}`}
                                    className="text-sm font-medium text-[#2563eb] hover:underline"
                                >
                                    Open submission
                                </Link>
                            : null}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
