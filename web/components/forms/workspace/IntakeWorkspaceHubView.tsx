"use client";

import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { TechnicalDetailDisclosure } from "@/components/forms/review";
import { FormsOperationalLink, FormsWorkspaceShell } from "@/components/forms/workspace";
import { IntakeWorkspaceRegion } from "@/components/forms/workspace/IntakeWorkspaceRegion";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import { parseOperatorContext } from "@/lib/forms/operatorFormGuidance";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";
import { submissionListLinkageBadge } from "@/lib/forms/submissionLinkageReviewUx";
import type { AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import {
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

export type IntakeWorkspaceSessionRow = {
    id: string;
    status: string;
    created_at: string;
    packet_name: string;
};

export type IntakeWorkspacePacketRow = {
    id: string;
    name: string;
    /** Present on packet-definitions API rows; hub strips inactive packets from pickers. */
    is_active?: boolean;
};

export type IntakeWorkspaceSubmissionRow = {
    id: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
    form_definition_id: string;
    person_id?: string | null;
    customer_id?: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    payload?: { meta?: Record<string, unknown> };
};

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
    viewerTz: AdminViewerTimezoneValue;
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
    const reviewSessions = sessions.slice(0, 5);
    const activePackets = packets.slice(0, 5);

    return (
        <FormsWorkspaceShell
            title="Intake workspace"
            subtitle="Review intake, manage forms and packets, distribute capture links."
            actions={
                canMutate && onToggleCreate ?
                    <button type="button" className={intakeWorkspaceBtnPrimary} onClick={onToggleCreate}>
                        {showCreate ? "Close" : "Create form"}
                    </button>
                :   null
            }
            contentClassName="space-y-0"
        >
            <div className={opOrientationSurface}>
                <div className="flex flex-wrap gap-2">
                    <Link href={FORMS_MODULE_ROUTES.packetSessions} className={intakeWorkspaceBtnPrimary}>
                        Review sessions
                    </Link>
                    <Link href={FORMS_MODULE_ROUTES.submissionsHub} className={intakeWorkspaceBtnSecondary}>
                        View submissions
                    </Link>
                    <Link href={FORMS_MODULE_ROUTES.packetDefinitions} className={intakeWorkspaceBtnSecondary}>
                        Manage packets
                    </Link>
                </div>
            </div>

            {showCreate && createPanel ? <div className="mt-4">{createPanel}</div> : null}

            {loading ?
                <p className={clsx(opRegionSeparator, opMetadata)}>Loading intake workspace…</p>
            : error ?
                <p className={clsx(opRegionSeparator, "text-sm text-alloy-ember")}>{error}</p>
            :   <div className={clsx(opCaseFileCanvas, "mt-5", opStackPage)} data-testid="intake-workspace-canvas">
                    <div className="grid gap-5 lg:grid-cols-2">
                        <IntakeWorkspaceRegion
                            title="Review sessions"
                            lead="Open packet runs for case-file review and decisions."
                            viewAllHref={FORMS_MODULE_ROUTES.packetSessions}
                            viewAllLabel="Session inbox"
                            data-testid="intake-lane-sessions"
                        >
                            {reviewSessions.length === 0 ?
                                <p className={opMetadata}>No packet sessions yet. Launch a packet link to start intake.</p>
                            :   <ul className={opGroupedSurface}>
                                    {reviewSessions.map((s) => (
                                        <li key={s.id}>
                                            <Link
                                                href={`${FORMS_MODULE_ROUTES.packetSessions}/${s.id}`}
                                                className="block px-4 py-3 transition-colors hover:bg-alloy-stone/15"
                                            >
                                                <span className="text-sm font-medium text-alloy-midnight">
                                                    {s.packet_name}
                                                </span>
                                                <span className={clsx("mt-0.5 block", opMutedMeta)}>
                                                    {s.status}
                                                    {" · "}
                                                    {formatDateTimeForUserDisplay(s.created_at, viewerTz)}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            }
                        </IntakeWorkspaceRegion>

                        <IntakeWorkspaceRegion
                            title="Recent submissions"
                            lead="Latest intake across your forms."
                            viewAllHref={FORMS_MODULE_ROUTES.submissionsHub}
                            viewAllLabel="All submissions"
                            data-testid="intake-lane-submissions"
                        >
                            {submissions.length === 0 ?
                                <p className={opMetadata}>No submissions waiting right now.</p>
                            :   <ul className={opGroupedSurface}>
                                    {submissions.slice(0, 6).map((row) => {
                                        const linkage = submissionListLinkageBadge({
                                            status: row.status,
                                            payloadMeta: row.payload?.meta,
                                            attachRow: {
                                                person_id: row.person_id ?? null,
                                                customer_id: row.customer_id ?? null,
                                                customer_member_id: row.customer_member_id ?? null,
                                                opportunity_id: row.opportunity_id ?? null,
                                            },
                                        });
                                        const linkageBadge =
                                            linkage.kind === "none" ? null
                                            : linkage.kind === "needs_review" ?
                                                { label: "Needs review", variant: "warning" as const }
                                            :   { label: "Link CRM", variant: "neutral" as const };
                                        return (
                                            <li key={row.id} className={opGroupedRowInner}>
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <Link
                                                            href={`${ADMIN_FORMS_UI_BASE}/${row.form_definition_id}/submissions/${row.id}`}
                                                            className="text-sm font-medium text-alloy-midnight hover:underline"
                                                        >
                                                            {formsById[row.form_definition_id] ?? "Form"}
                                                        </Link>
                                                        <p className={clsx("mt-0.5", opMutedMeta)}>
                                                            {row.submitted_at ?
                                                                formatDateTimeForUserDisplay(row.submitted_at, viewerTz)
                                                            :   formatDateTimeForUserDisplay(row.created_at, viewerTz)}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <StatusBadge
                                                            label={row.status}
                                                            variant={getStatusVariant(row.status)}
                                                        />
                                                        {linkageBadge ?
                                                            <StatusBadge
                                                                label={linkageBadge.label}
                                                                variant={linkageBadge.variant}
                                                            />
                                                        :   null}
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            }
                        </IntakeWorkspaceRegion>
                    </div>

                    <div className={clsx(opRegionSeparator, "grid gap-5 lg:grid-cols-2")}>
                        <IntakeWorkspaceRegion
                            title="Packet definitions"
                            lead="Multi-step intake pipelines."
                            viewAllHref={FORMS_MODULE_ROUTES.packetDefinitions}
                            viewAllLabel="All packets"
                            data-testid="intake-lane-packets"
                        >
                            {activePackets.length === 0 ?
                                <p className={opMetadata}>No packets configured. Create one to orchestrate multi-form intake.</p>
                            :   <ul className={opGroupedSurface}>
                                    {activePackets.map((p) => (
                                        <li key={p.id}>
                                            <Link
                                                href={`${FORMS_MODULE_ROUTES.packetDefinitions}/${p.id}`}
                                                className="flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-alloy-stone/15"
                                            >
                                                <span className="text-sm font-medium text-alloy-midnight">{p.name}</span>
                                                <span className={opMutedMeta}>Active</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            }
                        </IntakeWorkspaceRegion>

                        <IntakeWorkspaceRegion
                            title="Active forms"
                            lead={`${forms.length} definition${forms.length === 1 ? "" : "s"} · ${publishedCount} published`}
                            data-testid="intake-lane-forms-summary"
                        >
                            {forms.length === 0 ?
                                <p className={opMetadata}>Create a form to start collecting intake.</p>
                            :   <ul className={clsx(opStackGroup, "text-sm")}>
                                    {forms.slice(0, 4).map((f) => (
                                        <li key={f.id}>
                                            <Link
                                                href={`${ADMIN_FORMS_UI_BASE}/${f.id}`}
                                                className="font-medium text-alloy-midnight hover:underline"
                                            >
                                                {f.name}
                                            </Link>
                                            {f.has_published_version ?
                                                <span className={clsx("ml-2", opMutedMeta)}>Published</span>
                                            :   <span className={clsx("ml-2", opMutedMeta)}>Needs publish</span>}
                                        </li>
                                    ))}
                                </ul>
                            }
                        </IntakeWorkspaceRegion>
                    </div>

                    <section className={opRegionSeparator} data-testid="intake-form-library">
                        <div>
                            <h2 className="text-sm font-semibold text-alloy-midnight">Form library</h2>
                            <p className={opMetadata}>Definitions for standalone and packet intake.</p>
                        </div>
                        {forms.length === 0 ?
                            <p className={clsx("mt-3", opMetadata)}>No forms in this organization yet.</p>
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
                                                    :   <span className={opMetadata}>Draft</span>}
                                                    <FormsOperationalLink href={`${ADMIN_FORMS_UI_BASE}/${f.id}`}>
                                                        Open
                                                    </FormsOperationalLink>
                                                    <FormsOperationalLink
                                                        href={`${ADMIN_FORMS_UI_BASE}/${f.id}/submissions`}
                                                    >
                                                        Inbox
                                                    </FormsOperationalLink>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        }
                    </section>

                    <div className={opRegionSeparator}>
                        <TechnicalDetailDisclosure
                            title="Getting started"
                            helperText="Schema notes — collapsed by default."
                        >
                            <p className={opMetadata}>
                                Publish a version before sharing links. Packet review uses the case-file console on each
                                session.
                            </p>
                        </TechnicalDetailDisclosure>
                    </div>
                </div>
            }
        </FormsWorkspaceShell>
    );
}
