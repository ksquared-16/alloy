"use client";

import { formatDateTime } from "@/lib/adminFormatters";

type OutboxRow = {
    id: string;
    created_at: string;
    org_id: string | null;
    workflow_run_id: string | null;
    channel: string;
    to_contact_id: string | null;
    to_phone: string | null;
    to_email: string | null;
    body: string;
    status: string;
    dedupe_key: string | null;
    sent_at: string | null;
    error: string | null;
};

interface MessagesOutboxClientProps {
    initialData: OutboxRow[];
    error?: string;
}

export default function MessagesOutboxClient({ initialData, error }: MessagesOutboxClientProps) {
    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Messages outbox</h1>
            <p className="text-sm text-alloy-midnight/70 mb-4">
                Last 50 rows. Queued by workflow send_message; status=queued until sent. No Twilio required to queue.
            </p>
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}
            <div className="overflow-x-auto border border-alloy-stone/30 rounded-lg bg-white">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-alloy-stone/30 bg-alloy-stone/20">
                            <th className="text-left p-2">Created</th>
                            <th className="text-left p-2">Channel</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">To (contact / phone / email)</th>
                            <th className="text-left p-2 max-w-[200px]">Body</th>
                            <th className="text-left p-2">workflow_run_id</th>
                            <th className="text-left p-2">dedupe_key</th>
                            <th className="text-left p-2">sent_at</th>
                            <th className="text-left p-2">error</th>
                        </tr>
                    </thead>
                    <tbody>
                        {initialData.length === 0 && !error && (
                            <tr>
                                <td colSpan={9} className="p-4 text-alloy-midnight/50 text-center">
                                    No rows. Run a booking_confirmed workflow with send_message (job_qualified_vendors) to queue messages.
                                </td>
                            </tr>
                        )}
                        {initialData.map((row) => (
                            <tr key={row.id} className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10">
                                <td className="p-2 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                                <td className="p-2">{row.channel}</td>
                                <td className="p-2">{row.status}</td>
                                <td className="p-2">
                                    {row.to_contact_id ? <span title={row.to_contact_id}>{row.to_contact_id.slice(0, 8)}…</span> : "—"}
                                    {row.to_phone != null && row.to_phone !== "" && <><br /><span className="text-alloy-midnight/70">{row.to_phone}</span></>}
                                    {row.to_email != null && row.to_email !== "" && <><br /><span className="text-alloy-midnight/70">{row.to_email}</span></>}
                                </td>
                                <td className="p-2 max-w-[200px] truncate" title={row.body}>{row.body?.slice(0, 80)}{(row.body?.length ?? 0) > 80 ? "…" : ""}</td>
                                <td className="p-2 font-mono text-xs">{row.workflow_run_id ? `${row.workflow_run_id.slice(0, 8)}…` : "—"}</td>
                                <td className="p-2 text-alloy-midnight/70">{row.dedupe_key ?? "—"}</td>
                                <td className="p-2">{row.sent_at ? formatDateTime(row.sent_at) : "—"}</td>
                                <td className="p-2 text-red-600 text-xs">{row.error ?? "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
