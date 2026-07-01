/**
 * Intake Runtime Orchestration presentation (IC-5.7).
 * Guides operators through configure → distribute → test → operationalize without new schema.
 */

import {
    buildFormOutcomeConfigForLink,
    buildFormOutcomeConfigViewModel,
    type OutcomeStoryBullet,
} from "@/lib/forms/outcomeConfigPresentation";
import type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import {
    distributionIsPreviewLink,
    distributionLinkLabel,
    type DistributionLinkRow,
} from "@/lib/forms/distributionPresentation";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import {
    operationalIntentToIntakeType,
    readStoredOperationalIntent,
    resolveEffectiveOperationalIntent,
    shouldPreserveEnrollmentLeadInference,
    isOutcomeConfiguredForIntent,
} from "@/lib/forms/operationalIntentTemplates";
import { inferIntakeTypeFromLink, INTAKE_TYPE_CATALOG, type IntakeTypeKey } from "@/lib/forms/inferIntakeType";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import type { FormLifecycleRecordCreationGate } from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";

export type { IntakeTypeKey } from "@/lib/forms/inferIntakeType";
export { inferIntakeTypeFromLink } from "@/lib/forms/inferIntakeType";

export type OrchestrationStepKey = "purpose" | "outcome" | "share" | "test";

export type OrchestrationStepView = {
    key: OrchestrationStepKey;
    label: string;
    status: "complete" | "active" | "pending";
    hint: string;
};

export type RuntimeTestConfirmation = {
    headline: string;
    lines: string[];
    tone: "success" | "warning" | "neutral";
    opportunityId: string | null;
    reviewRequired: boolean;
    autoOperationalized: boolean;
    intakeConfigured: boolean;
};

export type IntakeRuntimeOrchestrationViewModel = {
    intakeType: IntakeTypeKey;
    intakeTypeLabel: string;
    intakeTypeDescription: string;
    steps: OrchestrationStepView[];
    activeRuntimeLinkId: string | null;
    activeRuntimeLabel: string | null;
    intakeEnabled: boolean;
    createsLead: boolean;
    requiresReview: boolean;
    /** True when the selected share link matches the stored operational intent. */
    linkOutcomeConfigured: boolean;
    linkSetupIncomplete: boolean;
    linkSetupIncompleteMessage: string | null;
    leadRoutingLocationLabel: string | null;
    leadRoutingWorkUnitLabel: string | null;
    leadRoutingStatusLabel: string | null;
    liveReady: boolean;
    lifecycleRecordGate: FormLifecycleRecordCreationGate | null;
    recordCreatingShareBlocked: boolean;
    recordCreatingShareBlockMessage: string | null;
    recordCreatingShareBlockButtonLabel: string | null;
    storyBullets: OutcomeStoryBullet[];
    routingSummary: string | null;
    runtimeMismatch: {
        title: string;
        body: string;
        lastSubmissionLinkId: string | null;
        lastSubmissionLinkLabel: string | null;
    } | null;
    lastTestConfirmation: RuntimeTestConfirmation | null;
    operationalChips: string[];
    workUnitHref: string | null;
    workUnitLabel: string | null;
};

export type RuntimeSubmissionSnapshot = {
    id: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    opportunity_id?: string | null;
    created_via_public_link_id?: string | null;
    payload?: { meta?: Record<string, unknown> };
};

const INTAKE_TYPE_CATALOG_LOCAL = INTAKE_TYPE_CATALOG;

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

export function resolveWorkUnitWorkspaceHref(
    departmentId: string | null | undefined,
    workUnitId: string | null | undefined,
    options?: { highlightQueueKey?: string | null; workUnitKey?: string | null }
): string | null {
    const dept = typeof departmentId === "string" ? departmentId.trim() : "";
    const wu = typeof workUnitId === "string" ? workUnitId.trim() : "";
    const wuKey = typeof options?.workUnitKey === "string" ? options.workUnitKey.trim() : "";
    const queueKey = typeof options?.highlightQueueKey === "string" ? options.highlightQueueKey.trim() : "";

    if (wuKey) {
        const base = operatorWorkUnitHrefFromKey(wuKey);
        return queueKey ? `${base}?primary_queue_key=${encodeURIComponent(queueKey)}` : base;
    }
    // TODO: thread workUnitKey through callers to avoid falling back to workspace root
    if (!dept || !wu) return null;
    return queueKey ? `/workspace?primary_queue_key=${encodeURIComponent(queueKey)}` : "/workspace";
}

function buildRoutingSummary(
    linkMetadata: Record<string, unknown>,
    labelCatalog: OutcomeRoutingLabelCatalog | null | undefined
): string | null {
    const model = buildFormOutcomeConfigForLink({
        formMetadata: {},
        link: { id: "x", is_active: true, created_at: "", metadata: linkMetadata },
        formKey: "form",
        documentGenerationConfigured: false,
        labelCatalog,
        activeOperationalLinkCount: 1,
        multipleActiveConfigs: false,
    });
    const destination = model.whenSubmittedStory.find((b) => b.text.startsWith("Route to"));
    return destination?.text.replace(/^Route to /, "") ?? null;
}

export function buildRuntimeTestConfirmation(
    submission: RuntimeSubmissionSnapshot | null | undefined
): RuntimeTestConfirmation | null {
    if (!submission || submission.status !== "submitted") return null;
    const meta = metaObject(submission.payload?.meta);
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    const autoOp = meta.intake_auto_operationalized === true;
    const needsReview = meta.intake_needs_review === true;
    const opportunityId =
        typeof submission.opportunity_id === "string" ? submission.opportunity_id.trim() || null : null;

    if (path === "skipped_intake_disabled" || path === "skipped_missing_config") {
        if (!opportunityId) {
            return {
                headline: "Submission saved — intake not configured on this public form",
                lines: [
                    "The response was captured, but this public form is not set up to create leads.",
                    "Choose the public form you shared with families and enable intake before testing again.",
                ],
                tone: "warning",
                opportunityId: null,
                reviewRequired: false,
                autoOperationalized: false,
                intakeConfigured: false,
            };
        }
    }

    const lines: string[] = [];
    if (opportunityId) lines.push("Lead created in enrollment pipeline");
    else if (needsReview) lines.push("Review required before enrollment continues");
    else if (autoOp) lines.push("Ready for staff — no review required");
    else lines.push("Submission captured");

    if (opportunityId) lines.push("Lead linked to this response");
    if (autoOp && !needsReview) lines.push("Appears in your operational workspace");

    let headline = "Test submission succeeded";
    let tone: RuntimeTestConfirmation["tone"] = "success";
    if (!opportunityId && (path === "skipped_intake_disabled" || path === "skipped_missing_config")) {
        headline = "Different public form was used";
        tone = "warning";
    } else if (needsReview) {
        headline = "Submission captured — review required";
        tone = "warning";
    } else if (autoOp && opportunityId) {
        headline = "It worked — new lead created";
        tone = "success";
    }

    return {
        headline,
        lines,
        tone,
        opportunityId,
        reviewRequired: needsReview,
        autoOperationalized: autoOp && !needsReview,
        intakeConfigured: path !== "skipped_intake_disabled" && path !== "skipped_missing_config",
    };
}

export function buildIntakeRuntimeOrchestrationViewModel(params: {
    formKey: string;
    formMetadata: Record<string, unknown> | null | undefined;
    links: DistributionLinkRow[];
    selectedLinkId: string | null;
    labelCatalog: OutcomeRoutingLabelCatalog | null | undefined;
    documentGenerationConfigured: boolean;
    hasPublished: boolean;
    latestSubmission: RuntimeSubmissionSnapshot | null;
    lifecycleRecordGate?: FormLifecycleRecordCreationGate | null;
}): IntakeRuntimeOrchestrationViewModel {
    const operationalLinks = params.links.filter((l) => !distributionIsPreviewLink(l));
    const selected =
        operationalLinks.find((l) => l.id === params.selectedLinkId) ??
        operationalLinks.find((l) => l.is_active) ??
        operationalLinks[0] ??
        null;

    const linkMeta = metaObject(selected?.metadata);
    const storedIntent = readStoredOperationalIntent(params.formMetadata);
    const effectiveIntent = resolveEffectiveOperationalIntent({
        formMetadata: params.formMetadata,
        linkMetadata: linkMeta,
        formKey: params.formKey,
    });
    const intakeType =
        storedIntent && storedIntent !== "custom" ?
            operationalIntentToIntakeType(storedIntent)
        : shouldPreserveEnrollmentLeadInference(params.formKey, storedIntent) ?
            inferIntakeTypeFromLink(linkMeta, params.formKey)
        : effectiveIntent ?
            operationalIntentToIntakeType(effectiveIntent)
        :   inferIntakeTypeFromLink(linkMeta, params.formKey);
    const typeInfo = INTAKE_TYPE_CATALOG_LOCAL[intakeType];
    const flags = parseIntakeAutoCreateFlags(linkMeta);
    const intakeEnabled = linkRequiresLeadCapture(linkMeta);
    const createsLead = flags.auto_create_opportunity && intakeEnabled;
    const storedIntentForOutcome = storedIntent ?? (effectiveIntent && effectiveIntent !== "custom" ? effectiveIntent : null);
    const linkOutcomeConfigured = isOutcomeConfiguredForIntent(linkMeta, storedIntentForOutcome);
    const linkSetupIncomplete = Boolean(storedIntentForOutcome && selected && !linkOutcomeConfigured);
    const linkSetupIncompleteMessage =
        linkSetupIncomplete ?
            "Setup incomplete — this share link will only save submissions."
        :   null;

    const linkModel =
        selected ?
            buildFormOutcomeConfigForLink({
                formMetadata: params.formMetadata,
                link: selected,
                formKey: params.formKey,
                documentGenerationConfigured: params.documentGenerationConfigured,
                labelCatalog: params.labelCatalog,
                activeOperationalLinkCount: operationalLinks.filter((l) => l.is_active).length,
                multipleActiveConfigs: buildFormOutcomeConfigViewModel({
                    formMetadata: params.formMetadata,
                    links: operationalLinks,
                    formKey: params.formKey,
                    documentGenerationConfigured: params.documentGenerationConfigured,
                    labelCatalog: params.labelCatalog,
                }).multipleActiveConfigs,
            })
        :   null;

    const storyBullets = linkModel?.whenSubmittedStory ?? [];
    const routingSummary = selected ? buildRoutingSummary(linkMeta, params.labelCatalog) : null;

    const workUnitId = typeof linkMeta.default_work_unit_id === "string" ? linkMeta.default_work_unit_id : null;
    const deptId = typeof linkMeta.default_department_id === "string" ? linkMeta.default_department_id : null;
    const workUnitLabel =
        workUnitId && params.labelCatalog?.workUnits?.[workUnitId] ?
            params.labelCatalog.workUnits[workUnitId]
        :   null;

    const lastSubLinkId =
        typeof params.latestSubmission?.created_via_public_link_id === "string" ?
            params.latestSubmission.created_via_public_link_id
        :   null;
    const lastSubLink =
        lastSubLinkId ? operationalLinks.find((l) => l.id === lastSubLinkId) ?? null : null;

    const runtimeMismatch =
        selected && lastSubLinkId && lastSubLinkId !== selected.id ?
            {
                title: "Last response came from a different public form",
                body: `Your latest test used “${distributionLinkLabel(lastSubLink ?? { id: lastSubLinkId, is_active: true, created_at: "", metadata: {} }, "another form")}”. Outcome settings below apply to “${distributionLinkLabel(selected, params.formKey)}” only.`,
                lastSubmissionLinkId: lastSubLinkId,
                lastSubmissionLinkLabel: lastSubLink ?
                    distributionLinkLabel(lastSubLink, params.formKey)
                :   null,
            }
        :   null;

    const lastTestConfirmation = buildRuntimeTestConfirmation(params.latestSubmission);

    const requiresReview =
        flags.auto_create_customer_member ||
        linkMeta.review_required === true ||
        linkMeta.review_mode === "always";

    const purposeComplete = Boolean(storedIntent ?? effectiveIntent) || intakeType !== "general";
    const outcomeComplete =
        linkOutcomeConfigured &&
        (createsLead || intakeType === "existing_family" || intakeType === "operational_document" || intakeType === "general");
    const shareComplete = !!selected?.is_active && (!storedIntentForOutcome || linkOutcomeConfigured);
    const lifecycleRecordGate = params.lifecycleRecordGate ?? null;
    const recordCreatingShareBlocked = Boolean(
        lifecycleRecordGate?.blocksRecordCreatingShare && createsLead
    );
    const baseLiveReady = shareComplete && outcomeComplete && !linkSetupIncomplete;
    const liveReady = baseLiveReady && !recordCreatingShareBlocked;
    const testComplete = lastTestConfirmation?.tone === "success" && (lastTestConfirmation.opportunityId || lastTestConfirmation.autoOperationalized);

    const locationId = typeof linkMeta.default_location_id === "string" ? linkMeta.default_location_id : null;
    const statusKey =
        typeof linkMeta.default_opportunity_status_key === "string" ? linkMeta.default_opportunity_status_key.trim() : null;
    const leadRoutingLocationLabel =
        locationId && params.labelCatalog?.locations?.[locationId] ? params.labelCatalog.locations[locationId] : null;
    const leadRoutingWorkUnitLabel = workUnitLabel;
    const leadRoutingStatusLabel =
        statusKey && params.labelCatalog?.opportunityStatusKeys?.[statusKey] ?
            params.labelCatalog.opportunityStatusKeys[statusKey]
        : statusKey ?
            statusKey.replace(/_/g, " ")
        :   null;

    const steps: OrchestrationStepView[] = [
        {
            key: "purpose",
            label: "Purpose",
            status: purposeComplete ? "complete" : params.hasPublished ? "active" : "pending",
            hint: typeInfo.label,
        },
        {
            key: "outcome",
            label: "After submit",
            status:
                linkSetupIncomplete ? "active"
                : outcomeComplete ? "complete"
                : purposeComplete ? "active"
                :   "pending",
            hint:
                linkSetupIncomplete ? "Setup incomplete"
                : createsLead && linkOutcomeConfigured ? "Creates lead"
                : intakeEnabled && linkOutcomeConfigured ? "Intake enabled"
                :   "Choose purpose above",
        },
        {
            key: "share",
            label: "Share form",
            status:
                recordCreatingShareBlocked ? "active"
                : linkSetupIncomplete && selected?.is_active ? "active"
                : shareComplete && liveReady ? "complete"
                : shareComplete ? "active"
                : outcomeComplete ? "active"
                :   "pending",
            hint:
                recordCreatingShareBlocked ?
                    lifecycleRecordGate?.shareBlockButtonLabel ?? "Add required fields first"
                : linkSetupIncomplete && selected?.is_active ? "Finish setup first"
                : selected?.is_active && linkOutcomeConfigured && liveReady ? "Link ready"
                : selected?.is_active && linkOutcomeConfigured ? "Finish lifecycle coverage"
                : selected ? "Finish intake setup"
                : recordCreatingShareBlocked ? "Add required fields first"
                :   "Get a share link",
        },
        {
            key: "test",
            label: "Preview / Test",
            status: testComplete ? "complete" : "pending",
            hint:
                testComplete ?
                    (lastTestConfirmation?.headline ?? "Test recorded")
                :   "Optional — creates real intake records",
        },
    ];

    const operationalChips: string[] = [];
    if (params.latestSubmission?.opportunity_id) operationalChips.push("Lead linked");
    if (lastTestConfirmation?.autoOperationalized) operationalChips.push("Auto-operationalized");
    if (lastTestConfirmation?.reviewRequired) operationalChips.push("Review required");
    if (routingSummary) operationalChips.push(`Routed · ${routingSummary}`);
    if (workUnitLabel) operationalChips.push(workUnitLabel);

    return {
        intakeType,
        intakeTypeLabel: typeInfo.label,
        intakeTypeDescription: typeInfo.description,
        steps,
        activeRuntimeLinkId: selected?.id ?? null,
        activeRuntimeLabel: selected ? distributionLinkLabel(selected, params.formKey) : null,
        intakeEnabled,
        createsLead: createsLead && linkOutcomeConfigured,
        requiresReview,
        linkOutcomeConfigured,
        linkSetupIncomplete,
        linkSetupIncompleteMessage,
        leadRoutingLocationLabel,
        leadRoutingWorkUnitLabel,
        leadRoutingStatusLabel,
        liveReady,
        lifecycleRecordGate,
        recordCreatingShareBlocked,
        recordCreatingShareBlockMessage: lifecycleRecordGate?.shareBlockMessage ?? null,
        recordCreatingShareBlockButtonLabel: lifecycleRecordGate?.shareBlockButtonLabel ?? null,
        storyBullets,
        routingSummary,
        runtimeMismatch,
        lastTestConfirmation,
        operationalChips,
        workUnitHref: resolveWorkUnitWorkspaceHref(deptId, workUnitId, {
            highlightQueueKey:
                intakeType === "enrollment_lead" || intakeType === "waitlist" ? "new_leads" : null,
        }),
        workUnitLabel,
    };
}
