"use client";

import { CommandSurfaceCardLink } from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceCardLink";
import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import { CONFIG_ASSIST_APPLY_PERMISSION_COPY } from "@/lib/adminV2/bos/bosGovernanceCopy";
import {
    CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY,
    CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL,
    CONFIG_LAYOUT_ASSIST_READY_TYPE_LABEL,
    CONFIG_LAYOUT_ASSIST_SETTINGS_HUB_COPY,
} from "@/lib/adminV2/bos/configLayoutAssistOperationalProposalPresentation";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";
import { configProposalReviewHrefForId } from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import type { ConfigLayoutAssistReadySummaryV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import { neutral } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export function ConfigLayoutAssistReadyCard({
    readySummary,
    persistedProposalId,
    busy,
    canApproveAndApply,
    onApproveAndApply,
}: {
    readySummary: ConfigLayoutAssistReadySummaryV1;
    persistedProposalId: string;
    busy: boolean;
    canApproveAndApply: boolean;
    onApproveAndApply: () => void;
}) {
    const reviewHref = configProposalReviewHrefForId(persistedProposalId);

    return (
        <div data-command-surface-config-assist-ready="true">
            <OperationalProposalCardFrame
                proposalTitle={`Add field: ${readySummary.field_name}`}
                proposalTypeLabel={CONFIG_LAYOUT_ASSIST_READY_TYPE_LABEL}
                capabilityKey="config_layout_assist"
                status="validated"
                presentationVariant="review_required"
                entityContextLabel={null}
                sourceLabel={CONFIG_LAYOUT_ASSIST_PROPOSAL_SOURCE_LABEL}
                summary="Your proposal is saved. Review the summary below, then apply when you are ready."
                requiresApproval
                mutationBoundaryCopy={CONFIG_LAYOUT_ASSIST_MUTATION_BOUNDARY_COPY}
                policyCopy={CONFIG_LAYOUT_ASSIST_SETTINGS_HUB_COPY}
                footer={
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {canApproveAndApply ?
                            <button
                                type="button"
                                disabled={busy}
                                className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                data-command-surface-config-assist-approve-apply="true"
                                onClick={() => onApproveAndApply()}
                            >
                                {busy ? "Working…" : "Approve & apply"}
                            </button>
                        :   <p className="text-[11px] text-alloy-midnight/55">{CONFIG_ASSIST_APPLY_PERMISSION_COPY}</p>
                        }
                        <CommandSurfaceCardLink
                            href={reviewHref}
                            className="inline-flex items-center justify-center rounded-md border border-alloy-stone/25 px-3 py-1.5 text-[11px] font-semibold text-alloy-midnight/85"
                            data-command-surface-config-assist-advanced-review="true"
                        >
                            View advanced review
                        </CommandSurfaceCardLink>
                    </div>
                }
                className={COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}
            >
                <dl className="space-y-2 text-[12px]">
                    <Row label="Field" value={readySummary.field_name} />
                    <Row label="Type" value={readySummary.field_type_label} />
                    <Row label="Required" value={readySummary.required_label} />
                    <Row label="Appears in" value={readySummary.section_label} />
                </dl>
            </OperationalProposalCardFrame>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2">
            <dt style={{ color: CMD.textLabel }}>{label}</dt>
            <dd className="font-medium" style={{ color: CMD.textBody }}>
                {value}
            </dd>
        </div>
    );
}
