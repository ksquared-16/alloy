"use client";

/**
 * What paperwork this stage asks a family for — said the way a director thinks about it.
 *
 * The requirement rows underneath are canonical and stay canonical. They are also the wrong primary
 * surface: a director decides "this family completes our enrollment packet", not "author five
 * `kind: form` requirements at `scope: record`, `timing: stage_exit`". This card is that sentence,
 * and it compiles the answer into the same canonical action the advanced editor uses.
 *
 * ## The stage now requires the PACKET, and why that reversed
 *
 * This card used to compile a chosen packet into one `kind: form` requirement per step, deliberately
 * storing no packet id. The reason was real: a stage holding a packet id is a live link, so a later
 * Studio edit can change what a published revision asks a family for.
 *
 * Live QA rejected the consequence. A director reading the Enrolling stage saw three separately
 * managed Forms and asked, correctly, why the process knows about paperwork composition at all — the
 * packet IS the requirement. Compiling also meant adding a step to the family's paperwork required
 * editing the lifecycle.
 *
 * So the ownership split is now explicit: the stage owns whether enrolment paperwork is required and
 * how strictly; the packet owns what completing it consists of. The original risk is answered rather
 * than ignored — Configuration Health traverses the packet's steps instead of trusting that it
 * exists, and an in-flight family keeps the Form versions their session pinned, so a Studio edit
 * cannot rewrite paperwork someone is part-way through. The remaining piece, pinning an explicit
 * published packet VERSION on the requirement, is built and waiting on a blocked migration.
 *
 * Individual Form requirements remain a supported platform primitive; Enrollment V0.5 simply chooses
 * the packet.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { requirementIdForForm } from "@/lib/lifecycle/compilePacketToStageRequirements";

type FormOption = { id: string; name: string; has_published_version?: boolean };
type PacketOption = { id: string; name: string; is_active?: boolean };

export default function StagePaperworkCard({
    departmentId,
    stageKey,
    stageRecord,
    process,
    onSaved,
    onManagePacket,
}: {
    departmentId: string;
    stageKey: string;
    stageRecord?: LifecycleBuilderStageRecord | null;
    process?: LifecycleBuilderProcessRecord | null;
    onSaved?: () => void | Promise<void>;
    /**
     * Open the packet's own configuration, focused.
     *
     * The host owns the pop-out because this card renders inside the stage editor and must not
     * decide how a focused surface is presented. Editing there changes the PACKET; the stage keeps
     * requiring the same packet, which is the whole point of the split.
     */
    onManagePacket?: (packetDefinitionId: string, packetName: string | null) => void;
}) {
    const [choosing, setChoosing] = useState(false);
    const [forms, setForms] = useState<FormOption[]>([]);
    const [packets, setPackets] = useState<PacketOption[]>([]);
    /** Step counts for the compact row — the packet's own composition, read from the packet. */
    const [packetSteps, setPacketSteps] = useState<number | null>(null);
    /** The packet's own name, read from the packet rather than guessed from a list. */
    const [packetFetchedName, setPacketFetchedName] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const packetRequirement = useMemo(
        () =>
            (stageRecord?.requirements_v1?.requirements ?? []).find(
                (r): r is typeof r & { ref: { kind: "packet"; packet_definition_id: string } } => r.ref.kind === "packet",
            ) ?? null,
        [stageRecord],
    );
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

    /*
     * The step count comes from the PACKET, not from the stage. The stage deliberately stores only
     * "this packet is required" — asking it how many steps there are would be asking the wrong owner.
     */
    useEffect(() => {
        const id = packetRequirement?.ref.packet_definition_id;
        if (!id) {
            setPacketSteps(null);
            setPacketFetchedName(null);
            return;
        }
        let live = true;
        fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(id)}`, { credentials: "include" })
            .then((r) => r.json().catch(() => ({})))
            .then((j) => {
                if (!live) return;
                const d = (j as { data?: { definition?: { name?: string }; items?: unknown[] } }).data;
                setPacketSteps(Array.isArray(d?.items) ? d!.items!.length : null);
                setPacketFetchedName(d?.definition?.name ?? null);
            })
            .catch(() => { if (live) setPacketSteps(null); });
        return () => { live = false; };
    }, [packetRequirement]);

    const packetName = useMemo(
        () =>
            packetFetchedName ??
            packets.find((p) => p.id === packetRequirement?.ref.packet_definition_id)?.name ??
            null,
        [packetFetchedName, packets, packetRequirement],
    );

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

    /** The stage requires the packet itself. Its steps stay the packet's business. */
    const choosePacket = useCallback(
        async (packetId: string, packetName: string) => {
            setBusy(true); setError(null);
            try {
                // Read it only to refuse an empty packet — a requirement a family cannot complete is
                // worse than no requirement, and the count is what the row reports.
                const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetId)}`, { credentials: "include" });
                const json = (await res.json().catch(() => ({}))) as { data?: { items?: { sequence_index: number; form_definition_id: string }[] }; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Could not read that packet.");
                const steps = json.data?.items ?? [];
                if (!steps.length) throw new Error(`“${packetName}” has no steps to require.`);
                await save(
                    [
                        {
                            requirement_id: "enrollment_packet",
                            kind: "packet",
                            packet_definition_id: packetId,
                            level: "required",
                            scope: "record",
                            timing: "stage_exit",
                            enforcement: "blocking",
                        },
                    ],
                    `This stage now requires “${packetName}” — ${steps.length} step${steps.length === 1 ? "" : "s"}. Publish to make it live.`,
                );
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
                        {packetRequirement
                            ? (packetName ?? "Enrollment packet")
                            : required.length
                              ? `${required.length} form${required.length === 1 ? "" : "s"} required`
                              : authored
                                ? "No paperwork required — an authored decision"
                                : "No paperwork chosen yet"}
                    </p>
                    {packetRequirement ? (
                        /*
                         * One line, the way a director reads it: what is required, how much of it,
                         * and how strictly. The steps themselves belong to the packet and are opened
                         * with Manage — rendering them here would put paperwork composition back on
                         * the process page, which is the thing this replaced.
                         */
                        <p className="mt-0.5 text-[0.6875rem] text-alloy-midnight/45" data-testid="stage-paperwork-packet-meta">
                            {packetSteps === null ? "Steps loading…" : `${packetSteps} step${packetSteps === 1 ? "" : "s"}`}
                            {` · ${packetRequirement.level === "required" ? "Required" : packetRequirement.level}`}
                            {` · ${packetRequirement.enforcement === "blocking" ? "Blocking" : (packetRequirement.enforcement ?? "blocking")}`}
                        </p>
                    ) : null}
                    {required.length ? (
                        // Same rule as the advanced rows: state what is configured, never imply an
                        // enforcement the platform does not perform yet.
                        <p className="mt-0.5 text-[0.6875rem] text-alloy-midnight/45" data-testid="stage-paperwork-enforcement-note">
                            Configured blocking; transition enforcement pending Form-requirement preflight adoption.
                        </p>
                    ) : null}
                    {summary ? (
                        <p className="mt-0.5 truncate text-[0.6875rem] text-alloy-midnight/45">
                            {summary}
                            {required.length > 2 ? ` · +${required.length - 2} more` : ""}
                        </p>
                    ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {packetRequirement ? (
                        <button
                            type="button"
                            data-testid="stage-paperwork-manage"
                            className="config-secondary-btn config-secondary-btn--sm"
                            disabled={busy}
                            onClick={() => onManagePacket?.(packetRequirement.ref.packet_definition_id, packetName)}
                        >
                            Manage
                        </button>
                    ) : null}
                    <button
                        type="button"
                        data-testid="stage-paperwork-change"
                        className="config-secondary-btn config-secondary-btn--sm"
                        disabled={busy}
                        onClick={() => setChoosing((v) => !v)}
                    >
                        {choosing ? "Cancel" : packetRequirement || required.length ? "Change paperwork" : "Choose paperwork"}
                    </button>
                </div>
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
                        {/*
                          * This said the opposite of what the code does, and of the ownership rule.
                          *
                          * Choosing a packet stores ONE requirement that references it — it does not
                          * copy the packet's forms in. So editing the packet later DOES change what a
                          * family completes, which is the entire point of requiring a packet rather
                          * than a list of forms, and the previous sentence promised the reverse on the
                          * one screen where an administrator decides this.
                          */}
                        <p className="mt-1 text-[0.6875rem] text-alloy-midnight/45">
                            The stage requires the packet itself, not a copy of its steps. Changing the packet later
                            changes what a family completes here; the packet owns its steps, this stage owns when they
                            are required.
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
