/**
 * Related-subject selector for Current Work (Command Surface subject_selector).
 *
 * Used when a family-context command (e.g. Move to Waitlist) must resolve an
 * enrollment child before execute. Always: select → preview → confirm → execute.
 * Supports single and multi-select (select all eligible). Zero eligible shows a
 * block — never auto-executes, never invents subjects.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

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

export default function CurrentWorkSubjectSelectorPanel({
    action,
    opportunityId,
    onClose,
    onComplete,
}: Props) {
    const [load, setLoad] = useState<LoadState>({ phase: "loading" });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [stage, setStage] = useState<Stage>("select");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState(0);
    const submitLock = useRef(false);
    const commandKey = (action.handlerKey ?? action.key).trim() || "waitlist_child";
    const commandLabel = action.label?.trim() || "Move to Waitlist";

    const executeForChildren = useCallback(
        async (ocmIds: string[]) => {
            if (submitLock.current || ocmIds.length === 0) return;
            submitLock.current = true;
            setBusy(true);
            setError(null);
            try {
                for (const ocmId of ocmIds) {
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
                                ?? "Could not complete this action.",
                        );
                    }
                }
                dispatchOpportunityDrawerScopedUpdate(opportunityId, commandKey, [
                    "activity",
                    "header_actions",
                ]);
                setSuccessCount(ocmIds.length);
                setStage("success");
                setBusy(false);
                submitLock.current = false;
                // Brief success acknowledgement, then close through the same surface.
                window.setTimeout(() => onComplete(), 700);
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
        (async () => {
            try {
                const res = await fetch(
                    `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/eligible-enrollment-children`,
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
                if (cancelled) return;
                if (!res.ok || json.ok === false) {
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
                // Default: all eligible selected when multiple; single selected when one.
                setSelectedIds(subjects.map((s) => s.id));
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
    }, [opportunityId]);

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
            >
                <p className="text-sm font-medium text-alloy-midnight">
                    {successCount === 1
                        ? "Moved to Waitlist."
                        : `Moved ${successCount} children to Waitlist.`}
                </p>
                <p className="text-xs text-alloy-midnight/60">Updating this record…</p>
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
                        className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={busy || selectedSubjects.length === 0}
                        data-testid="current-work-subject-selector-confirm"
                        data-command-surface-primary
                        onClick={() => void executeForChildren(selectedSubjects.map((s) => s.id))}
                    >
                        {busy ? "Working…" : `Confirm ${commandLabel}`}
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
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-alloy-stone/20 px-3 py-2 text-sm text-alloy-midnight hover:border-alloy-pine/40"
                            data-testid={`current-work-subject-option-${child.id}`}
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={selectedIds.includes(child.id)}
                                onChange={() => toggleChild(child.id)}
                            />
                            <span>
                                <span className="font-medium">{name}</span>
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
                    className="text-sm font-semibold text-alloy-pine"
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
                    className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || selectedIds.length === 0}
                    data-testid="current-work-subject-selector-continue"
                    data-command-surface-primary
                    onClick={() => {
                        setError(null);
                        setStage("preview");
                    }}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}
