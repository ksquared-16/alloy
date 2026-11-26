"use client";

/**
 * FAMILIES WHO CANNOT PAY FROM THEIR PAPERWORK — found, then resolved one link at a time.
 *
 * Reads `GET /api/admin/enrollment/links/needing-payer`. Renders nothing when there are none, or when the
 * viewer lacks Enrollment decision authority (403): this is a list of decisions, and showing it to someone
 * who cannot make them would be a list of dead ends. Each row opens LinkPayerPicker — the same control the
 * child's "Send enrollment paperwork" review shows — so there is one remediation path, not two.
 */
import { useEffect, useState } from "react";

import LinkPayerPicker from "@/components/admin/enrollment/LinkPayerPicker";

type Row = {
    linkId: string;
    sentAt: string | null;
    childName: string | null;
    householdName: string | null;
    candidateCount: number;
};

export default function PayerlessLinksPanel() {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [resolved, setResolved] = useState<Set<string>>(new Set());

    useEffect(() => {
        let live = true;
        void fetch("/api/admin/enrollment/links/needing-payer", { credentials: "include" })
            .then(async (r) => (r.ok ? ((await r.json()) as { data?: { links?: Row[] } }).data?.links ?? [] : []))
            .catch(() => [] as Row[])
            .then((links) => live && setRows(links));
        return () => {
            live = false;
        };
    }, []);

    if (!rows || rows.length === 0) return null;
    const remaining = rows.filter((r) => !resolved.has(r.linkId)).length;
    return (
        <section
            className="mb-4 rounded-xl border border-alloy-ember/30 bg-white p-4"
            data-payerless-links="panel"
        >
            <h3 className="text-[0.875rem] font-semibold text-alloy-midnight">
                {remaining === 0
                    ? "Every family can pay from their paperwork"
                    : `${remaining} ${remaining === 1 ? "family" : "families"} can't pay from their enrollment paperwork`}
            </h3>
            <p className="mt-1 text-[0.75rem] text-alloy-midnight/65">
                These paperwork links were sent before a payer was recorded. Choose who pays; the family keeps the
                same link and everything they have already completed.
            </p>
            <ul className="mt-3 space-y-2">
                {rows.map((r) => (
                    <li key={r.linkId} className="rounded-lg border border-alloy-midnight/10 px-3 py-2" data-payerless-links="row">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-[0.8125rem] text-alloy-midnight">
                                <span className="font-medium">{r.childName ?? "Unnamed child"}</span>
                                {r.householdName ? <span className="text-alloy-midnight/60"> · {r.householdName}</span> : null}
                                <span className="block text-[0.6875rem] text-alloy-midnight/55">
                                    {r.sentAt ? `Sent ${new Date(r.sentAt).toLocaleDateString()}` : "Sent date unknown"}
                                    {" · "}
                                    {r.candidateCount === 0
                                        ? "No primary contact on the household yet"
                                        : r.candidateCount === 1
                                          ? "1 primary contact"
                                          : `${r.candidateCount} primary contacts to choose between`}
                                </span>
                            </div>
                            {resolved.has(r.linkId) ? (
                                <span className="text-[0.75rem] text-alloy-bend-pine">Payer recorded</span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setOpen(open === r.linkId ? null : r.linkId)}
                                    className="text-[0.75rem] font-medium text-alloy-midnight underline"
                                    data-payerless-links="choose"
                                >
                                    {open === r.linkId ? "Close" : "Choose payer"}
                                </button>
                            )}
                        </div>
                        {open === r.linkId && !resolved.has(r.linkId) ? (
                            <div className="mt-2">
                                <LinkPayerPicker
                                    linkId={r.linkId}
                                    onBound={() => setResolved((s) => new Set(s).add(r.linkId))}
                                />
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}
