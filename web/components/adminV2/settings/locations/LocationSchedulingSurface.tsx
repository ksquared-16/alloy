"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import {
    allowedPatternWeekdays,
    createTimeWindow,
    readLocationSchedulingConfig,
    renameScheduleTypeLabel,
    resolveEnabledDayTypes,
    writeLocationSchedulingConfig,
    type DayTypeOption,
    type LocationSchedulingConfig,
    type LocationTimeWindow,
} from "@/lib/locations/locationSchedulingConfig";
import { WEEKDAY_OPTIONS } from "@/lib/childcareOperational/fetchOperationalEnrollment";

export type SchedulingSubNav =
    | "overview"
    | "patterns"
    | "day_types"
    | "schedule_types"
    | "hours"
    | "operating_days";

const SUB_NAV: Array<{ key: SchedulingSubNav; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "patterns", label: "Patterns" },
    { key: "day_types", label: "Day Types" },
    { key: "schedule_types", label: "Schedule Types" },
    { key: "hours", label: "Hours" },
    { key: "operating_days", label: "Operating days" },
];

type Props = {
    locationId: string;
    locationMetadata: Record<string, unknown> | null | undefined;
    patternCount: number;
    canMutate: boolean;
    onSaveMetadata: (metadata: Record<string, unknown>) => Promise<void>;
    onAddPattern: () => void;
    patternsPanel: ReactNode;
};

export default function LocationSchedulingSurface({
    locationId,
    locationMetadata,
    patternCount,
    canMutate,
    onSaveMetadata,
    onAddPattern,
    patternsPanel,
}: Props) {
    const [subNav, setSubNav] = useState<SchedulingSubNav>("overview");
    const [config, setConfig] = useState<LocationSchedulingConfig>(() =>
        readLocationSchedulingConfig(locationMetadata),
    );
    const [dayTypes, setDayTypes] = useState<DayTypeOption[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [windowDraft, setWindowDraft] = useState({ label: "", startTime: "08:00", endTime: "17:00" });

    useEffect(() => {
        setConfig(readLocationSchedulingConfig(locationMetadata));
    }, [locationId, locationMetadata]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/admin/option-sets/childcare_schedule_type", {
                    credentials: "include",
                    cache: "no-store",
                });
                const json = (await res.json().catch(() => ({}))) as {
                    items?: Array<{ item_key?: string; value?: string; label?: string; is_active?: boolean }>;
                };
                if (cancelled || !res.ok) return;
                setDayTypes(
                    (json.items ?? [])
                        .map((item) => ({
                            key: String(item.item_key ?? item.value ?? "").trim(),
                            label: String(item.label ?? item.item_key ?? item.value ?? "").trim(),
                            isActive: item.is_active !== false,
                        }))
                        .filter((row) => row.key && row.label),
                );
            } catch {
                if (!cancelled) setDayTypes([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const enabledDayTypes = useMemo(
        () => resolveEnabledDayTypes(dayTypes, config.enabledDayTypeKeys),
        [dayTypes, config.enabledDayTypeKeys],
    );

    const persist = async (next: LocationSchedulingConfig) => {
        setSaving(true);
        setError(null);
        try {
            const metadata = writeLocationSchedulingConfig(locationMetadata, next);
            await onSaveMetadata(metadata);
            setConfig(next);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save Scheduling configuration.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="locations-scheduling">
            <div
                className="flex flex-wrap gap-1 border-b border-alloy-forge/10 pb-2"
                data-testid="locations-scheduling-subnav"
            >
                {SUB_NAV.map((item) => {
                    const active = item.key === subNav;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                                active ?
                                    "bg-alloy-bend-pine/[0.12] text-alloy-bend-pine"
                                :   "text-alloy-midnight/55 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight"
                            }`}
                            onClick={() => setSubNav(item.key)}
                            data-testid={`locations-scheduling-nav-${item.key}`}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            {subNav === "overview" ?
                <ConfigWorkspaceCard compact testId="locations-scheduling-overview">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Scheduling</h3>
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">
                        Compose operating days, Day Types, Schedule Types, Hours, and Patterns. Patterns
                        reference these parts — they do not invent them inline.
                    </p>
                    <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md border border-alloy-forge/10 bg-white px-3 py-2.5">
                            <dt className="config-typo-field-label">Patterns</dt>
                            <dd className="mt-1 text-lg font-semibold text-alloy-midnight">{patternCount}</dd>
                        </div>
                        <div className="rounded-md border border-alloy-forge/10 bg-white px-3 py-2.5">
                            <dt className="config-typo-field-label">Day Types</dt>
                            <dd className="mt-1 text-lg font-semibold text-alloy-midnight">
                                {enabledDayTypes.length || dayTypes.filter((d) => d.isActive).length}
                            </dd>
                        </div>
                        <div className="rounded-md border border-alloy-forge/10 bg-white px-3 py-2.5">
                            <dt className="config-typo-field-label">Schedule Types</dt>
                            <dd className="mt-1 text-lg font-semibold text-alloy-midnight">
                                {config.scheduleTypes.filter((row) => row.isActive).length}
                            </dd>
                        </div>
                        <div className="rounded-md border border-alloy-forge/10 bg-white px-3 py-2.5">
                            <dt className="config-typo-field-label">Time Windows</dt>
                            <dd className="mt-1 text-lg font-semibold text-alloy-midnight">
                                {config.timeWindows.filter((row) => row.isActive).length}
                            </dd>
                        </div>
                    </dl>
                    {canMutate ?
                        <div className="mt-4">
                            <ConfigurationPrimaryButton
                                className="px-2 py-1 text-[11px]"
                                onClick={() => {
                                    setSubNav("patterns");
                                    onAddPattern();
                                }}
                                data-testid="locations-scheduling-add-pattern"
                            >
                                Add Pattern
                            </ConfigurationPrimaryButton>
                        </div>
                    :   null}
                    <div className="mt-4 space-y-2">
                        {(
                            [
                                ["patterns", "Schedule Patterns", `${patternCount} configured`],
                                [
                                    "day_types",
                                    "Day Types",
                                    "Organization vocabulary · Location enablement",
                                ],
                                ["schedule_types", "Schedule Types", "continuous · rotating behaviors"],
                                ["hours", "Time Windows", "Named local hours"],
                                ["operating_days", "Operating days", "Days this Location may operate"],
                            ] as const
                        ).map(([key, title, subtitle]) => (
                            <button
                                key={key}
                                type="button"
                                className="flex w-full items-center justify-between rounded-md border border-alloy-forge/10 bg-white px-3 py-2 text-left hover:border-alloy-bend-pine/30"
                                onClick={() => setSubNav(key)}
                                data-testid={`locations-scheduling-jump-${key}`}
                            >
                                <span>
                                    <span className="block text-sm font-semibold text-alloy-midnight">{title}</span>
                                    <span className="block text-[12px] text-alloy-midnight/45">{subtitle}</span>
                                </span>
                                <span className="text-[12px] font-medium text-alloy-bend-pine">Open</span>
                            </button>
                        ))}
                    </div>
                </ConfigWorkspaceCard>
            :   null}

            {subNav === "patterns" ? patternsPanel : null}

            {subNav === "day_types" ?
                <ConfigWorkspaceCard compact testId="locations-scheduling-day-types">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Day Types</h3>
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">
                        Owned by the Organization option set <span className="font-medium">childcare_schedule_type</span>.
                        This Location enables which types Patterns may use. Rename and archive at Organization Fields /
                        Option Sets — not duplicated here.
                    </p>
                    {dayTypes.length === 0 ?
                        <p className="mt-3 text-sm text-alloy-midnight/55">No Day Types published for this Organization yet.</p>
                    :   <ul className="mt-3 divide-y divide-alloy-forge/10">
                            {dayTypes.map((row) => {
                                const enabled =
                                    config.enabledDayTypeKeys.length === 0 ||
                                    config.enabledDayTypeKeys.includes(row.key);
                                return (
                                    <li key={row.key} className="flex items-center justify-between gap-2 py-2.5">
                                        <span>
                                            <span className="block text-sm font-semibold text-alloy-midnight">
                                                {row.label}
                                            </span>
                                            <span className="block text-[11px] text-alloy-midnight/45">
                                                {row.isActive ? "Active at Organization" : "Archived at Organization"}
                                            </span>
                                        </span>
                                        <label className="flex items-center gap-2 text-[12px] text-alloy-midnight/70">
                                            <input
                                                type="checkbox"
                                                checked={enabled && row.isActive}
                                                disabled={!canMutate || saving || !row.isActive}
                                                onChange={(event) => {
                                                    const checked = event.target.checked;
                                                    const allKeys = dayTypes
                                                        .filter((d) => d.isActive)
                                                        .map((d) => d.key);
                                                    let nextKeys: string[];
                                                    if (config.enabledDayTypeKeys.length === 0) {
                                                        nextKeys = checked ?
                                                            allKeys
                                                        :   allKeys.filter((key) => key !== row.key);
                                                    } else if (checked) {
                                                        nextKeys = [...new Set([...config.enabledDayTypeKeys, row.key])];
                                                    } else {
                                                        nextKeys = config.enabledDayTypeKeys.filter(
                                                            (key) => key !== row.key,
                                                        );
                                                    }
                                                    void persist({ ...config, enabledDayTypeKeys: nextKeys });
                                                }}
                                                data-testid={`locations-scheduling-day-type-${row.key}`}
                                            />
                                            Enabled
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    }
                </ConfigWorkspaceCard>
            :   null}

            {subNav === "schedule_types" ?
                <ConfigWorkspaceCard compact testId="locations-scheduling-schedule-types">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Schedule Types</h3>
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">
                        Labels are configurable. Executable behavior is owned by code: continuous or rotating. New
                        types must choose a supported behavior template.
                    </p>
                    <ul className="mt-3 space-y-3">
                        {config.scheduleTypes.map((row) => (
                            <li
                                key={row.id}
                                className="rounded-md border border-alloy-forge/10 bg-white px-3 py-2.5"
                                data-testid={`locations-scheduling-schedule-type-${row.key}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-alloy-midnight">{row.label}</p>
                                        <p className="mt-0.5 text-[12px] text-alloy-midnight/45">
                                            Behavior: {row.behavior}
                                            {row.description ? ` · ${row.description}` : ""}
                                        </p>
                                    </div>
                                    <span className="text-[11px] text-alloy-midnight/40">
                                        {row.isActive ? "Active" : "Archived"}
                                    </span>
                                </div>
                                {canMutate ?
                                    <label className="mt-2 block">
                                        <span className="config-typo-field-label">Operator label</span>
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            <input
                                                type="text"
                                                defaultValue={row.label}
                                                className="config-runtime-input max-w-xs"
                                                data-testid={`locations-scheduling-schedule-type-label-${row.id}`}
                                                onBlur={(event) => {
                                                    const nextLabel = event.target.value.trim();
                                                    if (!nextLabel || nextLabel === row.label) return;
                                                    void persist({
                                                        ...config,
                                                        scheduleTypes: renameScheduleTypeLabel(
                                                            config.scheduleTypes,
                                                            row.id,
                                                            nextLabel,
                                                        ),
                                                    });
                                                }}
                                            />
                                        </div>
                                    </label>
                                :   null}
                            </li>
                        ))}
                    </ul>
                </ConfigWorkspaceCard>
            :   null}

            {subNav === "hours" ?
                <ConfigWorkspaceCard compact testId="locations-scheduling-hours">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Time Windows</h3>
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">
                        Named local wall-clock hours for this Location. Patterns may reference a window or use custom
                        hours. Timezone is inherited from the Location.
                    </p>
                    {config.timeWindows.length === 0 ?
                        <p className="mt-3 text-sm text-alloy-midnight/55">No Time Windows yet.</p>
                    :   <ul className="mt-3 divide-y divide-alloy-forge/10">
                            {config.timeWindows.map((row: LocationTimeWindow) => (
                                <li key={row.id} className="flex items-center justify-between gap-2 py-2.5">
                                    <span>
                                        <span className="block text-sm font-semibold text-alloy-midnight">
                                            {row.label}
                                        </span>
                                        <span className="block text-[12px] text-alloy-midnight/45">
                                            {row.startTime}–{row.endTime}
                                            {!row.isActive ? " · Archived" : ""}
                                        </span>
                                    </span>
                                    {canMutate && row.isActive ?
                                        <ConfigurationSecondaryButton
                                            className="px-2 py-1 text-[11px]"
                                            disabled={saving}
                                            onClick={() =>
                                                void persist({
                                                    ...config,
                                                    timeWindows: config.timeWindows.map((entry) =>
                                                        entry.id === row.id ?
                                                            { ...entry, isActive: false }
                                                        :   entry,
                                                    ),
                                                })
                                            }
                                        >
                                            Archive
                                        </ConfigurationSecondaryButton>
                                    :   null}
                                </li>
                            ))}
                        </ul>
                    }
                    {canMutate ?
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <label>
                                <span className="config-typo-field-label">Name</span>
                                <input
                                    type="text"
                                    value={windowDraft.label}
                                    onChange={(event) =>
                                        setWindowDraft((current) => ({ ...current, label: event.target.value }))
                                    }
                                    className="config-runtime-input mt-1"
                                    placeholder="School Day"
                                    data-testid="locations-scheduling-window-name"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">Start</span>
                                <input
                                    type="time"
                                    value={windowDraft.startTime}
                                    onChange={(event) =>
                                        setWindowDraft((current) => ({
                                            ...current,
                                            startTime: event.target.value,
                                        }))
                                    }
                                    className="config-runtime-input mt-1"
                                    data-testid="locations-scheduling-window-start"
                                />
                            </label>
                            <label>
                                <span className="config-typo-field-label">End</span>
                                <input
                                    type="time"
                                    value={windowDraft.endTime}
                                    onChange={(event) =>
                                        setWindowDraft((current) => ({
                                            ...current,
                                            endTime: event.target.value,
                                        }))
                                    }
                                    className="config-runtime-input mt-1"
                                    data-testid="locations-scheduling-window-end"
                                />
                            </label>
                            <div className="sm:col-span-3">
                                <ConfigurationPrimaryButton
                                    className="px-2 py-1 text-[11px]"
                                    disabled={
                                        saving ||
                                        !windowDraft.label.trim() ||
                                        windowDraft.endTime <= windowDraft.startTime
                                    }
                                    data-testid="locations-scheduling-window-add"
                                    onClick={() => {
                                        if (windowDraft.endTime <= windowDraft.startTime) {
                                            setError("End time must be after start time.");
                                            return;
                                        }
                                        const created = createTimeWindow(windowDraft);
                                        void persist({
                                            ...config,
                                            timeWindows: [...config.timeWindows, created],
                                        }).then(() =>
                                            setWindowDraft({ label: "", startTime: "08:00", endTime: "17:00" }),
                                        );
                                    }}
                                >
                                    Add Time Window
                                </ConfigurationPrimaryButton>
                            </div>
                        </div>
                    :   null}
                </ConfigWorkspaceCard>
            :   null}

            {subNav === "operating_days" ?
                <ConfigWorkspaceCard compact testId="locations-scheduling-operating-days">
                    <h3 className="text-sm font-semibold text-alloy-midnight">Operating days</h3>
                    <p className="mt-1 text-[12px] text-alloy-midnight/50">
                        Days this Location may operate. Pattern scheduled days must be a subset. Removing a day that
                        Patterns already use will warn — Patterns are not silently rewritten.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5" data-testid="locations-scheduling-operating-days-chips">
                        {WEEKDAY_OPTIONS.map((day) => {
                            const allowed = allowedPatternWeekdays(config.operatingDays);
                            const selected = allowed.includes(day.value);
                            const allUnset = config.operatingDays.length === 0;
                            return (
                                <button
                                    key={day.value}
                                    type="button"
                                    disabled={!canMutate || saving}
                                    aria-pressed={allUnset ? true : selected}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                        allUnset || selected ?
                                            "border-alloy-bend-pine bg-alloy-bend-pine text-white"
                                        :   "border-alloy-forge/20 bg-white text-alloy-midnight/55"
                                    }`}
                                    onClick={() => {
                                        const current =
                                            config.operatingDays.length === 0 ?
                                                [0, 1, 2, 3, 4, 5, 6]
                                            :   [...config.operatingDays];
                                        const next = current.includes(day.value) ?
                                            current.filter((value) => value !== day.value)
                                        :   [...current, day.value].sort((a, b) => a - b);
                                        void persist({ ...config, operatingDays: next });
                                    }}
                                    data-testid={`locations-scheduling-operating-day-${day.value}`}
                                >
                                    {day.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-3 text-[11px] text-alloy-midnight/45">
                        Owner: Location metadata <code className="text-[10px]">location_scheduling_v1.operating_days</code>.
                        When empty, all seven weekdays remain allowed until configured.
                    </p>
                </ConfigWorkspaceCard>
            :   null}
        </div>
    );
}
