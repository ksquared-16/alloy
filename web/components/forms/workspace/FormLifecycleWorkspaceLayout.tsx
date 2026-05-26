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
import FormSchemaWorkspace from "@/app/admin/forms/FormSchemaWorkspace";
import {
    opCaseFileCanvas,
    opGroupedRowInner,
    opGroupedSurface,
    opInsightSupport,
    opMetadata,
    opOrientationSurface,
    opRegionSeparator,
    opStackPage,
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
    onCopy: (key: string, text: string) => void;
    onVersionsUpdated: () => void;
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
    onCopy,
    onVersionsUpdated,
}: Props) {
    const submissionsHref = `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formId)}/submissions`;

    return (
        <>
            <div className={opOrientationSurface} data-testid="form-lifecycle-orientation">
                <div className="flex flex-wrap items-center gap-2">
                    <FormsReviewBadge label={publishSummary} tone={publishTone} />
                    {detail.kind ?
                        <span className={opMetadata}>{detail.kind.replace(/_/g, " ")}</span>
                    :   null}
                    {!detail.is_active ?
                        <StatusBadge label="Inactive" variant="neutral" />
                    :   null}
                </div>
                {purposeLine ?
                    <p className={clsx("mt-2", opMetadata)}>{purposeLine}</p>
                :   null}
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={intakeWorkspaceBtnPrimary}
                        onClick={onPreview}
                        disabled={previewBusy || creating || !canMutate || !hasPublished}
                        data-testid="form-action-preview"
                    >
                        {previewBusy ? "Opening…" : "Preview form"}
                    </button>
                    <button
                        type="button"
                        className={intakeWorkspaceBtnSecondary}
                        onClick={onCreateLink}
                        disabled={creating || !canMutate || !hasPublished}
                        data-testid="form-action-create-link"
                    >
                        {creating ? "Creating…" : "Create public link"}
                    </button>
                    <Link href={`#${FORM_LIFECYCLE_ANCHORS.design}`} className={intakeWorkspaceBtnSecondary}>
                        New draft
                    </Link>
                    <Link href={submissionsHref} className={intakeWorkspaceBtnSecondary} data-testid="form-action-submissions">
                        View submissions{submissionCount > 0 ? ` (${submissionCount})` : ""}
                    </Link>
                </div>
                {!canMutate ?
                    <p className={clsx("mt-2", opMetadata)}>Admin role required for preview and link actions.</p>
                :   null}
                {!hasPublished ?
                    <p className={clsx("mt-2", opMetadata)}>Publish at least one version before preview or distribution.</p>
                :   null}
                {previewErr ?
                    <p className="mt-2 text-sm text-alloy-ember">{previewErr}</p>
                :   null}
            </div>

            <div className="mt-5">
                <FormLifecycleRail steps={lifecycleSteps} />
            </div>

            <div className={clsx(opCaseFileCanvas, "mt-5", opStackPage)} data-testid="form-lifecycle-workspace">
                <IntakeWorkspaceRegion
                    title="Build & design"
                    lead="Draft fields, save, and publish when intake is ready."
                    data-testid="form-region-design"
                >
                    <div id={FORM_LIFECYCLE_ANCHORS.design}>
                        <FormSchemaWorkspace
                            formId={formId}
                            formName={detail.name}
                            versions={detail.versions}
                            onVersionsUpdated={onVersionsUpdated}
                        />
                    </div>
                </IntakeWorkspaceRegion>

                <section id={FORM_LIFECYCLE_ANCHORS.publish} className={opRegionSeparator} data-testid="form-region-publish">
                    <IntakeWorkspaceRegion title="Publish" lead="Version history and live publish state.">
                        {latestPublished ?
                            <p className="text-sm text-alloy-midnight">
                                Latest published:{" "}
                                <span className="font-medium">v{latestPublished.version_number}</span>
                                {latestPublished.published_at ?
                                    <> · {formatDateTimeForUserDisplay(latestPublished.published_at, viewerTz)}</>
                                :   null}
                            </p>
                        :   <p className={opMetadata}>No published version yet.</p>}
                        {latestPublished ?
                            <p className={clsx("mt-2", opMetadata)}>
                                <FormsOperationalLink
                                    href={`${ADMIN_FORMS_UI_BASE}/packet-definitions?addForm=${encodeURIComponent(detail.id)}`}
                                >
                                    Start a packet with this form
                                </FormsOperationalLink>
                                {" · "}
                                <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetDefinitions}>
                                    Browse packets
                                </FormsOperationalLink>
                            </p>
                        :   null}
                        <ul className={clsx(opGroupedSurface, "mt-3")}>
                            {detail.versions.map((v) => (
                                <li key={v.id} className={opGroupedRowInner}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-alloy-midnight">
                                            Version {v.version_number}
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
                    </IntakeWorkspaceRegion>
                </section>

                <section id={FORM_LIFECYCLE_ANCHORS.distribute} className={opRegionSeparator} data-testid="form-region-distribute">
                    <IntakeWorkspaceRegion title="Distribution" lead="Where this form is shared for intake.">
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
                    </IntakeWorkspaceRegion>
                </section>

                <section id={FORM_LIFECYCLE_ANCHORS.intake} className={opRegionSeparator} data-testid="form-region-intake">
                    <IntakeWorkspaceRegion title="Intake activity" lead="Recent responses for this form.">
                        <FormIntakePreviewPanel formId={formId} viewerTz={viewerTz} />
                    </IntakeWorkspaceRegion>
                </section>

                <section id={FORM_LIFECYCLE_ANCHORS.review} className={opRegionSeparator} data-testid="form-region-review">
                    <IntakeWorkspaceRegion title="Review & submissions" lead="Open case-file review for submitted responses.">
                        <p className={opMetadata}>
                            {submissionCount > 0 ?
                                `${submissionCount} response${submissionCount === 1 ? "" : "s"} in intake.`
                            :   "No responses yet."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                            <FormsOperationalLink href={submissionsHref}>Open intake inbox</FormsOperationalLink>
                            {latestPublished ?
                                <FormsOperationalLink
                                    href={`${ADMIN_FORMS_UI_BASE}/packet-definitions?addForm=${encodeURIComponent(detail.id)}`}
                                >
                                    Use in a packet
                                </FormsOperationalLink>
                            :   null}
                        </div>
                    </IntakeWorkspaceRegion>
                </section>

                <section id={FORM_LIFECYCLE_ANCHORS.documents} className={opRegionSeparator} data-testid="form-region-documents">
                    <IntakeWorkspaceRegion
                        title="Documents & output"
                        lead="PDF generation when mapping is configured on a published version."
                    >
                        {documentGenerationConfigured ?
                            <p className="text-sm text-alloy-midnight">
                                PDF mapping is configured on the latest published version. Generate documents from reviewed
                                submissions in the intake inbox.
                            </p>
                        :   <p className={opMetadata}>
                                No PDF mapping on the published version yet. Configure mapping when publishing to enable
                                document output.
                            </p>}
                    </IntakeWorkspaceRegion>
                </section>

                <div className={opRegionSeparator}>
                    <TechnicalDetailDisclosure
                        title="Operator context"
                        helperText="Purpose, audience, and connected systems — collapsed by default."
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

                    <div className="mt-4">
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
                </div>
            </div>
        </>
    );
}
