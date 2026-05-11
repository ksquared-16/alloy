import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

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

    if (error) {
        return (
            <div className="p-6 text-sm text-red-700">
                Could not load packet sessions: {error.message}
            </div>
        );
    }

    const rows = (sessions ?? []) as SessionRow[];

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6 text-[#31394d]">
            <div>
                <h1 className="text-xl font-semibold text-[#0f172a]">Packet sessions</h1>
                <p className="mt-2 text-sm leading-relaxed text-[#59678b]">
                    Review multi-form enrollment runs (one public link → one session). Open a row for step-level
                    submissions.
                </p>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-4 text-sm text-[#59678b]">
                    No packet sessions yet. Configure packets under{" "}
                    <Link href="/adminV2/forms/packet-definitions" className="font-medium text-[#00458C] hover:underline">
                        Packet definitions
                    </Link>
                    , then create a packet public link from that screen.
                </p>
            ) : (
                <ul className="divide-y divide-[#e6e8ec] rounded-lg border border-[#e6e8ec] bg-white">
                    {rows.map((s) => {
                        const def = s.form_packet_definitions;
                        const defName = Array.isArray(def) ? def[0]?.name : def?.name;
                        return (
                            <li key={s.id}>
                                <Link
                                    href={`/adminV2/forms/packets/${s.id}`}
                                    className="flex flex-col gap-1 px-4 py-3 text-sm hover:bg-[#fafbfd]"
                                >
                                    <span className="font-medium text-[#0f172a]">{defName ?? "Packet"}</span>
                                    <span className="text-xs text-[#59678b]">
                                        {s.status}
                                        {" · "}
                                        {new Date(s.created_at).toLocaleString()}
                                        {s.completed_at ? ` · completed ${new Date(s.completed_at).toLocaleString()}` : ""}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
