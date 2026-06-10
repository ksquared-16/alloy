"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import VmReadonlyStatusPill from "@/components/admin/vmDrawer/VmReadonlyStatusPill";
import type { StatusControlVm, StatusMenuItemVm, StatusOptionVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { PersonStatusProfileKey } from "@/lib/admin/person/personStatusApplicability";
import {
    mapStatusDropdownOptions,
    type StatusDropdownOptionRow,
} from "@/lib/admin/statusDropdownPresentation";

type StatusDefRow = StatusDropdownOptionRow;

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

const TRIGGER_CLASS =
    "flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-alloy-stone/15 bg-white px-3 py-2 text-[12px] font-semibold leading-tight text-alloy-midnight/90 shadow-[0_4px_14px_rgba(39,63,82,0.08)] ring-1 ring-alloy-stone/10 transition-[border-color,box-shadow,background-color] hover:border-alloy-stone/25 hover:bg-alloy-stone/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue/20 disabled:cursor-not-allowed disabled:opacity-60";

const MENU_CLASS =
    "absolute right-0 top-[calc(100%+6px)] z-[120] min-w-full max-h-[min(16rem,60vh)] overflow-y-auto rounded-xl border border-alloy-stone/15 bg-white py-1.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.18)] ring-1 ring-alloy-stone/10";

function optionsFromVmStatus(status: StatusControlVm | null | undefined): StatusOptionVm[] | null {
    if (!status || status.renderAs === "hidden") return null;
    if (status.renderAs === "dropdown" && status.options?.length) return status.options;
    if (status.renderAs === "readonly_pill" && status.options?.length) return status.options;
    return null;
}

function mapFetchedOptions(rows: StatusDefRow[]): StatusOptionVm[] {
    return mapStatusDropdownOptions(rows);
}

function statusOptionsFetchUrl(entityKind: EntityKind, statusProfile?: PersonStatusProfileKey | null): string {
    const base = `/api/admin/status-options?entity_type=${encodeURIComponent(entityKind)}`;
    if (entityKind === "persons" && statusProfile) {
        return `${base}&status_profile=${encodeURIComponent(statusProfile)}`;
    }
    return base;
}

function ProgressiveMenuRow({
    item,
    selectedKey,
    onSelect,
}: {
    item: StatusMenuItemVm;
    selectedKey: string;
    onSelect: (statusKey: string) => void;
}) {
    if (item.kind === "separator") {
        return (
            <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45"
                role="presentation"
                data-testid="status-menu-move-to-stage-separator"
            >
                {item.label}
            </div>
        );
    }
    if (item.kind === "stage_heading") {
        return (
            <div
                className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-alloy-midnight/55"
                role="presentation"
                data-testid={`status-menu-stage-heading-${item.stage_key}`}
            >
                {item.label}
            </div>
        );
    }
    const selected = item.status_key === selectedKey;
    return (
        <button
            type="button"
            role="menuitem"
            className={menuItemClass(selected)}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(item.status_key)}
        >
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden>
                {selected ? <Check className="h-3.5 w-3.5 text-alloy-juniper" /> : null}
            </span>
            <span className="truncate">{item.label}</span>
        </button>
    );
}

function menuItemClass(selected: boolean): string {
    return [
        "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium leading-snug transition-colors",
        selected ?
            "bg-alloy-juniper/[0.07] text-alloy-midnight"
        :   "text-alloy-midnight/88 hover:bg-alloy-stone/[0.06]",
    ].join(" ");
}

/**
 * Drawer header status — Alloy menu on first click; immediate PATCH on selection.
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
    const [menuOpen, setMenuOpen] = useState(false);
    const shellRef = useRef<HTMLDivElement>(null);
    const menuId = useMemo(
        () => `drawer-status-menu-${entityKind}-${entityId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
        [entityId, entityKind]
    );

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

    useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (shellRef.current?.contains(t)) return;
            setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen]);

    const progressiveMenu = statusControl?.renderAs === "dropdown" ? statusControl.progressive_menu : undefined;
    const editableOptions = options ?? [];
    const showMenu = canMutate && editableOptions.length >= 2;
    const showSkeleton = canMutate && optionsLoading && editableOptions.length < 2;

    useEffect(() => {
        onDebugModeChange?.(showMenu ? "vm-dropdown" : "vm-readonly-pill");
    }, [onDebugModeChange, showMenu]);

    const onStatusChange = useCallback(
        async (nextKey: string) => {
            if (!canMutate || !nextKey.trim() || nextKey === statusKey) {
                setMenuOpen(false);
                return;
            }
            setSaving(true);
            setFetchError(null);
            setMenuOpen(false);
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

    const shellClass = "relative flex min-w-0 max-w-[11rem] shrink-0 flex-col gap-0.5 sm:max-w-[15rem]";

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
                    className="h-9 w-full skeleton-pulse rounded-xl border border-alloy-stone/20 bg-alloy-stone/8"
                    aria-hidden
                    data-person-status-skeleton="true"
                />
            </div>
        );
    }

    if (showMenu) {
        const key = statusKey.trim();
        return (
            <div
                ref={shellRef}
                className={shellClass}
                data-vm-drawer-header-status="menu"
                data-vm-progressive-status="dropdown"
                data-vm-status-dropdown-affordance="menu"
                data-status-debug-owner="vm-dropdown"
                data-record-drawer-header-status="menu"
                {...rootDataProps}
            >
                <span className="sr-only">{entityLabel} status</span>
                <button
                    type="button"
                    className={TRIGGER_CLASS}
                    disabled={!canMutate || saving}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-controls={menuId}
                    aria-busy={saving}
                    aria-label={`${entityLabel} status: ${resolvedLabel}`}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    <span className="min-w-0 truncate">{resolvedLabel}</span>
                    <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-alloy-midnight/45 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                        aria-hidden
                    />
                </button>
                {menuOpen ?
                    <div id={menuId} role="menu" aria-label={`${entityLabel} status options`} className={MENU_CLASS}>
                        {key && !editableOptions.some((o) => o.status_key === key) ?
                            <button
                                type="button"
                                role="menuitem"
                                className={menuItemClass(true)}
                                onClick={() => void onStatusChange(key)}
                            >
                                <Check className="h-3.5 w-3.5 shrink-0 text-alloy-juniper" aria-hidden />
                                <span className="truncate">{resolvedLabel}</span>
                            </button>
                        :   null}
                        {progressiveMenu?.length
                            ? progressiveMenu.map((item, idx) => (
                                  <ProgressiveMenuRow
                                      key={`${item.kind}-${idx}`}
                                      item={item}
                                      selectedKey={key}
                                      onSelect={(statusKey) => void onStatusChange(statusKey)}
                                  />
                              ))
                            : editableOptions.map((o) => {
                                  const selected = o.status_key === key;
                                  return (
                                      <button
                                          key={o.status_key}
                                          type="button"
                                          role="menuitem"
                                          className={menuItemClass(selected)}
                                          aria-current={selected ? "true" : undefined}
                                          onClick={() => void onStatusChange(o.status_key)}
                                      >
                                          <span
                                              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                                              aria-hidden
                                          >
                                              {selected ?
                                                  <Check className="h-3.5 w-3.5 text-alloy-juniper" />
                                              :   null}
                                          </span>
                                          <span className="truncate">{o.label}</span>
                                      </button>
                                  );
                              })}
                    </div>
                :   null}
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
