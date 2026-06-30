"use client";

/**
 * Update Child Enrollment Status — Mutation Command Surface.
 *
 * Command Surface for the update_child_enrollment_status mutation.
 * Executes through the Mutation Runtime (POST /api/admin/mutations/execute).
 * Subject grain: opportunity_customer_member (OCM) — NOT the Case (opportunity).
 *
 * Structure (collapsed empty sections per doctrine):
 *   1. Subject context: child name + current enrollment status
 *   2. Transition: current → target
 *   3. Required information: readiness gaps (if any)
 *   4. Warnings (from evaluation)
 *   5. Confirmation
 *
 * Doctrine: docs/platform/modules/operational-mutation-platform.md
 */

import { useEffect, useRef, useState } from "react";
import type { MutationResult, EvaluationWarning } from "@/lib/mutations/types";
import { UPDATE_CHILD_ENROLLMENT_STATUS_COMMAND_KEY } from "@/lib/mutations/domains/enrollmentStatus";

type StatusOption = {
    value: string;
    label: string;
};

export type ChildEnrollmentStatusPanelProps = {
    ocmId: string;
    opportunityId: string;
    childDisplayName?: string | null;
    currentStatusKey: string | null;
    currentStatusLabel?: string | null;
    statusOptions: StatusOption[];
    workUnitId?: string | null;
    departmentId?: string | null;
    onClose: () => void;
    onSuccess: (result: Extract<MutationResult, { status: "committed" }>) => void;
};

export function ChildEnrollmentStatusPanel({
    ocmId,
    opportunityId,
    childDisplayName,
    currentStatusKey,
    currentStatusLabel,
    statusOptions,
    workUnitId,
    departmentId,
    onClose,
    onSuccess,
}: ChildEnrollmentStatusPanelProps) {
    const [selectedKey, setSelectedKey] = useState<string>("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<EvaluationWarning[]>([]);
    const [readinessGaps, setReadinessGaps] = useState<string[]>([]);
    const confirmRef = useRef<HTMLButtonElement>(null);

    const available = statusOptions.filter((s) => s.value !== (currentStatusKey ?? ""));
    const selectedOption = available.find((s) => s.value === selectedKey) ?? null;

    useEffect(() => {
        setSelectedKey("");
        setError(null);
        setWarnings([]);
        setReadinessGaps([]);
        setBusy(false);
    }, [ocmId]);

    // Preview on target selection
    useEffect(() => {
        if (!selectedKey) {
            setWarnings([]);
            setReadinessGaps([]);
            setError(null);
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
                        command_key: UPDATE_CHILD_ENROLLMENT_STATUS_COMMAND_KEY,
                        subject_id: ocmId,
                        subject_type: "opportunity_customer_member",
                        target_state: selectedKey,
                        preview_only: true,
                        context: {
                            opportunity_id: opportunityId,
                            work_unit_id: workUnitId ?? null,
                            department_id: departmentId ?? null,
                        },
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    result?: {
                        status?: string;
                        preview?: {
                            warnings?: EvaluationWarning[];
                            readinessGaps?: string[];
                        };
                        blockedReason?: string;
                        blockedCode?: string;
                    };
                };
                if (cancelled) return;
                const r = json.result;
                if (!r) return;
                if (r.status === "previewed") {
                    setWarnings(r.preview?.warnings ?? []);
                    setReadinessGaps(r.preview?.readinessGaps ?? []);
                    setError(null);
                } else if (r.status === "blocked") {
                    setWarnings([]);
                    setReadinessGaps([]);
                    setError(r.blockedReason ?? "This transition is not allowed.");
                }
            } catch {
                if (!cancelled) setError(null);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedKey, ocmId, opportunityId, workUnitId, departmentId]);

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
                    command_key: UPDATE_CHILD_ENROLLMENT_STATUS_COMMAND_KEY,
                    subject_id: ocmId,
                    subject_type: "opportunity_customer_member",
                    target_state: selectedKey,
                    preview_only: false,
                    context: {
                        opportunity_id: opportunityId,
                        work_unit_id: workUnitId ?? null,
                        department_id: departmentId ?? null,
                    },
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

    const canConfirm = !!selectedKey && !error && readinessGaps.length === 0 && !busy;

    return (
        <div className="flex flex-col gap-4 p-4 border-t border-alloy-stone/15 bg-alloy-stone/[0.02]">
            {/* Section 1: Subject context */}
            <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Update Child Enrollment Status
                </div>
                {childDisplayName && (
                    <div className="text-sm text-foreground font-medium">{childDisplayName}</div>
                )}
            </div>

            {/* Section 2: Transition */}
            <div>
                <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {currentStatusLabel ?? currentStatusKey ?? "—"}
                    </span>
                    <span>→</span>
                    <span className={selectedOption ? "font-medium text-foreground" : "text-muted-foreground"}>
                        {selectedOption?.label ?? "select a status"}
                    </span>
                </div>

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

            {/* Section 3: Readiness gaps */}
            {readinessGaps.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-1">
                    <p className="text-xs font-medium text-destructive mb-1">Required information missing</p>
                    {readinessGaps.map((gap, i) => (
                        <p key={i} className="text-xs text-destructive/80">• {gap}</p>
                    ))}
                </div>
            )}

            {/* Section 4: Warnings */}
            {warnings.length > 0 && (
                <div className="rounded-md border border-warning/40 bg-warning/5 p-3 flex flex-col gap-1">
                    {warnings.map((w, i) => (
                        <p key={i} className="text-xs text-warning-foreground">{w.message}</p>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <p className="text-xs text-destructive">{error}</p>
                </div>
            )}

            {/* Section 5: Confirmation */}
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
                    <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
