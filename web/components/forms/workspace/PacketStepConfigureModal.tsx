"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";

import ProcessingAlloyDialog from "@/app/adminV2/pos/ProcessingAlloyDialog";
import { CLASSIFICATION_KEY_LABELS, OPERATOR_CLASSIFIED_KEYS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { openGovernedDocument } from "@/lib/forms/packets/openGovernedDocument";
import { opActionLinkAccent, opPrimaryActionButton } from "@/lib/operational/ui/operationalVisualTokens";

/**
 * How an obligation was decided, and where to change it.
 *
 * Packet Studio learned to EXPLAIN each obligation — what the family does, what is filed, whether a
 * signature is taken — and an administrator reading it asked the obvious next question: *how was
 * this stuff decided?* The explanation was derived from configuration nobody could see. Authoring
 * was a one-way door: a step could be created with its settings and then never opened again.
 *
 * So this shows the settings themselves, in the same words the summary uses. Its shape follows the
 * question an operator is actually asking:
 *
 *   Completion method   what the family does — stated, never edited (see below)
 *   The subject         the document they read, or what they send in and how it is filed
 *   Evidence            acknowledgment, signature: what completion records
 *   Instructions        what the family is told
 *   Managed by Alloy    behaviour the platform owns, described rather than offered as a toggle
 *
 * ## Two deliberate absences
 *
 * The completion METHOD is shown and not editable. Turning "read and acknowledge" into "upload a
 * document" is not an edit — it is a different obligation, with different evidence and a different
 * executor — so the product asks an administrator to add the kind they want instead of silently
 * re-pointing the machinery underneath one they already have.
 *
 * And the adapter Form never appears. A document step is executed by a generated single-question
 * form; exposing it here would hand back the exact implementation detail this vocabulary exists to
 * keep out of the administrator's model.
 */

export type ConfigurableStep = {
    packet_item_id: string;
    kind: "form" | "document_upload" | "document_acknowledgment";
    label: string;
    participant_instructions: string;
    document_type_key: string | null;
    acknowledgment_document_id: string | null;
    acknowledgment_document_title: string | null;
    requires_signature: boolean;
    /** For a Form step: where its questions actually live. */
    form_definition_id: string | null;
    form_name: string | null;
};

type OrgDocument = { id: string; name: string | null; original_filename: string | null };

const inputClass = "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm";

/** The classification in operator words, for the retention line. */
const documentClassificationLabelFor = (key: string): string =>
    (CLASSIFICATION_KEY_LABELS as Record<string, string>)[key] ?? "an enrollment document";

const documentLabel = (d: OrgDocument) =>
    (d.name ?? "").trim() || (d.original_filename ?? "").trim() || "Untitled document";

/** What the family does, in the words the rest of Packet Studio uses. */
const COMPLETION_METHOD: Readonly<Record<ConfigurableStep["kind"], string>> = Object.freeze({
    form: "Collect information",
    document_upload: "Upload a document",
    document_acknowledgment: "Read & acknowledge",
});

/** The type of thing this step IS, for an administrator wondering why it is not in Forms. */
export const STEP_TYPE_LABEL: Readonly<Record<ConfigurableStep["kind"], string>> = Object.freeze({
    form: "Form",
    document_upload: "Document upload",
    document_acknowledgment: "Document acknowledgment",
});

/**
 * HIERARCHY, NOT DOCUMENTATION IN EVERY CONTROL.
 *
 * Every setting used to carry its own justifying paragraph, so a drawer with six settings was six
 * paragraphs tall and scrolled past the bottom of the screen. The paragraphs were TRUE, which is
 * why they are not deleted — they moved behind `help`, one disclosure per field, opened by the
 * person who is actually asking "why".
 *
 * A field is therefore a label and a VALUE. What it means is one click away, and only for whoever
 * wants it.
 */

const valueClass = "text-sm text-alloy-midnight";
const helpTextClass = "text-[11px] leading-snug text-alloy-midnight/65";

function Field({
    label,
    children,
    help,
}: {
    label: string;
    children: React.ReactNode;
    help?: React.ReactNode;
}) {
    return (
        <div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-x-3 border-t border-alloy-midnight/[0.07] py-2.5 first:border-t-0 first:pt-0">
            <p className="pt-0.5 text-[11px] font-medium text-alloy-midnight/50">{label}</p>
            <div className="min-w-0">
                {children}
                {help ? (
                    <details className="mt-1 group">
                        <summary className="cursor-pointer list-none text-[11px] font-medium text-alloy-midnight/40 hover:text-alloy-bend-pine">
                            <span className="group-open:hidden">Why</span>
                            <span className="hidden group-open:inline">Hide</span>
                        </summary>
                        <div className="mt-1 space-y-1">
                            {typeof help === "string" ? <p className={helpTextClass}>{help}</p> : help}
                        </div>
                    </details>
                ) : null}
            </div>
        </div>
    );
}

/** What Alloy actually keeps. Traced to something persisted; nothing here is aspirational. */
function Retains({ lines }: { lines: readonly string[] }) {
    return (
        <ul className="space-y-0.5" data-testid="packet-step-retains">
            {lines.map((line) => (
                <li key={line} className={helpTextClass}>
                    <span aria-hidden className="mr-1 text-alloy-midnight/30">
                        •
                    </span>
                    {line}
                </li>
            ))}
        </ul>
    );
}

const FORM_RETAINS = Object.freeze([
    "Answers connected to Alloy update the child or family record",
    "Answers that are not connected stay with this Form's submission",
    "The submission itself is kept as evidence of what was answered",
]);

export function PacketStepConfigureModal({
    open,
    packetDefId,
    step,
    onClose,
    onSaved,
    onManageForm,
}: {
    open: boolean;
    packetDefId: string;
    step: ConfigurableStep | null;
    onClose: () => void;
    onSaved: () => void;
    onManageForm?: (formDefinitionId: string, formName: string | null) => void;
}) {
    const [label, setLabel] = useState("");
    const [instructions, setInstructions] = useState("");
    const [documentTypeKey, setDocumentTypeKey] = useState("");
    const [ackDocumentId, setAckDocumentId] = useState("");
    const [requiresSignature, setRequiresSignature] = useState(true);
    const [documents, setDocuments] = useState<OrgDocument[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !step) return;
        setLabel(step.label);
        setInstructions(step.participant_instructions);
        setDocumentTypeKey(step.document_type_key ?? "");
        setAckDocumentId(step.acknowledgment_document_id ?? "");
        setRequiresSignature(step.requires_signature);
        setErr(null);
    }, [open, step]);

    // Only a read-and-acknowledge step needs the document list, so only it pays for the fetch.
    useEffect(() => {
        if (!open || step?.kind !== "document_acknowledgment") return;
        let live = true;
        void (async () => {
            const res = await fetch("/api/admin/documents", { credentials: "same-origin" });
            const body = (await res.json().catch(() => ({}))) as { documents?: OrgDocument[] };
            if (live) setDocuments(body.documents ?? []);
        })();
        return () => {
            live = false;
        };
    }, [open, step?.kind]);

    const save = useCallback(async () => {
        if (!step) return;
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(
                `/api/admin/forms/packet-definitions/${encodeURIComponent(packetDefId)}/steps/${encodeURIComponent(step.packet_item_id)}`,
                {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        label,
                        participant_instructions: instructions,
                        ...(step.kind === "document_upload" ? { document_type_key: documentTypeKey } : {}),
                        ...(step.kind === "document_acknowledgment"
                            ? { acknowledgment_document_id: ackDocumentId, requires_signature: requiresSignature }
                            : {}),
                    }),
                },
            );
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error ?? "The change was refused.");
            onSaved();
            onClose();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [ackDocumentId, documentTypeKey, instructions, label, onClose, onSaved, packetDefId, requiresSignature, step]);

    if (!step) return null;

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title={step.label || COMPLETION_METHOD[step.kind]}
            subtitle={COMPLETION_METHOD[step.kind]}
            testId="packet-step-configure"
            footer={
                <>
                    <button
                        type="button"
                        className="text-sm font-medium text-alloy-midnight/60"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={opPrimaryActionButton}
                        disabled={busy}
                        data-testid="packet-step-configure-save"
                        onClick={() => void save()}
                    >
                        {busy ? "Saving…" : "Save configuration"}
                    </button>
                </>
            }
        >
            <div className="space-y-0.5" data-testid="packet-step-configure-body">
                <Field label="Step name">
                    <input
                        className={inputClass}
                        value={label}
                        disabled={busy}
                        data-testid="packet-step-configure-label"
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </Field>

                {step.kind === "form" ? (
                    <>
                        <Field
                            label="Questions"
                            help="The Form owns its questions, which are required, their answer types, and whether each answer updates an Alloy record or stays with the form. This packet owns only that the Form is included, its order, and the step name above."
                        >
                            <p className={valueClass}>{step.form_name ?? "A Form"}</p>
                            {step.form_definition_id && onManageForm ? (
                                <button
                                    type="button"
                                    className={clsx(opActionLinkAccent, "mt-1")}
                                    data-testid="packet-step-configure-manage-form"
                                    onClick={() => onManageForm(step.form_definition_id!, step.form_name)}
                                >
                                    Manage form
                                </button>
                            ) : null}
                        </Field>
                        <Field
                            label="Alloy handles"
                            help="Guided conversationally, with a review before completion. Families can correct existing information before they finish."
                        >
                            <p className={valueClass}>Reuses known information · asks only for what is missing</p>
                        </Field>
                        <Field label="Complete when">
                            <p className={valueClass} data-testid="packet-step-complete-when">
                                The family has answered the questions this Form requires, and submitted it.
                            </p>
                        </Field>
                        <Field label="Data" help={<Retains lines={FORM_RETAINS} />}>
                            <p className={valueClass}>Connected answers update the record · the rest stay with the form</p>
                        </Field>
                    </>
                ) : null}

                {step.kind === "document_acknowledgment" ? (
                    <>
                        <Field label="Document">
                            <select
                                className={inputClass}
                                value={ackDocumentId}
                                disabled={busy}
                                data-testid="packet-step-configure-document"
                                onChange={(e) => setAckDocumentId(e.target.value)}
                            >
                                <option value="">Choose a document…</option>
                                {documents.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {documentLabel(d)}
                                    </option>
                                ))}
                            </select>
                            {step.acknowledgment_document_id ? (
                                <button
                                    type="button"
                                    className={clsx(opActionLinkAccent, "mt-1")}
                                    data-testid="packet-step-configure-view-document"
                                    onClick={async () => {
                                        const opened = await openGovernedDocument(step.acknowledgment_document_id!);
                                        if (!opened.ok) setErr(opened.message);
                                    }}
                                >
                                    View document
                                </button>
                            ) : null}
                        </Field>
                        <Field
                            label="Acknowledgment"
                            help="Agreeing is what this obligation is. A read-and-acknowledge step with no acknowledgment would be a document nobody is asked to accept."
                        >
                            <p className={valueClass}>Required</p>
                        </Field>
                        <Field label="Signature">
                            <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="checkbox"
                                    className="accent-alloy-bend-pine"
                                    checked={requiresSignature}
                                    disabled={busy}
                                    data-testid="packet-step-configure-signature"
                                    onChange={(e) => setRequiresSignature(e.target.checked)}
                                />
                                Required
                            </label>
                        </Field>
                        <Field label="Complete when">
                            <p className={valueClass} data-testid="packet-step-complete-when">
                                {requiresSignature
                                    ? "The family acknowledges this document and provides the required signature."
                                    : "The family acknowledges this document."}
                            </p>
                        </Field>
                        <Field
                            label="Data"
                            help={
                                <>
                                    <p className={helpTextClass}>
                                        This step records acknowledgment of the document. It does not extract or map the
                                        document&rsquo;s contents into Alloy records. The family is shown the document
                                        before acknowledging it.
                                    </p>
                                    <Retains
                                        lines={[
                                            "Which document was acknowledged",
                                            "The acknowledgment, with the time it was given",
                                            ...(requiresSignature
                                                ? ["The signature, and a signed PDF of what was agreed"]
                                                : []),
                                            "The packet session it belongs to, so the acknowledgment is attributable",
                                        ]}
                                    />
                                </>
                            }
                        >
                            <p className={valueClass}>Attestation only · no record fields updated</p>
                        </Field>
                    </>
                ) : null}

                {step.kind === "document_upload" ? (
                    <>
                        <Field
                            label="Filed as"
                            help="This decides what the uploaded document is filed as, so staff and the rest of Alloy can find it by what it is rather than by its filename."
                        >
                            <select
                                className={inputClass}
                                value={documentTypeKey}
                                disabled={busy}
                                data-testid="packet-step-configure-classification"
                                onChange={(e) => setDocumentTypeKey(e.target.value)}
                            >
                                <option value="">Choose a document type…</option>
                                {OPERATOR_CLASSIFIED_KEYS.map((k) => (
                                    <option key={k} value={k}>
                                        {CLASSIFICATION_KEY_LABELS[k]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field
                            label="Alloy handles"
                            help="Every step in a packet must be completed before the packet is. Requiredness belongs to the packet as a whole, not to this step, so there is no toggle here."
                        >
                            <p className={valueClass}>Family can view or replace their file before finishing</p>
                        </Field>
                        <Field label="Complete when">
                            <p className={valueClass} data-testid="packet-step-complete-when">
                                The family provides the document. Receiving it is what completes this step.
                            </p>
                        </Field>
                        <Field
                            label="Data"
                            help={
                                <>
                                    <p className={helpTextClass}>
                                        Alloy keeps the document as evidence. Information from it is not extracted into
                                        the child&rsquo;s Health record, and filing a document under a type is not the
                                        same as reading what is inside it.
                                    </p>
                                    <Retains
                                        lines={[
                                            `The document itself, filed as ${documentClassificationLabelFor(documentTypeKey)} against the child`,
                                            "Which packet session and step it arrived from",
                                            "The most recent file, if the family replaced an earlier one",
                                        ]}
                                    />
                                </>
                            }
                        >
                            <p className={valueClass}>
                                Document kept as evidence · nothing extracted from it
                            </p>
                        </Field>
                    </>
                ) : null}

                <Field label="Family instructions">
                    <textarea
                        className={clsx(inputClass, "min-h-[64px]")}
                        value={instructions}
                        disabled={busy}
                        placeholder="Optional. Shown to the family with this step."
                        data-testid="packet-step-configure-instructions"
                        onChange={(e) => setInstructions(e.target.value)}
                    />
                </Field>

                {err ? (
                    <p className="pt-2 text-[12px] font-medium text-alloy-ember" data-testid="packet-step-configure-error">
                        {err}
                    </p>
                ) : null}
            </div>
        </ProcessingAlloyDialog>
    );
}
