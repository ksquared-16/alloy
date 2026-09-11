"use client";

/**
 * The packet a stage requires, opened focused.
 *
 * The stage row stays one line — *Enrollment Packet · 3 steps · Required · Blocking* — because
 * paperwork composition is not the process's business. This is where that composition is read.
 *
 * It shows the packet as the packet owns it: name, ordered steps, and whether each step can actually
 * be completed. It does not edit the requirement, and nothing here writes to the Business Process —
 * changing the packet changes the packet, and the stage goes on requiring the same one. That
 * separation is the whole point of the row above it.
 *
 * Full composition (adding, reordering, removing steps) stays in Packet Studio, which owns it; this
 * offers the way there rather than cloning an editor.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type PacketStep = {
    sequence_index: number;
    form_definition_id: string;
    form_name?: string | null;
    has_published_version?: boolean;
};

export default function StagePacketManageModal({
    open,
    packetDefinitionId,
    packetName,
    onClose,
}: {
    open: boolean;
    packetDefinitionId: string | null;
    packetName: string | null;
    onClose: () => void;
}) {
    const [steps, setSteps] = useState<PacketStep[] | null>(null);
    const [name, setName] = useState<string | null>(packetName);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !packetDefinitionId) return;
        let live = true;
        setSteps(null);
        setError(null);
        void (async () => {
            try {
                const [pRes, fRes] = await Promise.all([
                    fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefinitionId)}`, { credentials: "include" }),
                    fetch("/api/admin/forms", { credentials: "include" }),
                ]);
                const pj = (await pRes.json().catch(() => ({}))) as {
                    // The detail route nests the definition under `packet`; items sit beside it.
                    data?: { definition?: { name?: string }; items?: { sequence_index: number; form_definition_id: string }[] };
                    error?: string;
                };
                if (!pRes.ok) throw new Error(pj.error ?? "Could not read that packet.");
                const fj = (await fRes.json().catch(() => ({}))) as {
                    data?: { id: string; name: string; has_published_version?: boolean }[];
                };
                const forms = new Map((fj.data ?? []).map((f) => [f.id, f]));
                if (!live) return;
                setName(pj.data?.definition?.name ?? packetName);
                setSteps(
                    [...(pj.data?.items ?? [])]
                        .sort((a, b) => a.sequence_index - b.sequence_index)
                        .map((i) => ({
                            sequence_index: i.sequence_index,
                            form_definition_id: i.form_definition_id,
                            form_name: forms.get(i.form_definition_id)?.name ?? null,
                            has_published_version: forms.get(i.form_definition_id)?.has_published_version,
                        })),
                );
            } catch (e) {
                if (live) setError((e as Error).message);
            }
        })();
        return () => {
            live = false;
        };
    }, [open, packetDefinitionId, packetName]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Manage enrollment packet"
            data-testid="stage-packet-manage-modal"
        >
            <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-[0.9375rem] font-semibold text-alloy-midnight">{name ?? "Enrollment packet"}</h3>
                        <p className="mt-0.5 text-[0.75rem] text-alloy-midnight/60">
                            What a family completes. This stage requires this packet; editing it here changes the packet,
                            not the process.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="config-secondary-btn config-secondary-btn--sm shrink-0"
                        data-testid="stage-packet-manage-close"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

                <div className="mt-4">
                    <div className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                        Steps, in order
                    </div>
                    {error ? (
                        <p className="text-[0.8125rem] text-alloy-ember" role="alert">{error}</p>
                    ) : steps === null ? (
                        <p className="flex items-center gap-1.5 text-[0.8125rem] text-alloy-midnight/55">
                            <Loader2 size={12} className="animate-spin" /> Loading…
                        </p>
                    ) : steps.length === 0 ? (
                        <p className="text-[0.8125rem] text-alloy-midnight/55">This packet has no steps yet.</p>
                    ) : (
                        <ol className="space-y-1.5" data-testid="stage-packet-manage-steps">
                            {steps.map((s) => (
                                <li
                                    key={s.form_definition_id + s.sequence_index}
                                    className="flex items-center gap-2 rounded-lg border border-alloy-forge/15 px-2.5 py-1.5"
                                >
                                    <span className="w-5 shrink-0 text-[0.6875rem] font-semibold text-alloy-midnight/45">
                                        {s.sequence_index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-alloy-midnight">
                                        {s.form_name ?? "Untitled form"}
                                    </span>
                                    {/* Publication is the packet's readiness question, so it is answered here. */}
                                    <span
                                        className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${
                                            s.has_published_version
                                                ? "bg-alloy-juniper/15 text-alloy-bend-pine"
                                                : "bg-alloy-ember/10 text-alloy-ember"
                                        }`}
                                    >
                                        {s.has_published_version ? "Published" : "Not published"}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                <p className="mt-4 border-t border-alloy-forge/10 pt-3 text-[0.6875rem] text-alloy-midnight/45">
                    Add, reorder or remove steps in Packet Studio — Processing › Studio › Packets. A family already part
                    way through keeps the form versions their session started on.
                </p>
            </div>
        </div>
    );
}
