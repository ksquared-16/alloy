"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";

import PrimaryButton from "@/components/PrimaryButton";
import ProcessingAlloyDialog from "@/app/adminV2/pos/ProcessingAlloyDialog";
import { CLASSIFICATION_KEY_LABELS, OPERATOR_CLASSIFIED_KEYS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-t border-alloy-midnight/[0.07] pt-3 first:border-t-0 first:pt-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">{label}</p>
            <div className="mt-1">{children}</div>
        </div>
    );
}

/** Behaviour the platform owns. Described truthfully; never offered as a toggle a runtime ignores. */
function ManagedByAlloy({ lines }: { lines: string[] }) {
    return (
        <div className="rounded-lg border border-alloy-midnight/10 bg-alloy-stone/[0.06] px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                Managed by Alloy
            </p>
            <ul className="mt-1 space-y-0.5">
                {lines.map((l) => (
                    <li key={l} className="text-[11px] leading-snug text-alloy-midnight/70">
                        <span aria-hidden className="mr-1 text-alloy-bend-pine">
                            ✓
                        </span>
                        {l}
                    </li>
                ))}
            </ul>
        </div>
    );
}

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
            subtitle={`${STEP_TYPE_LABEL[step.kind]} · configured here`}
            testId="packet-step-configure"
        >
            <div className="space-y-3" data-testid="packet-step-configure-body">
                <Row label="Completion method">
                    <p className="text-sm font-medium text-alloy-midnight">{COMPLETION_METHOD[step.kind]}</p>
                    <p className={clsx("mt-0.5", opMutedMeta)}>
                        A step&rsquo;s completion method cannot be changed. Remove this step and add the kind you want.
                    </p>
                </Row>

                <Row label="Step name the family sees">
                    <input
                        className={inputClass}
                        value={label}
                        disabled={busy}
                        data-testid="packet-step-configure-label"
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </Row>

                {step.kind === "form" ? (
                    <>
                        <Row label="Where its questions live">
                            <p className="text-sm font-medium text-alloy-midnight">
                                {step.form_name ?? "A Form"} — <span className="font-normal">configured in Forms</span>
                            </p>
                            <p className={clsx("mt-0.5", opMutedMeta)}>
                                The Form owns its questions, which are required, their answer types, and whether each
                                answer updates an Alloy record or stays with the form. This packet owns only that the
                                Form is included, its order, and the name above.
                            </p>
                            {step.form_definition_id && onManageForm ? (
                                <button
                                    type="button"
                                    className="mt-2 text-xs font-semibold text-alloy-blue hover:underline"
                                    data-testid="packet-step-configure-manage-form"
                                    onClick={() => onManageForm(step.form_definition_id!, step.form_name)}
                                >
                                    Manage form →
                                </button>
                            ) : null}
                        </Row>
                        <ManagedByAlloy
                            lines={[
                                "Uses information Alloy already knows, and asks only for what is missing",
                                "Families can correct existing information before they finish",
                                "Guided conversationally, with a review before completion",
                            ]}
                        />
                    </>
                ) : null}

                {step.kind === "document_acknowledgment" ? (
                    <>
                        <Row label="Document the family reads">
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
                                    className="mt-2 text-xs font-semibold text-alloy-blue hover:underline"
                                    data-testid="packet-step-configure-view-document"
                                    onClick={async () => {
                                        const res = await fetch(
                                            `/api/admin/documents/${encodeURIComponent(step.acknowledgment_document_id!)}/signed-url`,
                                            { credentials: "same-origin" },
                                        );
                                        const body = (await res.json().catch(() => ({}))) as {
                                            url?: string;
                                            data?: { url?: string };
                                        };
                                        const url = body.url ?? body.data?.url;
                                        if (url) window.open(url, "_blank", "noopener");
                                    }}
                                >
                                    View document →
                                </button>
                            ) : null}
                        </Row>
                        <Row label="Acknowledgment">
                            <p className="text-sm font-medium text-alloy-midnight">Required</p>
                            <p className={clsx("mt-0.5", opMutedMeta)}>
                                Agreeing is what this obligation is. A read-and-acknowledge step with no acknowledgment
                                would be a document nobody is asked to accept.
                            </p>
                        </Row>
                        <Row label="Signature">
                            <label className="flex items-center gap-2 text-sm text-alloy-midnight">
                                <input
                                    type="checkbox"
                                    className="accent-alloy-bend-pine"
                                    checked={requiresSignature}
                                    disabled={busy}
                                    data-testid="packet-step-configure-signature"
                                    onChange={(e) => setRequiresSignature(e.target.checked)}
                                />
                                Require a signature
                            </label>
                        </Row>
                        <Row label="Completion evidence">
                            <p className={opMetadata}>
                                Completion records the document the family acknowledged and their acknowledgment
                                {requiresSignature ? " and signature" : ""}.
                            </p>
                        </Row>
                    </>
                ) : null}

                {step.kind === "document_upload" ? (
                    <>
                        <Row label="Filed as">
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
                            <p className={clsx("mt-0.5", opMutedMeta)}>
                                This decides what the uploaded document is filed as, so staff and the rest of Alloy can
                                find it by what it is rather than by its filename.
                            </p>
                        </Row>
                        <Row label="Required">
                            <p className={opMetadata}>
                                Every step in a packet must be completed before the packet is. Requiredness belongs to
                                the packet as a whole, not to this step, so there is no toggle here.
                            </p>
                        </Row>
                        <ManagedByAlloy
                            lines={[
                                "The family uploads their existing document",
                                "They can view what they sent",
                                "They can replace it before they finish",
                            ]}
                        />
                        <Row label="Document intelligence">
                            <p className="text-sm font-medium text-alloy-midnight">Not configured</p>
                            <p className={clsx("mt-0.5", opMutedMeta)}>
                                Alloy files the document. It does not read values out of it, so the family is never
                                asked to retype what the document already says.
                            </p>
                        </Row>
                    </>
                ) : null}

                <Row label="What the family is told">
                    <textarea
                        className={clsx(inputClass, "min-h-[64px]")}
                        value={instructions}
                        disabled={busy}
                        placeholder="Optional. Shown to the family with this step."
                        data-testid="packet-step-configure-instructions"
                        onChange={(e) => setInstructions(e.target.value)}
                    />
                </Row>

                {err ? (
                    <p className="text-[12px] font-medium text-alloy-ember" data-testid="packet-step-configure-error">
                        {err}
                    </p>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" className="text-sm font-medium text-alloy-midnight/60" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={busy} onClick={() => void save()}>
                        {busy ? "Saving…" : "Save configuration"}
                    </PrimaryButton>
                </div>
            </div>
        </ProcessingAlloyDialog>
    );
}
