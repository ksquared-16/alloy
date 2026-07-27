"use client";

import dynamic from "next/dynamic";

import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import type { BosCommandMode, BosCommandSession } from "@/lib/bos/commandSession";
import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import { useCreateLeadBosSessionController } from "@/app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController";
import { opportunityIdFromAttempt } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { bosDraftToEligiblePayload } from "@/lib/bos/commandSession";
import { createLeadDisplayName } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";

const IdentityReviewPanel = dynamic(
    () => import("@/app/adminV2/processing/IdentityReviewPanel"),
    { ssr: false }
);

/**
 * BOS command-session host — ack, Conversation|Form toggle, Create Lead gather.
 */
export function BosCommandSessionHost() {
    const ctx = useBosCommandSessionOptional();
    const session = ctx?.session ?? null;
    if (!session || session.phase === "discarded") return null;
    if (session.invocation.actionKey !== "create_lead") {
        return (
            <div className="p-3 text-sm text-alloy-midnight/70" data-bos-command-session-host="true">
                This command is not available in BOS yet.
            </div>
        );
    }
    return <CreateLeadCommandSessionBody session={session} />;
}

function CreateLeadCommandSessionBody({ session }: { session: BosCommandSession }) {
    const ctx = useBosCommandSessionOptional();
    const controller = useCreateLeadBosSessionController(session);

    const setMode = (mode: BosCommandMode) => {
        if (!ctx || mode === session.mode) return;
        ctx.dispatch({ type: "SET_MODE", mode });
    };

    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/15 bg-white"
            data-bos-command-session-host="true"
            data-bos-command-session-phase={session.phase}
            data-bos-command-session-mode={session.mode}
        >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/25 px-3 py-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-alloy-midnight">
                        {session.invocation.displayLabel}
                    </p>
                    <p className="text-[11px] text-alloy-midnight/55">Command session</p>
                </div>
                <div
                    className="flex shrink-0 rounded-md border border-alloy-stone/30 bg-alloy-stone/5 p-0.5"
                    role="tablist"
                    aria-label="Command input mode"
                >
                    <ModeTab
                        active={session.mode === "conversation"}
                        label="Conversation"
                        onClick={() => setMode("conversation")}
                    />
                    <ModeTab
                        active={session.mode === "form"}
                        label="Form"
                        onClick={() => setMode("form")}
                    />
                </div>
                <button
                    type="button"
                    className="shrink-0 rounded-md border border-alloy-stone/30 px-2 py-1 text-[11px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                    data-bos-command-session-discard
                    onClick={() => ctx?.discardSession()}
                >
                    Close
                </button>
            </div>

            {controller.resolution.blockers.length > 0 &&
            session.phase !== "processing_review" &&
            session.phase !== "completed" &&
            session.phase !== "preview" &&
            session.phase !== "confirming" &&
            session.phase !== "executing" ? (
                <div
                    className="shrink-0 border-b border-alloy-stone/25 bg-alloy-stone/[0.04] px-3 py-2 text-[12px] text-alloy-midnight/70"
                    data-bos-command-session-resolution="true"
                >
                    Still needed:{" "}
                    {controller.resolution.blockers.map((b) => b.message.replace(/\.$/, "")).join(" · ")}
                </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-bos-command-session-body="true">
                {session.phase === "processing_review" && session.processingCaseId ? (
                    <div data-bos-command-session-processing="true">
                        <p className="mb-3 text-sm text-alloy-midnight/70">
                            Review identity matches, approve the commit plan, then explicitly commit to create
                            records.
                        </p>
                        <IdentityReviewPanel
                            caseId={session.processingCaseId}
                            onCommitted={({ operations }) => {
                                const opportunityId = opportunityIdFromAttempt(
                                    operations.map((o) => ({
                                        commandKey: o.commandKey ?? "",
                                        recordId: o.recordId,
                                        status: o.status,
                                    }))
                                );
                                if (!opportunityId) {
                                    ctx?.dispatch({
                                        type: "FAIL",
                                        recovery: {
                                            reason: "server",
                                            preserveDraft: true,
                                            operatorMessage:
                                                "Commit completed but no lead record id was returned.",
                                        },
                                    });
                                    return;
                                }
                                dispatchOpportunityQueueUpdated(opportunityId, "create_lead");
                                const payload = bosDraftToEligiblePayload(session.draft);
                                const name = createLeadDisplayName(payload);
                                const successCopy = name ? `Created lead for ${name}.` : "Lead created.";
                                const focusPanelHref = resolveCreatedRecordProcessContextHref({
                                    recordId: opportunityId,
                                    workUnitKey: null,
                                    workViewId: null,
                                });
                                ctx?.dispatch({
                                    type: "EXECUTE_SUCCESS",
                                    execution: {
                                        ok: true,
                                        executionKind: "processing_intake",
                                        opportunityId,
                                        processingCaseId: session.processingCaseId ?? undefined,
                                        success: {
                                            createdRecordId: opportunityId,
                                            focusPanelHref,
                                            successCopy,
                                        },
                                    },
                                    phase: "completed",
                                });
                                ctx?.dispatch({
                                    type: "COMPLETE",
                                    successMessage: `${successCopy} Open Lead when you want to continue.`,
                                });
                            }}
                        />
                    </div>
                ) : session.phase === "completed" ? (
                    <div data-bos-command-session-success="true" className="space-y-3">
                        <p className="text-sm font-medium text-alloy-midnight">
                            {session.messages.filter((m) => m.kind === "success").at(-1)?.body ??
                                "Lead created."}
                        </p>
                        {(() => {
                            const success = session.execution && session.execution.ok ? session.execution.success : null;
                            const href =
                                success &&
                                typeof success === "object" &&
                                success !== null &&
                                "focusPanelHref" in success
                                    ? String((success as { focusPanelHref?: string }).focusPanelHref ?? "")
                                    : "";
                            const id =
                                session.execution && session.execution.ok
                                    ? session.execution.opportunityId
                                    : null;
                            if (!href && !id) return null;
                            return (
                                <a
                                    href={href || undefined}
                                    className="inline-flex rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                                    data-bos-command-session-open-lead
                                    onClick={(event) => {
                                        // Explicit Open Lead only — never auto-navigate on success.
                                        if (!href) {
                                            event.preventDefault();
                                        }
                                    }}
                                >
                                    Open Lead
                                </a>
                            );
                        })()}
                    </div>
                ) : (
                    <>
                <ul className="mb-4 space-y-2" data-bos-command-session-messages="true">
                    {session.messages
                        .filter((message) => message.kind !== "mode_switch")
                        .map((message) => (
                        <li
                            key={message.id}
                            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-snug ${
                                message.role === "operator"
                                    ? "ml-6 bg-alloy-bend-pine/10 text-alloy-midnight"
                                    : "mr-4 bg-alloy-stone/10 text-alloy-midnight/90"
                            }`}
                            data-bos-command-session-message={message.kind}
                        >
                            {message.body}
                        </li>
                    ))}
                </ul>

                {session.mode === "conversation" ? (
                    <div data-bos-command-session-mode-body="conversation" className="space-y-3">
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            Your message
                        </label>
                        <textarea
                            className="min-h-[88px] w-full resize-y rounded-lg border border-alloy-stone/30 bg-white px-3 py-2 text-[13px] text-alloy-midnight outline-none focus:border-alloy-bend-pine focus:ring-2 focus:ring-alloy-bend-pine/20"
                            value={controller.pasteText}
                            onChange={(e) => controller.setPasteText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!controller.analyzing && controller.pasteText.trim()) {
                                        controller.onAnalyze();
                                    }
                                }
                            }}
                            placeholder="Sarah Jones called about her daughter Emma…"
                            data-bos-command-session-composer="true"
                            disabled={controller.analyzing}
                        />
                        {controller.analyzeError ? (
                            <p className="text-[12px] text-red-700">{controller.analyzeError}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                                data-bos-command-session-analyze
                                data-bos-command-session-send
                                disabled={controller.analyzing || !controller.pasteText.trim()}
                                onClick={() => controller.onAnalyze()}
                            >
                                {controller.analyzing ? "Reading…" : "Send"}
                            </button>
                            {session.draft.values
                                .filter((v) => v.state === "inferred")
                                .map((v) => (
                                    <button
                                        key={v.fieldKey}
                                        type="button"
                                        className="rounded-md border border-alloy-bend-pine/40 bg-alloy-bend-pine/10 px-2.5 py-1 text-[11px] font-semibold text-alloy-bend-pine"
                                        data-bos-command-session-confirm-inferred={v.fieldKey}
                                        onClick={() => controller.onConfirmField(v.fieldKey)}
                                    >
                                        Confirm suggested {v.fieldKey.replace(/_/g, " ")}
                                    </button>
                                ))}
                        </div>
                        {session.draft.values.length > 0 ? (
                            <div className="rounded-lg border border-alloy-stone/25 bg-alloy-stone/[0.04] p-3" data-bos-command-session-evidence="true">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    Known details
                                </p>
                                <ul className="space-y-1.5">
                                    {session.draft.values.map((v) => (
                                        <li key={v.fieldKey} className="flex items-start justify-between gap-2 text-[12px]">
                                            <span className="text-alloy-midnight/80">
                                                <span className="font-medium">{v.fieldKey.replace(/_/g, " ")}</span>
                                                {": "}
                                                {String(v.value)}
                                            </span>
                                            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/55 ring-1 ring-alloy-stone/25">
                                                {evidenceLabel(v.state)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div data-bos-command-session-mode-body="form" className="min-h-0 space-y-3">
                        {controller.unsupportedHints.length > 0 ? (
                            <p
                                className="rounded-md border border-alloy-stone/25 bg-alloy-stone/[0.04] px-3 py-2 text-[12px] text-alloy-midnight/70"
                                data-bos-command-session-form-guidance="true"
                            >
                                Some fields need Form entry
                                {controller.unsupportedHints.length === 1
                                    ? `: ${controller.unsupportedHints[0]!.label}.`
                                    : ` (${controller.unsupportedHints.map((h) => h.label).join(", ")}).`}
                            </p>
                        ) : null}
                        <ActionWorkspaceGatherFields
                            sections={controller.sections}
                            values={controller.formValues}
                            onChange={controller.onFieldChange}
                            platformRequiredKeys={
                                controller.effectiveSpec?.requiredPayloadKeys?.length
                                    ? controller.effectiveSpec.requiredPayloadKeys
                                    : ["first_name", "last_name"]
                            }
                            fieldConfidence={controller.fieldConfidence}
                            layout="unified"
                            dataTestIdPrefix="bos-create-lead-form"
                        />
                    </div>
                )}
                    </>
                )}
            </div>

            {session.phase !== "processing_review" && session.phase !== "completed" ? (
            <div
                className="shrink-0 border-t border-alloy-stone/25 bg-alloy-stone/[0.04] px-3 py-2.5"
                data-bos-command-session-footer="true"
            >
                {session.phase === "failed" && session.recovery ? (
                    <p className="mb-2 text-[12px] text-red-700" data-bos-command-session-recovery="true">
                        {session.recovery.operatorMessage}
                    </p>
                ) : null}
                {session.phase === "executing" ? (
                    <p className="text-[12px] text-alloy-midnight/70">Continuing to Processing review…</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                    {session.phase !== "preview" &&
                    session.phase !== "confirming" &&
                    session.phase !== "executing" ? (
                        <button
                            type="button"
                            className="rounded-md bg-alloy-midnight px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                            data-bos-command-session-preview
                            disabled={!controller.resolution.readyForPreview && !controller.resolution.readyToExecute}
                            onClick={() => controller.onBuildPreview()}
                        >
                            Review
                        </button>
                    ) : null}
                    {session.phase === "preview" ? (
                        <button
                            type="button"
                            className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white"
                            data-bos-command-session-confirm
                            onClick={() => controller.onConfirmPreview()}
                        >
                            Continue to Processing review
                        </button>
                    ) : null}
                    {session.phase === "confirming" ? (
                        <button
                            type="button"
                            className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                            data-bos-command-session-execute
                            onClick={() => void controller.onExecute()}
                        >
                            Confirm
                        </button>
                    ) : null}
                    {(session.phase === "preview" || session.phase === "confirming" || session.phase === "failed") && (
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/30 px-3 py-1.5 text-[12px] font-semibold text-alloy-midnight/70"
                            data-bos-command-session-back-gather
                            onClick={() => ctx?.dispatch({ type: "SET_PHASE", phase: "gathering" })}
                        >
                            Back to details
                        </button>
                    )}
                </div>
            </div>
            ) : null}
        </div>
    );
}

function ModeTab(props: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={props.active}
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                props.active
                    ? "bg-white text-alloy-bend-pine shadow-sm"
                    : "text-alloy-midnight/60 hover:text-alloy-midnight"
            }`}
            data-bos-command-session-mode-tab={props.label.toLowerCase()}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}

function evidenceLabel(state: string): string {
    switch (state) {
        case "parsed_from_source":
            return "From your note";
        case "inferred":
            return "Suggested";
        case "operator_entered":
            return "Entered by you";
        case "confirmed":
            return "Confirmed";
        case "invalid":
            return "Invalid";
        default:
            return "Review";
    }
}
