"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    allowedPatternWeekdays,
    createTimeWindow,
    readLocationSchedulingConfig,
    renameScheduleTypeLabel,
    resolveEnabledDayTypes,
    writeLocationSchedulingConfig,
    type DayTypeOption,
    type LocationScheduleTypeConfig,
    type LocationSchedulingConfig,
    type LocationTimeWindow,
    type ScheduleRecurrenceBehavior,
} from "@/lib/locations/locationSchedulingConfig";

export type SchedulingSubNav =
    | "patterns"
    | "day_types"
    | "schedule_types"
    | "hours"
    | "operating_days";

type OrgDayTypeRow = DayTypeOption & {
    id: string;
    sortOrder: number;
    archived: boolean;
    metadata: Record<string, unknown>;
};

type DayTypesCacheEntry = {
    loadedAt: number;
    items: OrgDayTypeRow[];
};

/** Module-scoped retain — Location Scheduling sub-tabs must not cold-fetch independently. */
const dayTypesCacheByOrg = new Map<string, DayTypesCacheEntry>();

function mapOptionItems(
    items: Array<{
        id?: string;
        item_key?: string;
        value?: string;
        label?: string;
        sort_order?: number;
        metadata?: Record<string, unknown> | null;
    }>,
): OrgDayTypeRow[] {
    return items
        .map((item, index) => {
            const key = String(item.item_key ?? item.value ?? "").trim();
            const label = String(item.label ?? key).trim();
            if (!key || !label) return null;
            const metadata =
                item.metadata != null && typeof item.metadata === "object" && !Array.isArray(item.metadata) ?
                    item.metadata
                :   {};
            const archived = metadata.archived === true || metadata.status === "archived";
            return {
                id: String(item.id ?? "").trim() || key,
                key,
                label,
                isActive: !archived,
                archived,
                sortOrder: Number(item.sort_order) || (index + 1) * 10,
                metadata,
            } satisfies OrgDayTypeRow;
        })
        .filter((row): row is OrgDayTypeRow => row != null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

async function fetchOrgDayTypes(): Promise<OrgDayTypeRow[]> {
    const res = await fetch("/api/admin/option-sets/childcare_schedule_type", {
        credentials: "include",
        cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
        items?: Array<{
            id?: string;
            item_key?: string;
            value?: string;
            label?: string;
            sort_order?: number;
            metadata?: Record<string, unknown> | null;
        }>;
    };
    if (!res.ok) throw new Error("Day Types could not be loaded.");
    return mapOptionItems(json.items ?? []);
}

/** Prefetch Day Types when a Location is selected so Scheduling sub-tabs stay instant. */
export function warmLocationSchedulingDayTypes(orgId: string): void {
    const key = String(orgId ?? "").trim();
    if (!key || dayTypesCacheByOrg.has(key)) return;
    void fetchOrgDayTypes()
        .then((items) => {
            dayTypesCacheByOrg.set(key, { loadedAt: Date.now(), items });
        })
        .catch(() => undefined);
}

function dayTypeKeyFromLabel(label: string): string {
    return (
        label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 48) || "day_type"
    );
}

/**
 * Single Scheduling VM for a Location — one retained owner for Patterns' sibling vocabularies.
 * Sub-pages consume this state; they do not fetch independently.
 */
export function useLocationSchedulingVm(input: {
    orgId: string;
    locationId: string;
    locationMetadata: Record<string, unknown> | null | undefined;
    onSaveMetadata: (metadata: Record<string, unknown>) => Promise<void>;
}) {
    const { orgId, locationId, locationMetadata, onSaveMetadata } = input;
    const [subNav, setSubNav] = useState<SchedulingSubNav>("patterns");
    const [config, setConfig] = useState<LocationSchedulingConfig>(() =>
        readLocationSchedulingConfig(locationMetadata),
    );
    const [orgDayTypes, setOrgDayTypes] = useState<OrgDayTypeRow[]>(() =>
        orgId ? (dayTypesCacheByOrg.get(orgId)?.items ?? []) : [],
    );
    const [dayTypesReady, setDayTypesReady] = useState(() =>
        orgId ? dayTypesCacheByOrg.has(orgId) : false,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedDayTypeKey, setSelectedDayTypeKey] = useState<string | null>(null);
    const [selectedScheduleTypeId, setSelectedScheduleTypeId] = useState<string | null>(null);
    const [selectedTimeWindowId, setSelectedTimeWindowId] = useState<string | null>(null);
    const loadSeq = useRef(0);

    useEffect(() => {
        setConfig(readLocationSchedulingConfig(locationMetadata));
    }, [locationId, locationMetadata]);

    useEffect(() => {
        if (!orgId) return;
        const cached = dayTypesCacheByOrg.get(orgId);
        if (cached) {
            setOrgDayTypes(cached.items);
            setDayTypesReady(true);
            return;
        }
        const seq = ++loadSeq.current;
        void (async () => {
            try {
                const items = await fetchOrgDayTypes();
                if (seq !== loadSeq.current) return;
                dayTypesCacheByOrg.set(orgId, { loadedAt: Date.now(), items });
                setOrgDayTypes(items);
                setDayTypesReady(true);
            } catch (cause) {
                if (seq !== loadSeq.current) return;
                setError(cause instanceof Error ? cause.message : "Day Types could not be loaded.");
                setDayTypesReady(true);
            }
        })();
    }, [orgId]);

    const enabledDayTypes = useMemo(
        () => resolveEnabledDayTypes(orgDayTypes, config.enabledDayTypeKeys),
        [orgDayTypes, config.enabledDayTypeKeys],
    );

    const persistConfig = useCallback(
        async (next: LocationSchedulingConfig) => {
            setSaving(true);
            setError(null);
            try {
                const metadata = writeLocationSchedulingConfig(locationMetadata, next);
                await onSaveMetadata(metadata);
                setConfig(next);
            } catch (cause) {
                setError(
                    cause instanceof Error ? cause.message : "Could not save Scheduling configuration.",
                );
                throw cause;
            } finally {
                setSaving(false);
            }
        },
        [locationMetadata, onSaveMetadata],
    );

    const refreshDayTypes = useCallback(async () => {
        if (!orgId) return;
        const items = await fetchOrgDayTypes();
        dayTypesCacheByOrg.set(orgId, { loadedAt: Date.now(), items });
        setOrgDayTypes(items);
        setDayTypesReady(true);
    }, [orgId]);

    const createDayType = useCallback(
        async (label: string) => {
            const trimmed = label.trim();
            if (!trimmed) throw new Error("Enter a Day Type name.");
            const item_key = dayTypeKeyFromLabel(trimmed);
            const res = await fetch("/api/admin/option-sets/childcare_schedule_type/items", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    item_key,
                    label: trimmed,
                    sort_order: (orgDayTypes.at(-1)?.sortOrder ?? 0) + 10,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Day Type could not be created.");
            await refreshDayTypes();
            setSelectedDayTypeKey(item_key);
        },
        [orgDayTypes, refreshDayTypes],
    );

    const renameDayType = useCallback(
        async (itemId: string, label: string) => {
            const trimmed = label.trim();
            if (!trimmed) throw new Error("Enter a Day Type name.");
            const res = await fetch(
                `/api/admin/option-sets/childcare_schedule_type/items/${encodeURIComponent(itemId)}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label: trimmed }),
                },
            );
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Day Type could not be renamed.");
            await refreshDayTypes();
        },
        [refreshDayTypes],
    );

    const archiveDayType = useCallback(
        async (itemId: string, archived: boolean) => {
            const current = orgDayTypes.find((row) => row.id === itemId);
            const res = await fetch(
                `/api/admin/option-sets/childcare_schedule_type/items/${encodeURIComponent(itemId)}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        metadata: { ...(current?.metadata ?? {}), archived },
                    }),
                },
            );
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                throw new Error(
                    json.error ??
                        (archived ? "Day Type could not be archived." : "Day Type could not be restored."),
                );
            }
            // Location enablement: drop archived keys from enable list when present.
            if (archived && current && config.enabledDayTypeKeys.includes(current.key)) {
                await persistConfig({
                    ...config,
                    enabledDayTypeKeys: config.enabledDayTypeKeys.filter((key) => key !== current.key),
                });
            }
            await refreshDayTypes();
        },
        [config, orgDayTypes, persistConfig, refreshDayTypes],
    );

    const reorderDayType = useCallback(
        async (itemId: string, direction: -1 | 1) => {
            const ordered = [...orgDayTypes].sort((a, b) => a.sortOrder - b.sortOrder);
            const index = ordered.findIndex((row) => row.id === itemId);
            const swapWith = index + direction;
            if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;
            const a = ordered[index]!;
            const b = ordered[swapWith]!;
            await Promise.all([
                fetch(`/api/admin/option-sets/childcare_schedule_type/items/${encodeURIComponent(a.id)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sort_order: b.sortOrder }),
                }),
                fetch(`/api/admin/option-sets/childcare_schedule_type/items/${encodeURIComponent(b.id)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sort_order: a.sortOrder }),
                }),
            ]);
            await refreshDayTypes();
        },
        [orgDayTypes, refreshDayTypes],
    );

    const setLocationDayTypeEnabled = useCallback(
        async (key: string, enabled: boolean) => {
            const allKeys = orgDayTypes.filter((row) => row.isActive).map((row) => row.key);
            let nextKeys: string[];
            if (config.enabledDayTypeKeys.length === 0) {
                nextKeys = enabled ? allKeys : allKeys.filter((entry) => entry !== key);
            } else if (enabled) {
                nextKeys = [...new Set([...config.enabledDayTypeKeys, key])];
            } else {
                nextKeys = config.enabledDayTypeKeys.filter((entry) => entry !== key);
            }
            await persistConfig({ ...config, enabledDayTypeKeys: nextKeys });
        },
        [config, orgDayTypes, persistConfig],
    );

    const updateScheduleTypeLabel = useCallback(
        async (id: string, label: string) => {
            await persistConfig({
                ...config,
                scheduleTypes: renameScheduleTypeLabel(config.scheduleTypes, id, label),
            });
        },
        [config, persistConfig],
    );

    const addScheduleType = useCallback(
        async (label: string, behavior: ScheduleRecurrenceBehavior) => {
            const trimmed = label.trim();
            if (!trimmed) throw new Error("Enter a Schedule Type name.");
            const id = `st_${behavior}_${Date.now().toString(36)}`;
            const next: LocationScheduleTypeConfig = {
                id,
                key: `${behavior}_${Date.now().toString(36)}`,
                label: trimmed,
                behavior,
                description:
                    behavior === "rotating" ?
                        "A repeating cycle of weekly day/hour definitions."
                    :   "The same scheduled days and hours each week.",
                isActive: true,
                sortOrder: (config.scheduleTypes.at(-1)?.sortOrder ?? 0) + 10,
            };
            await persistConfig({
                ...config,
                scheduleTypes: [...config.scheduleTypes, next],
            });
            setSelectedScheduleTypeId(id);
        },
        [config, persistConfig],
    );

    const archiveScheduleType = useCallback(
        async (id: string, archived: boolean) => {
            await persistConfig({
                ...config,
                scheduleTypes: config.scheduleTypes.map((row) =>
                    row.id === id ? { ...row, isActive: !archived } : row,
                ),
            });
        },
        [config, persistConfig],
    );

    const addTimeWindow = useCallback(
        async (inputWindow: { label: string; startTime: string; endTime: string }) => {
            if (inputWindow.endTime <= inputWindow.startTime) {
                throw new Error("End time must be after start time.");
            }
            const created = createTimeWindow(inputWindow);
            await persistConfig({
                ...config,
                timeWindows: [...config.timeWindows, created],
            });
            setSelectedTimeWindowId(created.id);
        },
        [config, persistConfig],
    );

    const updateTimeWindow = useCallback(
        async (id: string, patch: Partial<LocationTimeWindow>) => {
            if (
                patch.startTime &&
                patch.endTime &&
                patch.endTime <= patch.startTime
            ) {
                throw new Error("End time must be after start time.");
            }
            await persistConfig({
                ...config,
                timeWindows: config.timeWindows.map((row) => {
                    if (row.id !== id) return row;
                    const next = { ...row, ...patch };
                    if (next.endTime <= next.startTime) {
                        throw new Error("End time must be after start time.");
                    }
                    return next;
                }),
            });
        },
        [config, persistConfig],
    );

    const archiveTimeWindow = useCallback(
        async (id: string, archived: boolean) => {
            await persistConfig({
                ...config,
                timeWindows: config.timeWindows.map((row) =>
                    row.id === id ? { ...row, isActive: !archived } : row,
                ),
            });
        },
        [config, persistConfig],
    );

    const setOperatingDays = useCallback(
        async (days: number[]) => {
            await persistConfig({ ...config, operatingDays: days });
        },
        [config, persistConfig],
    );

    return {
        subNav,
        setSubNav,
        config,
        orgDayTypes,
        enabledDayTypes,
        dayTypesReady,
        saving,
        error,
        setError,
        selectedDayTypeKey,
        setSelectedDayTypeKey,
        selectedScheduleTypeId,
        setSelectedScheduleTypeId,
        selectedTimeWindowId,
        setSelectedTimeWindowId,
        allowedWeekdays: allowedPatternWeekdays(config.operatingDays),
        persistConfig,
        createDayType,
        renameDayType,
        archiveDayType,
        reorderDayType,
        setLocationDayTypeEnabled,
        updateScheduleTypeLabel,
        addScheduleType,
        archiveScheduleType,
        addTimeWindow,
        updateTimeWindow,
        archiveTimeWindow,
        setOperatingDays,
    };
}

export type LocationSchedulingVm = ReturnType<typeof useLocationSchedulingVm>;
