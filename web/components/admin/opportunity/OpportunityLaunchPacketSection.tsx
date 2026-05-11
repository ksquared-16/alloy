"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

export type OpportunityPacketLaunchSummary = {
    key: string;
    packetName: string;
    url: string;
    enrolleeLabel: string;
    recipientLabel: string;
    deliveryIntent: string;
};

const NONE_MEMBER = "__none__";
const RECIPIENT_DEFAULT = "__default__";

export default function OpportunityLaunchPacketSection({
    opportunityId,
    opportunityLabel,
    opportunityRecord,
    canMutate,
    onClose,
    onLaunched,
}: {
    opportunityId: string;
    opportunityLabel: string;
    opportunityRecord: Record<string, unknown> | null;
    canMutate: boolean;
    onClose: () => void;
    onLaunched?: (row: OpportunityPacketLaunchSummary) => void;
}) {
    const rec = opportunityRecord ?? {};
    const customerId = typeof rec.customer_id === "string" && rec.customer_id.trim() ? rec.customer_id.trim() : "";
    const householdName =
        typeof rec._customer_name === "string" && rec._customer_name.trim() ?
            rec._customer_name.trim()
        :   null;
    const primaryPersonId = typeof rec.primary_person_id === "string" ? rec.primary_person_id.trim() : "";
    const primaryPersonName =
        typeof rec._primary_person_name === "string" && rec._primary_person_name.trim() ?
            rec._primary_person_name.trim()
        :   null;
    const primaryPersonEmail =
        typeof rec._primary_person_email === "string" && rec._primary_person_email.trim() ?
            rec._primary_person_email.trim()
        :   null;
    const primaryContactName =
        typeof rec._primary_contact_name === "string" && rec._primary_contact_name.trim() ?
            rec._primary_contact_name.trim()
        :   null;
    const primaryContactEmail =
        typeof rec._primary_contact_email === "string" && rec._primary_contact_email.trim() ?
            rec._primary_contact_email.trim()
        :   null;

    const [members, setMembers] = useState<HouseholdMemberRow[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersErr, setMembersErr] = useState<string | null>(null);
    const [memberChoice, setMemberChoice] = useState<string>(NONE_MEMBER);

    const [defs, setDefs] = useState<PacketDefRow[]>([]);
    const [defsLoading, setDefsLoading] = useState(true);
    const [defsErr, setDefsErr] = useState<string | null>(null);

    const [selectedPacketId, setSelectedPacketId] = useState<string>("");
    const [detailItems, setDetailItems] = useState<PacketItemRow[]>([]);
    const [detailName, setDetailName] = useState<string>("");
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailErr, setDetailErr] = useState<string | null>(null);

    const [recipientChoice, setRecipientChoice] = useState<string>(RECIPIENT_DEFAULT);
    const [deliveryIntent, setDeliveryIntent] = useState<"copy_link" | "email_later">("copy_link");

    const [internalNote, setInternalNote] = useState("");
    const [expiresLocal, setExpiresLocal] = useState("");

    const [busy, setBusy] = useState(false);
    const [launchErr, setLaunchErr] = useState<string | null>(null);
    const [createdUrl, setCreatedUrl] = useState<string | null>(null);
    const [copyOk, setCopyOk] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!customerId) {
                setMembers([]);
                setMemberChoice(NONE_MEMBER);
                return;
            }
            setMembersLoading(true);
            setMembersErr(null);
            try {
                const res = await fetch(`/api/admin/customer-members?customer_id=${encodeURIComponent(customerId)}`);
                const json = (await res.json().catch(() => ({}))) as { members?: HouseholdMemberRow[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Could not load household members");
                const rows = Array.isArray(json.members) ? json.members : [];
                if (!cancelled) {
                    setMembers(rows);
                    if (rows.length === 1) setMemberChoice(rows[0]!.id);
                    else setMemberChoice(NONE_MEMBER);
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
    }, [customerId]);

    useEffect(() => {
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
    }, []);

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
        void loadDetail(selectedPacketId);
    }, [selectedPacketId, loadDetail]);

    const selectedMember = useMemo(
        () => (memberChoice && memberChoice !== NONE_MEMBER ? members.find((m) => m.id === memberChoice) ?? null : null),
        [memberChoice, members]
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

    const recipientPreviewLabel = useMemo(() => {
        if (recipientChoice === RECIPIENT_DEFAULT) {
            return primaryPersonName || primaryContactName || "Opportunity primary (person or household contact)";
        }
        if (recipientChoice.startsWith("person:")) {
            const id = recipientChoice.slice("person:".length);
            if (selectedMember?.person_id === id) {
                return `${memberLabel(selectedMember)} (linked person)`;
            }
            if (primaryPersonId === id) return `${primaryPersonName ?? "Primary person"} · ${primaryPersonEmail ?? "no email on file"}`;
            return `Selected person · ${id.slice(0, 8)}…`;
        }
        return "—";
    }, [
        recipientChoice,
        primaryPersonName,
        primaryContactName,
        primaryPersonEmail,
        primaryPersonId,
        selectedMember,
    ]);

    const prefillPreviewLines = useMemo(() => {
        const lines: string[] = [];
        lines.push("Guardian / household fields from person + customer when schema uses registry ids.");
        if (selectedMember) {
            lines.push("Child / enrollee fields from customer_member.first_name, .last_name, .dob when those field ids exist.");
        } else {
            lines.push("No enrollee selected — child registry fields will not auto-prefill from a member row.");
        }
        return lines;
    }, [selectedMember]);

    const launchBlockedReason = useMemo(() => {
        if (!selectedPacketId) return "Select a packet.";
        if (detailItems.length === 0 && !detailLoading) return "This packet has no steps.";
        if (!allStepsPublishable) return "Every step must have a published form version (or a published pinned version).";
        return null;
    }, [selectedPacketId, detailItems.length, detailLoading, allStepsPublishable]);

    const launch = async () => {
        if (!selectedPacketId || !canMutate || launchBlockedReason) return;
        setBusy(true);
        setLaunchErr(null);
        setCreatedUrl(null);
        setCopyOk(false);
        try {
            const labelBase = opportunityLabel.trim() || "Opportunity";
            const packetPart = detailName.trim() || "Packet";
            let expires_at: string | undefined;
            if (expiresLocal.trim()) {
                const ms = Date.parse(expiresLocal);
                if (!Number.isFinite(ms)) throw new Error("Expiration must be a valid date/time");
                expires_at = new Date(ms).toISOString();
            }
            const metadata: Record<string, unknown> = {};
            if (internalNote.trim()) metadata.internal_operator_note = internalNote.trim();

            const enrollment_selection: Record<string, unknown> = {
                delivery_intent: deliveryIntent,
            };
            if (memberChoice && memberChoice !== NONE_MEMBER) {
                enrollment_selection.customer_member_id = memberChoice;
            } else {
                enrollment_selection.customer_member_id = null;
            }
            if (recipientPersonIdForApi) {
                enrollment_selection.recipient_person_id = recipientPersonIdForApi;
            } else {
                enrollment_selection.recipient_person_id = null;
            }

            const res = await fetch("/api/admin/forms/packet-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    packet_definition_id: selectedPacketId,
                    label: `${labelBase} · ${packetPart}`,
                    launch_from_entity: { entity_type: "opportunity", entity_id: opportunityId },
                    enrollment_selection,
                    ...(Object.keys(metadata).length ? { metadata } : {}),
                    ...(expires_at ? { expires_at } : {}),
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                data?: { embed_url?: string | null; embed_path?: string };
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? "Could not create link");
            const u =
                typeof json.data?.embed_url === "string" && json.data.embed_url.startsWith("http")
                    ? json.data.embed_url
                    : typeof json.data?.embed_path === "string" && typeof window !== "undefined"
                      ? `${window.location.origin}${json.data.embed_path}`
                      : null;
            if (!u) throw new Error("Missing embed URL");
            setCreatedUrl(u);
            const enrolleeLabel =
                selectedMember ? memberLabel(selectedMember) : "No enrollee selected (household-level launch)";
            onLaunched?.({
                key: `${Date.now()}-${selectedPacketId.slice(0, 8)}`,
                packetName: detailName || "Packet",
                url: u,
                enrolleeLabel,
                recipientLabel: recipientPreviewLabel,
                deliveryIntent: deliveryIntent,
            });
        } catch (e) {
            setLaunchErr(e instanceof Error ? e.message : "Launch failed");
        } finally {
            setBusy(false);
        }
    };

    const copyLink = async () => {
        if (!createdUrl) return;
        try {
            await navigator.clipboard.writeText(createdUrl);
            setCopyOk(true);
        } catch {
            setCopyOk(false);
        }
    };

    const recipientOptions = useMemo(() => {
        const opts: { value: string; label: string }[] = [{ value: RECIPIENT_DEFAULT, label: "Primary on opportunity (recommended)" }];
        if (primaryPersonId) {
            opts.push({
                value: `person:${primaryPersonId}`,
                label: `Primary person — ${primaryPersonName ?? primaryPersonId.slice(0, 8) + "…"}`,
            });
        }
        if (selectedMember?.person_id && (!primaryPersonId || selectedMember.person_id !== primaryPersonId)) {
            opts.push({
                value: `person:${selectedMember.person_id}`,
                label: `Enrollee linked person — ${memberLabel(selectedMember)}`,
            });
        }
        return opts;
    }, [primaryPersonId, primaryPersonName, selectedMember]);

    return (
        <section
            className="mb-4 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-white to-white px-3 py-3 shadow-sm ring-1 ring-alloy-stone/10"
            data-opportunity-enrollment-packet-launch="true"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight/95">Send enrollment packet</h3>
                    <p className="mt-1 text-xs leading-snug text-alloy-midnight/65">
                        Guided launch: choose enrollee, packet, and recipient. CRM linkage is resolved on the server from
                        your selections — not from hidden client fields.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 rounded-md border border-alloy-stone/50 px-2.5 py-1 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/20"
                >
                    Close
                </button>
            </div>

            <div className="mt-4 space-y-5">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">1 · Enrollee</p>
                    {!customerId ?
                        <p className="mt-1 text-xs text-amber-900">
                            This opportunity has no linked household customer yet. You can still create a packet link,
                            but member-based prefill will be limited.
                        </p>
                    : membersLoading ?
                        <p className="mt-1 text-xs text-alloy-midnight/55">Loading household members…</p>
                    : membersErr ?
                        <p className="mt-1 text-xs text-red-700">{membersErr}</p>
                    : members.length === 0 ?
                        <p className="mt-1 text-xs text-alloy-midnight/65">
                            No members on this household yet. Choose &quot;No enrollee selected&quot; or add a member in CRM
                            first.
                        </p>
                    : (
                        <select
                            className="mt-1 block w-full max-w-lg rounded-md border border-alloy-stone/50 bg-white px-2 py-1.5 text-sm text-alloy-midnight/90"
                            value={memberChoice}
                            disabled={!canMutate}
                            onChange={(e) => setMemberChoice(e.target.value)}
                        >
                            <option value={NONE_MEMBER}>No enrollee selected (household-level)</option>
                            {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {memberLabel(m)}
                                    {m._relationship_label ? ` · ${m._relationship_label}` : ""}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">2 · Packet</p>
                    {defsLoading ? <p className="mt-1 text-xs text-alloy-midnight/55">Loading packet definitions…</p> : null}
                    {defsErr ? <p className="mt-1 text-xs text-red-700">{defsErr}</p> : null}
                    {!defsLoading && !defsErr && defs.length === 0 ?
                        <p className="mt-1 text-xs text-alloy-midnight/65">No packet definitions in this organization.</p>
                    : null}
                    {defs.length > 0 ?
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
                    : null}
                    {selectedPacketId ?
                        <>
                            {detailLoading ? <p className="mt-2 text-xs text-alloy-midnight/55">Loading steps…</p> : null}
                            {detailErr ? <p className="mt-2 text-xs text-red-700">{detailErr}</p> : null}
                            {!detailLoading && !detailErr && detailItems.length > 0 ?
                                <div className="mt-2 rounded-md border border-alloy-stone/35 bg-white/90 px-2.5 py-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                        Forms in this packet
                                    </p>
                                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-alloy-midnight/85">
                                        {detailItems.map((it) => (
                                            <li key={`${it.sequence_index}-${formNameFromItem(it)}`}>
                                                {formNameFromItem(it)}
                                                {it.step_has_published_version === false ?
                                                    <span className="ml-2 text-amber-800"> — not published</span>
                                                : null}
                                            </li>
                                        ))}
                                    </ol>
                                    {!allStepsPublishable ?
                                        <p className="mt-2 text-xs font-medium text-amber-900">
                                            Publish every form (or pin a published version) before launching.
                                        </p>
                                    : null}
                                </div>
                            : null}
                        </>
                    : null}
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
                        {primaryPersonEmail || primaryContactEmail ?
                            <>
                                On file:{" "}
                                {[primaryPersonEmail, primaryContactEmail].filter(Boolean).join(" · ") || "—"}
                            </>
                        : "No guardian email on file — you can still copy the link."}
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
                            <span className="font-medium">Enrollee:</span>{" "}
                            {selectedMember ? memberLabel(selectedMember) : "None selected"}
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
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-alloy-midnight/80">
                        <label className="inline-flex items-center gap-1.5">
                            <input
                                type="radio"
                                name="delivery-intent"
                                checked={deliveryIntent === "copy_link"}
                                disabled={!canMutate}
                                onChange={() => setDeliveryIntent("copy_link")}
                            />
                            Copy / open link now
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                            <input
                                type="radio"
                                name="delivery-intent"
                                checked={deliveryIntent === "email_later"}
                                disabled={!canMutate}
                                onChange={() => setDeliveryIntent("email_later")}
                            />
                            Email later (placeholder — sends nothing today)
                        </label>
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

                {launchBlockedReason && selectedPacketId ?
                    <p className="text-xs font-medium text-amber-900">{launchBlockedReason}</p>
                : null}
                {launchErr ? <p className="text-xs text-red-700">{launchErr}</p> : null}

                <div className="flex flex-wrap gap-2 pt-1">
                    <button
                        type="button"
                        disabled={!canMutate || busy || Boolean(launchBlockedReason)}
                        onClick={() => void launch()}
                        className="rounded-md bg-alloy-blue px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy ? "Creating link…" : "6 · Create packet link"}
                    </button>
                    {createdUrl ?
                        <>
                            <button
                                type="button"
                                onClick={() => void copyLink()}
                                className="rounded-md border border-alloy-stone/55 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                            >
                                {copyOk ? "Copied" : "Copy link"}
                            </button>
                            <a
                                href={createdUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-md border border-alloy-stone/55 px-3 py-1.5 text-sm font-medium text-alloy-midnight/85 hover:bg-alloy-stone/25"
                            >
                                Open link
                            </a>
                        </>
                    : null}
                </div>
                {createdUrl ?
                    <p className="break-all font-mono text-[11px] text-alloy-midnight/70">{createdUrl}</p>
                : null}
            </div>
        </section>
    );
}
