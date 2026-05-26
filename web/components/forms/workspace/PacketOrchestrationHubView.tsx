"use client";

import clsx from "clsx";
import Link from "next/link";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { FormsOperationalLink } from "@/components/forms/workspace/FormsOperationalLink";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import {
    intakeWorkspaceBtnPrimary,
    intakeWorkspaceBtnSecondary,
} from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    packetOrchestrationStatusLabel,
    packetOrchestrationStatusTone,
    type PacketOrchestrationListRow,
} from "@/lib/forms/packets/packetOrchestrationPresentation";
import {
    opCaseFileCanvas,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opOrientationSurface,
    opStackPage,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    rows: PacketOrchestrationListRow[];
    loading?: boolean;
    error?: string | null;
    addFormId?: string;
    showCreate?: boolean;
    creating?: boolean;
    createName?: string;
    createDescription?: string;
    onToggleCreate?: () => void;
    onCreateNameChange?: (value: string) => void;
    onCreateDescriptionChange?: (value: string) => void;
    onCreatePacket?: () => void;
};

export function PacketOrchestrationHubView({
    rows,
    loading = false,
    error = null,
    addFormId = "",
    showCreate = false,
    creating = false,
    createName = "",
    createDescription = "",
    onToggleCreate,
    onCreateNameChange,
    onCreateDescriptionChange,
    onCreatePacket,
}: Props) {
    return (
        <div className={clsx(opCaseFileCanvas, opStackPage)} data-testid="packet-orchestration-hub">
            <div className={opOrientationSurface}>
                <p className={opMetadata}>
                    Build multi-step intake workflows — compose forms, launch packet links, review sessions when families
                    complete a run.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {onToggleCreate ?
                        <button type="button" className={intakeWorkspaceBtnPrimary} onClick={onToggleCreate}>
                            {showCreate ? "Close" : "Create packet"}
                        </button>
                    :   null}
                    <Link href={FORMS_MODULE_ROUTES.packetSessions} className={intakeWorkspaceBtnSecondary}>
                        Session inbox
                    </Link>
                    <FormsOperationalLink href={FORMS_MODULE_ROUTES.workspace}>Workspace</FormsOperationalLink>
                </div>
            </div>

            {showCreate && onCreateNameChange && onCreateDescriptionChange && onCreatePacket ?
                <div className="mt-4 rounded-lg bg-alloy-stone/20 px-4 py-4" data-testid="packet-create-panel">
                    {addFormId ?
                        <p className={clsx("mb-3", opMetadata)}>
                            After creation, open the builder to add your form as the first step.
                        </p>
                    :   null}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm sm:col-span-2">
                            <span className={opMutedMeta}>Packet name</span>
                            <input
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm"
                                value={createName}
                                onChange={(e) => onCreateNameChange(e.target.value)}
                                placeholder="e.g. New family onboarding"
                            />
                        </label>
                        <label className="space-y-1 text-sm sm:col-span-2">
                            <span className={opMutedMeta}>Description (optional)</span>
                            <input
                                className="w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm"
                                value={createDescription}
                                onChange={(e) => onCreateDescriptionChange(e.target.value)}
                            />
                        </label>
                    </div>
                    <div className="mt-3">
                        <button
                            type="button"
                            className={intakeWorkspaceBtnPrimary}
                            disabled={creating}
                            onClick={onCreatePacket}
                        >
                            {creating ? "Creating…" : "Create and open builder"}
                        </button>
                    </div>
                </div>
            :   null}

            {loading ?
                <p className={clsx("mt-4", opMetadata)}>Loading packet workflows…</p>
            : error ?
                <p className="mt-4 text-sm text-alloy-ember">{error}</p>
            :   <IntakeWorkspaceRegion
                    title="Your intake workflows"
                    lead={`${rows.length} packet definition${rows.length === 1 ? "" : "s"}`}
                    className="mt-5"
                    data-testid="packet-orchestration-list"
                >
                    {rows.length === 0 ?
                        <p className={opMetadata}>No packets yet. Create one to orchestrate multi-form intake.</p>
                    :   <ul className={opGroupedSurface}>
                            {rows.map((row) => {
                                const statusLabel = packetOrchestrationStatusLabel(row);
                                const statusTone = packetOrchestrationStatusTone(row);
                                return (
                                    <li key={row.id} className={opGroupedRowInner} data-testid={`packet-orchestration-row-${row.id}`}>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <Link
                                                    href={`${ADMIN_FORMS_UI_BASE}/packet-definitions/${row.id}`}
                                                    className="text-sm font-medium text-alloy-midnight hover:underline"
                                                >
                                                    {row.name}
                                                </Link>
                                                {row.description ?
                                                    <p className={clsx("mt-0.5 line-clamp-2", opMutedMeta)}>{row.description}</p>
                                                :   null}
                                                <p className={clsx("mt-1", opMutedMeta)}>
                                                    {row.step_count} step{row.step_count === 1 ? "" : "s"}
                                                    {" · "}
                                                    {row.session_count} session{row.session_count === 1 ? "" : "s"}
                                                </p>
                                            </div>
                                            <FormsReviewBadge label={statusLabel} tone={statusTone} />
                                        </div>
                                        <div className="mt-2.5 flex flex-wrap gap-3">
                                            <FormsOperationalLink
                                                href={`${ADMIN_FORMS_UI_BASE}/packet-definitions/${row.id}`}
                                            >
                                                Open builder
                                            </FormsOperationalLink>
                                            <FormsOperationalLink href={FORMS_MODULE_ROUTES.packetSessions}>
                                                Sessions
                                            </FormsOperationalLink>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    }
                </IntakeWorkspaceRegion>
            }
        </div>
    );
}
