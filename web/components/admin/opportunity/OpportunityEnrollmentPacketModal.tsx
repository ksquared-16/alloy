"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PacketDefRow = { id: string; name: string; key: string; is_active?: boolean | null };

type PacketItemRow = {
    sequence_index: number;
    form_definition_id?: string;
    form_definitions?: null | { name?: string | null } | { name?: string | null }[];
    step_has_published_version?: boolean;
};

type HouseholdMemberRow = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    relationship: string | null;
    person_id: string | null;
    _relationship_label?: string | null;
};

export type CreatedEnrollmentLinkRow = {
    public_link_id: string;
    embed_url: string | null;
    customer_member_id: string | null;
    enrollee_label: string | null;
};

export type OpportunityPacketLaunchSummary = {
    key: string;
    packetName: string;
    url: string;
    enrolleeLabel: string;
    recipientLabel: string;
    deliveryIntent: string;
    emailSent?: boolean;
    emailSkippedReason?: string | null;
};

function formNameFromItem(row: PacketItemRow): string {
    const fd = row.form_definitions;
    const f = Array.isArray(fd) ? fd[0] : fd;
    const n = f && typeof f.name === "string" ? f.name.trim() : "";
    return n || "Form";
}

function memberLabel(m: HouseholdMemberRow): string {
    const dn = typeof m.display_name === "string" ? m.display_name.trim() : "";
    if (dn) return dn;
    const fn = [m.first_name, m.last_name].filter(Boolean).join(" ").trim();
    return fn || "Member";
}

const RECIPIENT_DEFAULT = "__default__";

type Phase = "form" | "done";

export default function OpportunityEnrollmentPacketModal({
    open,
    onDismiss,
    opportunityId,
    opportunityLabel,
    opportunityRecord,
    canMutate,
    onLaunched,
}: {
    open: boolean;
    onDismiss: (detail: { createdPacketCount: number }) => void;
    opportunityId: string;
    opportunityLabel: string;
    opportunityRecord: Record<string, unknown> | null;
    canMutate: boolean;
    onLaunched?: (row: OpportunityPacketLaunchSummary) => void;
}) {
    const rec = opportunityRecord ?? {};
    const customerId = typeof rec.customer_id === "string" && rec.customer_id.trim() ? rec.customer_id.trim() : "";
    const householdName =
        typeof rec._customer_name === "string" && rec._customer_name.trim() ? rec._customer_name.trim() : null;
    const primaryPersonId = typeof rec.primary_person_id === "string" ? rec.primary_person_id.trim() : "";
    const primaryPersonName =
        typeof rec._primary_person_name === "string" && rec._primary_person_name.trim() ? rec._primary_person_name.trim() : null;
    const primaryPersonEmail =
        typeof rec._primary_person_email === "string" && rec._primary_person_email.trim() ? rec._primary_person_email.trim() : null;
    const primaryContactName =
        typeof rec._primary_contact_name === "string" && rec._primary_contact_name.trim() ? rec._primary_contact_name.trim() : null;
    const primaryContactEmail =
        typeof rec._primary_contact_email === "string" && rec._primary_contact_email.trim() ? rec._primary_contact_email.trim() : null;

    const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersErr, setMembersErr] = useState<string | null>(null);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

    const [defs, setDefs] = useState<PacketDefRow[]>([]);
    const [defsLoading, setDefsLoading] = useState(true);
    const [defsErr, setDefsErr] = useState<string | null>(null);

    const [selectedPacketId, setSelectedPacketId] = useState<string>("");
    const [detailItems, setDetailItems] = useState<PacketItemRow[]>([]);
    const [detailName, setDetailName] = useState<string>("");
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailErr, setDetailErr] = useState<string | null>(null);

    const [recipientChoice, setRecipientChoice] = useState<string>(RECIPIENT_DEFAULT);
    const [deliveryMode, setDeliveryMode] = useState<"copy_only" | "send_email">("copy_only");

    const [internalNote, setInternalNote] = useState("");
    const [expiresLocal, setExpiresLocal] = useState("");

    const [busy, setBusy] = useState(false);
    const [launchErr, setLaunchErr] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("form");
    const [createdResults, setCreatedResults] = useState<CreatedEnrollmentLinkRow[]>([]);
    const [emailOutcome, setEmailOutcome] = useState<{
        ok: boolean;
        skipped_reason?: string;
        communication_message_id?: string | null;
    } | null>(null);
    const [copyIdx, setCopyIdx] = useState<number | null>(null);

    const createdThisSessionRef = useRef(0);

    useEffect(() => {
        if (!open) return;
        setPhase("form");
        setLaunchErr(null);
        setCreatedResults([]);
        setEmailOutcome(null);
        setCopyIdx(null);
        createdThisSessionRef.current = 0;
        setBusy(false);
        setSelectedPacketId("");
        setRecipientChoice(RECIPIENT_DEFAULT);
        setDeliveryMode("copy_only");
        setInternalNote("");
        setExpiresLocal("");
    }, [open]);

    useEffect(() => {
        if (!open || !customerId) {
            if (open && !customerId) {
                setMembers([]);
                setSelectedMemberIds([]);
            }
            return;
        }
        let cancelled = false;
        (async () => {
            setMembersLoading(true);
            setMembersErr(null);
            try {
                const res = await fetch(`/api/admin/customer-members?customer_id=${encodeURIComponent(customerId)}`);
                const json = (await res.json().catch(() => ({}))) as { members?: HouseholdMemberRow[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Could not load household members");
                const rows = Array.isArray(json.members) ? json.members : [];
                if (!cancelled) {
                    setMembers(rows);
                    if (rows.length === 1) setSelectedMemberIds([rows[0]!.id]);
                    else setSelectedMemberIds([]);
                }
            } catch (e) {
                if (!cancelled) setMembersErr(e instanceof Error ? e.message : "Load failed");
            } finally {
                if (!cancelled) setMembersLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, customerId]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            setDefsLoading(true);
            setDefsErr(null);
            try {
                const res = await fetch("/api/admin/forms/packet-definitions");
                const json = (await res.json().catch(() => ({}))) as { data?: PacketDefRow[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Could not load packets");
                const rows = Array.isArray(json.data) ? json.data : [];
                if (!cancelled) setDefs(rows);
            } catch (e) {
                if (!cancelled) setDefsErr(e instanceof Error ? e.message : "Load failed");
            } finally {
                if (!cancelled) setDefsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const loadDetail = useCallback(async (packetDefId: string) => {
        if (!packetDefId) {
            setDetailItems([]);
            setDetailName("");
            return;
        }
        setDetailLoading(true);
        setDetailErr(null);
        try {
            const res = await fetch(`/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}`);
            const json = (await res.json().catch(() => ({}))) as {
                data?: { definition?: { name?: string }; items?: PacketItemRow[] };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Could not load packet detail");
            const def = json.data?.definition;
            const items = json.data?.items ?? [];
            setDetailName(typeof def?.name === "string" && def.name.trim() ? def.name.trim() : "Packet");
            setDetailItems(items);
        } catch (e) {
            setDetailErr(e instanceof Error ? e.message : "Detail failed");
            setDetailItems([]);
            setDetailName("");
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        void loadDetail(selectedPacketId);
    }, [open, selectedPacketId, loadDetail]);

    const selectedMembers = useMemo(
        () => members.filter((m) => selectedMemberIds.includes(m.id)),
        [members, selectedMemberIds]
    );

    const toggleMember = (id: string) => {
        setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const allStepsPublishable = useMemo(
        () => detailItems.length > 0 && detailItems.every((it) => it.step_has_published_version !== false),
        [detailItems]
    );

    const recipientPersonIdForApi = useMemo(() => {
        if (recipientChoice === RECIPIENT_DEFAULT) return null;
        if (recipientChoice.startsWith("person:")) return recipientChoice.slice("person:".length) || null;
        return null;
    }, [recipientChoice]);

    const recipientOptions = useMemo(() => {
        const opts: { value: string; label: string }[] = [
            { value: RECIPIENT_DEFAULT, label: "Primary on opportunity (recommended)" },
        ];
        const seen = new Set<string>(opts.map((o) => o.value));
        if (primaryPersonId) {
            opts.push({
                value: `person:${primaryPersonId}`,
                label: `Primary person — ${primaryPersonName ?? primaryPersonId.slice(0, 8) + "…"}`,
            });
            seen.add(`person:${primaryPersonId}`);
        }
        for (const m of selectedMembers) {
            if (!m.person_id) continue;
            const v = `person:${m.person_id}`;
            if (seen.has(v)) continue;
            opts.push({
                value: v,
                label: `Enrollee linked person — ${memberLabel(m)}`,
            });
            seen.add(v);
        }
        return opts;
    }, [primaryPersonId, primaryPersonName, selectedMembers]);

    useEffect(() => {
        if (!recipientOptions.some((o) => o.value === recipientChoice)) {
            setRecipientChoice(RECIPIENT_DEFAULT);
        }
    }, [recipientChoice, recipientOptions]);

    const recipientPreviewLabel = useMemo(() => {
        if (recipientChoice === RECIPIENT_DEFAULT) {
            return primaryPersonName || primaryContactName || "Opportunity primary (person or household contact)";
        }
        if (recipientChoice.startsWith("person:")) {
            const id = recipientChoice.slice("person:".length);
            const sm = selectedMembers.find((m) => m.person_id === id);
            if (sm) return `${memberLabel(sm)} (linked person)`;
            if (primaryPersonId === id) return `${primaryPersonName ?? "Primary person"} · ${primaryPersonEmail ?? "no email on file"}`;
            return `Selected person · ${id.slice(0, 8)}…`;
        }
        return "—";
    }, [recipientChoice, primaryPersonName, primaryContactName, primaryPersonEmail, primaryPersonId, selectedMembers]);

    const prefillPreviewLines = useMemo(() => {
        const lines: string[] = [];
        lines.push("Guardian / household fields from person + customer when schema uses registry ids.");
        if (selectedMembers.length === 1) {
            lines.push("Child / enrollee fields from customer_member.first_name, .last_name, .dob when those field ids exist.");
        } else if (selectedMembers.length > 1) {
            lines.push(
                "Multiple enrollees selected — one packet link per child; each link carries its own customer_member_id for trusted prefill."
            );
        } else {
            lines.push("No enrollee selected — child registry fields will not auto-prefill from a member row.");
        }
        return lines;
    }, [selectedMembers.length]);

    const launchBlockedReason = useMemo(() => {
        if (!selectedPacketId) return "Select a packet.";
        if (detailItems.length === 0 && !detailLoading) return "This packet has no steps.";
        if (!allStepsPublishable) return "Every step must have a published form version (or a published pinned version).";
        return null;
    }, [selectedPacketId, detailItems.length, detailLoading, allStepsPublishable]);

    const enrolleeSummaryLabel =
        selectedMembers.length === 0
            ? "Household-level (no member selected)"
            : selectedMembers.length === 1
              ? memberLabel(selectedMembers[0]!)
              : `${selectedMembers.length} enrollees`;

    const finishDismiss = () => {
        onDismiss({ createdPacketCount: createdThisSessionRef.current });
    };

    const launch = async () => {
        if (!selectedPacketId || !canMutate || launchBlockedReason) return;
        setBusy(true);
        setLaunchErr(null);
        setEmailOutcome(null);
        try {
            let expires_at: string | undefined;
            if (expiresLocal.trim()) {
                const ms = Date.parse(expiresLocal);
                if (!Number.isFinite(ms)) throw new Error("Expiration must be a valid date/time");
                expires_at = new Date(ms).toISOString();
            }

            const body: Record<string, unknown> = {
                packet_definition_id: selectedPacketId,
                recipient_person_id: recipientPersonIdForApi,
                customer_member_ids: [...selectedMemberIds].sort(),
                delivery: deliveryMode,
                ...(internalNote.trim() ? { internal_note: internalNote.trim() } : {}),
                ...(expires_at ? { expires_at } : {}),
            };

            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/enrollment-packet-launch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as {
                created_links?: CreatedEnrollmentLinkRow[];
                created_links_partial?: CreatedEnrollmentLinkRow[];
                email?: { ok: boolean; skipped_reason?: string; communication_message_id?: string | null };
                error?: string;
            };

            const partial = Array.isArray(json.created_links_partial) ? json.created_links_partial : [];
            const full = Array.isArray(json.created_links) ? json.created_links : [];

            if (!res.ok) {
                if (partial.length > 0) {
                    setCreatedResults(partial);
                    setEmailOutcome(json.email ?? null);
                    setPhase("done");
                    createdThisSessionRef.current = partial.length;
                    setLaunchErr(json.error ?? "Some links could not be created.");
                    for (const row of partial) {
                        const u = row.embed_url;
                        if (!u) continue;
                        onLaunched?.({
                            key: row.public_link_id,
                            packetName: detailName || "Packet",
                            url: u,
                            enrolleeLabel: row.enrollee_label ?? "—",
                            recipientLabel: recipientPreviewLabel,
                            deliveryIntent: deliveryMode,
                            emailSent: json.email?.ok,
                            emailSkippedReason: json.email?.skipped_reason,
                        });
                    }
                } else {
                    throw new Error(json.error ?? "Launch failed");
                }
                return;
            }

            setCreatedResults(full);
            setEmailOutcome(json.email ?? { ok: false, skipped_reason: deliveryMode === "copy_only" ? "copy_only" : undefined });
            setPhase("done");
            createdThisSessionRef.current = full.length;

            for (const row of full) {
                const u = row.embed_url;
                if (!u) continue;
                onLaunched?.({
                    key: row.public_link_id,
                    packetName: detailName || "Packet",
                    url: u,
                    enrolleeLabel: row.enrollee_label ?? "—",
                    recipientLabel: recipientPreviewLabel,
                    deliveryIntent: deliveryMode,
                    emailSent: json.email?.ok,
                    emailSkippedReason: json.email?.skipped_reason,
                });
            }
        } catch (e) {
            setLaunchErr(e instanceof Error ? e.message : "Launch failed");
        } finally {
            setBusy(false);
        }
    };

    const copyOne = async (url: string, idx: number) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopyIdx(idx);
        } catch {
            setCopyIdx(null);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrollment-packet-modal-title"
            data-opportunity-enrollment-packet-launch="true"
            onClick={() => finishDismiss()}
        >
            <section
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-white to-white px-4 py-4 shadow-xl ring-1 ring-alloy-stone/15"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h2 id="enrollment-packet-modal-title" className="text-base font-semibold text-alloy-midnight/95">
                            Send enrollment packet
                        </h2>
                        <p className="mt-1 text-xs leading-snug text-alloy-midnight/65">
                            Choose packet, recipients, and enrollees. CRM linkage is resolved on the server from your selections — not
                            from hidden client fields. Optional email uses Communications on this opportunity.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => finishDismiss()}
                        className="shrink-0 rounded-md border border-alloy-stone/50 px-2.5 py-1 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/20"
                    >
                        Close
                    </button>
                </div>

                {phase === "form" ? (
                    <div className="mt-4 space-y-5">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">1 · Enrollees</p>
                            {!customerId ? (
                                <p className="mt-1 text-xs text-amber-900">
                                    This opportunity has no linked household customer yet. You can still create a household-level packet
                                    link; member-based prefill will be limited.
                                </p>
                            ) : membersLoading ? (
                                <p className="mt-1 text-xs text-alloy-midnight/55">Loading household members…</p>
                            ) : membersErr ? (
                                <p className="mt-1 text-xs text-red-700">{membersErr}</p>
                            ) : members.length === 0 ? (
                                <p className="mt-1 text-xs text-alloy-midnight/65">
                                    No members on this household yet. Leave none selected for a household-level link, or add members in
                                    CRM first.
                                </p>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    <p className="text-xs text-alloy-midnight/70">
                                        Select one or more children for separate links, or none for a single household-level link.
                                    </p>
                                    <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-alloy-stone/35 bg-white/90 px-2 py-2">
                                        {members.map((m) => (
                                            <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm text-alloy-midnight/90">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={selectedMemberIds.includes(m.id)}
                                                    disabled={!canMutate}
                                                    onChange={() => toggleMember(m.id)}
                                                />
                                                <span>
                                                    {memberLabel(m)}
                                                    {m._relationship_label ? (
                                                        <span className="text-alloy-midnight/55"> · {m._relationship_label}</span>
                                                    ) : null}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedMemberIds.length > 0 ? (
                                        <button
                                            type="button"
                                            disabled={!canMutate}
                                            className="text-xs font-medium text-alloy-blue hover:underline disabled:opacity-50"
                                            onClick={() => setSelectedMemberIds([])}
                                        >
                                            Clear selection (household-level link)
                                        </button>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">2 · Packet</p>
                            {defsLoading ? <p className="mt-1 text-xs text-alloy-midnight/55">Loading packet definitions…</p> : null}
                            {defsErr ? <p className="mt-1 text-xs text-red-700">{defsErr}</p> : null}
                            {!defsLoading && !defsErr && defs.length === 0 ? (
                                <p className="mt-1 text-xs text-alloy-midnight/65">No packet definitions in this organization.</p>
                            ) : null}
                            {defs.length > 0 ? (
                                <select
                                    className="mt-1 block w-full max-w-lg rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                                    value={selectedPacketId}
                                    disabled={!canMutate}
                                    onChange={(e) => setSelectedPacketId(e.target.value)}
                                >
                                    <option value="">Choose a packet…</option>
                                    {defs.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name?.trim() || d.key}
                                            {d.is_active === false ? " (inactive)" : ""}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            {selectedPacketId ? (
                                <>
                                    {detailLoading ? <p className="mt-2 text-xs text-alloy-midnight/55">Loading steps…</p> : null}
                                    {detailErr ? <p className="mt-2 text-xs text-red-700">{detailErr}</p> : null}
                                    {!detailLoading && !detailErr && detailItems.length > 0 ? (
                                        <div className="mt-2 rounded-md border border-alloy-stone/35 bg-white/90 px-2.5 py-2">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                                Forms in this packet
                                            </p>
                                            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-alloy-midnight/85">
                                                {detailItems.map((it) => (
                                                    <li key={`${it.sequence_index}-${formNameFromItem(it)}`}>
                                                        {formNameFromItem(it)}
                                                        {it.step_has_published_version === false ? (
                                                            <span className="ml-2 text-amber-800"> — not published</span>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ol>
                                            {!allStepsPublishable ? (
                                                <p className="mt-2 text-xs font-medium text-amber-900">
                                                    Publish every form (or pin a published version) before launching.
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">3 · Recipient</p>
                            <select
                                className="mt-1 block w-full max-w-lg rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                                value={recipientChoice}
                                disabled={!canMutate}
                                onChange={(e) => setRecipientChoice(e.target.value)}
                            >
                                {recipientOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-[11px] text-alloy-midnight/55">
                                {primaryPersonEmail || primaryContactEmail ? (
                                    <>
                                        On file: {[primaryPersonEmail, primaryContactEmail].filter(Boolean).join(" · ") || "—"}
                                    </>
                                ) : (
                                    "No guardian email on file — you can still copy links."
                                )}
                            </p>
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">4 · Prefill preview</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-alloy-midnight/80">
                                <li>
                                    <span className="font-medium">Opportunity:</span> {opportunityLabel}
                                </li>
                                <li>
                                    <span className="font-medium">Household:</span> {(householdName ?? customerId) || "—"}
                                </li>
                                <li>
                                    <span className="font-medium">Enrollee(s):</span> {enrolleeSummaryLabel}
                                </li>
                                <li>
                                    <span className="font-medium">Recipient:</span> {recipientPreviewLabel}
                                </li>
                                <li>
                                    <span className="font-medium">Packet:</span> {detailName || "—"}
                                </li>
                                {prefillPreviewLines.map((line, i) => (
                                    <li key={i}>{line}</li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">5 · Delivery</p>
                            <div className="mt-1 flex flex-col gap-2 text-xs text-alloy-midnight/80">
                                <label className="inline-flex items-center gap-1.5">
                                    <input
                                        type="radio"
                                        name="delivery-mode"
                                        checked={deliveryMode === "copy_only"}
                                        disabled={!canMutate}
                                        onChange={() => setDeliveryMode("copy_only")}
                                    />
                                    Copy links only (create links; open or copy yourself)
                                </label>
                                <label className="inline-flex items-center gap-1.5">
                                    <input
                                        type="radio"
                                        name="delivery-mode"
                                        checked={deliveryMode === "send_email"}
                                        disabled={!canMutate}
                                        onChange={() => setDeliveryMode("send_email")}
                                    />
                                    Send email now (Communications — opportunity-anchored)
                                </label>
                                {deliveryMode === "send_email" ? (
                                    <p className="rounded-md border border-amber-200/80 bg-amber-50/80 px-2 py-1.5 text-[11px] text-amber-950/90">
                                        Links are always created first. If outbound email is not available for this org or the
                                        recipient is ineligible, the message is skipped and you can still copy each link below.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-md border border-alloy-stone/30 bg-alloy-stone/5 px-2.5 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Options</p>
                            <label className="mt-2 block text-xs font-medium text-alloy-midnight/75">
                                Internal note (optional)
                                <textarea
                                    className="mt-1 block w-full max-w-lg rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                                    rows={2}
                                    value={internalNote}
                                    disabled={!canMutate}
                                    onChange={(e) => setInternalNote(e.target.value)}
                                />
                            </label>
                            <label className="mt-2 block text-xs font-medium text-alloy-midnight/75">
                                Link expiration (optional)
                                <input
                                    type="datetime-local"
                                    className="mt-1 block w-full max-w-lg rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                                    value={expiresLocal}
                                    disabled={!canMutate}
                                    onChange={(e) => setExpiresLocal(e.target.value)}
                                />
                            </label>
                        </div>

                        {launchBlockedReason && selectedPacketId ? (
                            <p className="text-xs font-medium text-amber-900">{launchBlockedReason}</p>
                        ) : null}
                        {launchErr ? <p className="text-xs text-red-700">{launchErr}</p> : null}

                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                disabled={!canMutate || busy || Boolean(launchBlockedReason)}
                                onClick={() => void launch()}
                                className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {busy ? "Working…" : "Create links"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        <p className="text-sm font-medium text-alloy-midnight/90">
                            {createdResults.length > 0 ? "Packet link(s) ready" : "No links created"}
                        </p>
                        {emailOutcome && deliveryMode === "send_email" && !emailOutcome.ok ? (
                            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
                                <span className="font-semibold">Email not sent:</span>{" "}
                                {emailOutcome.skipped_reason ?? "Communications unavailable or misconfigured for this org."} Copy or open
                                each link below.
                            </p>
                        ) : null}
                        {emailOutcome?.ok ? (
                            <p className="rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-2 text-xs text-emerald-950">
                                Email queued via Communications
                                {emailOutcome.communication_message_id ? ` (message ${emailOutcome.communication_message_id.slice(0, 8)}…)` : ""}.
                            </p>
                        ) : null}

                        <ul className="space-y-3">
                            {createdResults.map((row, idx) => (
                                <li
                                    key={row.public_link_id}
                                    className="rounded-lg border border-alloy-stone/30 bg-white/90 px-3 py-2.5 text-xs text-alloy-midnight/85"
                                >
                                    <div className="font-medium text-alloy-midnight/90">{row.enrollee_label ?? "Link"}</div>
                                    {row.embed_url ? (
                                        <>
                                            <p className="mt-1 break-all font-mono text-[11px] text-alloy-midnight/65">{row.embed_url}</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void copyOne(row.embed_url!, idx)}
                                                    className="rounded-md border border-alloy-stone/55 px-2.5 py-1 text-xs font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                                                >
                                                    {copyIdx === idx ? "Copied" : "Copy link"}
                                                </button>
                                                <a
                                                    href={row.embed_url!}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center rounded-md border border-alloy-stone/55 px-2.5 py-1 text-xs font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                                                >
                                                    Open link
                                                </a>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="mt-1 text-amber-800">URL unavailable — check server logs.</p>
                                    )}
                                </li>
                            ))}
                        </ul>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => finishDismiss()}
                                className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                            >
                                Done
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPhase("form");
                                    setLaunchErr(null);
                                    setCreatedResults([]);
                                    setEmailOutcome(null);
                                }}
                                className="rounded-md border border-alloy-stone/55 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                            >
                                Create more
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
