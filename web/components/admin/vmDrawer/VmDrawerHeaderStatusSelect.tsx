"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import VmReadonlyStatusPill from "@/components/admin/vmDrawer/VmReadonlyStatusPill";
import type { StatusControlVm, StatusOptionVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { PersonStatusProfileKey } from "@/lib/admin/person/personStatusApplicability";

type StatusDefRow = {
    value?: string;
    status_key?: string;
    label?: string;
    status_label?: string | null;
    sort_order?: number;
    is_active?: boolean;
};

type EntityKind = "opportunities" | "persons";

type RootMarker =
    | "opportunity-drawer-vm-status-control"
    | "person-drawer-vm-status-control"
    | "person-drawer-child-header-status";

type Props = {
    entityKind: EntityKind;
    entityId: string;
    entityLabel: string;
    currentStatusKey: string;
    displayLabel: string;
    statusControl: StatusControlVm | null | undefined;
    canMutate: boolean;
    statusProfile?: PersonStatusProfileKey | null;
    rootMarker?: RootMarker;
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
            const label = (r.status_label ?? r.label ?? status_key).trim() || status_key;
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

function statusOptionsFetchUrl(entityKind: EntityKind, statusProfile?: PersonStatusProfileKey | null): string {
    const base = `/api/admin/status-options?entity_type=${encodeURIComponent(entityKind)}`;
    if (entityKind === "persons" && statusProfile) {
        return `${base}&status_profile=${encodeURIComponent(statusProfile)}`;
    }
    return base;
}

/**
 * Drawer header status — native select on first paint when editable; immediate PATCH on change.
 */
export default function VmDrawerHeaderStatusSelect({
    entityKind,
    entityId,
    entityLabel,
    currentStatusKey,
    displayLabel,
    statusControl,
    canMutate,
    statusProfile = null,
    rootMarker = entityKind === "opportunities" ? "opportunity-drawer-vm-status-control" : "person-drawer-vm-status-control",
    onDebugModeChange,
}: Props) {
    const embeddedOptions = useMemo(() => optionsFromVmStatus(statusControl), [statusControl]);
    const [options, setOptions] = useState<StatusOptionVm[] | null>(embeddedOptions);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [statusKey, setStatusKey] = useState(currentStatusKey);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setStatusKey(currentStatusKey);
    }, [currentStatusKey, entityId]);

    useEffect(() => {
        setOptions(embeddedOptions);
    }, [embeddedOptions, entityId]);

    useEffect(() => {
        if (!canMutate || (embeddedOptions?.length ?? 0) >= 2) {
            setOptionsLoading(false);
            return;
        }

        let cancelled = false;
        setOptionsLoading(true);
        setFetchError(null);

        void fetch(statusOptionsFetchUrl(entityKind, statusProfile))
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as {
                    options?: StatusDefRow[];
                    error?: string;
                };
                if (!res.ok) {
                    throw new Error(json.error ?? "Failed to load status options");
                }
                if (cancelled) return;
                setOptions(mapFetchedOptions(json.options ?? []));
            })
            .catch((e) => {
                if (cancelled) return;
                setFetchError(e instanceof Error ? e.message : "Failed to load status options");
                setOptions([]);
            })
            .finally(() => {
                if (!cancelled) setOptionsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [canMutate, embeddedOptions, entityId, entityKind, statusProfile]);

    const editableOptions = options ?? [];
    const showSelect = canMutate && editableOptions.length >= 2;
    const showSkeleton = canMutate && optionsLoading && editableOptions.length < 2;

    useEffect(() => {
        onDebugModeChange?.(showSelect ? "vm-dropdown" : "vm-readonly-pill");
    }, [onDebugModeChange, showSelect]);

    const onStatusChange = useCallback(
        async (nextKey: string) => {
            if (!canMutate || !nextKey.trim() || nextKey === statusKey) return;
            setSaving(true);
            setFetchError(null);
            try {
                const path =
                    entityKind === "opportunities" ?
                        `/api/admin/opportunities/${encodeURIComponent(entityId)}`
                    :   `/api/admin/persons/${encodeURIComponent(entityId)}`;
                const res = await fetch(path, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status_key: nextKey }),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Save failed");
                setStatusKey(nextKey);
                window.dispatchEvent(
                    new CustomEvent("admin-entity-saved", {
                        detail: { type: entityKind, id: entityId },
                    })
                );
            } catch (e) {
                setFetchError(e instanceof Error ? e.message : "Save failed");
            } finally {
                setSaving(false);
            }
        },
        [canMutate, entityId, entityKind, statusKey]
    );

    const shellClass = "flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[15rem]";
    const editableSelectShellClass =
        "relative w-full min-w-0 rounded-full border border-alloy-stone/30 bg-white shadow-md shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 focus-within:border-alloy-blue focus-within:ring-2 focus-within:ring-alloy-blue/20";
    const editableChevronClass =
        "pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-alloy-midnight/45";

    const resolvedLabel =
        editableOptions.find((o) => o.status_key === statusKey)?.label ??
        (displayLabel || "—");

    const rootDataProps =
        rootMarker === "opportunity-drawer-vm-status-control" ?
            { "data-opportunity-drawer-vm-status-control": "true" as const }
        : rootMarker === "person-drawer-child-header-status" ?
            { "data-person-drawer-child-header-status": "true" as const }
        :   { "data-person-drawer-vm-status-control": "true" as const };

    if (showSkeleton) {
        return (
            <div className={shellClass} data-vm-drawer-header-status="skeleton" data-record-drawer-header-status="skeleton">
                <span className="sr-only">{entityLabel} status</span>
                <div
                    className="h-9 w-full skeleton-pulse rounded-full border border-alloy-stone/20 bg-alloy-stone/8"
                    aria-hidden
                    data-person-status-skeleton="true"
                />
            </div>
        );
    }

    if (showSelect) {
        const key = statusKey.trim();
        return (
            <div
                className={shellClass}
                data-vm-drawer-header-status="select"
                data-vm-progressive-status="dropdown"
                data-vm-status-dropdown-affordance="select"
                data-status-debug-owner="vm-dropdown"
                data-record-drawer-header-status="select"
                {...rootDataProps}
            >
                <span className="sr-only">{entityLabel} status</span>
                <div className={editableSelectShellClass}>
                    <select
                        value={key}
                        disabled={!canMutate || saving}
                        onChange={(e) => void onStatusChange(e.target.value)}
                        className="w-full min-w-0 appearance-none rounded-full border-0 bg-transparent py-2 pl-3 pr-8 text-[12px] font-semibold text-alloy-midnight/90 focus:outline-none disabled:opacity-60"
                        aria-label={`${entityLabel} status`}
                        aria-busy={saving}
                    >
                        {key && !editableOptions.some((o) => o.status_key === key) ?
                            <option value={key}>{resolvedLabel}</option>
                        :   null}
                        {editableOptions.map((o) => (
                            <option key={o.status_key} value={o.status_key}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className={editableChevronClass} aria-hidden />
                </div>
                {fetchError ?
                    <span className="text-[10px] text-alloy-ember" role="status">
                        {fetchError}
                    </span>
                :   null}
            </div>
        );
    }

    if (statusControl?.renderAs === "hidden" && !resolvedLabel.trim()) {
        return null;
    }

    return (
        <div
            className={shellClass}
            data-vm-drawer-header-status="readonly"
            data-vm-progressive-status="pill"
            data-status-debug-owner="vm-readonly-pill"
            {...rootDataProps}
        >
            <VmReadonlyStatusPill label={resolvedLabel} entityLabel={`${entityLabel} status`} />
            {fetchError ?
                <span className="text-[10px] text-alloy-ember" role="status">
                    {fetchError}
                </span>
            :   null}
        </div>
    );
}
