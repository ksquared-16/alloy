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

function pillClass(active: boolean, disabled?: boolean): string {
    return [
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        active ? "border-alloy-blue bg-alloy-blue/10 text-alloy-midnight" : "border-alloy-stone/45 bg-white text-alloy-midnight/80 hover:bg-alloy-stone/15",
    ].join(" ");
}

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

    const hasFiledEmail = Boolean(primaryPersonEmail || primaryContactEmail);

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
    const [deliveryMode, setDeliveryMode] = useState<"copy_only" | "send_email">("send_email");

    const [internalNote, setInternalNote] = useState("");
    const [expiresLocal, setExpiresLocal] = useState("");
    const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

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
    const [copyAllOk, setCopyAllOk] = useState(false);

    const createdThisSessionRef = useRef(0);

    useEffect(() => {
        if (!open) return;
        setPhase("form");
        setLaunchErr(null);
        setCreatedResults([]);
        setEmailOutcome(null);
        setCopyIdx(null);
        setCopyAllOk(false);
        createdThisSessionRef.current = 0;
        setBusy(false);
        setSelectedPacketId("");
        setRecipientChoice(RECIPIENT_DEFAULT);
        setInternalNote("");
        setExpiresLocal("");
        setMoreOptionsOpen(false);
        setDeliveryMode(hasFiledEmail ? "send_email" : "copy_only");
    }, [open, hasFiledEmail]);

    useEffect(() => {
        if (!hasFiledEmail && deliveryMode === "send_email") {
            setDeliveryMode("copy_only");
        }
    }, [hasFiledEmail, deliveryMode]);

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

    const householdLinkOnly = selectedMemberIds.length === 0;

    const setHouseholdOnly = () => setSelectedMemberIds([]);

    const toggleMember = (id: string) => {
        setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const unpublishedCount = useMemo(
        () => detailItems.filter((it) => it.step_has_published_version === false).length,
        [detailItems]
    );

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
        const opts: { value: string; label: string }[] = [{ value: RECIPIENT_DEFAULT, label: "Primary (recommended)" }];
        const seen = new Set<string>(opts.map((o) => o.value));
        if (primaryPersonId) {
            opts.push({
                value: `person:${primaryPersonId}`,
                label: primaryPersonName ? `Primary: ${primaryPersonName}` : "Primary person",
            });
            seen.add(`person:${primaryPersonId}`);
        }
        for (const m of selectedMembers) {
            if (!m.person_id) continue;
            const v = `person:${m.person_id}`;
            if (seen.has(v)) continue;
            opts.push({
                value: v,
                label: `Enrollee: ${memberLabel(m)}`,
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
            return primaryPersonName || primaryContactName || "Primary on opportunity";
        }
        if (recipientChoice.startsWith("person:")) {
            const id = recipientChoice.slice("person:".length);
            const sm = selectedMembers.find((m) => m.person_id === id);
            if (sm) return memberLabel(sm);
            if (primaryPersonId === id) return primaryPersonName ?? "Primary person";
            return `Person ${id.slice(0, 8)}…`;
        }
        return "—";
    }, [recipientChoice, primaryPersonName, primaryContactName, primaryPersonId, selectedMembers]);

    const launchBlockedReason = useMemo(() => {
        if (!selectedPacketId) return "Select a packet.";
        if (detailItems.length === 0 && !detailLoading) return "This packet has no steps.";
        if (!allStepsPublishable) return "Publish every form (or pin a published version) before sending.";
        return null;
    }, [selectedPacketId, detailItems.length, detailLoading, allStepsPublishable]);

    const enrolleeSummaryLabel =
        selectedMembers.length === 0
            ? "Household"
            : selectedMembers.length === 1
              ? memberLabel(selectedMembers[0]!)
              : `${selectedMembers.length} children`;

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

            const effectiveDelivery = hasFiledEmail ? deliveryMode : "copy_only";

            const body: Record<string, unknown> = {
                packet_definition_id: selectedPacketId,
                recipient_person_id: recipientPersonIdForApi,
                customer_member_ids: [...selectedMemberIds].sort(),
                delivery: effectiveDelivery,
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
                            deliveryIntent: effectiveDelivery,
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
            setEmailOutcome(
                json.email ?? { ok: false, skipped_reason: effectiveDelivery === "copy_only" ? "copy_only" : undefined }
            );
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
                    deliveryIntent: effectiveDelivery,
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
            setCopyAllOk(false);
        } catch {
            setCopyIdx(null);
        }
    };

    const copyAllUrls = async () => {
        const lines = createdResults.map((r) => r.embed_url).filter((u): u is string => typeof u === "string" && u.length > 0);
        if (!lines.length) return;
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            setCopyAllOk(true);
            setCopyIdx(null);
        } catch {
            setCopyAllOk(false);
        }
    };

    if (!open) return null;

    const primaryCtaForm =
        deliveryMode === "send_email" && hasFiledEmail ? (busy ? "Sending…" : "Send") : busy ? "Creating…" : "Create links";

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 sm:p-6"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrollment-packet-modal-title"
            data-opportunity-enrollment-packet-launch="true"
            onClick={() => finishDismiss()}
        >
            <div
                className="flex max-h-[80vh] w-full max-w-[42rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/35 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-stone/25 px-4 py-3">
                    <div className="min-w-0">
                        <h2 id="enrollment-packet-modal-title" className="text-base font-semibold text-alloy-midnight">
                            Send enrollment packet
                        </h2>
                        <p className="mt-0.5 text-xs text-alloy-midnight/60">
                            Create packet links and optionally email them to the selected recipient.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => finishDismiss()}
                        className="shrink-0 rounded-md border border-alloy-stone/45 px-2.5 py-1 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/15"
                    >
                        Close
                    </button>
                </header>

                {phase === "form" ? (
                    <>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-alloy-midnight/70">Packet</label>
                                    {defsLoading ? <p className="mt-1 text-xs text-alloy-midnight/50">Loading…</p> : null}
                                    {defsErr ? <p className="mt-1 text-xs text-red-600">{defsErr}</p> : null}
                                    {!defsLoading && !defsErr && defs.length === 0 ? (
                                        <p className="mt-1 text-xs text-alloy-midnight/55">No packets available.</p>
                                    ) : null}
                                    {defs.length > 0 ? (
                                        <select
                                            className="mt-1 block w-full rounded-md border border-alloy-stone/45 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
                                            value={selectedPacketId}
                                            disabled={!canMutate}
                                            onChange={(e) => setSelectedPacketId(e.target.value)}
                                        >
                                            <option value="">Select packet…</option>
                                            {defs.map((d) => (
                                                <option key={d.id} value={d.id}>
                                                    {d.name?.trim() || d.key}
                                                    {d.is_active === false ? " (inactive)" : ""}
                                                </option>
                                            ))}
                                        </select>
                                    ) : null}
                                    {selectedPacketId ? (
                                        <div className="mt-1.5 text-xs text-alloy-midnight/65">
                                            {detailLoading ? "Loading steps…" : null}
                                            {detailErr ? <span className="text-red-600">{detailErr}</span> : null}
                                            {!detailLoading && !detailErr && detailItems.length > 0 ? (
                                                <>
                                                    <span>
                                                        {detailItems.length} form{detailItems.length === 1 ? "" : "s"}
                                                        {unpublishedCount > 0 ? ` · ${unpublishedCount} not published` : ""}
                                                    </span>
                                                    {!allStepsPublishable ? (
                                                        <span className="ml-1 font-medium text-amber-800">— fix before send</span>
                                                    ) : null}
                                                </>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-alloy-midnight/70">Recipient</label>
                                    <select
                                        className="mt-1 block w-full rounded-md border border-alloy-stone/45 bg-white px-2 py-1.5 text-sm text-alloy-midnight"
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
                                    <p
                                        className="mt-1 truncate text-[11px] text-alloy-midnight/50"
                                        title={[primaryPersonEmail, primaryContactEmail].filter(Boolean).join(" · ") || undefined}
                                    >
                                        {hasFiledEmail ? (
                                            <>On file: {[primaryPersonEmail, primaryContactEmail].filter(Boolean).join(" · ")}</>
                                        ) : (
                                            "No email on file"
                                        )}
                                    </p>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-alloy-midnight/70">Children / household</label>
                                    {!customerId ? (
                                        <p className="mt-1 text-xs text-amber-800">No household linked — household-level link only.</p>
                                    ) : membersLoading ? (
                                        <p className="mt-1 text-xs text-alloy-midnight/50">Loading…</p>
                                    ) : membersErr ? (
                                        <p className="mt-1 text-xs text-red-600">{membersErr}</p>
                                    ) : members.length === 0 ? (
                                        <p className="mt-1 text-xs text-alloy-midnight/55">No children on file — use household link.</p>
                                    ) : (
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                            <button
                                                type="button"
                                                disabled={!canMutate}
                                                className={pillClass(householdLinkOnly)}
                                                onClick={() => setHouseholdOnly()}
                                            >
                                                Household
                                            </button>
                                            {members.map((m) => {
                                                const on = selectedMemberIds.includes(m.id);
                                                return (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        disabled={!canMutate}
                                                        className={pillClass(on)}
                                                        onClick={() => toggleMember(m.id)}
                                                    >
                                                        {memberLabel(m)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <span className="text-xs font-medium text-alloy-midnight/70">Delivery</span>
                                    <div className="mt-2 space-y-2">
                                        {!hasFiledEmail ? (
                                            <p className="text-xs text-amber-800">Email unavailable — links will still be created.</p>
                                        ) : null}
                                        <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight">
                                            <input
                                                type="radio"
                                                name="delivery-mode"
                                                className="shrink-0"
                                                checked={deliveryMode === "send_email"}
                                                disabled={!canMutate || !hasFiledEmail}
                                                onChange={() => setDeliveryMode("send_email")}
                                            />
                                            Send email now
                                        </label>
                                        <label className="flex cursor-pointer items-center gap-2 text-sm text-alloy-midnight/85">
                                            <input
                                                type="radio"
                                                name="delivery-mode"
                                                className="shrink-0"
                                                checked={deliveryMode === "copy_only"}
                                                disabled={!canMutate}
                                                onChange={() => setDeliveryMode("copy_only")}
                                            />
                                            Copy links only
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <button
                                        type="button"
                                        className="text-xs font-medium text-alloy-blue hover:underline"
                                        onClick={() => setMoreOptionsOpen((o) => !o)}
                                        aria-expanded={moreOptionsOpen}
                                    >
                                        {moreOptionsOpen ? "Hide" : "More"} options
                                    </button>
                                    {moreOptionsOpen ? (
                                        <div className="mt-2 space-y-2 rounded-md border border-alloy-stone/25 bg-white px-2 py-2">
                                            <label className="block text-xs font-medium text-alloy-midnight/70">
                                                Internal note
                                                <textarea
                                                    className="mt-1 block w-full rounded border border-alloy-stone/40 px-2 py-1 text-sm"
                                                    rows={2}
                                                    value={internalNote}
                                                    disabled={!canMutate}
                                                    onChange={(e) => setInternalNote(e.target.value)}
                                                />
                                            </label>
                                            <label className="block text-xs font-medium text-alloy-midnight/70">
                                                Link expires
                                                <input
                                                    type="datetime-local"
                                                    className="mt-1 block w-full rounded border border-alloy-stone/40 px-2 py-1 text-sm"
                                                    value={expiresLocal}
                                                    disabled={!canMutate}
                                                    onChange={(e) => setExpiresLocal(e.target.value)}
                                                />
                                            </label>
                                        </div>
                                    ) : null}
                                </div>

                                <details className="rounded-md border border-alloy-stone/30 bg-alloy-stone/[0.04] px-2 py-1.5 text-xs">
                                    <summary className="cursor-pointer font-medium text-alloy-midnight/75">Preview</summary>
                                    <ul className="mt-2 space-y-0.5 pl-3 text-alloy-midnight/70">
                                        <li>Opp: {opportunityLabel}</li>
                                        <li>Household: {(householdName ?? customerId) || "—"}</li>
                                        <li>Links for: {enrolleeSummaryLabel}</li>
                                        <li>Recipient: {recipientPreviewLabel}</li>
                                        <li>Packet: {detailName || "—"}</li>
                                    </ul>
                                </details>

                                {launchErr ? <p className="text-xs text-red-600">{launchErr}</p> : null}
                            </div>
                        </div>

                        <footer className="flex shrink-0 flex-col gap-2 border-t border-alloy-stone/25 bg-alloy-stone/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                            {launchBlockedReason && selectedPacketId ? (
                                <p className="text-xs font-medium text-amber-800 sm:me-auto sm:max-w-[58%]">{launchBlockedReason}</p>
                            ) : null}
                            <div className="flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => finishDismiss()}
                                    className="rounded-md border border-alloy-stone/45 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/15"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={!canMutate || busy || Boolean(launchBlockedReason)}
                                    onClick={() => void launch()}
                                    className="rounded-md bg-alloy-blue px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    {primaryCtaForm}
                                </button>
                            </div>
                        </footer>
                    </>
                ) : (
                    <>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="text-sm font-semibold text-alloy-midnight">
                                        {createdResults.length} link{createdResults.length === 1 ? "" : "s"} created
                                    </p>
                                    {createdResults.some((r) => r.embed_url) ? (
                                        <button
                                            type="button"
                                            onClick={() => void copyAllUrls()}
                                            className="text-xs font-semibold text-alloy-blue hover:underline"
                                        >
                                            {copyAllOk ? "Copied all" : "Copy all links"}
                                        </button>
                                    ) : null}
                                </div>

                                {emailOutcome?.ok ? (
                                    <p className="text-xs font-medium text-emerald-800">Email queued.</p>
                                ) : emailOutcome &&
                                  !emailOutcome.ok &&
                                  emailOutcome.skipped_reason &&
                                  emailOutcome.skipped_reason !== "copy_only" ? (
                                    <p className="text-xs text-amber-800">Email unavailable — links will still be created.</p>
                                ) : null}

                                <ul className="divide-y divide-alloy-stone/20 rounded-md border border-alloy-stone/25">
                                    {createdResults.map((row, idx) => (
                                        <li key={row.public_link_id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 text-xs">
                                            <span className="min-w-0 flex-1 font-medium text-alloy-midnight">{row.enrollee_label ?? "Link"}</span>
                                            <div className="flex shrink-0 gap-1.5">
                                                {row.embed_url ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => void copyOne(row.embed_url!, idx)}
                                                            className="rounded border border-alloy-stone/40 px-2 py-0.5 text-[11px] font-medium hover:bg-alloy-stone/10"
                                                        >
                                                            {copyIdx === idx ? "Copied" : "Copy"}
                                                        </button>
                                                        <a
                                                            href={row.embed_url!}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded border border-alloy-stone/40 px-2 py-0.5 text-[11px] font-medium hover:bg-alloy-stone/10"
                                                        >
                                                            Open
                                                        </a>
                                                    </>
                                                ) : (
                                                    <span className="text-amber-800">No URL</span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <footer className="flex shrink-0 justify-end gap-2 border-t border-alloy-stone/25 bg-alloy-stone/[0.06] px-4 py-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setPhase("form");
                                    setLaunchErr(null);
                                    setCreatedResults([]);
                                    setEmailOutcome(null);
                                    setCopyAllOk(false);
                                    setDeliveryMode(hasFiledEmail ? "send_email" : "copy_only");
                                }}
                                className="rounded-md border border-alloy-stone/45 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/15"
                            >
                                Create more
                            </button>
                            <button
                                type="button"
                                onClick={() => finishDismiss()}
                                className="rounded-md bg-alloy-blue px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                            >
                                Done
                            </button>
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}
