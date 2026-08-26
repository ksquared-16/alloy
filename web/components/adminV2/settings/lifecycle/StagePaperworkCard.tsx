"use client";

/**
 * What paperwork this stage asks a family for — said the way a director thinks about it.
 *
 * The requirement rows underneath are canonical and stay canonical. They are also the wrong primary
 * surface: a director decides "this family completes our enrollment packet", not "author five
 * `kind: form` requirements at `scope: record`, `timing: stage_exit`". This card is that sentence,
 * and it compiles the answer into the same canonical action the advanced editor uses.
 *
 * ## Why the packet's NAME is not shown after choosing it
 *
 * Because BP does not store it, on purpose. Storing a packet id on the stage would be the live link
 * the doctrine forbids — a later Studio edit could then reach into a published revision, or the label
 * would quietly go stale and lie about what a family is actually asked for. So the packet is how the
 * selection is MADE, and the forms are what the stage then owns and displays. The trade-off is real
 * and is the point: what you see is what will be required.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { compilePacketToStageRequirements, requirementIdForForm } from "@/lib/lifecycle/compilePacketToStageRequirements";

type FormOption = { id: string; name: string; has_published_version?: boolean };
type PacketOption = { id: string; name: string; is_active?: boolean };

export default function StagePaperworkCard({
    departmentId,
    stageKey,
    stageRecord,
    process,
    onSaved,
}: {
    departmentId: string;
    stageKey: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    process?: LifecycleBuilderProcessRecord | null;
    onSaved?: () => void | Promise<void>;
}) {
    const [choosing, setChoosing] = useState(false);
    const [forms, setForms] = useState<FormOption[]>([]);
    const [packets, setPackets] = useState<PacketOption[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const required = useMemo(
        () => (stageRecord?.requirements_v1?.requirements ?? []).filter((r) => r.ref.kind === "form"),
        [stageRecord],
    );
    const authored = stageRecord?.requirements_v1 !== undefined;

    useEffect(() => {
        if (!choosing) return;
        let live = true;
        void Promise.all([
            fetch("/api/admin/forms", { credentials: "include" }).then((r) => r.json().catch(() => ({}))),
            fetch("/api/admin/forms/packet-definitions", { credentials: "include" }).then((r) => r.json().catch(() => ({}))),
        ]).then(([fj, pj]) => {
            if (!live) return;
            setForms(((fj as { data?: FormOption[] }).data ?? []).filter((f) => f.has_published_version));
            setPackets(((pj as { data?: PacketOption[] }).data ?? []).filter((p) => p.is_active !== false));
        }).catch(() => { if (live) { setForms([]); setPackets([]); } });
        return () => { live = false; };
    }, [choosing]);

    const nameOf = useCallback((id: string) => forms.find((f) => f.id === id)?.name ?? null, [forms]);

    const save = useCallback(
        async (requirements: unknown[], done: string) => {
            setBusy(true); setError(null); setNotice(null);
            try {
                const res = await fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "set_stage_requirements", process_id: process?.id, stage_key: stageKey, requirements }),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
                if (!res.ok) throw new Error([json.error, json.reason].filter(Boolean).join(" ") || "The change was refused.");
                setNotice(done);
                setChoosing(false);
                await onSaved?.();
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(false);
            }
        },
        [departmentId, process?.id, stageKey, onSaved],
    );

    /** One-time compile. Nothing is stored that points back at the packet. */
    const choosePacket = useCallback(
        async (packetId: string, packetName: string) => {
            setBusy(true); setError(null);
            try {
                const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetId)}`, { credentials: "include" });
                const json = (await res.json().catch(() => ({}))) as { data?: { items?: { sequence_index: number; form_definition_id: string }[] }; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Could not read that packet.");
                const compiled = compilePacketToStageRequirements(json.data?.items ?? []);
                if (!compiled.length) throw new Error(`“${packetName}” has no forms to require.`);
                await save(compiled, `Set from “${packetName}” — ${compiled.length} form${compiled.length === 1 ? "" : "s"} required. Publish to make it live.`);
            } catch (e) {
                setError((e as Error).message);
                setBusy(false);
            }
        },
        [save],
    );

    const addForm = useCallback(
        (formId: string, formName: string) => {
            const existing = required.map((r) => ({
                requirement_id: r.requirement_id,
                kind: "form" as const,
                form_definition_id: (r.ref as { form_definition_id: string }).form_definition_id,
                level: r.level, scope: "record" as const, timing: "stage_exit" as const,
                enforcement: r.enforcement ?? "blocking",
            }));
            if (existing.some((r) => r.form_definition_id === formId)) {
                setError(`“${formName}” is already required here.`);
                return;
            }
            void save(
                [...existing, { requirement_id: requirementIdForForm(formId), kind: "form", form_definition_id: formId, level: "required", scope: "record", timing: "stage_exit", enforcement: "blocking" }],
                `Added “${formName}”. Publish to make it live.`,
            );
        },
        [required, save],
    );

    if (!process?.id) return null;

    const summary = required.length
        ? required
              .map((r) => nameOf((r.ref as { form_definition_id: string }).form_definition_id))
              .filter(Boolean)
              .slice(0, 2)
              .join(" · ")
        : null;

    return (
        <section className="config-mode-card p-4" data-testid="stage-paperwork-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <FileCheck2 size={13} className="text-alloy-bend-pine" />
                        <h4 className="text-[0.8125rem] font-semibold text-alloy-midnight">Enrollment paperwork</h4>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-alloy-midnight/70" data-testid="stage-paperwork-summary">
                        {required.length
                            ? `${required.length} form${required.length === 1 ? "" : "s"} required`
                            : authored
                              ? "No paperwork required — an authored decision"
                              : "No paperwork chosen yet"}
                    </p>
                    {summary ? (
                        <p className="mt-0.5 truncate text-[0.6875rem] text-alloy-midnight/45">
                            {summary}
                            {required.length > 2 ? ` · +${required.length - 2} more` : ""}
                        </p>
                    ) : null}
                </div>
                <button
                    type="button"
                    data-testid="stage-paperwork-change"
                    className="config-secondary-btn config-secondary-btn--sm shrink-0"
                    disabled={busy}
                    onClick={() => setChoosing((v) => !v)}
                >
                    {choosing ? "Cancel" : required.length ? "Change paperwork" : "Choose paperwork"}
                </button>
            </div>

            {choosing ? (
                <div className="mt-3 space-y-3 border-t border-alloy-forge/10 pt-3">
                    <div>
                        <label className="mb-1 block text-[0.6875rem] font-semibold text-alloy-midnight/60">
                            Use a packet
                        </label>
                        <select
                            data-testid="stage-paperwork-packet"
                            className="w-full rounded-lg border border-alloy-forge/20 bg-white px-2 py-1.5 text-[0.75rem]"
                            value=""
                            disabled={busy}
                            onChange={(e) => {
                                const opt = packets.find((p) => p.id === e.target.value);
                                if (opt) void choosePacket(opt.id, opt.name);
                            }}
                        >
                            <option value="">{packets.length ? "Choose a packet…" : "No packets available"}</option>
                            {packets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <p className="mt-1 text-[0.6875rem] text-alloy-midnight/45">
                            Its forms are copied here as this stage&rsquo;s requirements, in packet order. Editing the packet
                            later does not change what this stage requires.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-[0.6875rem] font-semibold text-alloy-midnight/60">
                            Or add a single form
                        </label>
                        <select
                            data-testid="stage-paperwork-form"
                            className="w-full rounded-lg border border-alloy-forge/20 bg-white px-2 py-1.5 text-[0.75rem]"
                            value=""
                            disabled={busy}
                            onChange={(e) => {
                                const opt = forms.find((f) => f.id === e.target.value);
                                if (opt) addForm(opt.id, opt.name);
                            }}
                        >
                            <option value="">{forms.length ? "Add a published form…" : "No published forms"}</option>
                            {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                    {busy ? (
                        <p className="flex items-center gap-1.5 text-[0.75rem] text-alloy-midnight/55">
                            <Loader2 size={12} className="animate-spin" /> Saving…
                        </p>
                    ) : null}
                </div>
            ) : null}

            {error ? <p className="mt-2 text-[0.75rem] text-alloy-ember" role="alert">{error}</p> : null}
            {notice ? <p className="mt-2 text-[0.75rem] text-alloy-bend-pine" role="status">{notice}</p> : null}
        </section>
    );
}
