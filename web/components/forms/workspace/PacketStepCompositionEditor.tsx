"use client";

import clsx from "clsx";
import Link from "next/link";
import PrimaryButton from "@/components/PrimaryButton";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { PacketStepFormOption } from "@/lib/admin/forms/packetDefinitionStepForms";
import { applyRecentFormToSteps } from "@/lib/admin/forms/packetStepRecentFormPlacement";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { packetStepReadinessLabel } from "@/lib/forms/packets/packetOrchestrationPresentation";
import { opGroupedRowInner, opGroupedSurface, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

export type StepDraft = { packet_item_id?: string; form_definition_id: string; step_label: string };

const inputClass = "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm";

type Props = {
    steps: StepDraft[];
    forms: PacketStepFormOption[];
    recentPublishedForms: PacketStepFormOption[];
    busy: boolean;
    savedStepCount: number;
    onStepsChange: (updater: (rows: StepDraft[]) => StepDraft[]) => void;
    onAddStep: () => void;
    onSaveSteps: () => void;
    onMoveStep: (index: number, dir: -1 | 1) => void;
    onRemoveStep: (index: number) => void;
};

/** Ordered step composition editor for packet builder (OW-4). */
export function PacketStepCompositionEditor({
    steps,
    forms,
    recentPublishedForms,
    busy,
    savedStepCount,
    onStepsChange,
    onAddStep,
    onSaveSteps,
    onMoveStep,
    onRemoveStep,
}: Props) {
    return (
        <div data-testid="packet-step-composition">
            <p className={opMetadata}>
                Each step is a published form families complete in order. Save when the pipeline looks right.
            </p>

            {recentPublishedForms.length > 0 ?
                <div className="mt-3">
                    <p className={opMutedMeta}>Quick add published form</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                        {recentPublishedForms.map((f) => (
                            <li key={f.id}>
                                <button
                                    type="button"
                                    className="rounded-full border border-alloy-midnight/10 bg-white px-3 py-1.5 text-xs font-medium text-alloy-blue hover:bg-alloy-stone/20"
                                    disabled={busy}
                                    onClick={() => onStepsChange((rows) => applyRecentFormToSteps(rows, f.id))}
                                >
                                    + {f.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            :   null}

            <ol className={clsx(opGroupedSurface, "mt-4")} data-testid="packet-step-list">
                {steps.map((s, idx) => {
                    const selected = forms.find((f) => f.id === s.form_definition_id);
                    const published = selected?.has_published_version !== false && Boolean(s.form_definition_id);
                    return (
                        <li key={s.packet_item_id ?? `draft-${idx}-${s.form_definition_id || "empty"}`} className={opGroupedRowInner}>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                    Step {idx + 1}
                                </span>
                                {s.form_definition_id ?
                                    <FormsReviewBadge
                                        label={packetStepReadinessLabel(published)}
                                        tone={published ? "success" : "warning"}
                                    />
                                :   null}
                            </div>
                            <div className="mt-2 grid gap-3 lg:grid-cols-2">
                                <label className="space-y-1 text-sm">
                                    <span className={opMutedMeta}>Form</span>
                                    <select
                                        className={inputClass}
                                        value={s.form_definition_id}
                                        disabled={busy}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            onStepsChange((rows) =>
                                                rows.map((r, j) =>
                                                    j === idx ?
                                                        { ...r, form_definition_id: v, packet_item_id: undefined }
                                                    :   r
                                                )
                                            );
                                        }}
                                    >
                                        <option value="">Select form…</option>
                                        {forms.map((f) => (
                                            <option key={f.id} value={f.id} disabled={!f.has_published_version}>
                                                {f.name} {!f.has_published_version ? "(not published)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="space-y-1 text-sm">
                                    <span className={opMutedMeta}>Step label (optional)</span>
                                    <input
                                        className={inputClass}
                                        value={s.step_label}
                                        disabled={busy}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            onStepsChange((rows) => rows.map((r, j) => (j === idx ? { ...r, step_label: v } : r)));
                                        }}
                                    />
                                </label>
                            </div>
                            {selected ?
                                <p className={clsx("mt-2", opMutedMeta)}>
                                    <Link
                                        href={`${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(selected.id)}`}
                                        className="font-medium text-alloy-blue hover:underline"
                                    >
                                        Open form workspace
                                    </Link>
                                </p>
                            :   null}
                            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                                <button type="button" className="text-alloy-blue" disabled={busy || idx === 0} onClick={() => onMoveStep(idx, -1)}>
                                    Move up
                                </button>
                                <button
                                    type="button"
                                    className="text-alloy-blue"
                                    disabled={busy || idx >= steps.length - 1}
                                    onClick={() => onMoveStep(idx, 1)}
                                >
                                    Move down
                                </button>
                                <button type="button" className="text-alloy-ember" disabled={busy || steps.length <= 1} onClick={() => onRemoveStep(idx)}>
                                    Remove
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <div className="mt-4 flex flex-wrap gap-2">
                <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={onAddStep}>
                    Add step
                </PrimaryButton>
                <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={onSaveSteps}>
                    Save steps
                </PrimaryButton>
            </div>

            {savedStepCount > 0 ?
                <p className={clsx("mt-3", opMetadata)}>
                    If this packet already has sessions, step changes may be blocked — create a new packet instead.
                </p>
            :   null}
        </div>
    );
}
