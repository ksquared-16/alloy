"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import VmReadonlyStatusPill from "@/components/admin/vmDrawer/VmReadonlyStatusPill";
import type { StatusControlVm, StatusOptionVm } from "@/lib/adminV2/viewModel/drawer/types";
type StatusDefRow = {
    value?: string;
    status_key?: string;
    label?: string;
    status_label?: string | null;
    sort_order?: number;
    is_active?: boolean;
};

type Props = {
    opportunityId: string;
    /** First-paint label — frozen until user picks a new status. */
    firstPaintLabel: string;
    currentStatusKey: string;
    statusControl: StatusControlVm | null | undefined;
    canMutate: boolean;
    onDebugModeChange?: (mode: "vm-readonly-pill" | "vm-dropdown") => void;
};

function optionsFromStatusControl(status: StatusControlVm): StatusOptionVm[] | null {
    if (status.renderAs !== "dropdown" || !status.options?.length) return null;
    return status.options;
}

function mapFetchedOptions(rows: StatusDefRow[]): StatusOptionVm[] {
    return rows
        .filter((r) => r.is_active !== false)
        .map((r) => {
            const status_key = (r.status_key ?? r.value ?? "").trim();
            const label =
                (r.status_label ?? r.label ?? status_key).trim() || status_key;
            return {
                status_key,
                label,
                sort_order: r.sort_order ?? 0,
            };
        })
        .sort((a, b) =>
            a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.label.localeCompare(b.label)
        );
}

/**
 * Progressive opportunity status — readonly pill on first paint; dropdown after explicit interaction.
 */
export default function VmProgressiveStatusDropdown({
    opportunityId,
    firstPaintLabel,
    currentStatusKey,
    statusControl,
    canMutate,
    onDebugModeChange,
}: Props) {
    const [mode, setMode] = useState<"pill" | "loading" | "dropdown">("pill");
    const [options, setOptions] = useState<StatusOptionVm[] | null>(null);
    const [statusKey, setStatusKey] = useState(currentStatusKey);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const firstPaintLabelRef = useRef(firstPaintLabel);
    const selectRef = useRef<HTMLSelectElement | null>(null);

    useEffect(() => {
        firstPaintLabelRef.current = firstPaintLabel;
    }, [firstPaintLabel]);

    useEffect(() => {
        setStatusKey(currentStatusKey);
    }, [currentStatusKey, opportunityId]);

    useEffect(() => {
        onDebugModeChange?.(mode === "dropdown" ? "vm-dropdown" : "vm-readonly-pill");
    }, [mode, onDebugModeChange]);

    const activateDropdown = useCallback(async () => {
        if (!canMutate || mode === "dropdown" || mode === "loading") return;

        const embedded = statusControl ? optionsFromStatusControl(statusControl) : null;
        if (embedded?.length) {
            setOptions(embedded);
            setMode("dropdown");
            return;
        }

        setMode("loading");
        setFetchError(null);
        try {
            const res = await fetch("/api/admin/status-options?entity_type=opportunities");
            const json = (await res.json().catch(() => ({}))) as {
                options?: StatusDefRow[];
                error?: string;
            };
            if (!res.ok) {
                throw new Error(json.error ?? "Failed to load status options");
            }
            const mapped = mapFetchedOptions(json.options ?? []);
            if (mapped.length < 2) {
                setMode("pill");
                return;
            }
            setOptions(mapped);
            setMode("dropdown");
        } catch (e) {
            setFetchError(e instanceof Error ? e.message : "Failed to load status options");
            setMode("pill");
        }
    }, [canMutate, mode, statusControl]);

    useEffect(() => {
        if (mode === "dropdown") {
            selectRef.current?.focus();
        }
    }, [mode]);

    const onStatusChange = useCallback(
        async (nextKey: string) => {
            if (!canMutate || !nextKey.trim() || nextKey === statusKey) return;
            setSaving(true);
            setFetchError(null);
            try {
                const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status_key: nextKey }),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Save failed");
                setStatusKey(nextKey);
                window.dispatchEvent(
                    new CustomEvent("admin-entity-saved", {
                        detail: { type: "opportunities", id: opportunityId },
                    })
                );
            } catch (e) {
                setFetchError(e instanceof Error ? e.message : "Save failed");
            } finally {
                setSaving(false);
            }
        },
        [canMutate, opportunityId, statusKey]
    );

    const displayLabel =
        mode === "dropdown" && options?.length ?
            (options.find((o) => o.status_key === statusKey)?.label ?? firstPaintLabelRef.current)
        :   firstPaintLabelRef.current;

    const shellClass =
        "flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[15rem]";

    if (mode === "dropdown" && options && options.length >= 2) {
        const key = statusKey.trim();
        return (
            <div
                className={shellClass}
                data-opportunity-drawer-vm-status-control="true"
                data-vm-progressive-status="dropdown"
                data-status-debug-owner="vm-dropdown"
            >
                <span className="sr-only">Opportunity status</span>
                <select
                    ref={selectRef}
                    value={key}
                    disabled={!canMutate || saving}
                    onChange={(e) => void onStatusChange(e.target.value)}
                    className="w-full min-w-0 rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90 shadow-md shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 disabled:opacity-60"
                    aria-label="Opportunity status"
                    aria-busy={saving}
                >
                    {key && !options.some((o) => o.status_key === key) ?
                        <option value={key}>{displayLabel}</option>
                    :   null}
                    {options.map((o) => (
                        <option key={o.status_key} value={o.status_key}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {fetchError ?
                    <span className="text-[10px] text-alloy-ember" role="status">
                        {fetchError}
                    </span>
                :   null}
            </div>
        );
    }

    const pending = mode === "loading";
    const interactive = canMutate;

    return (
        <div
            className={shellClass}
            data-opportunity-drawer-vm-status-control="true"
            data-vm-progressive-status="pill"
            data-status-debug-owner="vm-readonly-pill"
        >
            {interactive ?
                <button
                    type="button"
                    onClick={() => void activateDropdown()}
                    onFocus={() => void activateDropdown()}
                    disabled={pending || saving}
                    className={clsx(
                        "inline-flex rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90",
                        "shadow-md shadow-alloy-stone/10 ring-1 ring-alloy-stone/10",
                        "hover:border-alloy-blue/35 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20",
                        pending && "opacity-80"
                    )}
                    aria-label={`Opportunity status: ${displayLabel}. Activate to change.`}
                    aria-busy={pending}
                >
                    {displayLabel || "—"}
                </button>
            :   <VmReadonlyStatusPill label={displayLabel} entityLabel="Opportunity status" />}
            {fetchError ?
                <span className="text-[10px] text-alloy-ember" role="status">
                    {fetchError}
                </span>
            :   null}
        </div>
    );
}
