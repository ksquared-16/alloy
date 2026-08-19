"use client";

/**
 * Studio · Schedule Patterns — the administration surface for a site's reusable schedule
 * shapes. Operators create, edit, duplicate, archive, and preview patterns here in place
 * (never redirected to Settings). Writes go through the governed
 * `/api/admin/schedule-patterns` endpoints (the container owns the I/O); this component
 * owns the operator experience only.
 *
 * Canonical `schedule_patterns` · shared with Locations — Studio and Locations →
 * Schedule (`LocationSchedulePatternsSettingsPanel` / `LocationSchedulePatternCreatePanel`)
 * read/write the exact same table through the same `/api/admin/schedule-patterns`
 * endpoints. There is no separate Studio-only pattern store. A Pattern belongs to ONE
 * site (`site_location_id`) — there is no org-wide pattern row; "available everywhere"
 * means creating the same-shaped Pattern at each site that needs it (see
 * docs/platform/planning/assignment-platform-settings-inventory.md §"Schedule patterns").
 */

import { useMemo, useState } from "react";
import { ArchiveRestore, ArrowLeft, CalendarRange, Copy, Eye, Pencil, Plus, Power } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { WS_ACTION_PRIMARY, WS_EYEBROW, WS_FIELD_SELECT_CHROME } from "@/components/workspace/workspaceTokens";
import { resolveOperatorLabel } from "@/lib/adminV2/scheduling/resolveOperatorLabel";
import { allowedPatternWeekdays } from "@/lib/locations/locationSchedulingConfig";
import { resolveVisibleDayPills } from "@/lib/scheduling/dayPills";

export type StudioPattern = {
    id: string;
    key: string;
    label: string;
    scheduleTypeKey: string;
    weekdays: number[];
    isActive: boolean;
    sortOrder: number;
    metadata: Record<string, unknown>;
    hours: { arrive: string; depart: string } | null;
    perDayEnabled: boolean;
    defaultDays: number[];
    programKeys: string[];
};

export type PatternEditorConfig = {
    operatingDays: number[];
    scheduleTypes: { key: string; label: string; behavior?: string }[];
    programs: { key: string; label: string }[];
    /** Operational spaces for Category eligibility — shared Workspace snapshot. */
    operationalRooms?: { roomId: string; roomName: string | null }[];
};

export type PatternInput = {
    label: string;
    scheduleTypeKey: string;
    weekdays: number[];
    defaultDays: number[];
    hours: { arrive: string; depart: string } | null;
    perDayEnabled: boolean;
    active: boolean;
    programKeys: string[];
};

export type PatternMutation =
    | { kind: "create"; data: PatternInput }
    | { kind: "update"; id: string; baseMetadata: Record<string, unknown>; data: PatternInput }
    | { kind: "archive"; id: string }
    | { kind: "restore"; id: string }
    | { kind: "duplicate"; source: StudioPattern };

const DAY_LABEL: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 0: "Sun" };

function typeLabel(config: PatternEditorConfig, key: string): string {
    return resolveOperatorLabel(key, config.scheduleTypes);
}

function programLabel(config: PatternEditorConfig, key: string): string {
    return resolveOperatorLabel(key, config.programs);
}

export default function SchedulingPatterns({
    patterns,
    editorConfig,
    loading,
    siteName,
    onMutate,
}: {
    patterns: StudioPattern[];
    editorConfig: PatternEditorConfig;
    loading: boolean;
    siteName: string;
    onMutate: (m: PatternMutation) => Promise<{ ok: boolean; error?: string }>;
}) {
    const [editing, setEditing] = useState<StudioPattern | "new" | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const active = patterns.filter((p) => p.isActive);
    const archived = patterns.filter((p) => !p.isActive);

    const run = async (m: PatternMutation, id: string) => {
        setBusyId(id);
        await onMutate(m);
        setBusyId(null);
    };

    if (editing) {
        return (
            <PatternEditor
                pattern={editing === "new" ? null : editing}
                config={editorConfig}
                siteName={siteName}
                onCancel={() => setEditing(null)}
                onSave={async (data) => {
                    const res =
                        editing === "new"
                            ? await onMutate({ kind: "create", data })
                            : await onMutate({ kind: "update", id: editing.id, baseMetadata: editing.metadata, data });
                    if (res.ok) setEditing(null);
                    return res;
                }}
            />
        );
    }

    return (
        <div data-scheduling-patterns="true">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className={WS_EYEBROW}>Schedule patterns · {siteName}</p>
                    <p className="mt-1 text-[12px] text-alloy-slate">
                        Reusable day + hours shapes the schedule editor applies to a child's whole schedule.
                    </p>
                </div>
                <button type="button" className={WS_ACTION_PRIMARY} onClick={() => setEditing("new")} data-pattern-new="true">
                    <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} /> New pattern
                </button>
            </div>

            {loading && patterns.length === 0 ? (
                <p className="mt-4 text-[12px] text-alloy-slate">Loading patterns…</p>
            ) : patterns.length === 0 ? (
                <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/25 bg-white px-6 py-14 text-center">
                    <p className="text-[13px] font-semibold text-alloy-midnight">No schedule patterns yet</p>
                    <p className="mt-1 max-w-md text-[12px] text-alloy-slate">
                        Create a pattern — e.g. “Full day, Mon–Fri, 8:30–5:30” — and it becomes a one-click shortcut in the schedule editor.
                    </p>
                    {/*
                      * NO SECOND PRIMARY HERE.
                      *
                      * This rendered a duplicate `New pattern` primary directly beneath the section
                      * command, so an empty Studio showed the same action twice and neither read as
                      * the canonical one. The empty state's job is to explain the capability; the
                      * command lives in one place, above, where it is also present once the section
                      * has content.
                      */}
                </div>
            ) : (
                <div className="mt-4 flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {active.map((p) => (
                            <PatternCard
                                key={p.id}
                                p={p}
                                config={editorConfig}
                                busy={busyId === p.id}
                                previewing={previewId === p.id}
                                onEdit={() => setEditing(p)}
                                onDuplicate={() => run({ kind: "duplicate", source: p }, p.id)}
                                onArchive={() => run({ kind: "archive", id: p.id }, p.id)}
                                onRestore={() => run({ kind: "restore", id: p.id }, p.id)}
                                onTogglePreview={() => setPreviewId(previewId === p.id ? null : p.id)}
                            />
                        ))}
                    </div>

                    {archived.length > 0 ? (
                        <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-slate">Archived</p>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                {archived.map((p) => (
                                    <PatternCard
                                        key={p.id}
                                        p={p}
                                        config={editorConfig}
                                        busy={busyId === p.id}
                                        previewing={previewId === p.id}
                                        onEdit={() => setEditing(p)}
                                        onDuplicate={() => run({ kind: "duplicate", source: p }, p.id)}
                                        onArchive={() => run({ kind: "archive", id: p.id }, p.id)}
                                        onRestore={() => run({ kind: "restore", id: p.id }, p.id)}
                                        onTogglePreview={() => setPreviewId(previewId === p.id ? null : p.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function DayRow({ weekdays, defaultDays }: { weekdays: number[]; defaultDays: number[] }) {
    const pills = resolveVisibleDayPills(weekdays, weekdays); // only the pattern's own days, Mon-first
    const defaults = new Set(defaultDays.length ? defaultDays : weekdays);
    if (pills.length === 0) return <span className="text-[11px] text-alloy-slate">No days</span>;
    return (
        <div className="flex gap-1" aria-label="Days">
            {pills.map((d) => (
                <span
                    key={d.weekday}
                    title={defaults.has(d.weekday) ? "Default day" : "Available day"}
                    className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1 text-[10px] font-semibold ${
                        defaults.has(d.weekday)
                            ? "bg-alloy-bend-pine/12 text-alloy-bend-pine"
                            : "bg-alloy-bend-pine/[0.05] text-alloy-bend-pine/60 ring-1 ring-inset ring-alloy-bend-pine/20"
                    }`}
                >
                    {d.label}
                </span>
            ))}
        </div>
    );
}

function PatternCard({
    p,
    config,
    busy,
    previewing,
    onEdit,
    onDuplicate,
    onArchive,
    onRestore,
    onTogglePreview,
}: {
    p: StudioPattern;
    config: PatternEditorConfig;
    busy: boolean;
    previewing: boolean;
    onEdit: () => void;
    onDuplicate: () => void;
    onArchive: () => void;
    onRestore: () => void;
    onTogglePreview: () => void;
}) {
    const programNames = p.programKeys.map((k) => programLabel(config, k));
    return (
        <WorkspaceCard className={`p-4 ${p.isActive ? "" : "opacity-70"}`} data-scheduling-pattern={p.id}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/10 text-alloy-bend-pine">
                        <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    <span className="truncate text-[13px] font-semibold text-alloy-midnight">{p.label}</span>
                </div>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        p.isActive ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "bg-alloy-stone/40 text-alloy-midnight/55"
                    }`}
                >
                    {p.isActive ? "Active" : "Archived"}
                </span>
            </div>

            <div className="mt-3">
                <DayRow weekdays={p.weekdays} defaultDays={p.defaultDays} />
            </div>
            <p className="mt-2 text-[11px] text-alloy-slate">
                {p.hours ? `${p.hours.arrive}–${p.hours.depart}` : "Hours not set"} · {typeLabel(config, p.scheduleTypeKey)}
                {p.perDayEnabled ? " · per-day times" : ""}
            </p>
            {programNames.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                    {programNames.map((n) => (
                        <span key={n} className="rounded-md bg-alloy-stone/30 px-1.5 py-0.5 text-[9.5px] font-medium text-alloy-midnight/65">
                            {n}
                        </span>
                    ))}
                </div>
            ) : null}

            {previewing ? (
                <div className="mt-3 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Preview</p>
                    <p className="mt-1 text-[12px] text-alloy-midnight">
                        Applies <strong>{p.defaultDays.length || p.weekdays.length}</strong> days
                        {p.hours ? ` at ${p.hours.arrive}–${p.hours.depart}` : ""} —{" "}
                        {(p.defaultDays.length ? p.defaultDays : p.weekdays).map((d) => DAY_LABEL[d]).join(", ")}.
                    </p>
                </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-alloy-stone/12 pt-3">
                <ActionBtn onClick={onEdit} icon={<Pencil className="h-3 w-3" />} label="Edit" testId="pattern-edit" />
                <ActionBtn onClick={onTogglePreview} icon={<Eye className="h-3 w-3" />} label="Preview" testId="pattern-preview" />
                <ActionBtn onClick={onDuplicate} icon={<Copy className="h-3 w-3" />} label="Duplicate" testId="pattern-duplicate" disabled={busy} />
                {p.isActive ? (
                    <ActionBtn onClick={onArchive} icon={<Power className="h-3 w-3" />} label="Archive" testId="pattern-archive" disabled={busy} />
                ) : (
                    <ActionBtn onClick={onRestore} icon={<ArchiveRestore className="h-3 w-3" />} label="Restore" testId="pattern-restore" disabled={busy} />
                )}
            </div>
        </WorkspaceCard>
    );
}

function ActionBtn({
    onClick,
    icon,
    label,
    testId,
    disabled,
}: {
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    testId: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-pattern-action={testId}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/[0.08] hover:text-alloy-midnight disabled:opacity-50"
        >
            {icon}
            {label}
        </button>
    );
}

// ── Editor sections — Identity · Schedule · Availability, like Assignment
//    Categories' Back-link + title/Save-Cancel header, constrained to ~720px. ─────
function PatternSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-alloy-stone/15 pt-3.5 first:border-t-0 first:pt-0" data-pattern-section={title}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">{title}</p>
            <div className="mt-2.5 grid gap-3">{children}</div>
        </section>
    );
}

function PatternEditor({
    pattern,
    config,
    siteName,
    onCancel,
    onSave,
}: {
    pattern: StudioPattern | null;
    config: PatternEditorConfig;
    siteName: string;
    onCancel: () => void;
    onSave: (data: PatternInput) => Promise<{ ok: boolean; error?: string }>;
}) {
    const allowed = useMemo(() => allowedPatternWeekdays(config.operatingDays), [config.operatingDays]);
    const [label, setLabel] = useState(pattern?.label ?? "");
    const [scheduleTypeKey, setScheduleTypeKey] = useState(
        pattern?.scheduleTypeKey ?? config.scheduleTypes[0]?.key ?? ""
    );
    const [weekdays, setWeekdays] = useState<number[]>(pattern?.weekdays ?? [...allowed]);
    const [defaultDays, setDefaultDays] = useState<number[]>(pattern?.defaultDays ?? pattern?.weekdays ?? [...allowed]);
    const [arrive, setArrive] = useState(pattern?.hours?.arrive ?? "");
    const [depart, setDepart] = useState(pattern?.hours?.depart ?? "");
    const [perDayEnabled, setPerDayEnabled] = useState(pattern?.perDayEnabled ?? false);
    const [active, setActive] = useState(pattern?.isActive ?? true);
    const [programKeys, setProgramKeys] = useState<string[]>(pattern?.programKeys ?? []);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const orderedAllowed = useMemo(() => [1, 2, 3, 4, 5, 6, 0].filter((d) => allowed.includes(d)), [allowed]);

    const toggleAvailable = (d: number) => {
        setWeekdays((cur) => {
            const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
            // keep default days a subset of available
            setDefaultDays((dd) => dd.filter((x) => next.includes(x)));
            return next;
        });
    };
    const toggleDefault = (d: number) => {
        if (!weekdays.includes(d)) return;
        setDefaultDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
    };
    const toggleProgram = (k: string) => {
        setProgramKeys((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
    };

    const save = async () => {
        setError(null);
        if (!label.trim()) return setError("Give the pattern a name.");
        if (!scheduleTypeKey) return setError("Choose a schedule type.");
        if (weekdays.length === 0) return setError("Select at least one day.");
        const hours = arrive && depart ? { arrive, depart } : null;
        if (hours && hours.depart <= hours.arrive) return setError("End time must be after start time.");
        setSaving(true);
        const res = await onSave({
            label: label.trim(),
            scheduleTypeKey,
            weekdays: [...weekdays].sort(),
            defaultDays: (defaultDays.length ? defaultDays : weekdays).filter((d) => weekdays.includes(d)).sort(),
            hours,
            perDayEnabled,
            active,
            programKeys,
        });
        setSaving(false);
        if (!res.ok) setError(res.error ?? "Could not save the pattern.");
    };

    return (
        <div data-pattern-editor="true">
            <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-alloy-bend-pine"
                data-pattern-back="true"
            >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                Back to Patterns
            </button>

            <div className="mx-auto mt-3 grid w-full max-w-[720px] gap-3" data-pattern-form="true">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold text-alloy-midnight">
                        {pattern ? "Edit Pattern" : "Create Pattern"}
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="text-[12px] font-semibold text-alloy-slate"
                            onClick={onCancel}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            data-pattern-save="true"
                            className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                        >
                            {saving ? "Saving…" : pattern ? "Save Pattern" : "Create Pattern"}
                        </button>
                    </div>
                </div>

                {error ? (
                    <p className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember">
                        {error}
                    </p>
                ) : null}

                <PatternSection title="Identity">
                    <Field label="Name">
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="Full day"
                            data-pattern-field="label"
                            className="w-full rounded-md border border-alloy-stone/40 px-3 py-1.5 text-[13px] text-alloy-midnight focus:border-alloy-bend-pine/50 focus:outline-none"
                        />
                    </Field>

                    <Field label="Recurrence" hint="How this pattern repeats — matches one of the site's configured schedule types.">
                        <select
                            value={scheduleTypeKey}
                            onChange={(e) => setScheduleTypeKey(e.target.value)}
                            data-pattern-field="type"
                            className={`${WS_FIELD_SELECT_CHROME} w-full`}
                        >
                            {config.scheduleTypes.length === 0 ? <option value="">No schedule types configured</option> : null}
                            {config.scheduleTypes.map((t) => (
                                <option key={t.key} value={t.key}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <label className="flex items-center gap-2 text-[12.5px] text-alloy-midnight">
                        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} data-pattern-field="active" />
                        Active — offered as a one-click shortcut in the schedule editor
                    </label>
                </PatternSection>

                <PatternSection title="Schedule">
                    <Field label="Available days" hint="The days this pattern can use, limited to the site's operating days.">
                        <div className="flex gap-1.5">
                            {orderedAllowed.map((d) => {
                                const on = weekdays.includes(d);
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => toggleAvailable(d)}
                                        data-pattern-day={d}
                                        aria-pressed={on}
                                        className={`h-8 w-8 rounded-lg text-[11px] font-semibold ${
                                            on ? "bg-alloy-bend-pine/12 text-alloy-bend-pine ring-1 ring-alloy-bend-pine/35" : "bg-alloy-stone/30 text-alloy-midnight/40"
                                        }`}
                                    >
                                        {DAY_LABEL[d].slice(0, 1)}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field
                        label="Default selected days"
                        hint="Which of the available days come pre-checked when an operator applies this pattern — they can still add or remove days before saving."
                    >
                        <div className="flex gap-1.5">
                            {orderedAllowed.map((d) => {
                                const available = weekdays.includes(d);
                                const on = defaultDays.includes(d);
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        disabled={!available}
                                        onClick={() => toggleDefault(d)}
                                        data-pattern-default-day={d}
                                        aria-pressed={on}
                                        className={`h-8 w-8 rounded-lg text-[11px] font-semibold ${
                                            !available
                                                ? "bg-alloy-stone/20 text-alloy-midnight/20"
                                                : on
                                                    ? "bg-alloy-bend-pine/12 text-alloy-bend-pine ring-1 ring-alloy-bend-pine/35"
                                                    : "bg-alloy-stone/30 text-alloy-midnight/40"
                                        }`}
                                    >
                                        {DAY_LABEL[d].slice(0, 1)}
                                    </button>
                                );
                            })}
                        </div>
                        {defaultDays.length > 0 && defaultDays.length < weekdays.length ? (
                            <p className="text-[11px] text-alloy-slate/80">
                                Only {defaultDays.length} of {weekdays.length} available days are pre-checked —
                                the operator can still turn on the rest when applying this pattern.
                            </p>
                        ) : null}
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Default start">
                            <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} data-pattern-field="opens" className="w-full rounded-md border border-alloy-stone/40 px-3 py-1.5 text-[13px] text-alloy-midnight focus:border-alloy-bend-pine/50 focus:outline-none" />
                        </Field>
                        <Field label="Default end">
                            <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} data-pattern-field="closes" className="w-full rounded-md border border-alloy-stone/40 px-3 py-1.5 text-[13px] text-alloy-midnight focus:border-alloy-bend-pine/50 focus:outline-none" />
                        </Field>
                    </div>

                    <label className="flex items-center gap-2 text-[12.5px] text-alloy-midnight">
                        <input type="checkbox" checked={perDayEnabled} onChange={(e) => setPerDayEnabled(e.target.checked)} data-pattern-field="perday" />
                        Allow different start/end times by day
                    </label>
                </PatternSection>

                <PatternSection title="Availability">
                    <p className="text-[11.5px] text-alloy-slate">
                        This Pattern belongs to <strong className="text-alloy-midnight">{siteName || "this site"}</strong> only
                        — Patterns are scoped to one location, the same as Locations → Schedule. To offer the same
                        shape at another site, create it there too (Duplicate copies the shape, not the site).
                    </p>

                    {config.programs.length > 0 ? (
                        <Field label="Applicable programs" hint="Which programs this pattern is offered to — leave empty to offer it for any program.">
                            <div className="flex flex-wrap gap-1.5">
                                {config.programs.map((pr) => {
                                    const on = programKeys.includes(pr.key);
                                    return (
                                        <button
                                            key={pr.key}
                                            type="button"
                                            onClick={() => toggleProgram(pr.key)}
                                            data-pattern-program={pr.key}
                                            aria-pressed={on}
                                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                                on ? "bg-alloy-bend-pine/12 text-alloy-bend-pine ring-1 ring-alloy-bend-pine/30" : "bg-alloy-stone/30 text-alloy-midnight/60"
                                            }`}
                                        >
                                            {pr.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                    ) : null}
                </PatternSection>

                <div
                    className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-alloy-stone/15 bg-white/95 px-1 py-3 backdrop-blur-sm"
                    data-pattern-editor-actions="true"
                >
                    <button
                        type="button"
                        className="text-[12px] font-semibold text-alloy-slate"
                        onClick={onCancel}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || !label.trim() || !scheduleTypeKey || weekdays.length === 0}
                        data-pattern-save-sticky="true"
                        className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                        {saving ? "Saving…" : pattern ? "Save Pattern" : "Create Pattern"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="mt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-alloy-slate">{label}</label>
            {hint ? <p className="mb-1.5 mt-0.5 text-[11px] text-alloy-slate/80">{hint}</p> : <div className="mb-1.5" />}
            {children}
        </div>
    );
}
