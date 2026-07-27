"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";

import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { AlloySelect } from "@/components/workspace/AlloySelect";
import { WS_EYEBROW } from "@/components/workspace/workspaceTokens";
import type { AssignmentTypeAdminRecord } from "@/lib/operationalAssignments/assignmentTypeService";
import {
    ELIGIBLE_CATALOG_CATEGORIES,
    billingParticipationFromExpectation,
    defaultVisualToneForAssignmentTypeLabel,
    type AssignmentTypeBehavior,
    type BillingExpectation,
    type RequirementMode,
} from "@/lib/operationalAssignments/assignmentTypeBehavior";
import {
    ASSIGNMENT_PURPOSE_ICONS,
    resolveAssignmentPurposeIcon,
} from "@/lib/operationalAssignments/assignmentPurposeIcons";

/**
 * visual_tone is a DB-checked enum (neutral|info|success|warning|accent) — no free
 * text. Operator labels are friendlier than the raw tone keys; swatches match the
 * app's existing color language (T.pine / T.blue / T.gold from SchedulingCard).
 */
const APPEARANCE_OPTIONS: { value: string; label: string; swatch: string }[] = [
    { value: "neutral", label: "Neutral", swatch: "#98A2B3" },
    { value: "info", label: "Blue", swatch: "#00458C" },
    { value: "success", label: "Teal", swatch: "#0D9488" },
    { value: "warning", label: "Amber", swatch: "#D0AD50" },
    { value: "accent", label: "Pine", swatch: "#00A283" },
];

function swatchForTone(tone: string | null | undefined): string {
    return APPEARANCE_OPTIONS.find((o) => o.value === tone)?.swatch ?? APPEARANCE_OPTIONS[0]!.swatch;
}

const BILLING_EXPECTATION_OPTIONS: { value: BillingExpectation; label: string }[] = [
    { value: "none", label: "No financial relationship" },
    { value: "optional", label: "Optional billing" },
    { value: "expected", label: "Billing expected" },
    { value: "funding_eligible", label: "Funding/subsidy eligible" },
];

const ATTENDANCE_OPTIONS = [
    { value: "none", label: "Does not expect attendance" },
    { value: "expected", label: "Expects attendance" },
];

const STAFFING_OPTIONS = [
    { value: "none", label: "No staffing effect" },
    { value: "demand", label: "Creates staff demand" },
    { value: "supply", label: "Provides staff supply" },
];

const REQUIREMENT_OPTIONS: { value: RequirementMode; label: string }[] = [
    { value: "required", label: "Required" },
    { value: "optional", label: "Optional" },
    { value: "not_used", label: "Not used" },
];

const SPACE_MODE_OPTIONS = [
    { value: "any", label: "Any valid space" },
    { value: "selected", label: "Selected spaces" },
    { value: "program_match", label: "Spaces matching the selected Program" },
];

type FormState = {
    label: string;
    iconKey: string;
    visualTone: string;
    attendanceParticipation: string;
    staffingParticipation: string;
    behavior: AssignmentTypeBehavior;
};

function emptyForm(): FormState {
    return {
        label: "",
        iconKey: "calendar-clock",
        visualTone: "neutral",
        attendanceParticipation: "expected",
        staffingParticipation: "none",
        behavior: {
            description: "",
            primaryEligible: true,
            allowsOverlap: false,
            programRequirement: "required",
            roomRequirement: "required",
            eligibleSpaceMode: "any",
            eligibleRoomIds: [],
            locationIds: [],
            billingExpectation: "none",
            eligibleCatalogCategories: [],
        },
    };
}

function formFromType(t: AssignmentTypeAdminRecord): FormState {
    const b = t.behavior;
    return {
        label: t.label ?? "",
        iconKey: t.iconKey ?? "calendar-clock",
        visualTone: t.visualTone ?? "neutral",
        attendanceParticipation: t.attendanceParticipation ?? "expected",
        staffingParticipation: t.staffingParticipation ?? "none",
        behavior: {
            ...b,
            programRequirement: b.programRequirement ?? (b.requiresProgram ? "required" : "optional"),
            roomRequirement: b.roomRequirement ?? (b.requiresRoom ? "required" : "optional"),
            eligibleSpaceMode: b.eligibleSpaceMode ?? "any",
            eligibleRoomIds: b.eligibleRoomIds ?? [],
            locationIds: b.locationIds ?? [],
            billingExpectation: b.billingExpectation ?? (t.billingParticipation === "eligible" ? "expected" : "none"),
            eligibleCatalogCategories: b.eligibleCatalogCategories ?? [],
        },
    };
}

/** Divider-based section — replaces the prior bordered-card treatment for a flatter, denser editor. */
function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section
            className="border-t border-alloy-stone/15 pt-3.5 first:border-t-0 first:pt-0"
            data-purpose-section={title}
        >
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/45">{title}</p>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2">{children}</div>
        </section>
    );
}

function FieldLabel({ children }: { children: ReactNode }) {
    return <span className="mb-1 block text-[11px] font-semibold text-alloy-midnight/70">{children}</span>;
}

/** Compact icon field — a single closed control ([icon] Label ▾), never a permanent grid. */
function IconPickerField({
    iconKey,
    query,
    onQueryChange,
    onSelect,
    options,
}: {
    iconKey: string;
    query: string;
    onQueryChange: (v: string) => void;
    onSelect: (key: string) => void;
    options: typeof ASSIGNMENT_PURPOSE_ICONS;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = resolveAssignmentPurposeIcon(iconKey);

    useEffect(() => {
        if (!open) return;
        function onDocPointerDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDocPointerDown);
        return () => document.removeEventListener("mousedown", onDocPointerDown);
    }, [open]);

    return (
        <div className="relative" ref={ref} data-purpose-icon-picker="true">
            <FieldLabel>Icon</FieldLabel>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md border border-alloy-stone/55 bg-white px-2.5 py-1.5 text-left text-[12px] font-medium text-alloy-midnight shadow-[0_1px_3px_rgba(24,39,58,0.06)]"
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/10 text-alloy-bend-pine">
                    <selected.Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={1.9} />
                </span>
                <span className="flex-1 truncate">{selected.label}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/45" aria-hidden />
            </button>
            {open ? (
                <div className="absolute z-20 mt-1 w-full min-w-[220px] rounded-lg border border-alloy-stone/25 bg-white p-2 shadow-lg">
                    <input
                        autoFocus
                        className="alloy-os-sched-input w-full font-medium"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder="Search icons"
                        aria-label="Search icons"
                    />
                    <div className="mt-2 grid max-h-48 gap-0.5 overflow-auto">
                        {options.map((opt) => {
                            const on = iconKey === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => {
                                        onSelect(opt.key);
                                        setOpen(false);
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium ${
                                        on ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "text-alloy-midnight hover:bg-alloy-stone/20"
                                    }`}
                                    data-purpose-icon={opt.key}
                                >
                                    <opt.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {opt.label}
                                </button>
                            );
                        })}
                        {options.length === 0 ? (
                            <p className="px-2 py-1.5 text-[11.5px] text-alloy-slate">No icons match &ldquo;{query}&rdquo;.</p>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/** Friendly appearance swatch grid — small color preview chips, not raw tone keys. */
function AppearancePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Appearance">
            {APPEARANCE_OPTIONS.map((opt) => {
                const on = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(opt.value)}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                            on
                                ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                : "border-alloy-stone/25 bg-white text-alloy-midnight hover:bg-alloy-stone/20"
                        }`}
                    >
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: opt.swatch }}
                            aria-hidden
                        />
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Multi-select chip list for eligible catalog categories — fixed vocabulary, behavior-only. */
function CatalogCategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {ELIGIBLE_CATALOG_CATEGORIES.map((opt) => {
                const on = value.includes(opt.value);
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                            onChange(on ? value.filter((v) => v !== opt.value) : [...value, opt.value])
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                            on
                                ? "border-alloy-bend-pine/40 bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                : "border-alloy-stone/25 bg-white text-alloy-midnight hover:bg-alloy-stone/20"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function AssignmentTypesStudioPanel({
    types,
    loading,
    siteName,
    sites,
    onChanged,
    operationalRooms,
}: {
    types: AssignmentTypeAdminRecord[];
    loading: boolean;
    siteName: string;
    sites: { id: string; name: string }[];
    onChanged: () => void;
    /** From shared Workspace studio_config snapshot — skips a cold refetch when present. */
    operationalRooms?: { roomId: string; roomName: string | null }[];
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [iconQuery, setIconQuery] = useState("");
    const [siteRooms, setSiteRooms] = useState<{ roomId: string; roomName: string | null }[]>(
        () => operationalRooms ?? [],
    );
    // Suggest a distinct default Appearance from the typed Name (Before Care → Blue,
    // Therapy → Amber, etc.) until the operator picks one manually — create only, so
    // editing an existing Category never silently changes its stored tone.
    const [toneTouched, setToneTouched] = useState(false);

    useEffect(() => {
        if (editingId) {
            const t = types.find((row) => row.id === editingId);
            if (t) setForm(formFromType(t));
        } else if (!creating) {
            setForm(emptyForm());
        }
        setToneTouched(false);
    }, [editingId, creating, types]);

    // Prefer shared Workspace snapshot rooms; only fetch when snapshot omitted them.
    useEffect(() => {
        if (operationalRooms) {
            setSiteRooms(operationalRooms.filter((r) => r?.roomId));
            return;
        }
        const siteId = sites[0]?.id;
        if (!siteId) return;
        let cancelled = false;
        void fetch(`/api/admin/scheduling?view=studio_config&site_location_id=${encodeURIComponent(siteId)}`)
            .then((r) => r.json())
            .then((body) => {
                if (cancelled) return;
                const rooms = (body?.config?.operationalRooms ?? []) as {
                    roomId: string;
                    roomName: string | null;
                }[];
                setSiteRooms(rooms.filter((r) => r?.roomId));
            })
            .catch(() => {
                if (!cancelled) setSiteRooms([]);
            });
        return () => {
            cancelled = true;
        };
    }, [operationalRooms, sites]);
    const iconOptions = useMemo(() => {
        const q = iconQuery.trim().toLowerCase();
        if (!q) return ASSIGNMENT_PURPOSE_ICONS;
        return ASSIGNMENT_PURPOSE_ICONS.filter((o) => o.label.toLowerCase().includes(q) || o.key.includes(q));
    }, [iconQuery]);

    const payload = () => ({
        label: form.label,
        iconKey: form.iconKey,
        visualTone: form.visualTone,
        billingParticipation: billingParticipationFromExpectation(form.behavior.billingExpectation ?? "none"),
        attendanceParticipation: form.attendanceParticipation,
        staffingParticipation: form.staffingParticipation,
        behavior: form.behavior,
        subjectTypes: ["child"],
    });

    const closeForm = () => {
        setCreating(false);
        setEditingId(null);
        setForm(emptyForm());
        setError(null);
    };

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
            closeForm();
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
    const patchBehavior = (patch: Partial<AssignmentTypeBehavior>) =>
        setForm((f) => ({ ...f, behavior: { ...f.behavior, ...patch } }));

    if (showForm) {
        return (
            <div data-assignment-studio-types="true" data-assignment-purposes="true">
                <button
                    type="button"
                    onClick={closeForm}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-alloy-bend-pine"
                >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    Back to Assignment Categories
                </button>

                <div
                    className="mx-auto mt-3 grid w-full max-w-[720px] gap-3"
                    data-assignment-type-form="true"
                    data-assignment-purpose-form="true"
                >
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[14px] font-semibold text-alloy-midnight">
                            {editingId ? "Edit Assignment Category" : "Create Assignment Category"}
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="text-[12px] font-semibold text-alloy-slate"
                                onClick={closeForm}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={busy || !form.label.trim()}
                                onClick={() => void save()}
                                className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                                data-assignment-kind-save="true"
                            >
                                {busy ? "Saving…" : "Save Category"}
                            </button>
                        </div>
                    </div>

                    {error ? (
                        <p className="rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember">
                            {error}
                        </p>
                    ) : null}

                    <Section title="Identity">
                        <label>
                            <FieldLabel>Name</FieldLabel>
                            <input
                                className="alloy-os-sched-input w-full font-medium"
                                value={form.label}
                                onChange={(e) => {
                                    const label = e.target.value;
                                    setForm((f) => {
                                        if (creating && !toneTouched) {
                                            const suggested = defaultVisualToneForAssignmentTypeLabel(label);
                                            if (suggested) return { ...f, label, visualTone: suggested };
                                        }
                                        return { ...f, label };
                                    });
                                }}
                                placeholder="e.g. Primary Classroom"
                                data-purpose-name="true"
                            />
                        </label>
                        <IconPickerField
                            iconKey={form.iconKey}
                            query={iconQuery}
                            onQueryChange={setIconQuery}
                            onSelect={(key) => setForm((f) => ({ ...f, iconKey: key }))}
                            options={iconOptions}
                        />
                        <label className="sm:col-span-2">
                            <FieldLabel>Description</FieldLabel>
                            <textarea
                                className="alloy-os-sched-input w-full font-medium"
                                rows={2}
                                value={form.behavior.description ?? ""}
                                onChange={(e) => patchBehavior({ description: e.target.value })}
                                placeholder="What this Category is for"
                            />
                        </label>
                        <div>
                            <FieldLabel>Appearance</FieldLabel>
                            <AppearancePicker
                                value={form.visualTone}
                                onChange={(v) => {
                                    setToneTouched(true);
                                    setForm((f) => ({ ...f, visualTone: v }));
                                }}
                            />
                        </div>
                    </Section>

                    <Section title="Behavior">
                        <label className="flex items-center gap-2 text-[12.5px] text-alloy-midnight">
                            <input
                                type="checkbox"
                                checked={form.behavior.primaryEligible === true}
                                onChange={(e) => patchBehavior({ primaryEligible: e.target.checked })}
                            />
                            Can be primary
                        </label>
                        <label className="flex items-center gap-2 text-[12.5px] text-alloy-midnight">
                            <input
                                type="checkbox"
                                checked={form.behavior.allowsOverlap === true}
                                onChange={(e) => patchBehavior({ allowsOverlap: e.target.checked })}
                            />
                            Can overlap another assignment
                        </label>
                    </Section>

                    <Section title="Requirements">
                        <label>
                            <FieldLabel>Program</FieldLabel>
                            <AlloySelect
                                value={form.behavior.programRequirement ?? "optional"}
                                onChange={(v) => patchBehavior({ programRequirement: v as RequirementMode })}
                                options={REQUIREMENT_OPTIONS}
                                aria-label="Program requirement"
                            />
                        </label>
                        <label>
                            <FieldLabel>Space requirement</FieldLabel>
                            <AlloySelect
                                value={form.behavior.roomRequirement ?? "optional"}
                                onChange={(v) => patchBehavior({ roomRequirement: v as RequirementMode })}
                                options={REQUIREMENT_OPTIONS}
                                aria-label="Space requirement"
                            />
                        </label>
                        {(form.behavior.roomRequirement ?? "optional") !== "not_used" ? (
                            <>
                                <label>
                                    <FieldLabel>Eligible spaces</FieldLabel>
                                    <AlloySelect
                                        value={form.behavior.eligibleSpaceMode ?? "any"}
                                        onChange={(v) =>
                                            patchBehavior({
                                                eligibleSpaceMode: v as "any" | "selected" | "program_match",
                                            })
                                        }
                                        options={SPACE_MODE_OPTIONS}
                                        aria-label="Eligible spaces"
                                    />
                                </label>
                                {(form.behavior.eligibleSpaceMode ?? "any") === "selected" ? (
                                    <div className="sm:col-span-2" data-purpose-selected-rooms="true">
                                        <FieldLabel>Selected spaces</FieldLabel>
                                        <p className="mb-1.5 text-[11px] text-alloy-slate">
                                            Limit this Category to specific spaces at {siteName || "the site"} (e.g.
                                            Gym, Multipurpose Room, Playground).
                                        </p>
                                        <div className="grid max-h-44 gap-1 overflow-auto rounded-lg border border-alloy-stone/20 bg-white p-2">
                                            {siteRooms.length === 0 ? (
                                                <p className="text-[11.5px] text-alloy-slate">No operational rooms found.</p>
                                            ) : (
                                                siteRooms.map((r) => {
                                                    const on = (form.behavior.eligibleRoomIds ?? []).includes(r.roomId);
                                                    return (
                                                        <label
                                                            key={r.roomId}
                                                            className="flex cursor-pointer items-center gap-2 text-[12px] text-alloy-midnight"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={on}
                                                                onChange={() => {
                                                                    const cur = new Set(form.behavior.eligibleRoomIds ?? []);
                                                                    if (on) cur.delete(r.roomId);
                                                                    else cur.add(r.roomId);
                                                                    patchBehavior({ eligibleRoomIds: [...cur] });
                                                                }}
                                                            />
                                                            {r.roomName ?? "Room"}
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : null}
                    </Section>

                    <Section title="Operational effects">
                        <label>
                            <FieldLabel>Attendance</FieldLabel>
                            <AlloySelect
                                value={form.attendanceParticipation}
                                onChange={(v) => setForm((f) => ({ ...f, attendanceParticipation: v }))}
                                options={ATTENDANCE_OPTIONS}
                                aria-label="Attendance behavior"
                            />
                        </label>
                        <label>
                            <FieldLabel>Staffing and ratios</FieldLabel>
                            <AlloySelect
                                value={form.staffingParticipation}
                                onChange={(v) => setForm((f) => ({ ...f, staffingParticipation: v }))}
                                options={STAFFING_OPTIONS}
                                aria-label="Staffing and ratios"
                            />
                        </label>
                    </Section>

                    <Section title="Financials">
                        <label>
                            <FieldLabel>Financial relationship</FieldLabel>
                            <AlloySelect
                                value={form.behavior.billingExpectation ?? "none"}
                                onChange={(v) => patchBehavior({ billingExpectation: v as BillingExpectation })}
                                options={BILLING_EXPECTATION_OPTIONS}
                                aria-label="Financial relationship"
                            />
                        </label>
                        {(form.behavior.billingExpectation ?? "none") !== "none" ? (
                            <div className="sm:col-span-2">
                                <FieldLabel>Eligible catalog categories</FieldLabel>
                                <CatalogCategoryPicker
                                    value={form.behavior.eligibleCatalogCategories ?? []}
                                    onChange={(v) => patchBehavior({ eligibleCatalogCategories: v })}
                                />
                            </div>
                        ) : null}
                    </Section>

                    <Section title="Availability">
                        <label className="sm:col-span-2">
                            <FieldLabel>Locations</FieldLabel>
                            <AlloySelect
                                value={
                                    (form.behavior.locationIds ?? []).length === 0
                                        ? "__org__"
                                        : (form.behavior.locationIds?.[0] ?? "__org__")
                                }
                                onChange={(v) =>
                                    patchBehavior({
                                        locationIds: v === "__org__" ? [] : [v],
                                    })
                                }
                                options={[
                                    { value: "__org__", label: "Organization-wide" },
                                    ...sites.map((s) => ({ value: s.id, label: s.name })),
                                ]}
                                aria-label="Availability"
                            />
                            <p className="mt-1 text-[11px] text-alloy-slate">
                                Organization-wide, or limit to a selected location for this Assignment Category.
                            </p>
                        </label>
                    </Section>
                </div>
            </div>
        );
    }

    return (
        <div
            data-assignment-studio-types="true"
            data-assignment-purposes="true"
            data-assignment-category-landing="true"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className={WS_EYEBROW}>Assignment Categories</p>
                    <p className="mt-1 max-w-2xl text-[12.5px] text-alloy-slate">
                        Categories define what an assignment represents and which programs, spaces, operational
                        effects, and financial options may apply.
                    </p>
                </div>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[12px] font-semibold text-white"
                    onClick={() => {
                        setCreating(true);
                        setEditingId(null);
                        setForm(emptyForm());
                    }}
                    data-assignment-type-create="true"
                    data-assignment-kind-create="true"
                    data-assignment-category-new="true"
                >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    New Category
                </button>
            </div>

            {error ? (
                <p className="mt-2 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember">
                    {error}
                </p>
            ) : null}

            <div className="mt-4" data-assignment-kind-list="true">
                {loading ? (
                    <p className="text-[12px] text-alloy-slate">Loading categories…</p>
                ) : types.length === 0 ? (
                    <WorkspaceCard flat className="p-4 text-[12.5px] text-alloy-slate">
                        No Assignment Categories yet. Create Primary Classroom, Before Care, and Enrichment to
                        start.
                    </WorkspaceCard>
                ) : (
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        {types.map((t) => {
                            const Icon = resolveAssignmentPurposeIcon(t.iconKey).Icon;
                            const desc =
                                (t.behavior.description ?? "").trim()
                                || "Defines eligibility, space, and operational effects for this category.";
                            const programReq = t.behavior.programRequirement ?? "optional";
                            const spaceReq = t.behavior.roomRequirement ?? "optional";
                            const billing =
                                BILLING_EXPECTATION_OPTIONS.find(
                                    (o) => o.value === (t.behavior.billingExpectation ?? "none"),
                                )?.label ?? "No financial relationship";
                            const availability =
                                (t.behavior.locationIds?.length ?? 0) > 0
                                    ? `Selected locations (${t.behavior.locationIds!.length})`
                                    : "Organization-wide";
                            const openEditor = () => {
                                setEditingId(t.id);
                                setCreating(false);
                            };
                            return (
                                <WorkspaceCard
                                    key={t.id}
                                    flat
                                    className="cursor-pointer p-4 text-left transition hover:border-alloy-bend-pine/30"
                                    data-assignment-purpose-row={t.id}
                                    data-assignment-type-row={t.id}
                                    data-assignment-category-card={t.id}
                                    onClick={openEditor}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-start gap-2">
                                            <span
                                                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                                style={{
                                                    background: `${swatchForTone(t.visualTone)}22`,
                                                    color: swatchForTone(t.visualTone),
                                                }}
                                                aria-hidden
                                            >
                                                <Icon className="h-4 w-4" strokeWidth={2} />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-alloy-midnight">
                                                    <span
                                                        className="h-2 w-2 shrink-0 rounded-full"
                                                        style={{ background: swatchForTone(t.visualTone) }}
                                                        aria-hidden
                                                        data-assignment-type-tone-swatch={t.visualTone ?? "neutral"}
                                                    />
                                                    {t.label}
                                                </p>
                                                <p className="mt-0.5 text-[11.5px] leading-snug text-alloy-slate">
                                                    {desc}
                                                </p>
                                            </div>
                                        </div>
                                        <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                                t.isActive
                                                    ? "bg-alloy-bend-pine/10 text-alloy-bend-pine"
                                                    : "bg-alloy-stone/40 text-alloy-midnight/60"
                                            }`}
                                        >
                                            {t.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                    <dl className="mt-3 grid gap-1 pl-10 text-[11px] text-alloy-slate">
                                        <div className="flex flex-wrap gap-x-1">
                                            <dt className="font-semibold text-alloy-midnight/70">Primary</dt>
                                            <dd>{t.behavior.primaryEligible ? "Eligible" : "Not eligible"}</dd>
                                        </div>
                                        <div className="flex flex-wrap gap-x-1">
                                            <dt className="font-semibold text-alloy-midnight/70">Program</dt>
                                            <dd className="capitalize">{programReq.replace("_", " ")}</dd>
                                        </div>
                                        <div className="flex flex-wrap gap-x-1">
                                            <dt className="font-semibold text-alloy-midnight/70">Space</dt>
                                            <dd className="capitalize">{spaceReq.replace("_", " ")}</dd>
                                        </div>
                                        <div className="flex flex-wrap gap-x-1">
                                            <dt className="font-semibold text-alloy-midnight/70">Financial</dt>
                                            <dd>{billing}</dd>
                                        </div>
                                        <div className="flex flex-wrap gap-x-1">
                                            <dt className="font-semibold text-alloy-midnight/70">Availability</dt>
                                            <dd>{availability}</dd>
                                        </div>
                                    </dl>
                                    <div className="mt-3 flex items-center gap-3 pl-10">
                                        <button
                                            type="button"
                                            className="text-[12px] font-semibold text-alloy-bend-pine"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEditor();
                                            }}
                                        >
                                            Edit
                                        </button>
                                        {t.isActive ? (
                                            <button
                                                type="button"
                                                className="text-[12px] font-semibold text-alloy-slate"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (t.id) void archive(t.id);
                                                }}
                                            >
                                                Archive
                                            </button>
                                        ) : null}
                                    </div>
                                </WorkspaceCard>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
