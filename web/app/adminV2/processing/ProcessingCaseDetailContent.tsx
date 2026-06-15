"use client";

/**
 * POS-FP-W — shared read-only Processing Case detail content.
 *
 * Extracted from the FP4 drawer body so it can be reused by BOTH the standalone
 * drawer (deep-link page) and the converged Processing modal's middle column.
 * Read-only: case is the hero; sources are supporting evidence; proposed values are
 * visible but not promoted; records remain truth. No mutations.
 */

import { useCallback, useEffect, useState } from "react";
import type { ProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/types";
import type { SourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";

interface DetailResponse {
    data: {
        detail: ProcessingCaseDetail;
        evidence: SourceEvidence[];
        affectedRecordTypes: string[];
    };
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
    form_submission: "Form",
    form_packet_session: "Packet",
    document: "Document",
    upload: "Upload",
    email_attachment: "Email",
    import: "Import",
    recreated_document: "Recreated",
};

function statusLabel(status: string): string {
    return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function ProcessingCaseDetailContent({ caseId }: { caseId: string }) {
    const [data, setData] = useState<DetailResponse["data"] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}`, { credentials: "same-origin" });
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Processing case not found" : `Request failed (${res.status})`);
            }
            const body = (await res.json()) as DetailResponse;
            setData(body.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        void load();
    }, [load]);

    const detail = data?.detail ?? null;
    const primary = detail?.sources.find((s) => s.role === "primary") ?? detail?.sources[0] ?? null;
    const evidenceFor = (kind: string, id: string): SourceEvidence | undefined =>
        data?.evidence.find((e) => e.kind === kind && e.id === id);

    if (loading) return <div className="p-4 text-sm text-stone-500">Loading…</div>;
    if (error) return <div className="p-4 text-sm text-amber-700">{error}</div>;
    if (!detail) return null;

    return (
        <div className="p-4">
            <div className="mb-4">
                <div className="text-[11px] uppercase tracking-wide text-stone-400">Processing case</div>
                <h2 className="truncate text-base font-medium text-stone-900">
                    {primary?.display.label ?? "Processing case"}
                </h2>
                <div className="mt-1 text-xs text-stone-500">
                    {statusLabel(detail.status)} · received {primary?.display.receivedAt ?? detail.createdAt}
                </div>
            </div>

            <div className="space-y-5">
                <section>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Supporting evidence</h3>
                    <ul className="space-y-2">
                        {detail.sources.map((s) => (
                            <li key={`${s.kind}:${s.id}`} className="rounded-md border border-stone-200 p-2 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                                        {SOURCE_TYPE_LABELS[s.kind] ?? "Source"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-medium text-stone-800">
                                        {s.display.label}
                                    </span>
                                    <span className="text-xs text-stone-400">{s.role}</span>
                                </div>
                                {evidenceFor(s.kind, s.id)?.documentId ? (
                                    <div className="mt-1 text-xs text-emerald-700">Open document</div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>

                <section>
                    <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Proposed values</h3>
                    <p className="mb-2 text-xs text-amber-700">Proposed — not promoted to records.</p>
                    {data && data.evidence.every((e) => e.proposedValues.length === 0) ? (
                        <div className="text-sm text-stone-400">No proposed values on these sources.</div>
                    ) : (
                        <dl className="space-y-1">
                            {data?.evidence.flatMap((e) =>
                                e.proposedValues.map((v, i) => (
                                    <div key={`${e.kind}:${e.id}:${i}`} className="flex gap-2 text-sm">
                                        <dt className="w-40 shrink-0 text-stone-500">{v.label}</dt>
                                        <dd className="min-w-0 flex-1 text-stone-800">{v.value ?? "—"}</dd>
                                    </div>
                                ))
                            )}
                        </dl>
                    )}
                </section>

                <section>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                        Records that may be affected
                    </h3>
                    {data && data.affectedRecordTypes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {data.affectedRecordTypes.map((t) => (
                                <span key={t} className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                                    {t}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-stone-400">None yet — nothing is promoted until reviewed.</div>
                    )}
                </section>
            </div>
        </div>
    );
}
