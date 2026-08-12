"use client";

/**
 * Workspace Create Assignment — pick child → type → editor → save without leaving Workspace.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import { filterRoomsForPurposeBehavior } from "@/lib/operationalAssignments/assignmentTypeBehavior";

export type WorkspaceCreateChildCandidate = {
    customerMemberId: string;
    /** Empty when child is not yet enrolled — creates a Proposed Assignment. */
    agreementId: string;
    personId: string | null;
    name: string;
    startDate: string | null;
};

type Pattern = { id: string; label: string; weekdays: number[]; scheduleTypeKey: string };
type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: "recommended" | "eligible" | "blocked";
    reason: string;
    programCategoryId?: string | null;
};

type Step = "child" | "type" | "editor";

async function schedApi(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body;
}

async function executeAction(body: Record<string, unknown>): Promise<void> {
    const { operatorFacingAssignmentError } = await import(
        "@/lib/operationalAssignments/operatorAssignmentErrors"
    );
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        const raw = typeof json?.error === "string" ? json.error : "Action failed";
        throw new Error(operatorFacingAssignmentError(raw));
    }
}

export default function WorkspaceCreateAssignmentModal({
    open,
    siteId,
    siteName,
    candidates,
    assignmentTypes,
    preselectedChildId,
    onClose,
    onSaved,
}: {
    open: boolean;
    siteId: string;
    siteName: string;
    candidates: WorkspaceCreateChildCandidate[];
    assignmentTypes: OrgAssignmentTypeOption[];
    preselectedChildId?: string | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [step, setStep] = useState<Step>("child");
    const [childId, setChildId] = useState("");
    const [typeId, setTypeId] = useState("");
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [patternId, setPatternId] = useState("");
    const [roomId, setRoomId] = useState<string | null>(null);
    const [roomName, setRoomName] = useState<string | null>(null);
    const [roomOptions, setRoomOptions] = useState<PlacementOption[] | null>(null);
    const [startDate, setStartDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Server-resolved from the child's placement/enrollment context (never a hardcoded
    // null) — echoed back by `?view=options` and adopted here for client-side
    // "Spaces matching Program" filtering once scored options resolve.
    const [programCategoryId, setProgramCategoryId] = useState<string | null>(null);

    const child = useMemo(
        () => candidates.find((c) => c.customerMemberId === childId) ?? null,
        [candidates, childId],
    );
    const selectedType = assignmentTypes.find((t) => t.id === typeId) ?? null;
    const roomReq =
        selectedType?.behavior?.roomRequirement ??
        (selectedType?.behavior?.requiresRoom ? "required" : "optional");
    const roomRequired = roomReq === "required";
    const roomNotUsed = roomReq === "not_used";

    const filteredRoomOptions = useMemo(() => {
        if (roomOptions == null) return null;
        if (roomNotUsed) return [];
        return filterRoomsForPurposeBehavior(
            roomOptions,
            selectedType?.behavior ?? {},
            programCategoryId
        );
    }, [roomOptions, selectedType, roomNotUsed, programCategoryId]);

    useEffect(() => {
        if (!open) return;
        setError(null);
        setBusy(false);
        // Keep prior room options warm across reopen; do not blank the picker.
        if (preselectedChildId && candidates.some((c) => c.customerMemberId === preselectedChildId)) {
            setChildId(preselectedChildId);
            setStep(assignmentTypes.length === 1 ? "editor" : "type");
            if (assignmentTypes.length === 1) setTypeId(assignmentTypes[0]?.id ?? "");
        } else if (candidates.length === 1) {
            setChildId(candidates[0]!.customerMemberId);
            setStep(assignmentTypes.length === 1 ? "editor" : "type");
            if (assignmentTypes.length === 1) setTypeId(assignmentTypes[0]?.id ?? "");
        } else {
            setChildId("");
            setStep("child");
        }
        setTypeId("");
        setPatternId("");
        setRoomId(null);
        setRoomName(null);
        setStartDate("");
        setProgramCategoryId(null);
    }, [open, preselectedChildId, candidates, assignmentTypes]);

    // Prefetch patterns + operational rooms as soon as the modal opens (instant pickers).
    useEffect(() => {
        if (!open || !siteId) return;
        let cancelled = false;
        void schedApi(`?view=studio_config&site_location_id=${encodeURIComponent(siteId)}`)
            .then((body) => {
                if (cancelled) return;
                const rooms = (body?.config?.operationalRooms ?? []) as {
                    roomId: string;
                    roomName: string | null;
                    programCategoryId?: string | null;
                }[];
                if (rooms.length) {
                    setRoomOptions((prev) =>
                        prev && prev.length
                            ? prev
                            : rooms.map((r) => ({
                                  roomId: r.roomId,
                                  roomName: r.roomName,
                                  // Pending seed — scored options replace this; never flash Eligible.
                                  classification: "eligible" as const,
                                  reason: "Checking eligibility…",
                                  programCategoryId: r.programCategoryId ?? null,
                              }))
                    );
                }
            })
            .catch(() => {});
        void fetch(`/api/admin/schedule-patterns?site_location_id=${encodeURIComponent(siteId)}`)
            .then((r) => r.json())
            .then((body) => {
                if (cancelled) return;
                const ps = ((body?.patterns ?? []) as Record<string, unknown>[]).map((row) => ({
                    id: String(row.id),
                    label: String(row.label ?? "Pattern"),
                    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [],
                    scheduleTypeKey: String(row.schedule_type_key ?? ""),
                }));
                setPatterns(ps);
                if (ps[0]) setPatternId((prev) => prev || ps[0]!.id);
            })
            .catch(() => {
                if (!cancelled) setPatterns([]);
            });
        return () => {
            cancelled = true;
        };
    }, [open, siteId]);

    useEffect(() => {
        if (!open || !siteId || !patternId) return;
        const memberId = child?.customerMemberId || preselectedChildId || candidates[0]?.customerMemberId;
        if (!memberId) return;
        let cancelled = false;
        setRoomOptions((prev) =>
            (prev ?? []).map((r) => ({
                ...r,
                classification: "eligible" as const,
                reason: "Checking eligibility…",
            })),
        );
        void schedApi(
            `?view=options&site_location_id=${encodeURIComponent(siteId)}&pattern_id=${encodeURIComponent(patternId)}&child_agreement_id=${encodeURIComponent(memberId)}${startDate ? `&start_date=${startDate}` : ""}`,
        )
            .then((o) => {
                if (cancelled) return;
                setRoomOptions(o.options ?? []);
                if (typeof o.programCategoryId === "string" && o.programCategoryId) {
                    setProgramCategoryId(o.programCategoryId);
                }
            })
            .catch(() => {
                // Keep seed list; do not blank on scoring failure.
            });
        return () => {
            cancelled = true;
        };
    }, [open, child, patternId, siteId, startDate, preselectedChildId, candidates]);

    const onPickChild = (id: string) => {
        setChildId(id);
        const picked = candidates.find((c) => c.customerMemberId === id);
        setStartDate(picked?.startDate?.slice(0, 10) ?? "");
        setStep(assignmentTypes.length === 0 ? "editor" : assignmentTypes.length === 1 ? "editor" : "type");
        if (assignmentTypes.length === 1) setTypeId(assignmentTypes[0]?.id ?? "");
    };

    const save = useCallback(async () => {
        if (!child) return;
        setBusy(true);
        setError(null);
        try {
            if (!patternId) throw new Error("Choose days and hours (schedule pattern).");
            if (!startDate) throw new Error("Start date is required.");
            if (!selectedType?.id) throw new Error("Choose an Assignment Category.");

            const agreementId = (child.agreementId ?? "").trim();
            await executeAction({
                action_key: "assignment.create",
                entity_type: "child",
                entity_id: child.customerMemberId,
                payload: {
                    subject_type: "child",
                    enrollment_agreement_id: agreementId || undefined,
                    customer_member_id: child.customerMemberId,
                    site_location_id: siteId,
                    schedule_pattern_id: patternId,
                    start_date: startDate,
                    room_location_id: roomId || undefined,
                    assignment_type_id: selectedType.id,
                    assignment_type_label: selectedType.label,
                    is_primary: false,
                },
            });
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setBusy(false);
        }
    }, [child, patternId, startDate, roomId, selectedType, siteId, onSaved, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-alloy-midnight/40 p-4"
            data-workspace-create-assignment-modal="true"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-create-assignment-title"
        >
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-xl">
                <header className="flex items-start justify-between gap-3 border-b border-alloy-stone/12 px-4 py-3">
                    <div>
                        <p
                            id="workspace-create-assignment-title"
                            className="text-[14px] font-semibold text-alloy-midnight"
                        >
                            Create Assignment
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-alloy-slate">
                            {siteName} · pick child, type, and placement
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded-md p-1 text-alloy-midnight/45 hover:bg-alloy-stone/30"
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {error ? (
                        <p className="mb-3 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember">
                            {error}
                        </p>
                    ) : null}

                    {step === "child" ? (
                        <div className="grid gap-2" data-create-step="child">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Choose child
                            </p>
                            {candidates.length === 0 ? (
                                <p className="text-[12px] text-alloy-slate" data-create-empty="no-enrolled-children">
                                    No children available at this site yet. Select a child from the roster, or open a
                                    record that includes a child. Without enrollment, the Assignment saves as Proposed.
                                </p>
                            ) : (
                                <ul className="grid gap-1.5">
                                    {candidates.map((c) => (
                                        <li key={c.customerMemberId}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center justify-between rounded-lg border border-alloy-stone/20 px-3 py-2 text-left hover:bg-alloy-stone/20"
                                                onClick={() => onPickChild(c.customerMemberId)}
                                                data-create-child-option={c.customerMemberId}
                                            >
                                                <span className="text-[13px] font-semibold text-alloy-midnight">
                                                    {c.name}
                                                </span>
                                                {c.startDate ? (
                                                    <span className="text-[10.5px] text-alloy-slate">
                                                        starts {c.startDate.slice(0, 10)}
                                                    </span>
                                                ) : null}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : null}

                    {step === "type" ? (
                        <div className="grid gap-3" data-create-step="type">
                            <p className="text-[12px] text-alloy-slate">
                                Creating for <strong className="text-alloy-midnight">{child?.name}</strong>
                            </p>
                            {assignmentTypes.length === 0 ? (
                                <p className="text-[12px] text-alloy-slate">
                                    No Assignment Categories configured — create them in Studio → Assignment
                                    Categories first.
                                </p>
                            ) : (
                                <>
                                    <p className="text-[12.5px] font-semibold text-alloy-midnight">
                                        What category of assignment is this?
                                    </p>
                                    <label className="grid gap-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                            Assignment Category
                                        </span>
                                        <AlloySelect
                                            value={typeId}
                                            onChange={setTypeId}
                                            placeholder="Choose category…"
                                            options={assignmentTypes.map((t) => ({
                                                value: t.id ?? t.key ?? "",
                                                label: t.label ?? t.key ?? "Assignment Category",
                                            }))}
                                            aria-label="Assignment Category"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        disabled={!typeId}
                                        className="justify-self-start rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                                        onClick={() => setStep("editor")}
                                    >
                                        Continue
                                    </button>
                                </>
                            )}
                        </div>
                    ) : null}

                    {step === "editor" && child ? (
                        <div className="grid gap-3" data-create-step="editor" data-schedule-editor="true">
                            <p className="text-[12px] text-alloy-slate">
                                Editing this Assignment for{" "}
                                <strong className="text-alloy-midnight">{child.name}</strong>
                                {selectedType ? ` · ${selectedType.label}` : ""}
                            </p>
                            <label className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                    Pattern
                                </span>
                                <AlloySelect
                                    value={patternId}
                                    onChange={setPatternId}
                                    options={patterns.map((p) => ({ value: p.id, label: p.label }))}
                                    placeholder="Choose pattern…"
                                    aria-label="Schedule pattern"
                                />
                            </label>
                            <label className="grid gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                    Start date
                                </span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                                />
                            </label>
                            {roomNotUsed ? (
                                <p className="text-[12px] text-alloy-slate" data-room-not-used="true">
                                    Operational space not used for this Assignment Category.
                                </p>
                            ) : (
                                <label
                                    className="grid gap-1"
                                    data-assignment-program-resolved={programCategoryId ? "true" : "false"}
                                >
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                        Room{roomRequired ? "" : " (optional)"}
                                    </span>
                                    {filteredRoomOptions == null ? (
                                        <p className="text-[11px] text-alloy-slate">Loading rooms…</p>
                                    ) : (
                                        <AlloySelect
                                            value={roomId ?? ""}
                                            onChange={(v) => {
                                                setRoomId(v || null);
                                                const opt = filteredRoomOptions.find((o) => o.roomId === v);
                                                setRoomName(opt?.roomName ?? null);
                                            }}
                                            options={filteredRoomOptions
                                                .filter((o) => o.classification !== "blocked")
                                                .map((o) => ({
                                                    value: o.roomId,
                                                    label: o.roomName ?? "Room",
                                                }))}
                                            placeholder={roomRequired ? "Choose room…" : "Choose room (optional)…"}
                                            aria-label="Room"
                                        />
                                    )}
                                    {!child.agreementId ? (
                                        <p className="text-[11px] text-alloy-slate">
                                            This child is not enrolled yet. This Assignment will be saved as Proposed.
                                        </p>
                                    ) : null}
                                </label>
                            )}
                        </div>
                    ) : null}
                </div>

                <footer className="flex items-center justify-between gap-2 border-t border-alloy-stone/12 px-4 py-3">
                    {step !== "child" ? (
                        <button
                            type="button"
                            className="text-[12px] font-semibold text-alloy-slate"
                            onClick={() => setStep(step === "editor" ? (assignmentTypes.length > 1 ? "type" : "child") : "child")}
                        >
                            Back
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="rounded-lg px-3 py-2 text-[12px] font-semibold text-alloy-slate"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        {step === "editor" ? (
                            <button
                                type="button"
                                disabled={
                                    busy ||
                                    !patternId ||
                                    !startDate ||
                                    !selectedType?.id ||
                                    (roomRequired && !roomId)
                                }
                                className="rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                                onClick={() => void save()}
                                data-schedule-commit="true"
                            >
                                {busy ? "Saving…" : "Save Assignment"}
                            </button>
                        ) : null}
                    </div>
                </footer>
            </div>
        </div>
    );
}
