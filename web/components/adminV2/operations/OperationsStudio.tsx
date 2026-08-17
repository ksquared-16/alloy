"use client";

/**
 * OPERATIONS → STUDIO — the existing configuration capabilities, re-hosted.
 *
 * Assignment Categories, Patterns and Validation are unchanged. This module owns nothing about what
 * they mean: it loads them from the SAME endpoints the retired Assignments Studio loaded them from
 * and hands them to the SAME `SchedulingStudio` renderer.
 *
 *     /api/admin/assignment-types            Assignment Categories
 *     /api/admin/schedule-patterns           Patterns  (shared with Locations → Schedule)
 *     /api/admin/scheduling?view=studio_config   the pattern editor's site configuration
 *     /api/admin/scheduling?view=calculations    Validation
 *
 * ── NOTHING WAS COPIED, RENAMED OR RE-OWNED ──
 *
 * No table changed, no configuration was duplicated into an Operations-specific store, and no
 * ownership moved because placement moved. Patterns in particular remain SHARED with
 * `Locations → Schedule`: both surfaces read `/api/admin/schedule-patterns` and both map rows
 * through the same shape, which is the property `schedulePatternShapeConvergence` already pins.
 * Studio is a new host for existing capabilities, and a host is not an owner.
 *
 * The loaders below were MOVED here rather than copied — `SchedulingWorkspace` is retired in the
 * same change, so there is exactly one place that fetches this configuration, as before.
 *
 * ── IT LOADS ON DEMAND, NOT ON MOUNT ──
 *
 * The Assignments workspace preloaded Studio as part of a site-wide bootstrap so that entering
 * Studio never cold-started. Operations does not: WORK is where the operator lands and by far where
 * they stay, and paying four configuration reads on every Roster open to make an occasional Studio
 * visit faster is the wrong trade. Studio loads when Studio is entered, and holds what it loaded for
 * the rest of the session — so the second visit is instant and the first costs what it costs.
 */

import { useCallback, useEffect, useState } from "react";

import SchedulingStudio, {
    type StudioCalculation,
} from "@/components/adminV2/scheduling/screens/SchedulingStudio";
import {
    type PatternEditorConfig,
    type PatternInput,
    type PatternMutation,
    type StudioPattern,
} from "@/components/adminV2/scheduling/screens/SchedulingPatterns";
import type { AssignmentTypeAdminRecord } from "@/lib/operationalAssignments/assignmentTypeService";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";
import type { OperationsStudioSection } from "@/app/adminV2/operations/operationsSections";

const EMPTY_STUDIO_CONFIG: PatternEditorConfig = { operatingDays: [], scheduleTypes: [], programs: [] };

async function patternApi(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`/api/admin/schedule-patterns${path}`, {
        headers: { "content-type": "application/json" },
        ...init,
    });
}

async function schedApi(path: string): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, {
        headers: { "content-type": "application/json" },
    });
    return res.json().catch(() => ({}));
}

/**
 * Map a raw `schedule_patterns` row — the exact `SchedulePatternRow` shape
 * `/api/admin/schedule-patterns` returns to both Studio and Locations →
 * `LocationSchedulePatternsSettingsPanel` (`fetchSchedulePatternsForSite`) — to the Studio pattern
 * shape (metadata preserved). Exported for the convergence test at
 * `tests/adminV2/scheduling/schedulePatternShapeConvergence.test.ts`, which is the assertion that
 * keeps the two surfaces reading one shape.
 */
export function mapRawPattern(row: Record<string, any>): StudioPattern {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const weekdays = Array.isArray(row.weekdays) ? row.weekdays.map(Number) : [];
    const defaultDays = Array.isArray(metadata.default_days)
        ? (metadata.default_days as unknown[]).map(Number)
        : weekdays;
    const programKeys = Array.isArray(metadata.applicable_program_keys)
        ? (metadata.applicable_program_keys as unknown[]).map(String)
        : [];
    return {
        id: String(row.id),
        key: String(row.key ?? ""),
        label: String(row.label ?? "Schedule"),
        scheduleTypeKey: String(row.schedule_type_key ?? ""),
        weekdays,
        isActive: row.is_active !== false,
        sortOrder: Number(row.sort_order ?? 100),
        metadata,
        hours: readPatternDefaultHours(metadata),
        perDayEnabled: metadata.per_day_enabled === true,
        defaultDays,
        programKeys,
    };
}

/** A unique, schema-valid pattern key (`^[a-z0-9_]{2,64}$`) derived from the label. */
function slugKey(label: string): string {
    const base =
        label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "pattern";
    return `${base}_${Date.now().toString(36).slice(-5)}`.replace(/[^a-z0-9_]/g, "").slice(0, 64);
}

/** Merge editor fields into a pattern's metadata, preserving existing (v3) keys. */
function buildPatternMeta(base: Record<string, unknown>, data: PatternInput): Record<string, unknown> {
    const meta: Record<string, unknown> = { ...base };
    if (data.hours) meta.hours = { opens_at: data.hours.arrive, closes_at: data.hours.depart };
    else delete meta.hours;
    meta.per_day_enabled = data.perDayEnabled;
    meta.default_days = data.defaultDays;
    meta.applicable_program_keys = data.programKeys;
    return meta;
}

export default function OperationsStudio({
    view,
    siteId,
    siteName,
    sites,
}: {
    view: Exclude<OperationsStudioSection, "templates">;
    siteId: string;
    siteName: string;
    sites: { id: string; name: string }[];
}) {
    const [patterns, setPatterns] = useState<StudioPattern[] | null>(null);
    const [config, setConfig] = useState<PatternEditorConfig | null>(null);
    const [assignmentTypes, setAssignmentTypes] = useState<AssignmentTypeAdminRecord[] | null>(null);
    const [calculations, setCalculations] = useState<StudioCalculation[] | null>(null);
    const [loadingPatterns, setLoadingPatterns] = useState(false);
    const [loadingCalc, setLoadingCalc] = useState(false);

    const loadAssignmentTypes = useCallback(async () => {
        const r = await fetch("/api/admin/assignment-types")
            .then((res) => res.json())
            .catch(() => ({}));
        setAssignmentTypes((r?.types as AssignmentTypeAdminRecord[]) ?? []);
    }, []);

    const loadPatterns = useCallback(async (id: string) => {
        if (!id) return;
        setLoadingPatterns(true);
        const [pRes, cRes] = await Promise.all([
            patternApi(`?site_location_id=${encodeURIComponent(id)}`)
                .then((r) => r.json())
                .catch(() => ({})),
            schedApi(`?view=studio_config&site_location_id=${encodeURIComponent(id)}`),
        ]);
        setPatterns(((pRes?.patterns ?? []) as Record<string, any>[]).map(mapRawPattern));
        setConfig((cRes?.config as PatternEditorConfig) ?? EMPTY_STUDIO_CONFIG);
        setLoadingPatterns(false);
    }, []);

    /*
     * The SITE is the dependency for patterns and config; assignment categories and calculations are
     * ORG-scoped and are loaded once. Reloading org configuration on every site change would issue
     * reads whose answer cannot differ — the kind of work that looks like caution and is only cost.
     */
    useEffect(() => {
        if (!siteId) return;
        void loadPatterns(siteId);
    }, [siteId, loadPatterns]);

    useEffect(() => {
        if (assignmentTypes == null) void loadAssignmentTypes();
    }, [assignmentTypes, loadAssignmentTypes]);

    useEffect(() => {
        if (calculations != null) return;
        void (async () => {
            setLoadingCalc(true);
            const r = await schedApi(`?view=calculations`);
            setCalculations((r?.calculations as StudioCalculation[]) ?? []);
            setLoadingCalc(false);
        })();
    }, [calculations]);

    const onMutatePattern = useCallback(
        async (m: PatternMutation): Promise<{ ok: boolean; error?: string }> => {
            if (!siteId) return { ok: false, error: "No site selected." };
            const fail = async (res: Response): Promise<{ ok: boolean; error?: string }> => {
                const body = await res.json().catch(() => ({}));
                return { ok: false, error: (body as { error?: string }).error ?? "Could not save the pattern." };
            };
            try {
                let res: Response;
                if (m.kind === "create") {
                    res = await patternApi("", {
                        method: "POST",
                        body: JSON.stringify({
                            site_location_id: siteId,
                            key: slugKey(m.data.label),
                            label: m.data.label,
                            schedule_type_key: m.data.scheduleTypeKey,
                            weekdays: m.data.weekdays,
                            is_active: m.data.active,
                            sort_order: 100,
                            metadata: buildPatternMeta({}, m.data),
                        }),
                    });
                } else if (m.kind === "update") {
                    res = await patternApi(`/${m.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                            label: m.data.label,
                            schedule_type_key: m.data.scheduleTypeKey,
                            weekdays: m.data.weekdays,
                            is_active: m.data.active,
                            metadata: buildPatternMeta(m.baseMetadata, m.data),
                        }),
                    });
                } else if (m.kind === "archive" || m.kind === "restore") {
                    res = await patternApi(`/${m.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ is_active: m.kind === "restore" }),
                    });
                } else {
                    const s = m.source;
                    res = await patternApi("", {
                        method: "POST",
                        body: JSON.stringify({
                            site_location_id: siteId,
                            key: slugKey(`${s.label} copy`),
                            label: `${s.label} (copy)`,
                            schedule_type_key: s.scheduleTypeKey,
                            weekdays: s.weekdays,
                            is_active: true,
                            sort_order: s.sortOrder + 1,
                            metadata: s.metadata,
                        }),
                    });
                }
                if (!res.ok) return fail(res);
                await loadPatterns(siteId);
                return { ok: true };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : "Network error." };
            }
        },
        [siteId, loadPatterns],
    );

    return (
        <div data-operations-studio={view}>
            <SchedulingStudio
                view={view}
                patterns={patterns ?? []}
                assignmentTypes={assignmentTypes ?? []}
                calculations={calculations ?? []}
                editorConfig={config ?? EMPTY_STUDIO_CONFIG}
                loading={view === "validation" ? calculations == null || loadingCalc : loadingPatterns}
                siteName={siteName}
                sites={sites}
                onMutatePattern={onMutatePattern}
                onAssignmentTypesChanged={loadAssignmentTypes}
            />
        </div>
    );
}
