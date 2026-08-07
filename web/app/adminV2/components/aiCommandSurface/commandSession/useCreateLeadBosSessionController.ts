"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { resolveCreateLeadDefaultLocation } from "@/lib/admin/actions/resolveCreateLeadDefaultLocation";
import { upsertBosDraftValue } from "@/lib/bos/commandSession/draftValues";
import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import type { IntakeSelectOption } from "@/lib/intake/types";
import type { BosCommandResolutionState } from "@/lib/bos/commandSession/types";

function resolutionFingerprint(resolution: BosCommandResolutionState): string {
    return [
        resolution.readyForPreview ? "1" : "0",
        resolution.readyToExecute ? "1" : "0",
        resolution.missingRequired.join(","),
        resolution.blockers.map((b) => `${b.code}:${b.message}`).join("|"),
    ].join("::");
}

export function useCreateLeadBosSessionController(session: BosCommandSession) {
    const ctx = useBosCommandSessionOptional();
    const globalAssistant = useGlobalAssistantOptional();
    const [pasteText, setPasteText] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [intakeSpec, setIntakeSpec] = useState<ActionIntakeSpec | null>(null);
    const [effectiveSpec, setEffectiveSpec] = useState<EffectiveCreateLeadIntakeSpec | null>(null);

    // Slash Create Lead historically launched with null department when workspace scope
    // was unset — fall back to live GlobalAssistant scope so Form loads effective intake.
    const departmentId =
        session.invocation.workspace.departmentId?.trim() ||
        globalAssistant?.workspaceScope?.department_id?.trim() ||
        null;
    const draftFormSnapshot = useMemo(() => formValuesFromDraft(session.draft), [session.draft]);
    const formLocation = String(draftFormSnapshot.location_id ?? "");
    const formProgram = String(draftFormSnapshot.child_program ?? "");
    const cascade = useInquiryChildPlacementCascade({
        locationValue: formLocation,
        programValue: formProgram,
    });

    // Location is implied whenever the operator's own scope determines it — the selected workspace
    // site, or their single permitted site. Only an "All locations" operator with more than one
    // permitted site has to supply it. Seeded once so clearing the field is not fought.
    const siteFilter = useWorkspaceSiteFilter();
    const impliedLocationSeededRef = useRef(false);
    const impliedLocationId = resolveCreateLeadDefaultLocation({
        workspaceSiteId: siteFilter?.selectedSiteId ?? null,
        permittedSiteIds: (siteFilter?.bootstrap?.sites ?? []).map((s) => s.id),
    }).location_id;

    useEffect(() => {
        if (!ctx || impliedLocationSeededRef.current) return;
        if (!impliedLocationId || formLocation.trim()) return;
        impliedLocationSeededRef.current = true;
        ctx.dispatch({
            type: "SET_DRAFT",
            draft: upsertBosDraftValue(session.draft, {
                fieldKey: "location_id",
                value: impliedLocationId,
                state: "confirmed",
                evidence: [
                    {
                        kind: "system_default",
                        note: "From your location",
                        at: new Date().toISOString(),
                    },
                ],
                optionResolved: true,
            }),
        });
    }, [ctx, formLocation, impliedLocationId, session.draft]);

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
        // loadEffectiveSpec is sync today; Promise.resolve keeps the effect safe if the
        // adapter later becomes async without regressing setState typing.
        let cancelled = false;
        void Promise.resolve(
            createLeadConversationIntakeAdapter.loadEffectiveSpec({
                departmentId: departmentId?.trim() || null,
                actionIntakeSpec,
                fieldOptions,
            }),
        ).then((loaded) => {
            if (!cancelled) setEffectiveSpec(loaded);
        });
        return () => {
            cancelled = true;
        };
    }, [departmentId, fieldOptions, intakeSpec]);

    // Execute must use the same repaired department the spec was loaded against, or the lead is
    // validated for one department and committed with none.
    const workspace = useMemo(
        () => ({
            departmentId,
            workUnitId: session.invocation.workspace.workUnitId,
            surface: session.invocation.workspace.surface || "bos_recommendations",
        }),
        [departmentId, session.invocation.workspace]
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
        if (!ctx) return;
        const prev = session.resolution;
        if (prev && resolutionFingerprint(prev) === resolutionFingerprint(resolution)) return;
        ctx.dispatch({ type: "SET_RESOLUTION", resolution });
    }, [ctx, resolution, session.resolution]);

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
            // Keep Work Unit settlement responsive while the operator types in BOS Form.
            startTransition(() => {
                ctx.dispatch({
                    type: "SET_DRAFT",
                    draft: applyOperatorFieldEdit(session.draft, payloadKey, value),
                });
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
            startTransition(() => {
                ctx.dispatch({
                    type: "SET_DRAFT",
                    draft: applyCreateLeadCommitSelectionToDraft(session.draft, next),
                });
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
        if (!result.processingCaseId && result.ok && result.success) {
            const copy =
                typeof result.success === "object" && result.success && "successCopy" in result.success
                    ? String((result.success as { successCopy?: string }).successCopy ?? "Lead created")
                    : "Lead created";
            ctx.dispatch({
                type: "COMPLETE",
                successMessage: `${copy} Open Lead when you want to continue.`,
            });
            if (result.opportunityId) {
                dispatchOpportunityQueueUpdated(result.opportunityId, "create_lead");
            }
        }
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
