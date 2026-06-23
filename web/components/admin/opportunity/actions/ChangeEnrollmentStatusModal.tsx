"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    ENROLLMENT_STATUS_BYPASS_REASON_OPTIONS,
    type EnrollmentStatusTransitionScope,
    type EnrollmentStatusTransitionSourceSurface,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import type { EnrollmentStatusTransitionContextResult } from "@/lib/admin/enrollmentStatus/loadEnrollmentStatusTransitionContext";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

type Props = {
    open: boolean;
    opportunityId: string;
    sourceSurface?: EnrollmentStatusTransitionSourceSurface;
    initialScope?: Partial<EnrollmentStatusTransitionScope>;
    departmentId?: string | null;
    workUnitId?: string | null;
    onClose: () => void;
    onSuccess?: () => void;
};

const DEBUG_ENROLLMENT_STATUS =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENROLLMENT_STATUS_DEBUG === "1";

export function ChangeEnrollmentStatusModal({
    open,
    opportunityId,
    sourceSurface = "opportunity_drawer",
    initialScope,
    departmentId = null,
    workUnitId = null,
    onClose,
    onSuccess,
}: Props) {
    const [loadPhase, setLoadPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [context, setContext] = useState<EnrollmentStatusTransitionContextResult | null>(null);
    const [selectedOcmId, setSelectedOcmId] = useState("");
    const [destinationKey, setDestinationKey] = useState<EnrollmentStatusDestinationKey | "">("");
    const [bypassReason, setBypassReason] = useState("");
    const [customBypassReason, setCustomBypassReason] = useState("");
    const [note, setNote] = useState("");
    const [preflight, setPreflight] = useState<RequirementValidationResult | null>(null);
    const [skippedStageLabels, setSkippedStageLabels] = useState<string[]>([]);
    const [requiresBypassReason, setRequiresBypassReason] = useState(false);
    const loadRequestId = useRef(0);
    const preflightRequestId = useRef(0);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel =
        "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    const effectiveOcmId = useMemo(() => {
        if (selectedOcmId.trim()) return selectedOcmId.trim();
        return context?.scope.opportunityCustomerMemberId?.trim() ?? "";
    }, [context?.scope.opportunityCustomerMemberId, selectedOcmId]);

    const selectedDestination = useMemo(
        () => context?.destinations.find((d) => d.destinationKey === destinationKey) ?? null,
        [context?.destinations, destinationKey],
    );

    const fetchContext = useCallback(
        async (ocmIdOverride?: string) => {
            const requestId = ++loadRequestId.current;
            setLoadPhase("loading");
            setError(null);
            setPreflight(null);
            setSkippedStageLabels([]);
            setRequiresBypassReason(false);
            setDestinationKey("");

            try {
                const res = await fetch("/api/admin/enrollment-status-transition/context", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        opportunity_id: opportunityId,
                        source_surface: sourceSurface,
                        scope: {
                            opportunityId,
                            sourceSurface,
                            grain: initialScope?.grain,
                            opportunityCustomerMemberId:
                                ocmIdOverride?.trim() ||
                                initialScope?.opportunityCustomerMemberId?.trim() ||
                                undefined,
                            placementCandidateId: initialScope?.placementCandidateId,
                            childDisplayName: initialScope?.childDisplayName,
                        },
                        department_id: departmentId,
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    context?: EnrollmentStatusTransitionContextResult;
                };
                if (requestId !== loadRequestId.current) return;
                if (!res.ok || !json.context) {
                    throw new Error(json.error ?? "Failed to load enrollment context");
                }
                setContext(json.context);
                setSelectedOcmId(json.context.scope.opportunityCustomerMemberId?.trim() ?? ocmIdOverride?.trim() ?? "");
                setLoadPhase("ready");
            } catch (e) {
                if (requestId !== loadRequestId.current) return;
                setError(e instanceof Error ? e.message : "Failed to load");
                setLoadPhase("error");
            }
        },
        [departmentId, initialScope, opportunityId, sourceSurface],
    );

    useEffect(() => {
        if (!open) {
            setLoadPhase("idle");
            setContext(null);
            setSelectedOcmId("");
            setDestinationKey("");
            setBypassReason("");
            setCustomBypassReason("");
            setNote("");
            setPreflight(null);
            setSkippedStageLabels([]);
            setRequiresBypassReason(false);
            setError(null);
            return;
        }
        void fetchContext(initialScope?.opportunityCustomerMemberId?.trim());
    }, [open, fetchContext, initialScope?.opportunityCustomerMemberId]);

    const runPreflight = useCallback(async () => {
        if (!destinationKey) return;
        const requestId = ++preflightRequestId.current;
        const res = await fetch("/api/admin/enrollment-status-transition/preflight", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                opportunity_id: opportunityId,
                destination_key: destinationKey,
                target_status_key: selectedDestination?.defaultStatusKey,
                bypass_reason: bypassReason === "Other" ? customBypassReason.trim() : bypassReason.trim() || null,
                scope: {
                    grain: effectiveOcmId ? "child" : "case",
                    opportunity_customer_member_id: effectiveOcmId || null,
                    placement_candidate_id: initialScope?.placementCandidateId ?? null,
                },
                context: { department_id: departmentId, work_unit_id: workUnitId },
            }),
        });
        const json = (await res.json().catch(() => ({}))) as {
            completion_requirements?: RequirementValidationResult;
            requires_bypass_reason?: boolean;
            skipped_stage_labels?: string[];
        };
        if (requestId !== preflightRequestId.current) return;
        setPreflight(json.completion_requirements ?? null);
        setRequiresBypassReason(Boolean(json.requires_bypass_reason));
        setSkippedStageLabels(Array.isArray(json.skipped_stage_labels) ? json.skipped_stage_labels : []);
    }, [
        bypassReason,
        customBypassReason,
        departmentId,
        destinationKey,
        effectiveOcmId,
        initialScope?.placementCandidateId,
        opportunityId,
        selectedDestination?.defaultStatusKey,
        workUnitId,
    ]);

    useEffect(() => {
        if (!open || loadPhase !== "ready" || !destinationKey) {
            setPreflight(null);
            setSkippedStageLabels([]);
            return;
        }
        if (context?.requiresChildSelection && !effectiveOcmId) return;
        const t = window.setTimeout(() => void runPreflight(), 250);
        return () => window.clearTimeout(t);
    }, [open, loadPhase, destinationKey, effectiveOcmId, context?.requiresChildSelection, runPreflight]);

    if (!open) return null;

    const blockingSummary = preflight && !preflight.ok ? formatRequirementValidationSummary(preflight) : null;
    const canSubmit =
        loadPhase === "ready" &&
        Boolean(destinationKey) &&
        (!context?.requiresChildSelection || Boolean(effectiveOcmId)) &&
        (!requiresBypassReason || Boolean(bypassReason.trim() || customBypassReason.trim())) &&
        preflight?.ok !== false;

    const scopeHint =
        context?.childScoped
            ? context.requiresChildSelection
                ? "Select which child's enrollment track to move."
                : `Updating enrollment for ${context.scope.childDisplayName ?? "this child"}.`
            : "Updating household / case record status.";

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label="Change enrollment stage">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">Change enrollment stage</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">{scopeHint}</div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    {loadPhase === "loading" ?
                        <div className="space-y-3 animate-pulse" data-testid="enrollment-status-modal-skeleton">
                            <div className="h-14 rounded-lg bg-alloy-stone/15" />
                            <div className="h-10 rounded-lg bg-alloy-stone/10" />
                            <div className="h-10 rounded-lg bg-alloy-stone/10" />
                        </div>
                    :   null}

                    {loadPhase === "error" && error ?
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    :   null}

                    {loadPhase === "ready" && context ?
                        <>
                            <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2">
                                <div className={label}>Current stage</div>
                                <div className="mt-1 text-sm font-semibold text-alloy-midnight">
                                    {context.currentStatusLabel}
                                </div>
                                {DEBUG_ENROLLMENT_STATUS && context.currentStatusKey ?
                                    <div className="mt-0.5 text-[10px] text-alloy-midnight/45">
                                        Status: {context.currentStatusKey}
                                    </div>
                                :   null}
                            </div>

                            {context.requiresChildSelection && context.children.length > 1 ?
                                <div>
                                    <div className={label}>Which child enrollment?</div>
                                    <select
                                        value={selectedOcmId}
                                        disabled={busy}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            setSelectedOcmId(next);
                                            if (next.trim()) void fetchContext(next);
                                        }}
                                        className={input}
                                    >
                                        <option value="">Select child…</option>
                                        {context.children.map((c) => (
                                            <option
                                                key={c.opportunityCustomerMemberId}
                                                value={c.opportunityCustomerMemberId}
                                            >
                                                {c.displayName} — {c.outcomeStatusLabel}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            :   null}

                            <div>
                                <div className={label}>Move to stage</div>
                                <select
                                    value={destinationKey}
                                    disabled={busy}
                                    onChange={(e) =>
                                        setDestinationKey(e.target.value as EnrollmentStatusDestinationKey | "")
                                    }
                                    className={input}
                                >
                                    <option value="">Select stage…</option>
                                    {context.destinations.map((d) => (
                                        <option key={`${d.destinationKey}:${d.defaultStatusKey}`} value={d.destinationKey}>
                                            {d.label}
                                            {d.parkingLot ? " (parking lot)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {skippedStageLabels.length > 0 ?
                                <div className="rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.04] px-3 py-2">
                                    <div className={label}>Skipped stages</div>
                                    <p className="mt-1 text-sm text-alloy-midnight/75">
                                        {skippedStageLabels.join(" · ")}
                                    </p>
                                </div>
                            :   null}

                            {requiresBypassReason ?
                                <div>
                                    <div className={label}>Reason for bypass</div>
                                    <select
                                        value={bypassReason}
                                        disabled={busy}
                                        onChange={(e) => setBypassReason(e.target.value)}
                                        className={input}
                                    >
                                        <option value="">Select reason…</option>
                                        {ENROLLMENT_STATUS_BYPASS_REASON_OPTIONS.map((r) => (
                                            <option key={r} value={r}>
                                                {r}
                                            </option>
                                        ))}
                                    </select>
                                    {bypassReason === "Other" ?
                                        <input
                                            value={customBypassReason}
                                            disabled={busy}
                                            onChange={(e) => setCustomBypassReason(e.target.value)}
                                            className={`${input} mt-2`}
                                            placeholder="Describe why requirements are being skipped"
                                        />
                                    :   null}
                                </div>
                            :   null}

                            {preflight && (preflight.blocking.length > 0 || preflight.recommendations.length > 0) ?
                                <div className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 space-y-1">
                                    <div className={label}>Requirements</div>
                                    {preflight.blocking.map((v) => (
                                        <div key={`${v.field_key}-${v.label}`} className="text-sm text-alloy-ember">
                                            {v.label}: {v.missing_reason}
                                        </div>
                                    ))}
                                    {preflight.recommendations.map((v) => (
                                        <div
                                            key={`rec-${v.field_key}-${v.label}`}
                                            className="text-sm text-alloy-midnight/70"
                                        >
                                            {v.label}: {v.missing_reason}
                                        </div>
                                    ))}
                                </div>
                            :   null}

                            <div>
                                <div className={label}>Note (optional)</div>
                                <textarea
                                    value={note}
                                    disabled={busy}
                                    onChange={(e) => setNote(e.target.value)}
                                    className={input}
                                    rows={3}
                                    placeholder="Add context for this stage change."
                                />
                            </div>
                        </>
                    :   null}

                    {error && loadPhase === "ready" ?
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    :   null}

                    {blockingSummary && loadPhase === "ready" ?
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {blockingSummary}
                        </div>
                    :   null}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-alloy-stone/15">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy || !canSubmit}
                        onClick={async () => {
                            if (!destinationKey || !selectedDestination) return;
                            setBusy(true);
                            setError(null);
                            try {
                                const resolvedBypass =
                                    bypassReason === "Other" ? customBypassReason.trim() : bypassReason.trim();
                                const res = await fetch("/api/admin/enrollment-status-transition/execute", {
                                    method: "POST",
                                    credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        opportunity_id: opportunityId,
                                        destination_key: destinationKey,
                                        target_status_key: selectedDestination.defaultStatusKey,
                                        note: note.trim() || null,
                                        bypass_reason: resolvedBypass || null,
                                        source_surface: sourceSurface,
                                        scope: {
                                            grain: effectiveOcmId ? "child" : "case",
                                            opportunity_customer_member_id: effectiveOcmId || null,
                                            placement_candidate_id: initialScope?.placementCandidateId ?? null,
                                        },
                                        context: {
                                            department_id: departmentId,
                                            work_unit_id: workUnitId,
                                        },
                                    }),
                                });
                                const json = (await res.json().catch(() => ({}))) as {
                                    ok?: boolean;
                                    error?: string;
                                    summary?: string;
                                };
                                if (!res.ok || !json.ok) {
                                    throw new Error(json.summary ?? json.error ?? "Update failed");
                                }
                                onSuccess?.();
                                onClose();
                            } catch (e) {
                                setError(e instanceof Error ? e.message : "Update failed");
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {busy ? "Updating…" : "Confirm change"}
                    </button>
                </div>
            </div>
        </>
    );
}
