"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    applyLeadSummarySlotConfigs,
    defaultLeadSummarySlotConfigs,
    LEAD_SUMMARY_BLUEPRINT_KEY,
    LEAD_SUMMARY_BLUEPRINT_SLOTS,
    readLeadSummarySlotConfigs,
    seedLeadSummaryBlueprintLayoutDoc,
    swapLeadSummarySlot,
    type LeadSummaryCardDensity,
    type LeadSummaryCardSpan,
    type LeadSummarySlotConfig,
    type LeadSummarySlotKey,
} from "@/lib/layout/cardBlueprint/leadSummaryCardBlueprint";
import type { LayoutCondition, LayoutDoc } from "@/lib/layout/layoutV2";
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import { parseLayoutDocFromRecord } from "@/lib/layout/layoutEditorPublishWorkflow";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import { ADMIN_V2_SETTINGS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type Props = {
    layoutId: string | null;
    onLayoutIdChange: (id: string) => void;
    onBack: () => void;
};

export default function LeadSummaryCardBlueprintEditor({ layoutId, onLayoutIdChange, onBack }: Props) {
    const [record, setRecord] = useState<EntityLayoutRecord | null>(null);
    const [workingDoc, setWorkingDoc] = useState<LayoutDoc | null>(null);
    const [slots, setSlots] = useState<LeadSummarySlotConfig[]>(defaultLeadSummarySlotConfigs());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<"save" | "publish" | "create" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [savedFlash, setSavedFlash] = useState(false);

    const dirty = useMemo(() => {
        if (!workingDoc) return false;
        const baseline = readLeadSummarySlotConfigs(workingDoc);
        return JSON.stringify(baseline) !== JSON.stringify(slots);
    }, [workingDoc, slots]);

    const loadLayout = useCallback(async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            const rec = await fetchEntityLayoutRecord(id);
            const parsed = parseLayoutDocFromRecord(rec);
            setRecord(rec);
            setWorkingDoc(parsed);
            setSlots(readLeadSummarySlotConfigs(parsed));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load layout");
        } finally {
            setLoading(false);
        }
    }, []);

    const createDraft = useCallback(async () => {
        setBusy("create");
        setError(null);
        try {
            const res = await fetch("/api/admin/entity-layouts", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: "opportunity",
                    surface: "drawer",
                    layout_key: "lead_summary_card",
                    name: "Lead Summary Card",
                    seed: "lead_default",
                }),
            });
            const json = (await res.json()) as EntityLayoutRecord & { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to create draft");
            onLayoutIdChange(json.id);
            await loadLayout(json.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create draft");
        } finally {
            setBusy(null);
        }
    }, [loadLayout, onLayoutIdChange]);

    useEffect(() => {
        if (layoutId) {
            void loadLayout(layoutId);
            return;
        }
        setLoading(false);
        setWorkingDoc(seedLeadSummaryBlueprintLayoutDoc());
        setSlots(defaultLeadSummarySlotConfigs());
    }, [layoutId, loadLayout]);

    const updateSlot = (index: number, patch: Partial<LeadSummarySlotConfig>) => {
        setSlots((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const removeOptionalSlot = (index: number) => {
        setSlots((prev) =>
            prev.map((row, i) => (i === index && row.optional ? { ...row, enabled: false } : row)),
        );
    };

    const addOptionalSlot = () => {
        const candidate = LEAD_SUMMARY_BLUEPRINT_SLOTS.find(
            (s) => s.optional && !slots.some((row) => row.key === s.key && row.enabled),
        );
        if (!candidate) return;
        setSlots((prev) => [
            ...prev,
            {
                key: candidate.key,
                label: candidate.label,
                optional: true,
                enabled: true,
                density: "standard",
                span: "half",
                visibleWhen: null,
            },
        ]);
    };

    const saveDraft = async () => {
        if (!record || !workingDoc) return;
        setBusy("save");
        setError(null);
        try {
            const nextDoc = applyLeadSummarySlotConfigs(workingDoc, slots);
            const saved = await patchEntityLayoutDraft(record.id, record.name, nextDoc);
            setRecord(saved);
            setWorkingDoc(parseLayoutDocFromRecord(saved));
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 2500);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setBusy(null);
        }
    };

    const publish = async () => {
        if (!record) return;
        if (dirty) await saveDraft();
        setBusy("publish");
        setError(null);
        try {
            const published = await publishEntityLayoutDraft(record.id);
            setRecord(published);
            setWorkingDoc(parseLayoutDocFromRecord(published));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Publish failed");
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return (
            <div className="rounded-2xl border border-alloy-forge/10 bg-white p-8 text-sm text-alloy-midnight/50">
                Loading Lead Summary card editor…
            </div>
        );
    }

    if (!layoutId) {
        return (
            <div
                className="space-y-4 rounded-2xl border border-alloy-pine/15 bg-white p-6 shadow-sm"
                data-testid="lead-summary-blueprint-create"
            >
                <header>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine/80">Card blueprint</p>
                    <h3 className="mt-1 text-lg font-semibold text-alloy-midnight">Lead Summary</h3>
                    <p className="mt-1 text-sm text-alloy-midnight/60">
                        Configure widget and field slots for the Lead Summary card. Save as a layout draft, publish, then
                        assign from Processes → Presentation or Work Views.
                    </p>
                </header>
                {error ?
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
                :   null}
                <button
                    type="button"
                    disabled={busy === "create"}
                    onClick={() => void createDraft()}
                    className="rounded-xl bg-alloy-pine px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    data-testid="lead-summary-create-draft"
                >
                    {busy === "create" ? "Creating…" : "Create layout draft"}
                </button>
                <button type="button" onClick={onBack} className="text-sm font-medium text-alloy-pine hover:underline">
                    ← Back to layout gallery
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="lead-summary-blueprint-editor">
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-alloy-pine/15 bg-alloy-pine/[0.05] px-5 py-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine/80">
                        Card blueprint · {LEAD_SUMMARY_BLUEPRINT_KEY}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-alloy-midnight">Lead Summary</h3>
                    {record ?
                        <p className="mt-1 text-sm text-alloy-midnight/60">
                            {formatLayoutTitleWithVersion(record.name, record.version)}
                            {" · "}
                            {record.status === "published" ? "Published" : "Draft"}
                        </p>
                    :   null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {dirty ?
                        <span className="text-xs font-medium text-amber-800">Unsaved changes</span>
                    :   null}
                    {savedFlash ?
                        <span className="text-xs font-medium text-alloy-pine">Saved</span>
                    :   null}
                    <button
                        type="button"
                        disabled={!dirty || busy !== null}
                        onClick={() => void saveDraft()}
                        className="rounded-xl border border-alloy-pine/30 bg-white px-3 py-2 text-sm font-semibold text-alloy-pine disabled:opacity-50"
                        data-testid="lead-summary-save-draft"
                    >
                        Save draft
                    </button>
                    <button
                        type="button"
                        disabled={busy !== null || record?.status === "published"}
                        onClick={() => void publish()}
                        className="rounded-xl bg-alloy-pine px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        data-testid="lead-summary-publish"
                    >
                        {busy === "publish" ? "Publishing…" : "Publish"}
                    </button>
                </div>
            </header>

            {error ?
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
            :   null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="space-y-3 rounded-2xl border border-alloy-forge/10 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-alloy-midnight">Configured slots</h4>
                        <button
                            type="button"
                            onClick={addOptionalSlot}
                            className="text-xs font-medium text-alloy-pine hover:underline"
                            data-testid="lead-summary-add-optional"
                        >
                            + Add optional field
                        </button>
                    </div>

                    {slots.filter((s) => s.enabled).map((slot, index) => {
                        const slotIndex = slots.indexOf(slot);
                        return (
                            <div
                                key={`${slot.key}-${index}`}
                                className="rounded-xl border border-alloy-forge/10 bg-white p-4"
                                data-testid={`lead-summary-slot-${slot.key}`}
                            >
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block text-xs text-alloy-midnight/60">
                                        Slot
                                        <select
                                            value={slot.key}
                                            onChange={(e) =>
                                                setSlots((prev) =>
                                                    swapLeadSummarySlot(prev, slotIndex, e.target.value as LeadSummarySlotKey),
                                                )
                                            }
                                            className="mt-1 w-full rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                                        >
                                            {LEAD_SUMMARY_BLUEPRINT_SLOTS.map((opt) => (
                                                <option key={opt.key} value={opt.key}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block text-xs text-alloy-midnight/60">
                                        Size
                                        <select
                                            value={slot.density}
                                            onChange={(e) =>
                                                updateSlot(slotIndex, {
                                                    density: e.target.value as LeadSummaryCardDensity,
                                                })
                                            }
                                            className="mt-1 w-full rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                                        >
                                            <option value="compact">Compact</option>
                                            <option value="standard">Standard</option>
                                            <option value="expanded">Expanded</option>
                                        </select>
                                    </label>
                                    <label className="block text-xs text-alloy-midnight/60">
                                        Span
                                        <select
                                            value={slot.span}
                                            onChange={(e) =>
                                                updateSlot(slotIndex, { span: e.target.value as LeadSummaryCardSpan })
                                            }
                                            className="mt-1 w-full rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                                        >
                                            <option value="half">Half width</option>
                                            <option value="full">Full width</option>
                                        </select>
                                    </label>
                                    <label className="block text-xs text-alloy-midnight/60">
                                        Conditional visibility
                                        <select
                                            value={slot.visibleWhen?.type ?? ""}
                                            onChange={(e) => {
                                                const type = e.target.value;
                                                const visibleWhen: LayoutCondition | null =
                                                    type === "exists" ?
                                                        { type: "exists", path: "opportunity.status" }
                                                    : type === "not_equals" ?
                                                        { type: "not_equals", path: "opportunity.tour_date", value: "" }
                                                    :   null;
                                                updateSlot(slotIndex, { visibleWhen });
                                            }}
                                            className="mt-1 w-full rounded-lg border border-alloy-forge/12 bg-white px-2.5 py-2 text-sm"
                                        >
                                            <option value="">Always visible</option>
                                            <option value="exists">When status is set</option>
                                            <option value="not_equals">When tour date is empty</option>
                                        </select>
                                    </label>
                                </div>
                                {slot.optional ?
                                    <button
                                        type="button"
                                        onClick={() => removeOptionalSlot(slotIndex)}
                                        className="mt-3 text-xs font-medium text-red-700 hover:underline"
                                    >
                                        Remove optional field
                                    </button>
                                :   null}
                            </div>
                        );
                    })}
                </div>

                <aside className="space-y-3 rounded-2xl border border-alloy-forge/10 bg-white p-5 shadow-sm">
                    <h4 className="text-sm font-semibold text-alloy-midnight">Preview</h4>
                    <div className="space-y-2 rounded-xl border border-dashed border-alloy-pine/25 bg-alloy-pine/[0.04] p-4">
                        {slots
                            .filter((s) => s.enabled)
                            .map((slot) => (
                                <div
                                    key={slot.key}
                                    className={`rounded-lg border border-alloy-forge/10 bg-white px-3 py-2 ${
                                        slot.span === "full" ? "w-full" : "w-1/2 inline-block"
                                    }`}
                                >
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                        {slot.density}
                                    </p>
                                    <p className="text-sm font-medium text-alloy-midnight">{slot.label}</p>
                                </div>
                            ))}
                    </div>
                    <p className="text-xs text-alloy-midnight/55">
                        After publishing, assign this layout in{" "}
                        <Link href={`${ADMIN_V2_SETTINGS_PROCESSES_PATH}`} className="font-medium text-alloy-pine hover:underline">
                            Processes → Presentation
                        </Link>{" "}
                        or Work Views.
                    </p>
                    <Link
                        href={LAYOUTS_SETTINGS_HREF}
                        className="inline-block text-xs font-medium text-alloy-pine hover:underline"
                    >
                        Open layout gallery →
                    </Link>
                </aside>
            </div>

            <button type="button" onClick={onBack} className="text-sm font-medium text-alloy-pine hover:underline">
                ← Back to layout gallery
            </button>
        </div>
    );
}
