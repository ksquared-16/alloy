"use client";

/**
 * Generic BOS command-session controller for thin preparation adapters
 * (mutation / relationship / confirmation). Create Lead keeps its own controller.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
    getBosCommandAdapter,
    getBosCommandAdapterRegistration,
} from "@/lib/bos/commandSession/adapters/bosCommandAdapterRegistry";
import {
    normalizeBosEntityType,
    seedSubjectOntoDraft,
    upsertSystemDraftField,
} from "@/lib/bos/commandSession/adapters/shared/bosAdapterDraftHelpers";
import { fetchCancelTourBosPreview } from "@/lib/bos/commandSession/adapters/cancelTourBosAdapter";
import {
    applyOperatorFieldEdit,
    fingerprintBosCommandDraft,
    type BosCommandSession,
} from "@/lib/bos/commandSession";
import { draftFieldString } from "@/lib/bos/commandSession/adapters/shared/bosAdapterDraftHelpers";

type StatusOption = { value: string; label: string };

export function useGenericBosCommandSessionController(session: BosCommandSession) {
    const ctx = useBosCommandSessionOptional();
    const globalAssistant = useGlobalAssistantOptional();
    const registration = getBosCommandAdapterRegistration(session.invocation.actionKey);
    const adapter = getBosCommandAdapter(session.invocation.actionKey);

    const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
    const [busy, setBusy] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const departmentId =
        session.invocation.workspace.departmentId?.trim() ||
        globalAssistant?.workspaceScope?.department_id?.trim() ||
        null;
    const workUnitId =
        session.invocation.workspace.workUnitId?.trim() ||
        globalAssistant?.workspaceScope?.work_unit_id?.trim() ||
        null;
    const surface =
        session.invocation.workspace.surface ||
        (workUnitId ? "work_unit" : "bos_recommendations");

    const adapterCtx = useMemo(
        () => ({
            departmentId,
            workUnitId,
            surface,
            statusLabels: Object.fromEntries(statusOptions.map((o) => [o.value, o.label])),
        }),
        [departmentId, workUnitId, surface, statusOptions]
    );

    // Seed subject from GlobalAssistant focus context once per session key.
    useEffect(() => {
        if (!ctx || !adapter) return;
        const entity = globalAssistant?.currentContext;
        const entityId = entity?.entity_id?.trim() || "";
        const entityType = normalizeBosEntityType(entity?.entity_type);
        if (!entityId || !entityType) return;
        if (draftFieldString(session.draft, "entity_id") === entityId) return;
        let next = seedSubjectOntoDraft(session.draft, {
            entityType,
            entityId,
            label: entity?.label ?? null,
        });
        ctx.dispatch({ type: "SET_DRAFT", draft: next });
        // Resolve command-specific subject enrichment.
        void (async () => {
            try {
                if (session.invocation.actionKey === "update_lead_status" && entityType === "opportunity") {
                    const res = await fetch(
                        `/api/admin/status-options?entity_type=${encodeURIComponent("opportunities")}`,
                        { credentials: "include" }
                    );
                    const json = (await res.json().catch(() => ({}))) as {
                        options?: Array<{ value?: string; label?: string }>;
                    };
                    const options = (json.options ?? [])
                        .map((o) => ({
                            value: String(o.value ?? "").trim(),
                            label: String(o.label ?? o.value ?? "").trim(),
                        }))
                        .filter((o) => o.value);
                    setStatusOptions(options);
                }
                if (
                    (session.invocation.actionKey === "add_parent_guardian" ||
                        session.invocation.actionKey === "cancel_tour") &&
                    entityType === "opportunity"
                ) {
                    const res = await fetch(
                        `/api/admin/entity/opportunities/${encodeURIComponent(entityId)}`,
                        { credentials: "include" }
                    );
                    const json = (await res.json().catch(() => ({}))) as {
                        data?: { entity?: { customer_id?: string | null; name?: string | null } };
                    };
                    const entityRow = json.data?.entity ?? {};
                    const customerId = String(entityRow.customer_id ?? "").trim();
                    const name = String(entityRow.name ?? entity?.label ?? "").trim();
                    let enriched = session.draft;
                    if (customerId && session.invocation.actionKey === "add_parent_guardian") {
                        enriched = upsertSystemDraftField(enriched, "source_customer_id", customerId);
                    }
                    if (name) enriched = upsertSystemDraftField(enriched, "entity_label", name);
                    if (session.invocation.actionKey === "cancel_tour") {
                        const bookingsRes = await fetch(
                            `/api/admin/tours/opportunities/${encodeURIComponent(entityId)}/bookings`,
                            { credentials: "include" }
                        );
                        const bookingsJson = (await bookingsRes.json().catch(() => ({}))) as {
                            active_bookings?: Array<{ id?: string }>;
                        };
                        const bookingId = String(bookingsJson.active_bookings?.[0]?.id ?? "").trim();
                        if (bookingId) {
                            enriched = upsertSystemDraftField(enriched, "booking_id", bookingId);
                        }
                    }
                    ctx.dispatch({
                        type: "SET_DRAFT",
                        draft: seedSubjectOntoDraft(enriched, {
                            entityType,
                            entityId,
                            label: name || entity?.label || null,
                        }),
                    });
                }
                setLoadError(null);
            } catch {
                setLoadError("Could not load command context for this record.");
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once when subject/action changes
    }, [
        adapter,
        ctx,
        globalAssistant?.currentContext?.entity_id,
        globalAssistant?.currentContext?.entity_type,
        session.invocation.actionKey,
    ]);

    // Keep resolution in sync with draft.
    useEffect(() => {
        if (!ctx || !adapter) return;
        const resolution = adapter.revalidate(session.draft, adapterCtx);
        const prev = session.resolution;
        const same =
            prev.readyForPreview === resolution.readyForPreview &&
            prev.readyToExecute === resolution.readyToExecute &&
            prev.missingRequired.join(",") === resolution.missingRequired.join(",") &&
            prev.blockers.map((b) => `${b.code}:${b.message}`).join("|") ===
                resolution.blockers.map((b) => `${b.code}:${b.message}`).join("|");
        if (same) return;
        ctx.dispatch({ type: "SET_RESOLUTION", resolution });
    }, [adapter, adapterCtx, ctx, session.draft, session.resolution]);

    const setField = useCallback(
        (fieldKey: string, value: string) => {
            if (!ctx) return;
            const draft = applyOperatorFieldEdit(session.draft, fieldKey, value);
            ctx.dispatch({ type: "SET_DRAFT", draft });
        },
        [ctx, session.draft]
    );

    const goReview = useCallback(async () => {
        if (!ctx || !adapter || busy) return;
        const resolution = adapter.revalidate(session.draft, adapterCtx);
        if (!resolution.readyForPreview) {
            ctx.dispatch({ type: "SET_RESOLUTION", resolution });
            return;
        }
        setBusy(true);
        try {
            let draft = session.draft;
            if (session.invocation.actionKey === "cancel_tour") {
                const opportunityId = draftFieldString(draft, "entity_id");
                const bookingId = draftFieldString(draft, "booking_id");
                const preview = await fetchCancelTourBosPreview({
                    opportunityId,
                    bookingId,
                    cancelReason: draftFieldString(draft, "cancel_reason") || undefined,
                    departmentId,
                    workUnitId,
                    surface,
                });
                if (!preview.ok) {
                    setLoadError(preview.errorMessage);
                    return;
                }
                draft = upsertSystemDraftField(draft, "preview_token", preview.previewToken);
                draft = upsertSystemDraftField(
                    draft,
                    "preview_warnings",
                    preview.warnings.join("\n")
                );
                ctx.dispatch({ type: "SET_DRAFT", draft });
            }
            const preview = adapter.buildPreview(draft, adapterCtx);
            ctx.dispatch({ type: "SET_PREVIEW", preview });
        } finally {
            setBusy(false);
        }
    }, [adapter, adapterCtx, busy, ctx, departmentId, session.draft, session.invocation.actionKey, surface, workUnitId]);

    const goConfirm = useCallback(() => {
        if (!ctx || !session.preview) return;
        const fp = fingerprintBosCommandDraft(session.draft);
        if (fp !== session.preview.draftFingerprint) {
            ctx.dispatch({
                type: "FAIL",
                recovery: {
                    reason: "stale_preview",
                    preserveDraft: true,
                    operatorMessage: "Inputs changed since preview. Review again before confirming.",
                },
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

    const goExecute = useCallback(async () => {
        if (!ctx || !adapter || busy) return;
        setBusy(true);
        ctx.dispatch({ type: "BEGIN_EXECUTE" });
        try {
            const payload = adapter.toExecutePayload(session.draft, adapterCtx);
            // Ensure cancel_tour carries the preview token from session preview when present.
            if (session.invocation.actionKey === "cancel_tour" && session.preview?.previewToken) {
                payload.preview_token = session.preview.previewToken;
            }
            const execution = await adapter.execute(payload, adapterCtx);
            if (!execution.ok) {
                ctx.dispatch({
                    type: "EXECUTE_FAILURE",
                    execution,
                    recovery: {
                        reason: "server",
                        preserveDraft: true,
                        operatorMessage: execution.errorMessage,
                    },
                });
                return;
            }
            ctx.dispatch({
                type: "EXECUTE_SUCCESS",
                execution,
                phase: "completed",
            });
        } catch (e) {
            ctx.dispatch({
                type: "EXECUTE_FAILURE",
                execution: {
                    ok: false,
                    errorMessage: e instanceof Error ? e.message : "Command failed.",
                    retryable: true,
                    recoveryHints: [],
                },
                recovery: {
                    reason: "network",
                    preserveDraft: true,
                    operatorMessage: "Something went wrong running this Command.",
                },
            });
        } finally {
            setBusy(false);
        }
    }, [adapter, adapterCtx, busy, ctx, session.draft, session.invocation.actionKey, session.preview]);

    return {
        registration,
        adapter,
        statusOptions,
        busy,
        loadError,
        departmentId,
        setField,
        goReview,
        goConfirm,
        goExecute,
        draftField: (key: string) => draftFieldString(session.draft, key),
    };
}
