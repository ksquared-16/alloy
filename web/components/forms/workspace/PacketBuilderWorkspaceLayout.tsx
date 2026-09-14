"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    TechnicalDetailDisclosure,
    TechnicalDetailField,
    TechnicalDetailFieldList,
    TechnicalDetailMonospaceValue,
} from "@/components/forms/review";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import {
    PacketDistributionLaunchPanel,
    type PacketCreatedLinkPayload,
    type PacketPublicLinkRow,
} from "@/components/forms/workspace/PacketDistributionLaunchPanel";
import {
    PacketStepCompositionEditor,
    type StepDraft,
    type StepExperienceCard as PacketStepExperienceRow,
} from "@/components/forms/workspace/PacketStepCompositionEditor";
import type { NewDocumentStep } from "@/components/forms/workspace/PacketAddStepChooser";
import {
    PacketExperienceOverview,
    type PacketExperienceVM,
} from "@/components/forms/workspace/PacketExperienceOverview";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import type { PacketStepFormOption } from "@/lib/admin/forms/packetDefinitionStepForms";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    packetOrchestrationStatusLabel,
    packetOrchestrationStatusTone,
    packetStepReadinessLabel,
} from "@/lib/forms/packets/packetOrchestrationPresentation";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";
import PrimaryButton from "@/components/PrimaryButton";
import {
    opCaseFileCanvas,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opOrientationSurface,
    opRegionSeparator,
    opStackPage,
} from "@/lib/operational/ui/operationalVisualTokens";

type SavedItem = {
    id: string;
    sequence_index: number;
    form_definition_id: string;
    metadata?: Record<string, unknown>;
    step_has_published_version?: boolean;
    form_definitions?: { name?: string } | { name?: string }[] | null;
};

type Props = {
    packetDefId: string;
    defName: string;
    defDesc: string;
    defActive: boolean;
    defKey: string;
    stepCount: number;
    sessionCount: number;
    allStepsPublished: boolean;
    savedItems: SavedItem[];
    steps: StepDraft[];
    forms: PacketStepFormOption[];
    recentPublishedForms: PacketStepFormOption[];
    links: PacketPublicLinkRow[];
    createdLink: PacketCreatedLinkPayload | null;
    busy: boolean;
    viewerTz: string;
    onDefNameChange: (v: string) => void;
    onDefDescChange: (v: string) => void;
    onDefActiveChange: (v: boolean) => void;
    onSaveMeta: () => void;
    onStepsChange: (updater: (rows: StepDraft[]) => StepDraft[]) => void;
    onAddStep: () => void;
    onAddDocumentStep: (step: NewDocumentStep) => Promise<void>;
    onSaveSteps: () => void;
    onMoveStep: (index: number, dir: -1 | 1) => void;
    onRemoveStep: (index: number) => void;
    onMintLink: () => void;
    /** Recipient control for the next launch — see PacketDistributionLaunchPanel. */
    launchTarget?: ReactNode;
    onToggleLink: (link: PacketPublicLinkRow, nextActive: boolean) => void;
    /**
     * When provided (Digital Mailroom context), packet sessions live in the Mailroom Work queue,
     * so the "Session inbox" / "Intake workspace" controls open Work instead of navigating to the
     * retired standalone Forms surface.
     */
    onOpenWorkQueue?: () => void;
    /** Open the configuration surface for one obligation. */
    onConfigureStep?: (index: number) => void;
    /** Derived obligation facts for this packet; null while loading. */
    experience?: (PacketExperienceVM & { steps: PacketStepExperienceRow[] }) | null;
};

/** Packet builder orchestration layout (OW-4). */
export function PacketBuilderWorkspaceLayout({
    packetDefId,
    defName,
    defDesc,
    defActive,
    defKey,
    stepCount,
    sessionCount,
    allStepsPublished,
    savedItems,
    steps,
    forms,
    recentPublishedForms,
    links,
    createdLink,
    busy,
    viewerTz,
    onDefNameChange,
    onDefDescChange,
    onDefActiveChange,
    onSaveMeta,
    onStepsChange,
    onAddStep,
    onAddDocumentStep,
    onSaveSteps,
    onMoveStep,
    onRemoveStep,
    onMintLink,
    launchTarget,
    onToggleLink,
    onOpenWorkQueue,
    experience,
    onConfigureStep,
}: Props) {
    const statusRow = {
        is_active: defActive,
        step_count: stepCount,
        all_steps_published: allStepsPublished,
    };

    return (
        <>
            <div className={opOrientationSurface} data-testid="packet-builder-overview">
                <div className="flex flex-wrap items-center gap-2">
                    <FormsReviewBadge
                        label={packetOrchestrationStatusLabel(statusRow)}
                        tone={packetOrchestrationStatusTone(statusRow)}
                    />
                    <span className={opMetadata}>
                        {stepCount} step{stepCount === 1 ? "" : "s"}
                    </span>
                </div>
                {defDesc ?
                    <p className={clsx("mt-2", opMetadata)}>{defDesc}</p>
                :   null}
            </div>

            <div className={clsx(opCaseFileCanvas, "mt-5", opStackPage)} data-testid="packet-builder-workspace">
                <IntakeWorkspaceRegion
                    title="Packet overview"
                    lead="Name, description, and whether this workflow accepts new intake."
                    data-testid="packet-region-overview"
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm sm:col-span-2">
                            <span className={opMutedMeta}>Name</span>
                            <input
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm"
                                value={defName}
                                disabled={busy}
                                onChange={(e) => onDefNameChange(e.target.value)}
                            />
                        </label>
                        <label className="flex items-center gap-2 pt-1 text-sm sm:col-span-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-alloy-forge/25 text-alloy-bend-pine accent-alloy-bend-pine focus:ring-alloy-bend-pine/30"
                                checked={defActive}
                                disabled={busy}
                                onChange={(e) => onDefActiveChange(e.target.checked)}
                            />
                            <span className={opMetadata}>Active — allow new packet runs</span>
                        </label>
                        <label className="space-y-1 text-sm sm:col-span-2">
                            <span className={opMutedMeta}>Description</span>
                            <input
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm"
                                value={defDesc}
                                disabled={busy}
                                onChange={(e) => onDefDescChange(e.target.value)}
                            />
                        </label>
                    </div>
                    <div className="mt-3">
                        {/*
                         * Pine, not the shared PrimaryButton.
                         *
                         * `PrimaryButton` is `bg-alloy-blue` and is used app-wide, so changing it is
                         * not this pass's business. Alloy's Configuration doctrine is that a primary
                         * action is Bend Pine, so this surface states that directly rather than
                         * inheriting a blue that contradicts it.
                         */}
                        <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-lg bg-alloy-bend-pine px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                            disabled={busy}
                            onClick={onSaveMeta}
                        >
                            Save overview
                        </button>
                    </div>
                </IntakeWorkspaceRegion>

                {/*
                 * "What families complete" replaced "Included forms".
                 *
                 * The old region answered a question about storage — which Form rows this packet
                 * contains — for a packet that contains one Form, one document to read and one
                 * document to send in. Calling all three "forms" was not shorthand, it was wrong,
                 * and it was the reason an administrator could not tell what a family would meet.
                 */}
                <PacketExperienceOverview vm={experience ?? null} />

                <section id="packet-steps" className={clsx(opRegionSeparator, "rounded-[14px] border border-alloy-stone/20 bg-white p-4")} data-testid="packet-region-steps">
                    {/*
                     * Confirm and reorder — not rebuild.
                     *
                     * Processing already determined which artifacts this packet contains and handed
                     * them over; asking an operator to author the list again would discard that. The
                     * ORDER stays editable because it is runtime-significant: the session advances
                     * through `current_sequence_index`, and review renders in the same order.
                     */}
                    <IntakeWorkspaceRegion
                        title="What families complete"
                        lead="Each obligation, in the order a family meets it. Change what is asked here; change how a question is worded, whether it is required, and where its answer is stored, inside the step itself."
                    >
                        <PacketStepCompositionEditor
                            steps={steps}
                            forms={forms}
                            recentPublishedForms={recentPublishedForms}
                            busy={busy}
                            savedStepCount={savedItems.length}
                            experience={experience?.steps}
                            onConfigureStep={onConfigureStep}
                            onStepsChange={onStepsChange}
                            onAddStep={onAddStep}
                            onAddDocumentStep={onAddDocumentStep}
                            onSaveSteps={onSaveSteps}
                            onMoveStep={onMoveStep}
                            onRemoveStep={onRemoveStep}
                        />
                    </IntakeWorkspaceRegion>
                </section>

                {/*
                 * SECONDARY, BECAUSE THIS PACKET IS USUALLY PROCESS-OWNED.
                 *
                 * The page said in words that a configured process launches participant work on its
                 * own, and then devoted its largest section to sending links by hand. Direct send is
                 * a real capability and keeps working — it is simply not what an administrator opens
                 * an Enrollment packet to do, so it no longer competes with the configuration.
                 */}
                <details className={clsx(opRegionSeparator, "rounded-[14px] border border-alloy-stone/20 bg-white p-4")} data-testid="packet-region-operational">
                    <summary className="cursor-pointer text-[12px] font-semibold text-alloy-midnight/70">
                        Direct distribution and session history
                    </summary>
                    <div className="mt-3" data-testid="packet-region-distribution">
                    {/*
                     * Named so it cannot be mistaken for Enrollment execution. `enrollment.start`
                     * already realizes the participant objective — it derives its own packet, mints
                     * its own link and creates the session. A link minted here is a DIRECT send,
                     * outside any configured process.
                     */}
                    <IntakeWorkspaceRegion
                        title="Send this packet directly"
                        lead="For sending this packet on its own. Configured processes such as Enrollment launch their participant work automatically — you do not need to send a link here for those."
                    >
                        <PacketDistributionLaunchPanel
                            packetName={defName}
                            busy={busy}
                            links={links}
                            createdLink={createdLink}
                            viewerTz={viewerTz}
                            onMintLink={onMintLink}
                            launchTarget={launchTarget}
                            onToggleLink={onToggleLink}
                        />
                    </IntakeWorkspaceRegion>
                    </div>

                    <div className="mt-4" data-testid="packet-region-sessions">
                    <IntakeWorkspaceRegion
                        title="Sessions & review"
                        lead="Families appear here after they submit a completed run of this packet, whether it was sent directly or launched by a process."
                    >
                        <p className={opMetadata}>
                            {sessionCount > 0 ?
                                `${sessionCount} session${sessionCount === 1 ? "" : "s"} recorded for this packet. Open the inbox to review case files and record decisions.`
                            :   "No sessions yet. Launch a packet link — completed runs will show in the session inbox."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                            {onOpenWorkQueue ? (
                                <button
                                    type="button"
                                    onClick={onOpenWorkQueue}
                                    className="text-sm font-semibold text-alloy-bend-pine hover:underline"
                                >
                                    Open session inbox
                                </button>
                            ) : (
                                <>
                                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetSessions}>Open session inbox</FormsOperationalLink>
                                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.workspace}>Intake workspace</FormsOperationalLink>
                                </>
                            )}
                        </div>
                    </IntakeWorkspaceRegion>
                    </div>
                </details>

                <div className={opRegionSeparator}>
                    <TechnicalDetailDisclosure
                        title={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.title}
                        helperText="Internal keys, link ids, and configuration identifiers."
                    >
                        <TechnicalDetailFieldList>
                            <TechnicalDetailField label="Packet definition id" fullWidth>
                                <TechnicalDetailMonospaceValue>{packetDefId}</TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                            <TechnicalDetailField label="Internal key" fullWidth>
                                <TechnicalDetailMonospaceValue>{defKey}</TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                            {links.map((L) => (
                                <TechnicalDetailField
                                    key={L.id}
                                    label={`Link ${L.is_active ? "(active)" : "(inactive)"}`}
                                    fullWidth
                                >
                                    <TechnicalDetailMonospaceValue>
                                        {L.token_prefix ? `prefix ${L.token_prefix} · ` : ""}
                                        {L.id}
                                    </TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                            ))}
                        </TechnicalDetailFieldList>
                    </TechnicalDetailDisclosure>
                </div>
            </div>
        </>
    );
}
