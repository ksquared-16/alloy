"use client";

import clsx from "clsx";
import PrimaryButton from "@/components/PrimaryButton";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { PacketStepFormOption } from "@/lib/admin/forms/packetDefinitionStepForms";
import { applyRecentFormToSteps } from "@/lib/admin/forms/packetStepRecentFormPlacement";
import { dispatchAdminV2OpenProcessingModal } from "@/lib/adminV2/workspaceModalEvents";
import { packetStepReadinessLabel } from "@/lib/forms/packets/packetOrchestrationPresentation";
import { PACKET_STEP_KIND_LABELS, type PacketStepKind } from "@/lib/forms/packets/packetStepKind";
import { CLASSIFICATION_KEY_LABELS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { PacketAddStepChooser, type NewDocumentStep } from "@/components/forms/workspace/PacketAddStepChooser";
import { opGroupedRowInner, opGroupedSurface, opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

/** What one obligation actually does, derived server-side from the configuration. */
export type StepExperienceCard = {
    sequence: number;
    obligation: string;
    behavior: string;
    facts: string[];
    ready: boolean;
    readyDetail: string;
    form_definition_id?: string | null;
    acknowledgment_document_id?: string | null;
};

export type StepDraft = {
    packet_item_id?: string;
    form_definition_id: string;
    step_label: string;
    /**
     * What this step ASKS OF A FAMILY. Absent means "form" — every step authored before the
     * vocabulary existed was one, so the default is what those rows actually are.
     */
    kind?: PacketStepKind;
    /** `document_upload` — the classification the file is filed under. */
    document_type_key?: string | null;
    /** `document_acknowledgment` — the document the family reads. */
    acknowledgment_document_id?: string | null;
    acknowledgment_document_title?: string | null;
    requires_signature?: boolean;
};

const inputClass = "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm";

type Props = {
    steps: StepDraft[];
    forms: PacketStepFormOption[];
    recentPublishedForms: PacketStepFormOption[];
    busy: boolean;
    savedStepCount: number;
    /** Derived obligation facts, by sequence. Absent while loading — the row still renders. */
    experience?: readonly StepExperienceCard[];
    onStepsChange: (updater: (rows: StepDraft[]) => StepDraft[]) => void;
    onAddStep: () => void;
    /** Document steps persist on add — their executor is generated server-side. */
    onAddDocumentStep: (step: NewDocumentStep) => Promise<void>;
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
    experience,
    onStepsChange,
    onAddStep,
    onAddDocumentStep,
    onSaveSteps,
    onMoveStep,
    onRemoveStep,
}: Props) {
    return (
        <div data-testid="packet-step-composition">
            <p className={opMetadata}>
                Each step is one thing the family does, in order — answer questions, send in a document, or read
                and agree to one. Alloy works out how to guide them through it; you configure what is asked.
            </p>

            <ol className={clsx(opGroupedSurface, "mt-4")} data-testid="packet-step-list">
                {steps.map((s, idx) => {
                    const selected = forms.find((f) => f.id === s.form_definition_id);
                    const published = selected?.has_published_version !== false && Boolean(s.form_definition_id);
                    const kind: PacketStepKind = s.kind ?? "form";
                    const isDocumentStep = kind !== "form";
                    const card = experience?.find((c) => c.sequence === idx);
                    return (
                        <li key={s.packet_item_id ?? `draft-${idx}-${s.form_definition_id || "empty"}`} className={opGroupedRowInner}>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                    Step {idx + 1}
                                </span>
                                <span className="text-xs font-medium text-alloy-midnight/60">
                                    {PACKET_STEP_KIND_LABELS[kind]}
                                </span>
                                {!isDocumentStep && s.form_definition_id ?
                                    <FormsReviewBadge
                                        label={packetStepReadinessLabel(published)}
                                        tone={published ? "success" : "warning"}
                                    />
                                :   null}
                            </div>
                            {isDocumentStep ?
                                /*
                                 * A document step shows WHAT IT ASKS FOR, and never the form that
                                 * executes it. Offering a Form dropdown here would put the adapter
                                 * back into the administrator's model, which is the one thing this
                                 * vocabulary exists to prevent.
                                 */
                                <div className="mt-2">
                                    <p className="text-sm font-medium text-alloy-midnight">
                                        {s.step_label?.trim() || selected?.name || "Untitled step"}
                                    </p>
                                    <p className={clsx("mt-0.5", opMutedMeta)}>
                                        {kind === "document_upload" ?
                                            `Filed as ${CLASSIFICATION_KEY_LABELS[
                                                (s.document_type_key ?? "") as keyof typeof CLASSIFICATION_KEY_LABELS
                                            ] ?? "an enrollment document"}`
                                        : s.acknowledgment_document_title ?
                                            `Reads ${s.acknowledgment_document_title}${s.requires_signature ? ", and signs" : ""}`
                                        :   `Reads a document${s.requires_signature ? ", and signs" : ""}`}
                                    </p>
                                    {kind === "document_acknowledgment" && (card?.acknowledgment_document_id || s.acknowledgment_document_id) ? (
                                        /*
                                         * The administrator should be able to see the document the family
                                         * will be shown, from the step that asks for it — a signed URL to
                                         * the real file, not a description of it.
                                         */
                                        <button
                                            type="button"
                                            className="mt-1.5 text-xs font-semibold text-alloy-blue hover:underline"
                                            data-testid={`packet-step-view-document-${idx}`}
                                            onClick={async () => {
                                                const id = card?.acknowledgment_document_id || s.acknowledgment_document_id;
                                                const res = await fetch(`/api/admin/documents/${encodeURIComponent(String(id))}/signed-url`, {
                                                    credentials: "same-origin",
                                                });
                                                const body = (await res.json().catch(() => ({}))) as { url?: string; data?: { url?: string } };
                                                const url = body.url ?? body.data?.url;
                                                if (url) window.open(url, "_blank", "noopener");
                                            }}
                                        >
                                            View document →
                                        </button>
                                    ) : null}
                                </div>
                            :   <div className="mt-2 grid gap-3 lg:grid-cols-2">
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
                            }
                            {card ? (
                                <div className="mt-2" data-testid={`packet-step-experience-${idx}`}>
                                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium text-alloy-midnight/70">
                                        {card.facts.map((f, i) => (
                                            <span key={f}>
                                                {i > 0 ? <span className="mr-1.5 text-alloy-midnight/25">·</span> : null}
                                                {f}
                                            </span>
                                        ))}
                                    </p>
                                    {/* What the family meets. Platform-owned behaviour, described rather than offered as a toggle. */}
                                    <p className={clsx("mt-1.5", opMutedMeta)}>{card.behavior}</p>
                                </div>
                            ) : null}
                            {selected && !isDocumentStep ?
                                <p className="mt-2 flex flex-wrap gap-3">
                                    {/*
                                     * Open the FORM EDITOR, not a queue.
                                     *
                                     * This used to link to `${ADMIN_FORMS_UI_BASE}/<id>`, which is
                                     * the Work-queue base — an operator clicking "open" on a step
                                     * landed somewhere they could not edit the form. A step is a
                                     * thing you configure, so clicking it goes to where it is
                                     * configured.
                                     */}
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-alloy-blue hover:underline"
                                        data-testid={`packet-step-open-form-${idx}`}
                                        onClick={() =>
                                            dispatchAdminV2OpenProcessingModal({
                                                mode: "studio",
                                                studioTab: "forms",
                                                formId: selected.id,
                                                formName: selected.name,
                                            })
                                        }
                                    >
                                        Manage information →
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs font-semibold text-alloy-midnight/60 hover:underline"
                                        data-testid={`packet-step-preview-form-${idx}`}
                                        onClick={() =>
                                            dispatchAdminV2OpenProcessingModal({
                                                mode: "studio",
                                                studioTab: "forms",
                                                formId: selected.id,
                                                formName: selected.name,
                                                formMode: "preview",
                                            })
                                        }
                                    >
                                        Preview form
                                    </button>
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

            <div className="mt-4 flex flex-wrap items-start gap-2">
                <PacketAddStepChooser busy={busy} onAddFormStep={onAddStep} onAddDocumentStep={onAddDocumentStep} />
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
