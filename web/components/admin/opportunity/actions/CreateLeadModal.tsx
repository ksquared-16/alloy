"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    applyCreateLeadDefaultLocationToValues,
    resolveCreateLeadDefaultLocation,
} from "@/lib/admin/actions/resolveCreateLeadDefaultLocation";
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
import {
    formatCreateLeadHouseholdLabel,
} from "@/lib/admin/actions/createLeadBosGuidance";
import { mapBosRecommendationsToSuccessActions } from "@/lib/admin/actions/mapBosRecommendationsToSuccessActions";
import { resolveCreateLeadPostCreateRecommendations } from "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations";
import { CREATE_LEAD_WORKSPACE_TITLE } from "@/lib/admin/actions/bosWorkspaceShell";
import { createLeadIntakePasteParser } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { ActionWorkspaceBosShell } from "@/components/admin/actions/ActionWorkspaceBosShell";
import { CreateLeadOperationalIntake } from "@/components/admin/actions/CreateLeadOperationalIntake";
import { ActionWorkspaceReviewSummary } from "@/components/admin/actions/ActionWorkspaceReviewSummary";
import { ActionWorkspaceExecuteState } from "@/components/admin/actions/ActionWorkspaceExecuteState";
import { ActionWorkspaceSuccessState } from "@/components/admin/actions/ActionWorkspaceSuccessState";
import { ActionWorkspaceStepContent } from "@/components/admin/actions/ActionWorkspaceStepContent";
import { queueActionWorkspaceLeadHandoff } from "@/lib/bos/actionWorkspaceDrawerHandoff";

export type CreateLeadFormPayload = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    [key: string]: string;
};

const SUCCESS_OPEN_DELAY_MS = 1400;

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
    const { open, departmentId, title = CREATE_LEAD_WORKSPACE_TITLE, onClose, onSubmit, onCreated } = props;
    const siteFilter = useWorkspaceSiteFilter();

    const [step, setStep] = useState<ActionWorkspaceStep>("gather");
    const [gatherPhase, setGatherPhase] = useState<ActionWorkspaceGatherPhase>("paste");
    const [values, setValues] = useState<Record<string, string>>(emptyCreateLeadGatherValues());
    const [pasteText, setPasteText] = useState("");
    const [suggestions, setSuggestions] = useState<ActionWorkspaceBosSuggestion[]>([]);
    const [materialAnalyzed, setMaterialAnalyzed] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successDetail, setSuccessDetail] = useState<string | null>(null);
    const createdIdRef = useRef<string | null>(null);
    const handoffStartedRef = useRef(false);

    const handoffToCreatedLead = useCallback(
        (opportunityId: string) => {
            queueActionWorkspaceLeadHandoff(opportunityId, (id) => onCreated?.(id), onClose);
        },
        [onClose, onCreated],
    );

    const sections = useMemo(() => gatherSections(), []);
    const validation = useMemo(() => validateCreateLeadPlatformMinimum(values), [values]);
    const householdLabel = useMemo(() => formatCreateLeadHouseholdLabel(values), [values]);
    const bosRecommendations = useMemo(() => resolveCreateLeadPostCreateRecommendations(values), [values]);
    const successActions = useMemo(
        () =>
            mapBosRecommendationsToSuccessActions(bosRecommendations, {
                onOpenLead: () => {
                    const opportunityId = createdIdRef.current;
                    if (!opportunityId) return;
                    handoffToCreatedLead(opportunityId);
                },
            }),
        [bosRecommendations, handoffToCreatedLead],
    );
    const manualMode = gatherPhase === "details";
    const validationIssues = validation.ok ? [] : validation.issues;

    const reset = useCallback(() => {
        setStep("gather");
        setGatherPhase("paste");
        setValues(emptyCreateLeadGatherValues());
        setPasteText("");
        setSuggestions([]);
        setMaterialAnalyzed(false);
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
        const permittedSiteIds = (siteFilter?.bootstrap?.sites ?? []).map((s) => s.id);
        const resolved = resolveCreateLeadDefaultLocation({
            workspaceSiteId: siteFilter?.selectedSiteId ?? null,
            permittedSiteIds,
        });
        if (resolved.location_id) {
            setValues((prev) => applyCreateLeadDefaultLocationToValues(prev, resolved));
        }
    }, [open, departmentId, reset, siteFilter?.selectedSiteId, siteFilter?.bootstrap?.sites]);

    useEffect(() => {
        if (step !== "success" || !createdIdRef.current || handoffStartedRef.current) return;
        handoffStartedRef.current = true;
        const opportunityId = createdIdRef.current;
        const openTimer = window.setTimeout(() => setSuccessDetail("Opening Lead…"), 600);
        const handoffTimer = window.setTimeout(() => {
            handoffToCreatedLead(opportunityId);
        }, SUCCESS_OPEN_DELAY_MS);
        return () => {
            window.clearTimeout(openTimer);
            window.clearTimeout(handoffTimer);
        };
    }, [step, handoffToCreatedLead]);

    const setFieldValue = useCallback((payloadKey: string, next: string) => {
        setValues((prev) => ({ ...prev, [payloadKey]: next }));
    }, []);

    const clearMaterial = useCallback(() => {
        setPasteText("");
        setSuggestions([]);
        setMaterialAnalyzed(false);
        setAnalyzeError(null);
        setGatherPhase("paste");
    }, []);

    const runAnalyze = useCallback(() => {
        if (!departmentId || !pasteText.trim()) return;
        setAnalyzing(true);
        setAnalyzeError(null);
        setError(null);
        setGatherPhase("paste");
        try {
            const spec = createLeadParserSpec(departmentId);
            const extraction = createLeadIntakePasteParser.parse({ text: pasteText, spec });
            const mapped = bosSuggestionsFromExtraction(extraction);
            if (mapped.length === 0) {
                setAnalyzeError("BOS could not extract structured fields. Try adding labels like Parent: or Email:.");
                setSuggestions([]);
                return;
            }
            setSuggestions(
                mapped.map((s) => ({
                    id: suggestionId(s.payload_key, s.suggested_value),
                    payload_key: s.payload_key,
                    field_label: s.field_label,
                    suggested_value: s.suggested_value,
                    confidence: s.confidence,
                    selected: true,
                })),
            );
            setMaterialAnalyzed(true);
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
        setSuggestions([]);
        setGatherPhase("paste");
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
            setStep("gather");
            setGatherPhase("details");
            setError(e instanceof Error ? e.message : "Create lead failed");
        }
    }, [departmentId, onSubmit, values]);

    const footer =
        step === "gather" ?
            <>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-alloy-midnight/50 transition-colors hover:text-alloy-midnight/80"
                >
                    Cancel
                </button>
                {suggestions.length > 0 ?
                    null
                :   <>
                        {validation.ok ?
                            <button
                                type="button"
                                disabled={!departmentId}
                                onClick={() => void runExecute()}
                                className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                data-testid="create-lead-create-button"
                            >
                                Create Lead
                            </button>
                        :   null}
                        {manualMode && !validation.ok ?
                            <button
                                type="button"
                                onClick={() => setGatherPhase("paste")}
                                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5"
                            >
                                Back to material
                            </button>
                        :   null}
                    </>
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
                    data-testid="create-lead-create-button"
                >
                    Create Lead
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
            presentation="workspace-drawer"
            contentBleed={step === "gather"}
            headerTone="integrated"
            step={step}
            footer={footer}
            data-testid="create-lead-action-workspace"
        >
            <ActionWorkspaceStepContent step="gather" activeStep={step}>
                <div className="flex h-full min-h-0 flex-col" data-testid="create-lead-gather-step">
                    <CreateLeadOperationalIntake
                        pasteText={pasteText}
                        onPasteTextChange={setPasteText}
                        suggestions={suggestions}
                        values={values}
                        sections={sections}
                        platformRequiredKeys={CREATE_LEAD_PLATFORM_REQUIRED_KEYS}
                        onFieldChange={setFieldValue}
                        onToggleSuggestion={(id) => {
                            setSuggestions((prev) =>
                                prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)),
                            );
                        }}
                        onApplySuggestions={applySuggestions}
                        onSuggestionValueChange={(id, value) => {
                            setSuggestions((prev) =>
                                prev.map((s) => (s.id === id ? { ...s, suggested_value: value } : s)),
                            );
                        }}
                        onAnalyze={runAnalyze}
                        analyzing={analyzing}
                        analyzeError={analyzeError}
                        disabled={!departmentId}
                        manualMode={manualMode}
                        onEnterManually={() => {
                            setGatherPhase("details");
                            setError(null);
                        }}
                        onClearMaterial={clearMaterial}
                        materialAnalyzed={materialAnalyzed}
                        validationIssues={validationIssues}
                    />
                </div>
            </ActionWorkspaceStepContent>

            <ActionWorkspaceStepContent step="review" activeStep={step}>
                <div className="h-full px-8 py-4" data-testid="create-lead-review-step">
                    <ActionWorkspaceReviewSummary
                        fields={CREATE_LEAD_GATHER_FIELDS}
                        values={values}
                        dataTestIdPrefix="create-lead-review"
                    />
                </div>
            </ActionWorkspaceStepContent>

            <ActionWorkspaceStepContent step="execute" activeStep={step}>
                <ActionWorkspaceExecuteState
                    title="Creating Lead…"
                    subtitle="Saving person, household, and lead record."
                />
            </ActionWorkspaceStepContent>

            <ActionWorkspaceStepContent step="success" activeStep={step}>
                <ActionWorkspaceSuccessState
                    title="Lead Created"
                    detail={successDetail ?? "Preparing your workspace…"}
                    householdLabel={householdLabel}
                    bosRecommendations={bosRecommendations}
                    suggestedActions={successActions}
                />
            </ActionWorkspaceStepContent>

            {error ?
                <div className="mx-6 mb-3 shrink-0 rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                    {error}
                </div>
            :   null}
        </ActionWorkspaceBosShell>
    );
}
