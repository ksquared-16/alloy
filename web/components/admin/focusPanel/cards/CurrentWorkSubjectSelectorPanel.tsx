/**
 * Related-subject selector for Current Work (Command Surface subject_selector).
 *
 * Used when a family-context command (e.g. Move to Waitlist) must resolve an
 * enrollment child before execute. Always: select → preview → confirm → execute.
 * Supports single and multi-select (select all eligible). Zero eligible shows a
 * block — never auto-executes, never invents subjects.
 *
 * Shell chrome mounts immediately in CurrentWorkActionPanel; this body hydrates
 * inside the visible shell (warm peek when available, otherwise compact loading).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import {
    invalidateEligibleEnrollmentChildren,
    peekEligibleEnrollmentChildren,
    prefetchEligibleEnrollmentChildren,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/eligibleEnrollmentChildrenWarmCache";
import {
    commandTimingMark,
    commandTimingMeasure,
    commandTimingStamp,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/commandSurfaceTiming";

type EligibleChildOption = { id: string; label: string };

type Props = {
    action: CurrentWorkActionVM;
    opportunityId: string;
    onClose: () => void;
    onComplete: () => void;
};

type LoadState =
    | { phase: "loading" }
    | { phase: "none"; message: string }
    | { phase: "ready"; subjects: EligibleChildOption[] }
    | { phase: "error"; message: string };

type Stage = "select" | "preview" | "success";

function formatChildNames(labels: string[]): string {
    const names = labels.map((label) => label.split(" · ")[0]?.trim() || label).filter(Boolean);
    if (names.length === 0) return "Children";
    if (names.length === 1) return names[0]!;
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function loadStateFromWarm(
    opportunityId: string,
): { load: LoadState; selectedIds: string[] } | null {
    const warm = peekEligibleEnrollmentChildren(opportunityId);
    if (!warm) return null;
    if (warm.status === "none" || warm.subjects.length === 0) {
        return {
            load: {
                phase: "none",
                message:
                    warm.message?.trim()
                    || "No eligible child is available for Waitlist on this family.",
            },
            selectedIds: [],
        };
    }
    return {
        load: { phase: "ready", subjects: warm.subjects },
        selectedIds: warm.subjects.map((s) => s.id),
    };
}

export default function CurrentWorkSubjectSelectorPanel({
    action,
    opportunityId,
    onClose,
    onComplete,
}: Props) {
    const warmSeed = useMemo(() => loadStateFromWarm(opportunityId), [opportunityId]);
    const [load, setLoad] = useState<LoadState>(() => warmSeed?.load ?? { phase: "loading" });
    const [selectedIds, setSelectedIds] = useState<string[]>(() => warmSeed?.selectedIds ?? []);
    const [stage, setStage] = useState<Stage>("select");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState(0);
    const [successNames, setSuccessNames] = useState<string>("");
    const submitLock = useRef(false);
    const closeTimerRef = useRef<number | null>(null);
    const subjectsRenderedMark = useRef(false);
    const commandKey = (action.handlerKey ?? action.key).trim() || "waitlist_child";

    useEffect(() => {
        commandTimingMark(commandKey, "shell_visible");
        commandTimingMeasure(commandKey, "click_to_shell", "click", "shell_visible");
        return () => {
            if (closeTimerRef.current != null) {
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
            }
        };
    }, [commandKey]);

    const executeForChildren = useCallback(
        async (ocmIds: string[], labels: string[]) => {
            if (submitLock.current || ocmIds.length === 0) return;
            submitLock.current = true;
            setBusy(true);
            setError(null);
            commandTimingMark(commandKey, "confirm");
            try {
                // Independent child OCM commits — parallelize; one consolidated refresh afterward.
                const settled = await Promise.allSettled(
                    ocmIds.map(async (ocmId, index) => {
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action_key: commandKey,
                                entity_type: "opportunity_customer_member",
                                entity_id: ocmId,
                                context: {
                                    surface: "focus_panel",
                                    origin: "operator",
                                },
                                confirmation: { confirmed: true },
                            }),
                        });
                        const json = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            error?: { message?: string; code?: string };
                            message?: string;
                        };
                        if (!res.ok || json.ok === false) {
                            throw new Error(
                                json.error?.message
                                    ?? json.message
                                    ?? `Could not move ${labels[index]?.split(" · ")[0] ?? "child"}.`,
                            );
                        }
                        return { ocmId, label: labels[index] ?? ocmId };
                    }),
                );
                commandTimingMark(commandKey, "mutation_done");
                commandTimingMeasure(commandKey, "confirm_to_mutation", "confirm", "mutation_done");

                const succeeded = settled
                    .filter((row): row is PromiseFulfilledResult<{ ocmId: string; label: string }> =>
                        row.status === "fulfilled",
                    )
                    .map((row) => row.value);
                const failed = settled
                    .filter((row): row is PromiseRejectedResult => row.status === "rejected")
                    .map((row) =>
                        row.reason instanceof Error ? row.reason.message : "Could not complete this action.",
                    );

                if (succeeded.length > 0) {
                    invalidateEligibleEnrollmentChildren(opportunityId);
                    commandTimingMark(commandKey, "refresh_dispatch");
                    // One canonical operational refresh — queue membership + Focus Panel scopes.
                    // Membership classification for waitlist_child drives Waitlist/Lead pill + row refetch
                    // even when child-grain queue rows do not share the family opportunity id.
                    dispatchOpportunityDrawerScopedUpdate(opportunityId, commandKey, [
                        "activity",
                        "header_actions",
                    ]);
                    commandTimingMeasure(commandKey, "mutation_to_refresh", "mutation_done", "refresh_dispatch");
                    commandTimingStamp(commandKey, "refresh_dispatched", {
                        childCount: succeeded.length,
                        opportunityId,
                        failedCount: failed.length,
                    });
                }

                if (failed.length > 0) {
                    setBusy(false);
                    submitLock.current = false;
                    setError(
                        succeeded.length > 0
                            ? `Moved ${succeeded.length}, but ${failed[0]}`
                            : failed[0]!,
                    );
                    return;
                }

                setSuccessCount(succeeded.length);
                setSuccessNames(formatChildNames(succeeded.map((row) => row.label)));
                setStage("success");
                setBusy(false);
                submitLock.current = false;
                // Concise success acknowledgement, then auto-close to normal Focus Panel.
                closeTimerRef.current = window.setTimeout(() => {
                    commandTimingMark(commandKey, "closed");
                    commandTimingMeasure(commandKey, "refresh_to_close", "refresh_dispatch", "closed");
                    onComplete();
                }, 900);
            } catch (e) {
                setBusy(false);
                submitLock.current = false;
                setError(e instanceof Error ? e.message : "Could not complete this action.");
            }
        },
        [commandKey, onComplete, opportunityId],
    );

    useEffect(() => {
        let cancelled = false;
        const applyPayload = (json: {
            ok?: boolean;
            data?: {
                status?: string;
                message?: string | null;
                subjects?: EligibleChildOption[];
            };
            error?: { message?: string };
        }, resOk: boolean) => {
            if (cancelled) return;
            if (!resOk || json.ok === false) {
                setLoad({
                    phase: "error",
                    message: json.error?.message ?? "Could not load children for this family.",
                });
                return;
            }
            const subjects = json.data?.subjects ?? [];
            const status = json.data?.status;
            if (status === "none" || subjects.length === 0) {
                setLoad({
                    phase: "none",
                    message:
                        json.data?.message?.trim()
                        || "No eligible child is available for Waitlist on this family.",
                });
                return;
            }
            setLoad({ phase: "ready", subjects });
            setSelectedIds((prev) => (prev.length > 0 ? prev : subjects.map((s) => s.id)));
            if (!subjectsRenderedMark.current) {
                subjectsRenderedMark.current = true;
                commandTimingMark(commandKey, "subjects_ready");
                commandTimingMeasure(commandKey, "shell_to_subjects", "shell_visible", "subjects_ready");
            }
        };

        // Warm path: already painted from peek — re-verify in background (single fetch, de-duped).
        if (warmSeed?.load.phase === "ready") {
            if (!subjectsRenderedMark.current) {
                subjectsRenderedMark.current = true;
                commandTimingMark(commandKey, "subjects_ready");
                commandTimingMeasure(commandKey, "shell_to_subjects", "shell_visible", "subjects_ready");
            }
            void prefetchEligibleEnrollmentChildren(opportunityId)?.then((value) => {
                if (cancelled || !value) return;
                applyPayload(
                    {
                        ok: true,
                        data: {
                            status: value.status,
                            message: value.message,
                            subjects: value.subjects,
                        },
                    },
                    true,
                );
            });
            return () => {
                cancelled = true;
            };
        }

        (async () => {
            try {
                const res = await fetch(
                    `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/eligible-enrollment-children`,
                    { credentials: "include" },
                );
                const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    data?: {
                        status?: string;
                        message?: string | null;
                        subjects?: EligibleChildOption[];
                    };
                    error?: { message?: string };
                };
                applyPayload(json, res.ok);
            } catch {
                if (!cancelled) {
                    setLoad({
                        phase: "error",
                        message: "Could not load children for this family.",
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [commandKey, opportunityId, warmSeed]);

    const subjects = load.phase === "ready" ? load.subjects : [];
    const selectedSubjects = useMemo(
        () => subjects.filter((s) => selectedIds.includes(s.id)),
        [subjects, selectedIds],
    );
    const allSelected = subjects.length > 0 && selectedIds.length === subjects.length;

    const toggleChild = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const selectAllEligible = () => {
        setSelectedIds(subjects.map((s) => s.id));
    };

    if (load.phase === "loading") {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body"
                data-work-action-panel-state="resolving-subject"
                data-command-surface-section="subject_selector"
                data-command-surface-hydrating="true"
            >
                <p className="text-sm font-medium text-alloy-midnight">Who should move to Waitlist?</p>
                <p className="alloy-os-household__row-detail mt-1">Loading eligible children…</p>
            </div>
        );
    }

    if (load.phase === "none" || load.phase === "error") {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body"
                data-work-action-panel-state="subject-blocked"
                data-command-surface-section="blocker"
            >
                <p className="text-sm text-alloy-midnight/80">{load.message}</p>
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        className="text-sm font-semibold text-alloy-midnight/60"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    if (stage === "success") {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body space-y-2"
                data-work-action-panel-state="subject-success"
                data-command-surface-section="success"
                data-testid="current-work-subject-success"
            >
                <p className="text-sm font-semibold text-alloy-midnight">Moved to Waitlist</p>
                <p className="text-sm text-alloy-midnight/80">
                    {successCount === 1
                        ? `${successNames || "Child"} was moved successfully.`
                        : `${successNames || `${successCount} children`} were moved successfully.`}
                </p>
            </div>
        );
    }

    if (stage === "preview") {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body space-y-3"
                data-work-action-panel-state="subject-preview"
                data-command-surface-section="preview"
                data-testid="current-work-subject-preview"
            >
                <div className="space-y-1">
                    <p className="text-sm font-medium text-alloy-midnight">Moving:</p>
                    <ul className="list-inside list-disc space-y-0.5 text-sm text-alloy-midnight/80">
                        {selectedSubjects.map((child) => (
                            <li key={child.id}>{child.label.split(" · ")[0] ?? child.label}</li>
                        ))}
                    </ul>
                </div>
                <p className="text-sm text-alloy-midnight/80">
                    Destination: <span className="font-semibold text-alloy-midnight">Waitlist</span>
                </p>
                {error ?
                    <p className="text-sm text-red-700" role="alert">
                        {error}
                    </p>
                :   null}
                <div className="flex items-center justify-end gap-2 pt-1" data-command-surface-footer>
                    <button
                        type="button"
                        className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/70 hover:bg-alloy-midnight/5"
                        onClick={() => {
                            setError(null);
                            setStage("select");
                        }}
                        disabled={busy}
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={busy || selectedSubjects.length === 0}
                        data-testid="current-work-subject-selector-confirm"
                        data-command-surface-primary
                        onClick={() =>
                            void executeForChildren(
                                selectedSubjects.map((s) => s.id),
                                selectedSubjects.map((s) => s.label),
                            )
                        }
                    >
                        {busy ? "Working…" : "Move to Waitlist"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="alloy-os-currentwork__action-panel-body space-y-3"
            data-work-action-panel-state="subject-selector"
            data-command-surface-section="subject_selector"
            data-testid="current-work-subject-selector"
        >
            <p className="text-sm font-medium text-alloy-midnight">Who should move to Waitlist?</p>
            <fieldset className="space-y-2" disabled={busy}>
                <legend className="sr-only">Choose children</legend>
                {subjects.map((child) => {
                    const name = child.label.split(" · ")[0] ?? child.label;
                    const context = child.label.includes(" · ")
                        ? child.label.slice(child.label.indexOf(" · ") + 3)
                        : null;
                    return (
                        <label
                            key={child.id}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm text-alloy-midnight transition-colors ${
                                selectedIds.includes(child.id)
                                    ? "border-alloy-bend-pine/50 bg-alloy-bend-pine/[0.06]"
                                    : "border-alloy-stone/20 hover:border-alloy-bend-pine/40"
                            }`}
                            data-testid={`current-work-subject-option-${child.id}`}
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-alloy-bend-pine"
                                checked={selectedIds.includes(child.id)}
                                onChange={() => toggleChild(child.id)}
                            />
                            <span>
                                <span className="font-medium text-alloy-midnight">{name}</span>
                                {context ?
                                    <span className="mt-0.5 block text-xs text-alloy-midnight/60">
                                        {context}
                                    </span>
                                :   null}
                            </span>
                        </label>
                    );
                })}
            </fieldset>
            {subjects.length > 1 ?
                <button
                    type="button"
                    className="text-sm font-semibold text-alloy-bend-pine"
                    onClick={selectAllEligible}
                    disabled={busy || allSelected}
                    data-testid="current-work-subject-select-all"
                >
                    Select all eligible children
                </button>
            :   null}
            {error ?
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            :   null}
            <div className="flex items-center justify-end gap-2 pt-1" data-command-surface-footer>
                <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/70 hover:bg-alloy-midnight/5"
                    onClick={onClose}
                    disabled={busy}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || selectedIds.length === 0}
                    data-testid="current-work-subject-selector-continue"
                    data-command-surface-primary
                    onClick={() => {
                        setError(null);
                        commandTimingMark(commandKey, "continue");
                        commandTimingMeasure(commandKey, "continue_to_preview", "continue", "continue");
                        setStage("preview");
                    }}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}
