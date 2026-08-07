"use client";

/**
 * Related-subject selector for Current Work (Command Surface subject_selector).
 *
 * Used when a family-context command (e.g. Move to Waitlist) must resolve an
 * enrollment child before execute. Exactly one eligible child auto-continues;
 * multiple require an explicit choice; zero shows an operator-safe block.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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

export default function CurrentWorkSubjectSelectorPanel({
    action,
    opportunityId,
    onClose,
    onComplete,
}: Props) {
    const [load, setLoad] = useState<LoadState>({ phase: "loading" });
    const [selectedId, setSelectedId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const autoRan = useRef(false);
    const commandKey = (action.handlerKey ?? action.key).trim() || "waitlist_child";

    const executeForChild = useCallback(
        async (ocmId: string) => {
            setBusy(true);
            setError(null);
            try {
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
                dispatchOpportunityDrawerScopedUpdate(opportunityId, commandKey, [
                    "activity",
                    "header_actions",
                ]);
                onComplete();
            } catch (e) {
                setBusy(false);
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
                            || "Add a child to this family before moving them to Waitlist.",
                    });
                    return;
                }
                setLoad({ phase: "ready", subjects });
                if (subjects.length === 1) {
                    setSelectedId(subjects[0]!.id);
                }
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

    useEffect(() => {
        if (load.phase !== "ready" || load.subjects.length !== 1 || autoRan.current) return;
        autoRan.current = true;
        void executeForChild(load.subjects[0]!.id);
    }, [executeForChild, load]);

    if (load.phase === "loading" || (load.phase === "ready" && load.subjects.length === 1 && busy)) {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body"
                data-work-action-panel-state="resolving-subject"
            >
                <p className="alloy-os-household__row-detail">Preparing {action.label}…</p>
            </div>
        );
    }

    if (load.phase === "none" || load.phase === "error") {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body"
                data-work-action-panel-state="subject-blocked"
            >
                <p className="alloy-os-household__row-detail">{load.message}</p>
                <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-alloy-pine"
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
        );
    }

    const subjects = load.subjects;

    return (
        <div
            className="alloy-os-currentwork__action-panel-body space-y-3"
            data-work-action-panel-state="subject-selector"
            data-testid="current-work-subject-selector"
        >
            <p className="text-sm text-alloy-midnight/70">
                This family has more than one child. Choose which child to move to Waitlist.
            </p>
            <fieldset className="space-y-2" disabled={busy}>
                <legend className="sr-only">Choose a child</legend>
                {subjects.map((child) => (
                    <label
                        key={child.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-alloy-stone/20 px-3 py-2 text-sm text-alloy-midnight hover:border-alloy-pine/40"
                        data-testid={`current-work-subject-option-${child.id}`}
                    >
                        <input
                            type="radio"
                            name="enrollment-child-subject"
                            value={child.id}
                            checked={selectedId === child.id}
                            onChange={() => setSelectedId(child.id)}
                        />
                        <span>{child.label}</span>
                    </label>
                ))}
            </fieldset>
            {error ?
                <p className="text-sm text-red-700" role="alert">
                    {error}
                </p>
            :   null}
            <div className="flex items-center justify-end gap-2 pt-1">
                <button
                    type="button"
                    className="text-sm font-semibold text-alloy-midnight/60"
                    onClick={onClose}
                    disabled={busy}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="rounded-lg bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || !selectedId.trim()}
                    data-testid="current-work-subject-selector-continue"
                    onClick={() => void executeForChild(selectedId.trim())}
                >
                    {busy ? "Working…" : action.label}
                </button>
            </div>
        </div>
    );
}
