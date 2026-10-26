"use client";

/**
 * The location's Operating Calendar: holidays, closures, partial closures and
 * modified hours — its own and the organization defaults it inherits — in the
 * location configuration's Scheduling tab.
 *
 * Every save is two steps: review the impact (which dates and hours change, at
 * which locations), then save. The server prepares the same act for both, so the
 * review shows what the save will do. Edit controls appear only where the caller
 * holds the authority the server will check.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ConfigurationInlineButton,
    ConfigurationPrimaryButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    calendarDayCount,
    describeDayState,
    describeEntryEffect,
    formatCalendarDate,
    formatCalendarDateRange,
} from "@/lib/operatingCalendar/operatingCalendarPresentation";
import type { CalendarEntryView } from "@/lib/operatingCalendar/operatingCalendarEntries";
import type { DateImpact } from "@/lib/operatingCalendar/operatingCalendarImpact";
import { durableRecordHref } from "@/lib/runtime/focus/durableRecordRoute";
import { formatTourInstantForOperator } from "@/lib/tours/schedules/tourTimeFormat";

export type AttentionBooking = {
    booking_id: string;
    opportunity_id: string | null;
    primary_person_id: string | null;
    start_at: string;
    timezone: string | null;
    status_key: string;
    reason: "closed" | "outside_hours" | "undetermined";
    entry_names: string[];
};

const ATTENTION_REASON: Record<AttentionBooking["reason"], string> = {
    closed: "Location closed",
    outside_hours: "Outside that day's hours",
    undetermined: "Calendar undetermined",
};
import type {
    OperatingCalendarDesignation,
    OperatingCalendarEffect,
    OperatingCalendarReason,
    OperatingCalendarScope,
} from "@/lib/operatingCalendar/operatingCalendarVocabulary";

export type CalendarResponse = {
    site_id: string;
    site_label: string;
    timezone: string;
    timezone_resolved: boolean;
    organization_timezone: string | null;
    today: string;
    rooms: Array<{ id: string; label: string }>;
    entries: CalendarEntryView[];
    bookings_needing_attention: AttentionBooking[];
    can_edit_organization: boolean;
    can_edit_location: boolean;
};

type Draft = {
    scope: OperatingCalendarScope;
    name: string;
    designation: OperatingCalendarDesignation;
    effect: OperatingCalendarEffect;
    from_date: string;
    to_date: string;
    start_time: string;
    end_time: string;
    reason_key: OperatingCalendarReason | "";
    note: string;
};

type EditorState = {
    action: "create" | "revise";
    entryId: string | null;
    draft: Draft;
};

export type PreviewState = {
    dates: DateImpact[];
    sites: Array<{ siteId: string; siteLabel: string }>;
    sites_not_previewed: number;
    bookings_newly_affected: AttentionBooking[];
    bookings_no_longer_affected: AttentionBooking[];
    action: "create" | "revise" | "withdraw" | "restore";
    entryId: string | null;
    draft: Draft | null;
};

const EFFECT_OPTIONS: Array<{ value: OperatingCalendarEffect; label: string }> = [
    { value: "closed", label: "Closed all day" },
    { value: "partial_closure", label: "Closed part of the day" },
    { value: "modified_hours", label: "Modified hours" },
    { value: "none", label: "No change (name the day only)" },
    { value: "open_as_usual", label: "Open as usual (location exception)" },
];

const DESIGNATION_OPTIONS: Array<{ value: OperatingCalendarDesignation; label: string }> = [
    { value: "holiday", label: "Holiday" },
    { value: "closure", label: "Closure" },
    { value: "modified_hours", label: "Modified hours" },
    { value: "event", label: "Event" },
    { value: "other", label: "Other" },
];

const REASON_OPTIONS: Array<{ value: OperatingCalendarReason; label: string }> = [
    { value: "holiday_closure", label: "Holiday" },
    { value: "staff_training", label: "Staff training" },
    { value: "weather_closure", label: "Weather" },
    { value: "maintenance", label: "Maintenance" },
    { value: "special_event", label: "Special event" },
    { value: "other", label: "Other" },
];

function newDraft(kind: "holiday" | "closure" | "hours", today: string, scope: OperatingCalendarScope): Draft {
    if (kind === "holiday") {
        return { scope, name: "", designation: "holiday", effect: "closed", from_date: today, to_date: today, start_time: "", end_time: "", reason_key: "holiday_closure", note: "" };
    }
    if (kind === "hours") {
        return { scope, name: "", designation: "modified_hours", effect: "modified_hours", from_date: today, to_date: today, start_time: "09:00", end_time: "13:00", reason_key: "", note: "" };
    }
    return { scope, name: "", designation: "closure", effect: "closed", from_date: today, to_date: today, start_time: "", end_time: "", reason_key: "", note: "" };
}

function draftFromEntry(e: CalendarEntryView): Draft {
    return {
        scope: e.scope === "organization" ? "organization" : "location",
        name: e.name,
        designation: (e.designation ?? "other") as OperatingCalendarDesignation,
        effect: e.effect as OperatingCalendarEffect,
        from_date: e.fromDate,
        to_date: e.toDate,
        start_time: e.startTime ?? "",
        end_time: e.endTime ?? "",
        reason_key: (e.reasonKey ?? "") as Draft["reason_key"],
        note: e.note ?? "",
    };
}

function scopeBadge(e: CalendarEntryView, rooms: Map<string, string>): string {
    if (e.source === "attendance") return e.scope === "room" ? `Room · ${rooms.get(e.roomId ?? "") ?? "room"} · Attendance` : "Recorded in Attendance";
    return e.scope === "organization" ? "Organization default · inherited" : "This location";
}

export function LocationOperatingCalendarPanel({
    orgId,
    locationId,
    initialData,
}: {
    orgId: string;
    locationId: string;
    /** A calendar already read (server render, tests); it is still refreshed on mount. */
    initialData?: CalendarResponse | null;
}) {
    const [data, setData] = useState<CalendarResponse | null>(initialData ?? null);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [preview, setPreview] = useState<PreviewState | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [showPast, setShowPast] = useState(false);

    const load = useCallback(async () => {
        if (!orgId || !locationId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/operating-calendar?location_id=${encodeURIComponent(locationId)}`, { cache: "no-store" });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error ?? "The operating calendar could not be loaded.");
            setData(j as CalendarResponse);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The operating calendar could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, [orgId, locationId]);

    useEffect(() => {
        void load();
    }, [load]);

    const rooms = useMemo(() => new Map((data?.rooms ?? []).map((r) => [r.id, r.label])), [data]);
    const today = data?.today ?? "";
    const entries = data?.entries ?? [];
    const upcoming = entries.filter((e) => e.toDate >= today);
    const past = entries.filter((e) => e.toDate < today);

    const canEdit = (e: CalendarEntryView) =>
        e.source === "calendar" && (e.scope === "organization" ? data?.can_edit_organization : data?.can_edit_location);

    const send = async (body: Record<string, unknown>) => {
        const res = await fetch("/api/admin/operating-calendar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "The calendar could not be updated.");
        return j;
    };

    const bodyFor = (action: PreviewState["action"], entryId: string | null, draft: Draft | null) => ({
        action,
        entry_id: entryId ?? undefined,
        entry:
            draft && (action === "create" || action === "revise") ?
                {
                    scope: draft.scope,
                    location_id: draft.scope === "location" ? data?.site_id : undefined,
                    name: draft.name,
                    designation: draft.designation,
                    effect: draft.effect,
                    from_date: draft.from_date,
                    to_date: draft.to_date || draft.from_date,
                    start_time: draft.effect === "partial_closure" || draft.effect === "modified_hours" ? draft.start_time : undefined,
                    end_time: draft.effect === "partial_closure" || draft.effect === "modified_hours" ? draft.end_time : undefined,
                    reason_key: draft.reason_key || undefined,
                    note: draft.note || undefined,
                }
            :   undefined,
    });

    const review = async (action: PreviewState["action"], entryId: string | null, draft: Draft | null) => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const j = await send({ mode: "preview", ...bodyFor(action, entryId, draft) });
            setPreview({
                dates: j.dates ?? [],
                sites: j.sites ?? [],
                sites_not_previewed: j.sites_not_previewed ?? 0,
                bookings_newly_affected: j.bookings_newly_affected ?? [],
                bookings_no_longer_affected: j.bookings_no_longer_affected ?? [],
                action,
                entryId,
                draft,
            });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The change could not be reviewed.");
        } finally {
            setBusy(false);
        }
    };

    const commit = async () => {
        if (!preview) return;
        setBusy(true);
        setError(null);
        try {
            await send({ mode: "commit", idempotency_key: `${preview.action}:${preview.entryId ?? "new"}:${Date.now()}`, ...bodyFor(preview.action, preview.entryId, preview.draft) });
            setNotice("Saved. Nothing was sent to families, and existing bookings were not changed.");
            setPreview(null);
            setEditor(null);
            await load();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The change could not be saved.");
        } finally {
            setBusy(false);
        }
    };

    const startCreate = (kind: "holiday" | "closure" | "hours") => {
        setPreview(null);
        setEditor({ action: "create", entryId: null, draft: newDraft(kind, today, data?.can_edit_location ? "location" : "organization") });
    };

    const anyEdit = Boolean(data?.can_edit_location || data?.can_edit_organization);

    return (
        <section className="process-config-setup-card p-3" data-testid="locations-operating-calendar" aria-label="Operating calendar">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-alloy-forge/10 pb-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Operating calendar</h3>
                    <p className="config-typo-sublabel max-w-2xl">
                        Holidays, closures and changed hours for this location. Tours stop offering times the calendar closes; Attendance reads full-day
                        closures. Saving changes nothing already booked and sends nothing to families.
                    </p>
                    {data ?
                        <p className="mt-1 text-[11px] text-alloy-midnight/55" data-testid="operating-calendar-zone">
                            Dates and times are this location’s: {data.timezone}
                            {data.timezone_resolved ? "" : " (no time zone set — add one to this location before adding entries)"}
                        </p>
                    :   null}
                </div>
                {anyEdit ?
                    <div className="flex flex-wrap gap-1.5">
                        <ConfigurationSecondaryButton onClick={() => startCreate("holiday")} data-testid="operating-calendar-add-holiday">
                            + Holiday
                        </ConfigurationSecondaryButton>
                        <ConfigurationSecondaryButton onClick={() => startCreate("closure")} data-testid="operating-calendar-add-closure">
                            + Closure
                        </ConfigurationSecondaryButton>
                        <ConfigurationSecondaryButton onClick={() => startCreate("hours")} data-testid="operating-calendar-add-hours">
                            + Modified hours
                        </ConfigurationSecondaryButton>
                    </div>
                :   null}
            </div>

            {error ?
                <p className="mt-2 text-xs text-red-700" role="alert" data-testid="operating-calendar-error">
                    {error}
                </p>
            :   null}
            {notice ?
                <p className="mt-2 text-xs text-alloy-bend-pine" role="status" data-testid="operating-calendar-notice">
                    {notice}
                </p>
            :   null}

            {editor && data ?
                <CalendarEntryEditor
                    editor={editor}
                    canOrganization={data.can_edit_organization}
                    canLocation={data.can_edit_location}
                    siteLabel={data.site_label}
                    busy={busy}
                    onChange={(draft) => setEditor({ ...editor, draft })}
                    onCancel={() => {
                        setEditor(null);
                        setPreview(null);
                    }}
                    onReview={() => void review(editor.action, editor.entryId, editor.draft)}
                />
            :   null}

            {preview ?
                <ImpactReview preview={preview} busy={busy} onConfirm={() => void commit()} onBack={() => setPreview(null)} />
            :   null}

            {data && data.bookings_needing_attention.length > 0 ?
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="operating-calendar-attention">
                    <div className="text-xs font-semibold text-amber-900">
                        {data.bookings_needing_attention.length} tour {data.bookings_needing_attention.length === 1 ? "booking needs" : "bookings need"} attention
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-amber-900/80">
                        Booked before the calendar changed. They are unchanged and still hold their places; nothing was sent to the families. Open each to
                        reschedule or cancel.
                    </p>
                    <BookingList bookings={data.bookings_needing_attention} testId="operating-calendar-attention-booking" />
                </div>
            :   null}

            {loading && !data ?
                <p className="mt-3 text-xs text-alloy-midnight/55">Loading calendar…</p>
            :   null}

            {data ?
                <div className="mt-3 space-y-1.5" data-testid="operating-calendar-entries">
                    {upcoming.length === 0 ?
                        <p className="config-typo-sublabel" data-testid="operating-calendar-empty">
                            No upcoming holidays, closures or changed hours. Ordinary hours apply.
                        </p>
                    :   null}
                    {(showPast ? [...past, ...upcoming] : upcoming).map((e) => (
                        <div
                            key={e.lineageId}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-alloy-forge/10 px-2.5 py-2 ${
                                e.status === "withdrawn" ? "bg-alloy-stone/5 opacity-70" : "bg-white"
                            }`}
                            data-testid={`operating-calendar-entry-${e.lineageId}`}
                            data-entry-scope={e.scope}
                            data-entry-status={e.status}
                        >
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-alloy-midnight">
                                    {e.name || "Untitled"}
                                    {e.status === "withdrawn" ?
                                        <span className="ml-1.5 font-normal text-alloy-midnight/55">· withdrawn</span>
                                    :   null}
                                </div>
                                <div className="text-[11.5px] text-alloy-midnight/65">
                                    {formatCalendarDateRange(e.fromDate, e.toDate)}
                                    {calendarDayCount(e.fromDate, e.toDate) > 1 ? ` (${calendarDayCount(e.fromDate, e.toDate)} days)` : ""} ·{" "}
                                    {describeEntryEffect(e.effect, e.startTime, e.endTime)}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-alloy-forge/12 bg-alloy-stone/10 px-2 py-0.5 text-[11px] text-alloy-midnight/60">
                                    {scopeBadge(e, rooms)}
                                </span>
                                {canEdit(e) && e.status === "active" ?
                                    <>
                                        <ConfigurationInlineButton
                                            onClick={() => {
                                                setPreview(null);
                                                setEditor({ action: "revise", entryId: e.entryId, draft: draftFromEntry(e) });
                                            }}
                                            data-testid={`operating-calendar-edit-${e.lineageId}`}
                                        >
                                            {e.scope === "organization" ? "Edit default" : "Edit"}
                                        </ConfigurationInlineButton>
                                        <ConfigurationInlineButton
                                            onClick={() => void review("withdraw", e.entryId, null)}
                                            data-testid={`operating-calendar-withdraw-${e.lineageId}`}
                                        >
                                            {e.effect === "closed" || e.effect === "partial_closure" ? "Reopen" : "Withdraw"}
                                        </ConfigurationInlineButton>
                                    </>
                                :   null}
                                {canEdit(e) && e.status === "withdrawn" ?
                                    <ConfigurationInlineButton
                                        onClick={() => void review("restore", e.entryId, null)}
                                        data-testid={`operating-calendar-restore-${e.lineageId}`}
                                    >
                                        Restore
                                    </ConfigurationInlineButton>
                                :   null}
                                {e.scope === "organization" && e.status === "active" && data.can_edit_location ?
                                    <ConfigurationInlineButton
                                        onClick={() => {
                                            setPreview(null);
                                            setEditor({
                                                action: "create",
                                                entryId: null,
                                                draft: {
                                                    ...draftFromEntry(e),
                                                    scope: "location",
                                                    name: `${e.name} — ${data.site_label}`,
                                                    effect: "open_as_usual",
                                                    start_time: "",
                                                    end_time: "",
                                                },
                                            });
                                        }}
                                        data-testid={`operating-calendar-override-${e.lineageId}`}
                                    >
                                        Exception here
                                    </ConfigurationInlineButton>
                                :   null}
                            </div>
                        </div>
                    ))}
                    {past.length > 0 ?
                        <ConfigurationInlineButton onClick={() => setShowPast((v) => !v)} data-testid="operating-calendar-toggle-past">
                            {showPast ? "Hide past entries" : `Show ${past.length} past ${past.length === 1 ? "entry" : "entries"}`}
                        </ConfigurationInlineButton>
                    :   null}
                </div>
            :   null}
        </section>
    );
}

function CalendarEntryEditor({
    editor,
    canOrganization,
    canLocation,
    siteLabel,
    busy,
    onChange,
    onCancel,
    onReview,
}: {
    editor: EditorState;
    canOrganization: boolean;
    canLocation: boolean;
    siteLabel: string;
    busy: boolean;
    onChange: (d: Draft) => void;
    onCancel: () => void;
    onReview: () => void;
}) {
    const d = editor.draft;
    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...d, [k]: v });
    const timed = d.effect === "partial_closure" || d.effect === "modified_hours";
    const effects = EFFECT_OPTIONS.filter((o) => o.value !== "open_as_usual" || d.scope === "location");
    return (
        <div className="mt-3 rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 p-3" data-testid="operating-calendar-editor">
            <div className="text-xs font-semibold text-alloy-midnight/75">{editor.action === "revise" ? "Edit calendar entry" : "New calendar entry"}</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs sm:col-span-2">
                    Applies to
                    <select
                        className="config-runtime-input mt-1"
                        value={d.scope}
                        disabled={editor.action === "revise"}
                        onChange={(e) => set("scope", e.target.value as OperatingCalendarScope)}
                        data-testid="operating-calendar-scope"
                    >
                        {canLocation || d.scope === "location" ?
                            <option value="location">{siteLabel} only</option>
                        :   null}
                        {canOrganization || d.scope === "organization" ?
                            <option value="organization">Every location (organization default)</option>
                        :   null}
                    </select>
                </label>
                <label className="text-xs sm:col-span-2">
                    Name
                    <input className="config-runtime-input mt-1" value={d.name} maxLength={120} placeholder="e.g. Thanksgiving" onChange={(e) => set("name", e.target.value)} data-testid="operating-calendar-name" />
                </label>
                <label className="text-xs">
                    Kind of day
                    <select className="config-runtime-input mt-1" value={d.designation} onChange={(e) => set("designation", e.target.value as OperatingCalendarDesignation)} data-testid="operating-calendar-designation">
                        {DESIGNATION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    What happens
                    <select className="config-runtime-input mt-1" value={d.effect} onChange={(e) => set("effect", e.target.value as OperatingCalendarEffect)} data-testid="operating-calendar-effect">
                        {effects.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    First day
                    <input type="date" className="config-runtime-input mt-1" value={d.from_date} onChange={(e) => onChange({ ...d, from_date: e.target.value, to_date: d.to_date < e.target.value ? e.target.value : d.to_date })} data-testid="operating-calendar-from" />
                </label>
                <label className="text-xs">
                    Last day
                    <input type="date" className="config-runtime-input mt-1" value={d.to_date} min={d.from_date} onChange={(e) => set("to_date", e.target.value)} data-testid="operating-calendar-to" />
                </label>
                {timed ?
                    <>
                        <label className="text-xs">
                            {d.effect === "partial_closure" ? "Closed from" : "Open from"}
                            <input type="time" className="config-runtime-input mt-1" value={d.start_time} onChange={(e) => set("start_time", e.target.value)} data-testid="operating-calendar-start" />
                        </label>
                        <label className="text-xs">
                            {d.effect === "partial_closure" ? "Closed until" : "Open until"}
                            <input type="time" className="config-runtime-input mt-1" value={d.end_time} onChange={(e) => set("end_time", e.target.value)} data-testid="operating-calendar-end" />
                        </label>
                        <p className="text-[11px] text-alloy-midnight/55 sm:col-span-2">The same hours apply on every day of the range. An interval cannot run past midnight.</p>
                    </>
                :   null}
                <label className="text-xs">
                    Reason
                    <select className="config-runtime-input mt-1" value={d.reason_key} onChange={(e) => set("reason_key", e.target.value as Draft["reason_key"])} data-testid="operating-calendar-reason">
                        <option value="">—</option>
                        {REASON_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    Note (staff only)
                    <input className="config-runtime-input mt-1" value={d.note} maxLength={500} onChange={(e) => set("note", e.target.value)} data-testid="operating-calendar-note" />
                </label>
            </div>
            <div className="mt-3 flex gap-2">
                <ConfigurationPrimaryButton disabled={busy} onClick={onReview} data-testid="operating-calendar-review">
                    Review impact
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton disabled={busy} onClick={onCancel}>
                    Cancel
                </ConfigurationSecondaryButton>
            </div>
        </div>
    );
}

export function ImpactReview({ preview, busy, onConfirm, onBack }: { preview: PreviewState; busy: boolean; onConfirm: () => void; onBack: () => void }) {
    const bySite = new Map<string, DateImpact[]>();
    for (const d of preview.dates) {
        const list = bySite.get(d.siteLabel);
        if (list) list.push(d);
        else bySite.set(d.siteLabel, [d]);
    }
    return (
        <div className="mt-3 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.04] p-3" data-testid="operating-calendar-impact">
            <div className="text-xs font-semibold text-alloy-midnight">Before you save</div>
            {preview.dates.length === 0 ?
                <p className="mt-1 text-xs text-alloy-midnight/70" data-testid="operating-calendar-impact-none">
                    This changes no location’s operating hours (a name only, or already in effect).
                </p>
            :   <div className="mt-1 space-y-2">
                    {[...bySite.entries()].map(([site, dates]) => (
                        <div key={site}>
                            <div className="text-[11.5px] font-semibold text-alloy-midnight/80">
                                {site} · {dates.length} {dates.length === 1 ? "date" : "dates"}
                            </div>
                            <ul className="mt-0.5 space-y-0.5">
                                {dates.slice(0, 31).map((d) => (
                                    <li key={`${d.siteId}:${d.date}`} className="text-[11.5px] text-alloy-midnight/70" data-testid="operating-calendar-impact-date">
                                        {formatCalendarDate(d.date)}: {describeDayState(d.before)} → <span className="font-semibold">{describeDayState(d.after)}</span>
                                        {d.conflicts.length > 0 ? <span className="ml-1 text-amber-700">({d.conflicts.join(" ")})</span> : null}
                                    </li>
                                ))}
                                {dates.length > 31 ? <li className="text-[11px] text-alloy-midnight/55">…and {dates.length - 31} more</li> : null}
                            </ul>
                        </div>
                    ))}
                    {preview.sites_not_previewed > 0 ?
                        <p className="text-[11px] text-alloy-midnight/55">{preview.sites_not_previewed} more locations are affected the same way.</p>
                    :   null}
                </div>
            }
            {preview.bookings_newly_affected.length > 0 ?
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2" data-testid="operating-calendar-impact-bookings">
                    <div className="text-[11.5px] font-semibold text-amber-900">
                        {preview.bookings_newly_affected.length} existing tour {preview.bookings_newly_affected.length === 1 ? "booking falls" : "bookings fall"} in
                        this change
                    </div>
                    <p className="text-[11px] text-amber-900/80">
                        They will not be cancelled, moved or messaged. They will be listed here as needing attention.
                    </p>
                    <BookingList bookings={preview.bookings_newly_affected} testId="operating-calendar-impact-booking" />
                </div>
            :   null}
            {preview.bookings_no_longer_affected.length > 0 ?
                <p className="mt-2 text-[11.5px] text-alloy-midnight/70" data-testid="operating-calendar-impact-cleared">
                    {preview.bookings_no_longer_affected.length} {preview.bookings_no_longer_affected.length === 1 ? "booking" : "bookings"} will no longer need
                    attention.
                </p>
            :   null}
            <div className="mt-3 flex gap-2">
                <ConfigurationPrimaryButton disabled={busy} onClick={onConfirm} data-testid="operating-calendar-confirm">
                    Save
                </ConfigurationPrimaryButton>
                <ConfigurationSecondaryButton disabled={busy} onClick={onBack}>
                    Back
                </ConfigurationSecondaryButton>
            </div>
        </div>
    );
}

function BookingList({ bookings, testId }: { bookings: AttentionBooking[]; testId: string }) {
    return (
        <ul className="mt-1.5 space-y-0.5">
            {bookings.slice(0, 25).map((b) => (
                <li key={b.booking_id} className="text-[11.5px] text-alloy-midnight/80" data-testid={testId} data-booking-id={b.booking_id}>
                    {formatTourInstantForOperator(b.start_at, b.timezone)} · {ATTENTION_REASON[b.reason]}
                    {b.entry_names.length > 0 ? ` (${b.entry_names.join(", ")})` : ""}
                    {b.primary_person_id ?
                        <>
                            {" "}
                            ·{" "}
                            <a className="font-semibold text-alloy-bend-pine underline-offset-2 hover:underline" href={durableRecordHref("person", b.primary_person_id)}>
                                Open record
                            </a>
                        </>
                    :   null}
                </li>
            ))}
            {bookings.length > 25 ? <li className="text-[11px] text-alloy-midnight/55">…and {bookings.length - 25} more</li> : null}
        </ul>
    );
}
