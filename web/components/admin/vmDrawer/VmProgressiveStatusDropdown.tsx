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

type VmStatusActive = "readonly" | "loading" | "dropdown" | "error";
type VmStatusOptionsSource = "vm" | "fetch" | "none";
type VmStatusLastInteraction = "none" | "click" | "focus";

type Props = {
    opportunityId: string;
    /** First-paint label — frozen until user picks a new status. */
    firstPaintLabel: string;
    currentStatusKey: string;
    statusControl: StatusControlVm | null | undefined;
    canMutate: boolean;
    onDebugModeChange?: (mode: "vm-readonly-pill" | "vm-dropdown") => void;
};

function optionsFromVmStatus(status: StatusControlVm | null | undefined): StatusOptionVm[] | null {
    if (!status || status.renderAs === "hidden") return null;
    if (status.renderAs === "dropdown" && status.options?.length) return status.options;
    if (status.renderAs === "readonly_pill" && status.options?.length) return status.options;
    return null;
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

function resolveCanMutateReason(canMutate: boolean): string | null {
    if (canMutate) return null;
    return "admin-auth-canMutate-false";
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
    const [active, setActive] = useState<VmStatusActive>("readonly");
    const [options, setOptions] = useState<StatusOptionVm[] | null>(null);
    const [optionsSource, setOptionsSource] = useState<VmStatusOptionsSource>("none");
    const [lastInteraction, setLastInteraction] = useState<VmStatusLastInteraction>("none");
    const [statusKey, setStatusKey] = useState(currentStatusKey);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const firstPaintLabelRef = useRef(firstPaintLabel);
    const selectRef = useRef<HTMLSelectElement | null>(null);

    const canMutateReason = resolveCanMutateReason(canMutate);
    const embeddedOptions = optionsFromVmStatus(statusControl);
    const hasVmOptions = (embeddedOptions?.length ?? 0) >= 2;

    useEffect(() => {
        firstPaintLabelRef.current = firstPaintLabel;
    }, [firstPaintLabel]);

    useEffect(() => {
        setStatusKey(currentStatusKey);
    }, [currentStatusKey, opportunityId]);

    useEffect(() => {
        onDebugModeChange?.(active === "dropdown" ? "vm-dropdown" : "vm-readonly-pill");
    }, [active, onDebugModeChange]);

    const statusDebugAttrs = {
        "data-vm-status-progressive-mounted": "true",
        "data-vm-status-can-mutate": canMutate ? "true" : "false",
        ...(canMutateReason ? { "data-vm-status-can-mutate-reason": canMutateReason } : {}),
        "data-vm-status-options-source": optionsSource,
        "data-vm-status-active": active,
        "data-vm-status-last-interaction": lastInteraction,
    } as const;

    const activateDropdown = useCallback(
        async (interaction: VmStatusLastInteraction) => {
            setLastInteraction(interaction);

            if (!canMutate) {
                setActive("readonly");
                setOptionsSource(hasVmOptions ? "vm" : "none");
                return;
            }

            if (active === "dropdown" || active === "loading") return;

            if (embeddedOptions && embeddedOptions.length >= 2) {
                setOptions(embeddedOptions);
                setOptionsSource("vm");
                setActive("dropdown");
                return;
            }

            setActive("loading");
            setOptionsSource("fetch");
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
                    setOptionsSource(mapped.length > 0 ? "fetch" : "none");
                    setActive("readonly");
                    return;
                }
                setOptions(mapped);
                setOptionsSource("fetch");
                setActive("dropdown");
            } catch (e) {
                setFetchError(e instanceof Error ? e.message : "Failed to load status options");
                setOptionsSource("none");
                setActive("error");
            }
        },
        [active, canMutate, embeddedOptions, hasVmOptions]
    );

    useEffect(() => {
        if (active === "dropdown") {
            selectRef.current?.focus();
        }
    }, [active]);

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
                setActive("error");
            } finally {
                setSaving(false);
            }
        },
        [canMutate, opportunityId, statusKey]
    );

    const displayLabel =
        active === "dropdown" && options?.length ?
            (options.find((o) => o.status_key === statusKey)?.label ?? firstPaintLabelRef.current)
        :   firstPaintLabelRef.current;

    const shellClass =
        "flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[15rem]";

    if (active === "dropdown" && options && options.length >= 2) {
        const key = statusKey.trim();
        return (
            <div
                className={shellClass}
                data-opportunity-drawer-vm-status-control="true"
                data-vm-progressive-status="dropdown"
                data-status-debug-owner="vm-dropdown"
                {...statusDebugAttrs}
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

    const pending = active === "loading";
    const interactive = canMutate;

    if (!interactive) {
        return (
            <div
                className={shellClass}
                data-opportunity-drawer-vm-status-control="true"
                data-vm-progressive-status="pill"
                data-status-debug-owner="vm-readonly-pill"
                {...statusDebugAttrs}
            >
                <VmReadonlyStatusPill label={displayLabel} entityLabel="Opportunity status" />
                {fetchError ?
                    <span className="text-[10px] text-alloy-ember" role="status">
                        {fetchError}
                    </span>
                :   null}
            </div>
        );
    }

    return (
        <div
            className={shellClass}
            data-opportunity-drawer-vm-status-control="true"
            data-vm-progressive-status="pill"
            data-status-debug-owner="vm-readonly-pill"
            {...statusDebugAttrs}
        >
            <button
                type="button"
                onClick={() => void activateDropdown("click")}
                onFocus={() => void activateDropdown("focus")}
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
            {fetchError ?
                <span className="text-[10px] text-alloy-ember" role="status">
                    {fetchError}
                </span>
            :   null}
        </div>
    );
}
