"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import {
    TechnicalDetailDisclosure,
    TechnicalDetailMonospaceValue,
} from "@/components/forms/review";
import {
    distributionIsPreviewLink,
    distributionLinkLabel,
    type DistributionLinkRow,
} from "@/lib/forms/distributionPresentation";
import type { FormPublicLinkRow } from "@/components/forms/workspace/FormDistributionPanel";
import type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import {
    buildIntakeRuntimeOrchestrationViewModel,
    type RuntimeSubmissionSnapshot,
} from "@/lib/forms/intakeRuntimeOrchestrationPresentation";
import type { FormLifecycleRecordCreationGate } from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
import {
    buildAfterSubmitPreviewLines,
    resolveEffectiveOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import {
    buildEmbedOperatorNote,
    buildFormEmbedIframeSnippet,
} from "@/lib/forms/formSharePresentation";
import { FormOperationalIntentPicker } from "@/components/forms/admin/FormOperationalIntentPicker";
import { FormLifecycleUsagePanel } from "@/components/forms/admin/FormLifecycleUsagePanel";
import {
    readActiveRuntimeLinkId,
    readLinkEmbedUrl,
    writeActiveRuntimeLinkId,
} from "@/lib/forms/intakeRuntimeOrchestrationStorage";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import {
    FormLocationShareLinksPanel,
    type CreateLocationLinkInput,
} from "@/components/forms/admin/FormLocationShareLinksPanel";
import { SHARE_BY_LOCATION_COPY } from "@/lib/forms/shareByLocationPresentation";
import {
    opMetadata,
    opMutedMeta,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    formId: string;
    formKey: string;
    formName: string;
    formMetadata: Record<string, unknown> | null | undefined;
    links: FormPublicLinkRow[];
    documentGenerationConfigured: boolean;
    hasPublished: boolean;
    selectedLinkId: string | null;
    onSelectedLinkChange: (linkId: string) => void;
    createdOnceEmbedUrl: string | null;
    createdOnceLinkId: string | null;
    onCopy: (key: string, text: string) => void;
    copied: string | null;
    onRefreshSubmissions?: () => void;
    canMutate?: boolean;
    onFormMetadataUpdated?: (metadata: Record<string, unknown>) => void;
    onLinkMetadataSaved?: (linkId: string, metadata: Record<string, unknown>) => void;
    onCreateLink?: () => void;
    creatingLink?: boolean;
    onCreateLocationLink?: (input: CreateLocationLinkInput) => void | Promise<void>;
    creatingLocationLink?: boolean;
    locationLinkErr?: string | null;
    coverageRefreshKey?: string;
    recordCreationGate?: FormLifecycleRecordCreationGate;
    onLifecycleCoverageRefresh?: () => void;
};

/** Business-process-first intake setup rail (IC-8). Architecture unchanged — operator language only. */
export function FormIntakeRuntimeOrchestrationPanel({
    formId,
    formKey,
    formName,
    formMetadata,
    links,
    documentGenerationConfigured,
    hasPublished,
    selectedLinkId,
    onSelectedLinkChange,
    createdOnceEmbedUrl,
    createdOnceLinkId,
    onCopy,
    copied,
    onRefreshSubmissions,
    canMutate = false,
    onFormMetadataUpdated,
    onLinkMetadataSaved,
    onCreateLink,
    creatingLink = false,
    onCreateLocationLink,
    creatingLocationLink = false,
    locationLinkErr = null,
    coverageRefreshKey = "",
    recordCreationGate,
    onLifecycleCoverageRefresh,
}: Props) {
    const focusRecord = useOperatorRecordFocus();
    const [labelCatalog, setLabelCatalog] = useState<OutcomeRoutingLabelCatalog | null>(null);
    const [latestSubmission, setLatestSubmission] = useState<RuntimeSubmissionSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    const loadContext = useCallback(async () => {
        setLoading(true);
        try {
            const [labelsRes, subsRes] = await Promise.all([
                fetch(`/api/admin/forms/${encodeURIComponent(formId)}/outcome-labels`, { credentials: "include" }),
                fetch(
                    `/api/admin/forms/submissions?form_definition_id=${encodeURIComponent(formId)}&limit=1`,
                    { credentials: "include" }
                ),
            ]);
            const labelsJson = await labelsRes.json().catch(() => ({}));
            if (labelsRes.ok) {
                const data = (labelsJson as { data?: OutcomeRoutingLabelCatalog }).data;
                setLabelCatalog(data ?? null);
            }
            const subsJson = await subsRes.json().catch(() => ({}));
            if (subsRes.ok) {
                const rows = (subsJson as { data?: RuntimeSubmissionSnapshot[] }).data ?? [];
                setLatestSubmission(rows[0] ?? null);
            }
        } finally {
            setLoading(false);
        }
    }, [formId]);

    useEffect(() => {
        void loadContext();
    }, [loadContext]);

    useEffect(() => {
        if (!selectedLinkId) {
            const stored = readActiveRuntimeLinkId(formId);
            if (stored && links.some((l) => l.id === stored)) {
                onSelectedLinkChange(stored);
            }
        }
    }, [formId, links, onSelectedLinkChange, selectedLinkId]);

    const vm = useMemo(
        () =>
            buildIntakeRuntimeOrchestrationViewModel({
                formKey,
                formMetadata,
                links,
                selectedLinkId,
                labelCatalog,
                documentGenerationConfigured,
                hasPublished,
                latestSubmission,
                lifecycleRecordGate: recordCreationGate ?? null,
            }),
        [
            formKey,
            formMetadata,
            links,
            selectedLinkId,
            labelCatalog,
            documentGenerationConfigured,
            hasPublished,
            latestSubmission,
            recordCreationGate,
        ]
    );

    const shareCreationBlocked = vm.recordCreatingShareBlocked;
    const shareBlockButtonLabel = vm.recordCreatingShareBlockButtonLabel ?? "Add required fields first";

    const operationalLinks = links.filter((l) => !distributionIsPreviewLink(l));
    const selectedLink = operationalLinks.find((l) => l.id === vm.activeRuntimeLinkId) ?? null;

    const embedUrl = useMemo(() => {
        if (!vm.activeRuntimeLinkId) return null;
        if (createdOnceLinkId === vm.activeRuntimeLinkId && createdOnceEmbedUrl) return createdOnceEmbedUrl;
        return readLinkEmbedUrl(vm.activeRuntimeLinkId);
    }, [vm.activeRuntimeLinkId, createdOnceLinkId, createdOnceEmbedUrl]);

    const handleLinkChange = (linkId: string) => {
        writeActiveRuntimeLinkId(formId, linkId);
        onSelectedLinkChange(linkId);
    };

    // The created lead is worked in its own queue, not in an overlay on the form runtime.
    const openLead = (opportunityId: string) => {
        void focusRecord({ entity_type: "opportunities", entity_id: opportunityId });
    };

    const effectiveIntent = useMemo(
        () =>
            resolveEffectiveOperationalIntent({
                formMetadata,
                linkMetadata: selectedLink?.metadata ?? null,
                formKey,
            }),
        [formMetadata, selectedLink?.metadata, formKey]
    );

    const afterSubmitPreview = useMemo(
        () =>
            buildAfterSubmitPreviewLines({
                intent: effectiveIntent,
                storyBullets: vm.storyBullets,
            }),
        [effectiveIntent, vm.storyBullets]
    );

    const embedOperatorNote = useMemo(
        () => buildEmbedOperatorNote(effectiveIntent),
        [effectiveIntent]
    );

    const embedSnippet = useMemo(
        () => (embedUrl ? buildFormEmbedIframeSnippet(embedUrl, vm.activeRuntimeLabel ?? "Form") : null),
        [embedUrl, vm.activeRuntimeLabel]
    );

    return (
        <div
            className="rounded-xl bg-gradient-to-br from-alloy-stone/[0.08] via-white to-alloy-bend-pine/[0.04] px-4 py-3.5 ring-1 ring-alloy-midnight/[0.08]"
            data-testid="form-intake-runtime-orchestration"
            id="lifecycle-orchestration"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className={opSectionTitle}>Form setup</h2>
                    <p className={opMutedMeta}>
                        Choose what this form does, confirm where inquiries go, then share it with families.
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {vm.liveReady ?
                        <StatusBadge label="Live" variant="success" />
                    : shareCreationBlocked ?
                        <StatusBadge label="Missing required fields" variant="warning" />
                    : recordCreationGate?.readiness === "ready_with_recommended_gaps" ?
                        <StatusBadge label="Ready · recommended gaps" variant="info" />
                    : recordCreationGate?.readiness === "not_configured" && recordCreationGate.applies ?
                        <StatusBadge label="Coverage not configured" variant="neutral" />
                    : vm.linkSetupIncomplete ?
                        <StatusBadge label="Setup incomplete" variant="warning" />
                    : hasPublished ?
                        <StatusBadge label="Ready to share" variant="info" />
                    :   <StatusBadge label="Not published" variant="neutral" />}
                </div>
            </div>

            {shareCreationBlocked && vm.recordCreatingShareBlockMessage ?
                <p
                    className="mt-2 rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.06] px-3 py-2 text-sm text-alloy-ember"
                    data-testid="lifecycle-record-share-block-banner"
                >
                    {vm.recordCreatingShareBlockMessage}
                </p>
            : recordCreationGate?.readiness === "ready_with_recommended_gaps" ?
                <p className="mt-2 rounded-lg border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.06] px-3 py-2 text-sm text-alloy-midnight" data-testid="lifecycle-record-share-recommended-banner">
                    {recordCreationGate.setupHeadline}
                </p>
            : recordCreationGate?.readiness === "not_configured" && recordCreationGate.applies ?
                <p className={clsx("mt-2 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] px-3 py-2 text-sm", opMetadata)} data-testid="lifecycle-record-share-not-configured">
                    {recordCreationGate.setupMessage}
                </p>
            :   null}

            {vm.linkSetupIncompleteMessage ?
                <p className="mt-2 rounded-lg border border-alloy-ember/25 bg-alloy-ember/[0.06] px-3 py-2 text-sm text-alloy-ember" data-testid="link-setup-incomplete-banner">
                    {vm.linkSetupIncompleteMessage}
                </p>
            :   null}

            {onFormMetadataUpdated ?
                <div className="mt-3" data-testid="orchestration-purpose">
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">Purpose</p>
                    <FormOperationalIntentPicker
                        formId={formId}
                        formKey={formKey}
                        formMetadata={formMetadata}
                        selectedLinkId={vm.activeRuntimeLinkId}
                        selectedLinkMetadata={selectedLink?.metadata ?? null}
                        canMutate={canMutate}
                        hasOperationalLink={operationalLinks.length > 0}
                        onFormMetadataUpdated={onFormMetadataUpdated}
                        onLinkMetadataSaved={onLinkMetadataSaved}
                        onCreateLink={onCreateLink}
                        creatingLink={creatingLink}
                        shareCreationBlocked={shareCreationBlocked}
                        shareBlockButtonLabel={shareBlockButtonLabel}
                    />
                </div>
            :   null}

            {vm.createsLead && (vm.leadRoutingLocationLabel || vm.leadRoutingStatusLabel) ?
                <div
                    className="mt-3 rounded-lg bg-white/90 px-3 py-2 ring-1 ring-alloy-midnight/[0.06]"
                    data-testid="orchestration-lead-routing"
                >
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">Lead routing</p>
                    <dl className={clsx("mt-1.5 space-y-1", opMetadata)}>
                        {vm.leadRoutingLocationLabel ?
                            <div className="flex flex-wrap gap-x-2">
                                <dt className="font-medium text-alloy-midnight/75">School:</dt>
                                <dd>{vm.leadRoutingLocationLabel}</dd>
                            </div>
                        :   null}
                        {vm.leadRoutingStatusLabel ?
                            <div className="flex flex-wrap gap-x-2">
                                <dt className="font-medium text-alloy-midnight/75">Status:</dt>
                                <dd>{vm.leadRoutingStatusLabel}</dd>
                            </div>
                        :   null}
                    </dl>
                </div>
            :   null}

            {onFormMetadataUpdated ?
                <FormLifecycleUsagePanel
                    formId={formId}
                    formMetadata={formMetadata}
                    canMutate={canMutate}
                    hasSchema={hasPublished}
                    coverageRefreshKey={coverageRefreshKey}
                    onFormMetadataUpdated={onFormMetadataUpdated}
                    onCoverageSaved={onLifecycleCoverageRefresh}
                />
            :   null}

            <div className="mt-3 space-y-3">
                <div
                    className="rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]"
                    data-testid="active-runtime-card"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                            Share
                        </p>
                        {selectedLink?.is_active ?
                            <StatusBadge label="Live" variant="success" />
                        :   selectedLink ?
                            <StatusBadge label="Inactive" variant="neutral" />
                        :   null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-alloy-midnight">
                        {vm.activeRuntimeLabel ?? "No share link yet"}
                    </p>

                    {operationalLinks.length > 1 ?
                        <label className="mt-2 block space-y-1">
                            <span className="text-xs font-medium text-alloy-midnight">Active share link</span>
                            <select
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm shadow-sm"
                                value={vm.activeRuntimeLinkId ?? ""}
                                data-testid="orchestration-runtime-link-select"
                                onChange={(e) => handleLinkChange(e.target.value)}
                            >
                                {operationalLinks.map((link) => (
                                    <option key={link.id} value={link.id}>
                                        {distributionLinkLabel(link, formKey)}
                                        {link.is_active ? "" : " (inactive)"}
                                    </option>
                                ))}
                            </select>
                        </label>
                    : operationalLinks.length === 0 ?
                        <div className="mt-2 flex flex-wrap gap-2">
                            <p className={clsx("w-full", opMetadata)}>
                                {hasPublished ?
                                    "Get a share link to send this form to families."
                                :   "Publish your form before creating a share link."}
                            </p>
                            {canMutate && onCreateLink && hasPublished ?
                                <button
                                    type="button"
                                    className={intakeWorkspaceBtnPrimary}
                                    disabled={creatingLink || shareCreationBlocked}
                                    data-testid="orchestration-create-share-link"
                                    title={shareCreationBlocked ? vm.recordCreatingShareBlockMessage ?? undefined : undefined}
                                    onClick={onCreateLink}
                                >
                                    {creatingLink ?
                                        "Creating…"
                                    : shareCreationBlocked ?
                                        shareBlockButtonLabel
                                    :   "Get share link"}
                                </button>
                            :   null}
                        </div>
                    :   null}

                    {operationalLinks.length > 1 || selectedLink?.token_prefix || vm.runtimeMismatch ?
                        <TechnicalDetailDisclosure title="Advanced link settings" helperText="Multiple links or debug details">
                            {operationalLinks.length > 1 ?
                                <p className={opMutedMeta}>Switch share links above when different programs need different outcomes.</p>
                            :   null}
                            {selectedLink?.token_prefix ?
                                <p className={opMutedMeta} data-testid="runtime-embed-token-prefix">
                                    Token prefix ·{" "}
                                    <TechnicalDetailMonospaceValue>{selectedLink.token_prefix}…</TechnicalDetailMonospaceValue>
                                </p>
                            :   null}
                            {vm.runtimeMismatch ?
                                <div className="mt-2" data-testid="runtime-mismatch-warning">
                                    <p className="text-xs font-semibold text-alloy-ember">{vm.runtimeMismatch.title}</p>
                                    <p className={clsx("mt-0.5 text-xs leading-snug", opMetadata)}>{vm.runtimeMismatch.body}</p>
                                    {vm.runtimeMismatch.lastSubmissionLinkId ?
                                        <button
                                            type="button"
                                            className="mt-1.5 text-xs font-semibold text-alloy-bend-pine hover:underline"
                                            data-testid="runtime-switch-to-last-submission-link"
                                            onClick={() => handleLinkChange(vm.runtimeMismatch!.lastSubmissionLinkId!)}
                                        >
                                            Switch to the form that was actually used
                                        </button>
                                    :   null}
                                </div>
                            :   null}
                        </TechnicalDetailDisclosure>
                    :   null}

                    <div className="mt-2 flex flex-wrap gap-2">
                        {hasPublished && embedUrl ?
                            <>
                                <a
                                    href={embedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={intakeWorkspaceBtnPrimary}
                                    data-testid="orchestration-open-embed"
                                >
                                    Preview form
                                </a>
                                <button
                                    type="button"
                                    className={intakeWorkspaceBtnSecondary}
                                    data-testid="orchestration-copy-public-link"
                                    onClick={() => onCopy("orchestration-embed", embedUrl)}
                                >
                                    {copied === "orchestration-embed" ? "Copied" : "Copy link"}
                                </button>
                            </>
                        : !hasPublished ?
                            <p className={clsx("w-full text-sm", opMetadata)} data-testid="orchestration-publish-first-hint">
                                Publish your form before opening or sharing the public link.
                            </p>
                        :   null}
                    </div>

                    {hasPublished && embedUrl && embedSnippet ?
                        <TechnicalDetailDisclosure
                            title="Embed on website"
                            helperText="Copy embed code for your site"
                        >
                            <p className={opMutedMeta} data-testid="orchestration-embed-note">
                                {embedOperatorNote}
                            </p>
                            <div className="mt-2">
                                <code
                                    className="block max-h-28 overflow-auto break-all rounded bg-alloy-stone/10 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-alloy-midnight/85"
                                    data-testid="orchestration-embed-snippet"
                                >
                                    {embedSnippet}
                                </code>
                                <button
                                    type="button"
                                    className="mt-2 text-xs font-semibold text-alloy-bend-pine hover:underline"
                                    data-testid="orchestration-copy-embed-code"
                                    onClick={() => onCopy("orchestration-embed-code", embedSnippet)}
                                >
                                    {copied === "orchestration-embed-code" ? "Copied embed code" : "Copy embed code"}
                                </button>
                            </div>
                        </TechnicalDetailDisclosure>
                    :   null}

                    {onCreateLocationLink ?
                        <div className="mt-4 border-t border-alloy-midnight/[0.06] pt-3" data-testid="orchestration-location-links">
                            <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                                {SHARE_BY_LOCATION_COPY.sectionTitle}
                            </p>
                            <FormLocationShareLinksPanel
                                formId={formId}
                                formName={formName}
                                links={links}
                                hasPublished={hasPublished}
                                canMutate={canMutate}
                                creating={creatingLocationLink}
                                createErr={locationLinkErr}
                                copied={copied}
                                onCopy={onCopy}
                                onCreateLocationLink={onCreateLocationLink}
                                shareCreationBlocked={shareCreationBlocked}
                                shareBlockButtonLabel={shareBlockButtonLabel}
                                shareBlockMessage={vm.recordCreatingShareBlockMessage}
                            />
                        </div>
                    :   null}
                </div>

                <TechnicalDetailDisclosure title="Optional preview / test" helperText="Try a submission before going live">
                    <div className="mt-2" data-testid="orchestration-after-submit-preview">
                        <p className="text-xs font-semibold text-alloy-midnight/70">What happens after submit</p>
                        <ul className={clsx("mt-1 space-y-0.5", opMetadata)}>
                            {afterSubmitPreview.map((line) => (
                                <li key={line}>· {line}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="mt-3" data-testid="runtime-test-confirmation">
                        <p className={clsx("mt-1", opMutedMeta)} data-testid="orchestration-test-warning">
                            Testing is optional. Submitting a test creates real intake records in this environment.
                        </p>
                        {loading ?
                            <p className={clsx("mt-2", opMetadata)}>Loading latest submission…</p>
                        : vm.lastTestConfirmation ?
                            <>
                                <p
                                    className={clsx(
                                        "mt-1 text-sm font-semibold",
                                        vm.lastTestConfirmation.tone === "success" ? "text-alloy-bend-pine"
                                        : vm.lastTestConfirmation.tone === "warning" ? "text-alloy-ember"
                                        : "text-alloy-midnight"
                                    )}
                                >
                                    {vm.lastTestConfirmation.headline}
                                </p>
                                <ul className={clsx("mt-1.5 space-y-0.5", opMetadata)}>
                                    {vm.lastTestConfirmation.lines.map((line) => (
                                        <li key={line}>· {line}</li>
                                    ))}
                                </ul>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {vm.lastTestConfirmation.opportunityId ?
                                        <button
                                            type="button"
                                            className={intakeWorkspaceBtnPrimary}
                                            data-testid="orchestration-open-lead"
                                            onClick={() => openLead(vm.lastTestConfirmation!.opportunityId!)}
                                        >
                                            Open lead
                                        </button>
                                    :   null}
                                    {vm.workUnitHref ?
                                        <Link href={vm.workUnitHref} className={intakeWorkspaceBtnSecondary}>
                                            View in {vm.workUnitLabel ?? "pipeline"}
                                        </Link>
                                    :   null}
                                    {hasPublished ?
                                        <button
                                            type="button"
                                            className={intakeWorkspaceBtnSecondary}
                                            data-testid="orchestration-refresh-test"
                                            disabled={loading}
                                            onClick={() => {
                                                void loadContext();
                                                onRefreshSubmissions?.();
                                            }}
                                        >
                                            Refresh test result
                                        </button>
                                    :   null}
                                </div>
                            </>
                        :   <p className={clsx("mt-2", opMetadata)}>
                                No test submissions yet. You can go live without testing — use Preview form above if you want to try it.
                            </p>}
                    </div>
                </TechnicalDetailDisclosure>
            </div>
        </div>
    );
}
