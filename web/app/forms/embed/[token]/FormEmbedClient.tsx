"use client";

import { PROCESSING_NEEDS_DESTINATION_DESCRIPTION } from "@/lib/pos/processingCase/formDraft/questionResolutionModel";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { ParticipantUploads } from "./ParticipantUploads";
import { ParticipantArtifactHeader } from "./ParticipantArtifactHeader";
import { participantArtifactStatus } from "@/lib/enrollment/participantRuntime/participantArtifactStatus";
import {
    outstandingUploadRequests,
    participantUploadRequests,
    uploadIsOnFile,
} from "@/lib/enrollment/participantRuntime/participantUploadRequests";
import { validateFormSchema } from "@/lib/forms/schema";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { NormalizedValidationError } from "@/lib/forms/validateSubmission";
import { FormEngineRenderer, type FormEngineOptionChoice } from "@/components/forms/engine/FormEngineRenderer";
import { emptyPayload, payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import { formatPublicValidationErrors } from "@/lib/public/forms/formatPublicValidationErrors";
import { subSchemaForFieldsGrouped } from "@/lib/forms/guidedIntakePartition";
import { buildGuidedQuestionPlan, mirrorCanonicalValues, type GuidedQuestionPlan } from "@/lib/forms/guidedQuestionPlan";
import {
    buildFamilyGuidedPlan,
    detectFamilyChildren,
    isFamilyIntake,
    seedFamilyChildSlices,
    omitChildFields,
    assembleFamilySubmissionPayload,
    type FamilyChildRef,
    type FamilyGuidedPlan,
} from "@/lib/forms/familyGuidedPlan";
import { partitionFieldsByScope } from "@/lib/forms/fieldScope";
import { EnrollmentConversationCard } from "./EnrollmentConversationCard";
import { CompiledArtifactReview } from "./CompiledArtifactReview";
import { ParticipantDocumentCanvas } from "./ParticipantDocumentCanvas";
import { SemanticFactEditor } from "./SemanticFactEditor";
import { SignatureCaptureDialog, type CapturedSignature } from "./SignatureCaptureDialog";
import {
    compileParticipantArtifact,
    type CompiledArtifactControl,
} from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import { participantSignaturePrompt } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import type { ParticipantBrand } from "@/lib/public/forms/participantBrandTheme";
import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import {
    IntakeFrame,
    IntakeCard,
    IntakeProgress,
    IntakeHeading,
    IntakeChips,
    IntakePacketChecklist,
    IntakeFooter,
    IntakeCompletion,
    IntakeNotice,
} from "./ParentIntakeShell";

type ResolvePacketMeta = {
    packet_session_id: string;
    packet_definition_id: string;
    packet_name: string | null;
    current_sequence_index: number;
    total_steps: number;
    current_session_item_id: string;
    step_summaries?: { sequence_index: number; form_name: string }[];
    /** Values already settled in the conversation, keyed to THIS step's field ids. */
    shared_prefill_by_field_id?: Record<string, unknown>;
};

/**
 * Apply what the participant has already settled to the artifact being rendered.
 *
 * Settled values WIN over an empty draft and lose to anything the participant has typed here: they
 * are the answer of record until this artifact is edited, and re-imposing them over a live edit
 * would fight the parent's own keystrokes.
 *
 * Without this the review step showed empty boxes for facts that were sitting in the session — the
 * value existed, keyed correctly, and nothing read it.
 */
/**
 * Strip operator-facing authoring notes from a schema before a PARENT sees it.
 *
 * "Needs destination configuration" is the form builder's own placeholder, telling an operator that
 * a field has no canonical destination yet. It was rendering to parents as guidance underneath
 * "Child Full Name" — an internal to-do presented as an instruction to someone who cannot act on it.
 *
 * Referenced by its constant rather than matched as a string, so the day the builder rewords it this
 * follows rather than silently stops working. The FIELD still renders; only the note is removed.
 */
function withoutAuthoringNotes(schema: FormSchemaV1): FormSchemaV1 {
    const strip = (fields: FormField[]): FormField[] =>
        fields.map((f) => {
            const next =
                f.description?.trim() === PROCESSING_NEEDS_DESTINATION_DESCRIPTION
                    ? { ...f, description: undefined }
                    : f;
            return next.type === "group" ? { ...next, fields: strip(next.fields) } : next;
        });
    return { ...schema, fields: strip(schema.fields) };
}

function withSharedPrefill(payload: FormPayload, packet: ResolvePacketMeta | null | undefined): FormPayload {
    const shared = packet?.shared_prefill_by_field_id;
    if (!shared || Object.keys(shared).length === 0) return payload;
    const current = (payload.values ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...current };
    for (const [fieldId, value] of Object.entries(shared)) {
        const existing = merged[fieldId];
        const empty = existing == null || (typeof existing === "string" && existing.trim() === "");
        if (empty) merged[fieldId] = value;
    }
    return { ...payload, values: merged };
}

/**
 * A sub-schema for rendering ONE compiled control (or the final acknowledge-and-sign group) through
 * the Forms engine, inside the compiled review.
 *
 * Title and section titles are stripped deliberately: the review owns the document's presentation,
 * and on the certification form the authored section titles are OCR page markers ("Page 1") that
 * must not resurface as headings beside a single input. Type, options, validation and signature
 * semantics are untouched — they all remain the Form's.
 *
 * LABELS pass through the participant seam, and this is the one place that happens for every
 * rendered control. An imported Form's label is often the source PDF's internal widget name
 * (`Var history`, `Prov Sp`, `Signature1`), which is not a question and must never be printed to a
 * parent. `participant_label` is null for exactly those, and a control with no words of its own is
 * captioned by the artifact rather than by the source system.
 */
function reviewControlSubSchema(
    schema: FormSchemaV1,
    fieldIds: string[],
    participantLabels?: ReadonlyMap<string, string | null>,
): FormSchemaV1 {
    const sub = subSchemaForFieldsGrouped(schema, fieldIds, "");
    const relabel = (fields: FormField[]): FormField[] =>
        fields.map((f) => {
            if (f.type === "group") {
                return { ...f, fields: relabel((f as { fields: FormField[] }).fields) } as FormField;
            }
            if (!participantLabels?.has(f.id)) return f;
            const words = participantLabels.get(f.id) ?? null;
            return { ...f, label: words ?? UNNAMED_SOURCE_CONTROL_LABEL } as FormField;
        });
    return {
        ...sub,
        fields: relabel(sub.fields as FormField[]),
        sections: sub.sections.map((s) => ({ id: s.id, field_ids: s.field_ids })),
    };
}

/**
 * What a control is called when the source document named it and nobody else did.
 *
 * Not a guess at the question — a statement that the words live on the page in front of the parent.
 * Reached only if such a control is ever rendered as a captioned input; on a source-fidelity
 * artifact it is presented at its authored placement instead.
 */
const UNNAMED_SOURCE_CONTROL_LABEL = "Marked on your document";

type ResolveOk = {
    ok: true;
    data: {
        schema_json: unknown | null;
        pdf_mapping_json?: unknown | null;
        packet_terminal?: boolean;
        packet?: ResolvePacketMeta | null;
        brand?: ParticipantBrand | null;
        option_values_by_field_id?: Record<string, string[]>;
        option_choices_by_field_id?: Record<string, FormEngineOptionChoice[]>;
        link?: { metadata?: Record<string, unknown> };
    };
};

/**
 * Whether the pinned version carries an ORIGINAL document (a `fidelity_v1` mapping).
 *
 * A duck check on the resolve payload, deliberately: the full contract lives server-side (it pulls
 * crypto and storage), and this flag only chooses PRESENTATION. The document route re-validates
 * everything; if it refuses, the viewer reports unavailable and the semantic review stands.
 */
function hasOriginalDocument(pdfMappingJson: unknown): boolean {
    return (
        !!pdfMappingJson &&
        typeof pdfMappingJson === "object" &&
        (pdfMappingJson as { engine?: unknown }).engine === "fidelity_v1"
    );
}

type ApiErr = {
    ok: false;
    error: string;
    validation_errors?: NormalizedValidationError[];
    code?: string;
};

function storageKey(token: string): string {
    return `alloy_public_form_submission:${encodeURIComponent(token)}`;
}

function normalizeOptionValues(raw: Record<string, string[]> | undefined): Record<string, readonly string[]> {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, readonly string[]> = {};
    for (const [k, v] of Object.entries(raw)) {
        out[k] = Array.isArray(v) ? v.map(String) : [];
    }
    return out;
}

function normalizeOptionChoices(
    raw: Record<string, FormEngineOptionChoice[]> | undefined
): Record<string, readonly FormEngineOptionChoice[]> {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, readonly FormEngineOptionChoice[]> = {};
    for (const [k, arr] of Object.entries(raw)) {
        if (!Array.isArray(arr)) continue;
        out[k] = arr
            .filter((x): x is FormEngineOptionChoice => x && typeof x === "object" && typeof x.value === "string")
            .map((x) => ({ value: x.value, label: typeof x.label === "string" ? x.label : x.value }));
    }
    return out;
}

function PreviewBanner() {
    return (
        <div
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950"
        >
            <span className="font-semibold">Previewing public form</span>
            {" — "}
            Same experience recipients see when they open your embed link (opened from Alloy admin in a new tab).
            Submissions here create real records in this environment unless you are on a sandbox.
        </div>
    );
}

export function FormEmbedClient({
    token,
    showPreviewBanner = false,
    initialResolve = null,
}: {
    token: string;
    showPreviewBanner?: boolean;
    /**
     * Resolve payload rendered by the server (same shape as `/resolve`), so the first paint already
     * has the form. Null when the server could not resolve it — bootstrap then fetches as before.
     */
    initialResolve?: Record<string, unknown> | null;
}) {
    const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
    const [message, setMessage] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<NormalizedValidationError[] | null>(null);
    const [schema, setSchema] = useState<FormSchemaV1 | null>(null);
    const [payload, setPayload] = useState<FormPayload>(() => emptyPayload());
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [optionValuesByFieldId, setOptionValuesByFieldId] = useState<Record<string, readonly string[]>>({});
    const [optionChoicesByFieldId, setOptionChoicesByFieldId] = useState<
        Record<string, readonly FormEngineOptionChoice[]>
    >({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    /**
     * The Enrollment objective for this token, when there is one.
     *
     * Null for an ordinary form link and for a packet predating the D-95 process anchor — the
     * endpoint answers `NO_ENROLLMENT_JOURNEY` for both — so every existing participant experience
     * renders exactly as before. Fetched after paint and never blocking: a failure here must not
     * keep a parent from their forms.
     */
    // The tenant's own brand, resolved server-side from the authored form metadata. Held here and
    // applied by the frame so the conversation and the artifact review cannot theme differently.
    const [brand, setBrand] = useState<ParticipantBrand | null>(null);
    const [enrollmentObjective, setEnrollmentObjective] = useState<ParticipantObjectiveWire | null>(null);
    /**
     * The runtime phase, kept in sync as the conversation advances.
     *
     * Seeded from the objective fetch and updated by the card on every turn, because the parent
     * crosses from shared collection into artifact review MID-conversation — waiting for a reload to
     * notice would leave them looking at a finished conversation and no paperwork.
     */
    const [enrollmentPhase, setEnrollmentPhase] = useState<ParticipantObjectiveWire["phase"] | null>(null);
    /**
     * Original-document presentation state.
     *
     * `originalDocument` mirrors the pinned version's fidelity mapping; `documentRev` is the
     * refresh contract — bumping it re-fetches the render, which is how a corrected fact reaches
     * the document; `documentUnavailable` is the honest fallback: if the document cannot render,
     * the semantic review stands and the parent is never shown a blank.
     */
    const [originalDocument, setOriginalDocument] = useState(false);
    /**
     * What the RENDERER says this artifact is — the one answer that spans both engines.
     *
     * `originalDocument` above is a duck read of the fidelity mapping and therefore true only for a
     * source replica. Using it to decide whether to show a document at all sent every generated
     * agreement — the completed Admissions application, the Tuition and Handbook agreements — down
     * the semantic fallback, where the parent met an HTML form instead of the document Alloy had
     * composed for them.
     */
    const [artifactModel, setArtifactModel] = useState<{
        renderer: "source_fidelity" | "generated_document";
        page_count: number;
        signatures: Array<{ field_id: string; page: number; x: number; y: number; width: number; height: number }>;
    } | null>(null);
    const [documentRev, setDocumentRev] = useState(0);
    const [documentUnavailable, setDocumentUnavailable] = useState(false);
    const documentRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /**
     * The participant's place in the review: conversation completion hands off to REVIEW (the
     * document alone), MAKE A CHANGE opens the semantic facts, EVERYTHING LOOKS GOOD moves to
     * SIGN. Distinct states, one token route, no step numbers — the parent sees pages, not a
     * wizard.
     */
    const [reviewStep, setReviewStep] = useState<"handoff" | "review" | "edit" | "sign">("handoff");
    const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
    /** What the parent captured, for previewing the mark ON the document before submitting. */
    const [capturedSignature, setCapturedSignature] = useState<{
        typedName?: string;
        drawnDataUrl?: string;
    } | null>(null);
    /**
     * The version's `pdf_mapping_json`, held so the compiled artifact can tell an authored label
     * from the source document's own widget name. Null for a generated document.
     */
    const [sourceMapping, setSourceMapping] = useState<unknown>(null);
    /** Filenames for what the parent attached, so the row can say WHICH file is on file. */
    const [attachedFilenames, setAttachedFilenames] = useState<Record<string, string>>({});
    /** The version's authored signature placement — where on the document signing happens. */
    const [signaturePlacement, setSignaturePlacement] = useState<{
        field_id: string;
        page: number;
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(null);
    const [packetProgress, setPacketProgress] = useState<ResolvePacketMeta | null>(null);
    const [packetAlreadyDone, setPacketAlreadyDone] = useState(false);
    const [packetFinalThankYou, setPacketFinalThankYou] = useState(false);
    const [advancingToNextPacketStep, setAdvancingToNextPacketStep] = useState(false);
    // Guided intake shell (packets only): schema-generated steps, rendered by field type.
    const [guidedPlan, setGuidedPlan] = useState<GuidedQuestionPlan | null>(null);
    const [guidedStepIdx, setGuidedStepIdx] = useState(0);
    // Family Packet intake (multi-child): per-child value slices + step index.
    const [familyChildren, setFamilyChildren] = useState<FamilyChildRef[]>([]);
    const [childSlices, setChildSlices] = useState<Record<string, Record<string, unknown>>>({});
    const [familyStepIdx, setFamilyStepIdx] = useState(0);
    const draftPersistSeqRef = useRef(0);
    const submittedRef = useRef(false);

    useEffect(() => {
        submittedRef.current = submitted;
    }, [submitted]);

    const encToken = useMemo(() => encodeURIComponent(token), [token]);
    // Server-provided payload is good for the FIRST bootstrap only. Re-bootstraps (retry, packet
    // step advance) must hit the network so they observe current state.
    const pendingInitialResolve = useRef<Record<string, unknown> | null>(initialResolve);

    const bootstrap = useCallback(async () => {
        try {
            setPhase("loading");
            setMessage(null);
            setValidationErrors(null);
            setSubmitted(false);
            setPacketFinalThankYou(false);
            setPacketAlreadyDone(false);
            setPacketProgress(null);
            setGuidedPlan(null);
            setGuidedStepIdx(0);
            setFamilyChildren([]);
            setChildSlices({});
            setFamilyStepIdx(0);
            const seeded = pendingInitialResolve.current;
            pendingInitialResolve.current = null;
            const json = seeded
                ? ({ ok: true, data: seeded } as unknown as ResolveOk)
                : ((await (
                      await fetch(`/api/public/forms/${encToken}/resolve`, { method: "GET" })
                  ).json()) as ResolveOk | ApiErr);
            if (!json.ok) {
                setPhase("error");
                const code = json.code ? ` [${json.code}]` : "";
                setMessage(`${json.error ?? "Resolve failed"}${code}`);
                return;
            }

            if (json.data.packet_terminal) {
                setPacketProgress(json.data.packet ?? null);
            setBrand(json.data.brand ?? null);
                setPacketAlreadyDone(true);
                setSchema(null);
                setPhase("ready");
                return;
            }

            const rawSchema = json.data.schema_json as FormSchemaV1 | null;
            if (!rawSchema) {
                setPhase("error");
                setMessage("No form schema returned");
                return;
            }

            let parsedSchema: FormSchemaV1;
            try {
                parsedSchema = validateFormSchema(rawSchema);
            } catch {
                setPhase("error");
                setMessage("Invalid form schema");
                return;
            }
            setSchema(withoutAuthoringNotes(parsedSchema));
            setOriginalDocument(hasOriginalDocument(json.data.pdf_mapping_json));
            setSourceMapping(json.data.pdf_mapping_json ?? null);
            setAttachedFilenames({});
            setDocumentUnavailable(false);
            setDocumentRev(0);
            setReviewStep("handoff");
            setCapturedSignature(null);
            /*
             * Where this artifact is signed comes from the RENDERER, not from the mapping.
             *
             * A composed document has no mapping — its signature block is reserved by the layout —
             * so reading `pdf_mapping_json` here found nothing on the generated Tuition and
             * Handbook agreements, and the parent was given a text box beside the document instead
             * of the signature line on it. `enrollment-artifact` answers for both engines.
             */
            setSignaturePlacement(null);
            setArtifactModel(null);
            void (async () => {
                try {
                    const res = await fetch(`/api/public/forms/${encToken}/enrollment-artifact`);
                    const body = (await res.json()) as {
                        ok?: boolean;
                        data?: {
                            renderer?: "source_fidelity" | "generated_document";
                            page_count?: number;
                            signatures?: Array<Record<string, unknown>>;
                        };
                    };
                    const slots = Array.isArray(body?.data?.signatures) ? body.data.signatures : [];
                    if (body?.ok && body.data?.renderer) {
                        setArtifactModel({
                            renderer: body.data.renderer,
                            page_count: typeof body.data.page_count === "number" ? body.data.page_count : 1,
                            signatures: slots as NonNullable<typeof artifactModel>["signatures"],
                        });
                    }
                    /*
                     * The FIRST placement is the signature this artifact asks this parent for.
                     *
                     * The Oregon CIS carries two — "Signature*" and "Update signature" — and the
                     * second is for a later re-verification, not for enrolling. Signing one must
                     * never satisfy the other, and it does not: each is its own destination with its
                     * own evidence row.
                     */
                    const first = slots[0];
                    if (
                        first &&
                        typeof first.field_id === "string" &&
                        ["page", "x", "y", "width", "height"].every((k) => typeof first[k] === "number")
                    ) {
                        setSignaturePlacement(first as unknown as NonNullable<typeof signaturePlacement>);
                    }
                } catch {
                    /* No placement: the Forms signature control stands, exactly as before. */
                }
            })();
            setPacketProgress(json.data.packet ?? null);
            setBrand(json.data.brand ?? null);
            setFamilyChildren(detectFamilyChildren(json.data.link?.metadata));
            setOptionValuesByFieldId(normalizeOptionValues(json.data.option_values_by_field_id));
            setOptionChoicesByFieldId(normalizeOptionChoices(json.data.option_choices_by_field_id));

            const stored =
                typeof window !== "undefined" ? window.sessionStorage.getItem(storageKey(token)) : null;
            if (stored && /^[0-9a-f-]{36}$/i.test(stored)) {
                const loaded = await fetch(`/api/public/forms/${encToken}/submissions/${stored}`, {
                    method: "GET",
                });
                const body = (await loaded.json()) as {
                    ok: boolean;
                    data?: { id: string; payload: FormPayload };
                    error?: string;
                };
                if (loaded.ok && body.ok && body.data?.payload) {
                    setSubmissionId(body.data.id);
                    let nextPayload = body.data.payload;
                    if (json.data.packet) {
                        nextPayload = {
                            ...nextPayload,
                            values: filterPayloadValuesToSchemaFields(
                                parsedSchema,
                                (nextPayload.values ?? {}) as Record<string, unknown>
                            ),
                        };
                    }
                    setPayload(withSharedPrefill(nextPayload, json.data.packet ?? null));
                    setPhase("ready");
                    return;
                }
                window.sessionStorage.removeItem(storageKey(token));
            }

            const initialPayload = payloadWithMinimumRepeatingGroups(parsedSchema);
            const created = await fetch(`/api/public/forms/${encToken}/submissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payload: initialPayload }),
            });
            const cr = (await created.json()) as {
                ok: boolean;
                data?: { id: string; payload?: FormPayload };
                error?: string;
            };
            if (!cr.ok || !cr.data?.id) {
                setPhase("error");
                setMessage(cr.error ?? "Could not start form session");
                return;
            }
            setSubmissionId(cr.data.id);
            window.sessionStorage.setItem(storageKey(token), cr.data.id);
            // For packets, the server merges known-record prefill into the created draft
            // and returns it. Use server payload (scalars + collection groups) when present.
            let firstPayload: FormPayload = initialPayload;
            if (cr.data.payload && typeof cr.data.payload === "object") {
                const serverPayload = cr.data.payload;
                firstPayload = {
                    ...serverPayload,
                    values: filterPayloadValuesToSchemaFields(
                        parsedSchema,
                        (serverPayload.values ?? {}) as Record<string, unknown>
                    ),
                    groups: serverPayload.groups ?? initialPayload.groups,
                };
            }
            setPayload(withSharedPrefill(firstPayload, json.data.packet ?? null));
            setPhase("ready");
        } finally {
            setAdvancingToNextPacketStep(false);
        }
    }, [encToken, token]);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    // Generate the guided question plan once per form step (packets only), from the schema.
    useEffect(() => {
        if (phase !== "ready" || !schema || !packetProgress || guidedPlan) return;
        setGuidedPlan(buildGuidedQuestionPlan(schema, (payload.values ?? {}) as Record<string, unknown>));
        setGuidedStepIdx(0);
    }, [phase, schema, packetProgress, guidedPlan, payload.values]);

    useLayoutEffect(() => {
        if ((!submitted && !packetFinalThankYou) || typeof window === "undefined") return;
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [submitted, packetFinalThankYou]);

    const persistDraft = useCallback(
        async (next: FormPayload) => {
            if (!submissionId || submittedRef.current || packetAlreadyDone) return;
            const seq = ++draftPersistSeqRef.current;
            const res = await fetch(`/api/public/forms/${encToken}/submissions/${submissionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payload: next,
                    option_values_by_field_id: optionValuesByFieldId,
                }),
            });
            if (seq !== draftPersistSeqRef.current || submittedRef.current) return;
            if (!res.ok) {
                // Draft autosave validation is non-blocking — only submit surfaces field errors (IC-5.6).
                return;
            }
        },
        [encToken, optionValuesByFieldId, submissionId, packetAlreadyDone]
    );

    const handleSubmit = useCallback(async () => {
        if (!submissionId || submitting || submitted || packetAlreadyDone) return;
        setSubmitting(true);
        setMessage(null);
        setValidationErrors(null);
        // Family packets: assemble first child into canonical values, all children into meta.family.
        const famChildFieldIds = schema && packetProgress && familyChildren.length > 1 ? partitionFieldsByScope(schema).child : [];
        const submitPayload =
            schema && isFamilyIntake(familyChildren, famChildFieldIds)
                ? (() => {
                      const a = assembleFamilySubmissionPayload({
                          baseValues: omitChildFields((payload.values ?? {}) as Record<string, unknown>, famChildFieldIds),
                          childAnswers: familyChildren.map((c) => ({ customer_member_id: c.customer_member_id, ...(c.label ? { label: c.label } : {}), values: childSlices[c.customer_member_id] ?? {} })),
                          childFieldIds: famChildFieldIds,
                          meta: (payload as { meta?: Record<string, unknown> }).meta ?? {},
                      });
                      return { ...payload, values: a.values, meta: a.meta };
                  })()
                : payload;
        try {
            const res = await fetch(`/api/public/forms/${encToken}/submissions/${submissionId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payload: submitPayload,
                    option_values_by_field_id: optionValuesByFieldId,
                }),
            });
            const json = (await res.json()) as
                | ApiErr
                | {
                      ok: true;
                      data?: {
                          packet_complete?: boolean;
                          next_form_available?: boolean;
                      };
                  };
            if (!json.ok) {
                const errBody = json as ApiErr;
                setValidationErrors(errBody.validation_errors ?? null);
                setMessage(errBody.error ?? "Submit failed");
                return;
            }
            window.sessionStorage.removeItem(storageKey(token));
            setValidationErrors(null);
            setMessage(null);

            const data = json.ok ? json.data : undefined;
            if (data?.next_form_available === true && data.packet_complete === false) {
                setAdvancingToNextPacketStep(true);
                setSubmissionId(null);
                setSchema(null);
                await bootstrap();
                return;
            }

            if (packetProgress && data?.packet_complete === true) {
                setPacketFinalThankYou(true);
                return;
            }

            setSubmitted(true);
        } finally {
            setSubmitting(false);
        }
    }, [bootstrap, encToken, optionValuesByFieldId, payload, packetAlreadyDone, packetProgress, submissionId, submitting, submitted, token, schema, familyChildren, childSlices]);

    // Seed per-child value slices once when a family intake starts (first child inherits prefill).
    useEffect(() => {
        if (phase !== "ready" || !schema || !packetProgress || familyChildren.length <= 1) return;
        const childFieldIds = partitionFieldsByScope(schema).child;
        if (!isFamilyIntake(familyChildren, childFieldIds)) return;
        if (Object.keys(childSlices).length > 0) return;
        setChildSlices(seedFamilyChildSlices(familyChildren, childFieldIds, (payload.values ?? {}) as Record<string, unknown>));
    }, [phase, schema, packetProgress, familyChildren, childSlices, payload.values]);

    /**
     * The Enrollment objective for this token, when there is one.
     *
     * MUST stay above the early returns below. It was originally written just before its consumer,
     * which put it after `if (phase === "loading") return …` — so it never ran on the first render
     * and did run on the second, changing the hook count from 32 to 33 and crashing the participant
     * surface with "change in the order of Hooks" the moment a parent opened their link.
     *
     * Hooks are unconditional or they are broken: this one is not gated on `phase`, on the token
     * being an Enrollment token, or on anything else. An ordinary public Form link resolves 409 and
     * simply leaves the objective null.
     */
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(
                    `/api/public/forms/${encodeURIComponent(token)}/enrollment-objective`,
                );
                if (!res.ok) return;
                const json = (await res.json()) as { ok?: boolean; data?: ParticipantObjectiveWire };
                if (!cancelled && json?.ok && json.data) {
                    setEnrollmentObjective(json.data);
                    setEnrollmentPhase(json.data.phase);
                }
            } catch {
                /* An ordinary form link, or a transient failure. Either way the packet flow stands. */
            }
        })();
        return () => {
            cancelled = true;
        };
        /*
         * `submissionId` is in the deps because finishing an artifact advances the packet.
         *
         * The objective carries how many documents are done, and the header above the paperwork
         * reads it. Fetched once per token, that count froze: a parent who had just finished their
         * third document was still told they were on it. A new draft id is exactly the moment the
         * runtime moved on, so it is the moment to ask again.
         */
    }, [token, submissionId]);

    if (phase === "loading") {
        return (
            <IntakeFrame brand={brand} previewBanner={showPreviewBanner ? <PreviewBanner /> : null}>
                <IntakeNotice>{advancingToNextPacketStep ? "Loading next step…" : "Loading…"}</IntakeNotice>
            </IntakeFrame>
        );
    }

    if (phase === "error") {
        return (
            <IntakeFrame brand={brand} previewBanner={showPreviewBanner ? <PreviewBanner /> : null}>
                <IntakeNotice tone="error">
                    <span>{message ?? "Unable to load this form."}</span>
                </IntakeNotice>
            </IntakeFrame>
        );
    }

    if (packetAlreadyDone) {
        return (
            <IntakeFrame
                brand={brand}
                packetName={packetProgress?.packet_name}
                previewBanner={showPreviewBanner ? <PreviewBanner /> : null}
            >
                <IntakeCompletion
                    tone="neutral"
                    title="Packet already completed"
                    body="This packet has already been submitted. You can close this window."
                />
            </IntakeFrame>
        );
    }

    if (packetFinalThankYou) {
        return (
            <IntakeFrame
                brand={brand}
                packetName={packetProgress?.packet_name}
                previewBanner={showPreviewBanner ? <PreviewBanner /> : null}
            >
                {/* An enrollment journey ends in the journey's own words — the parent finished
                    their child's enrollment paperwork, not "a packet". The generic packet copy
                    stays for every non-enrollment link, byte-identical. */}
                {enrollmentObjective ? (
                    <IntakeCompletion
                        title="You're all set."
                        body={`${enrollmentObjective.subject_display_name}'s enrollment paperwork has been submitted. Our staff will review it and follow up if anything else is needed.`}
                        hint="You can close this window."
                    />
                ) : (
                    <IntakeCompletion
                        title="All done — thank you."
                        body="You've finished every form in this packet. Our staff will review your submissions and follow up if anything else is needed."
                        hint="You can close this window."
                    />
                )}
            </IntakeFrame>
        );
    }

    if (!schema) {
        return (
            <IntakeFrame brand={brand} previewBanner={showPreviewBanner ? <PreviewBanner /> : null}>
                <IntakeNotice>Loading…</IntakeNotice>
            </IntakeFrame>
        );
    }

    if (submitted) {
        return (
            <IntakeFrame brand={brand} previewBanner={showPreviewBanner ? <PreviewBanner /> : null}>
                {enrollmentObjective ? (
                    <IntakeCompletion
                        title="You're all set."
                        body={`${enrollmentObjective.subject_display_name}'s enrollment paperwork has been submitted. Our staff will review it and follow up if anything else is needed.`}
                        hint="You can close this window."
                    />
                ) : (
                    <IntakeCompletion
                        title="Thank you — your form was submitted."
                        body="Your answers were received. Our staff will review your submission and follow up if anything else is needed."
                        hint="You can close this window."
                    />
                )}
            </IntakeFrame>
        );
    }

    // Only an ENROLLMENT token can suppress the form, and only while shared facts remain. An
    // ordinary public Form link has no objective, so this is false and nothing about it changes.
    const participantPhase = enrollmentObjective ? (enrollmentPhase ?? enrollmentObjective.phase) : null;
    const sharedCollectionInProgress = participantPhase === "shared_collection";
    /**
     * True exactly when `EnrollmentConversationCard` renders its own conversation viewport.
     *
     * The handoff and the review are ordinary cards in ordinary page flow; only the LIVE
     * conversation sizes itself to the screen, and only it needs the frame's padding to stand down.
     * `shared_collection` is precisely that phase — the handoff is `artifact_review`, which is also
     * the only phase `documentFlow` can be true in, so there is nothing further to exclude.
     */
    const conversationOwnsViewport = sharedCollectionInProgress;

    /**
     * THE REVIEW INVARIANT: review is only reachable when there is something to review.
     *
     * A schema with fields is the renderable artifact. Without this the runtime could tell a parent
     * "please review and finish it below" with nothing below — which is what happened when the turn
     * and the phase were derived independently and disagreed. The phase now comes from the turn, so
     * that specific contradiction is gone; this is the guard that makes the empty state impossible
     * rather than merely unlikely.
     */
    const artifactRenderable = schema != null && schema.fields.length > 0;
    const reviewWithoutArtifact = participantPhase === "artifact_review" && !artifactRenderable;

    const errorLines = validationErrors?.length ? formatPublicValidationErrors(validationErrors) : [];
    // Guided intake (packets only): schema-generated steps, each rendered by field type.
    /**
     * The guided WIZARD is for packets the participant fills from scratch.
     *
     * An Enrollment journey has already had its conversation: the shared facts are settled and the
     * artifact arrives populated. Walking that same parent through "Confirm what we already have →
     * A few details we still need → Sign & upload" re-asks what they just answered and re-frames a
     * review as data entry. So when the runtime owns the journey, the artifact is reviewed WHOLE.
     */
    const enrollmentJourney = enrollmentObjective != null;
    const guided = !enrollmentJourney && packetProgress != null && guidedPlan != null && guidedPlan.steps.length > 0;
    const guidedSteps = guidedPlan?.steps ?? [];
    const stepIdx = guided ? Math.min(guidedStepIdx, guidedSteps.length - 1) : 0;
    const guidedStep = guided ? guidedSteps[stepIdx] : null;
    const isLastStep = guided ? stepIdx >= guidedSteps.length - 1 : false;
    const PHASE_LABEL: Record<string, string> = { confirm: "Confirm", provide: "Add details", uploads: "Sign & upload" };
    const onGuidedChange = (next: FormPayload) => {
        const mirrored: FormPayload = {
            ...next,
            values: mirrorCanonicalValues((next.values ?? {}) as Record<string, unknown>, guidedPlan?.canonicalGroups ?? {}),
        };
        setValidationErrors(null);
        setMessage(null);
        setPayload(mirrored);
        void persistDraft(mirrored);
    };
    // Family Packet intake (multi-child): household once → child step per child → signatures.
    const familyChildFieldIds = packetProgress != null && familyChildren.length > 1 ? partitionFieldsByScope(schema).child : [];
    const familyMode = packetProgress != null && isFamilyIntake(familyChildren, familyChildFieldIds);
    const familyPlan: FamilyGuidedPlan | null = familyMode ? buildFamilyGuidedPlan(schema, familyChildren) : null;
    const familySteps = familyPlan?.steps ?? [];
    const famIdx = familyMode ? Math.min(familyStepIdx, familySteps.length - 1) : 0;
    const famStep = familyMode ? familySteps[famIdx] : null;
    const famIsLast = familyMode ? famIdx >= familySteps.length - 1 : false;
    const persistFamilyDraft = (baseValues: Record<string, unknown>, slices: Record<string, Record<string, unknown>>) => {
        const a = assembleFamilySubmissionPayload({
            baseValues: omitChildFields(baseValues, familyChildFieldIds),
            childAnswers: familyChildren.map((c) => ({ customer_member_id: c.customer_member_id, ...(c.label ? { label: c.label } : {}), values: slices[c.customer_member_id] ?? {} })),
            childFieldIds: familyChildFieldIds,
            meta: (payload as { meta?: Record<string, unknown> }).meta ?? {},
        });
        void persistDraft({ ...payload, values: a.values, meta: a.meta } as FormPayload);
    };
    const onFamilyBaseChange = (next: FormPayload) => {
        setValidationErrors(null);
        setMessage(null);
        setPayload(next);
        persistFamilyDraft((next.values ?? {}) as Record<string, unknown>, childSlices);
    };
    const onFamilyChildChange = (childId: string, next: FormPayload) => {
        setValidationErrors(null);
        setMessage(null);
        const slices = { ...childSlices, [childId]: (next.values ?? {}) as Record<string, unknown> };
        setChildSlices(slices);
        persistFamilyDraft((payload.values ?? {}) as Record<string, unknown>, slices);
    };

    const summaries = packetProgress?.step_summaries ?? [];
    const showPacketChecklist = !enrollmentJourney && packetProgress != null && summaries.length > 0;
    const famPhase = famStep
        ? famStep.kind === "household"
            ? "Household"
            : famStep.kind === "signature"
              ? "Sign"
              : (famStep.child?.label ?? "Child")
        : undefined;

    /**
     * THE COMPILED REVIEW — "here is your completed paperwork", not "here is a form".
     *
     * When the runtime owns the journey and shared collection is done, the artifact is presented as
     * the compiled model: settled facts read as facts with Edit beside them, only genuinely
     * outstanding controls appear as inputs, and acknowledgment + signature follow the content as
     * the final phase. The raw Form in edit mode — every control an input, including the two facts
     * the parent settled seconds ago — is exactly what this replaces.
     *
     * Compiled from the SAME schema and payload the Form would render, on every render: an edit or
     * a late-settled conversation value reclassifies immediately, because the classification is
     * derived state, not a snapshot.
     */
    const enrollmentReview = enrollmentJourney && participantPhase === "artifact_review" && artifactRenderable;
    const compiled = enrollmentReview
        ? compileParticipantArtifact(
              schema,
              (payload.values ?? {}) as Record<string, unknown>,
              sourceMapping as Parameters<typeof compileParticipantArtifact>[2],
          )
        : null;
    /**
     * The words each control may be captioned with — the seam every rendered control passes through.
     *
     * Built from the compiled model rather than the schema so the source-provenance rule is applied
     * in exactly one place, and a null in here is load-bearing: it means the source document named
     * this box and Alloy has no question for it.
     */
    const participantLabels: ReadonlyMap<string, string | null> = new Map(
        (compiled?.sections.flatMap((s) => s.controls) ?? []).map((c) => [c.field_id, c.participant_label]),
    );

    /**
     * The documents this artifact asks the parent to bring.
     *
     * Not part of the compiled control model on purpose: an attachment is participant WORK whose
     * result is evidence, not a value the runtime resolved for them. It is presented as a short list
     * of things to bring and gates completion the way the artifact itself says it does.
     */
    const uploadRequests = schema && enrollmentReview ? participantUploadRequests(schema) : [];
    const outstandingUploads =
        schema && enrollmentReview
            ? outstandingUploadRequests(schema, (payload.values ?? {}) as Record<string, unknown>)
            : [];
    const requiredUploadsOutstanding = outstandingUploads.filter((r) => r.required).length;
    const attachedUploads: Record<string, { document_id: string; filename: string } | undefined> = {};
    for (const request of uploadRequests) {
        const held = (payload.values ?? {})[request.field_id];
        if (uploadIsOnFile(held)) {
            attachedUploads[request.field_id] = {
                document_id: String(held),
                filename: attachedFilenames[request.field_id] ?? "on file",
            };
        }
    }


    /** One attachment, through the token-scoped route that files it as a canonical Document. */
    const uploadParticipantDocument = async (
        fieldId: string,
        file: File,
    ): Promise<{ document_id: string; filename: string } | { error: string }> => {
        try {
            const buffer = new Uint8Array(await file.arrayBuffer());
            let binary = "";
            for (let i = 0; i < buffer.length; i += 8192) {
                binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
            }
            const res = await fetch(`/api/public/forms/${encToken}/enrollment-upload`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ field_id: fieldId, filename: file.name, file_base64: btoa(binary) }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                error?: string;
                data?: { document_id?: string; filename?: string };
            };
            if (!json.ok || !json.data?.document_id) return { error: json.error ?? "That file could not be attached." };
            return { document_id: json.data.document_id, filename: json.data.filename ?? file.name };
        } catch {
            return { error: "That file could not be attached." };
        }
    };

    /** A `file_ref` destination holds the document id, and nothing else about the file. */
    const recordAttachment = (fieldId: string, doc: { document_id: string; filename: string }) => {
        setAttachedFilenames((prev) => ({ ...prev, [fieldId]: doc.filename }));
        setValidationErrors(null);
        setMessage(null);
        const next = {
            ...payload,
            values: { ...((payload.values ?? {}) as Record<string, unknown>), [fieldId]: doc.document_id },
        } as FormPayload;
        setPayload(next);
        void persistDraft(next);
        scheduleDocumentRefresh();
    };
    /**
     * Acknowledgment, then signature — STRUCTURALLY, not by document order.
     *
     * On the QA form the authored order happens to agree, but the contract is the participant's:
     * you confirm you have reviewed the content, and signing is the last thing you do. Rendering
     * the two classifications as separate phases makes that ordering independent of where an OCR'd
     * document happened to place its controls.
     */
    const ackFieldIds = compiled ? compiled.acknowledgments.map((c) => c.field_id) : [];
    const signatureFieldIds = compiled ? compiled.signatures.map((c) => c.field_id) : [];

    /**
     * Where the parent is, in the five words a parent uses.
     *
     * Derived on every render from what the artifact still wants, so it cannot drift from the state
     * of the buttons beneath it.
     */
    const artifactStatus = participantArtifactStatus({
        documentTitle: schema?.title ?? null,
        step: reviewStep === "edit" ? "edit" : reviewStep === "sign" ? "sign" : "review",
        requiredUploadsOutstanding,
        signatureExpected: signaturePlacement != null || signatureFieldIds.length > 0,
        signatureCaptured: capturedSignature != null,
        packetTotal: enrollmentObjective?.progress?.total ?? 0,
        packetSatisfied: enrollmentObjective?.progress?.satisfied ?? 0,
    });
    /*
     * A document is shown when the renderer can produce one — for EITHER engine.
     *
     * The replica-only test that stood here is what made "the parent's own document" true of the
     * two state forms and false of the three the school wrote.
     */
    const showDocument = artifactModel != null && !documentUnavailable;
    /** The document-first participant progression applies; otherwise the semantic fallback. */
    const documentFlow = enrollmentReview && compiled != null && showDocument;
    const allowTypedSignature =
        (schema.fields.find((f) => f.type === "signature") as { signature?: { require_drawn_asset?: boolean } } | undefined)
            ?.signature?.require_drawn_asset !== true;

    /**
     * An edit at review writes THROUGH the shared-value mechanism, never into one artifact.
     *
     * Locally the value lands on every control carrying the same canonical key — the same fact must
     * not read as two values on one page. Durably it goes to `enrollment-edit`, which merges it into
     * the session's `shared_values` by the same path a conversational answer takes. D-99 needs no
     * invalidation call: a confirmation is bound to a value fingerprint, so the changed value simply
     * stops matching it, and the recomputed objective in the response tells this surface if the
     * runtime now wants the conversation back.
     *
     * Optimistic with rollback, matching the conversation card: the fact reads as corrected the
     * moment the parent commits it, and if the platform refuses, the previous value returns — the
     * optimism never outlives the truth.
     */
    /**
     * Refresh the rendered document shortly after an artifact-specific answer changes.
     *
     * Debounced past the draft PATCH so the render (which reads the draft server-side) sees the
     * typed value. Presentation-only: the value's persistence is `persistDraft`'s, and a lagging
     * frame is corrected by the next refresh or by submit.
     */
    const scheduleDocumentRefresh = () => {
        if (artifactModel == null || documentUnavailable) return;
        if (documentRefreshTimer.current) clearTimeout(documentRefreshTimer.current);
        documentRefreshTimer.current = setTimeout(() => setDocumentRev((r) => r + 1), 1500);
    };

    const handleReviewEdit = (control: CompiledArtifactControl, value: unknown) => {
        if (!compiled) return;
        const targets = control.shared_key
            ? compiled.sections
                  .flatMap((s) => s.controls)
                  .filter((c) => c.shared_key === control.shared_key)
                  .map((c) => c.field_id)
            : [control.field_id];
        const previous = payload;
        const values = { ...((payload.values ?? {}) as Record<string, unknown>) };
        for (const id of targets) values[id] = value;
        const next = { ...payload, values };
        setMessage(null);
        setValidationErrors(null);
        setPayload(next);
        void persistDraft(next);
        void (async () => {
            try {
                const res = await fetch(`/api/public/forms/${encToken}/enrollment-edit`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ field_id: control.field_id, value }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    data?: { objective?: ParticipantObjectiveWire };
                };
                if (!json.ok) throw new Error("edit not accepted");
                if (json.data?.objective) {
                    setEnrollmentObjective(json.data.objective);
                    setEnrollmentPhase(json.data.objective.phase);
                }
                // The shared value changed durably — regenerate the document so every occurrence
                // on the paperwork shows the corrected fact.
                setDocumentRev((r) => r + 1);
            } catch {
                setPayload(previous);
                void persistDraft(previous);
                setMessage("That change didn't save — please try again.");
            }
        })();
    };

    /**
     * A captured signature becomes the Forms-owned payload shape and nothing else.
     *
     * Drawn: the PNG is persisted through the token-scoped asset route and the evidence carries
     * `drawn_document_id`; typed carries the name. Exclusive kinds, exactly as `validateSubmission`
     * enforces — the dialog is presentation over the same authority.
     */
    const handleSignatureCaptured = async (captured: CapturedSignature) => {
        if (!signaturePlacement) return;
        setSignatureDialogOpen(false);
        const acknowledgedAt = new Date().toISOString();
        let entry: Record<string, unknown>;
        if (captured.kind === "drawn") {
            try {
                const res = await fetch(`/api/public/forms/${encToken}/enrollment-signature-asset`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ png_base64: captured.pngBase64 }),
                });
                const json = (await res.json()) as { ok?: boolean; data?: { document_id?: string } };
                if (!json.ok || !json.data?.document_id) throw new Error("asset refused");
                entry = { kind: "drawn", drawn_document_id: json.data.document_id, acknowledged_at: acknowledgedAt };
                setCapturedSignature({ drawnDataUrl: `data:image/png;base64,${captured.pngBase64}` });
            } catch {
                setMessage("Your signature didn't save — please try again.");
                return;
            }
        } else {
            entry = { kind: "typed", typed_full_name: captured.typedName, acknowledged_at: acknowledgedAt };
            setCapturedSignature({ typedName: captured.typedName });
        }
        const next = {
            ...payload,
            signatures: { ...((payload as { signatures?: Record<string, unknown> }).signatures ?? {}), [signaturePlacement.field_id]: entry },
        } as FormPayload;
        setMessage(null);
        setValidationErrors(null);
        setPayload(next);
        void persistDraft(next);
    };

    return (
        <IntakeFrame
            packetName={packetProgress?.packet_name}
            previewBanner={showPreviewBanner ? <PreviewBanner /> : null}
            contentClassName={clsx(
                submitting && "pointer-events-none opacity-90",
                /**
                 * THE CONVERSATION OWNS THE SCREEN.
                 *
                 * The frame's standing `pb-20` is right for a scrolling form and wrong for a
                 * conversation: the thread sizes itself to the remaining viewport, so eighty pixels
                 * of padding underneath it pushes the anchored composer below the fold and the
                 * parent has to scroll the page to find where to reply. While shared collection is
                 * in progress the frame gets out of the way.
                 */
                conversationOwnsViewport && "!pb-4",
            )}
        >
            {/*
              * V1.2 — the conversational Enrollment turn, ABOVE the packet flow.
              *
              * Rendered only when this token resolves an Enrollment journey; `enrollmentObjective`
              * stays null for an ordinary form link and for a packet predating the D-95 anchor, so
              * every existing participant experience is byte-identical.
              *
              * When the turn becomes artifact work the card says so and the packet flow below is
              * where the parent continues — conversation handles shared facts, Forms stay
              * authoritative for review, signatures and acknowledgments.
              */}
            {enrollmentObjective && (!documentFlow || reviewStep === "handoff") ? (
                // In the document flow the conversation is its OWN state: it ends with a handoff
                // and the review is a fresh page, not more scroll below the transcript.
                <div className={conversationOwnsViewport ? undefined : "mb-6"}>
                    <EnrollmentConversationCard
                        token={token}
                        initialObjective={enrollmentObjective}
                        onPhaseChange={setEnrollmentPhase}
                        artifactRenderable={artifactRenderable}
                        onValueSettled={(fieldIds, value) => {
                            // Merge into the rendered artifact immediately. The session already
                            // holds this; the paperwork should not wait for a reload to agree.
                            setPayload((prev) => {
                                const values = { ...((prev.values ?? {}) as Record<string, unknown>) };
                                for (const id of fieldIds) values[id] = value;
                                return { ...prev, values };
                            });
                        }}
                    />
                    {documentFlow && reviewStep === "handoff" ? (
                        <button
                            type="button"
                            onClick={() => setReviewStep("review")}
                            className="mt-4 w-full rounded-xl bg-alloy-midnight px-5 py-3.5 text-[16px] font-medium text-white"
                            data-review-paperwork="true"
                        >
                            Review paperwork
                        </button>
                    ) : null}
                </div>
            ) : null}
            {/**
             * RAW FORM SUPPRESSION.
             *
             * While the runtime still has shared information to settle, the packet's own controls are
             * NOT rendered. A parent who has just confirmed a date of birth in the conversation must
             * not then find a "Child Dob" box directly underneath it — that is the form-first screen
             * with a conversational widget attached, not a participant runtime.
             *
             * The Form is not bypassed, only deferred: values flow into it through `shared_values`
             * and prefill exactly as before, and it reappears for review, acknowledgment and
             * signature the moment shared collection is done. Forms keep their authority over what a
             * signature and an acknowledgment mean; only when they are PRESENTED changes.
             */}
            {sharedCollectionInProgress ? null : (
            <>
            {enrollmentReview && compiled ? (
                documentFlow ? (
                    /* THE DOCUMENT-FIRST PROGRESSION — conversation, review, sign: distinct
                       participant states under one token. The handoff state renders nothing here;
                       the conversation card above owns that screen and its [Review paperwork]. */
                    reviewStep === "handoff" ? null : reviewStep === "edit" ? (
                        <IntakeCard>
                            <IntakeHeading
                                title="Make a change"
                                subtitle="Update anything that isn’t right — the paperwork refreshes automatically."
                            />
                            {/* FACTS, not destinations: one row per semantic value. Editing goes
                                through the shared-value command, so every place the document shows
                                the fact changes together. */}
                            <SemanticFactEditor
                                artifact={compiled}
                                onEditValue={handleReviewEdit}
                                renderInput={(control) => (
                                    <div className="[&_header]:hidden">
                                        <FormEngineRenderer
                                            schema={reviewControlSubSchema(schema, [control.field_id], participantLabels)}
                                            payload={payload}
                                            onChange={(next) => {
                                                setValidationErrors(null);
                                                setMessage(null);
                                                setPayload(next);
                                                void persistDraft(next);
                                                scheduleDocumentRefresh();
                                            }}
                                            mode="edit"
                                            optionValuesByFieldId={optionValuesByFieldId}
                                            optionChoicesByFieldId={optionChoicesByFieldId}
                                            variant="embed"
                                            validationErrors={validationErrors ?? undefined}
                                        />
                                    </div>
                                )}
                                onBack={() => setReviewStep("review")}
                            />
                        </IntakeCard>
                    ) : reviewStep === "sign" ? (
                        <IntakeCard>
                            <ParticipantArtifactHeader status={artifactStatus} />
                            {/* Acknowledge, then sign AT the document’s own signature line. */}
                            {ackFieldIds.length > 0 ? (
                                <div className="pb-5 [&_header]:hidden" data-artifact-final-phase="acknowledgment">
                                    <p className="pb-3 text-[15px] text-alloy-midnight">
                                        Please confirm you&rsquo;ve reviewed the information above.
                                    </p>
                                    <FormEngineRenderer
                                        schema={reviewControlSubSchema(schema, ackFieldIds, participantLabels)}
                                        payload={payload}
                                        onChange={(next) => {
                                            setValidationErrors(null);
                                            setMessage(null);
                                            setPayload(next);
                                            void persistDraft(next);
                                        }}
                                        mode="edit"
                                        optionValuesByFieldId={optionValuesByFieldId}
                                        optionChoicesByFieldId={optionChoicesByFieldId}
                                        variant="embed"
                                        validationErrors={validationErrors ?? undefined}
                                    />
                                </div>
                            ) : null}
                            <p className="pb-4 text-[15px] text-alloy-midnight" data-artifact-final-phase="signature">
                                {participantSignaturePrompt(artifactStatus.state !== "complete")}
                            </p>
                            {signaturePlacement ? (
                                <ParticipantDocumentCanvas
                                    url={`/api/public/forms/${encToken}/enrollment-document?rev=${documentRev}`}
                                    signature={{
                                        page: signaturePlacement.page,
                                        x: signaturePlacement.x,
                                        y: signaturePlacement.y,
                                        width: signaturePlacement.width,
                                        height: signaturePlacement.height,
                                        focus: true,
                                        preview: capturedSignature
                                            ? {
                                                  typedName: capturedSignature.typedName ?? null,
                                                  drawnPngDataUrl: capturedSignature.drawnDataUrl ?? null,
                                              }
                                            : undefined,
                                        onActivate: () => setSignatureDialogOpen(true),
                                    }}
                                    onUnavailable={() => setDocumentUnavailable(true)}
                                />
                            ) : (
                                /* No authored placement on this version — the Forms control stands. */
                                <div className="[&_header]:hidden">
                                    <FormEngineRenderer
                                        schema={reviewControlSubSchema(schema, signatureFieldIds, participantLabels)}
                                        payload={payload}
                                        onChange={(next) => {
                                            setValidationErrors(null);
                                            setMessage(null);
                                            setPayload(next);
                                            void persistDraft(next);
                                        }}
                                        mode="edit"
                                        optionValuesByFieldId={optionValuesByFieldId}
                                        optionChoicesByFieldId={optionChoicesByFieldId}
                                        variant="embed"
                                        validationErrors={validationErrors ?? undefined}
                                    />
                                </div>
                            )}
                            <IntakeFooter
                                errorLines={errorLines}
                                message={message}
                                onBack={() => setReviewStep("review")}
                                primaryLabel={submitting ? "Finishing…" : "Sign and finish"}
                                onPrimary={() => void handleSubmit()}
                                primaryDisabled={
                                    submitting || !submissionId || (signaturePlacement != null && !capturedSignature)
                                }
                                primaryBusy={submitting}
                            />
                        </IntakeCard>
                    ) : (
                        /* REVIEW — the actual filled document, alone. The parent reviews their
                           paperwork; the machinery stays out of sight. */
                        <IntakeCard>
                            <ParticipantArtifactHeader status={artifactStatus} />
                            <ParticipantDocumentCanvas
                                url={`/api/public/forms/${encToken}/enrollment-document?rev=${documentRev}`}
                                onUnavailable={() => setDocumentUnavailable(true)}
                            />
                            {message ? (
                                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[13px] text-amber-950">
                                    {message}
                                </p>
                            ) : null}
                            {uploadRequests.length > 0 ? (
                                <div className="mt-6">
                                    <ParticipantUploads
                                        requests={uploadRequests}
                                        attached={attachedUploads}
                                        onAttached={recordAttachment}
                                        onUpload={uploadParticipantDocument}
                                    />
                                </div>
                            ) : null}
                            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-alloy-midnight/[0.07] pt-5">
                                <span className="text-[14px] text-alloy-midnight/55">Something not right?</span>
                                <button
                                    type="button"
                                    onClick={() => setReviewStep("edit")}
                                    className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight"
                                    data-make-a-change="true"
                                >
                                    Make a change
                                </button>
                                <span className="flex-1" />
                                {/* An attachment the document REQUIRES is part of reviewing it, and
                                    the parent is told so here rather than at the end by a refusal. */}
                                {requiredUploadsOutstanding > 0 ? (
                                    <span className="text-[14px] text-alloy-midnight/55" data-uploads-outstanding="true">
                                        {requiredUploadsOutstanding === 1
                                            ? "One more thing to attach above."
                                            : `${requiredUploadsOutstanding} more things to attach above.`}
                                    </span>
                                ) : null}
                                <button
                                    type="button"
                                    disabled={requiredUploadsOutstanding > 0}
                                    onClick={() => setReviewStep("sign")}
                                    className={clsx(
                                        "rounded-xl px-5 py-2.5 text-[15px] font-medium text-white",
                                        requiredUploadsOutstanding > 0 ? "bg-alloy-midnight/30" : "bg-alloy-midnight",
                                    )}
                                    data-everything-looks-good="true"
                                >
                                    Everything looks good
                                </button>
                            </div>
                        </IntakeCard>
                    )
                ) : (
                <IntakeCard>
                    {/* SEMANTIC FALLBACK — no original document on this version, or it could not
                        render. The compiled review is the whole review, exactly as before the
                        document flow existed. */}
                    <IntakeHeading title={schema.title ?? "Your paperwork"} />
                    <CompiledArtifactReview
                        artifact={compiled}
                        onEditValue={handleReviewEdit}
                        renderInput={(control) => (
                            // Still the participant’s to do, and still the Form’s control: the same
                            // engine renders it, so type, options and validation stay authored.
                            <div className="[&_header]:hidden">
                                <FormEngineRenderer
                                    schema={reviewControlSubSchema(schema, [control.field_id], participantLabels)}
                                    payload={payload}
                                    onChange={(next) => {
                                        setValidationErrors(null);
                                        setMessage(null);
                                        setPayload(next);
                                        void persistDraft(next);
                                        scheduleDocumentRefresh();
                                    }}
                                    mode="edit"
                                    optionValuesByFieldId={optionValuesByFieldId}
                                    optionChoicesByFieldId={optionChoicesByFieldId}
                                    variant="embed"
                                    validationErrors={validationErrors ?? undefined}
                                />
                            </div>
                        )}
                    />
                    {ackFieldIds.length > 0 ? (
                        <div
                            className="mt-8 border-t border-alloy-midnight/[0.08] pt-6 [&_header]:hidden"
                            data-artifact-final-phase="acknowledgment"
                        >
                            <p className="pb-3 text-[15px] text-alloy-midnight">
                                Please confirm you&rsquo;ve reviewed the information above.
                            </p>
                            <FormEngineRenderer
                                schema={reviewControlSubSchema(schema, ackFieldIds, participantLabels)}
                                payload={payload}
                                onChange={(next) => {
                                    setValidationErrors(null);
                                    setMessage(null);
                                    setPayload(next);
                                    void persistDraft(next);
                                }}
                                mode="edit"
                                optionValuesByFieldId={optionValuesByFieldId}
                                optionChoicesByFieldId={optionChoicesByFieldId}
                                variant="embed"
                                validationErrors={validationErrors ?? undefined}
                            />
                        </div>
                    ) : null}
                    {signatureFieldIds.length > 0 ? (
                        <div
                            className="mt-8 border-t border-alloy-midnight/[0.08] pt-6 [&_header]:hidden"
                            data-artifact-final-phase="signature"
                        >
                            <p className="pb-3 text-[15px] text-alloy-midnight">
                                {participantSignaturePrompt(artifactStatus.state !== "complete")}
                            </p>
                            <FormEngineRenderer
                                schema={reviewControlSubSchema(schema, signatureFieldIds, participantLabels)}
                                payload={payload}
                                onChange={(next) => {
                                    setValidationErrors(null);
                                    setMessage(null);
                                    setPayload(next);
                                    void persistDraft(next);
                                }}
                                mode="edit"
                                optionValuesByFieldId={optionValuesByFieldId}
                                optionChoicesByFieldId={optionChoicesByFieldId}
                                variant="embed"
                                validationErrors={validationErrors ?? undefined}
                            />
                        </div>
                    ) : null}
                    <IntakeFooter
                        errorLines={errorLines}
                        message={message}
                        primaryLabel={submitting ? "Finishing…" : "Sign and finish"}
                        onPrimary={() => void handleSubmit()}
                        primaryDisabled={submitting || !submissionId}
                        primaryBusy={submitting}
                    />
                </IntakeCard>
                )
            ) : familyMode && famStep ? (
                <div key={`fam-${famIdx}`} className="parent-intake-step-in">
                    <IntakeProgress phaseLabel={famPhase} stepIndex={famIdx} total={familySteps.length} />
                    {showPacketChecklist ? (
                        <IntakePacketChecklist steps={summaries} currentIndex={packetProgress.current_sequence_index} />
                    ) : null}
                    <IntakeCard>
                        <IntakeHeading title={famStep.title} subtitle={famStep.subtitle} />
                        {famStep.kind === "child" && famStep.child ? (
                            <FormEngineRenderer
                                schema={subSchemaForFieldsGrouped(schema, famStep.fieldIds, famStep.title)}
                                payload={{ values: childSlices[famStep.child.customer_member_id] ?? {}, groups: {}, signatures: {} } as FormPayload}
                                onChange={(next) => onFamilyChildChange(famStep.child!.customer_member_id, next)}
                                mode="edit"
                                optionValuesByFieldId={optionValuesByFieldId}
                                optionChoicesByFieldId={optionChoicesByFieldId}
                                variant="embed"
                                validationErrors={validationErrors ?? undefined}
                            />
                        ) : (
                            <FormEngineRenderer
                                schema={subSchemaForFieldsGrouped(schema, famStep.fieldIds, famStep.title)}
                                payload={payload}
                                onChange={onFamilyBaseChange}
                                mode="edit"
                                optionValuesByFieldId={optionValuesByFieldId}
                                optionChoicesByFieldId={optionChoicesByFieldId}
                                variant="embed"
                                validationErrors={validationErrors ?? undefined}
                            />
                        )}
                        <IntakeFooter
                            errorLines={errorLines}
                            message={message}
                            onBack={famIdx > 0 ? () => setFamilyStepIdx((i) => Math.max(0, i - 1)) : undefined}
                            primaryLabel={famIsLast ? (submitting ? "Submitting…" : "Confirm & submit") : "Continue"}
                            onPrimary={
                                famIsLast
                                    ? () => void handleSubmit()
                                    : () => setFamilyStepIdx((i) => Math.min(familySteps.length - 1, i + 1))
                            }
                            primaryDisabled={famIsLast ? submitting || !submissionId : !submissionId}
                            primaryBusy={famIsLast && submitting}
                        />
                    </IntakeCard>
                </div>
            ) : !enrollmentJourney && packetProgress && !guidedPlan ? (
                <IntakeNotice>Preparing your steps…</IntakeNotice>
            ) : guided && guidedStep ? (
                <div key={`guided-${stepIdx}`} className="parent-intake-step-in">
                    <IntakeProgress phaseLabel={PHASE_LABEL[guidedStep.kind] ?? "Step"} stepIndex={stepIdx} total={guidedSteps.length} />
                    {showPacketChecklist ? (
                        <IntakePacketChecklist steps={summaries} currentIndex={packetProgress.current_sequence_index} />
                    ) : null}
                    <IntakeCard>
                        {stepIdx === 0 && guidedPlan ? (
                            <IntakeChips
                                known={guidedPlan.counts.known}
                                missing={guidedPlan.counts.missing}
                                uploads={guidedPlan.counts.uploads}
                            />
                        ) : null}
                        <IntakeHeading title={guidedStep.title} subtitle={guidedStep.subtitle} />
                        <FormEngineRenderer
                            schema={subSchemaForFieldsGrouped(schema, guidedStep.fieldIds, guidedStep.title)}
                            payload={payload}
                            onChange={onGuidedChange}
                            mode="edit"
                            optionValuesByFieldId={optionValuesByFieldId}
                            optionChoicesByFieldId={optionChoicesByFieldId}
                            variant="embed"
                            validationErrors={validationErrors ?? undefined}
                        />
                        <IntakeFooter
                            errorLines={errorLines}
                            message={message}
                            onBack={stepIdx > 0 ? () => setGuidedStepIdx((i) => Math.max(0, i - 1)) : undefined}
                            primaryLabel={isLastStep ? (submitting ? "Submitting…" : "Confirm & submit") : "Continue"}
                            onPrimary={
                                isLastStep
                                    ? () => void handleSubmit()
                                    : () => setGuidedStepIdx((i) => Math.min(guidedSteps.length - 1, i + 1))
                            }
                            primaryDisabled={isLastStep ? submitting || !submissionId : !submissionId}
                            primaryBusy={isLastStep && submitting}
                        />
                    </IntakeCard>
                </div>
            ) : (
                <IntakeCard>
                    {/* Single-form (non-packet) experience — same renderer, premium shell. */}
                    <FormEngineRenderer
                        schema={schema}
                        payload={payload}
                        onChange={(next) => {
                            setValidationErrors(null);
                            setMessage(null);
                            setPayload(next);
                            void persistDraft(next);
                        }}
                        mode="edit"
                        optionValuesByFieldId={optionValuesByFieldId}
                        optionChoicesByFieldId={optionChoicesByFieldId}
                        variant="embed"
                        validationErrors={validationErrors ?? undefined}
                    />
                    <IntakeFooter
                        errorLines={errorLines}
                        message={message}
                        primaryLabel={
                            enrollmentJourney
                                ? submitting
                                    ? "Finishing…"
                                    : "Sign and finish"
                                : submitting
                                  ? "Submitting…"
                                  : "Submit"
                        }
                        onPrimary={() => void handleSubmit()}
                        primaryDisabled={submitting || !submissionId}
                        primaryBusy={submitting}
                    />
                </IntakeCard>
            )}
            </>
            )}
            {signatureDialogOpen ? (
                <SignatureCaptureDialog
                    allowTyped={allowTypedSignature}
                    onDone={(captured) => void handleSignatureCaptured(captured)}
                    onCancel={() => setSignatureDialogOpen(false)}
                />
            ) : null}
        </IntakeFrame>
    );
}
