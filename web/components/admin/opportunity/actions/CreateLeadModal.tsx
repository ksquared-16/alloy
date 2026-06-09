"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ActionWorkspaceBosSuggestion,
    ActionWorkspaceGatherPhase,
    ActionWorkspaceStep,
} from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    CREATE_LEAD_GATHER_FIELDS,
    CREATE_LEAD_PLATFORM_REQUIRED_KEYS,
    bosSuggestionsFromExtraction,
    createLeadParserSpec,
    emptyCreateLeadGatherValues,
    gatherSections,
    mapCreateLeadGatherToExecutePayload,
    validateCreateLeadPlatformMinimum,
} from "@/lib/admin/actions/createLeadPlatformGather";
import { canFastPathCreateLead } from "@/lib/admin/actions/actionWorkspaceGatherFlow";
import {
    formatCreateLeadHouseholdLabel,
    resolveCreateLeadBosGuidance,
    resolveCreateLeadBosRecommendations,
} from "@/lib/admin/actions/createLeadBosGuidance";
import { createLeadIntakePasteParser } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { ActionWorkspaceBosGuidancePanel } from "@/components/admin/actions/ActionWorkspaceBosGuidancePanel";
import { ActionWorkspaceBosShell } from "@/components/admin/actions/ActionWorkspaceBosShell";
import { ActionWorkspacePasteCanvas } from "@/components/admin/actions/ActionWorkspacePasteCanvas";
import { ActionWorkspaceBosSuggestions } from "@/components/admin/actions/ActionWorkspaceBosSuggestions";
import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import { ActionWorkspaceReviewSummary } from "@/components/admin/actions/ActionWorkspaceReviewSummary";
import { ActionWorkspaceExecuteState } from "@/components/admin/actions/ActionWorkspaceExecuteState";
import { ActionWorkspaceSuccessState } from "@/components/admin/actions/ActionWorkspaceSuccessState";
import { ActionWorkspaceStepContent } from "@/components/admin/actions/ActionWorkspaceStepContent";

export type CreateLeadFormPayload = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    [key: string]: string;
};

const SUCCESS_OPEN_DELAY_MS = 1400;
const WORKSPACE_TITLE = "Tell BOS about the family";

function legacyPayloadFromValues(values: Record<string, string>): CreateLeadFormPayload {
    return {
        first_name: values.first_name?.trim() ?? "",
        last_name: values.last_name?.trim() ?? "",
        email: values.email?.trim() ?? "",
        phone: values.phone?.trim() ?? "",
        ...values,
    };
}

function suggestionId(payloadKey: string, value: string): string {
    return `${payloadKey}:${value}`;
}

export function CreateLeadModal(props: {
    open: boolean;
    departmentId: string | null;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: CreateLeadFormPayload) => Promise<{ opportunity_id: string }>;
    onCreated?: (opportunityId: string) => void;
}) {
    const { open, departmentId, title = WORKSPACE_TITLE, onClose, onSubmit, onCreated } = props;

    const [step, setStep] = useState<ActionWorkspaceStep>("gather");
    const [gatherPhase, setGatherPhase] = useState<ActionWorkspaceGatherPhase>("paste");
    const [values, setValues] = useState<Record<string, string>>(emptyCreateLeadGatherValues());
    const [pasteText, setPasteText] = useState("");
    const [suggestions, setSuggestions] = useState<ActionWorkspaceBosSuggestion[]>([]);
    const [lastAppliedSuggestions, setLastAppliedSuggestions] = useState<ActionWorkspaceBosSuggestion[]>([]);
    const [appliedFromBos, setAppliedFromBos] = useState(false);
    const [valuesEditedAfterApply, setValuesEditedAfterApply] = useState(false);
    const [suggestionsEdited, setSuggestionsEdited] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successDetail, setSuccessDetail] = useState<string | null>(null);
    const createdIdRef = useRef<string | null>(null);
    const handoffStartedRef = useRef(false);

    const sections = useMemo(() => gatherSections(), []);
    const validation = useMemo(() => validateCreateLeadPlatformMinimum(values), [values]);
    const bosGuidance = useMemo(() => resolveCreateLeadBosGuidance(values), [values]);
    const householdLabel = useMemo(() => formatCreateLeadHouseholdLabel(values), [values]);
    const bosRecommendations = useMemo(() => resolveCreateLeadBosRecommendations(values), [values]);
    const fastPath = useMemo(
        () =>
            canFastPathCreateLead({
                gatherPhase,
                values,
                appliedFromBos,
                valuesEditedAfterApply: valuesEditedAfterApply || suggestionsEdited,
                lastAppliedSuggestions,
            }),
        [gatherPhase, values, appliedFromBos, valuesEditedAfterApply, suggestionsEdited, lastAppliedSuggestions]
    );

    const reset = useCallback(() => {
        setStep("gather");
        setGatherPhase("paste");
        setValues(emptyCreateLeadGatherValues());
        setPasteText("");
        setSuggestions([]);
        setLastAppliedSuggestions([]);
        setAppliedFromBos(false);
        setValuesEditedAfterApply(false);
        setSuggestionsEdited(false);
        setAnalyzing(false);
        setAnalyzeError(null);
        setError(null);
        setSuccessDetail(null);
        createdIdRef.current = null;
        handoffStartedRef.current = false;
    }, []);

    useEffect(() => {
        if (!open) return;
        reset();
        if (!departmentId) setError("Department context is required to create a lead.");
    }, [open, departmentId, reset]);

    useEffect(() => {
        if (step !== "success" || !createdIdRef.current || handoffStartedRef.current) return;
        handoffStartedRef.current = true;
        const opportunityId = createdIdRef.current;
        const openTimer = window.setTimeout(() => setSuccessDetail("Opening Lead…"), 600);
        const handoffTimer = window.setTimeout(() => {
            onCreated?.(opportunityId);
            onClose();
        }, SUCCESS_OPEN_DELAY_MS);
        return () => {
            window.clearTimeout(openTimer);
            window.clearTimeout(handoffTimer);
        };
    }, [step, onCreated, onClose]);

    const setFieldValue = useCallback((payloadKey: string, next: string) => {
        setValuesEditedAfterApply(true);
        setValues((prev) => ({ ...prev, [payloadKey]: next }));
    }, []);

    const runAnalyze = useCallback(() => {
        if (!departmentId || !pasteText.trim()) return;
        setAnalyzing(true);
        setAnalyzeError(null);
        setError(null);
        try {
            const spec = createLeadParserSpec(departmentId);
            const extraction = createLeadIntakePasteParser.parse({ text: pasteText, spec });
            const mapped = bosSuggestionsFromExtraction(extraction);
            if (mapped.length === 0) {
                setAnalyzeError("BOS could not extract structured fields. Try adding labels like Parent: or Email:.");
                setGatherPhase("paste");
                return;
            }
            setSuggestionsEdited(false);
            setSuggestions(
                mapped.map((s) => ({
                    id: suggestionId(s.payload_key, s.suggested_value),
                    payload_key: s.payload_key,
                    field_label: s.field_label,
                    suggested_value: s.suggested_value,
                    confidence: s.confidence,
                    selected: true,
                }))
            );
            setGatherPhase("bos-results");
        } catch (e) {
            setSuggestions([]);
            setAnalyzeError(e instanceof Error ? e.message : "Could not analyze pasted text.");
        } finally {
            setAnalyzing(false);
        }
    }, [departmentId, pasteText]);

    const applySuggestions = useCallback(() => {
        const selected = suggestions.filter((s) => s.selected);
        if (!selected.length) return;
        setValues((prev) => {
            const next = { ...prev };
            for (const s of selected) next[s.payload_key] = s.suggested_value;
            return next;
        });
        setLastAppliedSuggestions(selected);
        setAppliedFromBos(true);
        setValuesEditedAfterApply(false);
        setSuggestions([]);
        setGatherPhase("details");
    }, [suggestions]);

    const runExecute = useCallback(async () => {
        if (!departmentId) return;
        const check = validateCreateLeadPlatformMinimum(values);
        if (!check.ok) {
            setGatherPhase("details");
            setStep("gather");
            setError(check.issues.join(" "));
            return;
        }
        setStep("execute");
        setError(null);
        try {
            const payload = legacyPayloadFromValues(mapCreateLeadGatherToExecutePayload(values));
            const result = await onSubmit(payload);
            const opportunityId = result.opportunity_id?.trim();
            if (!opportunityId) throw new Error("Lead was created but no opportunity id was returned.");
            createdIdRef.current = opportunityId;
            setSuccessDetail(null);
            setStep("success");
        } catch (e) {
            setStep("review");
            setError(e instanceof Error ? e.message : "Create lead failed");
        }
    }, [departmentId, onSubmit, values]);

    const footer =
        step === "gather" && gatherPhase === "paste" ?
            <>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-alloy-midnight/50 transition-colors hover:text-alloy-midnight/80"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={!departmentId}
                    onClick={() => {
                        setGatherPhase("details");
                        setError(null);
                    }}
                    className="rounded-xl border border-alloy-stone/12 bg-white px-5 py-2.5 text-sm font-semibold text-alloy-midnight/75 shadow-[0_1px_2px_rgba(15,35,52,0.05)] transition-colors hover:border-alloy-stone/20 hover:bg-[#FAFBFC] disabled:opacity-50"
                    data-testid="create-lead-enter-manually-button"
                >
                    Enter manually
                </button>
            </>
        : step === "gather" && gatherPhase === "bos-results" ?
            null
        : step === "gather" && gatherPhase === "details" ?
            <>
                <button
                    type="button"
                    onClick={() => {
                        setGatherPhase(suggestions.length ? "bos-results" : "paste");
                        setError(null);
                    }}
                    className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5"
                >
                    Back
                </button>
                {fastPath ?
                    <>
                        <button
                            type="button"
                            disabled={!validation.ok || !departmentId}
                            onClick={() => {
                                setError(null);
                                setStep("review");
                            }}
                            className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/5 disabled:opacity-50"
                            data-testid="create-lead-review-button"
                        >
                            Review first
                        </button>
                        <button
                            type="button"
                            disabled={!validation.ok || !departmentId}
                            onClick={() => void runExecute()}
                            className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                            data-testid="create-lead-fast-create-button"
                        >
                            Create lead
                        </button>
                    </>
                :   <button
                        type="button"
                        disabled={!validation.ok || !departmentId}
                        onClick={() => {
                            setError(null);
                            setStep("review");
                        }}
                        className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        data-testid="create-lead-review-button"
                    >
                        Review lead
                    </button>
                }
            </>
        : step === "review" ?
            <>
                <button
                    type="button"
                    onClick={() => {
                        setStep("gather");
                        setGatherPhase("details");
                    }}
                    className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5"
                    data-testid="create-lead-back-button"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={() => void runExecute()}
                    className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                    data-testid="create-lead-confirm-button"
                >
                    Confirm & create lead
                </button>
            </>
        :   null;

    if (!open) return null;

    return (
        <ActionWorkspaceBosShell
            open={open}
            onClose={onClose}
            busy={step === "execute" || step === "success"}
            title={title}
            step={step}
            footer={footer}
            data-testid="create-lead-action-workspace"
        >
            <ActionWorkspaceStepContent step="gather" activeStep={step}>
                <div className="flex h-full min-h-0 flex-col" data-testid="create-lead-gather-step">
                    {gatherPhase === "paste" ?
                        <ActionWorkspacePasteCanvas
                            pasteText={pasteText}
                            onPasteTextChange={setPasteText}
                            onAnalyze={runAnalyze}
                            analyzing={analyzing}
                            disabled={!departmentId}
                            analyzeError={analyzeError}
                            sectionTitle={title}
                            hero
                        />
                    : null}

                    {gatherPhase === "bos-results" ?
                        <ActionWorkspaceBosSuggestions
                            suggestions={suggestions}
                            onToggle={(id) => {
                                setSuggestions((prev) =>
                                    prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
                                );
                            }}
                            onToggleAll={(selected) => {
                                setSuggestions((prev) => prev.map((s) => ({ ...s, selected })));
                            }}
                            onApply={applySuggestions}
                            onDismiss={() => {
                                setSuggestions([]);
                                setGatherPhase("paste");
                            }}
                            onSuggestionValueChange={(id, value) => {
                                setSuggestionsEdited(true);
                                setSuggestions((prev) =>
                                    prev.map((s) => (s.id === id ? { ...s, suggested_value: value } : s))
                                );
                            }}
                            busy={analyzing}
                        />
                    : null}

                    {gatherPhase === "details" ?
                        <div className="flex h-full min-h-0 flex-col gap-5">
                            <ActionWorkspaceBosGuidancePanel guidance={bosGuidance} />
                            <ActionWorkspaceGatherFields
                                sections={sections}
                                values={values}
                                onChange={setFieldValue}
                                platformRequiredKeys={CREATE_LEAD_PLATFORM_REQUIRED_KEYS}
                                dataTestIdPrefix="create-lead-gather"
                            />
                            {!validation.ok ?
                                <div
                                    className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950"
                                    data-testid="create-lead-missing-required"
                                    role="alert"
                                >
                                    {validation.issues.join(" · ")}
                                </div>
                            :   null}
                        </div>
                    : null}
                </div>
            </ActionWorkspaceStepContent>

            <ActionWorkspaceStepContent step="review" activeStep={step}>
                <div className="h-full" data-testid="create-lead-review-step">
                    <ActionWorkspaceReviewSummary
                        fields={CREATE_LEAD_GATHER_FIELDS}
                        values={values}
                        dataTestIdPrefix="create-lead-review"
                    />
                </div>
            </ActionWorkspaceStepContent>

            <ActionWorkspaceStepContent step="execute" activeStep={step}>
                <ActionWorkspaceExecuteState title="Creating Lead…" detail="Saving person, household, and lead record." />
            </ActionWorkspaceStepContent>

            <ActionWorkspaceStepContent step="success" activeStep={step}>
                <ActionWorkspaceSuccessState
                    title="Lead Created"
                    detail={successDetail ?? "Preparing your workspace…"}
                    householdLabel={householdLabel}
                    bosRecommendations={bosRecommendations}
                    suggestedActions={[
                        {
                            id: "schedule-tour",
                            label: "Schedule Tour",
                            icon: "calendar",
                            disabled: true,
                        },
                        {
                            id: "send-welcome",
                            label: "Send Welcome Email",
                            icon: "mail",
                            disabled: true,
                        },
                        {
                            id: "open-lead",
                            label: "Open Lead",
                            icon: "open",
                            onClick: () => {
                                const opportunityId = createdIdRef.current;
                                if (!opportunityId) return;
                                onCreated?.(opportunityId);
                                onClose();
                            },
                        },
                    ]}
                />
            </ActionWorkspaceStepContent>

            {error ?
                <div className="mt-2 shrink-0 rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                    {error}
                </div>
            :   null}
        </ActionWorkspaceBosShell>
    );
}
