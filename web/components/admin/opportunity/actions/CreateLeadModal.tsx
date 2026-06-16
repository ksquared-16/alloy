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
    emptyCreateLeadGatherValues,
    mapCreateLeadGatherToExecutePayload,
    validateCreateLeadPlatformMinimum,
} from "@/lib/admin/actions/createLeadPlatformGather";
import {
    formatCreateLeadHouseholdLabel,
} from "@/lib/admin/actions/createLeadBosGuidance";
import { mapBosRecommendationsToSuccessActions } from "@/lib/admin/actions/mapBosRecommendationsToSuccessActions";
import { resolveCreateLeadPostCreateRecommendations } from "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations";
import { CREATE_LEAD_WORKSPACE_TITLE } from "@/lib/admin/actions/bosWorkspaceShell";
import {
    applyHighConfidenceCreateLeadExtraction,
    emptyCreateLeadValuesForFields,
    gatherFieldsFromActionIntakeSpec,
    gatherSectionsFromFields,
    resolveCreateLeadRequiredFields,
    reviewSuggestionsFromExtraction,
    validateCreateLeadFromIntakeSpec,
    type CreateLeadRequiredFieldsBundle,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { resolveCreateLeadProgressStep } from "@/lib/admin/actions/createLeadProgressStep";
import { CreateLeadProgressRail } from "@/components/admin/actions/CreateLeadProgressRail";
import { createLeadIntakePasteParser } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { fetchActionIntakeSpec } from "@/lib/lifecycle/fetchActionIntakeSpec";
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

function platformFallbackBundle(departmentId: string): CreateLeadRequiredFieldsBundle {
    return resolveCreateLeadRequiredFields({ departmentId, stageKey: "lead" });
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
    const [intakeBundle, setIntakeBundle] = useState<CreateLeadRequiredFieldsBundle | null>(null);
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

    const gatherFields = intakeBundle?.gatherFields ?? CREATE_LEAD_GATHER_FIELDS;
    const sections = useMemo(
        () => intakeBundle?.sections ?? gatherSectionsFromFields([...CREATE_LEAD_GATHER_FIELDS]),
        [intakeBundle],
    );
    const requiredPayloadKeys = intakeBundle?.requiredPayloadKeys ?? CREATE_LEAD_PLATFORM_REQUIRED_KEYS;
    const intakeSpec = intakeBundle?.spec ?? null;

    const handoffToCreatedLead = useCallback(
        (opportunityId: string) => {
            queueActionWorkspaceLeadHandoff(opportunityId, (id) => onCreated?.(id), onClose);
        },
        [onClose, onCreated],
    );

    const validation = useMemo(() => {
        if (intakeSpec) return validateCreateLeadFromIntakeSpec(intakeSpec, values);
        return validateCreateLeadPlatformMinimum(values);
    }, [intakeSpec, values]);
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
    const draftEditMode = materialAnalyzed && !manualMode;
    const validationIssues = validation.ok ? [] : validation.issues;
    const progressStep = resolveCreateLeadProgressStep({
        step,
        materialAnalyzed: draftEditMode || manualMode,
        validationOk: validation.ok,
    });

    const resetWorkspaceState = useCallback(() => {
        setStep("gather");
        setGatherPhase("paste");
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
        resetWorkspaceState();
        if (!departmentId) {
            setError("Department context is required to create a lead.");
            setIntakeBundle(null);
            setValues(emptyCreateLeadGatherValues());
            return;
        }

        const fallback = platformFallbackBundle(departmentId);
        setIntakeBundle(fallback);
        const initialValues = emptyCreateLeadValuesForFields(fallback.gatherFields);
        const permittedSiteIds = (siteFilter?.bootstrap?.sites ?? []).map((s) => s.id);
        const resolved = resolveCreateLeadDefaultLocation({
            workspaceSiteId: siteFilter?.selectedSiteId ?? null,
            permittedSiteIds,
        });
        setValues(
            resolved.location_id ?
                applyCreateLeadDefaultLocationToValues(initialValues, resolved)
            :   initialValues,
        );

        let cancelled = false;
        fetchActionIntakeSpec({
            action_key: "create_lead",
            department_id: departmentId,
            stage_key: "lead",
        })
            .then((spec) => {
                if (cancelled) return;
                const fields = gatherFieldsFromActionIntakeSpec(spec);
                setIntakeBundle({
                    spec,
                    gatherFields: fields,
                    sections: gatherSectionsFromFields(fields),
                    requiredPayloadKeys: spec.required.map((f) => f.payload_key),
                });
                setValues((prev) => {
                    const next = emptyCreateLeadValuesForFields(fields);
                    for (const field of fields) {
                        const existing = (prev[field.payload_key] ?? "").trim();
                        if (existing) next[field.payload_key] = existing;
                    }
                    return next;
                });
            })
            .catch(() => {
                /* keep client-side fallback bundle */
            });

        return () => {
            cancelled = true;
        };
    }, [open, departmentId, resetWorkspaceState, siteFilter?.selectedSiteId, siteFilter?.bootstrap?.sites]);

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

    const runAnalyze = useCallback(
        (textOverride?: string) => {
            const text = (textOverride ?? pasteText).trim();
            if (!departmentId || !text) return;
            if (textOverride) setPasteText(text);
            setAnalyzing(true);
            setAnalyzeError(null);
            setError(null);
            setGatherPhase("paste");
            try {
                const spec = intakeSpec ?? platformFallbackBundle(departmentId).spec;
                const extraction = createLeadIntakePasteParser.parse({ text, spec });
                if (extraction.fields.length === 0) {
                    setAnalyzeError("BOS could not extract structured fields. Try adding labels like Parent: or Email:.");
                    setSuggestions([]);
                    return;
                }

                const labelByKey = Object.fromEntries(gatherFields.map((f) => [f.payload_key, f.field_label]));
                setValues((prev) => applyHighConfidenceCreateLeadExtraction(prev, extraction));
                setSuggestions(reviewSuggestionsFromExtraction(extraction, labelByKey));
                setMaterialAnalyzed(true);
            } catch (e) {
                setSuggestions([]);
                setAnalyzeError(e instanceof Error ? e.message : "Could not analyze pasted text.");
            } finally {
                setAnalyzing(false);
            }
        },
        [departmentId, intakeSpec, pasteText],
    );

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
        const check =
            intakeSpec ?
                validateCreateLeadFromIntakeSpec(intakeSpec, values)
            :   validateCreateLeadPlatformMinimum(values);
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
    }, [departmentId, intakeSpec, onSubmit, values]);

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
                {validation.ok && (draftEditMode || manualMode) ?
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
            stepRail={<CreateLeadProgressRail activeStep={progressStep} onDark={false} />}
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
                        gatherFields={gatherFields}
                        intakeSpec={intakeSpec}
                        requiredPayloadKeys={requiredPayloadKeys}
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
                        draftEditMode={draftEditMode}
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
                        fields={gatherFields}
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
