"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    CREATE_LEAD_GATHER_FIELDS,
    createLeadParserSpec,
    gatherSections,
} from "@/lib/admin/actions/createLeadPlatformGather";
import { fetchActionIntakeSpec } from "@/lib/lifecycle/fetchActionIntakeSpec";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import {
    applyOperatorFieldEdit,
    applyParseResult,
    bosDraftToFormValues,
    confirmBosDraftField,
    formValuesFromDraft,
    revalidateCreateLeadDraft,
    type BosCommandSession,
    type CreateLeadAdapterContext,
} from "@/lib/bos/commandSession";
import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";

function buildAdapterCtx(
    session: BosCommandSession,
    spec: ActionIntakeSpec,
    fieldOptions?: CreateLeadAdapterContext["fieldOptions"]
): CreateLeadAdapterContext {
    return {
        departmentId: session.invocation.workspace.departmentId,
        workUnitId: session.invocation.workspace.workUnitId,
        surface: session.invocation.workspace.surface || "bos_recommendations",
        spec,
        fieldOptions,
    };
}

export function useCreateLeadBosSessionController(session: BosCommandSession) {
    const ctx = useBosCommandSessionOptional();
    const [pasteText, setPasteText] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [intakeSpec, setIntakeSpec] = useState<ActionIntakeSpec | null>(null);

    const departmentId = session.invocation.workspace.departmentId;
    const cascade = useInquiryChildPlacementCascade({ locationValue: "", programValue: "" });

    const fieldOptions = useMemo(() => {
        if (!cascade.siteOptions.length) return undefined;
        return {
            location_id: cascade.siteOptions,
        } as CreateLeadAdapterContext["fieldOptions"];
    }, [cascade.siteOptions]);

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

    const effectiveSpec = intakeSpec ?? createLeadParserSpec(departmentId?.trim() || "platform");

    const resolution = useMemo(
        () => revalidateCreateLeadDraft(session.draft, buildAdapterCtx(session, effectiveSpec, fieldOptions)),
        [session, effectiveSpec, fieldOptions]
    );

    useEffect(() => {
        ctx?.dispatch({ type: "SET_RESOLUTION", resolution });
    }, [ctx, resolution]);

    const formValues = useMemo(() => {
        const base = formValuesFromDraft(session.draft);
        for (const field of CREATE_LEAD_GATHER_FIELDS) {
            if (base[field.payload_key] == null) base[field.payload_key] = "";
        }
        return base;
    }, [session.draft]);

    const sections = useMemo(() => gatherSections(), []);

    const fieldConfidence = useMemo(() => {
        const out: Record<string, "high" | "medium" | "low" | "manual"> = {};
        for (const value of session.draft.values) {
            if (value.state === "parsed_from_source" || value.state === "confirmed") out[value.fieldKey] = "high";
            else if (value.state === "inferred") out[value.fieldKey] = "medium";
            else if (value.state === "operator_entered") out[value.fieldKey] = "manual";
        }
        return out;
    }, [session.draft.values]);

    const onAnalyze = useCallback(
        (textOverride?: string) => {
            const text = (textOverride ?? pasteText).trim();
            if (!text || !ctx) return;
            setAnalyzing(true);
            setAnalyzeError(null);
            ctx.dispatch({ type: "BUMP_REQUEST_SEQ" });
            try {
                const adapterCtx = buildAdapterCtx(session, effectiveSpec, fieldOptions);
                const nextDraft = applyParseResult(session.draft, text, adapterCtx);
                ctx.dispatch({ type: "SET_DRAFT", draft: nextDraft });
                ctx.dispatch({
                    type: "APPEND_MESSAGE",
                    message: {
                        role: "operator",
                        kind: "user_source",
                        body: text.length > 280 ? `${text.slice(0, 277)}…` : text,
                    },
                });
                const nextResolution = revalidateCreateLeadDraft(nextDraft, adapterCtx);
                const summaryParts = nextDraft.values
                    .filter((v) => v.state === "parsed_from_source" || v.state === "inferred")
                    .map((v) => {
                        const label = CREATE_LEAD_GATHER_FIELDS.find((f) => f.payload_key === v.fieldKey)?.field_label
                            ?? v.fieldKey.replace(/_/g, " ");
                        const tag = v.state === "inferred" ? " (suggested)" : "";
                        return `${label}${tag}: ${String(v.value)}`;
                    });
                ctx.dispatch({
                    type: "APPEND_MESSAGE",
                    message: {
                        role: "assistant",
                        kind: "summary",
                        body:
                            summaryParts.length > 0
                                ? `Here’s what I found:\n${summaryParts.slice(0, 10).join("\n")}`
                                : "I couldn’t map that to lead fields. Try Form, or paste a clearer note.",
                    },
                });
                if (nextResolution.missingRequired.length > 0) {
                    const labels = nextResolution.blockers.map((b) => b.message).join(" ");
                    ctx.dispatch({
                        type: "APPEND_MESSAGE",
                        message: {
                            role: "assistant",
                            kind: "follow_up",
                            body: labels || "A few required details are still missing.",
                        },
                    });
                }
                if (!pasteText.trim()) setPasteText(text);
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
        [ctx, effectiveSpec, fieldOptions, pasteText, session]
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

    return {
        pasteText,
        setPasteText,
        analyzing,
        analyzeError,
        intakeSpec: effectiveSpec,
        formValues,
        sections,
        gatherFields: CREATE_LEAD_GATHER_FIELDS,
        fieldConfidence,
        resolution,
        onAnalyze,
        onFieldChange,
        onConfirmField,
        draftValues: bosDraftToFormValues(session.draft),
        adapterCtx: buildAdapterCtx(session, effectiveSpec, fieldOptions),
    };
}
