"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { useBosCommandSessionOptional } from "@/contexts/BosCommandSessionContext";
import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";
import type { BosCommandMode, BosCommandSession } from "@/lib/bos/commandSession";
import { resolveBosCommandSessionLayoutDensity } from "@/lib/bos/commandSession/commandSessionLayout";
import {
    CREATE_LEAD_PASTE_EXAMPLES,
    buildReviewGroups,
    buildUnderstandingGroups,
    operationalSectionTitle,
    type UnderstandingGroup,
} from "@/lib/bos/commandSession/createLeadUnderstandingPresentation";
import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import { useCreateLeadBosSessionController } from "@/app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController";
import { opportunityIdFromAttempt } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { bosDraftToEligiblePayload } from "@/lib/bos/commandSession";
import { createLeadDisplayName } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import { resolveCreatedRecordProcessContextHref } from "@/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import {
    WS_ACTION_PRIMARY,
    WS_ACTION_SECONDARY,
    WS_EYEBROW,
    WS_FIELD,
} from "@/components/workspace/workspaceTokens";

const IdentityReviewPanel = dynamic(
    () => import("@/app/adminV2/processing/IdentityReviewPanel"),
    { ssr: false }
);

/**
 * BOS command-session host — Create Lead as an Alloy operational command surface.
 * Conversation and Form are two views of one draft; Review/Success reuse workspace primitives.
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
    const bosPresentation = useBosPresentationControllerOptional();
    const layoutDensity = resolveBosCommandSessionLayoutDensity(
        bosPresentation?.derivation.effective
    );
    const compact = layoutDensity === "compact";
    const controller = useCreateLeadBosSessionController(session);

    const setMode = (mode: BosCommandMode) => {
        if (!ctx || mode === session.mode) return;
        ctx.dispatch({ type: "SET_MODE", mode });
    };

    const operatorHasShared = session.draft.sourceTexts.length > 0 || session.draft.values.length > 0;
    const gatherPhase =
        session.phase === "acknowledged" ||
        session.phase === "gathering" ||
        session.phase === "failed";
    const reviewPhase = session.phase === "preview" || session.phase === "confirming";
    const showModeToggle = gatherPhase;

    const understandingGroups = useMemo(
        () =>
            buildUnderstandingGroups({
                draft: session.draft,
                gatherFields: controller.gatherFields,
            }),
        [controller.gatherFields, session.draft]
    );

    const reviewGroups = useMemo(
        () =>
            buildReviewGroups({
                draft: session.draft,
                gatherFields: controller.gatherFields,
                preview: session.preview,
            }),
        [controller.gatherFields, session.draft, session.preview]
    );

    const operationalSections = useMemo(
        () =>
            controller.sections.map((section) => ({
                ...section,
                label: operationalSectionTitle(section.key, section.label),
            })),
        [controller.sections]
    );

    const padX = compact ? "px-3" : "px-4";
    const bodyPad = compact ? "px-3 py-3" : "px-4 py-4";

    return (
        <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/15 ${WS_FIELD}`}
            data-bos-command-session-host="true"
            data-bos-command-session-phase={session.phase}
            data-bos-command-session-mode={session.mode}
            data-bos-command-session-layout={layoutDensity}
        >
            <header
                className={`flex shrink-0 items-center gap-2 border-b border-alloy-stone/25 bg-white ${
                    compact ? `${padX} py-2` : `${padX} py-2.5`
                }`}
                data-bos-command-session-header="true"
            >
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold tracking-tight text-alloy-midnight">
                        {session.invocation.displayLabel}
                    </p>
                    {!compact ? (
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                            Conversation and details stay on the same command
                        </p>
                    ) : null}
                </div>
                {showModeToggle ? (
                    <div
                        className="flex shrink-0 rounded-md border border-alloy-stone/30 bg-alloy-stone/5 p-0.5"
                        role="tablist"
                        aria-label="Command view"
                    >
                        <ModeTab
                            active={session.mode === "conversation"}
                            label="Conversation"
                            modeKey="conversation"
                            onClick={() => setMode("conversation")}
                        />
                        <ModeTab
                            active={session.mode === "form"}
                            label={compact ? "Details" : "Form"}
                            modeKey="form"
                            onClick={() => setMode("form")}
                        />
                    </div>
                ) : null}
            </header>

            <div
                className={`min-h-0 flex-1 overflow-y-auto ${bodyPad}`}
                data-bos-command-session-body="true"
            >
                {session.phase === "processing_review" && session.processingCaseId ? (
                    <ProcessingReviewBody
                        session={session}
                        onFail={(message) =>
                            ctx?.dispatch({
                                type: "FAIL",
                                recovery: {
                                    reason: "server",
                                    preserveDraft: true,
                                    operatorMessage: message,
                                },
                            })
                        }
                        onSuccess={(payload) => {
                            dispatchOpportunityQueueUpdated(payload.opportunityId, "create_lead");
                            ctx?.dispatch({
                                type: "EXECUTE_SUCCESS",
                                execution: {
                                    ok: true,
                                    executionKind: "processing_intake",
                                    opportunityId: payload.opportunityId,
                                    processingCaseId: session.processingCaseId ?? undefined,
                                    success: {
                                        createdRecordId: payload.opportunityId,
                                        focusPanelHref: payload.focusPanelHref,
                                        successCopy: payload.successCopy,
                                    },
                                },
                                phase: "completed",
                            });
                            ctx?.dispatch({
                                type: "COMPLETE",
                                successMessage: `${payload.successCopy} Open Lead when you want to continue.`,
                            });
                        }}
                    />
                ) : session.phase === "completed" ? (
                    <SuccessBody
                        session={session}
                        compact={compact}
                        onCreateAnother={() => {
                            ctx?.startSession(session.invocation);
                        }}
                        onReturn={() => ctx?.discardSession()}
                    />
                ) : reviewPhase ? (
                    <ReviewBody groups={reviewGroups} preview={session.preview} compact={compact} />
                ) : session.mode === "conversation" ? (
                    <ConversationBody
                        session={session}
                        compact={compact}
                        pasteText={controller.pasteText}
                        setPasteText={controller.setPasteText}
                        analyzing={controller.analyzing}
                        analyzeError={controller.analyzeError}
                        onAnalyze={controller.onAnalyze}
                        onConfirmField={controller.onConfirmField}
                        understandingGroups={understandingGroups}
                        blockers={
                            operatorHasShared
                                ? controller.resolution.blockers.map((b) => b.message)
                                : []
                        }
                        unsupportedHints={controller.unsupportedHints}
                    />
                ) : (
                    <FormBody
                        compact={compact}
                        sections={operationalSections}
                        formValues={controller.formValues}
                        onFieldChange={controller.onFieldChange}
                        platformRequiredKeys={
                            controller.effectiveSpec?.requiredPayloadKeys?.length
                                ? controller.effectiveSpec.requiredPayloadKeys
                                : ["first_name", "last_name"]
                        }
                        fieldConfidence={controller.fieldConfidence}
                        unsupportedHints={controller.unsupportedHints}
                    />
                )}
            </div>

            {session.phase !== "processing_review" && session.phase !== "completed" ? (
                <CommandFooter
                    session={session}
                    compact={compact}
                    canReview={
                        controller.resolution.readyForPreview || controller.resolution.readyToExecute
                    }
                    onReview={() => controller.onBuildPreview()}
                    onConfirmPreview={() => controller.onConfirmPreview()}
                    onExecute={() => void controller.onExecute()}
                    onBackGather={() => ctx?.dispatch({ type: "SET_PHASE", phase: "gathering" })}
                    onDiscard={() => ctx?.discardSession()}
                />
            ) : null}
        </div>
    );
}

function ConversationBody(props: {
    session: BosCommandSession;
    compact: boolean;
    pasteText: string;
    setPasteText: (v: string) => void;
    analyzing: boolean;
    analyzeError: string | null;
    onAnalyze: () => void;
    onConfirmField: (key: string) => void;
    understandingGroups: UnderstandingGroup[];
    blockers: string[];
    unsupportedHints: ReadonlyArray<{ label: string }>;
}) {
    const visibleMessages = props.session.messages.filter(
        (message) => message.kind !== "mode_switch"
    );
    const hasOperatorTurn = visibleMessages.some((m) => m.kind === "user_source");
    const showEmptyGuide = !hasOperatorTurn && props.understandingGroups.length === 0;

    return (
        <div
            data-bos-command-session-mode-body="conversation"
            className={`mx-auto flex w-full flex-col gap-4 ${props.compact ? "max-w-none" : "max-w-xl"}`}
        >
            {showEmptyGuide ? (
                <WorkspaceCard padded={!props.compact} data-bos-command-session-empty="true">
                    <p className={WS_EYEBROW}>Start here</p>
                    <p className="mt-1.5 text-[13px] font-semibold text-alloy-midnight">
                        Paste what you already have
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-alloy-midnight/55">
                        Drop an email, call note, website inquiry, voice transcript, or meeting notes.
                        BOS will summarize what it understands — nothing is created until you confirm.
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5" data-bos-command-session-paste-examples>
                        {CREATE_LEAD_PASTE_EXAMPLES.map((example) => (
                            <li
                                key={example}
                                className="rounded-md border border-alloy-stone/25 bg-alloy-stone/[0.04] px-2 py-1 text-[11px] font-medium text-alloy-midnight/65"
                            >
                                {example}
                            </li>
                        ))}
                    </ul>
                </WorkspaceCard>
            ) : (
                <ul
                    className={`space-y-2 ${props.compact ? "max-h-[32vh] overflow-y-auto" : ""}`}
                    data-bos-command-session-messages="true"
                >
                    {visibleMessages.map((message) => (
                        <li
                            key={message.id}
                            className={`whitespace-pre-wrap rounded-xl px-3 py-2.5 text-[13px] leading-snug ${
                                message.role === "operator"
                                    ? "ml-4 bg-alloy-bend-pine/10 text-alloy-midnight"
                                    : "mr-2 bg-white text-alloy-midnight/90 ring-1 ring-alloy-stone/20"
                            }`}
                            data-bos-command-session-message={message.kind}
                        >
                            {message.body}
                        </li>
                    ))}
                </ul>
            )}

            {props.understandingGroups.length > 0 ? (
                <UnderstandingStack
                    title="What BOS understands"
                    groups={props.understandingGroups}
                    testId="bos-command-session-evidence"
                />
            ) : null}

            {props.blockers.length > 0 ? (
                <div
                    className="rounded-xl border border-alloy-stone/25 bg-white px-3 py-2.5 text-[12px] text-alloy-midnight/70"
                    data-bos-command-session-resolution="true"
                >
                    <p className={WS_EYEBROW}>Still needed</p>
                    <p className="mt-1.5 leading-relaxed">
                        {props.blockers.map((b) => b.replace(/\.$/, "")).join(" · ")}
                    </p>
                </div>
            ) : null}

            {props.unsupportedHints.length > 0 && hasOperatorTurn ? (
                <p className="text-[12px] text-alloy-midnight/55" data-bos-command-session-form-guidance="true">
                    Some details are clearer in Form
                    {props.unsupportedHints.length === 1
                        ? `: ${props.unsupportedHints[0]!.label}.`
                        : ` (${props.unsupportedHints.map((h) => h.label).join(", ")}).`}
                </p>
            ) : null}

            {props.session.draft.values.some((v) => v.state === "inferred") ? (
                <div className="flex flex-wrap gap-2">
                    {props.session.draft.values
                        .filter((v) => v.state === "inferred")
                        .map((v) => (
                            <button
                                key={v.fieldKey}
                                type="button"
                                className={WS_ACTION_SECONDARY}
                                data-bos-command-session-confirm-inferred={v.fieldKey}
                                onClick={() => props.onConfirmField(v.fieldKey)}
                            >
                                Confirm suggested{" "}
                                {v.fieldKey.replace(/_/g, " ")}
                            </button>
                        ))}
                </div>
            ) : null}

            <WorkspaceCard padded className="space-y-2.5" data-bos-command-session-composer-card>
                <label className="block text-[12px] font-medium text-alloy-midnight/70">
                    {showEmptyGuide ? "Paste or type the inquiry" : "Add more detail"}
                </label>
                <textarea
                    className={`w-full resize-y rounded-xl border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-3 text-[13px] text-alloy-midnight placeholder:text-alloy-midnight/40 outline-none focus:border-[rgba(0,162,131,0.45)] focus:ring-2 focus:ring-[rgba(0,162,131,0.12)] disabled:opacity-60 ${
                        props.compact ? "min-h-[96px]" : "min-h-[112px]"
                    }`}
                    value={props.pasteText}
                    onChange={(e) => props.setPasteText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (!props.analyzing && props.pasteText.trim()) {
                                props.onAnalyze();
                            }
                        }
                    }}
                    placeholder={
                        showEmptyGuide
                            ? "Parent: Jordan Lee\nEmail: jordan@example.com\nChild: Riley — Toddler program…"
                            : "Add another note, correction, or missing detail…"
                    }
                    data-bos-command-session-composer="true"
                    disabled={props.analyzing}
                />
                {props.analyzeError ? (
                    <p className="text-[12px] text-red-700" role="alert">
                        {props.analyzeError}
                    </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className={`${WS_ACTION_PRIMARY} ${props.compact ? "min-h-[40px] px-4" : ""}`}
                        data-bos-command-session-analyze
                        data-bos-command-session-send
                        disabled={props.analyzing || !props.pasteText.trim()}
                        onClick={() => props.onAnalyze()}
                    >
                        {props.analyzing ? "Reading…" : "Send"}
                    </button>
                    <span className="text-[11px] text-alloy-midnight/45">
                        Enter to send · Shift+Enter for a new line
                    </span>
                </div>
            </WorkspaceCard>
        </div>
    );
}

function FormBody(props: {
    compact: boolean;
    sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }>;
    formValues: Record<string, string>;
    onFieldChange: (key: string, value: string) => void;
    platformRequiredKeys: readonly string[];
    fieldConfidence: Record<string, "high" | "medium" | "low" | "manual">;
    unsupportedHints: ReadonlyArray<{ label: string }>;
}) {
    return (
        <div
            data-bos-command-session-mode-body="form"
            className={`mx-auto w-full space-y-4 ${props.compact ? "max-w-none" : "max-w-2xl"}`}
        >
            {props.unsupportedHints.length > 0 ? (
                <p
                    className="rounded-xl border border-alloy-stone/25 bg-white px-3 py-2 text-[12px] text-alloy-midnight/70"
                    data-bos-command-session-form-guidance="true"
                >
                    Complete the details below
                    {props.unsupportedHints.length === 1
                        ? ` — especially ${props.unsupportedHints[0]!.label}.`
                        : "."}
                </p>
            ) : (
                <p className="text-[12px] text-alloy-midnight/55">
                    Same command as Conversation — edit any detail here.
                </p>
            )}
            <WorkspaceCard padded={!props.compact} data-bos-command-session-form-grid={props.compact ? "single" : "responsive"}>
                <ActionWorkspaceGatherFields
                    sections={props.sections}
                    values={props.formValues}
                    onChange={props.onFieldChange}
                    platformRequiredKeys={props.platformRequiredKeys}
                    fieldConfidence={props.fieldConfidence}
                    layout="sections"
                    fieldColumns={props.compact ? 1 : 2}
                    dataTestIdPrefix="bos-create-lead-form"
                />
            </WorkspaceCard>
        </div>
    );
}

function ReviewBody(props: {
    groups: UnderstandingGroup[];
    preview: BosCommandSession["preview"];
    compact: boolean;
}) {
    return (
        <div
            data-bos-command-session-review="true"
            className={`mx-auto w-full space-y-4 ${props.compact ? "max-w-none" : "max-w-xl"}`}
        >
            <div>
                <p className={WS_EYEBROW}>Review</p>
                <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-alloy-midnight">
                    {props.preview?.title ?? "What will be created"}
                </h2>
                <p className="mt-1 text-[12px] text-alloy-midnight/55">
                    Confirm operational understanding before Processing identity review.
                </p>
            </div>
            <UnderstandingStack
                title={null}
                groups={props.groups}
                testId="bos-command-session-review-groups"
            />
            {props.preview?.destination?.workUnitLabel || props.preview?.destination?.stageLabel ? (
                <WorkspaceCard padded>
                    <p className={WS_EYEBROW}>Destination</p>
                    <p className="mt-1.5 text-[13px] text-alloy-midnight">
                        {[props.preview.destination.workUnitLabel, props.preview.destination.stageLabel]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                </WorkspaceCard>
            ) : null}
        </div>
    );
}

function SuccessBody(props: {
    session: BosCommandSession;
    compact: boolean;
    onCreateAnother: () => void;
    onReturn: () => void;
}) {
    const success =
        props.session.execution && props.session.execution.ok ? props.session.execution.success : null;
    const href =
        success && typeof success === "object" && success !== null && "focusPanelHref" in success
            ? String((success as { focusPanelHref?: string }).focusPanelHref ?? "")
            : "";
    const copy =
        props.session.messages.filter((m) => m.kind === "success").at(-1)?.body ??
        (success && typeof success === "object" && success !== null && "successCopy" in success
            ? String((success as { successCopy?: string }).successCopy ?? "Lead created.")
            : "Lead created.");
    const processingCaseId =
        props.session.execution && props.session.execution.ok
            ? props.session.execution.processingCaseId
            : props.session.processingCaseId;

    return (
        <div
            data-bos-command-session-success="true"
            className={`mx-auto w-full space-y-4 ${props.compact ? "max-w-none" : "max-w-md"}`}
        >
            <WorkspaceCard padded>
                <p className={WS_EYEBROW}>Complete</p>
                <p className="mt-1.5 text-[15px] font-semibold text-alloy-midnight">{copy}</p>
                {processingCaseId ? (
                    <p className="mt-2 text-[12px] text-alloy-midnight/55">
                        Processing review finished — records were committed through identity.
                    </p>
                ) : (
                    <p className="mt-2 text-[12px] text-alloy-midnight/55">
                        Lead is ready in the workspace queue.
                    </p>
                )}
            </WorkspaceCard>
            <div className={`flex flex-col gap-2 ${props.compact ? "" : "sm:flex-row sm:flex-wrap"}`}>
                <a
                    href={href || undefined}
                    className={`${WS_ACTION_PRIMARY} inline-flex items-center justify-center ${
                        props.compact ? "min-h-[40px]" : ""
                    }`}
                    data-bos-command-session-open-lead
                    onClick={(event) => {
                        // Explicit Open Lead only — never auto-navigate on success.
                        if (!href) event.preventDefault();
                    }}
                >
                    Open Lead
                </a>
                <button
                    type="button"
                    className={`${WS_ACTION_SECONDARY} ${props.compact ? "min-h-[40px]" : ""}`}
                    data-bos-command-session-create-another
                    onClick={props.onCreateAnother}
                >
                    Create Another
                </button>
                <button
                    type="button"
                    className={`${WS_ACTION_SECONDARY} ${props.compact ? "min-h-[40px]" : ""}`}
                    data-bos-command-session-return-workspace
                    onClick={props.onReturn}
                >
                    Return to Workspace
                </button>
            </div>
        </div>
    );
}

function ProcessingReviewBody(props: {
    session: BosCommandSession;
    onFail: (message: string) => void;
    onSuccess: (payload: {
        opportunityId: string;
        focusPanelHref: string;
        successCopy: string;
    }) => void;
}) {
    return (
        <div data-bos-command-session-processing="true" className="space-y-3">
            <div>
                <p className={WS_EYEBROW}>Processing</p>
                <p className="mt-1 text-[13px] text-alloy-midnight/70">
                    Review identity matches, approve the commit plan, then explicitly commit to create
                    records.
                </p>
            </div>
            <IdentityReviewPanel
                caseId={props.session.processingCaseId!}
                onCommitted={({ operations }) => {
                    const opportunityId = opportunityIdFromAttempt(
                        operations.map((o) => ({
                            commandKey: o.commandKey ?? "",
                            recordId: o.recordId,
                            status: o.status,
                        }))
                    );
                    if (!opportunityId) {
                        props.onFail("Commit completed but no lead record id was returned.");
                        return;
                    }
                    const payload = bosDraftToEligiblePayload(props.session.draft);
                    const name = createLeadDisplayName(payload);
                    const successCopy = name ? `Created lead for ${name}.` : "Lead created.";
                    const focusPanelHref = resolveCreatedRecordProcessContextHref({
                        recordId: opportunityId,
                        workUnitKey: null,
                        workViewId: null,
                    });
                    props.onSuccess({ opportunityId, focusPanelHref, successCopy });
                }}
            />
        </div>
    );
}

function CommandFooter(props: {
    session: BosCommandSession;
    compact: boolean;
    canReview: boolean;
    onReview: () => void;
    onConfirmPreview: () => void;
    onExecute: () => void;
    onBackGather: () => void;
    onDiscard: () => void;
}) {
    const { session } = props;
    const touch = props.compact ? "min-h-[40px]" : "";

    return (
        <footer
            className={`sticky bottom-0 shrink-0 border-t border-alloy-stone/25 bg-white ${
                props.compact ? "px-3 py-3" : "px-4 py-3"
            }`}
            data-bos-command-session-footer="true"
        >
            {session.phase === "failed" && session.recovery ? (
                <p className="mb-2 text-[12px] text-red-700" data-bos-command-session-recovery="true">
                    {session.recovery.operatorMessage}
                </p>
            ) : null}
            {session.phase === "executing" ? (
                <p className="mb-2 text-[12px] text-alloy-midnight/70">
                    Continuing to Processing review…
                </p>
            ) : null}
            <div className={`flex flex-wrap items-center gap-2 ${props.compact ? "gap-2.5" : ""}`}>
                {session.phase !== "preview" &&
                session.phase !== "confirming" &&
                session.phase !== "executing" ? (
                    <button
                        type="button"
                        className={`${WS_ACTION_PRIMARY} ${touch}`}
                        data-bos-command-session-preview
                        disabled={!props.canReview}
                        onClick={props.onReview}
                    >
                        Review
                    </button>
                ) : null}
                {session.phase === "preview" ? (
                    <button
                        type="button"
                        className={`${WS_ACTION_PRIMARY} ${touch}`}
                        data-bos-command-session-confirm
                        onClick={props.onConfirmPreview}
                    >
                        Continue
                    </button>
                ) : null}
                {session.phase === "confirming" ? (
                    <button
                        type="button"
                        className={`${WS_ACTION_PRIMARY} ${touch}`}
                        data-bos-command-session-execute
                        onClick={props.onExecute}
                    >
                        Confirm
                    </button>
                ) : null}
                {(session.phase === "preview" ||
                    session.phase === "confirming" ||
                    session.phase === "failed") && (
                    <button
                        type="button"
                        className={`${WS_ACTION_SECONDARY} ${touch}`}
                        data-bos-command-session-back-gather
                        onClick={props.onBackGather}
                    >
                        Back to details
                    </button>
                )}
                <button
                    type="button"
                    className={`ml-auto text-[12px] font-semibold text-alloy-midnight/50 hover:text-alloy-midnight ${touch}`}
                    data-bos-command-session-discard
                    onClick={props.onDiscard}
                >
                    Discard command
                </button>
            </div>
        </footer>
    );
}

function UnderstandingStack(props: {
    title: string | null;
    groups: UnderstandingGroup[];
    testId: string;
}) {
    if (props.groups.length === 0) {
        return (
            <WorkspaceCard padded data-testid={props.testId}>
                <p className="text-[13px] text-alloy-midnight/55">No details mapped yet.</p>
            </WorkspaceCard>
        );
    }
    return (
        <div className="space-y-3" data-bos-command-session-evidence={props.testId === "bos-command-session-evidence" ? "true" : undefined} data-testid={props.testId}>
            {props.title ? <p className={WS_EYEBROW}>{props.title}</p> : null}
            {props.groups.map((group) => (
                <WorkspaceCard key={group.key} padded>
                    <p className="text-[13px] font-semibold text-alloy-midnight">{group.title}</p>
                    <ul className="mt-2.5 space-y-2">
                        {group.rows.map((row) => (
                            <li
                                key={`${group.key}-${row.label}-${row.value}`}
                                className="flex items-start justify-between gap-3 text-[12.5px]"
                            >
                                <span className="min-w-0">
                                    <span className="font-medium text-alloy-midnight/70">{row.label}</span>
                                    <span className="mt-0.5 block text-alloy-midnight">{row.value}</span>
                                </span>
                                {row.note ? (
                                    <span className="shrink-0 rounded-full bg-alloy-stone/[0.08] px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/55">
                                        {row.note}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </WorkspaceCard>
            ))}
        </div>
    );
}

function ModeTab(props: {
    active: boolean;
    label: string;
    modeKey: "conversation" | "form";
    onClick: () => void;
}) {
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
            data-bos-command-session-mode-tab={props.modeKey}
            onClick={props.onClick}
        >
            {props.label}
        </button>
    );
}
