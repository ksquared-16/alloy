"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    emptyCreateLeadValuesForFields,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { fetchActionIntakeSpec } from "@/lib/lifecycle/fetchActionIntakeSpec";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import {
    applyOperatorFieldEdit,
    bosDraftToFormValues,
    confirmBosDraftField,
    createLeadConversationIntakeAdapter,
    executeCreateLeadFromBosDraft,
    fingerprintBosCommandDraft,
    formValuesFromDraft,
    type BosCommandSession,
    type EffectiveCreateLeadIntakeSpec,
} from "@/lib/bos/commandSession";
import { projectCreateLeadFormSections } from "@/lib/bos/commandSession/createLeadFormSectionProjection";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    applyCreateLeadCommitSelectionToDraft,
    resolveCreateLeadCommitSelectionFromDraft,
} from "@/lib/bos/commandSession/createLeadRepeaterDraft";
import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import type { IntakeSelectOption } from "@/lib/intake/types";

export function useCreateLeadBosSessionController(session: BosCommandSession) {
    const ctx = useBosCommandSessionOptional();
    const [pasteText, setPasteText] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [intakeSpec, setIntakeSpec] = useState<ActionIntakeSpec | null>(null);
    const [effectiveSpec, setEffectiveSpec] = useState<EffectiveCreateLeadIntakeSpec | null>(null);

    const departmentId = session.invocation.workspace.departmentId;
    const draftFormSnapshot = useMemo(() => formValuesFromDraft(session.draft), [session.draft]);
    const formLocation = String(draftFormSnapshot.location_id ?? "");
    const formProgram = String(draftFormSnapshot.child_program ?? "");
    const cascade = useInquiryChildPlacementCascade({
        locationValue: formLocation,
        programValue: formProgram,
    });

    const fieldOptions = useMemo(() => {
        const options: Partial<Record<string, readonly IntakeSelectOption[]>> = {};
        if (cascade.siteOptions.length) options.location_id = cascade.siteOptions;
        if (cascade.programOptions.length) options.child_program = cascade.programOptions;
        if (cascade.roomOptions.length) {
            options.child_program_room_cohort_key = cascade.roomOptions;
        }
        return Object.keys(options).length ? options : undefined;
    }, [cascade.programOptions, cascade.roomOptions, cascade.siteOptions]);

    useEffect(() => {
        let cancelled = false;
        const dept = departmentId?.trim();
        if (!dept) {
            setIntakeSpec(createLeadParserSpec("platform"));
            return;
        }
        void fetchActionIntakeSpec({
            action_key: "create_lead",
            department_id: dept,
            stage_key: "lead",
        })
            .then((spec) => {
                if (!cancelled) setIntakeSpec(spec);
            })
            .catch(() => {
                if (!cancelled) setIntakeSpec(createLeadParserSpec(dept));
            });
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    useEffect(() => {
        const actionIntakeSpec = intakeSpec ?? createLeadParserSpec(departmentId?.trim() || "platform");
        const loaded = createLeadConversationIntakeAdapter.loadEffectiveSpec({
            departmentId: departmentId?.trim() || null,
            actionIntakeSpec,
            fieldOptions,
        });
        setEffectiveSpec(loaded);
    }, [departmentId, fieldOptions, intakeSpec]);

    const workspace = useMemo(
        () => ({
            departmentId: session.invocation.workspace.departmentId,
            workUnitId: session.invocation.workspace.workUnitId,
            surface: session.invocation.workspace.surface || "bos_recommendations",
        }),
        [session.invocation.workspace]
    );

    const resolution = useMemo(() => {
        if (!effectiveSpec) {
            return {
                missingRequired: [],
                missingOptional: [],
                invalid: [],
                ambiguous: [],
                blockers: [],
                readyForPreview: false,
                readyToExecute: false,
            };
        }
        return createLeadConversationIntakeAdapter.syncDraftResolution({
            draft: session.draft,
            effectiveSpec,
            workspace,
        });
    }, [effectiveSpec, session.draft, workspace]);

    useEffect(() => {
        ctx?.dispatch({ type: "SET_RESOLUTION", resolution });
    }, [ctx, resolution]);

    const gatherFields = effectiveSpec?.gatherFields ?? [];
    const gatherFields = effectiveSpec?.gatherFields ?? [];
    const sections = useMemo(
        () =>
            projectCreateLeadFormSections(gatherFields, {
                requiredPayloadKeys: effectiveSpec?.requiredPayloadKeys,
                intakeSpec: effectiveSpec?.actionIntakeSpec,
            }),
        [effectiveSpec?.actionIntakeSpec, effectiveSpec?.requiredPayloadKeys, gatherFields]
    );

    const formValues = useMemo(() => {
        const base = formValuesFromDraft(session.draft);
        const empty = emptyCreateLeadValuesForFields(gatherFields);
        return { ...empty, ...base };
    }, [gatherFields, session.draft]);

    const fieldConfidence = useMemo(() => {
        const out: Record<string, "high" | "medium" | "low" | "manual"> = {};
        for (const value of session.draft.values) {
            if (value.state === "parsed_from_source" || value.state === "confirmed") out[value.fieldKey] = "high";
            else if (value.state === "inferred") out[value.fieldKey] = "medium";
            else if (value.state === "operator_entered") out[value.fieldKey] = "manual";
        }
        return out;
    }, [session.draft.values]);

    const unsupportedHints = effectiveSpec?.unsupportedForConversation ?? [];

    const onAnalyze = useCallback(
        (textOverride?: string) => {
            const text = (textOverride ?? pasteText).trim();
            if (!text || !ctx || !effectiveSpec) return;
            setAnalyzing(true);
            setAnalyzeError(null);
            ctx.dispatch({ type: "BUMP_REQUEST_SEQ" });
            try {
                const nextDraft = createLeadConversationIntakeAdapter.parseOperatorTurn({
                    text,
                    draft: session.draft,
                    effectiveSpec,
                });
                ctx.dispatch({ type: "SET_DRAFT", draft: nextDraft });
                ctx.dispatch({
                    type: "APPEND_MESSAGE",
                    message: {
                        role: "operator",
                        kind: "user_source",
                        body: text.length > 280 ? `${text.slice(0, 277)}…` : text,
                    },
                });
                const summary = createLeadConversationIntakeAdapter.buildUnderstandingSummary({
                    draft: nextDraft,
                    effectiveSpec,
                });
                ctx.dispatch({
                    type: "APPEND_MESSAGE",
                    message: {
                        role: "assistant",
                        kind: "summary",
                        body:
                            summary.lines.length > 0
                                ? `Here’s what I found:\n${summary.lines.slice(0, 12).join("\n")}`
                                : "I couldn’t map that to lead fields. Try Form, or paste a clearer note.",
                    },
                });
                const clarification = createLeadConversationIntakeAdapter.nextClarification({
                    draft: nextDraft,
                    effectiveSpec,
                    workspace,
                });
                if (clarification) {
                    const body = [clarification.prompt, clarification.formGuidance]
                        .filter(Boolean)
                        .join(" ");
                    ctx.dispatch({
                        type: "APPEND_MESSAGE",
                        message: {
                            role: "assistant",
                            kind: "follow_up",
                            body,
                        },
                    });
                }
                setPasteText("");
            } catch (error) {
                setAnalyzeError(error instanceof Error ? error.message : "Could not read that.");
                ctx.dispatch({
                    type: "APPEND_MESSAGE",
                    message: {
                        role: "assistant",
                        kind: "error",
                        body: "I couldn’t read that. Try Form or paste again.",
                    },
                });
            } finally {
                setAnalyzing(false);
            }
        },
        [ctx, effectiveSpec, pasteText, session.draft, workspace]
    );

    const onFieldChange = useCallback(
        (payloadKey: string, value: string) => {
            if (!ctx) return;
            ctx.dispatch({
                type: "SET_DRAFT",
                draft: applyOperatorFieldEdit(session.draft, payloadKey, value),
            });
        },
        [ctx, session.draft]
    );

    const commitSelection = useMemo(
        () => resolveCreateLeadCommitSelectionFromDraft(session.draft),
        [session.draft]
    );

    const onCommitSelectionChange = useCallback(
        (next: CreateLeadCommitSelection) => {
            if (!ctx) return;
            ctx.dispatch({
                type: "SET_DRAFT",
                draft: applyCreateLeadCommitSelectionToDraft(session.draft, next),
            });
        },
        [ctx, session.draft]
    );

    const onConfirmField = useCallback(
        (payloadKey: string) => {
            if (!ctx) return;
            ctx.dispatch({
                type: "SET_DRAFT",
                draft: confirmBosDraftField(session.draft, payloadKey),
            });
        },
        [ctx, session.draft]
    );

    const onBuildPreview = useCallback(() => {
        if (!ctx || !effectiveSpec) return;
        const preview = createLeadConversationIntakeAdapter.buildReview({
            draft: session.draft,
            effectiveSpec,
            workspace,
        });
        ctx.dispatch({ type: "SET_PREVIEW", preview });
        ctx.dispatch({
            type: "APPEND_MESSAGE",
            message: {
                role: "assistant",
                kind: "preview",
                body: "Ready for review — check family, children, and placement understanding before continuing.",
            },
        });
    }, [ctx, effectiveSpec, session.draft, workspace]);

    const onConfirmPreview = useCallback(() => {
        if (!ctx || !session.preview) return;
        const currentFp = fingerprintBosCommandDraft(session.draft);
        if (currentFp !== session.preview.draftFingerprint) {
            ctx.dispatch({
                type: "FAIL",
                recovery: {
                    reason: "stale_preview",
                    preserveDraft: true,
                    operatorMessage: "Details changed since preview. Review again before continuing.",
                },
                errorMessage: "Details changed since preview. Review again before continuing.",
            });
            return;
        }
        ctx.dispatch({
            type: "SET_CONFIRMATION",
            confirmation: {
                confirmedAt: new Date().toISOString(),
                confirmedByOperator: true,
                previewFingerprint: session.preview.draftFingerprint,
            },
        });
    }, [ctx, session.draft, session.preview]);

    const onExecute = useCallback(async () => {
        if (!ctx || !session.preview || !session.confirmation?.confirmedByOperator || !effectiveSpec) {
            return;
        }
        const currentFp = fingerprintBosCommandDraft(session.draft);
        if (currentFp !== session.preview.draftFingerprint) {
            ctx.dispatch({
                type: "FAIL",
                recovery: {
                    reason: "stale_preview",
                    preserveDraft: true,
                    operatorMessage: "Details changed since preview. Review again before continuing.",
                },
            });
            return;
        }
        ctx.dispatch({ type: "BEGIN_EXECUTE" });
        const result = await executeCreateLeadFromBosDraft(session.draft, {
            departmentId: workspace.departmentId,
            workUnitId: workspace.workUnitId,
            surface: workspace.surface,
            spec: effectiveSpec.actionIntakeSpec,
            fieldOptions: effectiveSpec.fieldOptions,
            configRequiredInputs: effectiveSpec.configRequiredInputs,
        });
        if (!result.ok) {
            ctx.dispatch({
                type: "EXECUTE_FAILURE",
                execution: result,
                recovery: {
                    reason: result.retryable ? "network" : "server",
                    preserveDraft: true,
                    operatorMessage: result.errorMessage,
                },
            });
            ctx.dispatch({
                type: "APPEND_MESSAGE",
                message: { role: "assistant", kind: "error", body: result.errorMessage },
            });
            return;
        }
        ctx.dispatch({
            type: "EXECUTE_SUCCESS",
            execution: result,
            processingCaseId: result.processingCaseId ?? null,
            phase: result.processingCaseId ? "processing_review" : "completed",
        });
    }, [ctx, effectiveSpec, session, workspace]);

    return {
        pasteText,
        setPasteText,
        analyzing,
        analyzeError,
        intakeSpec: effectiveSpec?.actionIntakeSpec ?? createLeadParserSpec(departmentId?.trim() || "platform"),
        effectiveSpec,
        formValues,
        sections,
        gatherFields,
        unsupportedHints,
        fieldConfidence,
        resolution,
        onAnalyze,
        onFieldChange,
        onConfirmField,
        onBuildPreview,
        onConfirmPreview,
        onExecute,
        draftValues: bosDraftToFormValues(session.draft),
        commitSelection,
        onCommitSelectionChange,
    };
}
