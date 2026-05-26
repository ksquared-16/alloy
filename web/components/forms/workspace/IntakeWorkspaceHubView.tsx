"use client";

import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { TechnicalDetailDisclosure } from "@/components/forms/review";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { IntakeCommandCenterKpiStrip } from "@/components/forms/workspace/IntakeCommandCenterKpiStrip";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import {
    deriveIntakeCommandCenterSnapshot,
    type IntakeCommandCenterSessionRow,
} from "@/lib/forms/intakeCommandCenterPresentation";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { parseOperatorContext } from "@/lib/forms/operatorFormGuidance";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import {
    opBody,
    opCaseFileCanvas,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opOrientationSurface,
    opRegionSeparator,
    opStackGroup,
    opStackPage,
} from "@/lib/operational/ui/operationalVisualTokens";

export type IntakeWorkspaceFormRow = {
    id: string;
    name: string;
    description: string | null;
    metadata?: Record<string, unknown>;
    has_published_version?: boolean;
};

export type IntakeWorkspaceSessionRow = IntakeCommandCenterSessionRow;

export type IntakeWorkspacePacketRow = {
    id: string;
    name: string;
    is_active?: boolean;
};

export type IntakeWorkspaceSubmissionRow = SubmissionInboxRow;

export const intakeWorkspaceBtnPrimary =
    "rounded-lg bg-alloy-blue px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40";
export const intakeWorkspaceBtnSecondary =
    "rounded-lg border border-alloy-midnight/10 bg-white px-3.5 py-2 text-xs font-medium text-alloy-midnight/85 shadow-sm hover:bg-alloy-stone/20 disabled:opacity-40";

function purposeLine(metadata: Record<string, unknown> | undefined, description: string | null): string | null {
    const oc = parseOperatorContext(metadata);
    if (oc?.purpose?.trim()) return oc.purpose.trim();
    if (description?.trim()) return description.trim();
    return null;
}

type Props = {
    viewerTz: string;
    forms: IntakeWorkspaceFormRow[];
    sessions: IntakeWorkspaceSessionRow[];
    packets: IntakeWorkspacePacketRow[];
    submissions: IntakeWorkspaceSubmissionRow[];
    loading?: boolean;
    error?: string | null;
    canMutate?: boolean;
    showCreate?: boolean;
    onToggleCreate?: () => void;
    createPanel?: ReactNode;
};

export function IntakeWorkspaceHubView({
    viewerTz,
    forms,
    sessions,
    packets,
    submissions,
    loading = false,
    error = null,
    canMutate = false,
    showCreate = false,
    onToggleCreate,
    createPanel,
}: Props) {
    const formsById = Object.fromEntries(forms.map((f) => [f.id, f.name]));
    const publishedCount = forms.filter((f) => f.has_published_version).length;
    const commandCenter = deriveIntakeCommandCenterSnapshot({
        submissions,
        sessions,
        forms,
        formsById,
    });

    return (
        <FormsWorkspaceShell
            title="Intake workspace"
            subtitle="Command center for review, linkage, and intake distribution."
            actions={
                canMutate && onToggleCreate ?
                    <button type="button" className={intakeWorkspaceBtnPrimary} onClick={onToggleCreate}>
                        {showCreate ? "Close" : "Create form"}
                    </button>
                :   null
            }
            contentClassName="space-y-0"
        >
            {showCreate && createPanel ? <div className="mb-4">{createPanel}</div> : null}

            {loading ?
                <p className={opMetadata}>Loading intake workspace…</p>
            : error ?
                <p className="text-sm text-alloy-ember">{error}</p>
            :   <div data-testid="intake-workspace-command-center">
                    <div className={opOrientationSurface} data-testid="intake-command-orientation">
                        <p className="text-sm font-semibold text-alloy-midnight">{commandCenter.urgencyHeadline}</p>
                        <p className={clsx("mt-1", opMetadata)}>{commandCenter.healthyLine}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {commandCenter.primaryCta ?
                                <Link href={commandCenter.primaryCta.href} className={intakeWorkspaceBtnPrimary}>
                                    {commandCenter.primaryCta.label}
                                </Link>
                            :   null}
                            <Link href={FORMS_MODULE_ROUTES.packetSessions} className={intakeWorkspaceBtnSecondary}>
                                Session inbox
                            </Link>
                            <Link href={FORMS_MODULE_ROUTES.submissionsHub} className={intakeWorkspaceBtnSecondary}>
                                Submissions inbox
                            </Link>
                        </div>
                    </div>

                    <div className="mt-4">
                        <IntakeCommandCenterKpiStrip kpis={commandCenter.kpis} />
                    </div>

                    <div className={clsx(opCaseFileCanvas, "mt-5", opStackPage)} data-testid="intake-workspace-canvas">
                        <section data-testid="intake-action-queue">
                            <IntakeWorkspaceRegion
                                title="Action required"
                                lead="Review and linkage items prioritized by urgency."
                            >
                                {commandCenter.actionQueue.length === 0 ?
                                    <p className={opMetadata}>No urgent review or linkage flags — check waiting-on items below.</p>
                                :   <ul className={opGroupedSurface}>
                                        {commandCenter.actionQueue.map((item) => (
                                            <li
                                                key={item.id}
                                                className={clsx(
                                                    opGroupedRowInner,
                                                    "transition-colors hover:bg-alloy-stone/10",
                                                    item.tone === "urgent" && "bg-alloy-ember/[0.03]"
                                                )}
                                                data-testid={`intake-action-${item.id}`}
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold text-alloy-midnight">{item.title}</p>
                                                        <p className={clsx("mt-0.5", opBody)}>{item.summary}</p>
                                                    </div>
                                                    <Link href={item.href} className={intakeWorkspaceBtnPrimary}>
                                                        {item.ctaLabel}
                                                    </Link>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                }
                            </IntakeWorkspaceRegion>
                        </section>

                        <div className={clsx(opRegionSeparator, "grid gap-5 lg:grid-cols-2")}>
                            <IntakeWorkspaceRegion
                                title="Waiting on"
                                lead="Families, drafts, or publish work — not operator review yet."
                                data-testid="intake-lane-waiting"
                            >
                                {commandCenter.waitingOn.length === 0 ?
                                    <p className={opMetadata}>Nothing waiting on external parties right now.</p>
                                :   <ul className={opStackGroup}>
                                        {commandCenter.waitingOn.map((w) => (
                                            <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                                                <span className="text-alloy-midnight">{w.label}</span>
                                                <span className={clsx("font-semibold tabular-nums", opMetadata)}>{w.count}</span>
                                            </li>
                                        ))}
                                    </ul>
                                }
                            </IntakeWorkspaceRegion>

                            <IntakeWorkspaceRegion
                                title="Manage intake flows"
                                lead="Packets and published forms ready to distribute."
                                data-testid="intake-lane-manage"
                            >
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <p className={clsx("text-xs font-semibold uppercase tracking-wide opacity-60")}>
                                            Packets
                                        </p>
                                        {packets.length === 0 ?
                                            <p className={clsx("mt-2", opMetadata)}>No active packets.</p>
                                        :   <ul className={clsx(opStackGroup, "mt-2")}>
                                                {packets.slice(0, 4).map((p) => (
                                                    <li key={p.id}>
                                                        <Link
                                                            href={`${FORMS_MODULE_ROUTES.packetDefinitions}/${p.id}`}
                                                            className="font-medium text-alloy-midnight hover:underline"
                                                        >
                                                            {p.name}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        }
                                        <FormsOperationalLink
                                            href={FORMS_MODULE_ROUTES.packetDefinitions}
                                            className="mt-2 inline-block"
                                        >
                                            All packets
                                        </FormsOperationalLink>
                                    </div>
                                    <div>
                                        <p className={clsx("text-xs font-semibold uppercase tracking-wide opacity-60")}>
                                            Forms
                                        </p>
                                        <p className={clsx("mt-2", opMetadata)}>
                                            {forms.length} definition{forms.length === 1 ? "" : "s"} · {publishedCount}{" "}
                                            published
                                        </p>
                                        <FormsOperationalLink href={FORMS_MODULE_ROUTES.submissionsHub} className="mt-2 inline-block">
                                            Submissions inbox
                                        </FormsOperationalLink>
                                    </div>
                                </div>
                            </IntakeWorkspaceRegion>
                        </div>

                        <section className={opRegionSeparator} data-testid="intake-form-library">
                            <TechnicalDetailDisclosure
                                title="Form library"
                                helperText={`${forms.length} definitions — browse when configuring intake.`}
                            >
                                {forms.length === 0 ?
                                    <p className={opMetadata}>No forms in this organization yet.</p>
                                :   <ul className={clsx(opGroupedSurface, "mt-3")}>
                                        {forms.map((f) => {
                                            const purpose = purposeLine(f.metadata, f.description);
                                            return (
                                                <li key={f.id} className={opGroupedRowInner}>
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <Link
                                                                href={`${ADMIN_FORMS_UI_BASE}/${f.id}`}
                                                                className="text-sm font-medium text-alloy-midnight hover:underline"
                                                            >
                                                                {f.name}
                                                            </Link>
                                                            {purpose ?
                                                                <p className={clsx("mt-0.5 line-clamp-2", opMutedMeta)}>{purpose}</p>
                                                            :   null}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {f.has_published_version ?
                                                                <StatusBadge label="Published" variant="success" />
                                                            :   <StatusBadge label="Needs publish" variant={getStatusVariant("draft")} />}
                                                            <FormsOperationalLink href={`${ADMIN_FORMS_UI_BASE}/${f.id}`}>
                                                                Open
                                                            </FormsOperationalLink>
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                }
                            </TechnicalDetailDisclosure>
                        </section>

                        <div className={opRegionSeparator}>
                            <TechnicalDetailDisclosure
                                title={FORMS_TECHNICAL_DISCLOSURE.reviewDiagnostics.title}
                                helperText="Schema notes — collapsed by default."
                            >
                                <p className={opMetadata}>
                                    Publish a version before sharing links. Packet review uses the case-file console on each
                                    session. Prefill and launch context follow link metadata — see intake prefill doctrine.
                                </p>
                            </TechnicalDetailDisclosure>
                        </div>
                    </div>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
