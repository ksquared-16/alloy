"use client";

/**
 * Update Lead Status — Mutation Command Surface V1.
 *
 * This panel is the Command Surface for the Update Lead Status mutation.
 * It executes through the Mutation Runtime (POST /api/admin/mutations/execute)
 * rather than the legacy admin action executor.
 *
 * Structure (seven sections per doctrine, with empty sections collapsed):
 *   1. Subject context (collapsed — provided by Focus Panel wrapper)
 *   2. Transition: current → target
 *   3. Required information (none for lead status in V1)
 *   4. Warnings (from evaluation)
 *   5. Side effects (none for lead status in V1)
 *   6. Projection preview (implicit — caller drives refresh)
 *   7. Confirmation
 *
 * Does NOT use a center modal. Rendered inline in the Focus Panel / drawer.
 *
 * Doctrine: docs/platform/modules/operational-mutation-platform.md
 */

import { useEffect, useRef, useState } from "react";
import type { MutationResult, EvaluationWarning } from "@/lib/mutations/types";

type StatusOption = {
    value: string;
    label: string;
    color?: string | null;
};

export type UpdateLeadStatusPanelProps = {
    opportunityId: string;
    currentStatusKey: string | null;
    currentStatusLabel?: string | null;
    statusOptions: StatusOption[];
    workUnitId?: string | null;
    departmentId?: string | null;
    onClose: () => void;
    onSuccess: (result: Extract<MutationResult, { status: "committed" }>) => void;
};

export function UpdateLeadStatusPanel({
    opportunityId,
    currentStatusKey,
    currentStatusLabel,
    statusOptions,
    workUnitId,
    departmentId,
    onClose,
    onSuccess,
}: UpdateLeadStatusPanelProps) {
    const [selectedKey, setSelectedKey] = useState<string>("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<EvaluationWarning[]>([]);
    const [previewed, setPreviewed] = useState(false);
    const confirmRef = useRef<HTMLButtonElement>(null);

    const available = statusOptions.filter((s) => s.value !== (currentStatusKey ?? ""));
    const selectedOption = available.find((s) => s.value === selectedKey) ?? null;

    // Reset on open
    useEffect(() => {
        setSelectedKey("");
        setError(null);
        setWarnings([]);
        setPreviewed(false);
        setBusy(false);
    }, [opportunityId]);

    // Fetch preview whenever target changes (evaluate phase without committing)
    useEffect(() => {
        if (!selectedKey) {
            setWarnings([]);
            setPreviewed(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/mutations/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        command_key: "update_lead_status",
                        subject_id: opportunityId,
                        subject_type: "opportunity",
                        target_state: selectedKey,
                        preview_only: true,
                        context: { work_unit_id: workUnitId ?? null, department_id: departmentId ?? null },
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    result?: {
                        status?: string;
                        preview?: { warnings?: EvaluationWarning[] };
                        blockedReason?: string;
                        blockedCode?: string;
                    };
                };
                if (cancelled) return;
                const r = json.result;
                if (!r) return;
                if (r.status === "previewed") {
                    setWarnings(r.preview?.warnings ?? []);
                    setError(null);
                    setPreviewed(true);
                } else if (r.status === "blocked") {
                    setWarnings([]);
                    setError(r.blockedReason ?? "This transition is not allowed.");
                    setPreviewed(false);
                }
            } catch {
                if (!cancelled) {
                    setWarnings([]);
                    setPreviewed(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [selectedKey, opportunityId, workUnitId, departmentId]);

    async function handleConfirm() {
        if (!selectedKey || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/mutations/execute", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    command_key: "update_lead_status",
                    subject_id: opportunityId,
                    subject_type: "opportunity",
                    target_state: selectedKey,
                    preview_only: false,
                    context: { work_unit_id: workUnitId ?? null, department_id: departmentId ?? null },
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                result?: MutationResult;
                error?: string;
            };
            if (!json.ok || !json.result) {
                setError(json.error ?? "Status update failed.");
                return;
            }
            const r = json.result;
            if (r.status === "committed") {
                onSuccess(r);
            } else if (r.status === "blocked") {
                setError(r.blockedReason ?? "This transition is not allowed.");
            } else {
                setError("Unexpected response from server.");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Status update failed.");
        } finally {
            setBusy(false);
        }
    }

    const canConfirm = !!selectedKey && !error && !busy;

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Section 2: Transition */}
            <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Update Lead Status
                </div>
                <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {currentStatusLabel ?? currentStatusKey ?? "—"}
                    </span>
                    <span>→</span>
                    <span className={selectedOption ? "font-medium text-foreground" : "text-muted-foreground"}>
                        {selectedOption?.label ?? "select a status"}
                    </span>
                </div>

                {/* Target status selector */}
                <div className="flex flex-col gap-1">
                    {available.map((s) => (
                        <button
                            key={s.value}
                            type="button"
                            onClick={() => { setSelectedKey(s.value); setError(null); }}
                            className={[
                                "text-left px-3 py-2 rounded-md text-sm transition-colors",
                                selectedKey === s.value
                                    ? "bg-primary text-primary-foreground font-medium"
                                    : "bg-muted/50 hover:bg-muted text-foreground",
                            ].join(" ")}
                        >
                            {s.label}
                        </button>
                    ))}
                    {available.length === 0 && (
                        <p className="text-sm text-muted-foreground">No status changes available.</p>
                    )}
                </div>
            </div>

            {/* Section 4: Warnings */}
            {warnings.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 flex flex-col gap-1">
                    {warnings.map((w, i) => (
                        <p key={i} className="text-xs text-warning-foreground">
                            {w.message}
                        </p>
                    ))}
                </div>
            )}

            {/* Error from blocked evaluation */}
            {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <p className="text-xs text-destructive">{error}</p>
                </div>
            )}

            {/* Section 7: Confirmation */}
            {selectedOption && !error && (
                <div className="flex items-center gap-2 pt-1">
                    <button
                        ref={confirmRef}
                        type="button"
                        disabled={!canConfirm}
                        onClick={handleConfirm}
                        className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                    >
                        {busy ? "Updating…" : `Move to ${selectedOption.label}`}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {!selectedOption && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
