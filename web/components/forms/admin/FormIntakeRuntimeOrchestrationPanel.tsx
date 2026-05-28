"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
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
import {
    buildAfterSubmitPreviewLines,
    resolveEffectiveOperationalIntent,
} from "@/lib/forms/operationalIntentTemplates";
import {
    buildEmbedOperatorNote,
    buildFormEmbedIframeSnippet,
    resolveFormShareHint,
} from "@/lib/forms/formSharePresentation";
import { FormOperationalIntentPicker } from "@/components/forms/admin/FormOperationalIntentPicker";
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
    opMetadata,
    opMutedMeta,
    opSectionTitle,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    formId: string;
    formKey: string;
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
};

function stepStatusClass(status: "complete" | "active" | "pending"): string {
    if (status === "complete") return "bg-emerald-50 text-emerald-800 ring-emerald-200/80";
    if (status === "active") return "bg-alloy-blue/10 text-alloy-midnight ring-alloy-blue/25";
    return "bg-alloy-stone/20 text-alloy-midnight/55 ring-alloy-midnight/[0.06]";
}

/** Business-process-first intake setup rail (IC-8). Architecture unchanged — operator language only. */
export function FormIntakeRuntimeOrchestrationPanel({
    formId,
    formKey,
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
}: Props) {
    const { openDrawer } = useAdminDrawer();
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
        ]
    );

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

    const openLead = (opportunityId: string) => {
        openDrawer({ type: "opportunities", id: opportunityId, opportunityWorkspaceContext: null });
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

    const shareHint = useMemo(
        () => resolveFormShareHint(effectiveIntent),
        [effectiveIntent]
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
            className="rounded-xl bg-gradient-to-br from-alloy-stone/[0.08] via-white to-alloy-blue/[0.04] px-4 py-3.5 ring-1 ring-alloy-midnight/[0.08]"
            data-testid="form-intake-runtime-orchestration"
            id="lifecycle-orchestration"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className={opSectionTitle}>Setup this form</h2>
                    <p className={opMutedMeta}>
                        Choose what this form does, review what happens after submit, then share it with families.
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    <StatusBadge label={vm.intakeTypeLabel} variant="info" />
                    {vm.intakeEnabled ?
                        <StatusBadge label="Intake active" variant="success" />
                    :   <StatusBadge label="Intake not set up" variant="warning" />}
                    {vm.createsLead ?
                        <StatusBadge label="Creates lead" variant="info" />
                    :   null}
                    {vm.requiresReview ?
                        <StatusBadge label="Review required" variant="warning" />
                    :   null}
                </div>
            </div>

            <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="orchestration-step-rail">
                {vm.steps.map((step) => (
                    <li
                        key={step.key}
                        className={clsx("rounded-lg px-3 py-2 ring-1", stepStatusClass(step.status))}
                        data-testid={`orchestration-step-${step.key}`}
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{step.label}</p>
                        <p className="mt-0.5 text-xs font-medium leading-snug">{step.hint}</p>
                    </li>
                ))}
            </ol>

            {onFormMetadataUpdated ?
                <div className="mt-3">
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
                    />
                </div>
            :   null}

            <div
                className="mt-3 rounded-lg bg-white/90 px-3 py-2 ring-1 ring-alloy-midnight/[0.06]"
                data-testid="orchestration-after-submit-preview"
            >
                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">After submission</p>
                <ul className={clsx("mt-1.5 space-y-0.5", opMetadata)}>
                    {afterSubmitPreview.map((line) => (
                        <li key={line}>· {line}</li>
                    ))}
                </ul>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div
                    className="rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]"
                    data-testid="active-runtime-card"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                            Share form
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
                    <p className={clsx("mt-0.5", opMutedMeta)}>{vm.intakeTypeDescription}</p>
                    <p className={clsx("mt-1.5", opMetadata)} data-testid="orchestration-share-hint">
                        {shareHint}
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
                            <p className={clsx("w-full", opMetadata)}>Get a share link to send this form to families.</p>
                            {canMutate && onCreateLink ?
                                <button
                                    type="button"
                                    className={intakeWorkspaceBtnPrimary}
                                    disabled={creatingLink}
                                    data-testid="orchestration-create-share-link"
                                    onClick={onCreateLink}
                                >
                                    {creatingLink ? "Creating…" : "Get share link"}
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
                                    <p className="text-xs font-semibold text-amber-900">{vm.runtimeMismatch.title}</p>
                                    <p className={clsx("mt-0.5 text-xs leading-snug", opMetadata)}>{vm.runtimeMismatch.body}</p>
                                    {vm.runtimeMismatch.lastSubmissionLinkId ?
                                        <button
                                            type="button"
                                            className="mt-1.5 text-xs font-semibold text-alloy-blue hover:underline"
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
                        {embedUrl ?
                            <>
                                <a
                                    href={embedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={intakeWorkspaceBtnPrimary}
                                    data-testid="orchestration-open-embed"
                                >
                                    Open form
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
                        :   null}
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
                    </div>

                    {embedUrl && embedSnippet ?
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
                                    className="mt-2 text-xs font-semibold text-alloy-blue hover:underline"
                                    data-testid="orchestration-copy-embed-code"
                                    onClick={() => onCopy("orchestration-embed-code", embedSnippet)}
                                >
                                    {copied === "orchestration-embed-code" ? "Copied embed code" : "Copy embed code"}
                                </button>
                            </div>
                        </TechnicalDetailDisclosure>
                    :   null}
                </div>

                <div
                    className="rounded-lg bg-white/95 px-3 py-2.5 ring-1 ring-alloy-midnight/[0.07]"
                    data-testid="runtime-test-confirmation"
                >
                    <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/65">
                        After submit
                    </p>
                    {loading ?
                        <p className={clsx("mt-2", opMetadata)}>Loading latest submission…</p>
                    : vm.lastTestConfirmation ?
                        <>
                            <p
                                className={clsx(
                                    "mt-1 text-sm font-semibold",
                                    vm.lastTestConfirmation.tone === "success" ? "text-emerald-800"
                                    : vm.lastTestConfirmation.tone === "warning" ? "text-amber-900"
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
                            </div>
                        </>
                    :   <p className={clsx("mt-2", opMetadata)}>
                            No submitted responses yet. Open the form, submit a test, then refresh.
                        </p>}
                </div>
            </div>
        </div>
    );
}
