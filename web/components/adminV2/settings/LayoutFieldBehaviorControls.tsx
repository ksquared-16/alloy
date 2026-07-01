"use client";

import { useEffect, useState } from "react";
import {
    LAYOUT_FIELD_BEHAVIOR_HELPER,
    LAYOUT_INTERACTION_CONTROL_LABEL,
    LAYOUT_INTERACTION_INLINE_OPTIONS,
    LAYOUT_REQUIREMENT_CONTROL_LABEL,
    LAYOUT_REQUIREMENT_PRESET_OPTIONS,
    layoutRequirementPresetLabel,
    type LayoutFieldBehaviorView,
} from "@/lib/adminV2/layouts/layoutFieldBehaviorUi";
import type { FieldPolicyInteractionPreset, FieldPolicyRequirementPreset } from "@/lib/fields/fieldPolicySettingsUi";
import type { FieldPlacementV1 } from "@/lib/fields/fieldPlacementV1";

async function readApiError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return typeof json.error === "string" && json.error.trim() ? json.error.trim() : `Request failed (${res.status})`;
}

export default function LayoutFieldBehaviorControls({
    fieldKey,
    displayLabel,
    view,
    disabled,
    onPlacementsSaved,
}: {
    fieldKey: string;
    displayLabel: string;
    view: LayoutFieldBehaviorView;
    disabled?: boolean;
    onPlacementsSaved?: (placements: FieldPlacementV1[] | undefined) => void;
}) {
    const [saving, setSaving] = useState<"requirement" | "interaction" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [savedKind, setSavedKind] = useState<"requirement" | "interaction" | null>(null);

    useEffect(() => {
        if (!savedKind) return;
        const t = window.setTimeout(() => setSavedKind(null), 4000);
        return () => window.clearTimeout(t);
    }, [savedKind]);

    const patchBehavior = async (
        patch: { requirement_preset?: FieldPolicyRequirementPreset; interaction_preset?: FieldPolicyInteractionPreset },
        kind: "requirement" | "interaction"
    ) => {
        if (disabled || view.kind !== "editable") return;
        setSaving(kind);
        setError(null);
        setSavedKind(null);
        try {
            const res = await fetch("/api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    updates: [{ field_key: fieldKey, ...patch }],
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                field_placements_v1?: FieldPlacementV1[];
            };
            if (!res.ok) throw new Error(json.error ?? (await readApiError(res)));
            onPlacementsSaved?.(json.field_placements_v1);
            setSavedKind(kind);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(null);
        }
    };

    if (view.kind === "locked") {
        return (
            <div
                className="mt-1.5 w-full rounded border border-dashed border-alloy-forge/12 bg-alloy-stone/[0.03] px-2 py-1.5 text-[10px] leading-snug text-alloy-midnight/55"
                data-testid={`layout-field-behavior-locked-${fieldKey}`}
            >
                <p className="font-medium text-alloy-midnight/65">Layout behavior</p>
                <p className="mt-0.5">{view.lockReason}</p>
                {view.requirementSummary || view.interactionSummary ? (
                    <p className="mt-0.5 text-alloy-midnight/45">
                        {[
                            view.requirementSummary
                                ? `On layout: ${view.requirementSummary}`
                                : null,
                            view.interactionSummary ? `Editability: ${view.interactionSummary}` : null,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                ) : null}
            </div>
        );
    }

    const statusLine =
        error != null ? (
            <p className="sm:col-span-2 text-[10px] font-medium text-red-600" role="alert">
                Save failed: {error}
            </p>
        ) : saving ? (
            <p className="sm:col-span-2 text-[10px] text-alloy-midnight/55">
                Saving {saving === "requirement" ? "required" : "editability"}…
            </p>
        ) : savedKind ? (
            <p className="sm:col-span-2 text-[10px] font-medium text-alloy-pine">
                Saved {savedKind === "requirement" ? layoutRequirementPresetLabel(view.requirementPreset) : "editability"} for{" "}
                {displayLabel}.
            </p>
        ) : null;

    return (
        <div
            className="mt-1.5 grid w-full gap-2 sm:grid-cols-2"
            data-testid={`layout-field-behavior-${fieldKey}`}
        >
            <div className="min-w-0 sm:col-span-2">
                <p className="text-[9px] text-alloy-midnight/45">{LAYOUT_FIELD_BEHAVIOR_HELPER}</p>
            </div>
            <div className="min-w-0">
                <label className="mb-0.5 block text-[10px] font-medium text-alloy-midnight/55">
                    {LAYOUT_REQUIREMENT_CONTROL_LABEL}
                </label>
                <select
                    value={view.requirementPreset}
                    disabled={disabled || saving !== null || !view.requirementEditable}
                    className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-[11px] disabled:opacity-50"
                    aria-label={`${LAYOUT_REQUIREMENT_CONTROL_LABEL} for ${displayLabel}`}
                    title={
                        LAYOUT_REQUIREMENT_PRESET_OPTIONS.find((o) => o.value === view.requirementPreset)?.title ?? ""
                    }
                    onChange={(e) =>
                        void patchBehavior(
                            { requirement_preset: e.target.value as FieldPolicyRequirementPreset },
                            "requirement"
                        )
                    }
                >
                    {LAYOUT_REQUIREMENT_PRESET_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value} title={o.title}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {view.requirementHint ? (
                    <p className="mt-0.5 text-[9px] text-alloy-midnight/40">{view.requirementHint}</p>
                ) : null}
            </div>
            <div className="min-w-0">
                <label className="mb-0.5 block text-[10px] font-medium text-alloy-midnight/55">
                    {LAYOUT_INTERACTION_CONTROL_LABEL}
                </label>
                <select
                    value={view.interactionPreset}
                    disabled={disabled || saving !== null || !view.interactionEditable}
                    className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-[11px] disabled:opacity-50"
                    aria-label={`${LAYOUT_INTERACTION_CONTROL_LABEL} for ${displayLabel}`}
                    onChange={(e) =>
                        void patchBehavior(
                            { interaction_preset: e.target.value as FieldPolicyInteractionPreset },
                            "interaction"
                        )
                    }
                >
                    {LAYOUT_INTERACTION_INLINE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                {view.interactionHint ? (
                    <p className="mt-0.5 text-[9px] text-alloy-midnight/40">{view.interactionHint}</p>
                ) : null}
            </div>
            {statusLine}
        </div>
    );
}
