"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import ProcessingAlloyDialog from "@/app/adminV2/pos/ProcessingAlloyDialog";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload } from "@/components/forms/engine/formEnginePayload";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { openGovernedDocument } from "@/lib/forms/packets/openGovernedDocument";
import { CLASSIFICATION_KEY_LABELS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { PACKET_STEP_KIND_LABELS } from "@/lib/forms/packets/packetStepKind";
import {
    opActionLinkAccent,
    opMutedMeta,
    opPrimaryActionButton,
    opSecondaryActionButton,
} from "@/lib/operational/ui/operationalVisualTokens";
import type { StepExperienceCard } from "@/components/forms/workspace/PacketStepCompositionEditor";

/**
 * "Okay. Show me."
 *
 * ## The gap this closes
 *
 * An administrator can now configure three obligations precisely — collect this, have them read and
 * sign that, have them send in the other — and still have no way to SEE what they built. The only
 * way to find out was to launch a real child: mint a session, generate Processing work, produce
 * documents and communications, and then clean all of it up. Paying operational cost to answer a
 * configuration question is the wrong trade, and it is the reason configuration alone stopped being
 * enough here.
 *
 * ## What this is, exactly
 *
 * A CONFIGURATION-DRIVEN, READ-ONLY rendering of the packet as a family meets it. It reads the real
 * ordered steps, the real published Form schema, and the real acknowledgment document, and renders
 * them with the SAME participant components the runtime uses — `FormEngineRenderer` in `readonly`
 * mode — so this cannot drift into a second, prettier design that disagrees with the product.
 *
 * ## What it deliberately is NOT
 *
 * It is not the participant runtime. It creates no packet session, no submission, no Document, no
 * Processing work, no communication, no stage or process mutation, and no signature. That is not
 * enforced by a suppression list — it is true because every request this surface makes is a GET:
 * the form definition, its published version, and a signed URL for a document the administrator is
 * already entitled to open. There is no mutation route to suppress.
 *
 * The interactive simulation — a real ephemeral participant session an operator can actually drive —
 * remains the recorded follow-up. This surface says so in product language rather than implying it
 * is executing anything.
 */

type Props = {
    open: boolean;
    onClose: () => void;
    packetName: string;
    steps: readonly StepExperienceCard[];
};

type SchemaState =
    | { state: "idle" }
    | { state: "loading" }
    | { state: "ready"; schema: FormSchemaV1 }
    | { state: "unavailable"; reason: string };

/** Read-only: the form definition, then its PUBLISHED version. Never clones, never drafts. */
async function loadPublishedSchema(formDefinitionId: string): Promise<SchemaState> {
    try {
        const res = await fetch(`/api/admin/forms/${encodeURIComponent(formDefinitionId)}`, {
            credentials: "same-origin",
        });
        if (!res.ok) return { state: "unavailable", reason: "This form could not be read." };
        const body = (await res.json()) as {
            data?: { versions?: { id: string; version_number: number; status: string }[] };
        };
        const versions = body.data?.versions ?? [];
        const published = versions
            .filter((v) => v.status === "published")
            .sort((a, b) => b.version_number - a.version_number)[0];
        if (!published) {
            return {
                state: "unavailable",
                reason: "This form has no published version yet, so there is nothing a family would see.",
            };
        }
        const vRes = await fetch(
            `/api/admin/forms/${encodeURIComponent(formDefinitionId)}/versions/${encodeURIComponent(published.id)}`,
            { credentials: "same-origin" },
        );
        if (!vRes.ok) return { state: "unavailable", reason: "This form's published version could not be read." };
        const vBody = (await vRes.json()) as { data?: { schema_json?: unknown } };
        const parsed = safeParseFormSchema(vBody.data?.schema_json);
        if (!parsed.success) return { state: "unavailable", reason: "This form's questions could not be read." };
        return { state: "ready", schema: parsed.data };
    } catch (e) {
        return { state: "unavailable", reason: (e as Error).message };
    }
}

function ParticipantCard({ children }: { children: React.ReactNode }) {
    return <div className="rounded-xl border border-alloy-stone/25 bg-white p-4 sm:p-5">{children}</div>;
}

function StepRail({
    steps,
    current,
    onSelect,
}: {
    steps: readonly StepExperienceCard[];
    current: number;
    onSelect: (i: number) => void;
}) {
    return (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" data-testid="packet-preview-rail">
            {steps.map((s, i) => {
                const active = i === current;
                const done = i < current;
                return (
                    <li key={s.packet_item_id ?? s.sequence} className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onSelect(i)}
                            data-testid={`packet-preview-rail-${i}`}
                            aria-current={active ? "step" : undefined}
                            className={clsx(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                                active
                                    ? "bg-alloy-bend-pine text-white"
                                    : "text-alloy-midnight/60 hover:bg-alloy-bend-pine/[0.08]",
                            )}
                        >
                            <span
                                className={clsx(
                                    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                                    active ? "bg-white/25" : done ? "bg-alloy-bend-pine/15 text-alloy-bend-pine" : "bg-alloy-midnight/[0.07]",
                                )}
                            >
                                {i + 1}
                            </span>
                            {s.title}
                        </button>
                        {i < steps.length - 1 ? (
                            <span aria-hidden className="text-alloy-midnight/20">
                                ›
                            </span>
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}

export function PacketExperiencePreview({ open, onClose, packetName, steps }: Props) {
    const [current, setCurrent] = useState(0);
    const [schemas, setSchemas] = useState<Record<string, SchemaState>>({});

    useEffect(() => {
        if (open) setCurrent(0);
    }, [open]);

    const step = steps[current];
    const formId = step?.kind === "form" ? step.form_definition_id ?? null : null;

    useEffect(() => {
        if (!open || !formId) return;
        if (schemas[formId]) return;
        let cancelled = false;
        setSchemas((m) => ({ ...m, [formId]: { state: "loading" } }));
        void loadPublishedSchema(formId).then((r) => {
            if (!cancelled) setSchemas((m) => ({ ...m, [formId]: r }));
        });
        return () => {
            cancelled = true;
        };
        // `schemas` is deliberately absent: including it re-runs this effect on its own write and
        // cancels the fetch it just started. Keyed on the form being shown, which is what changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, formId]);

    const payload = useMemo(() => emptyPayload(), []);
    const noop = useCallback(() => {}, []);

    if (!open || !step) return null;

    const schemaState: SchemaState = formId ? schemas[formId] ?? { state: "idle" } : { state: "idle" };

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title={packetName || "Packet"}
            subtitle="What families complete"
            size="wide"
            testId="packet-experience-preview"
            footer={
                <div className="flex w-full items-center justify-between gap-2">
                    <span className={opMutedMeta}>
                        Step {current + 1} of {steps.length}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={opSecondaryActionButton}
                            disabled={current === 0}
                            data-testid="packet-preview-back"
                            onClick={() => setCurrent((i) => Math.max(0, i - 1))}
                        >
                            Back
                        </button>
                        {current < steps.length - 1 ? (
                            <button
                                type="button"
                                className={opPrimaryActionButton}
                                data-testid="packet-preview-next"
                                onClick={() => setCurrent((i) => Math.min(steps.length - 1, i + 1))}
                            >
                                Next
                            </button>
                        ) : (
                            <button type="button" className={opPrimaryActionButton} onClick={onClose}>
                                Done
                            </button>
                        )}
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                {/*
                 * SAY WHAT THIS IS, BEFORE ANYTHING THAT LOOKS LIKE A FORM.
                 *
                 * A screen that renders the participant components can be mistaken for the
                 * participant runtime, and that mistake is expensive in exactly one direction: an
                 * operator believing they have tested a send.
                 */}
                <div
                    className="rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.05] px-3 py-2"
                    data-testid="packet-preview-banner"
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-bend-pine">
                        Configuration preview
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/75">
                        Shows what this packet asks a family for, step by step. No responses are saved and nothing is
                        sent.
                    </p>
                    {/*
                     * SAID FIRST, BECAUSE IT IS THE THING MOST EASILY MISREAD.
                     *
                     * A family does not meet this screen. They meet one guided conversation that
                     * works through these obligations, and the runtime that drives it is real and
                     * already certified — it is simply not what is rendering here yet. Burying that
                     * at the bottom of the first step let this surface pass for the runtime, which
                     * is the one misunderstanding worth paying a line of screen to prevent.
                     */}
                    <p className="mt-1 text-[12px] leading-snug text-alloy-midnight/55">
                        This is the configuration, not the family&rsquo;s experience of it: a family answers Alloy&rsquo;s
                        guided conversation rather than filling these in. Running that conversation here is the next
                        step.
                    </p>
                </div>

                <StepRail steps={steps} current={current} onSelect={setCurrent} />

                <div data-testid={`packet-preview-step-${current}`}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                        <h3 className="text-sm font-semibold text-alloy-midnight">{step.title}</h3>
                        <span className="text-[11px] font-medium text-alloy-midnight/50">
                            {PACKET_STEP_KIND_LABELS[step.kind]}
                        </span>
                    </div>
                    {step.participant_instructions?.trim() ? (
                        <p className={clsx("mb-2", opMutedMeta)} data-testid="packet-preview-instructions">
                            {step.participant_instructions}
                        </p>
                    ) : null}

                    {step.kind === "form" ? (
                        <div className="space-y-3">
                            <p className={opMutedMeta} data-testid="packet-preview-form-note">
                                Alloy reuses information it already knows and asks only for what is missing, so a family
                                may see fewer questions than are shown here.
                            </p>
                            <ParticipantCard>
                                {schemaState.state === "ready" ? (
                                    <FormEngineRenderer
                                        schema={schemaState.schema}
                                        payload={payload}
                                        onChange={noop}
                                        mode="readonly"
                                        variant="embed"
                                    />
                                ) : schemaState.state === "loading" ? (
                                    <p className={opMutedMeta}>Loading the questions…</p>
                                ) : schemaState.state === "unavailable" ? (
                                    <p className={opMutedMeta}>{schemaState.reason}</p>
                                ) : (
                                    <p className={opMutedMeta}>This step has no form selected yet.</p>
                                )}
                            </ParticipantCard>
                            <p className={opMutedMeta} data-testid="packet-preview-conversation-note">
                                Alloy&rsquo;s guided conversation uses this configuration when a family begins.
                                Interactive conversation preview is not available yet.
                            </p>
                        </div>
                    ) : null}

                    {step.kind === "document_acknowledgment" ? (
                        <ParticipantCard>
                            <p className="text-sm font-medium text-alloy-midnight">
                                {step.acknowledgment_document_title ?? "The document you need to read"}
                            </p>
                            <p className={clsx("mt-1", opMutedMeta)}>
                                Read this document, then confirm you agree to it
                                {step.requires_signature ? " and sign" : ""}.
                            </p>
                            {step.acknowledgment_document_id ? (
                                <button
                                    type="button"
                                    className={clsx(opActionLinkAccent, "mt-2 block")}
                                    data-testid="packet-preview-view-document"
                                    onClick={async () => {
                                        const opened = await openGovernedDocument(step.acknowledgment_document_id!);
                                        if (!opened.ok) window.alert(opened.message);
                                    }}
                                >
                                    View document
                                </button>
                            ) : null}
                            <div className="mt-3 space-y-2 border-t border-alloy-midnight/[0.07] pt-3">
                                <label className="flex items-start gap-2 text-sm text-alloy-midnight/70">
                                    <input type="checkbox" disabled className="mt-0.5 accent-alloy-bend-pine" />I have
                                    read and agree to this document
                                </label>
                                {step.requires_signature ? (
                                    <div data-testid="packet-preview-signature">
                                        <p className={opMutedMeta}>Signature</p>
                                        <div className="mt-1 rounded-lg border border-dashed border-alloy-midnight/20 bg-alloy-stone/20 px-3 py-4 text-center text-[11px] text-alloy-midnight/45">
                                            The family types or draws their signature here
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </ParticipantCard>
                    ) : null}

                    {step.kind === "document_upload" ? (
                        <ParticipantCard>
                            <p className="text-sm font-medium text-alloy-midnight">
                                Send in your {(
                                    CLASSIFICATION_KEY_LABELS as Record<string, string>
                                )[step.document_type_key ?? ""] ?? "document"}
                            </p>
                            <p className={clsx("mt-1", opMutedMeta)}>
                                Upload the document you already have. You are not asked to type what is in it.
                            </p>
                            <div
                                className="mt-3 rounded-lg border border-dashed border-alloy-midnight/20 bg-alloy-stone/20 px-3 py-5 text-center"
                                data-testid="packet-preview-upload"
                            >
                                <p className="text-[12px] font-medium text-alloy-midnight/55">Choose a file</p>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/40">
                                    Upload is disabled in preview — nothing is stored.
                                </p>
                            </div>
                            <p className={clsx("mt-2", opMutedMeta)} data-testid="packet-preview-filed-as">
                                Filed as{" "}
                                {(CLASSIFICATION_KEY_LABELS as Record<string, string>)[step.document_type_key ?? ""] ??
                                    "an enrollment document"}
                                . The family can view what they sent, or replace it, before they finish.
                            </p>
                        </ParticipantCard>
                    ) : null}
                </div>
            </div>
        </ProcessingAlloyDialog>
    );
}
