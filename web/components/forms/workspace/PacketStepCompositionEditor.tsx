"use client";

import { useState } from "react";
import clsx from "clsx";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import type { PacketStepFormOption } from "@/lib/admin/forms/packetDefinitionStepForms";
import { applyRecentFormToSteps } from "@/lib/admin/forms/packetStepRecentFormPlacement";
import { dispatchAdminV2OpenProcessingModal } from "@/lib/adminV2/workspaceModalEvents";
import { packetStepReadinessLabel } from "@/lib/forms/packets/packetOrchestrationPresentation";
import { PACKET_STEP_KIND_LABELS, type PacketStepKind } from "@/lib/forms/packets/packetStepKind";
import { openGovernedDocument } from "@/lib/forms/packets/openGovernedDocument";
import { CLASSIFICATION_KEY_LABELS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { PacketAddStepChooser, type NewDocumentStep } from "@/components/forms/workspace/PacketAddStepChooser";
import {
    opActionLinkAccent,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opPrimaryActionButton,
} from "@/lib/operational/ui/operationalVisualTokens";

/** What one obligation actually does, derived server-side from the configuration. */
export type StepExperienceCard = {
    sequence: number;
    /** The obligation's own name, as the administrator titled it. */
    title: string;
    kind: "form" | "document_upload" | "document_acknowledgment";
    obligation: string;
    behavior: string;
    facts: string[];
    ready: boolean;
    readyDetail: string;
    form_definition_id?: string | null;
    acknowledgment_document_id?: string | null;
    packet_item_id?: string | null;
    participant_instructions?: string;
    document_type_key?: string | null;
    requires_signature?: boolean;
    acknowledgment_document_title?: string | null;
    form_name?: string | null;
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
    /** Open the configuration surface for one obligation. */
    onConfigureStep?: (index: number) => void;
    onStepsChange: (updater: (rows: StepDraft[]) => StepDraft[]) => void;
    onAddStep: () => void;
    /** Document steps persist on add — their executor is generated server-side. */
    onAddDocumentStep: (step: NewDocumentStep) => Promise<void>;
    onSaveSteps: () => void;
    onMoveStep: (index: number, dir: -1 | 1) => void;
    onRemoveStep: (index: number) => void;
};

/**
 * The ONE line under a step's name.
 *
 * The facts are already computed server-side for each obligation; the row's job is to show the few
 * that let an operator recognise the step, not to restate the whole contract. A form leads with its
 * shape ("80 questions · 65 required · …"); a document obligation leads with what it asks for and
 * what becomes of it. The rest is Configure's to explain.
 */
function stepSummary(
    kind: PacketStepKind,
    draft: StepDraft,
    card: StepExperienceCard | undefined,
): string {
    /*
     * The row already NAMES the obligation, so a fact that only restates it is a word the operator
     * reads twice and learns nothing from: "Upload a document · Family sends in a document · Filed
     * as Immunization record". The type label keeps the naming; the summary keeps the specifics.
     */
    const kindLabel = PACKET_STEP_KIND_LABELS[kind].toLowerCase();
    const restatesKind = (f: string) => {
        const t = f.trim().toLowerCase();
        return t === kindLabel || t === "family sends in a document";
    };
    const facts = (card?.facts ?? []).filter((f) => !restatesKind(f));
    if (facts.length) return facts.join(" · ");
    if (kind === "document_upload") {
        const label =
            CLASSIFICATION_KEY_LABELS[(draft.document_type_key ?? "") as keyof typeof CLASSIFICATION_KEY_LABELS] ??
            "an enrollment document";
        return `Filed as ${label}`;
    }
    if (kind === "document_acknowledgment") {
        const doc = draft.acknowledgment_document_title?.trim();
        const signature = draft.requires_signature ? "Acknowledgment + signature required" : "Acknowledgment required";
        return doc ? `${doc} · ${signature}` : signature;
    }
    return draft.form_definition_id ? "Form selected" : "No form selected yet";
}

/** Ordered step composition editor for packet builder (OW-4). */
export function PacketStepCompositionEditor({
    steps,
    forms,
    recentPublishedForms,
    busy,
    savedStepCount,
    experience,
    onConfigureStep,
    onStepsChange,
    onAddStep,
    onAddDocumentStep,
    onSaveSteps,
    onMoveStep,
    onRemoveStep,
}: Props) {
    /*
     * Composition controls are EDIT-ON-DEMAND.
     *
     * A configured step does not need its form dropdown and label input on screen forever; showing
     * them permanently is what turned three rows into a form-filling page. A row that has not
     * chosen a form yet still opens with them, because that row has nothing else to say.
     */
    const [editingRow, setEditingRow] = useState<number | null>(null);
    return (
        <div data-testid="packet-step-composition">
            <ol className={clsx(opGroupedSurface, "mt-4")} data-testid="packet-step-list">
                {steps.map((s, idx) => {
                    const selected = forms.find((f) => f.id === s.form_definition_id);
                    const published = selected?.has_published_version !== false && Boolean(s.form_definition_id);
                    const kind: PacketStepKind = s.kind ?? "form";
                    const isDocumentStep = kind !== "form";
                    const card = experience?.find((c) => c.sequence === idx);
                    const summary = stepSummary(kind, s, card);
                    const composing = !isDocumentStep && (editingRow === idx || !s.form_definition_id);
                    return (
                        <li key={s.packet_item_id ?? `draft-${idx}-${s.form_definition_id || "empty"}`} className={opGroupedRowInner}>
                            {/*
                              * ONE ROW, ONE SCAN.
                              *
                              * This row used to carry a step number, an obligation label, a second
                              * implementation-flavoured type badge, a readiness badge, a form
                              * dropdown, a label input, a facts line AND a paragraph of behaviour —
                              * for every step, permanently. Three obligations became a page of
                              * prose the operator had to reread on every visit to find one verb.
                              *
                              * What stays here is what answers "what is this, and is it ready".
                              * Everything that explains HOW it behaves now lives behind Configure,
                              * which is the surface whose whole job is to explain it.
                              */}
                            <div className="flex items-start gap-3">
                                <span
                                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-alloy-midnight/[0.06] text-[11px] font-semibold text-alloy-midnight/60"
                                    aria-hidden
                                >
                                    {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                        <p className="min-w-0 text-sm font-medium text-alloy-midnight">
                                            {s.step_label?.trim() || selected?.name || "Untitled step"}
                                        </p>
                                        {/*
                                          * ONE type treatment, in product language. "Read &
                                          * acknowledge" and "DOCUMENT ACKNOWLEDGMENT" were two
                                          * names for one fact, competing for the same glance.
                                          */}
                                        <span
                                            className="shrink-0 text-[11px] font-medium text-alloy-midnight/50"
                                            data-testid={`packet-step-type-${idx}`}
                                        >
                                            {PACKET_STEP_KIND_LABELS[kind]}
                                        </span>
                                    </div>
                                    <p
                                        className={clsx("mt-0.5", opMutedMeta)}
                                        data-testid={`packet-step-summary-${idx}`}
                                    >
                                        {summary}
                                    </p>
                                    {/* Status is not an action: it appears only when it needs to. */}
                                    {!isDocumentStep && s.form_definition_id && !published ? (
                                        <p className="mt-1">
                                            <FormsReviewBadge label={packetStepReadinessLabel(published)} tone="warning" />
                                        </p>
                                    ) : null}

                                    {composing ? (
                                        <div className="mt-2 grid gap-3 lg:grid-cols-2">
                                            <label className="space-y-1 text-sm">
                                                <span className={opMutedMeta}>Form</span>
                                                <select
                                                    className={inputClass}
                                                    value={s.form_definition_id}
                                                    disabled={busy}
                                                    data-testid={`packet-step-form-select-${idx}`}
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
                                                        onStepsChange((rows) =>
                                                            rows.map((r, j) => (j === idx ? { ...r, step_label: v } : r))
                                                        );
                                                    }}
                                                />
                                            </label>
                                        </div>
                                    ) : null}

                                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {kind === "document_acknowledgment" &&
                                        (card?.acknowledgment_document_id || s.acknowledgment_document_id) ? (
                                            <button
                                                type="button"
                                                className={opActionLinkAccent}
                                                data-testid={`packet-step-view-document-${idx}`}
                                                onClick={async () => {
                                                    const id = card?.acknowledgment_document_id || s.acknowledgment_document_id;
                                                    const opened = await openGovernedDocument(String(id));
                                                    if (!opened.ok) window.alert(opened.message);
                                                }}
                                            >
                                                View document
                                            </button>
                                        ) : null}
                                        {selected && !isDocumentStep ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className={opActionLinkAccent}
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
                                                    Manage form
                                                </button>
                                                <button
                                                    type="button"
                                                    className={opActionLinkAccent}
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
                                                    Preview
                                                </button>
                                            </>
                                        ) : null}
                                        {s.packet_item_id && onConfigureStep ? (
                                            <button
                                                type="button"
                                                className={opActionLinkAccent}
                                                data-testid={`packet-step-configure-${idx}`}
                                                disabled={busy}
                                                onClick={() => onConfigureStep(idx)}
                                            >
                                                Configure
                                            </button>
                                        ) : null}
                                        {!isDocumentStep && !composing ? (
                                            <button
                                                type="button"
                                                className={opActionLinkAccent}
                                                data-testid={`packet-step-change-form-${idx}`}
                                                disabled={busy}
                                                onClick={() => setEditingRow(idx)}
                                            >
                                                Change form
                                            </button>
                                        ) : null}
                                        <span aria-hidden className="text-alloy-midnight/20">
                                            |
                                        </span>
                                        <button
                                            type="button"
                                            className={opActionLinkAccent}
                                            aria-label={`Move step ${idx + 1} up`}
                                            disabled={busy || idx === 0}
                                            onClick={() => onMoveStep(idx, -1)}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className={opActionLinkAccent}
                                            aria-label={`Move step ${idx + 1} down`}
                                            disabled={busy || idx >= steps.length - 1}
                                            onClick={() => onMoveStep(idx, 1)}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs font-semibold text-alloy-ember hover:underline disabled:text-alloy-midnight/30 disabled:no-underline"
                                            disabled={busy || steps.length <= 1}
                                            onClick={() => onRemoveStep(idx)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <div className="mt-4 flex flex-wrap items-start gap-2">
                <PacketAddStepChooser busy={busy} onAddFormStep={onAddStep} onAddDocumentStep={onAddDocumentStep} />
                <button type="button" className={opPrimaryActionButton} disabled={busy} onClick={onSaveSteps}>
                    Save steps
                </button>
            </div>

            {savedStepCount > 0 ?
                <p className={clsx("mt-3", opMetadata)}>
                    If this packet already has sessions, step changes may be blocked — create a new packet instead.
                </p>
            :   null}
        </div>
    );
}
