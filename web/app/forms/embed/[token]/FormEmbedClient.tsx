"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { FormSchemaV1 } from "@/lib/forms/schema";
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

type ResolveOk = {
    ok: true;
    data: {
        schema_json: unknown | null;
        packet_terminal?: boolean;
        packet?: ResolvePacketMeta | null;
        brand?: ParticipantBrand | null;
        option_values_by_field_id?: Record<string, string[]>;
        option_choices_by_field_id?: Record<string, FormEngineOptionChoice[]>;
        link?: { metadata?: Record<string, unknown> };
    };
};

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
            setSchema(parsedSchema);
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
    }, [token]);

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
                <IntakeCompletion
                    title="All done — thank you."
                    body="You've finished every form in this packet. Our staff will review your submissions and follow up if anything else is needed."
                    hint="You can close this window."
                />
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
                <IntakeCompletion
                    title="Thank you — your form was submitted."
                    body="Your answers were received. Our staff will review your submission and follow up if anything else is needed."
                    hint="You can close this window."
                />
            </IntakeFrame>
        );
    }

    // Only an ENROLLMENT token can suppress the form, and only while shared facts remain. An
    // ordinary public Form link has no objective, so this is false and nothing about it changes.
    const participantPhase = enrollmentObjective ? (enrollmentPhase ?? enrollmentObjective.phase) : null;
    const sharedCollectionInProgress = participantPhase === "shared_collection";

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
    const guided = packetProgress != null && guidedPlan != null && guidedPlan.steps.length > 0;
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
    const showPacketChecklist = packetProgress != null && summaries.length > 0;
    const famPhase = famStep
        ? famStep.kind === "household"
            ? "Household"
            : famStep.kind === "signature"
              ? "Sign"
              : (famStep.child?.label ?? "Child")
        : undefined;

    return (
        <IntakeFrame
            packetName={packetProgress?.packet_name}
            previewBanner={showPreviewBanner ? <PreviewBanner /> : null}
            contentClassName={clsx(submitting && "pointer-events-none opacity-90")}
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
            {enrollmentObjective ? (
                <div className="mb-6">
                    <EnrollmentConversationCard
                        token={token}
                        initialObjective={enrollmentObjective}
                        onPhaseChange={setEnrollmentPhase}
                        artifactRenderable={artifactRenderable}
                    />
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
            {familyMode && famStep ? (
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
            ) : packetProgress && !guidedPlan ? (
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
                        primaryLabel={submitting ? "Submitting…" : "Submit"}
                        onPrimary={() => void handleSubmit()}
                        primaryDisabled={submitting || !submissionId}
                        primaryBusy={submitting}
                    />
                </IntakeCard>
            )}
            </>
            )}
        </IntakeFrame>
    );
}
