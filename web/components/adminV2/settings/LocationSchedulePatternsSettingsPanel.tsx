"use client";

/**
 * Canonical `schedule_patterns` · shared with Locations — this panel lists/creates/updates
 * rows through the same `/api/admin/schedule-patterns` endpoints that
 * `Operations → Studio → Patterns` uses (`OperationsStudio.tsx`'s `onMutatePattern`). There is
 * no separate Locations-only pattern store; Studio is simply another client of this API.
 *
 * The editor moved hosts when Assignments was absorbed into Operations; the API, the table and this
 * panel did not. That is the whole point of naming the endpoint here rather than the screen.
 */

import { useCallback, useEffect, useState } from "react";
import {
    createSchedulePattern,
    fetchSchedulePatternsForSite,
    formatWeekdaySelection,
    patchSchedulePattern,
    WEEKDAY_OPTIONS,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import { slugifyAdminKey } from "@/lib/admin/slugifyAdminKey";

type Props = {
    siteId: string;
    onError: (message: string) => void;
    inputClass: string;
};

type AddDraft = {
    label: string;
    key: string;
    schedule_type_key: string;
    weekdays: number[];
};

const DEFAULT_DRAFT: AddDraft = {
    label: "",
    key: "",
    schedule_type_key: "",
    weekdays: [1, 2, 3, 4, 5],
};

export default function LocationSchedulePatternsSettingsPanel({ siteId, onError, inputClass }: Props) {
    const [patterns, setPatterns] = useState<SchedulePatternRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [draft, setDraft] = useState<AddDraft>(DEFAULT_DRAFT);

    const loadPatterns = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await fetchSchedulePatternsForSite(siteId);
            setPatterns(rows);
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [siteId, onError]);

    useEffect(() => {
        loadPatterns();
    }, [loadPatterns]);

    const updatePattern = useCallback(
        async (patternId: string, patch: Partial<SchedulePatternRow>) => {
            setSavingId(patternId);
            try {
                const updated = await patchSchedulePattern(patternId, {
                    label: patch.label,
                    schedule_type_key: patch.schedule_type_key,
                    weekdays: patch.weekdays,
                    sort_order: patch.sort_order,
                    is_active: patch.is_active,
                });
                setPatterns((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            } catch (e) {
                onError((e as Error).message);
            } finally {
                setSavingId(null);
            }
        },
        [onError]
    );

    const createPattern = useCallback(async () => {
        const label = draft.label.trim();
        const key = (draft.key.trim() || slugifyAdminKey(label)).trim();
        const scheduleTypeKey = (draft.schedule_type_key.trim() || key).trim();
        if (!label || !key || !scheduleTypeKey || draft.weekdays.length === 0) {
            onError("Label, key, schedule type, and weekdays are required.");
            return;
        }
        setCreating(true);
        try {
            const created = await createSchedulePattern({
                site_location_id: siteId,
                key,
                label,
                schedule_type_key: scheduleTypeKey,
                weekdays: draft.weekdays,
            });
            setPatterns((prev) => [...prev, created]);
            setDraft(DEFAULT_DRAFT);
        } catch (e) {
            onError((e as Error).message);
        } finally {
            setCreating(false);
        }
    }, [draft, onError, siteId]);

    const toggleWeekday = (value: number) => {
        setDraft((prev) => {
            const set = new Set(prev.weekdays);
            if (set.has(value)) set.delete(value);
            else set.add(value);
            return { ...prev, weekdays: [...set].sort((a, b) => a - b) };
        });
    };

    return (
        <div className="space-y-3" data-testid="location-schedule-patterns-panel" data-site-id={siteId}>
            <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Schedules</h3>
                <p className="mt-1 text-[11px] text-alloy-midnight/55">
                    Site schedule patterns. Matched at approval handoff from enrollment schedule proposals
                    (`schedule_type`).
                </p>
            </div>

            {loading ?
                <p className="text-[11px] text-alloy-midnight/50">Loading schedule patterns…</p>
            :   null}

            {patterns.length > 0 ?
                <ul className="space-y-2">
                    {patterns.map((pattern) => (
                        <li
                            key={pattern.id}
                            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] px-3 py-2"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    className={`${inputClass} max-w-[12rem]`}
                                    value={pattern.label}
                                    disabled={savingId === pattern.id}
                                    onChange={(e) =>
                                        setPatterns((prev) =>
                                            prev.map((p) =>
                                                p.id === pattern.id ? { ...p, label: e.target.value } : p
                                            )
                                        )
                                    }
                                    onBlur={() => {
                                        const current = patterns.find((p) => p.id === pattern.id);
                                        if (current?.label.trim()) updatePattern(pattern.id, { label: current.label });
                                    }}
                                />
                                <label className="flex items-center gap-1 text-[11px] text-alloy-midnight/70">
                                    <input
                                        type="checkbox"
                                        checked={pattern.is_active}
                                        disabled={savingId === pattern.id}
                                        onChange={(e) =>
                                            updatePattern(pattern.id, { is_active: e.target.checked })
                                        }
                                    />
                                    Active
                                </label>
                                {savingId === pattern.id ?
                                    <span className="text-[10px] text-alloy-midnight/45">Saving…</span>
                                :   null}
                            </div>
                            <div className="mt-1 text-[10px] text-alloy-midnight/55">
                                Key: {pattern.key} · Type: {pattern.schedule_type_key} ·{" "}
                                {formatWeekdaySelection(pattern.weekdays)}
                            </div>
                        </li>
                    ))}
                </ul>
            :   !loading ?
                <p className="text-[11px] text-alloy-midnight/50">No schedule patterns yet.</p>
            :   null}

            <div className="rounded-lg border border-dashed border-alloy-forge/20 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/60">
                    Add schedule pattern
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                        className={inputClass}
                        placeholder="Label (e.g. Full time)"
                        value={draft.label}
                        onChange={(e) =>
                            setDraft((prev) => ({
                                ...prev,
                                label: e.target.value,
                                key: prev.key || slugifyAdminKey(e.target.value),
                                schedule_type_key:
                                    prev.schedule_type_key || slugifyAdminKey(e.target.value),
                            }))
                        }
                    />
                    <input
                        className={inputClass}
                        placeholder="Key"
                        value={draft.key}
                        onChange={(e) => setDraft((prev) => ({ ...prev, key: e.target.value }))}
                    />
                    <input
                        className={inputClass}
                        placeholder="Schedule type key"
                        value={draft.schedule_type_key}
                        onChange={(e) =>
                            setDraft((prev) => ({ ...prev, schedule_type_key: e.target.value }))
                        }
                    />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {WEEKDAY_OPTIONS.map((day) => (
                        <button
                            key={day.value}
                            type="button"
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                                draft.weekdays.includes(day.value) ?
                                    "border-alloy-pine/40 bg-alloy-pine/10 text-alloy-pine"
                                :   "border-alloy-forge/15 text-alloy-midnight/55"
                            }`}
                            onClick={() => toggleWeekday(day.value)}
                        >
                            {day.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="mt-2 rounded-md border border-alloy-pine/30 bg-alloy-pine/10 px-3 py-1 text-[11px] font-semibold text-alloy-pine hover:bg-alloy-pine/15 disabled:opacity-50"
                    disabled={creating}
                    onClick={() => createPattern()}
                >
                    {creating ? "Adding…" : "Add schedule pattern"}
                </button>
            </div>
        </div>
    );
}
