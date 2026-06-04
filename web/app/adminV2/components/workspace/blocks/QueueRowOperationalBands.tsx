"use client";

import type { ReactNode } from "react";
import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";
import type {
    QueueRowPlacementPriorityV2Vm,
    QueueRowPlacementPriorityVm,
    QueueRowPlacementWaitlistCandidateVm,
} from "@/lib/ui-v2/workspace-types";
import { QUEUE_PREVIEW_BOUNDARY_LABEL } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import type { AttentionExpandedDetail } from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";
import { buildAttentionExpandedDetail } from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";
import type {
    WorkUnitQueueRowLifecycleKey,
    WorkUnitQueueRowLifecycleSection,
    WorkUnitQueueRowPresentationPlan,
} from "@/lib/ui-v2/workUnitQueueRowPresentation";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";
import { QueueRowPlacementPriorityV2Panel } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityV2Panel";
import {
    QueueRowPlacementCandidateContext,
    QueueRowPlacementCandidateMetaChips,
} from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementCandidatePanel";
import { QueueRowPlacementManualOrderControls } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementManualOrderControls";
import type { QueueItemVm } from "@/lib/ui-v2/workspace-types";

function queueUrgencyChipClass(band: string | null | undefined): string {
    if (band === "p0_urgent") return "border-alloy-ember/30 bg-alloy-ember/10 text-alloy-ember";
    if (band === "p1_today") return "border-alloy-blue/30 bg-alloy-blue/10 text-alloy-blue";
    return "border-admin-border bg-alloy-stone/30 text-alloy-midnight/70";
}

function queueTypeCueChipClass(): string {
    return "border-alloy-stone/22 bg-alloy-stone/12 text-alloy-midnight/62";
}

function queueStaleCueChipClass(): string {
    return "border-alloy-stone/28 bg-alloy-stone/10 text-alloy-midnight/58";
}

/** L0 operational read — urgency, do-next, why-now; dedicated attention band slot. */
export function QueueRowOperationalReadPreview({
    preview,
    layout = "scan",
}: {
    preview: NonNullable<CrmCompactRowSemanticSlots["operationalReadPreview"]>;
    layout?: "scan" | "full";
}) {
    const scan = layout === "scan";
    const hasMetaChips = Boolean(preview.urgencyChipLabel || preview.typeCue || preview.staleCue);

    return (
        <div
            className={`adminv2-ws-crm-queue-preview__operational-read adminv2-ws-crm-queue-preview__operational-read--${layout}`}
            data-queue-preview-slot="operational_read"
            data-queue-operational-read-layout={layout}
            title="Preview — open the record for full operational read."
        >
            {hasMetaChips ? (
                <div className="adminv2-ws-crm-queue-preview__operational-read-meta">
                    {preview.urgencyChipLabel ? (
                        <span
                            className={`adminv2-ws-crm-queue-preview__urgency-chip inline-flex shrink-0 items-center rounded-md border px-1 py-0.5 text-[9px] font-medium leading-tight ${queueUrgencyChipClass(preview.urgencyBand)}`}
                            data-testid="queue-operational-read-urgency-chip"
                            title={preview.priorityExplanation?.ariaLabel ?? preview.urgencyChipLabel}
                            aria-label={preview.priorityExplanation?.ariaLabel ?? preview.urgencyChipLabel}
                        >
                            {preview.urgencyChipLabel}
                        </span>
                    ) : null}
                    {preview.typeCue ? (
                        <span
                            className={`adminv2-ws-crm-queue-preview__type-cue inline-flex shrink-0 items-center rounded-md border px-1 py-0.5 text-[9px] font-medium leading-tight ${queueTypeCueChipClass()}`}
                            data-testid="queue-operational-read-type-cue"
                        >
                            {preview.typeCue}
                        </span>
                    ) : null}
                    {preview.staleCue ? (
                        <span
                            className={`adminv2-ws-crm-queue-preview__stale-cue inline-flex shrink-0 items-center rounded-md border px-1 py-0.5 text-[9px] font-medium leading-tight ${queueStaleCueChipClass()}`}
                            data-testid="queue-operational-read-stale-cue"
                        >
                            {preview.staleCue}
                        </span>
                    ) : null}
                </div>
            ) : null}
            <div className="adminv2-ws-crm-queue-preview__operational-read-lines min-w-0 w-full">
                <div className="adminv2-ws-crm-queue-preview__operational-read-primary">
                    {!scan ? (
                        <span className="adminv2-ws-crm-queue-preview__operational-read-label">Operational read:</span>
                    ) : null}
                    <span className="adminv2-ws-crm-queue-preview__operational-read-text">{preview.operationalRead}</span>
                </div>
                {preview.whyNow?.trim() ? (
                    <div
                        className="adminv2-ws-crm-queue-preview__operational-read-why"
                        data-queue-preview-slot="operational_read_why"
                    >
                        {preview.whyNow.trim()}
                    </div>
                ) : null}
            </div>
            <span className="adminv2-ws-crm-queue-preview__operational-read-boundary">
                {preview.previewBoundary ?? QUEUE_PREVIEW_BOUNDARY_LABEL}
            </span>
        </div>
    );
}

function HeaderInlineSep() {
    return (
        <span className="adminv2-ws-queue-operational-record__header-sep" aria-hidden="true">
            |
        </span>
    );
}

/** V3.5 — header grid: household | attention column (2 rows) | location */
export function QueueRowCompactOperationalHeader({
    slots,
    plan,
    statusDisplay,
    urgencyTier = "standard",
    operationalAttentionBadge = false,
}: {
    slots: CrmCompactRowSemanticSlots;
    plan: WorkUnitQueueRowPresentationPlan;
    statusDisplay: string | null;
    urgencyTier?: QueueItemVm["urgencyTier"];
    operationalAttentionBadge?: boolean;
}) {
    const statusLabel = statusDisplay?.trim() || null;
    const enrollmentInline = plan.headerInline.enrollmentAttention;
    const waitlistInline = plan.headerInline.waitlist;
    const enrollmentSubline = plan.headerInline.enrollmentSubline?.trim() || null;
    const waitlistSubline =
        plan.lifecycle === "waitlist" && !enrollmentSubline
            ? waitlistInline?.reasonShort?.trim() || null
            : null;
    const headerSubline = enrollmentSubline || waitlistSubline;
    const attentionPrimaryVisible = Boolean(
        statusLabel || enrollmentInline?.inline || waitlistInline?.rankingChip
    );

    return (
        <div
            className="adminv2-ws-queue-operational-record__header-zone"
            data-queue-row-band="header"
            data-queue-header-layout="attention-column"
            data-queue-header-container="true"
            data-queue-zone="summary"
        >
            <div className="adminv2-ws-queue-operational-record__header-grid">
                <span
                    className="adminv2-ws-queue-operational-record__household"
                    title={slots.primaryIdentity}
                    data-testid="queue-header-household"
                    data-queue-preview-slot="header_household"
                >
                    {slots.primaryIdentity}
                </span>

                <div
                    className="adminv2-ws-queue-operational-record__header-attention-column"
                    data-queue-preview-slot="header_attention_column"
                    data-testid="queue-header-attention-column"
                >
                    {attentionPrimaryVisible ? (
                        <div
                            className="adminv2-ws-queue-operational-record__header-attention-primary"
                            data-queue-header-row="primary"
                        >
                            {statusLabel ? (
                                <>
                                    <span
                                        className={`adminv2-ws-crm-queue-preview__status-pill adminv2-ws-crm-queue-preview__status-pill--header-inline adminv2-ws-crm-queue-preview__status-pill--secondary adminv2-ws-crm-queue-preview__status-pill--urgency-${urgencyTier}${
                                            operationalAttentionBadge
                                                ? " adminv2-ws-crm-queue-preview__status-pill--operational-attention"
                                                : ""
                                        }`}
                                        data-queue-preview-slot="header_status"
                                        data-testid="queue-header-status"
                                    >
                                        {statusLabel}
                                    </span>
                                </>
                            ) : null}
                            {enrollmentInline?.inline ? (
                                <>
                                    {statusLabel ? <HeaderInlineSep /> : null}
                                    <span
                                        className={`adminv2-ws-queue-operational-record__header-attention${
                                            enrollmentInline.urgencyLabel
                                                ? " adminv2-ws-queue-operational-record__header-attention--urgent"
                                                : ""
                                        }`}
                                        data-queue-preview-slot="header_attention_inline"
                                        data-testid="queue-header-attention-inline"
                                        title={enrollmentInline.fullText ?? enrollmentInline.inline}
                                    >
                                        {enrollmentInline.inline}
                                    </span>
                                </>
                            ) : null}
                            {waitlistInline?.rankingChip ? (
                                <>
                                    {statusLabel || enrollmentInline?.inline ? <HeaderInlineSep /> : null}
                                    <span
                                        className="adminv2-ws-queue-operational-record__header-ranking-chip"
                                        data-queue-preview-slot="header_waitlist_ranking"
                                        data-testid="queue-header-waitlist-ranking"
                                        title={waitlistInline.fullRankingTitle ?? waitlistInline.rankingChip}
                                    >
                                        {waitlistInline.rankingChip}
                                    </span>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                    {headerSubline ? (
                        <div
                            className={`adminv2-ws-queue-operational-record__header-subline adminv2-ws-queue-operational-record__header-subline--connected adminv2-ws-queue-operational-record__header-subline--in-attention${
                                enrollmentSubline
                                    ? " adminv2-ws-queue-operational-record__header-subline--enrollment"
                                    : " adminv2-ws-queue-operational-record__header-subline--waitlist"
                            }`}
                            data-queue-header-row="secondary"
                            data-queue-header-subline-readable="true"
                            data-queue-preview-slot={
                                enrollmentSubline ? "header_enrollment_subline" : "header_waitlist_reason"
                            }
                            data-testid={
                                enrollmentSubline ? "queue-header-enrollment-subline" : "queue-header-waitlist-reason"
                            }
                            title={headerSubline}
                        >
                            {headerSubline}
                        </div>
                    ) : null}
                </div>

                {slots.locationContext?.trim() ? (
                    <span
                        className="adminv2-ws-queue-operational-record__location"
                        data-queue-preview-slot="location"
                    >
                        {slots.locationContext.trim()}
                    </span>
                ) : (
                    <span className="adminv2-ws-queue-operational-record__location adminv2-ws-queue-operational-record__location--empty" aria-hidden="true" />
                )}
            </div>
        </div>
    );
}

/** Supplemental attention detail — never repeats header inline headline. */
export function QueueRowAttentionSupplementBand({
    detail,
    lifecycle,
}: {
    detail: AttentionExpandedDetail;
    lifecycle: WorkUnitQueueRowLifecycleKey;
}) {
    if (!detail.hasContent) return null;

    return (
        <div
            className="adminv2-ws-queue-operational-record__attention-supplement"
            data-queue-row-band="attention"
            data-queue-lifecycle={lifecycle}
            data-queue-attention-expanded="true"
            data-queue-attention-supplement="true"
        >
            {detail.reasonDetail ? (
                <div
                    className="adminv2-ws-queue-operational-record__attention-supplement-line"
                    data-queue-preview-slot="operational_read_why"
                >
                    {detail.reasonDetail}
                </div>
            ) : null}
            {detail.nextStepLine ? (
                <div
                    className="adminv2-ws-queue-operational-record__attention-supplement-line"
                    data-queue-preview-slot="next_step"
                    data-testid="queue-attention-next-step"
                >
                    {detail.nextStepLine}
                </div>
            ) : null}
            {detail.hintLine ? (
                <div className="adminv2-ws-queue-operational-record__attention-supplement-line adminv2-ws-queue-operational-record__attention-supplement-line--hint">
                    {detail.hintLine}
                </div>
            ) : null}
            {detail.operationalSummary ? (
                <div
                    className="adminv2-ws-queue-operational-record__attention-supplement-line"
                    data-queue-preview-slot="operational_summary"
                >
                    {detail.operationalSummary}
                </div>
            ) : null}
            {detail.childLifecycleSummary ? (
                <div
                    className="adminv2-ws-queue-operational-record__attention-supplement-line"
                    data-child-lifecycle-summary="true"
                >
                    {detail.childLifecycleSummary}
                </div>
            ) : null}
        </div>
    );
}

/** @deprecated Use QueueRowAttentionSupplementBand — expanded band is supplemental only. */
export function QueueRowAttentionBand({
    slots,
    lifecycle,
}: {
    slots: CrmCompactRowSemanticSlots;
    lifecycle: WorkUnitQueueRowLifecycleKey;
    section?: unknown;
}) {
    const detail = buildAttentionExpandedDetail(slots, null);
    return <QueueRowAttentionSupplementBand detail={detail} lifecycle={lifecycle} />;
}

/** Lifecycle-specific operational context — waitlist placement, ranking, enrollment hints. */
export function QueueRowLifecycleOperationalBand({
    slots,
    section,
    lifecycle,
    waitlistPlacementPreview,
    waitlistPlacementV2,
    waitlistCandidateRow,
    waitlistStatusLabel,
}: {
    slots: CrmCompactRowSemanticSlots;
    section: WorkUnitQueueRowLifecycleSection;
    lifecycle: WorkUnitQueueRowLifecycleKey;
    waitlistPlacementPreview?: QueueRowPlacementPriorityVm;
    waitlistPlacementV2?: QueueRowPlacementPriorityV2Vm;
    waitlistCandidateRow?: QueueRowPlacementWaitlistCandidateVm;
    waitlistStatusLabel?: string;
}) {
    if (!section.waitlistPlacement && !section.waitlistCandidate && !section.waitlistHouseholdContext) {
        return null;
    }

    return (
        <div
            className="adminv2-ws-queue-operational-record__lifecycle-band"
            data-queue-row-band="lifecycle"
            data-queue-lifecycle={lifecycle}
        >
            {section.waitlistPlacement && waitlistPlacementV2 ? (
                <QueueRowPlacementPriorityV2Panel
                    preview={waitlistPlacementV2}
                    layout="default"
                    statusLabel={waitlistStatusLabel}
                />
            ) : section.waitlistPlacement && waitlistPlacementPreview ? (
                <QueueRowPlacementPriorityStrip preview={waitlistPlacementPreview} layout="default" />
            ) : null}
            {section.waitlistCandidate && waitlistCandidateRow ? (
                <>
                    <QueueRowPlacementManualOrderControls row={waitlistCandidateRow} layout="inline" />
                    <QueueRowPlacementCandidateContext row={waitlistCandidateRow} />
                    <QueueRowPlacementCandidateMetaChips row={waitlistCandidateRow} siteLabel={slots.locationContext} />
                </>
            ) : null}
            {section.waitlistHouseholdContext ? (
                <span
                    className="adminv2-ws-crm-queue-preview__household-context text-[11px] text-alloy-midnight/65"
                    data-queue-preview-slot="waitlist_household"
                >
                    {slots.waitlistHouseholdContext!.trim()}
                </span>
            ) : null}
        </div>
    );
}

export type CrmCompactDrawerRecordIconHandlers = {
    onOpenPerson: (personId: string) => void;
    onOpenChild: (personId: string) => void;
    onPrefetchPerson: (personId: string) => void;
    onPrefetchChild: (personId: string) => void;
};

/** Compact parent contact — secondary to child rows; icon left of name. */
export function QueueRowCompactParentContact({
    slots,
    handlers,
    renderIcon,
}: {
    slots: CrmCompactRowSemanticSlots;
    handlers: CrmCompactDrawerRecordIconHandlers;
    renderIcon: (
        personId: string,
        name: string,
        kind: "person" | "child",
        handlers: CrmCompactDrawerRecordIconHandlers
    ) => ReactNode;
}) {
    const name = slots.contactDisplayName?.trim() || "";
    const phone = slots.contactPhoneDisplay?.trim() || "";
    const email = slots.contactEmail?.trim() || "";
    const personId = slots.contactPersonId?.trim() || "";
    if (!name && !phone && !email) return null;

    return (
        <div className="adminv2-ws-queue-operational-record__parent-block" data-queue-people-role="parent">
            <div className="adminv2-ws-queue-operational-record__parent-primary">
                {personId && name ? renderIcon(personId, name, "person", handlers) : null}
                <div className="adminv2-ws-queue-operational-record__parent-identity adminv2-ws-queue-operational-record__parent-identity--inline">
                    <span className="adminv2-ws-queue-operational-record__parent-name">{name || "—"}</span>
                    {phone ? (
                        <>
                            <span className="adminv2-ws-queue-operational-record__parent-sep" aria-hidden="true">
                                ·
                            </span>
                            <span className="adminv2-ws-queue-operational-record__parent-meta">{phone}</span>
                        </>
                    ) : null}
                    {email ? (
                        <>
                            <span className="adminv2-ws-queue-operational-record__parent-sep" aria-hidden="true">
                                ·
                            </span>
                            <span
                                className="adminv2-ws-queue-operational-record__parent-meta"
                                data-testid="queue-parent-contact-meta"
                            >
                                {email}
                            </span>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
