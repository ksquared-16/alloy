"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import SettingsEntityTabBar from "@/components/adminV2/settings/SettingsEntityTabBar";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";
import { loadLocationTourRules, peekLocationTourRules } from "@/lib/locations/locationConcernCache";
import {
    duplicateTourScheduleDraft,
    findRepeatedTourSchedules,
    groupTourRulesIntoSchedules,
    isLocationOwnRule,
    tourScheduleGroupToDraft,
    TOUR_WEEKDAY_DISPLAY_ORDER,
    TOUR_WEEKDAY_LABELS,
    TOUR_WEEKDAY_SHORT,
    type TourScheduleDraft,
    type TourScheduleGroup,
    type TourRuleForAuthoring,
    type TourScheduleOverlap,
} from "@/lib/tours/schedules/tourWeeklySchedule";
import {
    formatTourWallTime,
    formatTourWallTimeRange,
    tourTimeZoneShortName,
    wallTimeToInputValue,
    wallTimeToMinutes,
} from "@/lib/tours/schedules/tourTimeFormat";
import TourPublicBrandPanel from "./TourPublicBrandPanel";
import TourShareSection from "./TourShareSection";

type LocationOpt = { id: string; label: string | null };

type RuleRow = TourRuleForAuthoring;

type ToursSection = "availability" | "booking" | "share";

const SECTIONS: { key: ToursSection; label: string }[] = [
    { key: "availability", label: "Availability" },
    { key: "booking", label: "Booking experience" },
    { key: "share", label: "Preview & Share" },
];

/**
 * Tours configuration (S3, reorganized in P1-A).
 *
 * Three operator concepts, one surface:
 *
 *   - Availability — weekly schedules. Each schedule is shown ONCE, with its weekdays and all of its
 *     windows. (The old "Week at a glance" list repeated every rule per weekday beneath the same
 *     schedules, so one Monday window read as two entries.)
 *   - Booking experience — the school's public identity: name, colour, logo, button text.
 *   - Preview & Share — the hosted calendar, its iframe and a website button (location scope).
 *
 * Location-specific (Tours feedback 2026-10-29): this surface shows and edits only the schedules
 * that belong to the location in scope. Organization-wide rules (`location_id` null) are neither
 * listed, edited nor copied here — and nothing here deletes or rewrites them: stored rules, bookings
 * and the slot engine are unchanged, so a legacy organization-wide rule still contributes times at
 * runtime until it is retired by a governed data change.
 *
 * Every time is a wall-clock time in the schedule's own zone, said on a 12-hour clock.
 */
export default function TourAvailabilitySettingsClient({
    orgId = null,
    locationId = null,
    locationLabel = null,
    embedded = false,
    onMutationCommitted,
}: {
    orgId?: string | null;
    locationId?: string | null;
    locationLabel?: string | null;
    embedded?: boolean;
    onMutationCommitted?: () => void | Promise<void>;
}) {
    const [section, setSection] = useState<ToursSection>("availability");
    const [locations, setLocations] = useState<LocationOpt[]>([]);
    /** "" = no location chosen yet (standalone page); Tours is configured per location. */
    const [scope, setScope] = useState(locationId ?? "");
    const peeked = embedded && orgId && locationId ? peekLocationTourRules(orgId, locationId) : null;
    const [rules, setRules] = useState<RuleRow[]>(() => peeked?.rules ?? []);
    const [loading, setLoading] = useState(() => !(peeked != null));
    const [refreshing, setRefreshing] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editor, setEditor] = useState<
        | { mode: "create"; draft: TourScheduleDraft | null }
        | { mode: "edit"; group: TourScheduleGroup }
        | null
    >(null);
    const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
    const hasRulesRef = useRef((peeked?.rules.length ?? 0) > 0);
    const requestSeqRef = useRef(0);

    const scopeLocationId = scope.trim() ? scope.trim() : null;
    const scopeLabel = scopeLocationId
        ? (locationLabel ?? locations.find((l) => l.id === scopeLocationId)?.label ?? "this location")
        : "the organization";

    // Embedded Locations keepalive may remount via key, but also sync when locationId changes
    // without remount — a stale scope caused false empties after Location switches.
    useEffect(() => {
        const next = String(locationId ?? "").trim();
        setScope(next);
        if (embedded && orgId && next) {
            const warm = peekLocationTourRules(orgId, next);
            if (warm) {
                setRules(warm.rules);
                hasRulesRef.current = warm.rules.length > 0;
                setLoading(false);
            }
        }
    }, [embedded, locationId, orgId]);

    const loadRules = useCallback(async () => {
        const requestSeq = ++requestSeqRef.current;
        const hadRules = hasRulesRef.current;
        if (hadRules) setRefreshing(true);
        else if (!(embedded && orgId && locationId && peekLocationTourRules(orgId, locationId))) {
            setLoading(true);
        }
        setErr(null);
        try {
            const target = scope.trim();
            let nextRules: RuleRow[];
            if (!target) {
                nextRules = [];
            } else if (embedded && orgId && locationId) {
                const { snapshot } = await loadLocationTourRules(orgId, locationId, { force: hadRules });
                nextRules = snapshot.rules;
            } else {
                const res = await fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(target)}`, { credentials: "include" });
                const j = (await res.json()) as { rules?: RuleRow[]; error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
                nextRules = j.rules ?? [];
            }
            // Only this location's own rules. The API also returns organization-wide rules (the slot
            // engine still adds them); this surface does not present them.
            nextRules = nextRules.filter((rule) => isLocationOwnRule(rule, target));
            if (requestSeq !== requestSeqRef.current) return;
            setRules(nextRules);
            hasRulesRef.current = nextRules.length > 0;
        } catch (e) {
            if (requestSeq !== requestSeqRef.current) return;
            setErr(e instanceof Error ? e.message : String(e));
            if (!hadRules) {
                setRules([]);
                hasRulesRef.current = false;
            }
        } finally {
            if (requestSeq === requestSeqRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [embedded, scope, locationId, orgId]);

    useEffect(() => {
        if (embedded && locationId) return;
        void (async () => {
            try {
                const res = await fetch("/api/admin/locations", { credentials: "include" });
                const j = (await res.json()) as { locations?: LocationOpt[] };
                if (res.ok) setLocations(j.locations ?? []);
            } catch {
                /* non-fatal */
            }
        })();
    }, [embedded, locationId]);

    useEffect(() => {
        void loadRules();
    }, [loadRules]);

    const groups = useMemo(() => groupTourRulesIntoSchedules(rules, scopeLocationId), [rules, scopeLocationId]);
    const repeats = useMemo(() => findRepeatedTourSchedules(groups), [groups]);

    const committed = async (message?: string) => {
        await loadRules();
        await onMutationCommitted?.();
        setNotice(message ?? null);
    };

    const ruleScopeQuery = `scope=${encodeURIComponent(scopeLocationId ?? "org")}`;

    const toggleRule = async (r: RuleRow) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/tours/availability-rules/${encodeURIComponent(r.id)}?${ruleScopeQuery}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !r.is_active }),
            });
            const j = (await res.json()) as { rule?: RuleRow; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            if (!j.rule || !mutationResponseContainsPatch(j.rule as unknown as Record<string, unknown>, { is_active: !r.is_active })) {
                throw new Error("Tour availability save was not confirmed by the authoritative response.");
            }
            await committed();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const removeGroup = async (g: TourScheduleGroup) => {
        if (!confirm(`Delete "${g.name}"? Existing bookings are kept; families just can't book these times any more.`)) return;
        setSaving(true);
        try {
            const url = g.scheduleId
                ? `/api/admin/tours/schedules/${encodeURIComponent(g.scheduleId)}?location_id=${encodeURIComponent(scopeLocationId ?? "org")}`
                : `/api/admin/tours/availability-rules/${encodeURIComponent(g.rules[0]!.id)}?${ruleScopeQuery}`;
            const res = await fetch(url, { method: "DELETE", credentials: "include" });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            await committed(`Deleted "${g.name}".`);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const busy = saving || editor != null || editingRule != null;

    return (
        <div className="w-full min-w-0 space-y-4" data-testid="tours-configuration" data-tours-scope={scopeLocationId ? "location" : "organization"}>
            {!embedded ?
                <header>
                    <h1 className="text-lg font-semibold text-alloy-midnight">Tours</h1>
                    <p className="mt-1 text-xs text-alloy-midnight/60">
                        Tours are set up per location. Choose a location to set its schedules, booking experience and calendar.
                    </p>
                </header>
            :   null}
            {!locationId ?
                <label className="block text-xs font-medium text-alloy-midnight/70">
                    Configure tours for
                    <select
                        className="mt-1 block w-64 rounded border border-alloy-stone/25 bg-white px-2 py-1.5 text-sm"
                        value={scope}
                        onChange={(e) => {
                            setEditor(null);
                            setEditingRule(null);
                            setNotice(null);
                            setScope(e.target.value);
                        }}
                        data-testid="tours-scope"
                    >
                        <option value="" disabled>
                            Choose a location
                        </option>
                        {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.label ?? l.id.slice(0, 8)}
                            </option>
                        ))}
                    </select>
                </label>
            :   null}

            <SettingsEntityTabBar tabs={SECTIONS} activeKey={section} onSelect={setSection} aria-label="Tours configuration" tone="secondary" />

            {err ?
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
            :   null}

            {!scopeLocationId ?
                <p className="rounded-lg border border-dashed border-alloy-bend-pine/30 px-3 py-3 text-sm text-alloy-midnight/75" data-testid="tours-choose-location">
                    Choose a location above to configure its tours.
                </p>
            : section === "booking" ?
                <TourPublicBrandPanel key={scopeLocationId ?? "org"} scopeLocationId={scopeLocationId} scopeLabel={scopeLabel} />
            : section === "share" ?
                <TourShareSection key={scopeLocationId ?? "org"} scopeLocationId={scopeLocationId} scopeLabel={scopeLabel} hasSchedules={groups.some((g) => g.is_active)} />
            :   <div className="space-y-4" data-testid="tours-availability-section">
                    {notice ?
                        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="tours-schedule-notice">
                            {notice}
                        </p>
                    :   null}

                    {loading && !refreshing && rules.length === 0 ?
                        <div className="rounded-xl border border-dashed border-alloy-forge/15 p-4" data-testid="tours-availability-pending" aria-busy="true">
                            <div className="h-3 w-40 animate-pulse rounded bg-alloy-midnight/[0.06]" />
                            <div className="mt-3 h-3 w-64 animate-pulse rounded bg-alloy-midnight/[0.04]" />
                        </div>
                    :   null}
                    {refreshing ?
                        <p className="text-sm text-alloy-midnight/45" data-testid="tours-availability-refreshing">
                            Updating tour windows…
                        </p>
                    :   null}

                    {!loading && rules.length === 0 ?
                        <div className="rounded-xl border border-dashed border-alloy-forge/15 p-4">
                            <p className="text-sm font-medium text-alloy-midnight/80">No tour availability set</p>
                            <p className="config-typo-sublabel mt-1">Add a weekly schedule for when families can visit {scopeLabel}.</p>
                        </div>
                    :   null}

                    {!loading || rules.length > 0 ?
                        <section aria-label="Schedules" className="space-y-2" data-testid="tours-local-schedules">
                            <h2 className="config-typo-field-label">Schedules for {scopeLabel}</h2>
                            <ul className="space-y-2">
                                {groups.map((g) => (
                                    <ScheduleCard
                                        key={g.key}
                                        group={g}
                                        disabled={busy}
                                        repeats={repeats.get(g.key) ?? null}
                                        onEdit={() => {
                                            setNotice(null);
                                            if (g.scheduleId) setEditor({ mode: "edit", group: g });
                                            else setEditingRule(g.rules[0]!);
                                        }}
                                        onDuplicate={() => {
                                            setNotice(null);
                                            setEditor({ mode: "create", draft: duplicateTourScheduleDraft(g) });
                                        }}
                                        onDelete={() => void removeGroup(g)}
                                        onToggle={g.scheduleId ? null : () => void toggleRule(g.rules[0]!)}
                                    >
                                        {editingRule && g.rules[0]?.id === editingRule.id ?
                                            <TourWindowForm
                                                existingRule={editingRule}
                                                scopeQuery={ruleScopeQuery}
                                                onSaved={async () => {
                                                    setEditingRule(null);
                                                    await committed();
                                                }}
                                                onCancel={() => setEditingRule(null)}
                                                disabled={saving}
                                            />
                                        : editor?.mode === "edit" && editor.group.key === g.key ?
                                            <ScheduleEditor
                                                scopeLocationId={scopeLocationId}
                                                scheduleId={g.scheduleId}
                                                initial={tourScheduleGroupToDraft(g)}
                                                onSaved={async (overlaps) => {
                                                    setEditor(null);
                                                    await committed(overlapNotice(overlaps));
                                                }}
                                                onCancel={() => setEditor(null)}
                                            />
                                        :   null}
                                    </ScheduleCard>
                                ))}
                            </ul>
                            {editor?.mode === "create" ?
                                <ScheduleEditor
                                    scopeLocationId={scopeLocationId}
                                    scheduleId={null}
                                    initial={editor.draft}
                                    onSaved={async (overlaps) => {
                                        setEditor(null);
                                        await committed(overlapNotice(overlaps));
                                    }}
                                    onCancel={() => setEditor(null)}
                                />
                            : busy ?
                                null
                            :   <ConfigurationPrimaryButton
                                    onClick={() => {
                                        setNotice(null);
                                        setEditor({ mode: "create", draft: null });
                                    }}
                                    data-testid="locations-tour-add-window"
                                >
                                    {`Add a schedule for ${scopeLabel}`}
                                </ConfigurationPrimaryButton>
                            }
                        </section>
                    :   null}

                </div>
            }
        </div>
    );
}

function overlapNotice(overlaps: TourScheduleOverlap[]): string | undefined {
    if (!overlaps.length) return undefined;
    const first = overlaps[0]!;
    return `Saved. Some times overlap "${first.otherName}" (${TOUR_WEEKDAY_SHORT[first.day]} ${formatTourWallTimeRange(
        first.window.start_time,
        first.window.end_time
    )}${overlaps.length > 1 ? ` and ${overlaps.length - 1} more` : ""}). Families see each time once, and bookings in either count against the same capacity.`;
}

/** `Mon–Fri`, `Mon, Wed, Fri`, `Every day`. */
function describeDays(days: number[]): string {
    if (days.length === 7) return "Every day";
    const ordered = TOUR_WEEKDAY_DISPLAY_ORDER.filter((d) => days.includes(d));
    const positions = ordered.map((d) => TOUR_WEEKDAY_DISPLAY_ORDER.indexOf(d));
    const consecutive = positions.every((p, i) => i === 0 || p === positions[i - 1]! + 1);
    if (consecutive && ordered.length >= 3) {
        return `${TOUR_WEEKDAY_SHORT[ordered[0]!]}–${TOUR_WEEKDAY_SHORT[ordered[ordered.length - 1]!]}`;
    }
    return ordered.map((d) => TOUR_WEEKDAY_SHORT[d]).join(", ");
}

function ScheduleCard({
    group,
    disabled,
    repeats,
    duplicateLabel = "Duplicate",
    onEdit,
    onDuplicate,
    onDelete,
    onToggle,
    children,
}: {
    group: TourScheduleGroup;
    disabled: boolean;
    /** Another schedule at this location with the same days and times. */
    repeats: string | null;
    duplicateLabel?: string;
    onEdit?: () => void;
    onDuplicate: () => void;
    onDelete?: () => void;
    onToggle?: (() => void) | null;
    children?: ReactNode;
}) {
    return (
        <li
            className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2.5 text-sm"
            data-testid={group.scheduleId ? `tours-schedule-${group.scheduleId}` : `locations-tour-rule-${group.rules[0]?.id}`}
            data-tour-schedule-scope="local"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1.5">
                    <div className="font-semibold text-alloy-midnight">
                        {group.name}
                        {group.approval_required ?
                            <span className="ml-2 rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900">needs approval</span>
                        :   <span className="ml-2 rounded bg-alloy-bend-pine/[0.14] px-1.5 text-[11px] font-semibold text-alloy-bend-pine">auto-confirm</span>}
                        {!group.is_active ?
                            <span className="ml-2 text-xs text-alloy-midnight/45">inactive</span>
                        :   null}
                    </div>
                    <div className="flex flex-wrap gap-1" aria-label={`Days: ${describeDays(group.days)}`} data-testid="tours-schedule-days">
                        {TOUR_WEEKDAY_DISPLAY_ORDER.map((d) => {
                            const on = group.days.includes(d);
                            return (
                                <span
                                    key={d}
                                    title={TOUR_WEEKDAY_LABELS[d]}
                                    data-tour-day={on ? "on" : "off"}
                                    className={`inline-flex h-6 w-9 items-center justify-center rounded text-[11px] font-semibold ${
                                        on ? "bg-alloy-bend-pine text-white" : "bg-alloy-stone/25 text-alloy-midnight/35"
                                    }`}
                                >
                                    {TOUR_WEEKDAY_SHORT[d]}
                                </span>
                            );
                        })}
                    </div>
                    <div className="text-alloy-midnight/80" data-testid="tours-schedule-windows">
                        {group.windows.map((w) => formatTourWallTimeRange(w.start_time, w.end_time)).join(" · ")}{" "}
                        <span className="text-alloy-midnight/50">{tourTimeZoneShortName(group.timezone)}</span>
                    </div>
                    <div className="text-[11px] text-alloy-midnight/50">
                        {group.slot_duration_minutes} minute tours · {group.buffer_minutes} minute buffer · up to {group.max_bookings_per_slot}{" "}
                        {group.max_bookings_per_slot === 1 ? "family" : "families"} per time
                        {group.mixedSettings ? " · some days differ — saving applies these settings to every day" : ""}
                    </div>
                    {repeats ?
                        <p className="text-[11px] text-amber-900" data-testid="tours-schedule-repeats">
                            Same days and times as “{repeats}”. Families see each time once; both schedules stay active.
                        </p>
                    :   null}
                </div>
                <div className="flex flex-wrap gap-2">
                    {onEdit ?
                        <ConfigurationSecondaryButton className="px-2 py-1" disabled={disabled} onClick={onEdit} data-testid={`locations-tour-edit-${group.rules[0]?.id}`}>
                            Edit
                        </ConfigurationSecondaryButton>
                    :   null}
                    <ConfigurationSecondaryButton className="px-2 py-1" disabled={disabled} onClick={onDuplicate} data-testid="tours-schedule-duplicate">
                        {duplicateLabel}
                    </ConfigurationSecondaryButton>
                    {onToggle ?
                        <ConfigurationSecondaryButton className="px-2 py-1" disabled={disabled} onClick={onToggle}>
                            {group.is_active ? "Deactivate" : "Activate"}
                        </ConfigurationSecondaryButton>
                    :   null}
                    {onDelete ?
                        <button
                            type="button"
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                            disabled={disabled}
                            onClick={onDelete}
                        >
                            Delete
                        </button>
                    :   null}
                </div>
            </div>
            {children}
        </li>
    );
}

/** Tour start times one window yields in a day — the same arithmetic the slot engine uses. */
function windowStarts(start: string, end: string, duration: number, buffer: number): string[] {
    const s = wallTimeToMinutes(start);
    const e = wallTimeToMinutes(end);
    if (s == null || e == null || duration < 1) return [];
    const out: string[] = [];
    for (let t = s; t + duration <= e && out.length < 48; t += duration + Math.max(0, buffer)) {
        out.push(formatTourWallTime(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`) ?? "");
    }
    return out;
}

const BLANK_DRAFT: TourScheduleDraft = {
    name: "Weekday tours",
    days: [1, 2, 3, 4, 5],
    windows: [{ start_time: "09:00:00", end_time: "11:00:00" }],
    timezone: "",
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    max_bookings_per_slot: 1,
    approval_required: false,
    is_active: true,
};

function ScheduleEditor({
    scopeLocationId,
    scheduleId,
    initial,
    onSaved,
    onCancel,
}: {
    scopeLocationId: string | null;
    scheduleId: string | null;
    initial: TourScheduleDraft | null;
    onSaved: (overlaps: TourScheduleOverlap[]) => Promise<void>;
    onCancel: () => void;
}) {
    const [draft, setDraft] = useState<TourScheduleDraft>(() => initial ?? BLANK_DRAFT);
    const [tzSource, setTzSource] = useState<string | null>(initial ? "schedule" : null);
    const [msg, setMsg] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // A new schedule starts in the location's authoritative zone (location → organization),
    // never the browser's.
    useEffect(() => {
        if (draft.timezone) return;
        let live = true;
        void (async () => {
            const qs = `?location_id=${encodeURIComponent(scopeLocationId ?? "org")}`;
            const res = await fetch(`/api/admin/tours/schedules${qs}`, { credentials: "include" }).catch(() => null);
            const j = res?.ok ? ((await res.json()) as { timezone?: { timezone: string | null; source: string } }) : null;
            if (!live) return;
            if (j?.timezone?.timezone) {
                setDraft((d) => (d.timezone ? d : { ...d, timezone: j.timezone!.timezone! }));
                setTzSource(j.timezone.source);
            } else {
                setTzSource("unresolved");
            }
        })();
        return () => {
            live = false;
        };
    }, [draft.timezone, scopeLocationId]);

    const set = <K extends keyof TourScheduleDraft>(key: K, value: TourScheduleDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
    const perDay = draft.windows.flatMap((w) => windowStarts(w.start_time, w.end_time, draft.slot_duration_minutes, draft.buffer_minutes));

    const submit = async () => {
        setMsg(null);
        setSubmitting(true);
        try {
            const res = await fetch(
                scheduleId ? `/api/admin/tours/schedules/${encodeURIComponent(scheduleId)}` : "/api/admin/tours/schedules",
                {
                    method: scheduleId ? "PUT" : "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ location_id: scopeLocationId, schedule: draft }),
                }
            );
            const j = (await res.json().catch(() => ({}))) as {
                schedule_id?: string;
                rules?: unknown[];
                overlaps?: TourScheduleOverlap[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            // The authoritative answer must carry one rule per weekday × window.
            if (!j.schedule_id || (j.rules?.length ?? 0) !== draft.days.length * draft.windows.length) {
                throw new Error("Tour schedule save was not confirmed by the authoritative response.");
            }
            await onSaved(j.overlaps ?? []);
        } catch (cause) {
            setMsg(cause instanceof Error ? cause.message : "Tour schedule could not be saved.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mt-3 max-w-2xl rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 p-3" data-testid="tours-schedule-editor">
            <div className="text-xs font-semibold text-alloy-midnight/75">
                {scheduleId ? "Edit weekly schedule" : initial ? "New schedule (copied settings — no bookings are copied)" : "New weekly schedule"}
            </div>
            {msg ?
                <p className="mt-1 text-xs text-red-700">{msg}</p>
            :   null}
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs sm:col-span-2">
                    Schedule name
                    <input className="config-runtime-input mt-1" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} data-testid="tours-schedule-name" />
                </label>
                <fieldset className="text-xs sm:col-span-2">
                    <legend>Days</legend>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {TOUR_WEEKDAY_DISPLAY_ORDER.map((d) => {
                            const on = draft.days.includes(d);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => set("days", on ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort((a, b) => a - b))}
                                    className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                                        on ? "border-alloy-bend-pine bg-alloy-bend-pine text-white" : "border-alloy-stone/40 bg-white text-alloy-midnight"
                                    }`}
                                    data-testid={`tours-schedule-day-${d}`}
                                >
                                    {TOUR_WEEKDAY_SHORT[d]}
                                </button>
                            );
                        })}
                    </div>
                </fieldset>
                <fieldset className="text-xs sm:col-span-2">
                    <legend>Times each day</legend>
                    <ul className="mt-1 space-y-1.5">
                        {draft.windows.map((w, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid={`tours-schedule-window-${i}`}>
                                {/* `.config-runtime-input` is width:100% and un-layered, so it beats a
                                    Tailwind width utility; a fixed grid track bounds it instead and keeps
                                    start and end side by side. */}
                                <div className="grid grid-cols-[8rem_auto_8rem] items-center gap-2">
                                <input
                                    type="time"
                                    className="config-runtime-input"
                                    value={wallTimeToInputValue(w.start_time)}
                                    aria-label={`Window ${i + 1} start`}
                                    onChange={(e) => set("windows", draft.windows.map((x, j) => (j === i ? { ...x, start_time: `${e.target.value}:00` } : x)))}
                                    data-testid={`tours-schedule-window-start-${i}`}
                                />
                                <span>to</span>
                                <input
                                    type="time"
                                    className="config-runtime-input"
                                    value={wallTimeToInputValue(w.end_time)}
                                    aria-label={`Window ${i + 1} end`}
                                    onChange={(e) => set("windows", draft.windows.map((x, j) => (j === i ? { ...x, end_time: `${e.target.value}:00` } : x)))}
                                    data-testid={`tours-schedule-window-end-${i}`}
                                />
                                </div>
                                <span className="text-alloy-midnight/55">{formatTourWallTimeRange(w.start_time, w.end_time)}</span>
                                {draft.windows.length > 1 ?
                                    <button type="button" className="text-red-700 underline" onClick={() => set("windows", draft.windows.filter((_, j) => j !== i))}>
                                        Remove
                                    </button>
                                :   null}
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        className="mt-1.5 text-xs font-medium text-alloy-midnight underline"
                        onClick={() => set("windows", [...draft.windows, { start_time: "14:00:00", end_time: "15:00:00" }])}
                        data-testid="tours-schedule-add-window"
                    >
                        Add another time window
                    </button>
                </fieldset>
                <label className="text-xs sm:col-span-2">
                    Time zone
                    <input
                        className="config-runtime-input mt-1"
                        value={draft.timezone}
                        placeholder="America/Los_Angeles"
                        onChange={(e) => {
                            setTzSource("edited");
                            set("timezone", e.target.value);
                        }}
                        data-testid="locations-tour-timezone"
                    />
                    <span className="mt-0.5 block text-[11px] text-alloy-midnight/50">
                        {tzSource === "location" ? "The location's time zone."
                        : tzSource === "organization" ? "The organization's time zone (the location has none of its own)."
                        : tzSource === "existing_tour_rules" ? "The zone this location's tours already use."
                        : tzSource === "unresolved" ?
                            scopeLocationId ? "No time zone is configured for this location — enter one (for example America/Chicago)."
                            : "No time zone is configured for the organization — enter one (for example America/Chicago)."
                        : "Times are in this zone, including across daylight saving changes."}
                    </span>
                </label>
                <label className="text-xs">
                    Tour length (minutes)
                    <input type="number" min={1} className="config-runtime-input mt-1" value={draft.slot_duration_minutes} onChange={(e) => set("slot_duration_minutes", Number(e.target.value))} data-testid="locations-tour-duration" />
                </label>
                <label className="text-xs">
                    Gap between tours (minutes)
                    <input type="number" min={0} className="config-runtime-input mt-1" value={draft.buffer_minutes} onChange={(e) => set("buffer_minutes", Number(e.target.value))} data-testid="locations-tour-buffer" />
                </label>
                <label className="text-xs">
                    Families per time
                    <input type="number" min={1} className="config-runtime-input mt-1" value={draft.max_bookings_per_slot} onChange={(e) => set("max_bookings_per_slot", Number(e.target.value))} data-testid="locations-tour-max-bookings" />
                </label>
                <div className="space-y-1 text-xs">
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={draft.approval_required} onChange={(e) => set("approval_required", e.target.checked)} data-testid="locations-tour-approval" />
                        Staff approve each booking
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} data-testid="locations-tour-active" />
                        Active
                    </label>
                </div>
                <p className="text-[11px] text-alloy-midnight/60 sm:col-span-2" data-testid="tours-schedule-preview">
                    {perDay.length ?
                        `Each selected day offers ${perDay.length} tour ${perDay.length === 1 ? "time" : "times"}: ${perDay.join(", ")} — ${perDay.length * draft.days.length} a week.`
                    :   "These windows are too short for one tour."}
                </p>
            </div>
            <div className="mt-3 flex gap-2">
                <ConfigurationPrimaryButton disabled={submitting} onClick={() => void submit()} data-testid="tours-schedule-save">
                    {submitting ? "Saving…" : scheduleId ? "Save schedule" : "Create schedule"}
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton disabled={submitting} onClick={onCancel}>
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </div>
    );
}

/** A single legacy window (created before schedules existed) — edited in place, at its own scope. */
function TourWindowForm({
    existingRule,
    scopeQuery,
    onSaved,
    onCancel,
    disabled,
}: {
    existingRule: RuleRow;
    scopeQuery: string;
    onSaved: () => Promise<void>;
    onCancel: () => void;
    disabled: boolean;
}) {
    const [day_of_week, setDayOfWeek] = useState(existingRule.day_of_week);
    const [start_time, setStartTime] = useState(wallTimeToInputValue(existingRule.start_time) || "09:00");
    const [end_time, setEndTime] = useState(wallTimeToInputValue(existingRule.end_time) || "12:00");
    const [timezone, setTimezone] = useState(existingRule.timezone);
    const [slot_duration_minutes, setSlot] = useState(existingRule.slot_duration_minutes);
    const [buffer_minutes, setBuf] = useState(existingRule.buffer_minutes);
    const [max_bookings_per_slot, setMax] = useState(existingRule.max_bookings_per_slot);
    const [approval_required, setAppr] = useState(existingRule.approval_required);
    const [is_active, setIsActive] = useState(existingRule.is_active);
    const [msg, setMsg] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        setMsg(null);
        setSubmitting(true);
        try {
            const payload = {
                day_of_week,
                start_time: `${start_time}:00`,
                end_time: `${end_time}:00`,
                timezone: timezone.trim(),
                slot_duration_minutes,
                buffer_minutes,
                max_bookings_per_slot,
                approval_required,
                is_active,
            };
            const res = await fetch(`/api/admin/tours/availability-rules/${encodeURIComponent(existingRule.id)}?${scopeQuery}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const j = (await res.json().catch(() => ({}))) as { rule?: RuleRow; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            if (!j.rule || !mutationResponseContainsPatch(j.rule as unknown as Record<string, unknown>, payload)) {
                throw new Error("Tour availability save was not confirmed by the authoritative response.");
            }
            await onSaved();
        } catch (cause) {
            setMsg(cause instanceof Error ? cause.message : "Tour availability could not be saved.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mt-3 max-w-2xl rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 p-3" data-testid="locations-tour-edit-form">
            <div className="text-xs font-semibold text-alloy-midnight/75">Edit tour window</div>
            {msg ?
                <p className="mt-1 text-xs text-red-700">{msg}</p>
            :   null}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs">
                    Day
                    <select className="config-runtime-select mt-1" value={day_of_week} onChange={(e) => setDayOfWeek(Number(e.target.value))} data-testid="locations-tour-day">
                        {TOUR_WEEKDAY_LABELS.map((day, index) => (
                            <option key={day} value={index}>
                                {day}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    Time zone
                    <input className="config-runtime-input mt-1" value={timezone} onChange={(e) => setTimezone(e.target.value)} data-testid="locations-tour-timezone" />
                </label>
                <label className="text-xs">
                    Start <span className="text-alloy-midnight/50">{formatTourWallTime(start_time)}</span>
                    <input type="time" className="config-runtime-input mt-1" value={start_time} onChange={(e) => setStartTime(e.target.value)} data-testid="locations-tour-start" />
                </label>
                <label className="text-xs">
                    End <span className="text-alloy-midnight/50">{formatTourWallTime(end_time)}</span>
                    <input type="time" className="config-runtime-input mt-1" value={end_time} onChange={(e) => setEndTime(e.target.value)} data-testid="locations-tour-end" />
                </label>
                <label className="text-xs">
                    Tour length (minutes)
                    <input type="number" min={1} className="config-runtime-input mt-1" value={slot_duration_minutes} onChange={(e) => setSlot(Number(e.target.value))} data-testid="locations-tour-duration" />
                </label>
                <label className="text-xs">
                    Gap between tours (minutes)
                    <input type="number" min={0} className="config-runtime-input mt-1" value={buffer_minutes} onChange={(e) => setBuf(Number(e.target.value))} data-testid="locations-tour-buffer" />
                </label>
                <label className="text-xs">
                    Families per time
                    <input type="number" min={1} className="config-runtime-input mt-1" value={max_bookings_per_slot} onChange={(e) => setMax(Number(e.target.value))} data-testid="locations-tour-max-bookings" />
                </label>
                <div className="space-y-1 text-xs">
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={approval_required} onChange={(e) => setAppr(e.target.checked)} data-testid="locations-tour-approval" />
                        Staff approve each booking
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} data-testid="locations-tour-active" />
                        Active tour window
                    </label>
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                <ConfigurationPrimaryButton disabled={disabled || submitting} onClick={() => void submit()} data-testid="locations-tour-save">
                    {submitting ? "Saving…" : "Save tour window"}
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton disabled={disabled || submitting} onClick={onCancel}>
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </div>
    );
}
