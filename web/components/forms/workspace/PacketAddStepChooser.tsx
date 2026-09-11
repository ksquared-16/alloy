"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import PrimaryButton from "@/components/PrimaryButton";
import { CLASSIFICATION_KEY_LABELS, OPERATOR_CLASSIFIED_KEYS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { PACKET_STEP_KINDS, PACKET_STEP_KIND_LABELS, type PacketStepKind } from "@/lib/forms/packets/packetStepKind";
import { opMetadata, opMutedMeta } from "@/lib/operational/ui/operationalVisualTokens";

/**
 * "What do you need from the family?" — the step-authoring vocabulary, in the administrator's words.
 *
 * ## Why this screen exists
 *
 * Packet Studio could previously express exactly one obligation: complete this Form. Kelly's real
 * package contains two that are not Forms at all — read the Family Handbook and agree to it, and
 * send in the child's immunization record — and there was no way to author either, so they simply
 * were not in the product.
 *
 * The three choices below are the whole vocabulary. They are named for what the FAMILY does,
 * because that is the thing an administrator is deciding. The mechanism that executes a choice is
 * not mentioned here and must never be: the generated adapter form behind an upload step is an
 * implementation detail, and the moment it appears in this menu the operator's model has been
 * replaced by the schema's again.
 */

const DESCRIPTIONS: Readonly<Record<PacketStepKind, string>> = Object.freeze({
    form: "Ask questions and store the answers — names, contacts, health details.",
    document_upload: "Ask the family to send in a document you need to keep on file.",
    document_acknowledgment: "Give the family something to read, and record that they agreed to it.",
});

type OrgDocument = { id: string; title: string | null; original_filename: string | null };

export type NewDocumentStep = {
    kind: Exclude<PacketStepKind, "form">;
    label: string;
    instructions: string;
    document_type_key: string;
    acknowledgment_document_id: string;
    requires_signature: boolean;
};

const inputClass = "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm";

/** What a document is called when it has no title of its own. */
function documentLabel(d: OrgDocument): string {
    return (d.title ?? "").trim() || (d.original_filename ?? "").trim() || "Untitled document";
}

export function PacketAddStepChooser({
    busy,
    onAddFormStep,
    onAddDocumentStep,
}: {
    busy: boolean;
    onAddFormStep: () => void;
    /** Persists immediately — the step's executor has to be generated server-side. */
    onAddDocumentStep: (step: NewDocumentStep) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<NewDocumentStep | null>(null);
    const [documents, setDocuments] = useState<OrgDocument[]>([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState<string | null>(null);

    // Only the acknowledgment step needs the document list, so only it pays for the fetch.
    useEffect(() => {
        if (draft?.kind !== "document_acknowledgment" || documents.length > 0 || docsLoading) return;
        let cancelled = false;
        setDocsLoading(true);
        setDocsError(null);
        void (async () => {
            try {
                const res = await fetch("/api/admin/documents?limit=200", { credentials: "include" });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not load documents");
                const rows = ((json as { data?: OrgDocument[] }).data ?? []) as OrgDocument[];
                if (!cancelled) setDocuments(rows);
            } catch (e) {
                if (!cancelled) setDocsError((e as Error).message);
            } finally {
                if (!cancelled) setDocsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [draft?.kind, documents.length, docsLoading]);

    const startDocumentStep = (kind: Exclude<PacketStepKind, "form">) => {
        setOpen(false);
        setDraft({
            kind,
            label: "",
            instructions: "",
            document_type_key: "",
            acknowledgment_document_id: "",
            requires_signature: false,
        });
    };

    if (draft) {
        const isUpload = draft.kind === "document_upload";
        // The refusals from `packetStepConfigRefusal`, enforced here so the operator is stopped
        // before the request rather than after it.
        const incomplete =
            !draft.label.trim() ||
            (isUpload ? !draft.document_type_key : !draft.acknowledgment_document_id);

        return (
            <div
                className="mt-4 rounded-xl border border-alloy-midnight/10 bg-white p-4"
                data-testid="packet-document-step-composer"
            >
                <p className="text-sm font-semibold text-alloy-midnight">{PACKET_STEP_KIND_LABELS[draft.kind]}</p>
                <p className={clsx("mt-1", opMetadata)}>{DESCRIPTIONS[draft.kind]}</p>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="space-y-1 text-sm">
                        <span className={opMutedMeta}>What the family sees</span>
                        <input
                            className={inputClass}
                            value={draft.label}
                            disabled={busy}
                            placeholder={isUpload ? "Immunization record" : "Family Handbook"}
                            data-testid="packet-document-step-label"
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        />
                    </label>

                    {isUpload ? (
                        <label className="space-y-1 text-sm">
                            <span className={opMutedMeta}>File it as</span>
                            <select
                                className={inputClass}
                                value={draft.document_type_key}
                                disabled={busy}
                                data-testid="packet-document-step-type"
                                onChange={(e) => setDraft({ ...draft, document_type_key: e.target.value })}
                            >
                                <option value="">Choose…</option>
                                {OPERATOR_CLASSIFIED_KEYS.map((k) => (
                                    <option key={k} value={k}>
                                        {CLASSIFICATION_KEY_LABELS[k]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <label className="space-y-1 text-sm">
                            <span className={opMutedMeta}>Document they read</span>
                            <select
                                className={inputClass}
                                value={draft.acknowledgment_document_id}
                                disabled={busy || docsLoading}
                                data-testid="packet-document-step-document"
                                onChange={(e) => setDraft({ ...draft, acknowledgment_document_id: e.target.value })}
                            >
                                <option value="">{docsLoading ? "Loading…" : "Choose…"}</option>
                                {documents.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {documentLabel(d)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>

                <label className="mt-3 block space-y-1 text-sm">
                    <span className={opMutedMeta}>
                        {isUpload ? "Instructions (optional)" : "What they are agreeing to (optional)"}
                    </span>
                    <input
                        className={inputClass}
                        value={draft.instructions}
                        disabled={busy}
                        placeholder={
                            isUpload
                                ? "A photo or scan is fine."
                                : "I have read and agree to the Family Handbook."
                        }
                        onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                    />
                </label>

                {!isUpload ? (
                    <label className="mt-3 flex items-center gap-2 text-sm text-alloy-midnight">
                        <input
                            type="checkbox"
                            checked={draft.requires_signature}
                            disabled={busy}
                            onChange={(e) => setDraft({ ...draft, requires_signature: e.target.checked })}
                        />
                        Also ask for a signature
                    </label>
                ) : null}

                {docsError ? <p className="mt-2 text-sm text-alloy-ember">{docsError}</p> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                    <PrimaryButton
                        type="button"
                        className="!px-3 !py-2 text-sm"
                        disabled={busy || incomplete}
                        data-testid="packet-document-step-add"
                        onClick={() => {
                            void onAddDocumentStep(draft).then(() => setDraft(null));
                        }}
                    >
                        Add this step
                    </PrimaryButton>
                    <button
                        type="button"
                        className="text-sm font-semibold text-alloy-midnight/60"
                        disabled={busy}
                        onClick={() => setDraft(null)}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    if (!open) {
        return (
            <PrimaryButton
                type="button"
                className="!px-3 !py-2 text-sm"
                disabled={busy}
                data-testid="packet-add-step"
                onClick={() => setOpen(true)}
            >
                Add step
            </PrimaryButton>
        );
    }

    return (
        <div
            className="mt-1 w-full rounded-xl border border-alloy-midnight/10 bg-white p-3"
            data-testid="packet-add-step-menu"
        >
            <p className={opMutedMeta}>What do you need from the family?</p>
            <ul className="mt-2 grid gap-2">
                {PACKET_STEP_KINDS.map((kind) => (
                    <li key={kind}>
                        <button
                            type="button"
                            className="w-full rounded-lg border border-alloy-midnight/10 px-3 py-2 text-left hover:bg-alloy-stone/30"
                            disabled={busy}
                            data-testid={`packet-add-step-${kind}`}
                            onClick={() => {
                                if (kind === "form") {
                                    setOpen(false);
                                    onAddFormStep();
                                } else {
                                    startDocumentStep(kind);
                                }
                            }}
                        >
                            <span className="block text-sm font-semibold text-alloy-midnight">
                                {PACKET_STEP_KIND_LABELS[kind]}
                            </span>
                            <span className={clsx("block", opMetadata)}>{DESCRIPTIONS[kind]}</span>
                        </button>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                className="mt-2 text-sm font-semibold text-alloy-midnight/60"
                onClick={() => setOpen(false)}
            >
                Cancel
            </button>
        </div>
    );
}
