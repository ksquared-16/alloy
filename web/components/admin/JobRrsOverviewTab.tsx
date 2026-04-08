"use client";

import { useEffect, useState } from "react";
import type { ResolvedRecordPayload } from "@/lib/rrs/types";

function formatRrsValue(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

function parseEntityError(json: unknown, res: Response): string {
    if (typeof json === "string" && json.trim()) return json;
    if (json && typeof json === "object" && "error" in json) {
        const e = (json as { error?: unknown }).error;
        if (typeof e === "string" && e.trim()) return e;
    }
    return res.status === 404 ? "Not found" : "Failed to load";
}

export default function JobRrsOverviewTab({ jobId }: { jobId: string }) {
    const [payload, setPayload] = useState<ResolvedRecordPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setErr(null);
            try {
                const res = await fetch(`/api/admin/entity/jobs/${encodeURIComponent(jobId)}?surface=overview`);
                const json: unknown = await res.json().catch(() => null);
                if (!res.ok) throw new Error(parseEntityError(json, res));
                const rrs = json && typeof json === "object" ? (json as { _rrs?: ResolvedRecordPayload })._rrs : undefined;
                if (!rrs) throw new Error("No _rrs in response");
                if (!cancelled) setPayload(rrs);
            } catch (e) {
                if (!cancelled) setErr((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [jobId]);

    if (loading) return <p className="text-sm text-alloy-midnight/60 py-4">Loading resolver overview…</p>;
    if (err) return <p className="text-sm text-red-600 py-4">{err}</p>;
    if (!payload) return null;

    return (
        <div className="space-y-6" data-job-rrs-overview>
            <p className="text-xs text-alloy-midnight/50">
                Resolver surface <code className="text-[11px]">overview</code>
                {payload.overview_layout?.template_key ? (
                    <>
                        {" "}
                        · layout <code className="text-[11px]">{payload.overview_layout.template_key}</code>
                    </>
                ) : null}
            </p>
            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-forge/75 border-b border-admin-border pb-2 mb-3">
                    Fields
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {payload.fields.map((f) => (
                        <div key={f.key} className="text-sm">
                            <div className="text-xs font-medium text-alloy-midnight/55">{f.label}</div>
                            <div className="text-alloy-midnight/90 mt-0.5 break-words">{formatRrsValue(f.value)}</div>
                        </div>
                    ))}
                </div>
            </div>
            {payload.relationship_groups.length > 0 ? (
                <div className="space-y-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-forge/75 border-b border-admin-border pb-2">
                        Relationships
                    </h3>
                    {payload.relationship_groups.map((g) => (
                        <div key={g.group_key}>
                            <p className="text-sm font-medium text-alloy-midnight mb-2">{g.label}</p>
                            <ul className="text-sm space-y-1 text-alloy-forge/90">
                                {g.items.map((item, i) => {
                                    const rid =
                                        item && typeof item === "object" && "id" in item && typeof (item as { id: unknown }).id === "string"
                                            ? (item as { id: string }).id
                                            : `row-${i}`;
                                    return (
                                        <li
                                            key={rid}
                                            className="rounded border border-admin-border bg-alloy-stone/15 px-3 py-2 font-mono text-xs break-all"
                                        >
                                            {formatRrsValue(item)}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
