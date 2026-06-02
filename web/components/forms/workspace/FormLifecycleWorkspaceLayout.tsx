"use client";

import clsx from "clsx";
import Link from "next/link";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    TechnicalDetailDisclosure,
    TechnicalDetailField,
    TechnicalDetailFieldList,
    TechnicalDetailMonospaceValue,
} from "@/components/forms/review";
import {
    FormDistributionPanel,
    type CreatedLinkPayload,
    type FormPublicLinkRow,
} from "@/components/forms/workspace/FormDistributionPanel";
import { FormIntakePreviewPanel } from "@/components/forms/workspace/FormIntakePreviewPanel";
import { FormLifecycleRail } from "@/components/forms/workspace/FormLifecycleRail";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import type { FormLifecycleStepView } from "@/lib/forms/formLifecyclePresentation";
import { FORM_LIFECYCLE_ANCHORS } from "@/lib/forms/formLifecyclePresentation";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";
import { readStoredOperationalIntent } from "@/lib/forms/operationalIntentTemplates";
import FormSchemaWorkspace from "@/app/admin/forms/FormSchemaWorkspace";
import { FormOutcomeConfigPanel } from "@/components/forms/admin/FormOutcomeConfigPanel";
import { FormExistingRecordSendPanel } from "@/components/forms/admin/FormExistingRecordSendPanel";
import { FormIntakeRuntimeOrchestrationPanel } from "@/components/forms/admin/FormIntakeRuntimeOrchestrationPanel";
import { FormPacketContextPanel } from "@/components/forms/admin/FormPacketContextPanel";
import {
    opGroupedRowInner,
    opGroupedSurface,
    opInsightSupport,
    opMetadata,
    opOrientationSurface,
    opRegionSeparator,
} from "@/lib/operational/ui/operationalVisualTokens";

type VersionRow = {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
    created_at: string;
    updated_at: string | null;
};

type FormDetailSlice = {
    id: string;
    key: string;
    name: string;
    kind: string;
    is_active: boolean;
    metadata?: Record<string, unknown>;
    versions: VersionRow[];
};

type OperatorGuideContent = {
    purpose: string;
    whoCompletes: string;
    afterSubmission: string;
    connectedBullets: { id: string; text: string }[];
};

type Props = {
    formId: string;
    detail: FormDetailSlice;
    viewerTz: string;
    canMutate: boolean;
    publishSummary: string;
    publishTone: "success" | "info" | "neutral";
    purposeLine: string | null;
    lifecycleSteps: FormLifecycleStepView[];
    submissionCount: number;
    documentGenerationConfigured: boolean;
    links: FormPublicLinkRow[];
    creating: boolean;
    createErr: string | null;
    createdOnce: CreatedLinkPayload | null;
    copied: string | null;
    copyWarn: string | null;
    previewBusy: boolean;
    previewErr: string | null;
    hasPublished: boolean;
    latestPublished: VersionRow | undefined;
    operatorGuide: OperatorGuideContent;
    onPreview: () => void;
    onCreateLink: () => void;
    onCreateLocationLink?: (input: { locationId: string; locationName: string }) => void;
    creatingLocationLink?: boolean;
    locationLinkErr?: string | null;
    onCopy: (key: string, text: string) => void;
    onVersionsUpdated: () => void;
    onLinkMetadataSaved?: (linkId: string, metadata: Record<string, unknown>) => void;
    selectedRuntimeLinkId: string | null;
    onSelectedRuntimeLinkChange: (linkId: string) => void;
    createdOnceLinkId: string | null;
    openPublicEmbedUrl: string | null;
    onFormMetadataUpdated?: (metadata: Record<string, unknown>) => void;
};

/** Loaded-state lifecycle workspace layout (OW-3). */
export function FormLifecycleWorkspaceLayout({
    formId,
    detail,
    viewerTz,
    canMutate,
    publishSummary,
    publishTone,
    purposeLine,
    lifecycleSteps,
    submissionCount,
    documentGenerationConfigured,
    links,
    creating,
    createErr,
    createdOnce,
    copied,
    copyWarn,
    previewBusy,
    previewErr,
    hasPublished,
    latestPublished,
    operatorGuide,
    onPreview,
    onCreateLink,
    onCreateLocationLink,
    creatingLocationLink = false,
    locationLinkErr = null,
    onCopy,
    onVersionsUpdated,
    onLinkMetadataSaved,
    selectedRuntimeLinkId,
    onSelectedRuntimeLinkChange,
    createdOnceLinkId,
    openPublicEmbedUrl,
    onFormMetadataUpdated,
}: Props) {
    const submissionsHref = `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`;
    const storedIntent = readStoredOperationalIntent(detail.metadata);
    const showPacketPanel = storedIntent === "packet_step";
    const showExistingRecordSend = storedIntent === "existing_family";
    const coverageRefreshKey = detail.versions.map((v) => `${v.id}:${v.updated_at ?? v.created_at}`).join("|");

    return (
        <>
            <div className={opOrientationSurface} data-testid="form-lifecycle-orientation">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <FormsReviewBadge label={publishSummary} tone={publishTone} />
                        {purposeLine ?
                            <span className={clsx("max-w-md truncate", opMetadata)}>{purposeLine}</span>
                        :   null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            className={intakeWorkspaceBtnSecondary}
                            onClick={onPreview}
                            disabled={previewBusy || creating || !canMutate || !hasPublished}
                            data-testid="form-action-preview"
                        >
                            {previewBusy ? "Opening…" : "Preview fields"}
                        </button>
                        <Link href={submissionsHref} className={intakeWorkspaceBtnSecondary} data-testid="form-action-submissions">
                            Submissions{submissionCount > 0 ? ` (${submissionCount})` : ""}
                        </Link>
                    </div>
                </div>
                {previewErr ?
                    <p className="mt-1.5 text-sm text-alloy-ember">{previewErr}</p>
                : !hasPublished ?
                    <p className={clsx("mt-1.5", opMetadata)}>Publish your form before sharing it with families.</p>
                :   null}
            </div>

            <div className="mt-4 space-y-4" data-testid="form-lifecycle-workspace">
                <section id={FORM_LIFECYCLE_ANCHORS.design} data-testid="form-region-design">
                    <h2 className="mb-2 text-sm font-semibold text-alloy-midnight">Form fields</h2>
                    <FormSchemaWorkspace
                        formId={formId}
                        formName={detail.name}
                        versions={detail.versions}
                        onVersionsUpdated={onVersionsUpdated}
                    />
                </section>

                <section className={opRegionSeparator} data-testid="form-region-runtime-orchestration">
                    <FormIntakeRuntimeOrchestrationPanel
                        formId={formId}
                        formKey={detail.key}
                        formName={detail.name}
                        formMetadata={detail.metadata}
                        links={links}
                        documentGenerationConfigured={documentGenerationConfigured}
                        hasPublished={hasPublished}
                        selectedLinkId={selectedRuntimeLinkId}
                        onSelectedLinkChange={onSelectedRuntimeLinkChange}
                        createdOnceEmbedUrl={openPublicEmbedUrl}
                        createdOnceLinkId={createdOnceLinkId}
                        onCopy={onCopy}
                        copied={copied}
                        canMutate={canMutate}
                        onFormMetadataUpdated={onFormMetadataUpdated}
                        onLinkMetadataSaved={onLinkMetadataSaved}
                        onCreateLink={onCreateLink}
                        creatingLink={creating}
                        onCreateLocationLink={onCreateLocationLink}
                        creatingLocationLink={creatingLocationLink}
                        locationLinkErr={locationLinkErr}
                        coverageRefreshKey={coverageRefreshKey}
                    />
                </section>

                <section id={FORM_LIFECYCLE_ANCHORS.review} className={opRegionSeparator} data-testid="form-region-review">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold text-alloy-midnight">Responses</h2>
                            <p className={clsx("mt-0.5", opMetadata)}>
                                {submissionCount > 0 ?
                                    `${submissionCount} response${submissionCount === 1 ? "" : "s"}`
                                :   "No responses yet"}
                            </p>
                        </div>
                        <FormsOperationalLink href={submissionsHref}>Open inbox</FormsOperationalLink>
                    </div>
                </section>

                <div className={opRegionSeparator}>
                    <TechnicalDetailDisclosure
                        title="Advanced settings"
                        helperText="Documents, packet usage, routing configuration, and technical details"
                    >
                        <div className="mt-3 space-y-4">
                            <FormLifecycleRail steps={lifecycleSteps} />

                            <TechnicalDetailDisclosure title="Publish history" helperText="Prior publishes and drafts">
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    {latestPublished ?
                                        <span className={opMetadata}>
                                            Last published
                                            {latestPublished.published_at ?
                                                <> · {formatDateTimeForUserDisplay(latestPublished.published_at, viewerTz)}</>
                                            :   null}
                                        </span>
                                    :   <span className={opMetadata}>Not published yet</span>}
                                </div>
                                <ul className={clsx(opGroupedSurface, "mt-2")}>
                                    {detail.versions.map((v) => (
                                        <li key={v.id} className={opGroupedRowInner}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="text-sm font-medium text-alloy-midnight">
                                                    {v.status === "published" ? "Published" : "Draft"}
                                                </span>
                                                <StatusBadge label={v.status} variant={getStatusVariant(v.status)} />
                                            </div>
                                            <p className={clsx("mt-0.5", opMetadata)}>
                                                {v.published_at ?
                                                    `Published ${formatDateTimeForUserDisplay(v.published_at, viewerTz)}`
                                                :   `Updated ${formatDateTimeForUserDisplay(v.updated_at ?? v.created_at, viewerTz)}`}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </TechnicalDetailDisclosure>

                            {showPacketPanel && hasPublished ?
                                <section data-testid="form-region-packet-context">
                                    <FormPacketContextPanel formId={formId} formName={detail.name} hasPublished={hasPublished} />
                                </section>
                            :   null}

                            {showExistingRecordSend && hasPublished ?
                                <section data-testid="form-region-existing-record-send">
                                    <FormExistingRecordSendPanel
                                        formId={formId}
                                        formName={detail.name}
                                        canMutate={canMutate}
                                    />
                                </section>
                            :   null}

                            <section data-testid="form-region-operational-outcome">
                                <FormOutcomeConfigPanel
                                    formId={formId}
                                    formMetadata={detail.metadata}
                                    links={links}
                                    formKey={detail.key}
                                    documentGenerationConfigured={documentGenerationConfigured}
                                    canMutate={canMutate}
                                    onLinkMetadataSaved={onLinkMetadataSaved}
                                    selectedLinkId={selectedRuntimeLinkId}
                                    onSelectedLinkChange={onSelectedRuntimeLinkChange}
                                    hideLinkSelector
                                />
                            </section>

                            <section id={FORM_LIFECYCLE_ANCHORS.distribute} data-testid="form-region-distribute-intake">
                                <div className="grid gap-3 lg:grid-cols-2">
                                    <div data-testid="form-region-intake">
                                        <FormIntakePreviewPanel formId={formId} viewerTz={viewerTz} compact />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                            Manage all share links
                                        </p>
                                        <FormDistributionPanel
                                            formKey={detail.key}
                                            canMutate={canMutate}
                                            creating={creating}
                                            createErr={createErr}
                                            links={links}
                                            createdOnce={createdOnce}
                                            copied={copied}
                                            copyWarn={copyWarn}
                                            viewerTz={viewerTz}
                                            onCreateLink={onCreateLink}
                                            onCopy={onCopy}
                                        />
                                    </div>
                                </div>
                            </section>

                            <section id={FORM_LIFECYCLE_ANCHORS.documents} data-testid="form-region-documents">
                                <IntakeWorkspaceRegion
                                    title="Documents & output"
                                    lead="PDF generation when mapping is configured on a published version."
                                >
                                    {documentGenerationConfigured ?
                                        <p className="text-sm text-alloy-midnight">
                                            PDF mapping is configured on the latest published version. Generate documents from
                                            reviewed submissions in the intake inbox.
                                        </p>
                                    :   <p className={opMetadata}>
                                            No PDF mapping on the published version yet. Configure mapping when publishing to enable
                                            document output.
                                        </p>}
                                </IntakeWorkspaceRegion>
                            </section>

                            <TechnicalDetailDisclosure
                                title="Operator context"
                                helperText="Purpose, audience, and connected systems"
                            >
                                <div className={clsx("space-y-4", opInsightSupport)}>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Purpose</p>
                                        <p className="mt-1">{operatorGuide.purpose}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                            Who completes
                                        </p>
                                        <p className="mt-1">{operatorGuide.whoCompletes}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                            After submission
                                        </p>
                                        <p className="mt-1">{operatorGuide.afterSubmission}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                            Connected systems
                                        </p>
                                        <ul className="mt-1 list-disc space-y-1 pl-5">
                                            {operatorGuide.connectedBullets.map((b) => (
                                                <li key={b.id}>{b.text}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </TechnicalDetailDisclosure>

                            <TechnicalDetailDisclosure
                                title={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.title}
                                helperText="Form definition id, internal key, and API metadata paths."
                            >
                                <TechnicalDetailFieldList>
                                    <TechnicalDetailField label="Form definition id" fullWidth>
                                        <TechnicalDetailMonospaceValue>{detail.id}</TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                    <TechnicalDetailField label="Internal key" fullWidth>
                                        <TechnicalDetailMonospaceValue>{detail.key}</TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                </TechnicalDetailFieldList>
                            </TechnicalDetailDisclosure>
                        </div>
                    </TechnicalDetailDisclosure>
                </div>
            </div>
        </>
    );
}
