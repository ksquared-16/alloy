"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { LifecycleActivationCheckResult } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import {
    buildLifecycleActivationCompactChecks,
    lifecycleActivationCompactAllPass,
    lifecycleActivationTechnicalDetailLines,
} from "@/lib/lifecycle/lifecycleActivationValidationCompact";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import { setLifecycleDebugSelection } from "@/lib/lifecycle/lifecycleDebugSelection";
import {
    hasRuntimeDepartmentId,
    identityHasSyncDrift,
    workspaceDeptHref,
    type LifecycleRuntimeIdentity,
} from "@/lib/lifecycle/lifecycleRuntimeIdentity";
import { evaluateWorkspaceBrowserTileTruth } from "@/lib/workspace/workspaceBrowserTileTruth";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import LifecycleRuntimeIdentityDebug from "@/components/adminV2/settings/lifecycle/LifecycleRuntimeIdentityDebug";

const IDENTITY_SYNC_CHECK: LifecycleActivationCheckResult = {
    id: "identity_sync",
    label: "Catalog ↔ runtime department ID",
    pass: false,
    href: null,
    detail: "",
};

export default function LifecycleActivationValidation({
    identity,
    onRuntimeStatus,
    repairQueue,
    onQueueRepaired,
    onAttachRecords,
    refreshKey = "0",
}: {
    identity: LifecycleRuntimeIdentity | null;
    onRuntimeStatus?: (allPass: boolean) => void;
    repairQueue?: { workUnitId: string; stageKey: string } | null;
    onQueueRepaired?: () => void | Promise<void>;
    onAttachRecords?: () => void | Promise<void>;
    /** Bump to re-run after meaningful lifecycle changes (e.g. stage save). */
    refreshKey?: string;
}) {
    const { orgId, userId } = useAdminAuth();
    const [checks, setChecks] = useState<LifecycleActivationCheckResult[]>([]);
    const [allPass, setAllPass] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showTechnical, setShowTechnical] = useState(false);
    const [browserApiIds, setBrowserApiIds] = useState<string[]>([]);
    const [browserRenderedIds, setBrowserRenderedIds] = useState<string[]>([]);
    const [repairingQueue, setRepairingQueue] = useState(false);
    const [attachingRecords, setAttachingRecords] = useState(false);

    const runtimeDepartmentId = identity?.runtimeDepartmentId?.trim() ?? "";
    const lifecycleName = identity?.lifecycleName ?? "";
    const processId = identity?.processId ?? "";

    const onRuntimeStatusRef = useRef(onRuntimeStatus);
    onRuntimeStatusRef.current = onRuntimeStatus;

    const compactChecks = useMemo(() => buildLifecycleActivationCompactChecks(checks), [checks]);
    const technicalLines = useMemo(
        () =>
            lifecycleActivationTechnicalDetailLines(checks, {
                runtimeDepartmentId: runtimeDepartmentId || undefined,
                orgId: orgId || undefined,
            }),
        [checks, runtimeDepartmentId, orgId]
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        if (!hasRuntimeDepartmentId(identity)) {
            setChecks([]);
            setAllPass(false);
            onRuntimeStatusRef.current?.(false);
            setError("Select a lifecycle with a runtime department before running the ready check.");
            setLoading(false);
            return;
        }

        const drift = identityHasSyncDrift(identity);
        if (drift) {
            const driftCheck: LifecycleActivationCheckResult = {
                ...IDENTITY_SYNC_CHECK,
                pass: false,
                detail: `Catalog and runtime department IDs differ. Use “Use runtime department” before validating.`,
            };
            setChecks([driftCheck]);
            setAllPass(false);
            onRuntimeStatusRef.current?.(false);
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(runtimeDepartmentId)}/lifecycle-activation/validate`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                checks?: LifecycleActivationCheckResult[];
                all_pass?: boolean;
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Ready check failed");
            const serverChecks = (j.checks ?? []).map((c) =>
                c.href?.includes("/workspace/dept/") && runtimeDepartmentId
                    ? { ...c, href: workspaceDeptHref(runtimeDepartmentId) }
                    : c
            );
            const browserTruth = await evaluateWorkspaceBrowserTileTruth(
                orgId,
                userId || null,
                runtimeDepartmentId
            );
            setBrowserApiIds(browserTruth.networkTrace.apiDepartmentIds);
            setBrowserRenderedIds(browserTruth.networkTrace.renderedTileIds);

            const merged = [...serverChecks, browserTruth.check];
            const pass = Boolean(j.all_pass) && browserTruth.check.pass;
            setChecks(merged);
            setAllPass(pass);
            onRuntimeStatusRef.current?.(pass);

            if (isLifecycleDebugUiEnabled()) {
                setLifecycleDebugSelection({
                    department_id: runtimeDepartmentId,
                    lifecycle_name: lifecycleName,
                    process_id: processId,
                    expected_tile_name: lifecycleName,
                });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Ready check failed");
            setChecks([]);
            onRuntimeStatusRef.current?.(false);
        } finally {
            setLoading(false);
        }
    }, [identity, runtimeDepartmentId, lifecycleName, processId, orgId, userId]);

    const repairQueueFilters = useCallback(async () => {
        if (!repairQueue?.workUnitId || !repairQueue.stageKey) return;
        setRepairingQueue(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/stage-work-unit", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    work_unit_id: repairQueue.workUnitId,
                    stage: repairQueue.stageKey,
                    sync_statuses: true,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Repair failed");
            await onQueueRepaired?.();
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Repair failed");
        } finally {
            setRepairingQueue(false);
        }
    }, [repairQueue, onQueueRepaired, load]);

    const attachRecords = useCallback(async () => {
        if (!onAttachRecords) return;
        setAttachingRecords(true);
        setError(null);
        try {
            await onAttachRecords();
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Attach failed");
        } finally {
            setAttachingRecords(false);
        }
    }, [onAttachRecords, load]);

    const autoRunScope = `${runtimeDepartmentId}:${refreshKey}`;

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- scoped to department + explicit refresh bumps
    }, [autoRunScope]);

    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Running ready check…</p>;
    }

    const compactPass = lifecycleActivationCompactAllPass(compactChecks) && allPass;
    return (
        <section className="space-y-3" data-testid="lifecycle-activation-validation">
            <div className="flex items-start justify-between gap-3">
                <p
                    className={`text-xs font-medium ${compactPass ? "text-alloy-pine" : "text-amber-800"}`}
                    data-testid="lifecycle-activation-summary-status"
                >
                    {compactPass ? "Ready for staff on the workspace" : "Not ready yet — review the items below"}
                </p>
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/20 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70"
                    onClick={() => void load()}
                    data-testid="lifecycle-activation-validate-refresh"
                    disabled={!hasRuntimeDepartmentId(identity)}
                >
                    Refresh
                </button>
            </div>

            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <ul className="space-y-2" data-testid="lifecycle-activation-compact-checks">
                {compactChecks.map((check) => (
                    <li
                        key={check.id}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                            check.pass
                                ? "border-alloy-pine/25 bg-alloy-pine/5"
                                : "border-amber-200/80 bg-amber-50/50"
                        }`}
                        data-testid={`lifecycle-activation-compact-${check.id}`}
                        data-pass={check.pass ? "true" : "false"}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-alloy-midnight">{check.label}</span>
                            <span
                                className={
                                    check.pass
                                        ? check.informational
                                            ? "text-alloy-midnight/55 font-medium"
                                            : "text-alloy-pine font-medium"
                                        : "text-amber-800 font-medium"
                                }
                            >
                                {check.pass ? (check.informational ? "Info" : "Ready") : "Needs fix"}
                            </span>
                        </div>
                        <p className="mt-1 text-alloy-midnight/65">{check.summary}</p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                            {check.href ? (
                                <Link
                                    href={check.href}
                                    className="text-[11px] font-medium text-alloy-pine hover:underline"
                                    data-testid="lifecycle-activation-view-link"
                                >
                                    View →
                                </Link>
                            ) : null}
                            {check.id === "queue_filters" &&
                            !check.pass &&
                            repairQueue?.workUnitId &&
                            repairQueue.stageKey ? (
                                <button
                                    type="button"
                                    className="text-[11px] font-medium text-alloy-pine hover:underline disabled:opacity-50"
                                    disabled={repairingQueue}
                                    onClick={() => void repairQueueFilters()}
                                    data-testid="lifecycle-activation-repair-queue-filters"
                                >
                                    {repairingQueue ? "Repairing…" : "Repair →"}
                                </button>
                            ) : null}
                            {check.id === "records_query_ready" &&
                            check.summary.includes("assigned to another work unit") &&
                            onAttachRecords ? (
                                <button
                                    type="button"
                                    className="text-[11px] font-medium text-alloy-pine hover:underline disabled:opacity-50"
                                    disabled={attachingRecords || repairingQueue}
                                    onClick={() => void attachRecords()}
                                    data-testid="lifecycle-activation-attach-records"
                                >
                                    {attachingRecords ? "Attaching…" : "Attach matching records →"}
                                </button>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ul>

            {!compactPass ? (
                <p className="text-xs text-alloy-midnight/55">
                    Resolve any failing items, then refresh the ready check.
                </p>
            ) : (
                <p className="text-xs font-medium text-alloy-pine" data-testid="lifecycle-activation-all-pass">
                    This lifecycle is ready for staff on the workspace.
                </p>
            )}

            <button
                type="button"
                className="text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight"
                aria-expanded={showTechnical}
                data-testid="lifecycle-activation-technical-toggle"
                onClick={() => setShowTechnical((v) => !v)}
            >
                {showTechnical ? "Hide technical details" : "Show technical details"}
            </button>

            {showTechnical ? (
                <div
                    className="rounded-lg border border-alloy-forge/15 bg-alloy-stone/5 px-3 py-2 space-y-2"
                    data-testid="lifecycle-activation-technical-details"
                >
                    {isLifecycleDebugUiEnabled() && identity ? (
                        <LifecycleRuntimeIdentityDebug
                            identity={identity}
                            validationDepartmentId={runtimeDepartmentId}
                            workspaceApiContainsRuntime={
                                runtimeDepartmentId
                                    ? browserApiIds.includes(runtimeDepartmentId)
                                    : null
                            }
                        />
                    ) : null}
                    <ul className="space-y-1 text-[11px] text-alloy-midnight/60 font-mono">
                        {technicalLines.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                    <ul className="space-y-2 border-t border-alloy-forge/10 pt-2">
                        {checks.map((check) => (
                            <li key={check.id} className="text-[11px] text-alloy-midnight/55">
                                <span className="font-medium text-alloy-midnight/70">{check.label}: </span>
                                {check.detail}
                            </li>
                        ))}
                    </ul>
                    {isLifecycleDebugUiEnabled() ? (
                        <p className="text-[10px] text-alloy-midnight/45">
                            Browser API ids: {browserApiIds.join(", ") || "(none)"} · Rendered:{" "}
                            {browserRenderedIds.join(", ") || "(none)"}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
