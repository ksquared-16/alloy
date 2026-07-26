"use client";

import { useEffect, useState } from "react";
import { Plus, Tag } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import type { AssignmentTypeAdminRecord } from "@/lib/operationalAssignments/assignmentTypeService";
import type { AssignmentTypeBehavior } from "@/lib/operationalAssignments/assignmentTypeBehavior";

const TONE_OPTIONS = [
    { value: "neutral", label: "Neutral" },
    { value: "info", label: "Info" },
    { value: "success", label: "Success" },
    { value: "warning", label: "Warning" },
    { value: "accent", label: "Accent" },
];

const BILLING_OPTIONS = [
    { value: "none", label: "None" },
    { value: "eligible", label: "Billing eligible" },
];

const ATTENDANCE_OPTIONS = [
    { value: "none", label: "None" },
    { value: "expected", label: "Expected" },
];

const STAFFING_OPTIONS = [
    { value: "none", label: "None" },
    { value: "demand", label: "Demand" },
    { value: "supply", label: "Supply" },
];

type FormState = {
    label: string;
    iconKey: string;
    visualTone: string;
    billingParticipation: string;
    attendanceParticipation: string;
    staffingParticipation: string;
    behavior: AssignmentTypeBehavior;
};

function emptyForm(): FormState {
    return {
        label: "",
        iconKey: "calendar-clock",
        visualTone: "neutral",
        billingParticipation: "none",
        attendanceParticipation: "expected",
        staffingParticipation: "none",
        behavior: {
            description: "",
            primaryEligible: true,
            requiresProgram: true,
            requiresRoom: true,
            allowsOverlap: false,
            locationIds: [],
        },
    };
}

function formFromType(t: AssignmentTypeAdminRecord): FormState {
    return {
        label: t.label ?? "",
        iconKey: t.iconKey ?? "calendar-clock",
        visualTone: t.visualTone ?? "neutral",
        billingParticipation: t.billingParticipation ?? "none",
        attendanceParticipation: t.attendanceParticipation ?? "expected",
        staffingParticipation: t.staffingParticipation ?? "none",
        behavior: { ...t.behavior },
    };
}

export default function AssignmentTypesStudioPanel({
    types,
    loading,
    siteName,
    sites,
    onChanged,
}: {
    types: AssignmentTypeAdminRecord[];
    loading: boolean;
    siteName: string;
    sites: { id: string; name: string }[];
    onChanged: () => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (editingId) {
            const t = types.find((row) => row.id === editingId);
            if (t) setForm(formFromType(t));
        } else if (!creating) {
            setForm(emptyForm());
        }
    }, [editingId, creating, types]);

    const payload = () => ({
        label: form.label,
        iconKey: form.iconKey,
        visualTone: form.visualTone,
        billingParticipation: form.billingParticipation,
        attendanceParticipation: form.attendanceParticipation,
        staffingParticipation: form.staffingParticipation,
        behavior: form.behavior,
        subjectTypes: ["child"],
    });

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(
                editingId ? `/api/admin/assignment-types/${editingId}` : "/api/admin/assignment-types",
                {
                    method: editingId ? "PATCH" : "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload()),
                },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error ?? "Save failed");
            setEditingId(null);
            setCreating(false);
            setForm(emptyForm());
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setBusy(false);
        }
    };

    const archive = async (id: string) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/assignment-types/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "archive" }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error ?? "Archive failed");
            if (editingId === id) setEditingId(null);
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Archive failed");
        } finally {
            setBusy(false);
        }
    };

    const showForm = creating || editingId != null;

    return (
        <div data-assignment-studio-types="true">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className={WS_EYEBROW}>Assignment types</p>
                    <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                        Org-owned vocabulary for operational assignments at {siteName}. Types drive pickers,
                        billing participation, and attendance expectations.
                    </p>
                </div>
                {!showForm ? (
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[12px] font-semibold text-white"
                        onClick={() => {
                            setCreating(true);
                            setEditingId(null);
                            setForm(emptyForm());
                        }}
                        data-assignment-type-create="true"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Create type
                    </button>
                ) : null}
            </div>

            {error ? (
                <p className="mt-2 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember">
                    {error}
                </p>
            ) : null}

            {showForm ? (
                <WorkspaceCard className="mt-3 p-4" data-assignment-type-form="true">
                    <p className="text-[13px] font-semibold text-alloy-midnight">
                        {editingId ? "Edit Assignment Type" : "Create Assignment Type"}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <label className="grid gap-1 md:col-span-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Name
                            </span>
                            <input
                                value={form.label}
                                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                                className="rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                            />
                        </label>
                        <label className="grid gap-1 md:col-span-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Description
                            </span>
                            <textarea
                                value={form.behavior.description ?? ""}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        behavior: { ...f.behavior, description: e.target.value },
                                    }))
                                }
                                rows={2}
                                className="resize-none rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Icon key
                            </span>
                            <input
                                value={form.iconKey}
                                onChange={(e) => setForm((f) => ({ ...f, iconKey: e.target.value }))}
                                className="rounded-lg border border-alloy-stone/25 px-2.5 py-2 text-[12px]"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Visual tone
                            </span>
                            <AlloySelect
                                value={form.visualTone}
                                onChange={(v) => setForm((f) => ({ ...f, visualTone: v }))}
                                options={TONE_OPTIONS}
                                aria-label="Visual tone"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Financial category
                            </span>
                            <AlloySelect
                                value={form.billingParticipation}
                                onChange={(v) => setForm((f) => ({ ...f, billingParticipation: v }))}
                                options={BILLING_OPTIONS}
                                aria-label="Financial category"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Attendance effect
                            </span>
                            <AlloySelect
                                value={form.attendanceParticipation}
                                onChange={(v) => setForm((f) => ({ ...f, attendanceParticipation: v }))}
                                options={ATTENDANCE_OPTIONS}
                                aria-label="Attendance effect"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Staffing / ratio effect
                            </span>
                            <AlloySelect
                                value={form.staffingParticipation}
                                onChange={(v) => setForm((f) => ({ ...f, staffingParticipation: v }))}
                                options={STAFFING_OPTIONS}
                                aria-label="Staffing effect"
                            />
                        </label>
                        <fieldset className="grid gap-2 md:col-span-2">
                            <legend className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Requirements
                            </legend>
                            {(
                                [
                                    ["primaryEligible", "Primary eligible"],
                                    ["requiresProgram", "Requires program"],
                                    ["requiresRoom", "Requires room"],
                                    ["allowsOverlap", "Allows overlap"],
                                ] as const
                            ).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 text-[12px] text-alloy-midnight">
                                    <input
                                        type="checkbox"
                                        checked={form.behavior[key] === true}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                behavior: { ...f.behavior, [key]: e.target.checked },
                                            }))
                                        }
                                    />
                                    {label}
                                </label>
                            ))}
                        </fieldset>
                        {sites.length > 1 ? (
                            <label className="grid gap-1 md:col-span-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                    Location availability (empty = org-wide)
                                </span>
                                <select
                                    multiple
                                    value={form.behavior.locationIds ?? []}
                                    onChange={(e) => {
                                        const selected = [...e.target.selectedOptions].map((o) => o.value);
                                        setForm((f) => ({
                                            ...f,
                                            behavior: { ...f.behavior, locationIds: selected },
                                        }));
                                    }}
                                    className="min-h-[80px] rounded-lg border border-alloy-stone/25 px-2 py-1 text-[12px]"
                                >
                                    {sites.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy || !form.label.trim()}
                            className="rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                            onClick={() => void save()}
                        >
                            {busy ? "Saving…" : "Save type"}
                        </button>
                        <button
                            type="button"
                            className="rounded-lg px-3 py-2 text-[12px] font-semibold text-alloy-slate"
                            onClick={() => {
                                setCreating(false);
                                setEditingId(null);
                                setError(null);
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </WorkspaceCard>
            ) : null}

            {loading && types.length === 0 ?
                <p className="mt-3 text-[12px] text-alloy-slate">Loading…</p>
            : types.length === 0 && !showForm ?
                <WorkspaceCard className="mt-3 p-4" data-assignment-types-empty="true">
                    <p className="text-[13px] font-semibold text-alloy-midnight">No Assignment Types yet</p>
                    <p className="mt-1 text-[12px] text-alloy-slate">
                        Create Assignment Types here (Primary Classroom, Before Care, Enrichment, and similar) so
                        operators can add typed assignments from the Focus Panel and Workspace.
                    </p>
                </WorkspaceCard>
            :   <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {types.map((t) => (
                        <WorkspaceCard
                            key={t.id ?? t.key}
                            flat
                            className={`p-4 ${t.isActive ? "" : "opacity-60"}`}
                            data-assignment-type-row={t.key}
                        >
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/10 text-alloy-bend-pine">
                                    <Tag className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-semibold text-alloy-midnight">{t.label}</p>
                                    {t.behavior.description ? (
                                        <p className="mt-0.5 text-[11px] text-alloy-slate">{t.behavior.description}</p>
                                    ) : null}
                                    <p className="mt-0.5 text-[11px] text-alloy-slate">
                                        Billing: {t.billingParticipation ?? "none"} · Attendance:{" "}
                                        {t.attendanceParticipation ?? "none"}
                                    </p>
                                    <p className="mt-1 text-[10px] text-alloy-midnight/45">
                                        <code className="text-alloy-midnight/40">{t.key}</code>
                                        {!t.isActive ? " · archived" : ""}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="text-[11px] font-semibold text-alloy-bend-pine"
                                    onClick={() => {
                                        setEditingId(t.id);
                                        setCreating(false);
                                    }}
                                >
                                    Edit
                                </button>
                                {t.isActive ? (
                                    <button
                                        type="button"
                                        className="text-[11px] font-semibold text-alloy-ember"
                                        disabled={busy}
                                        onClick={() => void archive(t.id!)}
                                    >
                                        Archive
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="text-[11px] font-semibold text-alloy-slate"
                                        disabled={busy}
                                        onClick={async () => {
                                            setBusy(true);
                                            try {
                                                const res = await fetch(`/api/admin/assignment-types/${t.id}`, {
                                                    method: "PATCH",
                                                    headers: { "content-type": "application/json" },
                                                    body: JSON.stringify({ action: "activate" }),
                                                });
                                                const body = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error(body?.error ?? "Activate failed");
                                                onChanged();
                                            } catch (e) {
                                                setError(e instanceof Error ? e.message : "Activate failed");
                                            } finally {
                                                setBusy(false);
                                            }
                                        }}
                                    >
                                        Activate
                                    </button>
                                )}
                            </div>
                        </WorkspaceCard>
                    ))}
                </div>
            }
        </div>
    );
}
